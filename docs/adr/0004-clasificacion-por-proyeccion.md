# ADR 0004 · Incidentes asociados por proyección al eje calibrado

**Estado:** aceptada · 2026-11

**Contexto.** TomTom devuelve incidentes por rectángulo: incluye calles urbanas y otras rutas del corredor.

**Decisión.** Proyectar cada geometría al eje R5/ASS calibrado a PK y conservar solo lo que está a ≤ 400 m,
marcando *ruta* (≤ 80 m) o *entorno*. Con la muestra real del corredor, de 61 incidentes quedaron los de la
concesión (Buin km 36,5 y Mostazal km 61,9) y se descartaron calles urbanas.

**Consecuencias.** Alertas con PK y sector propios de la concesión, cruzables con los trabajos programados. Los
umbrales se ajustan en `config.yml` si aparecen falsos positivos en caleteras o enlaces.
