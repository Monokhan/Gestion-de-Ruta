"""Almacenamiento versionado en la carpeta de datos (rama `data` del repositorio).

Estructura:
  raw/AAAA/MM/<fecha>_<sha8>_<archivo>.xlsx   adjuntos originales
  ingest/log.json                              correos/archivos procesados
  works/history/AAAA/AAAA-MM-DD.json           trabajos por fecha de intervención (última revisión + historial)
  works/index.json                             resumen por fecha
  works/current.json                           set que abre la app
  incidents/live.json · incidents/history/AAAA-MM.json · incidents/history/index.json · incidents/active.json
  traffic/live.json · traffic/history/AAAA-MM.csv
  state.json                                   últimas corridas y consumo de cuotas
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .excel import parse_workbook


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, obj: Any, compact: bool = False) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(obj, ensure_ascii=False, indent=1)
    path.write_text(txt + "\n", encoding="utf-8")


def now_iso(tz: str) -> str:
    return dt.datetime.now(ZoneInfo(tz)).replace(microsecond=0).isoformat()


def safe_name(name: str) -> str:
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE).strip("_")
    return name[:90] or "adjunto.xlsx"


class Store:
    def __init__(self, data_dir: str | Path, tz: str = "America/Santiago"):
        self.dir = Path(data_dir)
        self.tz = tz

    def p(self, *parts: str) -> Path:
        return self.dir.joinpath(*parts)

    # ------------------------------------------------------------------ estado
    def state(self) -> dict:
        return read_json(self.p("state.json"), {"last": {}, "usage": {}, "errors": []})

    def save_state(self, st: dict) -> None:
        st["errors"] = st.get("errors", [])[-20:]
        write_json(self.p("state.json"), st)

    # ------------------------------------------------------------------ ingesta de trabajos
    def processed_message_ids(self) -> set[str]:
        return {x.get("message_id") for x in read_json(self.p("ingest", "log.json"), []) if x.get("message_id")}

    def ingest_workbook(self, content: bytes, meta: dict) -> dict:
        """Procesa un Excel. meta: filename, received (ISO), subject, sender, message_id, source."""
        sha = hashlib.sha256(content).hexdigest()
        log = read_json(self.p("ingest", "log.json"), [])
        if any(x.get("sha256") == sha for x in log):
            return {"status": "duplicado", "sha256": sha, "filename": meta.get("filename")}

        received = meta.get("received") or now_iso(self.tz)
        rdate = received[:10]
        raw_rel = Path("raw", rdate[:4], rdate[5:7], f"{received[:16].replace(':', '').replace('-', '')}_{sha[:8]}_{safe_name(meta.get('filename', 'adjunto.xlsx'))}")
        self.p(str(raw_rel)).parent.mkdir(parents=True, exist_ok=True)
        self.p(str(raw_rel)).write_bytes(content)

        parsed = parse_workbook(content)
        works = parsed["works"]
        # ids únicos dentro del archivo
        seen: Counter = Counter()
        for w in works:
            seen[w["id"]] += 1
            if seen[w["id"]] > 1:
                w["id"] = f"{w['id']}-{seen[w['id']]}"

        source = {
            "filename": meta.get("filename", ""),
            "received": received,
            "subject": meta.get("subject", ""),
            "sender": meta.get("sender", ""),
            "message_id": meta.get("message_id", ""),
            "via": meta.get("source", "correo"),
            "sha256": sha,
            "raw": str(raw_rel).replace("\\", "/"),
        }
        by_date: dict[str, list] = {}
        for w in works:
            by_date.setdefault(w["fecha"] or "sin-fecha", []).append(w)

        updated, skipped = [], []
        for date, items in sorted(by_date.items()):
            path = self.day_path(date)
            prev = read_json(path)
            if prev and prev.get("source", {}).get("received", "") > received:
                skipped.append(date)  # ya existe una revisión más reciente para esa fecha
                continue
            revisions = (prev.get("revisions", []) + [prev["source"]]) if prev else []
            write_json(path, {
                "date": date,
                "updated_at": now_iso(self.tz),
                "source": source,
                "revisions": revisions[-20:],
                "works": items,
            })
            updated.append(date)

        log.append({**source, "processed_at": now_iso(self.tz), "n_works": len(works), "dates": sorted(by_date),
                    "updated_dates": updated, "skipped_dates": skipped, "diag": parsed["diag"]})
        write_json(self.p("ingest", "log.json"), log[-500:])
        self.rebuild_index()
        return {"status": "ok", "sha256": sha, "filename": source["filename"], "n_works": len(works),
                "updated_dates": updated, "skipped_dates": skipped, "diag": parsed["diag"]}

    def day_path(self, date: str) -> Path:
        year = date[:4] if re.match(r"^\d{4}-", date) else "otros"
        return self.p("works", "history", year, f"{date}.json")

    def iter_days(self):
        base = self.p("works", "history")
        if not base.exists():
            return
        for f in sorted(base.glob("*/*.json")):
            d = read_json(f)
            if d:
                yield d

    def rebuild_index(self) -> dict:
        dates = {}
        for d in self.iter_days():
            ws = d.get("works", [])
            dates[d["date"]] = {
                "n": len(ws),
                "noche": sum(1 for w in ws if w["tipo"] == "Noche"),
                "dia": sum(1 for w in ws if w["tipo"] != "Noche"),
                "r5": sum(1 for w in ws if w["route"] == "R5"),
                "ass": sum(1 for w in ws if w["route"] == "ASS"),
                "contratistas": dict(Counter(w["contratista"] or "Sin contratista" for w in ws).most_common()),
                "km_segregados": round(sum(abs(w["kmFinal"] - w["kmInicial"]) for w in ws), 2),
                "file": str(self.day_path(d["date"]).relative_to(self.dir)).replace("\\", "/"),
                "source": {k: d["source"].get(k, "") for k in ("filename", "received", "subject")},
                "revisions": len(d.get("revisions", [])),
            }
        idx = {"generated_at": now_iso(self.tz), "dates": dict(sorted(dates.items()))}
        write_json(self.p("works", "index.json"), idx)
        return idx

    def rebuild_current(self, past: int = 1, future: int = 7) -> dict:
        idx = read_json(self.p("works", "index.json"), {"dates": {}})
        today = dt.datetime.now(ZoneInfo(self.tz)).date()
        lo, hi = (today - dt.timedelta(days=past)).isoformat(), (today + dt.timedelta(days=future)).isoformat()
        dates = [d for d in idx["dates"] if lo <= d <= hi]
        mode = "ventana"
        if not dates:
            log = read_json(self.p("ingest", "log.json"), [])
            if log:  # sin fechas vigentes: se muestra el último archivo recibido
                dates = [d for d in log[-1].get("dates", []) if d in idx["dates"]]
                mode = "ultimo_archivo"
        works, sources = [], {}
        for d in sorted(dates):
            day = read_json(self.dir / idx["dates"][d]["file"], {})
            works.extend(day.get("works", []))
            sources[d] = day.get("source", {})
        cur = {"generated_at": now_iso(self.tz), "mode": mode, "window": [lo, hi], "dates": sorted(dates),
               "sources": sources, "works": works}
        write_json(self.p("works", "current.json"), cur)
        return cur
