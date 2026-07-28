# Seed real A_WIDTHS — subconjunto P0.2B (A1, A5, A6, A7, A8)

Primer subconjunto **real** (no sintético) del Hatch Lab, convertido desde el
paquete verificado `01_ANCHURAS` (5 ZIPs, 89 archivos, 89/89 hashes coincidentes,
5/5 hashes de ZIP coincidentes).

**Estado**

- Esquema utilizado: `seedSchema.js` **v1.1.0** (sin modificaciones).
- `expectedResult: null` en los cinco casos.
- `benchmarkReady: false`, `motorIntegrationReady: false`, `physicalValidationAvailable: false`.
- Ninguna regla se aplica al motor. El pipeline no se ejecuta. No hay feature flags ni controles de interfaz.
- Nada fuera de `src/lib/hatchLab/**` y `src/tests/hatchLab/**` importa estos archivos.

**Contenido**

```
README.md
packageProvenance.json     procedencia y verificación del paquete (hashes de las 5 partes)
evidenceIndex.json         las 89 rutas del manifiesto con tipo, extractable y relationStatus
seedManifest.json          seedId, casos, límites y hashes de fuente
index.js                   módulo de solo lectura que expone casos + manifiestos
cases/HATCH-A-WIDTHS-A1.json … A8.json
reports/conversionReport.json
reports/conversionReport.md
```

No se copia ningún binario: los 78 PNG, el EMB, el XLSX y los ZIP se referencian
por ruta, tamaño y SHA-256.

**Política de capturas**

Las 78 capturas quedan asociadas a la fase A_WIDTHS pero **no** a casos
individuales: `relationStatus: "uncertain"`, `relatedCaseIds: []`. No se
extraen valores de ellas ni se usan para generar `expectedResult`.

**Fuentes de los valores**

Cuantitativos: `HATCH-A-WIDTHS-EXACT-map.csv` (nominal, geometría, centro) y
`HATCH-A-WIDTHS-R01-analisis-ABCD.xlsx` hojas `Fila_A`, `Config_comun`,
`Notas_metodo`, `Reglas_candidatas`, `Comparativa_A_B_C_D` (observado, técnica,
underlay, espaciado, compensación). Reglas: `HATCH-A-WIDTHS-reglas.json`
(todas `status: "candidata"`, `physicalValidation: false`).
Interpretaciones: `HATCH-A-WIDTHS-conclusiones.txt`. El EMB es evidencia
`extractable: false`.

**Pruebas**

`src/tests/hatchLab/aWidthsSeedIntegrity.test.js`, registrada en
`runHatchLabTests.js`. Ejecución real vía `src/tests/hatchLab/hatchLabTests.html`
en el servidor de desarrollo de Vite.

**Próximo paso (no implementado aquí)**

Crear un evaluador A_WIDTHS capaz de extraer y comparar técnica, underlay,
espaciado, compensación y anchura por objeto desde un resultado ya generado por
el motor base.