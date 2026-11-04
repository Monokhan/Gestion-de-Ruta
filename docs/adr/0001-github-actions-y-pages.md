# ADR 0001 · GitHub Actions + Pages en vez de servidor

**Estado:** aceptada · 2026-11

**Contexto.** Se necesita leer correo, consultar TomTom y publicar un visor en forma continua, sin infraestructura
propia y con credenciales fuera del navegador.

**Decisión.** Un workflow programado (cron cada 20 min) ejecuta el pipeline Python y publica un sitio estático en
GitHub Pages. Los secretos viven en GitHub Secrets.

**Consecuencias.** Costo cero y sin servidores. Latencia mínima ≈ 20 min más el retraso del cron de GitHub (no
garantizado). Pages gratuito exige repositorio público. Si se requiere tiempo real estricto (< 5 min) o acceso
privado, migrar el mismo pipeline a una función programada (Azure Functions / Cloud Run) sin cambiar la app.
