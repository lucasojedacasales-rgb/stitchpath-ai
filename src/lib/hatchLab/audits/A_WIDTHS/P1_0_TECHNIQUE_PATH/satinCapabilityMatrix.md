# Capacidad real de satén del motor base (P1.0, solo lectura)

Búsqueda completa sobre `src/**` y `base44/functions/**` (349 archivos productivos,
excluyendo `src/components/ui` y el propio Hatch Lab). 111 archivos mencionan «satin».
Patrones buscados: `satin`, `satinFill`, `satinColumn`, `columnStitch`, `zigzagColumn`,
`splitSatin`, `autoSplit`, `columnGenerator`.

## Hallazgo central

**Sí existe un generador de columna de satén real**: `generateSatinColumnPath`
(`src/lib/contourExportBuilder.js`, líneas ~90-124). Recorre una trayectoria y alterna
un desplazamiento perpendicular izquierda/derecha: zigzag transversal auténtico, con
anchura y densidad.

**Pero solo es alcanzable por la ruta de contornos.** `buildFinalCommands`
(`exportPipeline.js:1088-1090`) bifurca por `obj.isContour`, **no por técnica**:

```
obj.isContour ? generateContourStitches(obj, ms)   // satén / triple run / run
              : processObjectStitches(obj, ms)     // relleno recortado, o polígono
```

Dentro de `processObjectStitches` (`industrialStitchProcessor.js:368-403`) hay
exactamente dos ramas: `fill` → relleno de líneas recortado; **cualquier otra cosa** →
`result.push(...normalized)`, comentado en el propio código como *«Satin / running:
constant density path along polygon»*. No existe `autoSplit` ni `splitSatin` en ningún
punto del código productivo.

## Matriz

Columnas: L = reconoce la etiqueta · D = distingue de fill · G = geometría de satén ·
Z = zigzag transversal real · S = espaciado · A = autoSplit · U = underlay de satén ·
C = compensación específica.

| Componente | L | D | G | Z | S | A | U | C | Estado |
|---|---|---|---|---|---|---|---|---|---|
| region schema | sí | sí | no | no | no | no | no | no | label_only |
| adaptive engine / EIE | sí | sí | no | no | no | no | sí | sí | partially_supported |
| stitch planner | sí | sí | no | no | no | no | no | no | partially_supported |
| stitch optimizer | no | no | no | no | no | no | no | no | unsupported |
| underlay selector | sí | sí | no | no | no | no | sí | no | partially_supported |
| density selector | sí | sí | no | no | no | no | no | no | partially_supported |
| compensation selector | sí | sí | no | no | no | no | no | sí | partially_supported |
| buildFinalCommands | sí | sí | solo contorno | solo contorno | solo contorno | no | sí | no | partially_supported |
| generador geométrico (regiones) | no | no | no | no | no | no | no | no | unsupported |
| generador geométrico (contornos) | sí | sí | sí | sí | sí | no | no | no | fully_supported |
| generador de comandos / sanitizers CE01 | no | no | no | no | no | no | no | no | unsupported |
| simulator | no | no | no | no | no | no | no | no | unsupported |
| Final Look | sí | sí | no | no | no | no | no | no | label_only |
| encoder DST | no | no | no | no | no | no | no | no | unsupported |
| encoder DSB | no | no | no | no | no | no | no | no | unsupported |
| validaciones CE01 | no | no | no | no | no | no | no | no | unsupported |

## Riesgos destacados

- **Etiquetar `satin` una región de relleno la empeora**: pierde el relleno y recibe
  solo su propio contorno a densidad constante, más un underlay de rejilla de satén
  debajo de una pasada que no es satén.
- **Final Look engaña**: `KIND_FACTOR` engrosa el trazo del satén (1,15 frente a 0,78)
  sin que la geometría haya cambiado.
- **La ruta CE01 reetiqueta**: `ce01SafeFillGenerator.js:281` marca todos los comandos
  como `stitchType: 'fill'` sin condición.
- **El generador real no es reutilizable tal cual**: consume una línea central más una
  anchura, no el borde de una región rellena.

## Clasificación global

**`SATIN_PARTIALLY_IMPLEMENTED`**

- No es `SATIN_NOT_IMPLEMENTED`: existe un generador de columna completo y funcional.
- No es `SATIN_FULLY_IMPLEMENTED`: no hay ninguna ruta verificable desde la
  clasificación de técnica de una región hasta comandos de columna.
- No es `SATIN_LABEL_ONLY`: el patrón generado no es el mismo que el de fill — es otra
  rama distinta —, y sí existe un generador de columna real en otro punto del motor.
- Es parcial en sentido estricto: planificación y parámetros de satén existen para
  regiones; el generador, no.

## Capacidad de los tres consumidores clave

| Consumidor | Capacidad |
|---|---|
| `buildFinalCommands` | bifurca por `isContour`, no por técnica; columnas de satén solo para contornos |
| simulador | ciego a la técnica; reproduce coordenadas |
| exportadores DST / DSB | ciegos a la técnica; codifican coordenadas |