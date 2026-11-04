"""Lectura de correos con el Excel de trabajos programados (Gmail por IMAP).

Autenticación: usuario Gmail + contraseña de aplicación (requiere verificación en
2 pasos). Se buscan correos con la sintaxis de Gmail (X-GM-RAW) y se filtran por
asunto/remitente; los ya procesados se omiten por Message-ID.
"""
from __future__ import annotations

import email
import imaplib
import re
import unicodedata
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parsedate_to_datetime, parseaddr


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def _decode(v: str | None) -> str:
    if not v:
        return ""
    try:
        return str(make_header(decode_header(v)))
    except Exception:  # noqa: BLE001
        return str(v)


def parse_message(raw: bytes, pattern: str = r"(?i)\.xlsx?$", tz: str = "America/Santiago") -> dict:
    """Extrae metadatos y adjuntos que calzan con el patrón."""
    msg: Message = email.message_from_bytes(raw)
    subject = _decode(msg.get("Subject"))
    sender = parseaddr(_decode(msg.get("From")))[1]
    try:
        from zoneinfo import ZoneInfo

        received = parsedate_to_datetime(msg.get("Date")).astimezone(ZoneInfo(tz)).replace(microsecond=0).isoformat()
    except Exception:  # noqa: BLE001
        received = ""
    rx = re.compile(pattern)
    atts = []
    for part in msg.walk():
        fn = part.get_filename()
        if not fn:
            continue
        fn = _decode(fn)
        if rx.search(fn):
            payload = part.get_payload(decode=True)
            if payload:
                atts.append({"filename": fn, "content": payload})
    return {
        "message_id": (msg.get("Message-ID") or "").strip(),
        "subject": subject,
        "sender": sender,
        "received": received,
        "attachments": atts,
    }


def matches(meta: dict, cfg_mail: dict) -> bool:
    subj, frm = _fold(meta["subject"]), _fold(meta["sender"])
    sc = [_fold(x) for x in cfg_mail.get("subject_contains") or []]
    fc = [_fold(x) for x in cfg_mail.get("from_contains") or []]
    if sc and not any(x in subj for x in sc):
        return False
    if fc and not any(x in frm for x in fc):
        return False
    return bool(meta["attachments"])


class Mailbox:
    def __init__(self, cfg: dict, user: str, password: str, tz: str):
        self.cfg = cfg["mail"]
        self.user, self.password, self.tz = user, password, tz
        self.M: imaplib.IMAP4_SSL | None = None

    def __enter__(self):
        self.M = imaplib.IMAP4_SSL(self.cfg.get("imap_host", "imap.gmail.com"))
        self.M.login(self.user, self.password)
        self.M.select(f'"{self.cfg.get("mailbox", "INBOX")}"')
        return self

    def __exit__(self, *exc):
        try:
            if self.M:
                self.M.logout()
        except Exception:  # noqa: BLE001
            pass

    def _search(self) -> list[bytes]:
        host = self.cfg.get("imap_host", "")
        q = (self.cfg.get("gmail_query") or "").replace('"', "")
        if "gmail" in host and q:
            typ, data = self.M.search(None, "X-GM-RAW", f'"{q}"')
        else:
            import datetime as dt

            since = (dt.date.today() - dt.timedelta(days=7)).strftime("%d-%b-%Y")
            typ, data = self.M.search(None, "SINCE", since)
        if typ != "OK":
            return []
        ids = data[0].split()
        return ids[-int(self.cfg.get("max_messages", 30)):]

    def fetch_new(self, processed_ids: set[str]) -> list[dict]:
        out = []
        for num in self._search():
            typ, data = self.M.fetch(num, "(BODY.PEEK[])")
            if typ != "OK" or not data or not isinstance(data[0], tuple):
                continue
            meta = parse_message(data[0][1], self.cfg.get("attachment_pattern", r"(?i)\.xlsx?$"), self.tz)
            if meta["message_id"] in processed_ids or not matches(meta, self.cfg):
                continue
            meta["imap_id"] = num
            out.append(meta)
        out.sort(key=lambda m: m["received"])  # más antiguos primero: las revisiones nuevas prevalecen
        return out

    def label(self, imap_id: bytes) -> None:
        lab = self.cfg.get("processed_label") or ""
        if lab and "gmail" in self.cfg.get("imap_host", ""):
            try:
                self.M.store(imap_id, "+X-GM-LABELS", f'"{lab}"')
            except Exception:  # noqa: BLE001
                pass
