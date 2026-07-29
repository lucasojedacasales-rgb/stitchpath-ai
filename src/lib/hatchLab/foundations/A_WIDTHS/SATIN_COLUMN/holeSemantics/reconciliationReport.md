# P1.F0.2 — Informe de reconciliación semántica de `holes`

Estado final: **HOLE_SEMANTICS_RESOLVED_NO_REAL_HOLES**
Recomendación (no implementada): **PROCEED_TO_P1_F1_STRAIGHT_SATIN_COMMAND_MODEL**

Productor: `src/lib/regionBuilder.js::estimateHoles`, etapa `region_builder`.
Significado verificado: `nearby_small_sibling_region_count` — regiones hermanas pequeñas y cercanas,
no anillos interiores. Geometría de huecos conservada en el motor: **ninguna**.

| Caso | Región | raw `holes` | Significado verificado | Topología real | Geom. interior | geometryEligibility | holeMetadataStatus | overallEligibility | Bloqueo | Próximo paso |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | r_zbgef31 | 1 | proximidad entre hermanas | 0 huecos, 1 anillo | no | eligible | clear | eligible | no | P1.F1 |
| A5 | r_sv7z5qe | 2 | proximidad entre hermanas | 0 huecos, 1 anillo | no | eligible | clear | eligible | no | P1.F1 |
| A6 | r_ecj9hl4 | 2 | proximidad entre hermanas | 0 huecos, 1 anillo | no | eligible | clear | eligible | no | P1.F1 |
| A7 | r_c92bxh3 | 1 | proximidad entre hermanas | 0 huecos, 1 anillo | no | eligible | clear | eligible | no | P1.F1 |
| A8 | r_zr65703 | 1 | proximidad entre hermanas | 0 huecos, 1 anillo | no | eligible | clear | eligible | no | P1.F1 |

Razón común: el escalar es una métrica de proximidad entre regiones hermanas y la topología medida
de forma independiente tiene cero anillos interiores; los cinco casos conservan
`candidateGeometryComplete: true`.

## Política aplicada

| Situación | holeSemanticStatus | Efecto |
| --- | --- | --- |
| productor demuestra que no son huecos | `confirmed_no_real_holes` | el valor se conserva como metadato y no bloquea |
| huecos reales con geometría | `confirmed_real_holes` | fuera del alcance de la columna recta; el hueco no se ignora |
| huecos reales sin geometría | `metadata_conflict` | falta geometría indispensable; no se avanza al modelo de comandos |
| significado indemostrable | `unresolved` | no se avanza al modelo de comandos |

`sourceDeclaredHoles > 0` nunca se usa por sí solo para declarar `eligible = false`.

## Tres elegibilidades separadas

- `geometryEligibility` depende solo de polígono, eje, rectitud, estaciones, rails, contención,
  anchura y split.
- `holeMetadataStatus` depende solo de la reconciliación semántica.
- `overallEligibility` combina ambas y puede valer `metadata_conflict` sin destruir
  `candidateGeometryComplete`.

## Límites

Conclusión sobre la **semántica del campo productivo**, no sobre calidad física de bordado. No se
afirma compatibilidad de máquina, conformidad con Hatch ni validación física. Los valores raw
(1, 2, 2, 1, 1) permanecen intactos en la fixture.