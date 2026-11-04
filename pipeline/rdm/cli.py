"""Línea de comandos del pipeline.

  python -m rdm run          corrida programada (correo → trabajos, incidentes, tráfico)
  python -m rdm ingest FILE  carga manual de un Excel de intervención diaria
  python -m rdm incidents    fuerza consulta de incidentes
  python -m rdm traffic      fuerza consulta de flujo
  python -m rdm build-site   arma el sitio estático (app + datos)
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import traceback
from pathlib import Path
from zoneinfo import ZoneInfo

from . import incidents as inc_mod
from . import notify, site, traffic
from .config import Secrets, load_config
from .geo import Route
from .store import Store, now_iso, read_json
from .tomtom import TomTom

ROOT = Path(__file__).resolve().parents[2]


def log(msg: str) -> None:
    print(msg, flush=True)


def _due(st: dict, key: str, minutes: float, force: bool) -> bool:
    if force:
        return True
    last = st.get("last", {}).get(key)
    if not last:
        return True
    try:
        elapsed = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last)).total_seconds() / 60
    except ValueError:
        return True
    return elapsed >= minutes - 6  # tolerancia por la imprecisión del cron


def _usage(st: dict, month: str) -> dict:
    return st.setdefault("usage", {}).setdefault(month, {"flow": 0, "incidents": 0})


def cmd_run(args, cfg, sec: Secrets) -> int:
    store, route = Store(args.data, cfg["timezone"]), Route(args.static)
    st = store.state()
    st.setdefault("last", {})
    month = now_iso(cfg["timezone"])[:7]
    use = _usage(st, month)
    errors = []

    # 1) correo → trabajos programados
    if cfg["mail"]["enabled"] and not args.no_mail:
        if sec.has_mail:
            try:
                from .mailbox import Mailbox

                with Mailbox(cfg, sec.gmail_user, sec.gmail_password, cfg["timezone"]) as mb:
                    msgs = mb.fetch_new(store.processed_message_ids())
                    log(f"[correo] {len(msgs)} correo(s) nuevo(s)")
                    for m in msgs:
                        for a in m["attachments"]:
                            r = store.ingest_workbook(a["content"], {**m, "filename": a["filename"], "source": "correo"})
                            log(f"[correo] {a['filename']}: {r['status']} {r.get('n_works', '')} trabajos · fechas {r.get('updated_dates', [])}")
                        mb.label(m["imap_id"])
                st["last"]["mail"] = now_iso("UTC")
            except Exception as e:  # noqa: BLE001
                errors.append(f"correo: {sec.redact(str(e))}")
        else:
            log("[correo] omitido: faltan GMAIL_USER / GMAIL_APP_PASSWORD")

    cur = store.rebuild_current(cfg["works"]["current_window_days_past"], cfg["works"]["current_window_days_future"])
    today = dt.datetime.now(ZoneInfo(cfg["timezone"])).date().isoformat()
    works_today = [w for w in cur["works"] if w["fecha"] == today] or cur["works"]

    tt = TomTom(sec.tomtom_key) if sec.tomtom_key else None
    if not tt:
        log("[tomtom] omitido: falta TOMTOM_API_KEY")

    # 2) incidentes
    ic = cfg["incidents"]
    if tt and ic["enabled"] and _due(st, "incidents", ic["every_minutes"], args.force_incidents):
        if use["incidents"] + len(ic["bboxes"]) > cfg["quotas"]["tomtom_incidents_monthly"]:
            errors.append("incidentes: se alcanzó el tope mensual configurado")
        else:
            try:
                before = tt.requests
                res = inc_mod.run(store, route, tt, cfg, works_today)
                use["incidents"] += tt.requests - before
                st["last"]["incidents"] = now_iso("UTC")
                live = res["live"]
                log(f"[incidentes] corredor {live.get('corridor_total')} · asociados {len(live['incidents'])} · nuevos {len(res['new'])}")
                errors += [f"incidentes: {sec.redact(e)}" for e in live.get("errors", [])]
                alerts = inc_mod.alertable(res["new"], cfg)
                if alerts and cfg["alerts"]["email_enabled"] and sec.alert_to and sec.has_mail:
                    try:
                        if notify.send(alerts, sec.gmail_user, sec.gmail_password, sec.alert_to, cfg.get("site_url", "")):
                            inc_mod.mark_notified(store, [a["id"] for a in alerts])
                            log(f"[alertas] correo enviado ({len(alerts)} incidente(s))")
                    except Exception as e:  # noqa: BLE001
                        errors.append(f"alertas: {sec.redact(str(e))}")
            except Exception as e:  # noqa: BLE001
                errors.append(f"incidentes: {sec.redact(str(e))}")

    # 3) flujo de tráfico
    tc = cfg["traffic"]
    if tt and tc["enabled"] and _due(st, "traffic", tc["every_minutes"], args.force_traffic):
        n = len(traffic.sample_points(route, float(tc["spacing_km"]), tc["directions"]))
        if use["flow"] + n > cfg["quotas"]["tomtom_flow_monthly"]:
            errors.append("tráfico: se alcanzó el tope mensual configurado")
        else:
            try:
                before = tt.requests
                live = traffic.run(store, route, tt, cfg)
                use["flow"] += tt.requests - before
                st["last"]["traffic"] = now_iso("UTC")
                log(f"[tráfico] {len(live['segments'])} tramos · {tt.requests - before} consultas")
                errors += [f"tráfico: {sec.redact(e)}" for e in live.get("errors", [])]
            except Exception as e:  # noqa: BLE001
                errors.append(f"tráfico: {sec.redact(str(e))}")

    st["last"]["run"] = now_iso("UTC")
    if errors:
        st.setdefault("errors", []).extend({"at": now_iso(cfg["timezone"]), "msg": e} for e in errors)
        st["errors"] = st["errors"][-50:]
        for e in errors:
            log(f"[error] {e}")
    store.save_state(st)
    return 0


def cmd_ingest(args, cfg, sec) -> int:
    store = Store(args.data, cfg["timezone"])
    p = Path(args.file)
    received = args.received or dt.datetime.fromtimestamp(p.stat().st_mtime, ZoneInfo(cfg["timezone"])).replace(microsecond=0).isoformat()
    r = store.ingest_workbook(p.read_bytes(), {"filename": p.name, "received": received, "subject": args.subject or "Carga manual", "source": "manual"})
    store.rebuild_current(cfg["works"]["current_window_days_past"], cfg["works"]["current_window_days_future"])
    log(f"{p.name}: {r['status']} · {r.get('n_works', 0)} trabajos · fechas {r.get('updated_dates', [])}")
    return 0 if r["status"] in ("ok", "duplicado") else 1


def cmd_build(args, cfg, sec) -> int:
    out = site.build(args.app, args.data, args.out, cfg["timezone"])
    log(f"sitio generado en {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="rdm", description="Pipeline Gestión de Ruta · Ruta del Maipo")
    ap.add_argument("--config", default=str(ROOT / "config.yml"))
    ap.add_argument("--data", default=str(ROOT / "datos"), help="carpeta de datos (checkout de la rama data)")
    ap.add_argument("--static", default=str(ROOT / "app" / "data" / "static"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="corrida programada")
    r.add_argument("--no-mail", action="store_true")
    r.add_argument("--force-incidents", action="store_true")
    r.add_argument("--force-traffic", action="store_true")
    i = sub.add_parser("ingest", help="carga manual de un Excel")
    i.add_argument("file")
    i.add_argument("--received", help="fecha/hora ISO de recepción (por defecto, fecha del archivo)")
    i.add_argument("--subject")
    sub.add_parser("incidents", help="fuerza consulta de incidentes")
    sub.add_parser("traffic", help="fuerza consulta de flujo")
    b = sub.add_parser("build-site", help="arma el sitio estático")
    b.add_argument("--app", default=str(ROOT / "app"))
    b.add_argument("--out", default=str(ROOT / "_site"))
    args = ap.parse_args(argv)
    cfg, sec = load_config(args.config), Secrets()
    try:
        if args.cmd == "run":
            return cmd_run(args, cfg, sec)
        if args.cmd in ("incidents", "traffic"):
            ns = argparse.Namespace(**vars(args), no_mail=True, force_incidents=args.cmd == "incidents", force_traffic=args.cmd == "traffic")
            if args.cmd == "incidents":
                cfg["traffic"]["enabled"] = False
            else:
                cfg["incidents"]["enabled"] = False
            return cmd_run(ns, cfg, sec)
        if args.cmd == "ingest":
            return cmd_ingest(args, cfg, sec)
        if args.cmd == "build-site":
            return cmd_build(args, cfg, sec)
    except Exception as e:  # noqa: BLE001
        print(sec.redact("".join(traceback.format_exception(e))), file=sys.stderr)
        return 1
    return 0
