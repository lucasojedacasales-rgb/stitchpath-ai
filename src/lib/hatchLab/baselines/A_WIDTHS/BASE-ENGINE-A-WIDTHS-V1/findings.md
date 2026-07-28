# Hallazgos · BASE-ENGINE-A-WIDTHS-V1

Clasificación explícita. **Ningún hallazgo aplica criterio, umbral ni pass/fail.**

## Confirmados (evidencia en la captura + código leído)

1. **El motor nunca elige satén en esta hoja.** 26/26 `fill`; 0 satén; 0 puntada corrida.
2. **La anchura no influye en la técnica.** De 0,489 a 8,008 mm el resultado es idéntico en técnica.
3. **`fill` cubre dos físicas distintas.** 17 regiones con densidad 0,4 y compensación ≈0,205; 9 con densidad 0 y compensación 0.
4. **La compensación es sistemáticamente inferior a la referencia.** 0,205 frente a 0,4 en A5–A8; 0 frente a 0,4 en A1.
5. **A1 presenta tres conflictos internos región/plan** (`densityMm`, `underlayEnabled`, `underlayDensityMm`), no comparados por el evaluador.
6. **El underlay sí reacciona a la anchura.** `edge_walk` → `edge_walk_zigzag` → `zigzag` según ancho/área; A8 cruza el umbral superior.
7. **Los ángulos son de relleno**, no direcciones de columna de satén (45° por defecto, 88–91° por eje vertical).
8. **No hay objetos de contorno** en la colección final: `region_class`, `parentRegionId` y `contourPointCount` son nulos en las 26 regiones.
9. **Las 9 etapas del pipeline terminaron correctamente**; la captura es un resultado íntegro, no un fallo parcial.
10. **Asignación probada óptima**: 5/5 emparejados, 0 ambiguos, búsqueda completa, sin límites aplicados.

## Provisionales (coherentes con la evidencia, sin verificación independiente)

1. La primera anulación de técnica proviene de un valor por defecto de la etapa previa a `region_builder`; el punto exacto donde ese valor por defecto se introduce no se ha confirmado ejecutando el motor.
2. Los umbrales concretos que llevan A8 a `zigzag` se han leído en el código, pero no se han barrido con anchuras intermedias.
3. La banda 0,202–0,211 de compensación parece derivar del área y del tejido; la fórmula exacta no se ha reproducido numéricamente.

## No disponibles (el motor no expone el concepto)

- `autoSplit` · `spacingMode` · `spacingMm` · `primaryLengthMm` · `secondaryLengthMm` · `secondarySpacingMm` · `secondaryUnderlay`.
- `spacingMm` es además `not_comparable`: no está verificado que `region.density` sea la misma magnitud que el espaciado de Hatch.
- Underlay de referencia «Corrido centrado» (A1, A5): sin normalización, por lo que la comparación de underlay no es concluyente en esos dos casos.

## Insumo para P1 (sin implementar nada aquí)

El único punto de intervención que se deduce de estos hallazgos es la **selección de técnica por anchura**: es la causa raíz que bloquea toda la matriz A. Compensación, espaciado y autoSplit dependen de que exista primero una técnica de satén real, por lo que no deben tocarse antes.