import datetime as dt
from email.message import EmailMessage

from rdm import incidents, notify, site, traffic
from rdm.excel import fmt_hora, num, parse_workbook, to_iso
from rdm.mailbox import matches, parse_message
from rdm.store import read_json
from rdm.tomtom import TomTom

NOW = dt.datetime(2026, 11, 4, 0, 30, tzinfo=dt.timezone.utc)


# ---------------------------------------------------------------- excel
def test_num_formats():
    assert num("54+200") == 54.2
    assert num("km 54,2") == 54.2
    assert num(17.498) == 17.498
    assert num("") != num("")  # NaN


def test_dates_and_hours():
    assert to_iso(dt.datetime(2026, 6, 27)) == "2026-06-27"
    assert to_iso("27/06/2026") == "2026-06-27"
    assert to_iso(46200) == "2026-06-27"
    assert fmt_hora(dt.time(20, 0)) == "20:00"
    assert fmt_hora(0.25) == "06:00"


def test_parse_workbook(workbook_bytes):
    r = parse_workbook(workbook_bytes)
    assert r["diag"] == ["NOCHE: 2 trabajos", "DÍA: 2 trabajos"]
    n = [w for w in r["works"] if w["tipo"] == "Noche"]
    d = [w for w in r["works"] if w["tipo"] == "Día"]
    assert n[0]["fecha"] == "2026-11-03" and n[0]["dia"] == "martes"
    assert n[0]["observacion"] == "P.I. Los Morros"  # columna sin encabezado
    assert d[0]["contratista"] == "Contratista Tres" and d[0]["responsable"] == "Persona C"
    assert d[1]["route"] == "ASS" and d[1]["kmFinal"] == 44
    assert len({w["id"] for w in r["works"]}) == 4


# ---------------------------------------------------------------- geo
def test_geo_calibration(route):
    p = route.project(-33.9076, -70.7311)  # Peaje Angostura (OSM)
    assert p["route"] == "R5" and abs(p["km"] - 54.0) < 0.3 and p["dist_m"] < 40
    assert route.place("R5", 17.5) == ("ASS", 17.5)
    assert route.sector("R5", 139.9) == "San Fernando"


# ---------------------------------------------------------------- store
def test_ingest_and_revisions(store, workbook_bytes):
    meta = {"filename": "Intervención diaria rev01.xlsx", "received": "2026-11-02T18:00:00-03:00", "subject": "Intervención diaria", "message_id": "<a@x>"}
    r = store.ingest_workbook(workbook_bytes, meta)
    assert r["status"] == "ok" and r["updated_dates"] == ["2026-11-03"]
    assert store.ingest_workbook(workbook_bytes, meta)["status"] == "duplicado"
    # una revisión más antigua no pisa la vigente
    older = workbook_bytes + b"\x00"
    r2 = store.ingest_workbook(older, {**meta, "received": "2026-11-01T10:00:00-03:00", "message_id": "<b@x>"})
    assert r2["skipped_dates"] == ["2026-11-03"]
    idx = read_json(store.p("works", "index.json"))
    assert idx["dates"]["2026-11-03"]["n"] == 4
    cur = store.rebuild_current(9999, 9999)
    assert len(cur["works"]) == 4
    assert store.processed_message_ids() == {"<a@x>", "<b@x>"}


# ---------------------------------------------------------------- incidentes
def test_classify_real_sample(route, cfg, incidents_fixture):
    res = [incidents.classify(i, route, cfg, [], NOW) for i in incidents_fixture]
    kept = [x for x in res if x]
    jam = next(x for x in kept if x["from"].startswith("exit"))
    assert jam["route"] == "R5" and 35 < jam["km"] < 38 and jam["relation"] == "ruta" and jam["severity"] == "alta"
    queue = next(x for x in kept if x["description"] == "Tráfico en cola")
    assert 60 < queue["km"] < 64 and queue["severity"] == "media"
    assert not any(x["from"] == "Calle Purisima" for x in kept)  # calle urbana lejana


