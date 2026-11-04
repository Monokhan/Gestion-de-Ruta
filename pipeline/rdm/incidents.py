"""Incidentes de tránsito (TomTom Incident Details v5) asociados a la concesión.

Cada incidente del corredor se proyecta sobre el eje R5/ASS. Se conserva si está a
≤ `nearby_m` metros; se clasifica su relación (ruta / entorno), severidad y se cruza
con los trabajos programados del día.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter
from zoneinfo import ZoneInfo

from .geo import Route
from .store import Store, now_iso, read_json, write_json
from .tomtom import TomTom

CATEGORIES = {
    0: ("Desconocido", "⚠️"), 1: ("Accidente", "💥"), 2: ("Niebla", "🌫️"), 3: ("Condición peligrosa", "⚠️"),
    4: ("Lluvia", "🌧️"), 5: ("Hielo", "🧊"), 6: ("Congestión", "🚗"), 7: ("Pista cerrada", "🚧"),
    8: ("Vía cerrada", "⛔"), 9: ("Obras", "🚧"), 10: ("Viento", "💨"), 11: ("Inundación", "🌊"),
    14: ("Vehículo detenido", "🛻"),
}
MAGNITUDE = {0: "desconocida", 1: "menor", 2: "moderada", 3: "mayor", 4: "indefinida"}
SEV_ORDER = {"alta": 3, "media": 2, "baja": 1}


def _coords(geom: dict) -> list[tuple[float, float]]:
    """GeoJSON → lista (lat, lon)."""
    c = (geom or {}).get("coordinates") or []
    if (geom or {}).get("type") == "Point":
        return [(c[1], c[0])] if c else []
    return [(p[1], p[0]) for p in c]


def _simplify(pts: list[tuple[float, float]], max_n: int = 40) -> list[list[float]]:
    if len(pts) <= max_n:
        return [[round(a, 5), round(b, 5)] for a, b in pts]
    step = (len(pts) - 1) / (max_n - 1)
    return [[round(pts[round(i * step)][0], 5), round(pts[round(i * step)][1], 5)] for i in range(max_n)]


def severity(cat: int, mag: int, relation: str, age_days: float, delay: float | None) -> str:
    if cat in (1, 8, 11):
        s = "alta"
    elif cat == 6:
        s = "alta" if mag >= 3 or (delay or 0) >= 600 else "media" if mag == 2 else "baja"
    elif cat in (2, 3, 5, 7, 10, 14):
        s = "media"
    else:  # obras, desconocido, lluvia
        s = "baja"
    if cat == 8 and age_days > 30:  # cierres prolongados de calles locales
        s = "baja"
    if relation == "entorno":
        s = {"alta": "media", "media": "baja", "baja": "baja"}[s]
    return s


def classify(inc: dict, route: Route, cfg: dict, works: list[dict], now: dt.datetime) -> dict | None:
    ic = cfg["incidents"]
    p = inc.get("properties", {})
    pts = _coords(inc.get("geometry", {}))
    if not pts:
        return None
    proj = [route.project(lat, lon) for lat, lon in pts]
    best_i = min(range(len(proj)), key=lambda i: proj[i]["dist_m"])
    best = proj[best_i]
    if best["dist_m"] > ic["nearby_m"]:
        return None
    relation = "ruta" if best["dist_m"] <= ic["on_route_m"] else "entorno"
    near = [x for x in proj if x["route"] == best["route"] and x["dist_m"] <= ic["nearby_m"]]
    km_from = min(x["km"] for x in near)
    km_to = max(x["km"] for x in near)
    cat = int(p.get("iconCategory") or 0)
    mag = int(p.get("magnitudeOfDelay") or 0)
    start = p.get("startTime")
    age = 0.0
    if start:
        try:
            age = (now - dt.datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds() / 86400
        except ValueError:
            pass
    sev = severity(cat, mag, relation, age, p.get("delay"))
    name, icon = CATEGORIES.get(cat, ("Otro", "⚠️"))
    related = [
        {"id": w["id"], "trabajo": w["trabajo"], "tipo": w["tipo"], "fecha": w["fecha"], "contratista": w.get("contratista", "")}
        for w in works
        if Route.place(w["route"], w["km"])[0] == best["route"]
        and min(w["kmInicial"], w["kmFinal"]) - 0.5 <= km_to and max(w["kmInicial"], w["kmFinal"]) + 0.5 >= km_from
    ]
    lat, lon = pts[best_i]
    return {
        "id": p.get("id"),
        "category": cat, "category_name": name, "icon": icon,
        "magnitude": mag, "magnitude_name": MAGNITUDE.get(mag, ""),
        "delay_s": p.get("delay"), "length_m": round(p.get("length") or 0),
        "description": "; ".join(e.get("description", "") for e in p.get("events", []) if e.get("description")),
        "from": p.get("from") or "", "to": p.get("to") or "",
        "road_numbers": p.get("roadNumbers") or [],
        "start": start, "end": p.get("endTime"), "last_report": p.get("lastReportTime"),
        "probability": p.get("probabilityOfOccurrence"),
        "relation": relation, "dist_m": round(best["dist_m"]),
        "route": best["route"], "km": round(best["km"], 2), "km_from": round(km_from, 2), "km_to": round(km_to, 2),
        "sector": route.sector(best["route"], best["km"]),
        "lat": round(lat, 5), "lon": round(lon, 5),
        "geometry": _simplify(pts),
        "severity": sev,
        "related_works": related,
    }


def run(store: Store, route: Route, tt: TomTom, cfg: dict, works_today: list[dict]) -> dict:
    ic = cfg["incidents"]
    tz = store.tz
    now = dt.datetime.now(ZoneInfo(tz))
    raw, errors = {}, []
    for bbox in ic["bboxes"]:
        try:
            for inc in tt.incidents(bbox, ic.get("language", "es-ES")):
                pid = inc.get("properties", {}).get("id")
                if pid:
                    raw[pid] = inc
        except Exception as e:  # noqa: BLE001 — se registra y sigue con el otro bbox
            errors.append(str(e))
    items = [x for x in (classify(i, route, cfg, works_today, now) for i in raw.values()) if x]
    items.sort(key=lambda x: (-SEV_ORDER[x["severity"]], x["relation"] != "ruta", x["route"], x["km"]))
    ts = now_iso(tz)
    live = {"generated_at": ts, "source": "TomTom Incident Details v5", "requests": len(ic["bboxes"]),
            "corridor_total": len(raw), "errors": errors, "incidents": items}
    if errors and not raw:
        # sin datos nuevos: se conserva el último live.json válido
        prev = read_json(store.p("incidents", "live.json"))
        if prev:
            prev["errors"] = errors
            write_json(store.p("incidents", "live.json"), prev)
            return {"live": prev, "new": []}
    write_json(store.p("incidents", "live.json"), live)
    new = update_history(store, items, ts)
    return {"live": live, "new": new}


def update_history(store: Store, items: list[dict], ts: str) -> list[dict]:
    """Registra primera/última aparición. Devuelve los incidentes nuevos."""
    active = read_json(store.p("incidents", "active.json"), {})  # id → mes del archivo
    months: dict[str, dict] = {}

    def month_doc(m: str) -> dict:
        if m not in months:
            months[m] = read_json(store.p("incidents", "history", f"{m}.json"), {"month": m, "incidents": {}})
        return months[m]

    live_ids = set()
    new = []
    for it in items:
        live_ids.add(it["id"])
        m = active.get(it["id"], ts[:7])
        doc = month_doc(m)
        rec = doc["incidents"].get(it["id"])
        if rec is None:
            rec = {**it, "first_seen": ts, "notified": False}
            new.append(rec)
        else:
            keep = {k: rec[k] for k in ("first_seen", "notified") if k in rec}
            rec = {**it, **keep}
        rec.update({"last_seen": ts, "active": True})
        rec.pop("cleared_at", None)
        doc["incidents"][it["id"]] = rec
        active[it["id"]] = m
    for iid, m in list(active.items()):
        if iid not in live_ids:
            doc = month_doc(m)
            rec = doc["incidents"].get(iid)
            if rec:
                rec["active"] = False
                rec["cleared_at"] = ts
            del active[iid]
    for m, doc in months.items():
        write_json(store.p("incidents", "history", f"{m}.json"), doc)
    write_json(store.p("incidents", "active.json"), active)
    rebuild_index(store)
    return new


def rebuild_index(store: Store) -> dict:
    out = {}
    base = store.p("incidents", "history")
    for f in sorted(base.glob("????-??.json")):
        doc = read_json(f, {})
        inc = list(doc.get("incidents", {}).values())
        out[doc.get("month", f.stem)] = {
            "n": len(inc),
            "en_ruta": sum(1 for i in inc if i["relation"] == "ruta"),
            "por_categoria": dict(Counter(i["category_name"] for i in inc).most_common()),
            "por_severidad": dict(Counter(i["severity"] for i in inc)),
            "file": f"incidents/history/{f.name}",
        }
    idx = {"generated_at": now_iso(store.tz), "months": out}
    write_json(base / "index.json", idx)
    return idx


def mark_notified(store: Store, ids: list[str]) -> None:
    active = read_json(store.p("incidents", "active.json"), {})
    by_month: dict[str, list[str]] = {}
    for i in ids:
        if i in active:
            by_month.setdefault(active[i], []).append(i)
    for m, lst in by_month.items():
        path = store.p("incidents", "history", f"{m}.json")
        doc = read_json(path, {})
        for i in lst:
            if i in doc.get("incidents", {}):
                doc["incidents"][i]["notified"] = True
        write_json(path, doc)


def alertable(items: list[dict], cfg: dict) -> list[dict]:
    a = cfg["alerts"]
    th = SEV_ORDER.get(a.get("min_severity", "alta"), 3)
    return [i for i in items if SEV_ORDER[i["severity"]] >= th and (i["relation"] == "ruta" or a.get("include_nearby"))]
