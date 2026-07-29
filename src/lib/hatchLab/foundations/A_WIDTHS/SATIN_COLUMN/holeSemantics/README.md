# holeSemantics — P1.F0.2 auditoría y reconciliación del campo `holes` (solo laboratorio)

Aísla tres preguntas que P1.F0.1 mezclaba en una sola:

1. ¿Qué **declara** el metadato productivo? (`describeHoleDeclaration`, sin inventar recuentos)
2. ¿Qué **topología** representa realmente la región? (`auditRegionTopology`, sin leer el escalar)
3. ¿Se pueden **reconciliar** ambas? (`reconcileHoleSemantics`, función pura)

`candidateOnly: true · integrated: false`. Ningún módulo productivo se importa aquí: el productor se
documentó por **inspección estática solo lectura** en `producerSemantics.js`. No se ejecutó
`runPipeline`, `runStages`, `buildFinalCommands`, CE01, simulación ni exportación.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `producerSemantics.js` | procedencia verificada de `holes` (archivo, función, líneas, fórmula, consumidores) |
| `auditRegionTopology.js` | topología independiente: anillos, devanado, área, fronteras, simplicidad |
| `reconcileHoleSemantics.js` | función pura de reconciliación + `resolveOverallEligibility` |
| `holeFieldTrace.json` / `.md` | traza completa del campo por etapas |
| `topologyAudit.json` / `.md` | topología medida de A1, A5, A6, A7 y A8 |
| `reconciliationReport.json` / `.md` | fila por caso, estado final y recomendación |

## Reglas duras

- Un escalar **nunca** crea un anillo interior; solo lo hace geometría real (≥ 3 puntos finitos).
- Los valores raw (`1, 2, 2, 1, 1`) se conservan siempre y se reportan como metadato.
- `sourceDeclaredHoles > 0` no basta para `eligible = false`.
- Un hueco realmente representado nunca se ignora ni se elimina.
- Si el metadato afirma huecos reales sin geometría → `metadata_conflict`, no simplemente
  «ineligible»: falta geometría indispensable.
- Si el significado no puede demostrarse → `unresolved`; no se avanza al modelo de comandos.
- `candidateGeometryComplete` se conserva con independencia de `overallEligibility`.

## Resultado

`holes` es `nearby_small_sibling_region_count` (`src/lib/regionBuilder.js::estimateHoles`, etapa
`region_builder`): cuenta regiones hermanas pequeñas y cercanas por centroide, sin mirar el propio
contorno. Los cinco casos reales tienen topología de un solo anillo y cero huecos, por lo que quedan
`confirmed_no_real_holes` → `holeMetadataStatus: clear` y `overallEligibility: eligible`.