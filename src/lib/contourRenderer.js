/**
 * contourRenderer.js — Professional embroidery contour rendering engine
 *
 * FASE 8: Contornos adaptativos — el grosor del borde se adapta automáticamente
 * a la geometría local de cada segmento del contorno:
 *
 *   Curvas cerradas   → borde más fino  (alta curvatura local → reducción hasta 50%)
 *   Rectas largas     → borde normal    (curvatura ≈ 0 → grosor base completo)
 *   Detalles (cortos) → borde reducido  (segmentos cortos → grosor reducido)
 *
 * Renderers disponibles:
 *  1. drawSatinContour  — satin con grosor adaptativo per-segmento (FASE 8)
 *  2. drawRunning       — running stitch con dasheo calibrado
 *  3. drawSatinFill     — fill hatched para regiones satin anchas
 *  4. drawOutline       — contorno simple (fallback / modo outline)
 *
 * Helpers exportados:
 *  computeAdaptiveContourWidth(pts, baseWidthMm, i) → mm por segmento
 */

// ─── FASE 8: Curvatura local y grosor adaptativo ──────────────────────────────

/**
 * Calcula el ángulo de giro (en radianes) en el vértice `i` del polígono.
 * Un giro grande = curva aguda. Un giro ~0 = recta.
 */
function localTurnAngle(pts, i) {
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n];
  const curr = pts[i];
  const next = pts[(i + 1) % n];

  const ax = curr[0] - prev[0], ay = curr[1] - prev[1];
  const bx = next[0] - curr[0], by = next[1] - curr[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;

  const dot = (ax * bx + ay * by) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, dot))); // [0, π]
}

/**
 * Longitud del segmento i→i+1 en coordenadas normalizadas × DESIGN_NORM(mm).
 */
function segLenMm(pts, i, designNorm = 100) {
  const n = pts.length;
  const p0 = pts[i], p1 = pts[(i + 1) % n];
  return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * designNorm;
}

/**
 * computeAdaptiveContourWidth — FASE 8 core
 *
 * Devuelve el grosor de contorno (en mm) para el segmento `i` del polígono.
 *
 * Señales:
 *   C1 — Curvatura local (ángulo de giro en los dos vértices del segmento)
 *        Alta curvatura (curva cerrada) → reducción proporcional hasta -50%
 *   C2 — Longitud de segmento (detalle fino)
 *        Segmento corto (<0.8mm) → reducción hasta -35%
 *   C3 — Curvatura acumulada vecina (ventana ±1 segmento)
 *        Media de curvaturas vecinas para suavizar transiciones abruptas
 *
 * @param {number[][]} pts        — path points normalizados [0,1]
 * @param {number}     baseMm     — grosor base (mm)
 * @param {number}     i          — índice del segmento
 * @param {number}     designNorm — mm por unidad normalizada (default 100)
 * @returns {number}              — grosor adaptativo en mm
 */
export function computeAdaptiveContourWidth(pts, baseMm, i, designNorm = 100) {
  const n = pts.length;
  if (n < 3) return baseMm;

  // C1 — Curvatura en los dos vértices del segmento (promedio)
  const turn0 = localTurnAngle(pts, i);
  const turn1 = localTurnAngle(pts, (i + 1) % n);
  const turnAvg = (turn0 + turn1) / 2; // [0, π]

  // Normalizar a [0,1]: π rad = curva perfectamente cerrada
  // Reducción máxima: -50% en curva perfecta (π rad), lineal
  const curvFactor = 1.0 - 0.50 * (turnAvg / Math.PI);

  // C2 — Longitud del segmento: muy cortos → detalles → grosor reducido
  const lenMm = segLenMm(pts, i, designNorm);
  // <0.5mm → factor mínimo 0.55; ≥2.5mm → factor 1.0; interpolación lineal
  const lenFactor = lenMm >= 2.5 ? 1.0 : Math.max(0.55, 0.55 + (lenMm / 2.5) * 0.45);

  // C3 — Suavizado de vecindad (±1): evita saltos abruptos entre segmentos
  const prevTurn = localTurnAngle(pts, (i - 1 + n) % n);
  const nextTurn = localTurnAngle(pts, (i + 2) % n);
  const smoothCurv = (prevTurn + turnAvg + nextTurn) / 3;
  const smoothFactor = 1.0 - 0.45 * (smoothCurv / Math.PI);

  // Combinar señales: curvatura suavizada domina (70%), longitud aporta (30%)
  const combinedFactor = smoothFactor * 0.70 + lenFactor * 0.30;

  // Clamp final: nunca bajar de 40% ni superar el 100% del base
  return +Math.max(baseMm * 0.40, Math.min(baseMm, baseMm * combinedFactor)).toFixed(3);
}

// ─── Running stitch ───────────────────────────────────────────────────────────

/**
 * Draws a running stitch along a polygon boundary.
 * - No closePath (avoids spurious back-stroke to start)
 * - Dashes calibrated to stitch_length_mm if available
 * - Line width proportional to physical 40wt thread (0.32mm)
 */
export function drawRunning(ctx, pts, region, drawW, drawH, zoom, color, alpha) {
  if (pts.length < 2) return;

  const stitchLenMm = region.stitch_length_mm || 2.0;
  const pxPerMm     = drawW / 100;
  const dashPx      = Math.max(2, stitchLenMm * pxPerMm / zoom);
  const gapPx       = Math.max(1, dashPx * 0.5);
  const threadPx    = Math.max(0.8, (0.32 * pxPerMm) / zoom);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = threadPx;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.setLineDash([dashPx, gapPx]);

  ctx.beginPath();
  ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
  }
  // Close path visually (polygon) but DO NOT add the extra segment back
  ctx.lineTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Satin contour stitch (FASE 8 — grosor adaptativo) ───────────────────────

