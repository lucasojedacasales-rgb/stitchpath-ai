# APP_UI_SURFACE_CLEANUP_REPORT_V1 — StitchPath AI

> Fecha: 2026-07-05
> Alcance: limpieza global de interfaz del Editor
> Tipo: organización visual únicamente

---

## Flags de validación

| Flag | Valor |
|---|---:|
| simpleModeDefault | true |
| labModeAvailable | true |
| feetTabHiddenInSimple | true |
| footDiagnosticMovedOrLabOnly | true |
| leftSidebarSimplifiedInSimple | true |
| debugBarsHiddenInSimple | true |
| exportModalUnchanged | true |
| exportLogicUnchanged | true |
| motorFilesUnchanged | true |

---

## tabsVisibleInSimple

- Editor
- Máscara
- Simular
- Final

---

## tabsHiddenInSimple

- Planner
- Travel
- Validar
- Detalles
- Diagnóstico
- Pies
- Profesional
- Aprendizaje
- Panel

---

## Cambios visuales realizados

- Se añadió modo global de interfaz en el editor: `simple` / `lab`.
- Simple es el modo por defecto.
- La cabecera muestra dos opciones: “Vista limpia” y “Herramientas técnicas”.
- En Simple solo se muestran pestañas de usuario final.
- Las herramientas técnicas quedan disponibles en Laboratorio.
- La pestaña Pies deja de aparecer como pestaña principal en Simple.
- El diagnóstico de pies / contorno inferior queda dentro de Diagnóstico en Laboratorio, etiquetado como solo lectura y técnico.
- La barra lateral izquierda en Simple muestra solo ConfigPanel básico.
- Los paneles técnicos de la izquierda quedan dentro de Avanzado · Laboratorio.
- Las barras debug inferiores quedan ocultas en Simple.
- En Laboratorio, la barra de comandos aparece bajo “Debug de sincronización de comandos”.

---

## Restricciones respetadas

No se modificó:

- motor de digitalización
- buildFinalCommands
- applyProfessionalPipeline
- V5.1 export repair
- Travel Polish
- Safe Tie V2
- SATIN_OUTER_CONTOUR_CONVERTER_V1
- REFERENCE_TRIM_GUARD_V1
- REFERENCE_VISIBLE_STITCH_SPLITTER_V1_2
- UNDERLAY_GENERATOR_V1
- DST encoder
- DSB encoder
- CE01 validator
- getEffectiveExportCommands
- handleExport
- ExportModal logic
- ExportRepairPanel logic
- informes de pipeline
- validadores
- encoders
- Reference Learning

---

## Estado final

APP_UI_SURFACE_CLEANUP_V1 aplicado como limpieza visual y navegación, sin cambios de lógica productiva.