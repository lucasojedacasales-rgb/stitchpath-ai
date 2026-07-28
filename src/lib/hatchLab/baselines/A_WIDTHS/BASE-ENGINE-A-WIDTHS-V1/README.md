# BASE-ENGINE-A-WIDTHS-V1 — baseline cerrado

Medición **informativa** del motor base sobre la hoja A_WIDTHS (100 × 80 mm, 300 dpi), capturada en la **única invocación autorizada**.
No hay criterio, no hay umbral, no hay pass/fail, no hay reglas aplicadas. Ninguna línea del motor se modificó.

## Contenido

| Archivo | Qué contiene |
|---|---|
| `runManifest.json` | Identidad de la ejecución, estado, digests autoritativos, métricas, `readiness`, huella del pipeline |
| `baselineConfig.json` | Configuración exacta entregada al motor, con procedencia campo a campo |
| `editorParityAudit.json` | Paridad declarativa con la llamada productiva del Editor |
| `engineInputAudit.json` | Prueba de que la entrada no contiene material de referencia Hatch |
| `sourceManifest.json` | Imagen fuente: URL fija, bytes, dimensiones, dpi, SHA-256 |
| `engineFingerprint.json` | Secuencia de etapas y firma del motor tal como se ejecutó |
| `pipelineSnapshot.json` | Extracto estructural del resultado (el completo, 3,14 MB, queda en el raw) |
| `stageLog.json` | Las 9 etapas, duraciones y reparto de tiempo (informativo) |
| `regionsSummary.json` / `.csv` | Una fila por cada una de las 26 regiones, todos los campos escalares del motor |
| `evaluationReport.json` / `.md` | Informe del evaluador, extraído sin alterar conclusiones |
| `semanticAudit.md` | Por qué el motor produjo estos valores, con causas raíz (A–G) |
| `findings.md` | Hallazgos confirmados / provisionales / no disponibles |
| `snapshotHashes.json` | Índice de integridad y procedimiento de hash |
| `raw/rawSourceReference.json` | Referencia a los adjuntos originales entregados |

## Resultado en una línea

26 regiones, **todas `fill`**; 5/5 casos emparejados con optimalidad probada; la anchura (0,489 → 8,008 mm) **no cambia la técnica**; la compensación queda en 0 o ≈0,205 frente a los 0,4 de la referencia; el underlay es la única dimensión que ya reacciona a la anchura.

## Reglas de uso

- **Inmutable.** Cualquier edición dentro de esta carpeta invalida el baseline. Una nueva medición exige un `baselineId` distinto en otra tarea.
- **No es una validación.** No declara calidad ni conformidad; describe el estado previo a cualquier regla.
- **No alimenta el motor.** Ningún valor de aquí debe leerse en tiempo de ejecución por el pipeline productivo.
- La guarda persistente del arnés quedó en `completed`: no admite reinicio, por diseño.