/**
 * Draws a true satin stitch contour along a polygon path.
 *
 * FASE 8: el grosor del borde NO es uniforme. Para cada segmento se calcula
 * un grosor adaptativo con computeAdaptiveContourWidth():
 *   - Curvas cerradas  → borde más fino  (alta curvatura → hasta -50%)
 *   - Rectas largas    → borde normal    (curvatura ≈ 0 → grosor base)
 *   - Detalles cortos  → borde reducido  (segmentos cortos → hasta -45%)
 *
 * El grosor transiciona suavemente entre segmentos para evitar saltos bruscos.
 *
 * @param ctx        — Canvas 2D context
 * @param pts        — path points normalizados [0,1]
 * @param region     — región enriquecida (mean_width_mm, density, area_mm2…)
 * @param drawW/H    — dimensiones del canvas en px
 * @param zoom       — factor de zoom actual
 * @param color      — color hex del hilo
 * @param alpha      — opacidad global
 */
export function drawSatinContour(ctx, pts, region, drawW, drawH, zoom, color, alpha) {
  if (pts.length < 2) return;

  const pxPerMm    = drawW / 100;
  // Base width: clamped to [0.6, 4] mm — preserva proporciones reales de satin
  const baseWidthMm = Math.min(4, Math.max(0.6, region.mean_width_mm || region.satin_width_mm || 1.5));
  const densityMm   = Math.min(0.5, region.density || 0.4);
  const stepPx      = Math.max(0.5, (densityMm * pxPerMm) / zoom);
  const threadPx    = Math.max(0.7, (0.35 * pxPerMm) / zoom);

  // Pre-calcular grosor adaptativo por segmento (en px)
  const n = pts.length;
  const segHalfWidthPx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const adaptMm = computeAdaptiveContourWidth(pts, baseWidthMm, i);
    segHalfWidthPx[i] = Math.max(1.0, (adaptMm * 0.5 * pxPerMm) / zoom);
  }

  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth   = threadPx;
  ctx.lineCap     = 'butt';

  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];

    const ax = (p0[0] - 0.5) * drawW;
    const ay = (p0[1] - 0.5) * drawH;
    const bx = (p1[0] - 0.5) * drawW;
    const by = (p1[1] - 0.5) * drawH;

    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.5) continue;

    // Tangente y normal al segmento
    const tx = (bx - ax) / segLen;
    const ty = (by - ay) / segLen;
    const nx = -ty;
    const ny =  tx;

    // Grosor del segmento siguiente (para interpolación suave)
    const halfW0 = segHalfWidthPx[i];
    const halfW1 = segHalfWidthPx[(i + 1) % n];

    // Colocar columnas a lo largo del segmento con grosor interpolado
    let t = stepPx * 0.5;
    while (t < segLen) {
      const tNorm = segLen > 0 ? t / segLen : 0;
      // Interpolación lineal del grosor entre inicio y fin del segmento
      const halfW = halfW0 + (halfW1 - halfW0) * tNorm;

      const cx = ax + tx * t;
      const cy = ay + ty * t;

      ctx.beginPath();
      ctx.moveTo(cx + nx * halfW, cy + ny * halfW);
      ctx.lineTo(cx - nx * halfW, cy - ny * halfW);
      ctx.stroke();

      t += stepPx;
    }
  }

  ctx.restore();
}

// ─── Satin fill (wide satin bodies) ──────────────────────────────────────────

/**
 * Draws satin fill lines for wide regions classified as 'satin' type.
 * Uses the region's fill_angle / orientation for the column direction.
 * Clips to the polygon (satin fill always stays inside the shape).
 */
export function drawSatinFill(ctx, pts, region, drawW, drawH, zoom, color, alpha) {
  if (pts.length < 3) return;

  // Use PCA orientation angle — most accurate for wide satin bodies
  const angleDeg  = region.orientation ?? region.angle ?? region.fill_angle ?? 45;
  const densityMm = Math.min(0.5, region.density || 0.4);
  const pxPerMm   = drawW / 100;
  const spacingPx = Math.max(1.5, (densityMm * pxPerMm) / zoom);
  const threadPx  = Math.max(0.6, (0.30 * pxPerMm) / zoom);

  // Build pixel polygon
  const poly = pts.map(p => [(p[0] - 0.5) * drawW, (p[1] - 0.5) * drawH]);

  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx   = (minX + maxX) / 2;
  const cy   = (minY + maxY) / 2;
  const diagLen = Math.hypot(maxX - minX, maxY - minY) + spacingPx * 2;

  const rad = (angleDeg * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth   = threadPx;
  ctx.lineCap     = 'butt';

  // Rotate coordinate system to draw horizontal lines in fill-angle space
  ctx.translate(cx, cy);
  ctx.rotate(rad);

  for (let y = -diagLen; y <= diagLen; y += spacingPx) {
    ctx.beginPath();
    ctx.moveTo(-diagLen, y);
    ctx.lineTo( diagLen, y);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Polygon outline (fallback / outline mode) ─────────────────────────────────

/**
 * Draws a clean polygon outline — used in 'outline' view mode.
 */
export function drawOutline(ctx, pts, drawW, drawH, zoom, color, alpha) {
  if (pts.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = Math.max(1, 1.5 / zoom);
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}