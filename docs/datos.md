# Modelo de datos (rama `data`)

Todo el histórico vive en la rama `data` del repositorio, separada del código. Cada corrida con cambios es un commit.
El sitio publica una copia de los archivos marcados como *público*.

```
raw/AAAA/MM/<fecha>_<sha8>_<archivo>.xlsx   adjuntos originales                       público*
ingest/log.json                              archivos procesados (sin message_id)      público
works/history/AAAA/AAAA-MM-DD.json           trabajos por fecha de intervención        público
works/index.json                             resumen por fecha                         público
works/current.json                           set que abre la app                       público
incidents/live.json                          incidentes vigentes clasificados          público
incidents/history/AAAA-MM.json               todos los incidentes del mes              público
incidents/history/index.json                 resumen por mes                           público
incidents/active.json                        id → mes (interno)
traffic/live.json                            última medición de flujo                  público
traffic/history/AAAA-MM.csv                  todas las mediciones del mes              público
traffic/history/index.json                   meses disponibles                         público
state.json                                   últimas corridas, cuotas, errores (interno)
```

\* `raw/` no se copia al sitio, pero la rama `data` es pública si el repositorio lo es.

## Trabajos

`works/history/2026/2026-11-03.json`

```json
{
  "date": "2026-11-03",
  "updated_at": "2026-11-02T18:20:11-03:00",
  "source": {"filename": "Intervención diaria 03-11-2026 rev02.xlsx", "received": "2026-11-02T18:05:00-03:00",
             "subject": "…", "sender": "…", "via": "correo", "sha256": "…"},
  "revisions": [{"filename": "… rev01.xlsx", "received": "2026-11-02T17:40:00-03:00", "…": "…"}],
  "works": [{
    "id": "9f1c2a7b3d4e", "tipo": "Noche", "fecha": "2026-11-03", "dia": "martes",
    "ruta": "R5", "route": "R5", "trabajo": "Reparación de junta", "responsable": "…", "contratista": "…",
    "kmInicial": 40.2, "kmFinal": 40.5, "km": 40.35, "longitud": "300", "pistas": "C.S", "calzada": "Oriente - Poniente",
    "sector": "Paine", "horario": "Nocturno", "horaInicio": "20:00", "horaFinal": "06:00", "observacion": ""
  }]
}
```

Reglas:
- Un Excel puede traer varias fechas: cada fecha se guarda por separado.
- Para una fecha manda el archivo **recibido más tarde**; uno más antiguo queda solo en `revisions`.
- Archivos idénticos (mismo SHA‑256) se ignoran.
- `id` = hash estable de tipo, fecha, ruta, trabajo, km y pista: permite seguir un trabajo entre revisiones.
- `current.json`: fechas entre hoy −1 y hoy +7 (`works.current_window_*`); si no hay, el último archivo recibido.

## Incidentes

`incidents/history/2026-11.json → incidents[<id>]`

| Campo | Descripción |
|---|---|
| `id` | id TomTom |
| `category`, `category_name`, `icon` | tipo (0–14) |
| `magnitude`, `delay_s`, `length_m` | magnitud de demora, demora en segundos, largo |
| `description`, `from`, `to` | texto TomTom |
| `route`, `km`, `km_from`, `km_to`, `sector` | ubicación en PK de la concesión |
| `relation`, `dist_m` | `ruta` / `entorno` y distancia al eje |
| `severity` | `alta` / `media` / `baja` |
| `geometry` | polilínea simplificada `[[lat,lon],…]` |
| `related_works` | trabajos programados del día en el mismo tramo |
| `start`, `first_seen`, `last_seen`, `cleared_at`, `active` | ciclo de vida |
| `notified` | si ya se envió por correo |

La duración del histórico = `cleared_at − first_seen` (resolución = frecuencia de consulta).

## Tráfico

`traffic/history/2026-11.csv`

```
timestamp,route,km,dir,current_kmh,free_kmh,ratio,confidence,closed,frc
2026-11-03T08:00:12-03:00,R5,50,S,62,100,0.62,0.95,0,FRC0
```

`ratio` = velocidad actual / velocidad libre. `dir`: `S` (calzada sur) o `N` (calzada norte).

## Tamaño esperado

≈ 0,7 MB/mes de CSV de tráfico, ≈ 0,3 MB/mes de incidentes, ≈ 50 KB por Excel. Unos 15 MB/año: holgado para Git.
