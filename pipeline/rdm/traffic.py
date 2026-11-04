"""Flujo de tráfico por tramo (TomTom Flow Segment Data) sobre ambas calzadas."""
from __future__ import annotations

import csv
import re
from pathlib import Path

from .geo import Route, ang_diff, bearing, haversine_m
from .store import Store, now_iso, write_json
from .tomtom import TomTom, TomTomError

CSV_FIELDS = ["timestamp", "route", "km", "dir", "current_kmh", "free_kmh", "ratio", "confidence", "closed", "frc"]


def sample_points(route: Route, spacing: float = 10, directions: str = "both") -> list[dict]:
    pts = []

    def add(r: str, km: float):
        if directions != "N":
            lat, lon = route.at(r, km)
            pts.append({"route": r, "km": km, "dir": "S", "lat": lat, "lon": lon})
        if directions != "S":
            n = route.at_north(r, km)
            if n:
                pts.append({"route": r, "km": km, "dir": "N", "lat": n[0], "lon": n[1]})

    k = 2.5
    while k <= 45 + 1e-9:
        add("ASS", round(k, 2))
        k += spacing
    k = 30.0
    while k <= 217.5 + 1e-9:
        add("R5", round(k, 2))
        k += spacing
    return pts


def measure(tt: TomTom, route: Route, p: dict, zoom: int = 12) -> dict:
    f = tt.flow_segment(p["lat"], p["lon"], zoom)
    coords = [(c["latitude"], c["longitude"]) for c in (f.get("coordinates") or {}).get("coordinate", [])]
    dist = min((haversine_m(p["lat"], p["lon"], a, b) for a, b in coords), default=float("nan"))
    direction = p["dir"]
    if len(coords) > 1:
        exp = route.axis_bearing(p["route"], p["km"])
        got = bearing(coords[0][0], coords[0][1], coords[-1][0], coords[-1][1])
        diff = ang_diff(exp, got)
        direction = "S" if diff < 70 else "N" if diff > 110 else p["dir"]
    flags = []
    frc = f.get("frc") or ""
    if not re.match(r"^FRC[0-2]$", frc):
        flags.append(f"vía secundaria ({frc or '?'})")
    if dist == dist and dist > 300:
        flags.append(f"tramo a {dist:.0f} m")
    if direction != p["dir"]:
        flags.append("sentido corregido")
    cur, free = f.get("currentSpeed"), f.get("freeFlowSpeed")
    return {
        "route": p["route"], "km": p["km"], "dir": direction, "reqDir": p["dir"],
        "cur": cur, "free": free, "ratio": round(cur / free, 3) if cur is not None and free else None,
        "tt": f.get("currentTravelTime"), "ttf": f.get("freeFlowTravelTime"),
        "conf": f.get("confidence"), "closed": bool(f.get("roadClosure")), "frc": frc,
        "dist": round(dist, 1) if dist == dist else None, "flags": flags,
    }


def run(store: Store, route: Route, tt: TomTom, cfg: dict) -> dict:
    tc = cfg["traffic"]
    pts = sample_points(route, float(tc["spacing_km"]), tc["directions"])
    segs, errors = {}, []
    for p in pts:
        try:
            s = measure(tt, route, p, int(tc.get("zoom", 12)))
        except TomTomError as e:
            if e.status in (403, 429):
                errors.append(str(e))
                break
            errors.append(f"{p['route']} km {p['km']} {p['dir']}: {e}")
            continue
        key = (s["route"], s["km"], s["dir"])
        o = segs.get(key)
        if o is None or (s["dir"] == s["reqDir"] and o["dir"] != o["reqDir"]) or (s["dist"] or 1e9) < (o["dist"] or 1e9):
            segs[key] = s
    ts = now_iso(store.tz)
    live = {"generated_at": ts, "source": "TomTom Traffic Flow Segment Data v4", "spacing_km": float(tc["spacing_km"]),
            "directions": tc["directions"], "requests": tt.requests, "errors": errors, "segments": list(segs.values())}
    if segs:
        write_json(store.p("traffic", "live.json"), live)
        hist = store.p("traffic", "history", f"{ts[:7]}.csv")
        hist.parent.mkdir(parents=True, exist_ok=True)
        new = not hist.exists()
        with hist.open("a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if new:
                w.writerow(CSV_FIELDS)
            for s in segs.values():
                w.writerow([ts, s["route"], s["km"], s["dir"], s["cur"], s["free"], s["ratio"], s["conf"], int(s["closed"]), s["frc"]])
        rebuild_index(store)
    return live


def rebuild_index(store: Store) -> dict:
    """traffic/history/index.json: meses disponibles para el panel Histórico."""
    d = store.p("traffic", "history")
    months = {}
    for f in sorted(d.glob("????-??.csv")):
        with f.open(encoding="utf-8") as fh:
            rows = sum(1 for _ in fh) - 1
        months[f.stem] = {"file": f"traffic/history/{f.name}", "rows": max(0, rows), "bytes": f.stat().st_size}
    idx = {"generated_at": now_iso(store.tz), "months": months}
    write_json(d / "index.json", idx)
    return idx


def load_history(path: Path) -> list[dict]:
    with Path(path).open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))
