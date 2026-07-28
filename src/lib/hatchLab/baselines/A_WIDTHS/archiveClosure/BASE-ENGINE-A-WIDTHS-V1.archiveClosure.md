# Cierre honesto del almacenamiento — BASE-ENGINE-A-WIDTHS-V1

Este documento vive **fuera** de la carpeta inmutable. Nada dentro de
`BASE-ENGINE-A-WIDTHS-V1/` fue modificado.

## Clasificación

**`external_verified`** — no `self_contained`.

Comprobación física de la carpeta `raw/` del baseline: contiene **un solo archivo**,
`rawSourceReference.json` (2 479 bytes). Los dos JSON de la captura **no están dentro
del repositorio**:

| Archivo | ¿En repositorio? | Tamaño real | SHA-256 recomputado | Coincide con lo declarado |
|---|---|---|---|---|
| `BASE-ENGINE-A-WIDTHS-V1.capture.json` | No | 3 140 114 B | `7BB259D7…E55649` | sí |
| `BASE-ENGINE-A-WIDTHS-V1.summary.json` | No | 2 124 B | `2CE392AF…4598CAD` | sí |

Corrección explícita del cierre anterior: la frase «el completo queda en el raw» era
ambigua y podía leerse como «almacenado en el repositorio». No lo está. Lo que hay es
una **referencia externa verificada** más un archivo en IndexedDB del navegador que
ejecutó la captura.

## Verificación de recuperación realizada en P1.0

1. Descarga real de ambas referencias externas.
2. Tamaños idénticos a los declarados (3 140 114 y 2 124 bytes).
3. SHA-256 recomputado sobre los bytes descargados: idéntico en ambos casos.
4. JSON válido en ambos casos.
5. Identidad: `baselineId` y `invocationId` presentes en el summary;
   `pipelineInvocationCount = 1` presente en los dos archivos; `resultSha256`
   compartido, lo que ata ambos a la misma y única invocación.
6. Hash canónico embebido reproducido: canonicalización con claves ordenadas
   recursivamente, `indent 2`, UTF-8, sin `resultSha256` → 3 139 474 bytes →
   `3C1525AD…F40DBAA`, igual al valor embebido.

No se publicó ningún archivo nuevo: las referencias existentes ya eran recuperables y
verificables, así que republicar habría creado copias sin aportar integridad.

## Limitaciones

- La recuperación depende de que el host externo siga sirviendo los archivos.
- El archivo en IndexedDB (`hatch_lab_baselines` / `a_widths_captures` / clave
  `BASE-ENGINE-A-WIDTHS-V1-2026-07-28T19:56:13.507Z`) solo existe en el perfil de
  navegador que ejecutó la captura y no es inspeccionable desde esta auditoría.
- No se ejecutó el motor ni se generó una segunda captura; la guarda persistente
  sigue intacta y sin ruta de reinicio.