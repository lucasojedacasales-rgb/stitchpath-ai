# P1.0 — Auditoría de la ruta de la técnica (A_WIDTHS)

Auditoría **de solo lectura**. No se ejecutó `runPipeline`, no se modificó ningún
archivo del motor y no se tocó nada dentro de
`baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/`.

| Archivo | Contenido |
|---|---|
| `overridePoints.json` | dónde nace `stitch_type`, quién lo sobrescribe y con qué condición |
| `techniqueFlow.json` / `.md` | traza etapa por etapa, de la vectorización a la exportación |
| `satinCapabilityMatrix.json` / `.md` | qué componentes soportan satén de verdad |
| `a1RegionPlanConflict.json` | los tres campos en conflicto del caso A1 y qué productor manda |
| `P1_0_REPORT.md` | informe de cierre y recomendación |

Conclusiones en una línea: la técnica se fija **antes** de que exista cualquier medida
de anchura y se vuelve a forzar a `fill` en `contourSafeMode`; el planner sí decide por
anchura pero es **asesor**; el satén está **parcialmente implementado** — hay un
generador de columna real, alcanzable solo por la ruta de contornos.