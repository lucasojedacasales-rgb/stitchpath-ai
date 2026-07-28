import { shade, rgba } from './finalLookColors';

// Grosor relativo por tipo de puntada (solo visual).
const KIND_FACTOR = { fill: 0.78, satin: 1.15, contour: 1.25, detail: 1.0 };

/**
 * Dibuja un lote de segmentos de hilo.
 * mode: 'technical' | 'realistic'
 * Devuelve nada — no muta datos de entrada.
 */
export function drawSegmentBatch(ctx, segments, from, to, opts) {
  const {
    toPx, scale, mode, threadMm, selectedRegionId, showDirection,
    dimOthers, lod,
  } = opts;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = from; i < to; i++) {
    const s = segments[i];
    if (opts.filter && !opts.filter(s)) continue;

    const dim = dimOthers && selectedRegionId && s.regionId !== selectedRegionId;
    const [px, py] = toPx(s.x0, s.y0);
    const [cx, cy] = toPx(s.x1, s.y1);
    const base = threadMm * scale * (KIND_FACTOR[s.kind] || 1);
    const wpx = Math.max(0.55, base);

    let color = s.color || '#999999';
    if (s.discarded && opts.highlightDiscarded) color = '#ef4444';

    ctx.globalAlpha = dim ? 0.16 : 1;

    if (mode === 'realistic' && !lod) {
      // Sombra sutil bajo la pasada → sensación de relieve.
      ctx.strokeStyle = rgba(shade(color, -0.72), 0.5);
      ctx.lineWidth = wpx * 1.05;
      ctx.beginPath();
      ctx.moveTo(px + wpx * 0.16, py + wpx * 0.2);
      ctx.lineTo(cx + wpx * 0.16, cy + wpx * 0.2);
      ctx.stroke();
    }

    // Cuerpo del hilo.
    ctx.strokeStyle = mode === 'realistic' ? shade(color, -0.12) : color;
    ctx.lineWidth = wpx;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    if (!lod) {
      // Brillo direccional del hilo (muy moderado).
      const dx = cx - px, dy = cy - py;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const off = wpx * (mode === 'realistic' ? 0.24 : 0.18);
      ctx.strokeStyle = shade(color, mode === 'realistic' ? 0.34 : 0.2);
      ctx.lineWidth = Math.max(0.35, wpx * 0.34);
      ctx.beginPath();
      ctx.moveTo(px + nx * off, py + ny * off);
      ctx.lineTo(cx + nx * off, cy + ny * off);
      ctx.stroke();

      if (mode === 'technical' && (s.kind === 'contour' || s.kind === 'satin')) {
        // Borde del hilo → lectura de bordado, no de trazo vectorial.
        ctx.strokeStyle = rgba(shade(color, -0.55), 0.55);
        ctx.lineWidth = Math.max(0.3, wpx * 0.2);
        ctx.beginPath();
        ctx.moveTo(px - nx * off * 1.5, py - ny * off * 1.5);
        ctx.lineTo(cx - nx * off * 1.5, cy - ny * off * 1.5);
        ctx.stroke();
      }
    }

    if (showDirection && wpx > 2.2 && i % 9 === 0) {
      const dx = cx - px, dy = cy - py;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const a = wpx * 0.9;
      ctx.strokeStyle = rgba('#ffffff', 0.7);
      ctx.lineWidth = Math.max(0.4, wpx * 0.18);
      ctx.beginPath();
      ctx.moveTo(cx - ux * a - uy * a * 0.55, cy - uy * a + ux * a * 0.55);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - ux * a + uy * a * 0.55, cy - uy * a - ux * a * 0.55);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Marcadores de saltos, cortes, inicios y fines. */
export function drawMarkers(ctx, data, opts) {
  const { toPx, showJumps, showTrims, showStartEnd } = opts;
  if (showJumps) {
    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of data.jumps) {
      const [a, b] = toPx(x0, y0); const [c, d] = toPx(x1, y1);
      ctx.moveTo(a, b); ctx.lineTo(c, d);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (showTrims) {
    ctx.fillStyle = 'rgba(239,68,68,0.9)';
    for (const [x, y] of data.trims) {
      const [a, b] = toPx(x, y);
      ctx.fillRect(a - 2.5, b - 2.5, 5, 5);
    }
  }
  if (showStartEnd) {
    ctx.fillStyle = 'rgba(16,185,129,0.95)';
    for (const [x, y] of data.starts) { const [a, b] = toPx(x, y); ctx.beginPath(); ctx.arc(a, b, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(59,130,246,0.95)';
    for (const [x, y] of data.ends) { const [a, b] = toPx(x, y); ctx.beginPath(); ctx.arc(a, b, 3, 0, Math.PI * 2); ctx.fill(); }
  }
}

/** Vista «vectorizado»: polígonos planos de las regiones (solo comparación). */
export function drawVectorPreview(ctx, regions, toPx, w, h, selectedRegionId) {
  for (const r of regions || []) {
    const pts = r.path_points;
    if (!pts || pts.length < 3) continue;
    if (r.visible === false) continue;
    ctx.beginPath();
    const [sx, sy] = toPx((pts[0][0] - 0.5) * w, (pts[0][1] - 0.5) * h);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = toPx((pts[i][0] - 0.5) * w, (pts[i][1] - 0.5) * h);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = selectedRegionId && r.id !== selectedRegionId ? 0.2 : 1;
    ctx.fillStyle = r.color || '#888';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}