"""Construye el sitio estático: app/ + datos publicables en <out>/data/."""
from __future__ import annotations

import shutil
from pathlib import Path

from .store import Store, now_iso, read_json, write_json

PUBLISH = [
    "works/current.json", "works/index.json", "works/history",
    "incidents/live.json", "incidents/history",
    "traffic/live.json", "traffic/history",
    "ingest/log.json",
]


def build(app_dir: str | Path, data_dir: str | Path, out_dir: str | Path, tz: str = "America/Santiago") -> Path:
    app_dir, data_dir, out = Path(app_dir), Path(data_dir), Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(app_dir, out)
    dst = out / "data"
    for rel in PUBLISH:
        src = data_dir / rel
        if src.is_dir():
            shutil.copytree(src, dst / rel, dirs_exist_ok=True)
        elif src.exists():
            (dst / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst / rel)
    log = read_json(data_dir / "ingest" / "log.json", [])
    if (dst / "ingest" / "log.json").exists():  # sin rutas internas en la versión pública
        write_json(dst / "ingest" / "log.json", [{k: v for k, v in x.items() if k not in ("raw", "message_id")} for x in log][-100:])
    for f in (dst / "works" / "history").rglob("*.json") if (dst / "works" / "history").exists() else []:
        doc = read_json(f, {})  # sin rutas internas ni message_id en la versión pública
        for meta in [doc.get("source") or {}, *(doc.get("revisions") or [])]:
            meta.pop("raw", None)
            meta.pop("message_id", None)
        write_json(f, doc)
    st = Store(data_dir, tz).state()
    write_json(dst / "manifest.json", {
        "built_at": now_iso(tz),
        "demo": bool(st.get("demo")),
        "last": st.get("last", {}),
        "usage": st.get("usage", {}),
        "errors": st.get("errors", [])[-5:],
        "files": {rel: (data_dir / rel).exists() for rel in PUBLISH},
    })
    (out / ".nojekyll").write_text("")
    return out
