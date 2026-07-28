# Auditoría semántica · BASE-ENGINE-A-WIDTHS-V1

Diagnóstico **solo de lectura**. Explica por qué el motor base produjo estos valores, citando el código real.
No se ha modificado ninguna línea del motor y no se ha ejecutado el motor otra vez.

---

## A · Todas las regiones salen `fill`, incluso las de 0,5 mm

26 de 26 regiones llevan `stitch_type: "fill"`. Ninguna es satén y ninguna es puntada corrida, aunque el propio plan narra decisiones de satén en `plan.sequence[].reason`.

**Causa encadenada:**

1. `region_builder` recibe cada región vectorizada con un `stitch_type` ya presente (valor por defecto de la etapa previa, no una decisión geométrica).
2. En `src/lib/regionBuilder.js` ese valor se trata como **anulación explícita de producción**: si la región ya trae `stitch_type`, la decisión del motor de inteligencia (EIE) se conserva únicamente como texto de justificación y **no** como técnica efectiva.
3. Un forzado posterior de coherencia visual vuelve a escribir `fill` sobre el objeto final, de modo que ni siquiera un satén decidido por EIE sobreviviría al final del pipeline.

**Consecuencia:** la anchura no interviene en la elección de la técnica. La rejilla A1–A8 (0,5 → 8 mm) no puede diferenciarse, porque la decisión ya está fijada antes de medir.
**Estado:** confirmado por lectura de código y coherente con la evidencia capturada (`plan` narra satén, `stitch_type` es `fill`).

---

## B · Dos familias de parámetros bajo una sola etiqueta

- 17 regiones: `density 0.4`, `pull_compensation` 0,202–0,211, underlay activo, prioridad 4–5.
- 9 regiones: `density 0`, `pull_compensation 0`, sin underlay, prioridad 9–10, ángulos 45° o 174°.

La segunda familia corresponde a la rama de **puntada corrida** del EIE: sin densidad y sin compensación porque una línea no tiene relleno. Pero la etiqueta final sigue siendo `fill`.
**Consecuencia:** el mismo valor `fill` designa dos comportamientos físicos distintos, y A1 (0,489 mm) cae en la familia sin densidad ni compensación.
**Estado:** confirmado.

---

## C · Compensación 0 en A1 y 0,205 en A5–A8; nunca 0,4

La compensación del motor no es un parámetro de satén: se calcula sobre el modelo de relleno y el tejido (Algodón), lo que produce una banda estrecha alrededor de 0,20 mm para toda la familia con densidad, y exactamente 0 para la familia sin densidad.
La referencia Hatch usa 0,4 mm en los cinco casos.
**Estado:** confirmado. La diferencia de −0,195 mm (y −0,4 en A1) es sistemática, no un caso aislado.

---

## D · A1 arrastra tres conflictos entre región y plan

Para `r_zbgef31` la región dice densidad 0, underlay desactivado y densidad de underlay 0, mientras el plan dice 0,4, underlay activo y densidad 1.
El plan se calcula en `stitch_planner` desde la geometría, sin leer la anulación aplicada en `region_builder`; ambos quedan en el resultado sin reconciliarse.
El evaluador hace lo correcto: marca `conflict` y **no compara** esos tres campos.
**Estado:** confirmado. Es una inconsistencia interna del motor, no del evaluador.

---

## E · A8 termina en `zigzag` y A5–A7 en `edge_run_plus_zigzag`

El underlay se selecciona por umbral de anchura y área dentro de la lógica de underlay recomendado: por encima de cierto ancho la variante pasa a zigzag pleno con densidad 0,95 en lugar de recorrido de borde más zigzag con 0,76.
A8 (8,008 mm) cruza ese umbral; A5–A7 no.
**Estado:** confirmado. Coincide con la referencia en A6 y A7, difiere en A8 y no es comparable en A1 y A5 (la referencia «Corrido centrado» no está normalizada).

---

## F · Los ángulos 45° y 89° no significan «dirección de satén»

45° es el valor por defecto cuando el análisis geométrico no encuentra una orientación dominante fiable; 88°–91° aparecen cuando el eje principal de la forma es casi vertical. Son ángulos de **relleno**, medidos sobre la forma.
La referencia Hatch indica 0° en A7 y A8, que es la dirección de la columna de satén: magnitudes distintas.
**Estado:** confirmado, y por eso la comparación de ángulo se registra como `different` sin criterio.

---

## G · No existe autoSplit ni generación real de columnas de satén

`autoSplit`, `spacingMode`, `spacingMm` y las longitudes primaria/secundaria se reportan `unavailable` porque el motor **no tiene** ese concepto: no hay divisor automático de puntadas largas ni un generador de columnas de satén con espaciado explícito.
**Estado:** confirmado por ausencia en el código, no por ausencia en la captura.

---

## Resumen de causas raíz

1. La técnica se fija antes de medir la anchura y se refuerza después (A).
2. `fill` cubre dos físicas distintas (B).
3. La compensación proviene del modelo de relleno, no del satén (C).
4. Región y plan no se reconcilian (D).
5. El underlay sí responde a la anchura (E) — es la única dimensión que ya reacciona a la geometría.
6. Los ángulos son de relleno (F) y el satén como técnica no está implementado (G).

Ninguna de estas observaciones activa un criterio, un umbral ni un pass/fail. Son insumo para la fase P1.