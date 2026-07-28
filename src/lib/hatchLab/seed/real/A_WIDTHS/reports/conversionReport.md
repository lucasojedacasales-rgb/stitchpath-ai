# P0.2B — Conversión controlada del seed real A_WIDTHS (V1)

Esquema Hatch Lab: **1.1.0** · Generado: **2026-07-28** · Fase: **A_WIDTHS**

## Fuentes leídas

`A_Anchuras_SUMMARY.json`, `A_Anchuras_MANIFEST.csv`, las 5 partes ZIP,
`05_Datos_Objetos/HATCH-A-WIDTHS-EXACT-map.csv`,
`05_Datos_Objetos/HATCH-A-WIDTHS-R01-analisis-ABCD.xlsx`,
`06_Reglas/HATCH-A-WIDTHS-reglas.json`,
`07_Informes/HATCH-A-WIDTHS-conclusiones.txt`,
`02_Capturas/A_Anchuras/CAPTURAS_INCLUIDAS.txt`, `MANIFEST_SHA256.txt`.
Referenciados sin extracción: imágenes de `00_Fuentes`, SVG y el EMB.

- Hojas del Excel utilizadas: **Fila_A, Reglas_candidatas, Config_comun, Notas_metodo, Comparativa_A_B_C_D** (presentes y no usadas: Fila_B, Fila_C, Fila_D).
- Filas del CSV utilizadas: **L2 (A1), L6 (A5), L7 (A6), L8 (A7), L9 (A8)**.

## Cinco casos creados

| Caso | Ref. XLSX | Nominal | Observado | Dif. derivada | Puntada | Underlay | Espaciado | Comp. | División |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Fila_A!A2:S2 | 0,5 mm | 0,55 mm | +0,05 | Satín | Corrido centrado (2 mm) | Automático (valor no mostrado) | 0,40 mm | Sí |
| A5 | Fila_A!A6:P6 | 3,0 mm | 3,13 mm | +0,13 | Satín | Corrido centrado (2 mm) | Automático (valor no mostrado) | 0,40 mm | Sí |
| A6 | Fila_A!A7:P7 | 4,0 mm | 4,06 mm | +0,06 | Satín | Borde (2 mm) + Zigzag (3,6 / esp. 2 mm) | Automático (valor no mostrado) | 0,40 mm | Sí |
| A7 | Fila_A!A8:P8 | 6,0 mm | 6,09 mm | +0,09 | Satín | Borde + Zigzag | Manual 0,36 mm | 0,40 mm | Sí |
| A8 | Fila_A!A9:P9 | 8,0 mm | 8,04 mm | +0,04 | Satín | Borde + Zigzag | Manual 0,36 mm | 0,40 mm | Sí |

La diferencia nominal/observado se muestra aquí como **valor derivado** del informe.
En los casos, `observation.measured.differenceMm` queda **null**: la columna
"Diferencia (mm)" de `Fila_A` está vacía y no se infiere.

## Cambios documentados

- **Underlay**: último corrido centrado en **A5 (3,13 mm)**; primero borde + zigzag en **A6 (4,06 mm)** → umbral como intervalo **3,13–4,06 mm**.
- **Espaciado**: último automático en **A6 (4,06 mm)**; primer manual **0,36 mm** en **A7 (6,09 mm)** → intervalo **4,06–6,09 mm**.
- **Compensación de halado**: **0,40 mm**, constante en A1-A8 (`Config_comun!A8:C8`).
- **División automática**: **activada**, constante en A1-A8 (`Config_comun!A9:C9`).

## Valores ausentes

- `differenceMm` (A1, A5, A6, A7, A8) — columna vacía en `Fila_A!D2:D9`.
- `spacingMm` (A1, A5, A6) — Hatch no muestra el valor en modo automático.
- `stitchAngleDeg` (A1, A5, A6) — el ángulo 0° solo es visible en A7-A8.
- `underlay2LengthMm` / `underlay2SpacingMm` (A1, A5) — refuerzo 2 desactivado.

## Reglas candidatas relacionadas

| ruleId | status | confianza | casos |
|---|---|---|---|
| SATIN-RANGE-OBSERVED-001 | candidata | 0,95 | A1, A5, A6, A7, A8 |
| UNDERLAY-GEOMETRY-001 | candidata | 0,96 | A5, A6 |
| SPACING-GEOMETRY-001 | candidata | 0,95 | A7, A8 |
| LOCAL-WIDTH-PROFILE-001 | candidata | 0,98 | A7 |
| PULL-COMP-COTTON-040-001 | candidata | 0,90 | A1, A5, A6, A7, A8 |

Ninguna regla se eleva a `confirmed`, ninguna se traduce en comportamiento del motor.

## Evidencias no mapeadas

**78 capturas** de la fase A_WIDTHS con `relationStatus: "uncertain"` y
`relatedCaseIds: []`. También quedan sin mapear `CAPTURAS_INCLUIDAS.txt` y
`DONDE_PEGAR_CADA_ARCHIVO.txt`. El EMB se registra como evidencia global
`extractable: false`.

## Estado

- Validación física: **no disponible**.
- `expectedResult`: **null** en los cinco casos — no existen métricas verificadas para técnica por objeto, underlay, espaciado, división automática, compensación ni anchura observada, y no se sustituyen por `regionCount`, `colorCount` ni `stitchCount`.
- `benchmarkReady: false`, `motorIntegrationReady: false`, `expectedResultReady: false`.
- Pipeline **no ejecutado**; código productivo **no modificado**; sin feature flags ni controles de interfaz.

## Conformidad estructural (P0.2C, 2026-07-28)

- Inventario real de P0.2B (calculado sobre rutas): **13 archivos creados** — 12 dentro de `A_WIDTHS` + `src/tests/hatchLab/aWidthsSeedIntegrity.test.js` — y 1 modificado (`runHatchLabTests.js`). La cifra "11" anunciada en P0.2B era incorrecta.
- `ruleScope`: string → objeto `{ phase, geometryClass, sizeRangeMm{minimum,maximum,unit}, fabric, description }`; el texto original se conserva íntegro en `description`.
- `source`: añadidos `version: null`, `author: null`, `date: "2026-07-22"` (fecha real de observación, igual a `capturedAt`); campos extra conservados.
- `input`: añadidos `imageRef` (PNG fuente ya registrado) y `description`; datos cuantitativos intactos.
- `evidence`: `notes` → `description` en las 44 evidencias de los cinco casos; sin duplicar campos.
- Valores técnicos, hashes, reglas candidatas, `expectedResult: null` y los indicadores `benchmarkReady` / `motorIntegrationReady` / `expectedResultReady` / `physicalValidationAvailable`: sin cambios.

## Próximo paso técnico

Crear un evaluador A_WIDTHS capaz de extraer y comparar técnica, underlay,
espaciado, compensación y anchura por objeto desde un resultado ya generado por
el motor base. **No se implementa en esta tarea.**