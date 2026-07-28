# P1-A_WIDTHS-TECHNIQUE-SELECTION — plan (no implementado)

Documento de planificación. **No se ha escrito ni activado ninguna regla.** El baseline `BASE-ENGINE-A-WIDTHS-V1` queda cerrado e intacto.

## Por qué solo la técnica

La auditoría semántica (hallazgo A) muestra que la anchura no llega a influir en la técnica: se fija antes de medir y se refuerza después. Mientras eso siga así, tocar compensación, espaciado o autoSplit no puede producir un efecto observable, porque no existe un satén real al que aplicarlos. P1 se limita por tanto a **una sola dimensión**: elegir la técnica en función de la anchura medida.

## Alcance de P1

Dentro:
- Una regla candidata que, a partir de la anchura medida de la región, proponga `satin` o `fill`.
- Aplicación **solo** dentro del laboratorio, tras una bandera desactivada por defecto, sin tocar el motor productivo.
- Registro de la propuesta junto a la decisión real, para poder compararlas sin sustituir nada.

Fuera de P1 (explícitamente):
- Compensación de tracción, densidad, espaciado, autoSplit, ángulos, underlay.
- Cualquier cambio en `region_builder`, `stitch_planner` o el pipeline productivo.
- Cualquier criterio, umbral de aceptación o pass/fail sobre los resultados.

## Precondiciones antes de escribir una línea

1. Confirmar el punto exacto donde entra el `stitch_type` por defecto (hoy provisional, hallazgo provisional 1).
2. Confirmar el segundo forzado posterior a `region_builder` y qué depende de él visualmente.
3. Decidir si la regla propone o decide. Propuesta primero; decisión, solo con evidencia posterior.
4. Reconciliar el conflicto región/plan de A1 o declararlo no comparable de forma permanente.

## Secuencia propuesta

- **P1.0** — Localización verificada de los dos puntos de anulación, documentada con referencias de código.
- **P1.1** — Regla candidata pura: entrada, anchura medida; salida, técnica propuesta más justificación. Sin efectos secundarios.
- **P1.2** — Pruebas puras de la regla, incluida su aplicación a las 26 regiones ya capturadas (sin reejecutar el motor).
- **P1.3** — Comparación declarativa contra la referencia A1–A8, otra vez informativa: qué casos cambiarían de técnica y cuáles no.
- **P1.4** — Solo entonces, y solo si el usuario lo pide, integración detrás de bandera y una nueva captura con `baselineId` distinto.

## Regla de comparación

El baseline actual es la única referencia del estado previo. Cualquier medición posterior se compara contra él **sin sobrescribirlo** y con su propio identificador. No se reutiliza `BASE-ENGINE-A-WIDTHS-V1`.