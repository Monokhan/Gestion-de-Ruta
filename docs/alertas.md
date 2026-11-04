# Alertas de incidentes y accidentes

## Origen

TomTom Traffic Incident Details v5, consultado por el pipeline cada 40 minutos (configurable) sobre dos zonas que
cubren la concesión completa. Cada corrida guarda `incidents/live.json` y actualiza el histórico mensual.

## Relación con la ruta

| Relación | Criterio (`config.yml › incidents`) | Uso |
|---|---|---|
| **ruta** | distancia al eje ≤ `on_route_m` (80 m) | alertas, insignia, avisos |
| **entorno** | ≤ `nearby_m` (400 m): caleteras, enlaces, accesos | visible con el filtro *Incluir entorno* |
| descartado | > 400 m | no se guarda |

## Severidad

| Tipo TomTom | Severidad base |
|---|---|
| Accidente · Vía cerrada · Inundación | **alta** |
| Congestión | **alta** si magnitud *mayor* o demora ≥ 10 min · **media** si magnitud *moderada* · **baja** en otro caso |
| Niebla · Condición peligrosa · Hielo · Pista cerrada · Viento · Vehículo detenido | **media** |
| Obras · Lluvia · Desconocido | **baja** |

Ajustes: una *vía cerrada* con más de 30 días activa pasa a **baja** (cierres permanentes de calles locales) y todo
incidente del **entorno** baja un nivel.

## Canales

### Correo (pipeline)
- Se envía cuando aparece un incidente **nuevo** con severidad ≥ `alerts.min_severity` (por defecto `alta`) en la
  **ruta** (`include_nearby: true` incluye el entorno).
- Un solo correo por corrida con todos los incidentes nuevos; cada uno con km, sector, tramo, demora, trabajos
  programados en el mismo tramo y enlace **Ver** que abre la app centrada en el incidente (`#inc=<id>`).
- Cada incidente se notifica una sola vez (`notified: true` en el histórico).
- Remitente: `GMAIL_USER`. Destinatarios: `ALERT_TO` (coma). Desactivar: `alerts.email_enabled: false`.

### App (navegador)
- **Insignia** en el botón 🚨 con los incidentes en ruta de severidad media o alta.
- **Centro de alertas**: incidentes agrupados por severidad + alertas de clima, ríos y tráfico; clic = ir al punto.
- **Aviso emergente** al detectar un incidente nuevo (media/alta en ruta); se recuerda cuáles ya se vieron.
- **Sonido** (solo severidad alta) y **notificaciones del sistema**: opcionales, se activan en el centro de alertas
  y quedan guardadas en ese navegador. Las notificaciones requieren que la pestaña esté abierta.
- En el detalle de un trabajo, los incidentes a ≤ 1 km y el estado sugerido pasa a *Confirmar con Centro de Control*
  si hay un incidente medio/alto a ≤ 2 km.

## Latencia esperada

TomTom publica el incidente → próxima consulta del pipeline (≤ 40 min + retraso del cron) → correo inmediato;
la app lo muestra en su siguiente recarga (≤ 5 min). Para alertas más rápidas, bajar `every_minutes` revisando la
cuota (ver *Cuotas* en el README).

## Limitaciones

- Cobertura y descripción dependen de TomTom (fuentes propias, flotas y reportes); no reemplaza los avisos del
  Centro de Control ni de Carabineros.
- `from`/`to` vienen como los entrega TomTom (a veces en inglés o con nombres de salida).
