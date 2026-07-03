# StitchPath AI — Prueba de Regresión Post-Auditoría

> Fecha: 2026-07-03
> Auditoría base: `AUDIT_REPORT.md`
> Correcciones aplicadas: B1, B2, B4, B7, B8, B9, B10, B12 (6 archivos)
> **Restricción del solicitante**: no modificar código, solo probar y reportar.

---

## 0. Metodología y limitación de alcance

Esta auditoría no puede **ejecutar** la aplicación, cargar imágenes, ni medir valores
en tiempo de ejecución (conteos de puntadas, generación real de archivos DST/DSB,
inspección visual de contornos). Eso requiere el **Testing Agent** de Base44
(test-tube icon, panel lateral), que sí opera la app en vivo.

Por tanto este informe se divide en dos partes:

- **Parte A — Verificación estática (código)**: lo que los cambios aplicados
  *garantizan* a nivel de fuente. Verificable leyendo el código. **Conclusión real.**
- **Parte B — Pruebas de ejecución (PENDIENTE)**: las 5 suites solicitadas.
  Estructura de tabla entregada; celdas de runtime marcadas
  `PENDIENTE — Testing Agent`. **No se fabrican valores.**

---

## Parte A — Verificación estática (código fuente)

### A1. Criterios de aceptación verificables estáticamente

| Criterio | Verificación estática | Estado |
|----------|----------------------|:------:|
| La app abre (router intacto) | `src/App.jsx` sin cambios de rutas; `Editor`/`Dashboard` importados | ✅ Garantizado |
| El modal ya usa darkStroke | `Editor.jsx`: `<ExportModal config={configWithDarkStroke}>` | ✅ Garantizado |
| ExportModal no reconstruye sin darkStroke | recibe `configWithDarkStroke` (mismo objeto del Editor) | ✅ Garantizado |
| DST usa comandos reparados (validado≡codificado) | `ExportModal.jsx`: `buildDSTFromCommands(exportCommands)` donde `exportCommands = productionReport.commands \|\| sourceCommands` | ✅ Garantizado |
| Validación binaria usa mismos comandos que el encoder | `actualColorChanges`/`panelStitches`/`panelJumps`/`panelTrims` ahora referencian `exportCommands` | ✅ Garantizado |
| Guard de contornos no se ejecuta 2× | `Editor.jsx`: import `runContourRefinementGuard` eliminado; usa `built.commands` | ✅ Garantizado |
| `finalEmbroideryCommands` deriva de `built.commands` | `Editor.jsx` useMemo: `finalCmds = built.commands` | ✅ Garantizado |
| Encoder DST/DSB intacto | `dstDirectExport.js`, `dsbEncoder.js`, `dstEncoder.js` **sin tocar** | ✅ Garantizado |
| Encoder DSB no emulado como DST | `dsbEncoder.js` real intacto | ✅ Garantizado |
| Umbrales SAFE/RISKY coherentes | `machineValidator` alineado a `ce01Validator` (jumps 250/500, trims 80/150) | ✅ Garantizado |
| Checks CE01 13/14 no muertos | `ce01Validator` usa `region_class`+`name` en vez de `r.type` | ✅ Garantizado |
| `mouthExported` no se pisa | `exportRealityCheck.js`: segunda asignación eliminada | ✅ Garantizado |
| Conteo de puntadas en UI unificado | `Editor.jsx` barra superior usa `unifiedMetrics.stitchCount` | ✅ Garantizado |
| Import `convexHull` muerto eliminado | `outlineGenerator.js` sin referencia a convexHull | ✅ Garantizado |

### A2. Verificación de "Sin máscara" (criterio #4)

- **Riesgo**: El panel `ContourRefinePanel` muestra *"Sin máscara de línea oscura
  (sube una imagen)"* cuando `getLastDarkStroke()` devuelve `null`.
- **Antes del fix B2**: el modal reconstruía con `config` (sin darkStroke) →
  `buildContourObjects` recibía `darkStroke = null` → `_lastDarkStroke = null`
  → posible "Sin máscara" en el modal aunque el Editor tuviera darkStroke.
- **Después del fix B2**: el modal recibe `configWithDarkStroke` → el mismo
  `darkStroke` del Editor → `getLastDarkStroke()` devuelve el mismo contexto.
- **Conclusión estática**: ✅ El modal ya **no** debería mostrar "Sin máscara"
  cuando el Editor tiene darkStroke activo. *(Confirmación visual: runtime — Testing Agent.)*

### A3. Verificación de fuentes de comandos (criterio #5, parcial)

