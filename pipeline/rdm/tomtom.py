"""Cliente mínimo de TomTom (Traffic Flow Segment Data v4 e Incident Details v5)."""
from __future__ import annotations

import time

import requests

BASE = "https://api.tomtom.com"
INCIDENT_FIELDS = (
    "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,"
    "events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,"
    "timeValidity,probabilityOfOccurrence,lastReportTime}}}"
)


class TomTomError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"TomTom {status}: {message}")
        self.status = status


class TomTom:
    def __init__(self, key: str, session: requests.Session | None = None, timeout: int = 20):
        if not key:
            raise ValueError("Falta TOMTOM_API_KEY")
        self.key = key
        self.s = session or requests.Session()
        self.s.headers.update({"User-Agent": "gestion-ruta-maipo/1.0"})
        self.timeout = timeout
        self.requests = 0

    def _get(self, path: str, params: dict) -> dict:
        params = {**params, "key": self.key}
        last = None
        for attempt in range(3):
            self.requests += 1
            try:
                r = self.s.get(BASE + path, params=params, timeout=self.timeout)
            except requests.RequestException as e:  # red
                last = TomTomError(0, type(e).__name__)
                time.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code == 200:
                return r.json()
            msg = {400: "solicitud inválida", 403: "API key inválida o sin permiso", 429: "límite de consultas alcanzado"}.get(r.status_code, "error")
            last = TomTomError(r.status_code, msg)
            if r.status_code in (400, 403):
                break
            time.sleep(2 * (attempt + 1))
        raise last

    def flow_segment(self, lat: float, lon: float, zoom: int = 12) -> dict:
        d = self._get(f"/traffic/services/4/flowSegmentData/absolute/{zoom}/json", {"point": f"{lat:.5f},{lon:.5f}", "unit": "KMPH"})
        return d.get("flowSegmentData", {})

    def incidents(self, bbox: list[float], language: str = "es-ES") -> list[dict]:
        d = self._get("/traffic/services/5/incidentDetails", {
            "bbox": ",".join(f"{v:.5f}" for v in bbox),
            "fields": INCIDENT_FIELDS,
            "language": language,
            "timeValidityFilter": "present",
        })
        return d.get("incidents", [])
