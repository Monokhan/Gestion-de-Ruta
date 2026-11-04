# ADR 0002 · Histórico como archivos en la rama `data`

**Estado:** aceptada · 2026-11

**Contexto.** Hay que conservar trabajos, incidentes y tráfico como histórico, sin base de datos.

**Decisión.** JSON/CSV particionados por fecha o mes en una rama huérfana `data`; cada corrida con cambios es un
commit. `main` queda solo con código.

**Consecuencias.** Auditable (diff por corrida), recuperable (`git revert`), consultable desde la app sin backend.
Volumen bajo (≈ 15 MB/año). No apto para consultas ad hoc complejas: para análisis, clonar la rama y usar pandas.
