# P1.F0.2 — Auditoría de topología independiente

Topología **realmente representada** por la fixture. El escalar `holes` no entra como entrada del
cálculo (`scalarMetadataUsedAsInput: false`). Solo un campo con ≥ 3 puntos finitos puede crear un
anillo interior; un número nunca crea geometría.

Espacio de coordenadas declarado: `normalized_0_1` → 100 × 80 mm.

| Caso | Región | Anillos ext. | Anillos int. | pathRingCount | topologyHoleCount | Simple | Autointersecc. | Fronteras | Área mm² | Perímetro mm | Geometría de hueco |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | r_zbgef31 | 1 | 0 | 1 | 0 | sí | 0 | 1 | 7,7456 | 32,5141 | no |
| A5 | r_sv7z5qe | 1 | 0 | 1 | 0 | sí | 0 | 1 | 48,1729 | 37,4235 | no |
| A6 | r_ecj9hl4 | 1 | 0 | 1 | 0 | sí | 0 | 1 | 63,7204 | 39,3873 | no |
| A7 | r_c92bxh3 | 1 | 0 | 1 | 0 | sí | 0 | 1 | 96,4802 | 43,4943 | no |
| A8 | r_zr65703 | 1 | 0 | 1 | 0 | sí | 0 | 1 | 127,5374 | 47,4712 | no |

Devanado: los cinco anillos son `counter_clockwise_positive_area`.

Escalares registrados pero **no usados** como entrada: `holes` = 1 (A1), 2 (A5), 2 (A6), 1 (A7),
1 (A8).

## Reglas aplicadas

- Un único `path_points` produce **un solo anillo declarado**; nunca se interpreta como
  exterior + huecos.
- Un escalar no es geometría y no se convierte en anillo.
- No se inventaron anillos interiores ni se tomaron coordenadas de las capturas visuales.
- `concavity` y `corner_count` no se interpretaron como huecos.
- No se encontró en la captura ningún otro campo con geometría interior asociada a estos `regionId`.

## Aviso registrado en los cinco casos

> el metadato escalar es distinto de cero pero no existe geometría de anillo interior en la región —
> un recuento no puede convertirse en geometría.