# Instalación en GitHub

Requisitos: cuenta de GitHub, cuenta de TomTom Developer y la cuenta de Gmail (o Google Workspace) que recibe el
correo con el programa de trabajos.

## 1. Crear el repositorio

1. En GitHub: **New repository** → nombre sugerido `gestion-ruta-maipo` → **Public** → sin README (ya viene uno).
2. Subir el contenido del .zip a la rama `main`:
   ```bash
   cd gestion-ruta-maipo
   git init -b main && git add . && git commit -m "Gestión de Ruta v5"
   git remote add origin https://github.com/<usuario>/gestion-ruta-maipo.git
   git push -u origin main
   ```
   (También sirve *Add file › Upload files* arrastrando la carpeta, pero la carpeta `.github` debe quedar incluida.)

> GitHub Pages en plan gratuito requiere repositorio público. Con GitHub Pro/Team/Enterprise puede ser privado.

## 2. TomTom

1. En <https://developer.tomtom.com> → *Dashboard › Keys* → crear una key nueva para este proyecto.
2. **Rotar** la key que se compartió por chat (eliminarla o regenerarla).
3. Opcional: restringir la key por dominio solo si se usará también desde el navegador (la key del pipeline no necesita restricción de dominio; no restringir por IP, GitHub Actions usa IPs variables).

## 3. Gmail: contraseña de aplicación

1. En la cuenta Google que recibe el Excel: *Gestionar cuenta › Seguridad* → activar **Verificación en 2 pasos**.
2. Ir a <https://myaccount.google.com/apppasswords> → crear una contraseña de aplicación llamada `RDM GitHub`.
3. Copiar los 16 caracteres (los espacios no importan).
4. En Google Workspace, el administrador debe permitir el acceso IMAP y las contraseñas de aplicación.
5. Gmail › Configuración › *Reenvío y correo POP/IMAP* → **Habilitar IMAP**.

El pipeline solo lee (BODY.PEEK, no marca como leído) y agrega la etiqueta `RDM/procesado`. Usa la misma cuenta para
enviar las alertas por SMTP.

## 4. Secrets y variables

*Settings › Secrets and variables › Actions*

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `TOMTOM_API_KEY` | key de TomTom |
| Secret | `GMAIL_USER` | `cuenta@dominio.cl` |
| Secret | `GMAIL_APP_PASSWORD` | contraseña de aplicación |
| Secret | `ALERT_TO` | `jefe.turno@dominio.cl, centro.control@dominio.cl` |
| Variable | `SITE_URL` | `https://<usuario>.github.io/gestion-ruta-maipo/` |

Cualquier secreto ausente desactiva solo su módulo (sin correo → no hay trabajos nuevos; sin TomTom → no hay
incidentes ni flujo); la corrida no falla.

## 5. GitHub Pages

*Settings › Pages › Build and deployment › Source:* **GitHub Actions**.

## 6. Primera corrida

*Actions › Operación › Run workflow* → marcar **Forzar** → *Run*. En 1–2 minutos:

- se crea la rama `data` con el histórico,
- el sitio queda en `SITE_URL`,
- el panel **Datos** de la app muestra la hora de cada fuente y el consumo de TomTom del mes.

Si el workflow no aparece en *Actions*, habilitar Actions en *Settings › Actions › General*.

## 7. Ajustar el filtro de correo

En `config.yml`:

```yaml
mail:
  gmail_query: "has:attachment filename:xlsx newer_than:7d"
  subject_contains: ["intervencion diaria"]   # sin tildes ni mayúsculas
  from_contains: ["@rutadelmaipo.cl"]         # recomendado: limitar remitentes
```

Para probar el filtro sin esperar el cron: *Run workflow* nuevamente. Los correos ya procesados no se repiten.

## 8. Cargar histórico anterior (opcional)

Los Excel antiguos pueden cargarse localmente y subirse a la rama `data`:

```bash
git clone -b data https://github.com/<usuario>/gestion-ruta-maipo.git datos
export PYTHONPATH=pipeline
for f in historicos/*.xlsx; do python -m rdm --data datos ingest "$f"; done
cd datos && git add -A && git commit -m "carga histórica" && git push
```

`--received 2026-06-26T18:00:00-04:00` permite fijar la fecha de recepción para ordenar revisiones.
