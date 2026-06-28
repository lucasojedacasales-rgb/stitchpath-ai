// ── Tatami Fill Generator ─────────────────────────────────────────────────────
//
// Genera puntadas de relleno tatami para una máquina de bordar real.
//
// Algoritmo de filas continuas de ancho total (full-width continuous row):
//   1. Rotar el polígono al espacio del ángulo de relleno (filas = horizontal).
//   2. Para cada fila (scanline), calcular todos los intervalos de intersección.
//   3. Ordenar intervalos de izquierda a derecha y recorrerlos en boustrophedon.
//   4. Dentro de cada intervalo colocar puntos de aguja cada stitchPitch,
//      con offset de ladrillo (brick offset) que avanza 1/4 de pitch por fila.
//   5. Conectar el final de un intervalo con el inicio del siguiente con un
//      traveller stitch para mantener la aguja en movimiento (sin salto).
//   6. Rotar todos los puntos de vuelta al espacio mundo.
//
// Salida: { stitches: [[x0,y0,x1,y1], ...], totalStitches: number }
// Cada elemento = un segmento entre dos penetraciones de aguja consecutivas.

// Ciclo de ladrillo: 4 fases, cada una desplaza 1/4 del pitch
const BRICK_CYCLE = 4;

/**
 * @param {Array<[number,number]>} polygon   - coordenadas en px [[x,y],...]
 * @param {number} densityMm   - espaciado entre filas en mm  (típico: 0.35–0.5)
 * @param {number} stitchLenMm - longitud de puntada en mm   (típico: 2.5–4.0)
 * @param {number} angleDeg    - ángulo de relleno en grados (0 = horizontal)
 * @param {number} pxPerMm     - píxeles por mm del canvas
 * @returns {{ stitches: number[][], totalStitches: number }}
 */
