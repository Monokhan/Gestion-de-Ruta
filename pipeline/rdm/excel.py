"""Lectura del Excel de intervención diaria (hojas NOCHE y DÍA).

Replica la lógica del visor original (detección de encabezados por texto) y
normaliza fechas a ISO (AAAA-MM-DD) y horas a HH:MM.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import re
import unicodedata
from typing import Any

from openpyxl import load_workbook

KM_MIN, KM_MAX = 0.0, 219.5
NEED = ["TIPO DE TRABAJOS", "CONTRATISTA", "KM INICIAL", "HORA INICIO", "RESPONSABLE"]
WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def norm(v: Any) -> str:
    s = "" if v is None else str(v)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.strip().upper()


def clean(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).replace("_x000D_", "").strip()


def num(v: Any) -> float:
    """Convierte PK en distintos formatos: 54.2 · '54,2' · '54+200' · 'km 54.2'."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v or "").strip().upper().replace("KM", "").replace(" ", "")
    m = re.match(r"^(-?\d+(?:[.,]\d+)?)\+(\d{1,3})", s)
    if m:
        return float(m.group(1).replace(",", ".")) + float(m.group(2).ljust(3, "0")) / 1000
    s = re.sub(r"[^0-9.\-]", "", s.replace(",", "."))
    parts = s.split(".")
    if len(parts) > 2:
        s = parts[0] + "." + "".join(parts[1:])
    try:
        return float(s)
    except ValueError:
        return float("nan")


def fmt_hora(v: Any) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, dt.datetime):
        return f"{v.hour:02d}:{v.minute:02d}"
    if isinstance(v, dt.time):
        return f"{v.hour:02d}:{v.minute:02d}"
    if isinstance(v, (int, float)):
        tm = round(((v % 1) + 1) % 1 * 24 * 60)
        return f"{(tm // 60) % 24:02d}:{tm % 60:02d}"
    m = re.search(r"(\d{1,2}):(\d{2})", str(v))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else str(v).strip()


def to_iso(v: Any) -> str:
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (int, float)) and 20000 < v < 80000:
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(v))).isoformat()
    s = clean(v)
    m = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 100 else y
        try:
            return dt.date(y, mo, d).isoformat()
        except ValueError:
            return ""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else ""


def route_of(v: Any) -> str:
    s = norm(v)
    return "ASS" if ("ASS" in s or "ACCESO SUR" in s or "TUNEL" in s) else "R5"


def find_header(rows: list[list], need=NEED) -> int | None:
    for i, r in enumerate(rows[:14]):
        line = "|".join(norm(c) for c in r)
        if all(n in line for n in need):
            return i
    return None


def map_headers(row: list, prefer_from: int = 0) -> dict:
    cols: dict[str, int] = {}
    for i, v in enumerate(row):
        h = norm(v)
        if not h or i < prefer_from:
            continue
        if "RUTA" in h:
            cols.setdefault("ruta", i)
        elif "FECHA" in h:
            cols.setdefault("fecha", i)
        elif "RESPONSABLE" in h:
            cols["responsable"] = i
        elif "TIPO DE TRABAJOS" in h or h == "ACTIVIDAD":
            cols.setdefault("trabajo", i)
        elif "CONTRATISTA" in h:
            cols["contratista"] = i
        elif "KM INICIAL" in h:
            cols.setdefault("kmInicial", i)
        elif "KM FINAL" in h:
            cols.setdefault("kmFinal", i)
        elif "LONGITUD" in h:
            cols["longitud"] = i
        elif "PISTA" in h:
            cols.setdefault("pistas", i)
        elif "CALZADA" in h:
            cols["calzada"] = i
        elif "SECTOR" in h:
            cols["sector"] = i
        elif "HORARIO" in h:
            cols["horario"] = i
        elif "HORA INICIO" in h:
            cols["horaInicio"] = i
        elif "HORA FINAL" in h:
            cols["horaFinal"] = i
        elif "OBSERVACION" in h:
            cols["observacion"] = i
    return cols


def _cell(r: list, i: int | None) -> Any:
    return r[i] if i is not None and i < len(r) else None


def _unnamed_observation(header: list, rows: list[list], cols: dict) -> int | None:
    """Columna sin encabezado a la derecha de la tabla con datos → observación (caso hoja NOCHE)."""
    if "observacion" in cols or not cols:
        return None
    last = max(cols.values())
    for i in range(last + 1, max((len(r) for r in rows), default=0)):
        if (i >= len(header) or not norm(header[i])) and any(clean(_cell(r, i)) for r in rows):
            return i
    return None


