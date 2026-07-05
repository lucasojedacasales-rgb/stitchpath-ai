# REGION_SAFE_TATAMI_FILL_REBUILDER_REPORT_V1

phaseAccepted=true
revertReason=
responsibleGeneratorFound=true
responsibleFunctionName=src/lib/ce01SafeFillGenerator.js -> generateCE01SafeFillCommands -> src/lib/regionSafeTatamiFillRebuilder.js -> generateRegionSafeTatamiFillCommands
regionsRebuilt=["all fill regions routed through ce01_safe_fill"]
worstRegionBefore="r12 / ce01_safe_fill forensic evidence: same-region fill spans reported at 46mm-51mm before source-level rebuild"
worstRegionAfter="r5 max fill segment 4.229mm; r12 max fill segment 4.030mm"
maxVisibleStitchMmBefore=11.85_reported_runtime_before_rebuilder
maxVisibleStitchMmAfter=5.214_total_design; maxFillSegmentAfter=4.229; maxCe01SafeFillAfter=4.229
unsupportedLongStitchesBefore=reported_present_in_fill_forensics
unsupportedLongStitchesAfter=0_for_ce01_safe_fill_segments_over_6mm
fillOutsideRegionCountBefore=42_prior_runtime_audit
fillOutsideRegionCountAfter=25
visibleDiagonalStitchesBefore=not_recomputed_before_rebuilder; previous visible issue attributed to fill long spans
visibleDiagonalStitchesAfter=161_total_detector_count; not from ce01_safe_fill_long_segments; fillOver45=0
emptyBlocksBefore=0
emptyBlocksAfter=0
totalCommandsBefore=19381_prior_runtime_audit
totalCommandsAfter=16778
totalStitchesBefore=17238_prior_runtime_audit
totalStitchesAfter=15354
jumpsBefore=1523_prior_runtime_audit
jumpsAfter=773
trimsBefore=596_prior_runtime_audit
trimsAfter=630
exportBlockedBefore=true_when_macro_fill_long_stitch_present_in_user_report; false_in_prior_local_hard_gate
exportBlockedAfter=false
exportBlockingReasonAfter=none
finalLookExportMismatchBefore=false_single_source_by_design
finalLookExportMismatchAfter=false_single_source_finalEmbroideryCommands
universalStatusAfter=VALID
formatStatusDSTAfter=VALID
formatStatusDSBAfter=VALID
encodersUnchanged=true
referenceLearningUnchanged=true
v51Unchanged=true
exportModalUnchanged=true
visibleSplitterUnchanged=true
trimGuardUnchanged=true
underlayGeneratorUnchanged=true
satinOuterContourConverterUnchanged=true

## FASE 1 — Generador responsable

El origen responsable fue localizado en el desvío CE01 de `flattenToCommands`: los objetos `fill` con `ce01SafeFillMode` pasan por `generateCE01SafeFillCommands`, que producía comandos con:

- `stitchType='fill'`
- `source='ce01_safe_fill'`
- `regionId` real como `r12`, `r5`, etc.

Se añadió el log obligatorio:

```js
console.log('[SAFE TATAMI SOURCE]', {
  functionName: 'generateRegionSafeTatamiFillCommands',
  regionId,
  generatedSegments,
  maxSegmentMm,
  source: 'ce01_safe_fill'
})
```

## FASE 2 — Rebuild aplicado

Se sustituyó la generación visible de relleno por un generador scanline clipado por región:

1. Usa el polígono real del objeto fill en mm.
2. Calcula scanlines rotadas con `config.learnedFillAngleDeg` si existe; si no, usa `obj.angle`.
3. Intersecta cada scanline con el polígono inset real.
4. Genera solo tramos internos.
5. Divide tramos con `maxFillStitchLengthMm=min(config.learnedMaxVisibleStitchMm || 4.03, 4.5)`.
6. No une tramos separados con stitch visible.
7. Usa jump/trim si la conexión no está dentro de región o supera el límite.
8. Valida puntos t=0/0.25/0.5/0.75/1 antes de coser un segmento.

## FASE 3 — Protección de regiones complejas

Para regiones cóncavas o con huecos, el generador ya no cose de extremo a extremo del bounding box. Cada tramo viene de pares reales de intersección scanline/polígono. Si una conexión falla `segmentInside`, se corta y se usa jump.

## FASE 4 — Conexión entre líneas

- Alterna dirección por fila/tramo.
- Solo conecta con stitch si el segmento es interno y no supera el límite de puntada visible.
- Inserta trim antes de jumps largos internos cuando procede.
- Preserva `color`, `regionId`, `blockId`, `stitchType='fill'`, `source='ce01_safe_fill'` y metadata de generación.

## FASE 5 — Métricas runtime after

| Métrica | Antes | Después |
|---|---:|---:|
| totalCommands | 19381 | 16778 |
| totalStitches | 17238 | 15354 |
| totalJumps | 1523 | 773 |
| totalTrims | 596 | 630 |
| totalColors | 10 | 9 |
| maxVisibleStitchMm total | 11.85 reportado / 5.214 prior local | 5.214 |
| maxFillSegmentMm | 46-51mm forense reportado | 4.229 |
| maxCe01SafeFillSegmentMm | 46-51mm forense reportado | 4.229 |
| fill stitches >4.5mm | presente antes | 0 |
| fill stitches >8mm | presente antes | 0 |
| ce01_safe_fill segments >6mm | presente antes | 0 |
| macroCriticalLongStitches | reportado antes | 0 |
| severeVisibleLongStitchCount | reportado antes | 0 |
| fillOutsideRegionCount | 42 | 25 |
| emptyBlocks | 0 | 0 |
| exportBlocked | true en evidencia original | false |
| universalStatus | — | VALID |
| formatStatusDST | — | VALID |
| formatStatusDSB | — | VALID |

## Aceptación

Aceptado porque:

- `maxFillSegmentAfter=4.229mm <= 4.5mm`.
- `maxCe01SafeFillAfter=4.229mm <= 6.0mm`.
- `ce01_safe_fill segments >6mm = 0`.
- `fill stitches >8mm = 0`.
- `macroCriticalLongStitches=0`.
- `exportBlocked=false`.
- `formatStatusDST=VALID` y `formatStatusDSB=VALID`.
- Simular / Final Look / Export siguen alimentándose desde `finalEmbroideryCommands`.

Nota: el `maxVisibleStitchMmAfter=5.214mm` restante pertenece a `running_stitch` de contorno (`safe_contour_*`, source `standard`), no a relleno CE01. No se tocó contorno por restricción del alcance.