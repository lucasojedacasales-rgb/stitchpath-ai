# Informe del evaluador · BASE-ENGINE-A-WIDTHS-V1

Evaluador `0.2.1-A_WIDTHS` · conclusión **`evaluated`** · datos **`complete`** · asignación **`all_assigned`**.
Comparaciones **no suprimidas**. Búsqueda **completa** y **optimalidad probada**.
Versión legible del extracto de `evaluationReport.json`; **ninguna conclusión ha sido alterada**.

## Asignación

Cobertura: 5 matched · 0 ambiguous · 0 unmatched · 0 unavailable.
Búsqueda exacta por ramificación y poda: 11 ramas exploradas, 4 podadas (todas por `matchCount`), 2 soluciones, espacio estimado 32, sin límites aplicados.
Identidad: 26 regiones estables, 0 IDs ausentes, 0 duplicados. Integridad del plan: `ok`.

| Caso | Región | Estado |
|---|---|---|
| A1 | `r_zbgef31` | matched |
| A5 | `r_sv7z5qe` | matched |
| A6 | `r_ecj9hl4` | matched |
| A7 | `r_c92bxh3` | matched |
| A8 | `r_zr65703` | matched |

## Coordenadas

`normalized_0_1`, declarado por el contrato de etapa (no por observar valores entre 0 y 1). Diseño 100 × 80 mm · 1181 × 945 px · `xMm = x · widthMm`.

## Valores del motor frente a la referencia

| Caso | Ancho motor (mm) | Nominal Hatch | Técnica motor | Técnica Hatch | Comp. motor | Comp. Hatch | Ángulo motor | Underlay motor | Underlay Hatch |
|---|---|---|---|---|---|---|---|---|---|
| A1 | 0.489 | 0.5 | fill | satén | 0 | 0.4 | 45° | `edge_run` (plan) | «Corrido centrado» (sin normalizar) |
| A5 | 3.027 | 3 | fill | satén | 0.205 | 0.4 | 45° | `edge_run_plus_zigzag` | «Corrido centrado» (sin normalizar) |
| A6 | 4.004 | 4 | fill | satén | 0.205 | 0.4 | 45° | `edge_run_plus_zigzag` | `edge_run_plus_zigzag` |
| A7 | 6.055 | 6 | fill | satén | 0.205 | 0.4 | 89° | `edge_run_plus_zigzag` | `edge_run_plus_zigzag` |
| A8 | 8.008 | 8 | fill | satén | 0.205 | 0.4 | 89° | `zigzag` | `edge_run_plus_zigzag` |

Las diferencias de anchura se registran como **informativas**: sin criterio y sin pass/fail en esta fase.

## Campos en conflicto (solo A1)

`densityMm` (región 0 · plan 0.4), `underlayEnabled` (región `false` · plan `true`), `underlayDensityMm` (región 0 · plan 1). Cuando las fuentes discrepan **no se selecciona valor y no se compara**.

## Campos no disponibles

`spacingMode`, `spacingMm`, `autoSplit`, `primaryLengthMm`, `secondaryLengthMm`, `secondarySpacingMm`, `secondaryUnderlay`.
`spacingMm` queda además marcado como **`not_comparable`**: el motor no expone espaciado y no está verificado que `region.density` sea la misma magnitud que la columna de espaciado de Hatch.

## Campos desconocidos observados en las regiones

`_validation`, `area_px`, `bbox`, `bbox_aspect`, `bezier_handles`, `compacidad`, `corner_count`, `coverage`, `inertia_ratio`, `is_dark_outline`, `pixelCount`, `qualityPhase1`, `travel_score`.

Sin errores y sin advertencias del evaluador.