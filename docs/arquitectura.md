# Arquitectura

## Principios

- **Sin servidores propios.** Todo corre en GitHub Actions (cómputo programado) y GitHub Pages (sitio estático).
- **Los secretos nunca llegan al navegador.** El pipeline consulta TomTom y Gmail; el sitio solo lee JSON publicados.
- **Histórico versionado.** Cada corrida que cambia datos es un commit en la rama `data`: auditable y recuperable.
- **Degradación elegante.** Si falla una fuente se conserva el último dato válido y se informa en el panel *Datos*.

## Componentes

```
.github/workflows/operacion.yml      cron */20 · workflow_dispatch · push(main)
 └─ python -m rdm run
     ├─ mailbox.py   IMAP Gmail (X-GM-RAW) → adjuntos .xlsx
     ├─ excel.py     parser NOCHE / DÍA (mismo criterio que el visor)
     ├─ store.py     raw/ + works/history/AAAA/fecha.json + índice + current.json
     ├─ tomtom.py    cliente con reintentos (Flow v4, Incident Details v5)
     ├─ incidents.py proyección al eje, severidad, histórico mensual, alertables
     ├─ traffic.py   48 puntos por sentido, CSV mensual
     ├─ notify.py    correo HTML de alerta (SMTP Gmail)
     └─ site.py      app/ + datos públicos → _site/ (+ manifest.json)
 └─ commit/push rama data → upload-pages-artifact → deploy-pages
```

La app (`app/`) es HTML + JS sin build: Leaflet sobre Esri World Imagery, capa canvas de flujo animado, y paneles
de alertas, histórico, datos, trabajos, tiempo real, bitácora y clima.

## Frecuencias

El cron corre cada 20 min; cada módulo decide si le toca según `config.yml` y la hora de su última ejecución
(`state.json`, tolerancia de 6 min por la imprecisión del cron de GitHub):

| Módulo | Frecuencia | Motivo |
|---|---|---|
| Correo | cada corrida | barato; el programa llega a cualquier hora |
| Incidentes | 40 min | cuota 2.500/mes con 2 zonas |
| Flujo | 120 min | cuota 20.000/mes con 48 puntos |
| App (navegador) | recarga JSON cada 5 min | `config.js › refreshMinutes` |

GitHub no garantiza la hora exacta del cron: en horas de alta demanda puede retrasarse varios minutos.

## Geometría y PK

`app/data/static/route.json` contiene el eje de la R5 (sentido sur), el ASS y las calzadas norte, muestreados a
PK calibrado (Puente Maipo km 29,1 · Peaje Angostura km 54,0 · empalme ASS km 46,59). Los PK de R5 < 29,4 se ubican
sobre el ASS. El pipeline (`geo.py`) y la app usan la misma geometría.

## Clasificación de incidentes

1. Se consultan las dos zonas (cada una ≤ 10.000 km², límite de TomTom) con `timeValidityFilter=present`.
2. Cada punto de la geometría del incidente se proyecta al eje más cercano.
3. Distancia mínima ≤ `on_route_m` → **ruta**; ≤ `nearby_m` → **entorno**; si no, se descarta (calles urbanas, otras rutas).
4. Severidad (detalle en [`alertas.md`](alertas.md)): accidente, vía cerrada e inundación → alta; congestión según magnitud y demora; en el *entorno* baja un nivel.
5. Se cruzan con los trabajos del día por solapamiento de km (± 0,5 km).

## Decisiones

Ver [`docs/adr/`](adr/).
