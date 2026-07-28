# Traza de la técnica — vectorización → exportación (P1.0, solo lectura)

El motor no se ejecutó. Todo lo de abajo procede de inspección estática del código
productivo y de los artefactos ya guardados de `BASE-ENGINE-A-WIDTHS-V1`.

## Los cinco sentidos de «técnica»

| Sentido | Dónde vive | ¿Llega a los comandos? |
|---|---|---|
| Propuesta | `eieStitchType` (EIE) y `classifyStitchType` (planner) | no |
| Efectiva | `region.stitch_type` tras `region_builder` | sí |
| De parámetros | la efectiva, dentro de `enrichAllRegions` | sí (densidad, compensación, underlay, longitud) |
| De comandos | `obj.stitch_type` + `obj.isContour` en `buildFinalCommands` | sí |
| Solo visual | `KIND_FACTOR` de Final Look, badges de paneles | no |

## Recorrido

1. **vectorRegions** — `normalizeRegionForPipeline` (regionNormalize.js:180) garantiza
   `stitch_type: region.stitch_type || 'fill'`. Primer punto donde el campo existe.
   Es un valor por defecto de normalización, no una decisión. Ocurre **antes** de que
   exista cualquier medida física de anchura.
2. **enriquecimiento semántico** — `regionBuilderStage.js:68` sobrescribe con
   `sem.stitch_type` cuando un objeto semántico del LLM coincide con el centroide.
   Sigue siendo ciego a la anchura.
3. **adaptive / EIE** — aquí, y solo aquí, se mide la anchura real (métricas de
   esqueleto). `adaptStitchType` calcula una propuesta geométrica y
   `regionBuilder.js:397` la descarta: `if (region.stitch_type) overrides.stitch_type
   = region.stitch_type`. La técnica conservada es la que después elige densidad,
   compensación, underlay y longitud de puntada.
4. **separación de contornos (safe mode)** — `contourSafeMode.js:151-163` reescribe
   `type` y `stitch_type` a `'fill'` para toda región no-contorno sin `region_class`.
   Como `region_class` solo lo asigna `regionClassifier` cuando
   `experimentalDetailPreservation` está en `true` (estaba en `false`), en el baseline
   **las 26 regiones pasaron por este forzado**. Es el último escritor antes de todos
   los consumidores.
5. **stitch_planner** — `classifyStitchType` (stitchPlanner.js:86,95) sí decide
   `satin` por anchura, pero escribe en `plan.sequence[].stitchType`, no en la región.
   `exportPipeline.js` no importa `stitchPlanner` y `buildFinalCommands` nunca recibe
   `ctx.stitchPlan`: el plan es **asesor**. Solo llega a las regiones si el usuario
   pulsa «Aplicar» en el panel del planner.
6. **stitch_optimizer** — ordena y mide; no toca la técnica.
7. **buildFinalCommands** — `exportPipeline.js:1088-1090` bifurca por
   `obj.isContour`, no por técnica: los contornos van a `generateContourStitches`
   (columna de satén real) y el resto a `processObjectStitches`. Dentro de este,
   `industrialStitchProcessor.js:368-403`: `fill` → relleno de líneas recortado;
   cualquier otra cosa → `result.push(...normalized)`, es decir, el contorno del
   polígono a densidad constante.
8. **simulación y Final Look** — leen la etiqueta solo para grosor y estilo.
9. **encoders DST / DSB** — no leen `stitch_type` en absoluto; reciben coordenadas.

## Trazas de ejemplo (desde el snapshot guardado)

**A1** — región `r_zbgef31`, anchura medida 0,489 mm, altura 16 mm, técnica efectiva
`fill`, referencia `satin`. Generador: rama de relleno recortado. La anchura es menor
que un solo paso de línea de relleno y aun así se eligió relleno, porque la técnica ya
estaba fijada cuando la anchura apareció.

**A8** — región `r_zr65703`, 8,008 × 16,019 mm, técnica efectiva `fill`, ángulo del
motor 89° frente a 0° de la referencia, underlay `zigzag` frente a
`edge_run_plus_zigzag`. El 89° es dirección de líneas de relleno y el 0° es dirección
de columna de satén: no son la misma magnitud, así que la diferencia no es un error de
grados.

## Consecuencia

Cambiar `stitch_type` a `satin` en una región de relleno no produce satén: la envía a
la rama del polígono, que pierde el relleno y no genera columna. Ver
`satinCapabilityMatrix.md`.