"""Geometría de la concesión: PK ↔ coordenadas, proyección de puntos y sectores.

Usa los mismos archivos estáticos que la app (app/data/static/*.json).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

R_EARTH = 6371008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    t = math.pi / 180
    dla, dlo = (lat2 - lat1) * t, (lon2 - lon1) * t
    h = math.sin(dla / 2) ** 2 + math.cos(lat1 * t) * math.cos(lat2 * t) * math.sin(dlo / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(h))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    t = math.pi / 180
    y = math.sin((lon2 - lon1) * t) * math.cos(lat2 * t)
    x = math.cos(lat1 * t) * math.sin(lat2 * t) - math.sin(lat1 * t) * math.cos(lat2 * t) * math.cos((lon2 - lon1) * t)
    return (math.atan2(y, x) / t + 360) % 360


def ang_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


class Route:
    """Ejes R5 (Ruta 5 Sur) y ASS (Acceso Sur) con PK oficial."""

    R5_START = 29.4  # PK "R5" menores corresponden al Acceso Sur (la troncal parte en 29,475)

    def __init__(self, static_dir: str | Path):
        static_dir = Path(static_dir)
        d = json.loads((static_dir / "route.json").read_text(encoding="utf-8"))
        self.axes = {"R5": d["r5"], "ASS": d["ass"]}
        self.north = {"R5": d["n5"], "ASS": d["nass"]}
        self.sectors = json.loads((static_dir / "sectors.json").read_text(encoding="utf-8"))
        self.rivers = json.loads((static_dir / "rivers.json").read_text(encoding="utf-8"))

    # ---------- PK → coordenadas ----------
    def km_range(self, route: str) -> tuple[float, float]:
        g = self.axes[route]
        return g["k0"], g["k0"] + g["step"] * (len(g["pts"]) - 1)

    def at(self, route: str, km: float) -> tuple[float, float]:
        g = self.axes["ASS" if route == "ASS" else "R5"]
        n = len(g["pts"])
        f = min(max((km - g["k0"]) / g["step"], 0), n - 1)
        a = int(math.floor(f))
        b = min(n - 1, a + 1)
        t = f - a
        p, q = g["pts"][a], g["pts"][b]
        return p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t

    def at_north(self, route: str, km: float) -> tuple[float, float] | None:
        best, bd = None, 1e9
        for p in self.north["ASS" if route == "ASS" else "R5"]:
            d = abs(p[0] - km)
            if d < bd:
                bd, best = d, p
        return (best[1], best[2]) if best and bd <= 1.3 else None

    @classmethod
    def place(cls, route: str, km: float) -> tuple[str, float]:
        if route == "R5" and km < cls.R5_START:
            return "ASS", km
        return route, km

    def sector(self, route: str, km: float) -> str:
        for a, b, name in self.sectors.get(route, []):
            if a <= km < b + 1e-9:
                return name
        return f"km {km:.1f}"

    # ---------- coordenadas → PK ----------
    def project(self, lat: float, lon: float) -> dict:
        """Proyecta un punto sobre ambos ejes y devuelve el más cercano: {route, km, dist_m}."""
        kx = math.cos(lat * math.pi / 180) * 111_320.0
        ky = 110_574.0
        best = {"route": None, "km": None, "dist_m": float("inf")}
        for route, g in self.axes.items():
            pts, k0, step = g["pts"], g["k0"], g["step"]
            for i in range(1, len(pts)):
                ay, ax = pts[i - 1]
                by, bx = pts[i]
                # coordenadas locales en metros respecto al punto
                x1, y1 = (ax - lon) * kx, (ay - lat) * ky
                x2, y2 = (bx - lon) * kx, (by - lat) * ky
                dx, dy = x2 - x1, y2 - y1
                l2 = dx * dx + dy * dy or 1e-9
                t = max(0.0, min(1.0, -(x1 * dx + y1 * dy) / l2))
                px, py = x1 + t * dx, y1 + t * dy
                d = math.hypot(px, py)
                if d < best["dist_m"]:
                    best = {"route": route, "km": k0 + (i - 1 + t) * step, "dist_m": d}
        return best

    def axis_bearing(self, route: str, km: float) -> float:
        a = self.at(route, km - 0.3)
        b = self.at(route, km + 0.3)
        return bearing(a[0], a[1], b[0], b[1])
