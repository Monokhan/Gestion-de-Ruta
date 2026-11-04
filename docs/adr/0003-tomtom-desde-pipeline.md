# ADR 0003 · TomTom se consulta desde el pipeline, no desde el navegador

**Estado:** aceptada · 2026-11

**Contexto.** Con N usuarios abiertos, consultar TomTom desde cada navegador multiplica el consumo y expone la key en
un sitio público.

**Decisión.** El pipeline consulta incidentes y flujo con frecuencias acotadas a la cuota gratuita y publica el
resultado. La app ya no consulta TomTom automáticamente; una key personal en el navegador es opcional (mapas TomTom
y consultas a demanda) y queda solo en ese navegador.

**Consecuencias.** Consumo independiente del número de usuarios y key protegida. La frescura la fija el pipeline
(40 min incidentes, 2 h flujo).