def test_incidents_run_history_and_alerts(store, route, cfg, incidents_fixture, fake_session):
    tt = TomTom("k", session=fake_session(incidents=incidents_fixture))
    works = [{"id": "w1", "trabajo": "Sellos", "tipo": "Día", "fecha": "2026-11-03", "route": "R5", "km": 36.5, "kmInicial": 36.0, "kmFinal": 37.0}]
    r1 = incidents.run(store, route, tt, cfg, works)
    assert r1["new"] and r1["live"]["incidents"][0]["severity"] == "alta"
    assert r1["live"]["incidents"][0]["related_works"][0]["id"] == "w1"
    al = incidents.alertable(r1["new"], cfg)
    assert [a["severity"] for a in al] == ["alta"]
    msg = notify.build_message(al, "ops@x.cl", ["a@x.cl"], "https://example.org/app/")
    assert "R5 km 36" in msg["Subject"]
    # segunda corrida: sin nuevos; tercera sin incidentes → se cierran
    assert incidents.run(store, route, tt, cfg, works)["new"] == []
    tt2 = TomTom("k", session=fake_session(incidents=[]))
    incidents.run(store, route, tt2, cfg, works)
    month = read_json(store.p("incidents", "history", f"{r1['live']['generated_at'][:7]}.json"))
    assert all(not i["active"] and i.get("cleared_at") for i in month["incidents"].values())
    assert read_json(store.p("incidents", "history", "index.json"))["months"]


# ---------------------------------------------------------------- tráfico
def test_sample_points(route):
    pts = traffic.sample_points(route, 10, "both")
    assert len(pts) == 48 and {p["dir"] for p in pts} == {"S", "N"}


def test_traffic_run(store, route, cfg, fake_session):
    tt = TomTom("k", session=fake_session(speed=lambda la, lo: (40, 100) if la > -33.8 else (100, 100)))
    live = traffic.run(store, route, tt, cfg)
    assert live["segments"] and any(s["ratio"] == 0.4 for s in live["segments"])
    rows = traffic.load_history(store.p("traffic", "history", f"{live['generated_at'][:7]}.csv"))
    assert len(rows) == len(live["segments"])
    idx = read_json(store.p("traffic", "history", "index.json"))
    assert idx["months"][live["generated_at"][:7]]["rows"] == len(rows)


def test_tomtom_error_redaction(fake_session):
    from rdm.config import Secrets

    tt = TomTom("SECRETKEY123", session=fake_session(status=403))
    try:
        tt.incidents([0, 0, 1, 1])
    except Exception as e:  # noqa: BLE001
        assert "SECRETKEY123" not in Secrets({"TOMTOM_API_KEY": "SECRETKEY123"}).redact(str(e))
        assert getattr(e, "status", None) == 403


# ---------------------------------------------------------------- correo
def test_parse_message(workbook_bytes, cfg):
    m = EmailMessage()
    m["Subject"] = "Intervención diaria 03-11-2026 rev01"
    m["From"] = "Operaciones <ops@rutadelmaipo.cl>"
    m["Date"] = "Mon, 02 Nov 2026 18:00:00 -0300"
    m["Message-ID"] = "<x1@mail>"
    m.set_content("Adjunto programa")
    m.add_attachment(workbook_bytes, maintype="application", subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     filename="Intervención diaria 03-11-2026.xlsx")
    meta = parse_message(m.as_bytes())
    assert meta["received"].startswith("2026-11-02T18:00") and meta["attachments"][0]["content"] == workbook_bytes
    assert matches(meta, cfg["mail"])
    assert not matches({**meta, "subject": "Otro asunto"}, cfg["mail"])


# ---------------------------------------------------------------- sitio
def test_build_site(tmp_path, store, workbook_bytes):
    from pathlib import Path

    store.ingest_workbook(workbook_bytes, {"filename": "a.xlsx", "received": "2026-11-02T18:00:00-03:00", "message_id": "<m>"})
    store.rebuild_current(9999, 9999)
    app = Path(__file__).resolve().parents[2] / "app"
    out = site.build(app, store.dir, tmp_path / "_site")
    assert (out / "index.html").exists() and (out / "data" / "works" / "current.json").exists()
    assert "raw" not in read_json(out / "data" / "ingest" / "log.json")[0]
    assert (out / "data" / "manifest.json").exists()


# ---------------------------------------------------------------- cli
def test_cli_run_without_secrets(tmp_path, monkeypatch):
    """Sin secretos la corrida no falla: omite correo y TomTom y deja estado."""
    from pathlib import Path

    from rdm.cli import main

    for k in ("TOMTOM_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "ALERT_TO"):
        monkeypatch.delenv(k, raising=False)
    assert main(["--data", str(tmp_path / "d"), "run"]) == 0
    st = read_json(tmp_path / "d" / "state.json")
    assert st["last"]["run"]
    app = Path(__file__).resolve().parents[2] / "app"
    assert main(["--data", str(tmp_path / "d"), "build-site", "--app", str(app), "--out", str(tmp_path / "s")]) == 0
    assert (tmp_path / "s" / "data" / "manifest.json").exists()
