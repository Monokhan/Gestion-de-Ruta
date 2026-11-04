"""Genera datos de DEMOSTRACIÓN (sintéticos) para probar la app sin correo ni API key.

    python scripts/demo_data.py --out demo_datos
    python -m rdm --data demo_datos build-site --out _site
    python -m http.server -d _site 8000

Todo lo que genera es ficticio: trabajos, contratistas, responsables, incidentes
históricos y mediciones de tráfico. Los incidentes "en vivo" usan una muestra real
anonimizada del corredor (pipeline/tests/fixtures) para ejercitar la clasificación.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import math
import random
import shutil
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from openpyxl import Workbook  # noqa: E402

from rdm import incidents, traffic  # noqa: E402
from rdm.config import load_config  # noqa: E402
from rdm.geo import Route  # noqa: E402
from rdm.store import Store, write_json  # noqa: E402
from rdm.tomtom import TomTom  # noqa: E402

ACTIVIDADES = ["Bacheo superficial", "Sello de juntas", "Demarcación", "Limpieza de faja", "Reparación de defensa caminera",
               "Mantención de luminarias", "Poda y roce", "Reparación de junta de dilatación", "Lavado de señalética",
               "Recarpeteo", "Inspección de puente", "Rutinario"]
CONTRATISTAS = ["Contratista A", "Contratista B", "Contratista C", "Contratista D", "Contratista E"]
RESPONSABLES = ["Supervisor 1", "Supervisor 2", "Supervisor 3", "Supervisor 4"]
PISTAS = ["Pista 1", "Pista 2", "Berma", "Mediana", "Pista 1 y 2"]
CALZADAS = ["Oriente", "Poniente", "Oriente - Poniente"]
HEAD_N = ["Ruta R5/ASS", "Proceso CM/MV/SEE", "Responsable", "Tipo de trabajos", "Contratista", "Km Inicial", "Km Final",
          "Longitud Segregación", "Pista a Intervenir", "Calzada", "Sectores", "Horario", "Hora Inicio", "Hora Final", "Fecha intervención", None]
HEAD_D = ["Ruta R5/ASS", "Fecha Intervención", None, "ACTIVIDAD", "Km Inicial", "Km Final", "Pista a Intervenir", "Calzada", "Sector", None,
          "Ruta R5/ASS", "Fecha intervención", "Tipo de trabajos", "Contratista", "Km Inicial", "Km Final", "Longitud Segregación",
          "Pista a Intervenir", "Calzada", "SECTOR", "Horario", "Hora Inicio", "Hora Final", "Observación", "Responsable"]
WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def rand_km(rnd: random.Random) -> tuple[str, float, float]:
    if rnd.random() < 0.18:
        a = rnd.uniform(2, 44)
        return "ASS", round(a, 3), round(min(46, a + rnd.choice([0, 0.2, 0.5, 1, 2])), 3)
    a = rnd.uniform(30, 216)
    return "R5", round(a, 3), round(min(219, a + rnd.choice([0, 0.3, 0.5, 1, 1.5, 3])), 3)


def workbook_for(day: dt.date, route: Route, rnd: random.Random) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "NOCHE"
    ws.append([None, "Subgerencia de Operaciones"])
    ws.append([None, "Intervención de calzada (DEMO)"])
    ws.append([None, "HORARIO NOCTURNO"])
    ws.append([None, *HEAD_N])
    d = dt.datetime.combine(day, dt.time())
    for _ in range(rnd.randint(6, 16) if day.weekday() < 5 else rnd.randint(2, 6)):
        r, a, b = rand_km(rnd)
        ws.append([None, r, rnd.choice(["CM", "MV", "SEE"]), rnd.choice(RESPONSABLES), rnd.choice(ACTIVIDADES), rnd.choice(CONTRATISTAS),
                   a, b, int(abs(b - a) * 1000) or 300, rnd.choice(PISTAS), rnd.choice(CALZADAS), route.sector(*Route.place(r, a)),
                   "Nocturno", dt.time(21, 0), dt.time(6, 0), d, None])
    wd = wb.create_sheet("DÍA")
    wd.append([])
    wd.append([None, "TRABAJOS CON INTERVENCIÓN", *([None] * 9), "TRABAJOS CON/SIN INTERVENCIÓN"])
    wd.append([None, *HEAD_D])
    for _ in range(rnd.randint(8, 22) if day.weekday() < 5 else rnd.randint(2, 7)):
        r, a, b = rand_km(rnd)
        act, sec = rnd.choice(ACTIVIDADES), route.sector(*Route.place(r, a))
        wd.append([None, r, WEEKDAYS[day.weekday()], d, act, a, b, rnd.choice(PISTAS), rnd.choice(CALZADAS), sec, None,
                   r, d, act, rnd.choice(CONTRATISTAS), a, b, int(abs(b - a) * 1000) or 300, rnd.choice(PISTAS), rnd.choice(CALZADAS),
                   sec, "Diurno", dt.time(8, 0), dt.time(18, 0), rnd.choice([None, None, "Segregación alternada", "Con banderero"]),
                   rnd.choice(RESPONSABLES)])
    wb.create_sheet("Sectores")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def synth_incident(route: Route, rnd: random.Random, start: dt.datetime, n: int) -> dict:
    r, a, _ = rand_km(rnd)
    r, a = Route.place(r, a)
    cat = rnd.choices([1, 6, 7, 8, 9, 2, 14], weights=[3, 6, 1, 1, 2, 1, 1])[0]
    length = rnd.uniform(0.2, 2.5) if cat == 6 else rnd.uniform(0.05, 0.4)
    lo, hi = route.km_range(r)
    pts = [route.at(r, min(hi, max(lo, a + length * t / 4))) for t in range(5)]
    return {"type": "Feature", "properties": {
        "id": f"demo-{n:05d}", "iconCategory": cat, "magnitudeOfDelay": rnd.choice([1, 2, 2, 3, 4]) if cat == 6 else rnd.choice([0, 1, 3]),
        "events": [{"description": {1: "Accidente", 6: "Tráfico lento", 7: "Carril cerrado", 8: "Vía cerrada", 9: "Obras",
                                    2: "Niebla", 14: "Vehículo detenido"}[cat]}],
        "startTime": start.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "from": "", "to": "", "length": length * 1000, "delay": rnd.randint(60, 1500) if cat == 6 else None, "roadNumbers": ["5"]},
        "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in pts]}}


class FixtureSession:
    """Sesión falsa: responde incidentes desde una lista y velocidades con un modelo horario."""

    def __init__(self, incs: list[dict], hour: int, rnd: random.Random):
        self.incs, self.hour, self.rnd, self.headers = incs, hour, rnd, {}

    def get(self, url, params=None, timeout=None):
        if "incidentDetails" in url:
            bb = [float(x) for x in params["bbox"].split(",")]
            inside = [i for i in self.incs if bb[0] <= i["geometry"]["coordinates"][0][0] <= bb[2] and bb[1] <= i["geometry"]["coordinates"][0][1] <= bb[3]]
            return _Resp({"incidents": inside})
        lat, lon = (float(x) for x in params["point"].split(","))
        free = 100 if lat > -33.75 else 120
        cur = round(free * speed_ratio(lat, self.hour, self.rnd))
        return _Resp({"flowSegmentData": {"frc": "FRC0", "currentSpeed": cur, "freeFlowSpeed": free, "currentTravelTime": 100,
                                          "freeFlowTravelTime": 90, "confidence": 0.95, "roadClosure": False,
                                          "coordinates": {"coordinate": [{"latitude": lat + 0.002, "longitude": lon}, {"latitude": lat - 0.002, "longitude": lon}]}}})


class _Resp:
    status_code = 200

    def __init__(self, d):
        self._d = d

    def json(self):
        return self._d


def speed_ratio(lat: float, hour: int, rnd: random.Random) -> float:
    """Punta mañana/tarde más marcada cerca de Santiago."""
    near = max(0.0, min(1.0, (lat + 34.2) / 0.6))  # 1 en Santiago, 0 al sur de Rancagua
    peak = math.exp(-((hour - 8) ** 2) / 2) + math.exp(-((hour - 19) ** 2) / 3)
    return max(0.15, min(1.05, 1 - 0.55 * near * peak - 0.08 * peak + rnd.gauss(0, 0.04)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "demo_datos"))
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    cfg = load_config(ROOT / "config.yml")
    tz = ZoneInfo(cfg["timezone"])
    route = Route(ROOT / "app" / "data" / "static")
    store = Store(out, cfg["timezone"])
    rnd = random.Random(a.seed)
    today = dt.datetime.now(tz).date()

    # 1) programas de trabajo: un correo por día, recibido la tarde anterior
    for k in range(-a.days, 3):
        day = today + dt.timedelta(days=k)
        recv = dt.datetime.combine(day - dt.timedelta(days=1), dt.time(17, rnd.randint(0, 59)), tz)
        content = workbook_for(day, route, rnd)
        store.ingest_workbook(content, {"filename": f"Intervención diaria {day:%d-%m-%Y} (DEMO).xlsx", "received": recv.isoformat(),
                                        "subject": f"Intervención diaria {day:%d-%m-%Y}", "message_id": f"<demo-{day}@ejemplo>", "source": "demo"})
        if k == -2:  # una revisión del mismo día (rev02) para mostrar versiones
            store.ingest_workbook(workbook_for(day, route, rnd), {"filename": f"Intervención diaria {day:%d-%m-%Y} rev02 (DEMO).xlsx",
                                                                  "received": (recv + dt.timedelta(hours=3)).isoformat(),
                                                                  "subject": "rev02", "message_id": f"<demo-{day}-r2@ejemplo>", "source": "demo"})
    store.rebuild_current(cfg["works"]["current_window_days_past"], cfg["works"]["current_window_days_future"])
    works_today = [w for w in json.loads(store.p("works", "current.json").read_text(encoding="utf-8"))["works"] if w["fecha"] == today.isoformat()]

    # 2) historial de incidentes: línea de tiempo cada 2 h con aparición/despeje
    now = dt.datetime.now(tz).replace(minute=0, second=0, microsecond=0)
    t = now - dt.timedelta(days=a.days)
    active: dict[str, tuple[dict, dt.datetime]] = {}
    n = 0
    while t < now - dt.timedelta(hours=2):
        for _ in range(rnd.choices([0, 1, 2], weights=[5, 3, 1])[0]):
            n += 1
            raw = synth_incident(route, rnd, t - dt.timedelta(minutes=rnd.randint(5, 60)), n)
            active[raw["properties"]["id"]] = (raw, t + dt.timedelta(hours=rnd.choice([2, 2, 4, 6, 10])))
        active = {k: v for k, v in active.items() if v[1] > t}
        items = [x for x in (incidents.classify(r, route, cfg, [], t) for r, _ in active.values()) if x]
        incidents.update_history(store, items, t.isoformat())
        t += dt.timedelta(hours=2)

    # 3) tráfico histórico: medición cada 2 h
    pts = traffic.sample_points(route, float(cfg["traffic"]["spacing_km"]), cfg["traffic"]["directions"])
    t = now - dt.timedelta(days=min(a.days, 21))
    while t < now:
        f = store.p("traffic", "history", f"{t:%Y-%m}.csv")
        f.parent.mkdir(parents=True, exist_ok=True)
        new = not f.exists()
        with f.open("a", encoding="utf-8") as fh:
            if new:
                fh.write(",".join(traffic.CSV_FIELDS) + "\n")
            for p in pts:
                free = 100 if p["lat"] > -33.75 else 120
                r = speed_ratio(p["lat"], t.hour, rnd)
                fh.write(f"{t.isoformat()},{p['route']},{p['km']},{p['dir']},{round(free * r)},{free},{round(r, 3)},0.95,0,FRC0\n")
        t += dt.timedelta(hours=2)

    # 4) estado "en vivo": incidentes reales de muestra + flujo simulado de la hora actual
    sample = json.loads((ROOT / "pipeline" / "tests" / "fixtures" / "incidents_corridor.json").read_text(encoding="utf-8"))["incidents"]
    sess = FixtureSession(sample, now.hour, rnd)
    incidents.run(store, route, TomTom("demo", session=sess), cfg, works_today)
    traffic.run(store, route, TomTom("demo", session=sess), cfg)

    iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    st = store.state()
    st["demo"] = True
    st["last"] = {"mail": iso, "incidents": iso, "traffic": iso, "run": iso}
    st["usage"] = {f"{today:%Y-%m}": {"flow": 0, "incidents": 0}}
    store.save_state(st)
    write_json(store.p("README.txt.json"), {"aviso": "Datos de demostración generados por scripts/demo_data.py. No son datos reales."})
    print(f"demo lista en {out}: {n} incidentes históricos sintéticos, {len(pts)} puntos de tráfico")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