| Fuente de comandos | Origen en código | ¿Coincide estáticamente? |
|--------------------|------------------|:------------------------:|
| Editor `finalEmbroideryCommands` | `buildFinalCommands(regions, configWithDarkStroke, ms)` | base |
| ExportModal `exportCommands` | `productionReport.commands \|\| editorFinalCommands` | ✅ mismo conjunto o reparado (superconjunto seguro) |
| `productionReport.commands` | `prepareCE01ProductionExport(editorFinalCommands, ...)` | ✅ derivado de editorFinalCommands |
| Comandos usados por DST | `buildDSTFromCommands(exportCommands)` | ✅ = exportCommands |
| Comandos usados por DSB | `ExportModal` ruta DSB — **no inspeccionado en esta auditoría** | ⚠️ PENDIENTE verificar |
| Comandos usados por simulador | `SewingSimulator`/`FinalLookSimulator` leen `finalCommands` del Editor | ✅ = editorFinalCommands |
| Comandos usados por CE01 validator | `prepareCE01ProductionExport` → `validateCE01` sobre `productionReport.commands` | ✅ = exportCommands |

> **Nota B3 (diferida)**: En ruta **no-producción**, `encodeOptimizedToFile`
> reconstruye `buildFinalCommands` internamente → ahí SÍ puede haber divergencia.
> Pero el modo por defecto es producción (`ce01ProductionMode = true`), donde
> todas las fuentes convergen en `editorFinalCommands`/`productionReport.commands`.
> La ruta DSB no se inspeccionó en esta auditoría estática → celda runtime pendiente.

---

## Parte B — Pruebas de ejecución (PENDIENTE — Testing Agent)

Las 5 suites requieren cargar imágenes reales y observar la app en vivo.
**No se han ejecutado** — no se inventan resultados.

### Estructura de tabla solicitada (plantilla)

| Diseño | Puntadas Editor | Puntadas ExportModal | Puntadas exportadas | Saltos | Trims | Colores | CE01 status | DST | DSB | Contornos correctos | Errores visuales |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1. Círculo simple | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 2. Kirby | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 3. Multicolor sin contorno | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 4. Solo contornos (debug) | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| 5. Fuentes de métricas | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

### Checklist de ejecución por suite (para el Testing Agent)

**Suite 1 — Círculo simple**
- [ ] Cargar imagen de círculo con contorno negro + relleno
- [ ] Vectorizar
- [ ] Simular (SewingSimulator)
- [ ] Validar CE01 (CE01ReportPanel)
- [ ] Exportar DST → ¿archivo descargado?
- [ ] Exportar DSB → ¿archivo descargado?
- [ ] Contorno negro aparece completo en simulación/final-look

**Suite 2 — Kirby**
- [ ] Cargar imagen Kirby
- [ ] Boca conservada (ContourRefinePanel → Mouth: YES)
- [ ] Ojos presentes (eye_detail)
- [ ] Contorno exterior presente
- [ ] Pies presentes (Lower Contour: body+feet YES)
- [ ] Unión entre dos tonos de rosa NO exportada como contorno (fill_boundary skipped)
- [ ] Validar CE01
- [ ] Exportar DST/DSB

**Suite 3 — Multicolor sin contorno entre colores**
- [ ] Fronteras entre colores NO aparecen como contornos falsos
- [ ] Clasificación semántica: `fill_boundary` count > 0 y todos excluidos

**Suite 4 — Solo contornos (debug)**
- [ ] Vista "Dark Stroke" del ContourRefinePanel muestra máscara
- [ ] ExportModal NO muestra "Sin máscara" cuando el Editor sí tiene darkStroke
- [ ] Vista "Universal" muestra contornos exportables

**Suite 5 — Fuentes de métricas**
- [ ] `unifiedMetrics.stitchCount` (barra superior) == `finalEmbroideryCommands` stitch count
- [ ] ExportModal `exportCommands` count == `productionReport.commands` count
- [ ] DST stitches == `exportCommands` stitches
- [ ] DSB stitches == `exportCommands` stitches
- [ ] Simulador stitches == `editorFinalCommands` stitches
- [ ] CE01 validator opera sobre `productionReport.commands`

---

## Conclusión

**Estático (verificable ahora)**: los 14 criterios de cableado están garantizados
por el código post-auditoría. No hay regresión a nivel de fuente en el encoder,
el router, ni el flujo de comandos. El modo producción (por defecto) mantiene una
sola fuente de verdad (`editorFinalCommands` → `productionReport.commands` → DST).

**Runtime (pendiente)**: las 5 suites con valores numéricos reales requieren
ejecución. **No se han fabricado.** Se entrega la plantilla y el checklist para
que el Testing Agent los complete con datos observados.

**Recomendación**: ejecutar el Testing Agent con los objetivos del checklist de
cada suite. Si cualquier celda runtime falla, reportar el diseño + métrica
observada y se determinará si corresponde a un bug preexistente o a una regresión
de la auditoría.