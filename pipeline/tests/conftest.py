import datetime as dt
import io
import json
import sys
from pathlib import Path

import pytest
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from rdm.config import load_config  # noqa: E402
from rdm.geo import Route  # noqa: E402
from rdm.store import Store  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def cfg():
    return load_config(ROOT / "config.yml")


@pytest.fixture(scope="session")
def route():
    return Route(ROOT / "app" / "data" / "static")


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "datos")


def make_workbook(night_rows, day_rows) -> bytes:
    """Excel sintético con la misma estructura del archivo de Intervención diaria."""
    wb = Workbook()
    ws = wb.active
    ws.title = "NOCHE"
    ws.append([None, "Subgerencia de Operaciones"])
    ws.append([None, "Intervención de calzada"])
    ws.append([None, "HORARIO NOCTURNO"])
    ws.append([None, "Ruta R5/ASS", "Proceso CM/MV/SEE", "Responsable", "Tipo de trabajos", "Contratista", "Km Inicial", "Km Final",
               "Longitud Segregación", "Pista a Intervenir", "Calzada", "Sectores", "Horario", "Hora Inicio", "Hora Final", "Fecha intervención", None])
    for r in night_rows:
        ws.append([None, *r])
    wd = wb.create_sheet("DÍA")
    wd.append([])
    wd.append([None, "TRABAJOS CON INTERVENCIÓN", *([None] * 9), "TRABAJOS CON/SIN INTERVENCIÓN"])
    wd.append([None, "Ruta R5/ASS", "Fecha Intervención", None, "ACTIVIDAD", "Km Inicial", "Km Final", "Pista a Intervenir", "Calzada", "Sector", None,
               "Ruta R5/ASS", "Fecha intervención", "Tipo de trabajos", "Contratista", "Km Inicial", "Km Final", "Longitud Segregación",
               "Pista a Intervenir", "Calzada", "SECTOR", "Horario", "Hora Inicio", "Hora Final", "Observación", "Responsable"])
    for r in day_rows:
        wd.append([None, *r])
    wb.create_sheet("Sectores")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture
def workbook_bytes():
    d1 = dt.datetime(2026, 11, 3)
    night = [
        ["R5", "CM", "Persona A", "Reparación de junta", "Contratista Uno", 17.498, 17.498, 2500, "CS", "Oriente - Poniente", "Rio Maipo Acceso Sur",
         "Nocturno", dt.time(20, 0), dt.time(6, 0), d1, "P.I. Los Morros"],
        ["R5", "MV", "Persona B", "Demarcación", "Contratista Dos", 40.2, 40.5, 300, "C.S", "Oriente - Poniente", "Paine", "Nocturno",
         dt.time(20, 0), dt.time(6, 0), d1, None],
    ]
    day = [
        ["R5", "martes", d1, "Sellos de juntas", 36.0, 37.0, "Pista 1", "Poniente", "Linderos", None,
         "R5", d1, "Sellos de juntas", "Contratista Tres", 36.0, 37.0, 1000, "Pista 1", "Poniente", "Linderos", "Diurno",
         dt.time(7, 0), dt.time(18, 0), "Segregación alternada", "Persona C"],
        ["ASS", "martes", d1, "Rutinario", 3, 44, "Mediana", "Oriente - Poniente", "ASS", None,
         "ASS", d1, "Rutinario", "Contratista Uno", 3, 44, 1000, "Mediana", "Oriente - Poniente", "ASS", "Diurno",
         dt.time(7, 0), dt.time(18, 0), None, "Persona A"],
    ]
    return make_workbook(night, day)


@pytest.fixture
def incidents_fixture():
    return json.loads((FIX / "incidents_corridor.json").read_text(encoding="utf-8"))["incidents"]


class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._d = status, data

    def json(self):
        return self._d


class FakeSession:
    """Simula la API de TomTom sin red."""

    def __init__(self, incidents=None, speed=lambda lat, lon: (100, 110), status=200):
        self.incidents, self.speed, self.status = incidents or [], speed, status
        self.headers, self.calls = {}, []

    def get(self, url, params=None, timeout=None):
        self.calls.append(url)
        if self.status != 200:
            return FakeResp(self.status, {})
        if "incidentDetails" in url:
            bb = [float(x) for x in params["bbox"].split(",")]
            inside = [i for i in self.incidents if bb[0] <= i["geometry"]["coordinates"][0][0] <= bb[2] and bb[1] <= i["geometry"]["coordinates"][0][1] <= bb[3]]
            return FakeResp(200, {"incidents": inside})
        lat, lon = (float(x) for x in params["point"].split(","))
        cur, free = self.speed(lat, lon)
        return FakeResp(200, {"flowSegmentData": {"frc": "FRC0", "currentSpeed": cur, "freeFlowSpeed": free, "currentTravelTime": 100,
                                                  "freeFlowTravelTime": 90, "confidence": 0.95, "roadClosure": False,
                                                  "coordinates": {"coordinate": [{"latitude": lat + 0.002, "longitude": lon}, {"latitude": lat - 0.002, "longitude": lon}]}}})


@pytest.fixture
def fake_session():
    return FakeSession
