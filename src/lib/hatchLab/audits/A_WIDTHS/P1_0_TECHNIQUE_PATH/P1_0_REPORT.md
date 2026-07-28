# Informe de cierre P1.0 — A_WIDTHS

Alcance: auditar la ruta de la técnica y cerrar con honestidad el almacenamiento del
baseline. **Sin ejecutar el motor y sin modificarlo.** La carpeta inmutable
`BASE-ENGINE-A-WIDTHS-V1/` se leyó y nada dentro de ella se creó, cambió ni borró. La
guarda persistente de captura sigue intacta y sin ruta de reinicio.

## 1. Estado del laboratorio

- Nueve suites ejecutadas: **868 comprobaciones, 9/9 correctas**.
- La suite del baseline almacenado tiene **21 comprobaciones**, no 24; el recuento
  anterior era erróneo y queda corregido. Se añade ahora una décima suite,
  `aWidthsArchiveClosure`, con 13 comprobaciones sobre el documento de cierre.
- Lint sin fallos en las carpetas del laboratorio (25 errores preexistentes en
  pantallas ajenas al laboratorio). Compilación correcta. Revisión de tipos con 485
  avisos preexistentes, **ninguno** en el laboratorio ni en el baseline.

## 2. Almacenamiento del baseline: reclasificado

`external_verified`, **no** `self_contained`. Los dos JSON de la captura no están dentro
del repositorio: la carpeta `raw/` contiene un único archivo,
`rawSourceReference.json`. La redacción anterior («el completo queda en el raw») era
ambigua y queda corregida por escrito.

Verificación real hecha en P1.0: descarga de ambas referencias externas, tamaños
idénticos a los declarados (3 140 114 y 2 124 bytes), SHA-256 recomputado sobre los
bytes descargados idéntico en los dos casos, JSON válido, y hash canónico embebido
reproducido (3 139 474 bytes canonicalizados → mismo digest). Identidad atada a una
sola invocación mediante `pipelineInvocationCount = 1` presente en los dos archivos y
un `resultSha256` compartido.

No se publicaron archivos nuevos: republicar habría creado copias sin aportar
integridad.

## 3. Dónde nace y dónde se impone la técnica

1. **Nace** en `regionNormalize.js:180`, como valor por defecto:
   `stitch_type: region.stitch_type || 'fill'`. Es normalización, no decisión, y ocurre
   **antes** de que exista cualquier medida física de anchura.
2. **Se sobrescribe** con la etiqueta del LLM en `regionBuilderStage.js:68` cuando hay
   coincidencia semántica. Sigue siendo ciego a la anchura.
3. **Se fija** en `regionBuilder.js:397`: la propuesta geométrica del EIE se calcula y
   se descarta porque cualquier `stitch_type` previo gana. De esa técnica conservada
   cuelgan densidad, compensación, underlay y longitud de puntada.
4. **Se vuelve a forzar** en `contourSafeMode.js:151-163`: toda región no-contorno sin
   `region_class` pasa a `type = 'fill'` y `stitch_type = 'fill'`. Como `region_class`
   solo lo asigna el clasificador experimental (desactivado), en el baseline **las 26
   regiones** pasaron por ese forzado. Es el último escritor antes de todos los
   consumidores. Este forzado **protege funcionalidad existente**: mantiene una sola
   fuente para la separación relleno/contorno y garantiza que todo objeto no-contorno
   entre en la ruta de relleno recortado que usan `ce01SafeFillMode` y la exportación
   DST.

## 4. El planner decide por anchura, pero no manda

`stitchPlanner.js:86,95` clasifica formas estrechas y medias como `satin` a partir de
`mean_width_mm`. Escribe en `plan.sequence[].stitchType`, **no** en la región.
`exportPipeline.js` no importa `stitchPlanner` y `buildFinalCommands` nunca recibe
`ctx.stitchPlan`. Es asesor: solo llega a las regiones si el usuario pulsa «Aplicar» en
el panel del planner.

De ahí el conflicto de A1: `region.density = 0` frente a densidad de plan `0,4`. Son
dos productores distintos que nombran igual campos con semántica distinta. **Resolución
para P1: manda `region`**, porque es lo que leen los consumidores de comandos; el plan
se conserva como observación separada y declarada, nunca se fusiona en silencio ni
rellena un campo ausente.

## 5. Capacidad real de satén

**`SATIN_PARTIALLY_IMPLEMENTED`.** Existe un generador de columna de satén auténtico,
`generateSatinColumnPath` (`contourExportBuilder.js:90-124`), con zigzag transversal,
anchura y densidad. Pero `buildFinalCommands` bifurca por `obj.isContour`, **no por
técnica**, así que ese generador solo es alcanzable para objetos de contorno, y consume
una línea central más una anchura, no el borde de una región rellena.

Para objetos de región, `industrialStitchProcessor.js:368-403` tiene dos ramas:
relleno recortado, o el contorno del polígono a densidad constante. No existe
`autoSplit` ni `splitSatin` en ningún punto del código productivo.

Consecuencia práctica: **etiquetar `satin` una región de relleno la empeora**. Pierde el
relleno, recibe solo su propio contorno y se le añade un underlay de rejilla de satén
bajo una pasada que no es satén. Y Final Look la dibuja más gruesa, lo que hace parecer
que el cambio funcionó.

## 6. Trazas del snapshot guardado

- **A1** (`r_zbgef31`): 0,489 × 16 mm, técnica efectiva `fill`, referencia `satin`. La
  anchura es menor que un solo paso de línea de relleno y aun así se eligió relleno,
  porque la técnica ya estaba fijada cuando la anchura apareció.
- **A8** (`r_zr65703`): 8,008 × 16,019 mm, `fill`, ángulo 89° frente a 0° de la
  referencia, underlay `zigzag` frente a `edge_run_plus_zigzag`. El 89° es dirección de
  líneas de relleno y el 0° dirección de columna: no son la misma magnitud, así que la
  diferencia no es un error de grados.

## 7. Recomendación

**`SATIN_CAPABILITY_FOUNDATION_REQUIRED`.**

El plan P1 previsto —una regla de selección de técnica por anchura tras un flag— no
puede validarse todavía: cambiar la etiqueta no produce satén, produce una geometría
peor. El orden correcto es primero **capacidad**, después **regla**:

1. Una ruta de generación de columna para objetos de región (extraer pares de bordes de
   la frontera de la región y alimentar la columna), con espaciado explícito.
2. Reconciliación declarada `region` ↔ `plan`, con `region` como autoridad.
3. Recolocar el punto de decisión de técnica **después** de la medición de anchura, y
   dejar de descartar la propuesta del EIE.
4. Solo entonces, la regla por anchura tras flag, comparada contra este baseline.

Sin el paso 1, cualquier regla de técnica sería una etiqueta sin geometría.