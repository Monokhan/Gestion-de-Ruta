"""Carga de configuración (config.yml) y secretos (variables de entorno)."""
from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

import yaml

DEFAULTS: dict[str, Any] = {
    "timezone": "America/Santiago",
    "site_url": "",
    "mail": {
        "enabled": True,
        "imap_host": "imap.gmail.com",
        "mailbox": "INBOX",
        "gmail_query": "has:attachment filename:xlsx newer_than:7d",
        "subject_contains": [],
        "from_contains": [],
        "attachment_pattern": r"(?i)\.xlsx?$",
        "processed_label": "",
        "max_messages": 30,
    },
    "works": {"current_window_days_past": 1, "current_window_days_future": 7},
    "incidents": {
        "enabled": True,
        "every_minutes": 40,
        "bboxes": [[-70.80, -34.40, -70.57, -33.52], [-71.45, -35.22, -70.80, -34.40]],
        "on_route_m": 80,
        "nearby_m": 400,
        "language": "es-ES",
    },
    "traffic": {"enabled": True, "every_minutes": 120, "spacing_km": 10, "directions": "both", "zoom": 12},
    "alerts": {"email_enabled": True, "min_severity": "alta", "include_nearby": False},
    "quotas": {"tomtom_flow_monthly": 20000, "tomtom_incidents_monthly": 2500},
}


def _merge(base: dict, extra: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: str | Path | None) -> dict:
    data: dict = {}
    if path and Path(path).exists():
        data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    cfg = _merge(DEFAULTS, data)
    if os.environ.get("SITE_URL"):
        cfg["site_url"] = os.environ["SITE_URL"]
    return cfg


class Secrets:
    """Lee secretos desde el entorno. Nunca se imprimen."""

    def __init__(self, env: dict | None = None):
        e = env if env is not None else os.environ
        self.tomtom_key = (e.get("TOMTOM_API_KEY") or "").strip()
        self.gmail_user = (e.get("GMAIL_USER") or "").strip()
        self.gmail_password = (e.get("GMAIL_APP_PASSWORD") or "").replace(" ", "").strip()
        self.alert_to = [x.strip() for x in (e.get("ALERT_TO") or "").split(",") if x.strip()]

    @property
    def has_mail(self) -> bool:
        return bool(self.gmail_user and self.gmail_password)

    def redact(self, text: str) -> str:
        for s in (self.tomtom_key, self.gmail_password):
            if s:
                text = text.replace(s, "***")
        return text