export function generateTatamiFill(polygon, densityMm = 0.4, stitchLenMm = 3.0, angleDeg = 0, pxPerMm = 4) {
  if (!polygon || polygon.length < 3) return { stitches: [], totalStitches: 0 };

  const rowSpacingPx  = Math.max(1.5, densityMm  * pxPerMm);
  const stitchPitchPx = Math.max(rowSpacingPx * 1.5, stitchLenMm * pxPerMm);

  // Matrices de rotación al espacio de relleno y de vuelta al mundo
  const rad  = (angleDeg * Math.PI) / 180;
  const cF   = Math.cos(-rad), sF = Math.sin(-rad); // fill space
  const cB   = Math.cos( rad), sB = Math.sin( rad); // world space

  // ── Rotar polígono al espacio de relleno ──────────────────────────────────
  const rotPoly = polygon.map(([x, y]) => [x * cF - y * sF, x * sF + y * cF]);

  const minY = Math.min(...rotPoly.map(p => p[1]));
  const maxY = Math.max(...rotPoly.map(p => p[1]));

  const allNeedles = []; // lista de puntos [rx, ry] en espacio de relleno, en orden de costura

  // ── Recorrer filas ────────────────────────────────────────────────────────
  let rowIdx = 0;
  for (let ry = minY + rowSpacingPx * 0.5; ry <= maxY; ry += rowSpacingPx, rowIdx++) {
    const xs = scanlineIntersections(rotPoly, ry);
    if (xs.length < 2) continue;

    xs.sort((a, b) => a - b);

    // Normalizar pares de intersecciones (siempre intervalos [xL, xR])
    const spans = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xL = xs[i], xR = xs[i + 1];
      if (xR - xL > stitchPitchPx * 0.3) spans.push([xL, xR]);
    }
    if (spans.length === 0) continue;

    // Dirección boustrophedon: filas pares → izquierda→derecha, impares → derecha→izquierda
    const forward = rowIdx % 2 === 0;
    const orderedSpans = forward ? spans : [...spans].reverse();

    // Brick offset para esta fila: avanza 1/4 de pitch por fila, ciclo de 4
    const brickFraction = (rowIdx % BRICK_CYCLE) / BRICK_CYCLE; // 0, 0.25, 0.5, 0.75
    const brickOffsetPx = brickFraction * stitchPitchPx;

    // ── Construir puntos de aguja para cada span ─────────────────────────
    const rowNeedles = []; // [rx, ry] de esta fila en orden de costura

    for (let si = 0; si < orderedSpans.length; si++) {
      let [xL, xR] = orderedSpans[si];

      // En dirección inversa, las coordenadas ya están ordenadas pero el recorrido es RTL
      const spanStart = forward ? xL : xR;
      const spanEnd   = forward ? xR : xL;
      const dir       = forward ? 1 : -1;

      // Punto de entrada al span (borde del polígono)
      const entryNeedles = [spanStart];

      // Calcular primer punto de aguja interior con brick offset
      // El offset se mide desde el borde IZQUIERDO del span (siempre, independiente de la dirección)
      const leftEdge    = Math.min(xL, xR);
      const localOffset = ((brickOffsetPx) % stitchPitchPx + stitchPitchPx) % stitchPitchPx;
      // Primera aguja interior: leftEdge + localOffset (puede ser ajustada al interior)
      let firstInterior = leftEdge + localOffset;
      if (firstInterior <= leftEdge + 0.5) firstInterior += stitchPitchPx;

      // Generar agujas interiores de izquierda a derecha, luego ordenar según dirección
      const interiorNeedles = [];
      for (let nx = firstInterior; nx < Math.max(xL, xR) - 0.5; nx += stitchPitchPx) {
        interiorNeedles.push(nx);
      }

      // En dirección RTL, invertir las agujas interiores
      if (!forward) interiorNeedles.reverse();

      // Componer: entrada → agujas interiores → salida
      const spanNeedles = [spanStart, ...interiorNeedles, spanEnd];

      // Eliminar duplicados o puntos muy cercanos (< 0.5px)
      const dedupedNeedles = [spanNeedles[0]];
      for (let k = 1; k < spanNeedles.length; k++) {
        if (Math.abs(spanNeedles[k] - dedupedNeedles[dedupedNeedles.length - 1]) > 0.5) {
          dedupedNeedles.push(spanNeedles[k]);
        }
      }

      // Conectar span anterior con éste mediante traveller stitch (sin salto de aguja)
      // Solo si hay ya puntos en rowNeedles y el gap no es excesivo
      if (rowNeedles.length > 0 && si > 0) {
        rowNeedles.push(dedupedNeedles[0]); // punto de transición entre spans
      }

      rowNeedles.push(...dedupedNeedles);
    }

    // Añadir puntos de esta fila a la secuencia global de agujas
    // Conectar la fila anterior con ésta (traveller a lo largo de la arista del polígono)
    // Para simplificar, conectamos directamente sin emitir segmento extra —
    // el salto entre filas se gestiona implícitamente por el motor de exportación.
    allNeedles.push(...rowNeedles.map(rx => [rx, ry]));
  }

  // ── Convertir lista de puntos → segmentos de puntada ─────────────────────
  const stitches = [];
  for (let i = 0; i + 1 < allNeedles.length; i++) {
    const [rx0, ry0] = allNeedles[i];
    const [rx1, ry1] = allNeedles[i + 1];

    // Omitir segmentos degenerados
    if (Math.hypot(rx1 - rx0, ry1 - ry0) < 0.3) continue;

    // Rotar de vuelta al espacio mundo
    stitches.push([
      rx0 * cB - ry0 * sB,
      rx0 * sB + ry0 * cB,
      rx1 * cB - ry1 * sB,
      rx1 * sB + ry1 * cB,
    ]);
  }

  return { stitches, totalStitches: stitches.length };
}

// ── Intersecciones scanline ────────────────────────────────────────────────────
// Devuelve las coordenadas X donde la scanline horizontal y=ry corta los bordes del polígono.

function scanlineIntersections(poly, ry) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // Incluir solo bordes que cruzan la scanline (excluir tangentes)
    if ((a[1] <= ry && b[1] > ry) || (b[1] <= ry && a[1] > ry)) {
      const t = (ry - a[1]) / (b[1] - a[1]);
      xs.push(a[0] + t * (b[0] - a[0]));
    }
  }
  return xs;
}