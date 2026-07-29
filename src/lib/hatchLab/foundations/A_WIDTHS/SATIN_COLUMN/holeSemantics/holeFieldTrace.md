# P1.F0.2 — Traza del campo productivo `holes`

Inspección **solo lectura** del código productivo. No se importó ningún módulo productivo,
no se ejecutó `runPipeline`, `runStages` ni `buildFinalCommands`, y no se modificó nada fuera de la
foundation de laboratorio.

## Primer productor

| Dato | Valor |
| --- | --- |
| Función | `estimateHoles` |
| Archivo | `src/lib/regionBuilder.js` |
| Líneas aproximadas | 203–217 |
| Invocado desde | `enrichRegion` (~línea 347) → `enrichAllRegions` |
| Etapa | `region_builder` (etapa 6 de `PIPELINE_STAGES`) |
| Tipo | `number` |

Fórmula real, transcrita del código:

```
count( other.id !== self.id
       && other.centroid
       && other.area_mm2 < 0.12 × self.area_mm2
       && hypot(other.centroid − self.centroid) < 0.15 )
```

## Sobre qué se calcula

Se calcula **exclusivamente sobre metadatos de las regiones hermanas** (`id`, `centroid`
normalizado, `area_mm2`). No se calcula sobre:

- imagen raster;
- máscara binaria;
- jerarquía de contornos;
- el propio polígono;
- `path_points` de la región;
- objetos semánticos;
- componentes conectados.

## Significado verificado

`nearby_small_sibling_region_count`: cuántas **otras** regiones del mismo diseño son pequeñas
respecto a esta (< 12 % de su área) y están cerca por centroide (< 0,15 en unidades normalizadas).

No es un recuento de huecos interiores, ni de anillos, ni de contornos hijos, ni una métrica de
complejidad, ni ruido eliminado, ni cortes de raster, ni un fallback. Confianza:
`proven_by_source_inspection`.

## Persistencia

El valor se **recalcula y sobrescribe** en cada llamada a `enrichRegion`. Ninguna etapa anterior
produce un valor competidor: el campo nace en `region_builder`.

## Geometría de los huecos

**No existe.** Ningún campo productivo (`holes`, `holeCount`, `hole_count`, `explicitHoleCount`,
`interiorRing`, `innerContour`, `contourHierarchy`, `childContours`, `euler…`) almacena fronteras
interiores. Por tanto ningún consumidor podría coser ni recortar un hueco.

## Consumidores reales

| Archivo | Línea | Uso | Lee geometría |
| --- | --- | --- | --- |
| `src/lib/regionBuilder.js` | 312 | penaliza `quality_score` en 8 puntos por unidad + aviso textual | no |
| `src/lib/stitchIntelligence.js` | 461 | `eiePriority`: fuerza prioridad 10 en `running_stitch` si > 0 | no |
| `src/components/editor/RegionInspector.jsx` | 87 | muestra «Agujeros» | no |
| `src/components/editor/IntelligencePanel.jsx` | 115 | copia el escalar a su payload | no |
| `src/lib/hatchLab/bench/extractMetrics.js` | 136–148 | suma en la métrica `explicitHoleCount` | no |

## Conclusión

El nombre `holes` no describe lo que el productor calcula. Un valor > 0 **no** certifica un hueco
interior topológico y no puede, por sí solo, invalidar una geometría de columna de satén.