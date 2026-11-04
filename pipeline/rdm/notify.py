"""Alertas por correo (Gmail SMTP) para incidentes nuevos de alta severidad."""
from __future__ import annotations

import html
import smtplib
from email.message import EmailMessage

SEV_COLOR = {"alta": "#dc2626", "media": "#f59e0b", "baja": "#64748b"}


def build_message(alerts: list[dict], sender: str, to: list[str], site_url: str = "") -> EmailMessage:
    n = len(alerts)
    top = alerts[0]
    subject = f"[Ruta del Maipo] {top['icon']} {top['category_name']} {top['route']} km {top['km']:.1f}" + (f" (+{n - 1} más)" if n > 1 else "")
    rows = []
    for a in alerts:
        link = f"{site_url.rstrip('/')}/#inc={html.escape(a['id'] or '')}" if site_url else ""
        works = ", ".join(w["trabajo"] for w in a.get("related_works", [])[:3])
        rows.append(
            f"<tr><td style='padding:8px;border-bottom:1px solid #e5e7eb'><span style='color:{SEV_COLOR[a['severity']]};font-weight:700'>"
            f"{html.escape(a['severity'].upper())}</span></td>"
            f"<td style='padding:8px;border-bottom:1px solid #e5e7eb'>{a['icon']} <b>{html.escape(a['category_name'])}</b><br>"
            f"<span style='color:#475569'>{html.escape(a.get('description') or '')}</span></td>"
            f"<td style='padding:8px;border-bottom:1px solid #e5e7eb'><b>{a['route']} km {a['km']:.1f}</b><br>{html.escape(a['sector'])}"
            f"<br><span style='color:#475569'>{html.escape(a['from'])} → {html.escape(a['to'])}</span></td>"
            f"<td style='padding:8px;border-bottom:1px solid #e5e7eb'>{(a.get('delay_s') or 0) // 60} min</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e5e7eb'>{html.escape(works) or '—'}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e5e7eb'>{f'<a href={chr(34)}{link}{chr(34)}>Ver</a>' if link else ''}</td></tr>"
        )
    body = (
        "<div style='font-family:Segoe UI,Arial,sans-serif;color:#0f172a'>"
        "<h2 style='color:#0b2f78;margin:0 0 4px'>Gestión de Ruta · Alerta de tránsito</h2>"
        f"<p style='margin:0 0 14px;color:#475569'>{n} incidente(s) nuevo(s) en la concesión detectados por TomTom.</p>"
        "<table style='border-collapse:collapse;font-size:13px;width:100%'><tr style='background:#0b2f78;color:#fff'>"
        "<th style='padding:8px;text-align:left'>Severidad</th><th style='padding:8px;text-align:left'>Incidente</th>"
        "<th style='padding:8px;text-align:left'>Ubicación</th><th style='padding:8px;text-align:left'>Demora</th>"
        "<th style='padding:8px;text-align:left'>Trabajos programados en el tramo</th><th></th></tr>"
        + "".join(rows)
        + "</table><p style='color:#94a3b8;font-size:11px;margin-top:14px'>Fuente: TomTom Traffic Incidents. "
        "Mensaje automático del pipeline Gestión de Ruta.</p></div>"
    )
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    msg.set_content("Incidentes nuevos en la concesión:\n" + "\n".join(
        f"- [{a['severity']}] {a['category_name']} {a['route']} km {a['km']:.1f} ({a['sector']}): {a.get('description') or ''}" for a in alerts))
    msg.add_alternative(body, subtype="html")
    return msg


def send(alerts: list[dict], user: str, password: str, to: list[str], site_url: str = "") -> bool:
    if not (alerts and user and password and to):
        return False
    msg = build_message(alerts, user, to, site_url)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
        s.login(user, password)
        s.send_message(msg)
    return True
