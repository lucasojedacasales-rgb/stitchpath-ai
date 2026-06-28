/**
 * physicsSimulator.js — Photorealistic Embroidery Physics Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates per-stitch:
 *  1. Thread volume   — cylindrical cross-section with sub-pixel AA
 *  2. Relief / depth  — ambient occlusion + cast shadow per layer
 *  3. Stitch direction — specular highlight aligned to thread axis
 *  4. Thread tension   — catenary sag on loose stitches
 *  5. Gloss / finish  — rayon (high gloss), cotton (soft), polyester (mid)
 *  6. Fabric deformation — subtle indent under stitch pressure
 *  7. Underlay effect — thinner, compressed baseline visible through top layer
 *  8. Stitch overlap  — inter-layer ambient shadow accumulates realistically
 */

// ─── Color utilities ──────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const h = (hex || '#888888').replace('#', '');
  return { r: parseInt(h.slice(0,2),16)||0, g: parseInt(h.slice(2,4),16)||0, b: parseInt(h.slice(4,6),16)||0 };
}
export function rgbToHex({ r, g, b }) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex({ r: a.r+(b.r-a.r)*t, g: a.g+(b.g-a.g)*t, b: a.b+(b.b-a.b)*t });
}
function darken(hex, f) {
  const { r,g,b } = hexToRgb(hex);
  return rgbToHex({ r:r*(1-f), g:g*(1-f), b:b*(1-f) });
}

// ─── Fabric textures ──────────────────────────────────────────────────────────

export const FABRIC_COLORS = {
  'Algodón':   '#f2ede2',
  'Poliéster': '#eceef4',
  'Denim':     '#3d4a5e',
  'Lino':      '#e5dcc8',
  'Seda':      '#f8f3ec',
  'Lycra':     '#272737',
  'Mezcla':    '#eae5d8',
  'Otro':      '#e0dcd0',
};

/**
 * Draws a realistic fabric background with thread weave pattern.
 * Each fabric has distinct weave scale, color, and sheen.
 */
