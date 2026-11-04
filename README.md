# Gestión de Ruta · Ruta del Maipo

Visor operativo de la concesión **Santiago – Talca** (Acceso Sur a Santiago + Ruta 5 Sur): mapa satelital con los
trabajos programados, flujo de tráfico animado por calzada, **incidentes y accidentes en tiempo real con alertas**,
clima, caudales de ríos e **histórico** de todo lo anterior.

Funciona solo con GitHub: un workflow programado lee el correo con el programa de trabajos, consulta TomTom,
guarda el histórico en la rama `data`, envía alertas por correo y publica el sitio en GitHub Pages.

```
 Gmail (Excel adjunto) ─┐
 TomTom Incidents  ─────┼─► GitHub Actions (cada 20 min) ─► rama data (histórico) ─► GitHub Pages (app)
 TomTom Flow  ──────────┘            │                                                 ▲
                                     └─► correo de alerta (incidente grave en ruta)    │
 Open‑Meteo (clima) · GloFAS (caudales) ───────────── consultados por el navegador ─────┘
```

## Qué hace

| Módulo | Detalle |
|---|---|
| **Trabajos** | Lee cada correo nuevo con el Excel *Intervención diaria* (hojas NOCHE y DÍA), lo versiona por fecha y muestra los trabajos vigentes. Filtro por fecha y búsqueda. Una revisión más nueva (rev02) reemplaza a la anterior; una más antigua nunca la pisa. |
| **Incidentes** | TomTom Incident Details sobre dos zonas del corredor. Cada incidente se proyecta al eje y se clasifica **en la ruta** (≤ 80 m) o **entorno** (≤ 400 m), con km, sector, severidad (alta/media/baja) y los trabajos programados en el mismo tramo. |
| **Alertas** | En la app: insignia, centro de alertas, avisos emergentes, sonido y notificaciones del sistema (opcionales, por navegador). Por correo: cada incidente nuevo de severidad ≥ `alta` en la ruta, con enlace directo al mapa. |
| **Tráfico** | 48 puntos (cada 10 km, ambos sentidos) cada 2 h. Velocidad actual vs. libre, cierres. Se dibuja como flujo animado por calzada. |
| **Histórico** | Trabajos por día (gráfico, contratistas, versiones; clic para verlos en el mapa), incidentes por mes (por tramo, por tipo, duración) y tráfico por mes (perfil horario, tramos más lentos). |
| **Clima y ríos** | Open‑Meteo y GloFAS, consultados directo desde el navegador (sin key). |

## Puesta en marcha (≈ 15 min)

Paso a paso detallado en [`docs/instalacion.md`](docs/instalacion.md). Resumen:

1. **Crear el repositorio** en GitHub (público para Pages en plan gratuito) y subir el contenido de esta carpeta a `main`.
2. **Secrets** → *Settings › Secrets and variables › Actions › New repository secret*:
   - `TOMTOM_API_KEY` — key de developer.tomtom.com
   - `GMAIL_USER` — cuenta que recibe el correo con el Excel
   - `GMAIL_APP_PASSWORD` — contraseña de aplicación de 16 caracteres (requiere verificación en 2 pasos)
   - `ALERT_TO` — destinatarios de alertas, separados por coma
3. **Variable** (pestaña *Variables*): `SITE_URL` = `https://<usuario>.github.io/<repo>/`
4. **Pages** → *Settings › Pages › Source: GitHub Actions*.
5. **Primera corrida** → *Actions › Operación › Run workflow* (marcar *Forzar*). Crea la rama `data` y publica el sitio.
6. Ajustar filtros del correo en [`config.yml`](config.yml) (`subject_contains`, `from_contains`).

## Probar localmente sin credenciales

```bash
pip install -r pipeline/requirements-dev.txt
export PYTHONPATH=pipeline
python scripts/demo_data.py --out demo_datos          # datos sintéticos (marcados DEMO en la app)
python -m rdm --data demo_datos build-site --out _site
python -m http.server -d _site 8000                   # abrir http://localhost:8000
python -m pytest -q pipeline/tests
```

Con credenciales reales: `set -a; source .env; set +a` y luego `python -m rdm --data datos run`.
Carga manual de un Excel al histórico: `python -m rdm --data datos ingest "archivo.xlsx"`.

## Estructura

```
app/                     sitio estático (sin build): index.html, assets/, vendor/ (Leaflet, SheetJS)
  data/static/           geometría de la ruta calibrada a PK, ríos y sectores
  assets/js/config.js    rutas de datos y frecuencia de recarga (editable)
pipeline/rdm/            pipeline Python (correo, Excel, TomTom, histórico, alertas, sitio)
pipeline/tests/          pruebas (pytest) con Excel sintético y muestra real de incidentes
scripts/demo_data.py     datos de demostración
config.yml               configuración operativa (sin secretos)
.github/workflows/       operacion.yml (programado) · ci.yml (pruebas)
docs/                    arquitectura, instalación, operación, datos, alertas, decisiones (ADR)
```

## Cuotas (plan gratuito TomTom)

| API | Uso configurado | Límite gratuito |
|---|---|---|
| Incident Details | 2 consultas cada 40 min ≈ 2.230/mes | 2.500/mes |
| Flow Segment Data | 48 consultas cada 2 h ≈ 17.900/mes | 20.000/mes |
| Mosaicos de mapa/tráfico | solo si un usuario ingresa su propia key en el navegador | 200.000/mes |

El pipeline lleva la cuenta mensual (`state.json` y panel *Datos*) y se detiene antes de superar los topes de `config.yml`.

## Seguridad y privacidad

- Las credenciales **solo** existen como GitHub Secrets; el pipeline las enmascara en logs y errores. Nada de esto queda en el sitio.
- **El sitio y la rama `data` son públicos**: trabajos, responsables, contratistas y los Excel originales recibidos (`raw/`) quedan visibles para cualquiera con el enlace. Si eso cambia, ver *Privacidad* en [`docs/operacion.md`](docs/operacion.md).
- La key de TomTom compartida por chat debe **rotarse** y restringirse en el portal de TomTom.

## Documentación

[Arquitectura](docs/arquitectura.md) · [Instalación](docs/instalacion.md) · [Operación](docs/operacion.md) ·
[Modelo de datos](docs/datos.md) · [Alertas](docs/alertas.md) · [Decisiones](docs/adr/) · [Cambios](CHANGELOG.md)
