# Operación

## Rutina

No requiere intervención: el workflow **Operación** corre cada 20 minutos. Para revisar el estado:

- **App › Datos**: hora de la última lectura de correo, incidentes, tráfico y publicación; consumo TomTom del mes;
  último error.
- **GitHub › Actions › Operación**: log de cada corrida (`[correo]`, `[incidentes]`, `[tráfico]`, `[alertas]`).

## Tareas frecuentes

| Necesidad | Cómo |
|---|---|
| Forzar actualización ahora | *Actions › Operación › Run workflow* (marcar *Forzar*) |
| Cambiar frecuencias, umbrales o filtros | editar `config.yml` en `main` (se publica solo) |
| Cambiar destinatarios de alertas | *Settings › Secrets › ALERT_TO* |
| Pausar todo | *Actions › Operación › ⋯ › Disable workflow* |
| Ver un trabajo de otra fecha | App › Histórico › Trabajos › clic en la barra o fila → *Volver a lo vigente* |
| Cargar un Excel a mano sin guardarlo | App › Datos › *Trabajos* (solo queda en ese navegador) |
| Cargar un Excel al histórico | ver *Cargar histórico anterior* en `instalacion.md` |
| Un correo no se procesó | revisar asunto/remitente vs. `subject_contains`/`from_contains`; quitar la etiqueta `RDM/procesado` no basta: el id queda en `ingest/log.json` |

## Errores comunes

| Mensaje (panel Datos / log) | Causa | Acción |
|---|---|---|
| `correo: [AUTHENTICATIONFAILED]` | contraseña de aplicación inválida o revocada | crear otra y actualizar `GMAIL_APP_PASSWORD` |
| `correo: … IMAP access is disabled` | IMAP deshabilitado en Gmail o por el admin Workspace | habilitar IMAP |
| `incidentes: TomTom 403` | key inválida o sin el producto habilitado | revisar key en developer.tomtom.com |
| `… TomTom 429` | límite por segundo o cuota agotada | esperar; revisar frecuencias |
| `se alcanzó el tope mensual configurado` | tope de `quotas` | normal a fin de mes si se bajaron frecuencias; ajustar |
| `[correo] omitido: faltan …` | secretos no cargados | ver `instalacion.md` §4 |

Los errores se guardan (últimos 50) en `state.json` de la rama `data`; las credenciales se enmascaran.

## Mantenimiento

- **Inactividad**: GitHub desactiva los workflows programados de repositorios públicos tras 60 días sin actividad
  en el repo. El paso *Mantener activo el cron* lo re-habilita los días 1 y 15 de cada mes. Si aun así aparece
  desactivado, *Actions › Operación › Enable workflow*.
- **Commits en `data`**: una corrida con cambios = un commit (≈ 70/día). Si algún día pesa demasiado, se puede
  re-crear la rama con un único commit (`git checkout --orphan`) sin perder los archivos actuales.
- **Dependencias**: versiones fijadas en `pipeline/requirements.txt`; Leaflet y SheetJS van incluidos en `app/vendor`.
- **CI**: cada push ejecuta las pruebas (`ci.yml`). No publicar cambios con CI en rojo.

## Privacidad

La configuración actual publica todo (decisión del proyecto). Alternativas si cambia:

1. **Repositorio privado + Pages privado** (GitHub Enterprise Cloud): mismo flujo, acceso con login.
2. **Repositorio privado sin Pages** + servir `_site` en SharePoint/servidor interno (el artefacto del workflow se
   puede descargar o subir con otra acción).
3. Ocultar campos: quitar `responsable` en `site.py` antes de publicar.

## Recuperación

- Sitio caído o con datos malos: re-ejecutar *Operación* (vuelve a publicar desde `data`).
- Datos corruptos en `data`: revertir el commit en la rama `data` (`git revert`) y re-ejecutar.
- Perder la rama `data` borra el histórico: mantenerla protegida (*Settings › Branches › Add rule › data* con
  *Allow force pushes* desactivado).