def work_id(w: dict) -> str:
    key = "|".join(str(w.get(k, "")) for k in ("tipo", "fecha", "route", "trabajo", "kmInicial", "kmFinal", "horaInicio", "pistas"))
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def _work(tipo: str, r: list, c: dict, ruta_val: Any, fecha_val: Any) -> dict | None:
    trabajo = clean(_cell(r, c.get("trabajo")))
    if not trabajo:
        return None
    k1, k2 = num(_cell(r, c.get("kmInicial"))), num(_cell(r, c.get("kmFinal")))
    if k1 != k1 and k2 != k2:  # ambos NaN
        return None
    if k1 != k1:
        k1 = k2
    if k2 != k2:
        k2 = k1
    km = (k1 + k2) / 2
    if not (KM_MIN <= km <= KM_MAX):
        return None
    ruta = clean(ruta_val)
    fecha = to_iso(fecha_val)
    w = {
        "tipo": tipo,
        "fecha": fecha,
        "dia": WEEKDAYS[dt.date.fromisoformat(fecha).weekday()] if fecha else "",
        "ruta": ruta,
        "route": route_of(ruta),
        "trabajo": trabajo,
        "responsable": clean(_cell(r, c.get("responsable"))),
        "contratista": clean(_cell(r, c.get("contratista"))),
        "kmInicial": round(k1, 3),
        "kmFinal": round(k2, 3),
        "km": round(km, 3),
        "longitud": clean(_cell(r, c.get("longitud"))),
        "pistas": clean(_cell(r, c.get("pistas"))),
        "calzada": clean(_cell(r, c.get("calzada"))),
        "sector": clean(_cell(r, c.get("sector"))),
        "horario": clean(_cell(r, c.get("horario"))) or ("Nocturno" if tipo == "Noche" else "Diurno"),
        "horaInicio": fmt_hora(_cell(r, c.get("horaInicio"))),
        "horaFinal": fmt_hora(_cell(r, c.get("horaFinal"))),
        "observacion": clean(_cell(r, c.get("observacion"))),
    }
    w["id"] = work_id(w)
    return w


def _rows(ws) -> list[list]:
    out = []
    for r in ws.iter_rows(values_only=True):
        if any(c is not None and str(c).strip() != "" for c in r):
            out.append(list(r))
    return out


def parse_workbook(source: bytes | str) -> dict:
    """Devuelve {'works': [...], 'diag': [...]} desde el Excel de intervención diaria."""
    wb = load_workbook(io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source, data_only=True, read_only=True)
    names = {norm(n): n for n in wb.sheetnames}
    works: list[dict] = []
    diag: list[str] = []

    if "NOCHE" in names:
        rows = _rows(wb[names["NOCHE"]])
        h = find_header(rows)
        if h is not None:
            cols = map_headers(rows[h])
            data = rows[h + 1:]
            obs = _unnamed_observation(rows[h], data, cols)
            if obs is not None:
                cols["observacion"] = obs
        else:  # posiciones del formato histórico
            cols = {"ruta": 1, "responsable": 3, "trabajo": 4, "contratista": 5, "kmInicial": 6, "kmFinal": 7, "longitud": 8,
                    "pistas": 9, "calzada": 10, "sector": 11, "horario": 12, "horaInicio": 13, "horaFinal": 14, "fecha": 15, "observacion": 16}
            data = rows[4:]
        n = 0
        for r in data:
            w = _work("Noche", r, cols, _cell(r, cols.get("ruta")), _cell(r, cols.get("fecha")))
            if w:
                works.append(w)
                n += 1
        diag.append(f"NOCHE: {n} trabajos")
    else:
        diag.append("No se encontró hoja NOCHE")

    if "DIA" in names:
        rows = _rows(wb[names["DIA"]])
        h = find_header(rows)
        if h is not None:
            panel = map_headers(rows[h], 0)
            det = map_headers(rows[h], 11)
            cols = {**det, "rutaPanel": panel.get("ruta"), "fechaPanel": panel.get("fecha")}
            data = rows[h + 1:]
        else:
            cols = {"rutaPanel": 1, "fechaPanel": 2, "ruta": 1, "fecha": 2, "trabajo": 4, "kmInicial": 5, "kmFinal": 6,
                    "pistas": 7, "calzada": 8, "sector": 9}
            data = rows[4:]
        n = 0
        for r in data:
            ruta = _cell(r, cols.get("rutaPanel")) or _cell(r, cols.get("ruta"))
            fecha = _cell(r, cols.get("fecha"))
            if not to_iso(fecha):
                fecha = _cell(r, cols.get("fechaPanel"))
            w = _work("Día", r, cols, ruta, fecha)
            if w:
                works.append(w)
                n += 1
        diag.append(f"DÍA: {n} trabajos")
    else:
        diag.append("No se encontró hoja DÍA")

    wb.close()
    return {"works": works, "diag": diag}