export function drawFabricTexture(ctx, W, H, fabricType) {
  ctx.clearRect(0, 0, W, H);
  const base = FABRIC_COLORS[fabricType] || FABRIC_COLORS['Algodón'];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  switch (fabricType) {
    case 'Algodón':
    case 'Mezcla':
      _drawPlainWeave(ctx, W, H, '#b09868', 3.5, 0.06, 0.09);
      break;
    case 'Denim':
      _drawTwillWeave(ctx, W, H, '#7090c0', 5, 0.10, 0.08);
      break;
    case 'Lino':
      _drawPlainWeave(ctx, W, H, '#9a8a60', 5, 0.09, 0.11);
      break;
    case 'Seda':
      _drawSilkSheen(ctx, W, H);
      break;
    case 'Poliéster':
      _drawMicroweave(ctx, W, H, '#8090b0', 2, 0.04);
      break;
    case 'Lycra':
      _drawRibKnit(ctx, W, H);
      break;
    default:
      _drawPlainWeave(ctx, W, H, '#a09070', 4, 0.07, 0.08);
  }

  // Vignette for photo-like framing
  const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function _drawPlainWeave(ctx, W, H, color, spacing, alphaH, alphaV) {
  ctx.strokeStyle = color;
  ctx.lineWidth = spacing * 0.35;
  // Warp (vertical)
  ctx.globalAlpha = alphaV;
  for (let x = 0; x < W; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + spacing*0.15, H); ctx.stroke();
  }
  // Weft (horizontal)
  ctx.globalAlpha = alphaH;
  for (let y = 0; y < H; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + spacing*0.1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function _drawTwillWeave(ctx, W, H, color, spacing, alphaD, alphaH) {
  ctx.strokeStyle = color;
  ctx.lineWidth = spacing * 0.4;
  ctx.globalAlpha = alphaD;
  for (let y = -H; y < H*2; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + W*0.5); ctx.stroke();
  }
  ctx.globalAlpha = alphaH * 0.5;
  for (let y = 0; y < H; y += spacing * 3) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function _drawSilkSheen(ctx, W, H) {
  // Anisotropic specular sheen — changes with viewing angle
  for (let band = 0; band < 4; band++) {
    const x = W * (band / 4 + 0.1);
    const g = ctx.createLinearGradient(x, 0, x + W*0.25, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, `rgba(255,255,255,${0.07 + band*0.02})`);
    g.addColorStop(0.5, `rgba(255,255,255,${0.12 + band*0.02})`);
    g.addColorStop(0.6, `rgba(255,255,255,${0.07 + band*0.02})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function _drawMicroweave(ctx, W, H, color, spacing, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function _drawRibKnit(ctx, W, H) {
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#9090d0';
  ctx.lineWidth = 1.5;
  const s = 4;
  for (let x = 0; x < W; x += s) {
    ctx.beginPath();
    for (let y = 0; y < H; y += 8) {
      ctx.moveTo(x, y); ctx.bezierCurveTo(x+s*0.6, y+2, x-s*0.6, y+6, x, y+8);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ─── Fabric deformation ───────────────────────────────────────────────────────

/**
 * Draws a subtle fabric indent/depression under a filled region.
 * Creates the impression that the stitches press into the fabric.
 */
export function drawFabricDeformation(ctx, polygon, color, depth = 0.4) {
  if (polygon.length < 3) return;
  ctx.save();
  // Build path
  ctx.beginPath();
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
  ctx.closePath();

  // Shadow inside polygon = fabric being pressed in
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur  = 6 * depth;
  ctx.shadowOffsetX = 1 * depth;
  ctx.shadowOffsetY = 1.5 * depth;
  ctx.fillStyle = 'rgba(0,0,0,0)'; // just the shadow
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.restore();
}

// ─── Core stitch renderer ─────────────────────────────────────────────────────

/**
 * Draws one physical stitch segment with full photorealistic rendering:
 *  - Thread body: cylindrical gradient (dark edge → bright center → dark edge)
 *  - Tension sag: catenary curve when tension < 0.65
 *  - Specular highlight: axis-aligned gloss stripe
 *  - Ambient occlusion shadow (layer depth)
 *  - Fiber texture micro-noise
 */
export function drawPhysicalStitch(ctx, x0, y0, x1, y1, color, params) {
  const {
    threadThicknessPx = 2.8,
    tension     = 0.75,
    lightAngleDeg = 42,
    glossiness  = 0.45,
    zoom        = 1,
    layerDepth  = 0,    // 0=base, accumulates with stacking
    underlayMode = false,
    fabricDeform = true,
  } = params;

  const thick = Math.max(1.0, threadThicknessPx / Math.max(0.3, zoom));
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.3) return;

  const ux = dx / len, uy = dy / len;   // unit vector along stitch
  const nx = -uy, ny = ux;              // perpendicular (normal)

  // Light direction
  const lightRad = (lightAngleDeg * Math.PI) / 180;
  const lx = Math.cos(lightRad), ly = Math.sin(lightRad);

  // How much the thread faces the light (0..1)
  const threadFacingLight = (nx*lx + ny*ly) * 0.5 + 0.5;
  // How aligned the stitch axis is to light (affects specular width)
  const axialDot = Math.abs(ux*lx + uy*ly);

  const { r: br, g: bg, b: bb } = hexToRgb(color);

  // ── Depth shadow (inter-stitch ambient occlusion) ──────────────────────────
  if (layerDepth > 0.05) {
    const shadowAlpha = Math.min(0.32, layerDepth * 0.18);
    const shadowOffset = Math.min(thick * 0.6, thick * layerDepth * 0.4);
    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
    ctx.lineWidth = thick * 1.35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur  = thick * 1.2;
    ctx.shadowOffsetX = shadowOffset * 0.4;
    ctx.shadowOffsetY = shadowOffset * 0.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.restore();
  }

  // ── Thread body: cylindrical gradient ─────────────────────────────────────
  // Gradient perpendicular to stitch direction
  const midX = (x0+x1)/2, midY = (y0+y1)/2;
  const halfW = thick * 0.72;
  const gx0 = midX + nx * halfW, gy0 = midY + ny * halfW;
  const gx1 = midX - nx * halfW, gy1 = midY - ny * halfW;

  let bodyGrad;
  try {
    bodyGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
  } catch {
    bodyGrad = color;
  }

  if (bodyGrad && bodyGrad.addColorStop) {
    // Lambertian shading: the lit side is brighter
    const litSide   = threadFacingLight;       // 0..1
    const darkSide  = 1 - threadFacingLight;

    const lightBoost = 0.30 + litSide * 0.35;
    const darkDip    = 0.22 + darkSide * 0.18;

    const cLight  = { r: Math.min(255,br+(255-br)*lightBoost), g: Math.min(255,bg+(255-bg)*lightBoost), b: Math.min(255,bb+(255-bb)*lightBoost) };
    const cBase   = { r: br, g: bg, b: bb };
    const cDark   = { r: br*(1-darkDip), g: bg*(1-darkDip), b: bb*(1-darkDip) };
    const cEdge   = { r: br*(1-darkDip-0.12), g: bg*(1-darkDip-0.12), b: bb*(1-darkDip-0.12) };

    const alpha = underlayMode ? 0.62 : 0.97;

    bodyGrad.addColorStop(0.00, `rgba(${Math.round(cEdge.r)},${Math.round(cEdge.g)},${Math.round(cEdge.b)},${(alpha*0.82).toFixed(2)})`);
    bodyGrad.addColorStop(0.18, `rgba(${Math.round(cDark.r)},${Math.round(cDark.g)},${Math.round(cDark.b)},${(alpha*0.92).toFixed(2)})`);
    bodyGrad.addColorStop(0.50, `rgba(${Math.round(cLight.r)},${Math.round(cLight.g)},${Math.round(cLight.b)},${alpha.toFixed(2)})`);
    bodyGrad.addColorStop(0.82, `rgba(${Math.round(cBase.r)},${Math.round(cBase.g)},${Math.round(cBase.b)},${(alpha*0.93).toFixed(2)})`);
    bodyGrad.addColorStop(1.00, `rgba(${Math.round(cEdge.r)},${Math.round(cEdge.g)},${Math.round(cEdge.b)},${(alpha*0.80).toFixed(2)})`);
  }

  ctx.strokeStyle = bodyGrad || color;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Tension: catenary sag ─────────────────────────────────────────────────
  const sag = tension < 0.65 && len > thick * 4
    ? thick * (1 - tension) * 1.4
    : 0;

  ctx.beginPath();
  if (sag > 0.3) {
    // Catenary approximation: bezier with sag midpoint
    const sagX = midX + ny * sag;
    const sagY = midY + nx * sag * 0.35;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(sagX, sagY, x1, y1);
  } else {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();

  // ── Specular highlight ────────────────────────────────────────────────────
  const specStrength = glossiness * (0.4 + (1 - axialDot) * 0.6);
  if (specStrength > 0.08 && thick > 1.4 && !underlayMode) {
    // Highlight stripe offset toward light source
    const specOff = thick * 0.26 * (threadFacingLight * 0.8 + 0.2);
    const hx0 = x0 + nx * specOff, hy0 = y0 + ny * specOff;
    const hx1 = x1 + nx * specOff, hy1 = y1 + ny * specOff;

    let specGrad;
    try {
      specGrad = ctx.createLinearGradient(
        midX + nx * halfW * 0.3, midY + ny * halfW * 0.3,
        midX - nx * halfW * 0.3, midY - ny * halfW * 0.3
      );
      specGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specGrad.addColorStop(0.35, `rgba(255,255,255,${(specStrength*0.6).toFixed(2)})`);
      specGrad.addColorStop(0.50, `rgba(255,255,255,${specStrength.toFixed(2)})`);
      specGrad.addColorStop(0.65, `rgba(255,255,255,${(specStrength*0.6).toFixed(2)})`);
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    } catch { specGrad = null; }

    if (specGrad) {
      ctx.strokeStyle = specGrad;
      ctx.lineWidth = Math.max(0.4, thick * 0.32);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (sag > 0.3) {
        const sagX = (hx0+hx1)/2 + ny * sag * 0.9;
        const sagY = (hy0+hy1)/2 + nx * sag * 0.3;
        ctx.moveTo(hx0, hy0);
        ctx.quadraticCurveTo(sagX, sagY, hx1, hy1);
      } else {
        ctx.moveTo(hx0, hy0);
        ctx.lineTo(hx1, hy1);
      }
      ctx.stroke();
    }
  }

  // ── Micro-fiber texture (subtle noise on matte threads) ───────────────────
  if (glossiness < 0.35 && thick > 2 && !underlayMode && len > 4) {
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = `rgba(${Math.round(br*0.5)},${Math.round(bg*0.5)},${Math.round(bb*0.5)},0.5)`;
    ctx.lineWidth = thick * 0.15;
    // Draw 2-3 micro fiber lines along stitch with slight random offset
    for (let fi = 0; fi < 2; fi++) {
      const fo = (fi * 2 - 1) * thick * 0.18;
      ctx.beginPath();
      ctx.moveTo(x0 + nx*fo, y0 + ny*fo);
      ctx.lineTo(x1 + nx*fo, y1 + ny*fo);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ─── Underlay renderer ────────────────────────────────────────────────────────

/**
 * Draws underlay stitches as thinner, compressed, darker lines.
 * Underlay is visually "buried" under the top layer — slightly visible as depth.
 */
export function drawUnderlayStitches(ctx, stitches, color, params) {
  const underlayColor = darken(mix(color, '#000000', 0.15), 0.18);
  const underlayParams = {
    ...params,
    threadThicknessPx: params.threadThicknessPx * 0.55,
    glossiness: params.glossiness * 0.25,
    tension: Math.min(1, params.tension + 0.15),
    underlayMode: true,
    layerDepth: 0,
  };
  ctx.save();
  ctx.globalAlpha = 0.50;
  for (const [x0, y0, x1, y1] of stitches) {
    drawPhysicalStitch(ctx, x0, y0, x1, y1, underlayColor, underlayParams);
  }
  ctx.restore();
}

// ─── Fabric simulation presets ────────────────────────────────────────────────

export const FABRIC_SIM_PARAMS = {
  'Algodón':   { glossiness: 0.22, tensionBase: 0.78, threadMult: 1.00, lightAngleDeg: 42, deformDepth: 0.45 },
  'Poliéster': { glossiness: 0.52, tensionBase: 0.88, threadMult: 0.92, lightAngleDeg: 35, deformDepth: 0.30 },
  'Denim':     { glossiness: 0.12, tensionBase: 0.62, threadMult: 1.20, lightAngleDeg: 52, deformDepth: 0.60 },
  'Lino':      { glossiness: 0.18, tensionBase: 0.72, threadMult: 1.08, lightAngleDeg: 46, deformDepth: 0.50 },
  'Seda':      { glossiness: 0.82, tensionBase: 0.92, threadMult: 0.82, lightAngleDeg: 28, deformDepth: 0.20 },
  'Lycra':     { glossiness: 0.38, tensionBase: 0.52, threadMult: 1.12, lightAngleDeg: 40, deformDepth: 0.70 },
  'Mezcla':    { glossiness: 0.32, tensionBase: 0.76, threadMult: 1.00, lightAngleDeg: 43, deformDepth: 0.40 },
  'Otro':      { glossiness: 0.28, tensionBase: 0.75, threadMult: 1.00, lightAngleDeg: 45, deformDepth: 0.40 },
};