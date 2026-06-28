/**
 * physicsSimulator.js
 *
 * Motor de simulación física de bordado.
 * Renderiza cada puntada con:
 *  - grosor de hilo (perfil cilíndrico con luces y sombras)
 *  - relieve (desplazamiento Z simulado con gradiente radial)
 *  - brillo especular (ángulo de luz configurable)
 *  - solapamientos (orden de capas, sombra de proyección)
 *  - efecto de underlay (capa base translúcida)
 *  - textura de tejido de fondo
 *  - tensión (curvatura de las puntadas)
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

const THREAD_PROFILE_SAMPLES = 8; // segmentos por puntada para curvaturas

// ─── Utilidades de color ──────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Ajusta brillo/saturación de un color para simular iluminación */
function lighten(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r + (255 - r) * factor, g: g + (255 - g) * factor, b: b + (255 - b) * factor });
}

function darken(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * (1 - factor), g: g * (1 - factor), b: b * (1 - factor) });
}

/** Mezcla dos colores */
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

// ─── Textura de tejido ────────────────────────────────────────────────────────

export function drawFabricTexture(ctx, W, H, fabricType, fabricColor = '#1a1410') {
  ctx.clearRect(0, 0, W, H);

  // Fondo base del tejido
  const baseColor = FABRIC_COLORS[fabricType] || FABRIC_COLORS['Algodón'];
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);

  const pattern = FABRIC_PATTERNS[fabricType] || FABRIC_PATTERNS['Algodón'];
  pattern(ctx, W, H);
}

const FABRIC_COLORS = {
  'Algodón':   '#f5f0e8',
  'Poliéster': '#eef0f5',
  'Denim':     '#4a5568',
  'Lino':      '#e8dfc8',
  'Seda':      '#f8f4ee',
  'Lycra':     '#2a2a3a',
  'Mezcla':    '#ede8de',
  'Otro':      '#e0dcd0',
};

const FABRIC_PATTERNS = {
  'Algodón': (ctx, W, H) => {
    // Trama de algodón: líneas finas cruzadas con variación
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 0.5;
    const spacing = 4;
    for (let x = 0; x < W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Denim': (ctx, W, H) => {
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#c8d8f0';
    ctx.lineWidth = 1;
    const s = 6;
    for (let y = 0; y < H; y += s) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 3); ctx.stroke();
    }
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    for (let x = 0; x < W; x += s * 1.5) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Seda': (ctx, W, H) => {
    // Degradado suave con brillo diagonal
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.03)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  },
  'Lino': (ctx, W, H) => {
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#a0926a';
    ctx.lineWidth = 0.8;
    const s = 5;
    for (let x = 0; x < W; x += s) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += s) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Poliéster': (ctx, W, H) => {
    const grad = ctx.createLinearGradient(0, 0, W * 0.3, H * 0.3);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  },
  'Lycra': (ctx, W, H) => {
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#8888cc';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 3) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 2, H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Mezcla': (ctx, W, H) => {
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#7a6a55';
    ctx.lineWidth = 0.6;
    const s = 4;
    for (let x = 0; x < W; x += s) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 1, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += s * 1.5) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Otro': (ctx, W, H) => {},
};

// ─── Parámetros por tipo de puntada ──────────────────────────────────────────
//
// Cada tipo tiene propiedades físicas distintas de la máquina de bordar:
//   fill (tatami): hilo ~40wt, grosor 0.38mm, pasadas densas y paralelas
//   satin:         hilo ~40wt compacto, grosor 0.35mm, columnas muy juntas, más brillo
//   running_stitch: hilo ~60wt más fino, grosor 0.25mm, puntadas largas separadas

export const STITCH_TYPE_PROFILES = {
  fill: {
    threadDiameterMm: 0.38,  // 40wt estándar
    glossBoost:       0.0,   // sin brillo extra
    shadowAlpha:      0.22,  // sombra moderada entre filas
    specularWidth:    0.32,  // pico especular moderado
  },
  satin: {
    threadDiameterMm: 0.35,  // 40wt compacto, columnas apretadas
    glossBoost:       0.20,  // satin siempre más brillante
    shadowAlpha:      0.15,  // columnas muy juntas → menos sombra individual
    specularWidth:    0.28,  // pico especular más estrecho y definido
  },
  running_stitch: {
    threadDiameterMm: 0.25,  // 60wt más fino
    glossBoost:       0.05,
    shadowAlpha:      0.30,  // puntadas aisladas → sombra más visible
    specularWidth:    0.38,
  },
};

// ─── Renderizado de puntada física ────────────────────────────────────────────

/**
 * Dibuja una puntada (segmento) con perfil cilíndrico simulado.
 *
 * @param ctx        Canvas 2D context
 * @param x0,y0      Punto inicial
 * @param x1,y1      Punto final
 * @param color      Hex color del hilo
 * @param params     SimParams
 */
export function drawPhysicalStitch(ctx, x0, y0, x1, y1, color, params) {
  const {
    threadThicknessPx = 2.5,
    tension = 0.5,
    lightAngleDeg = 45,
    glossiness = 0.6,
    zoom = 1,
    layerDepth = 0,
    stitchType = 'fill',     // ← nuevo: 'fill' | 'satin' | 'running_stitch'
  } = params;

  const profile = STITCH_TYPE_PROFILES[stitchType] || STITCH_TYPE_PROFILES.fill;

  // Grosor real según tipo de puntada: el threadThicknessPx viene calibrado en mm*pxPerMm,
  // pero cada tipo tiene su diámetro propio — se aplica un factor relativo
  const diamRatio = profile.threadDiameterMm / 0.38; // normalizado respecto a fill
  const thick = Math.max(0.8, (threadThicknessPx * diamRatio) / zoom);

  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.3) return;

  const nx = -dy / len, ny = dx / len;

  const lightRad = (lightAngleDeg * Math.PI) / 180;
  const lx = Math.cos(lightRad), ly = Math.sin(lightRad);
  const dot       = Math.abs(dx / len * lx + dy / len * ly);
  const normalDot = Math.abs(nx * lx + ny * ly);

  // ── Sombra de proyección ──
  if (layerDepth > 0 || stitchType === 'running_stitch') {
    const shadowAlpha  = profile.shadowAlpha * (layerDepth > 0 ? 1 : 0.6);
    const shadowOffset = Math.min(thick * 0.45 * Math.max(layerDepth, 0.5), thick * 1.4);
    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`;
    ctx.lineWidth = thick * 1.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + shadowOffset * 0.4, y0 + shadowOffset * 0.6);
    ctx.lineTo(x1 + shadowOffset * 0.4, y1 + shadowOffset * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // ── Gradiente cilíndrico ──
  const perpLen = thick * 0.8;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const gx0 = mx - nx * perpLen, gy0 = my - ny * perpLen;
  const gx1 = mx + nx * perpLen, gy1 = my + ny * perpLen;
  const bodyGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);

  const baseR = hexToRgb(color);
  const effectiveGloss = Math.min(1, glossiness + profile.glossBoost);
  const brightFactor   = 0.18 + dot * 0.18 + effectiveGloss * 0.10;
  const darkFactor     = 0.30 + (1 - dot) * 0.10;

  const hi = (ch) => Math.min(255, Math.round(ch + (255 - ch) * brightFactor));
  const sh = (ch, f) => Math.max(0, Math.round(ch * (1 - f)));

  // Perfil cilíndrico: borde oscuro → cuerpo → pico especular → cuerpo → borde oscuro
  bodyGrad.addColorStop(0,    `rgba(${sh(baseR.r,darkFactor)},${sh(baseR.g,darkFactor)},${sh(baseR.b,darkFactor)},0.94)`);
  bodyGrad.addColorStop(0.18, `rgba(${baseR.r},${baseR.g},${baseR.b},0.97)`);
  bodyGrad.addColorStop(0.44, `rgba(${hi(baseR.r)},${hi(baseR.g)},${hi(baseR.b)},1)`);
  bodyGrad.addColorStop(0.56, `rgba(${hi(baseR.r)},${hi(baseR.g)},${hi(baseR.b)},1)`);
  bodyGrad.addColorStop(0.78, `rgba(${baseR.r},${baseR.g},${baseR.b},0.97)`);
  bodyGrad.addColorStop(1,    `rgba(${sh(baseR.r,darkFactor*0.80)},${sh(baseR.g,darkFactor*0.80)},${sh(baseR.b,darkFactor*0.80)},0.90)`);

  ctx.strokeStyle = bodyGrad;
  ctx.lineWidth   = thick;
  ctx.lineCap     = 'round';

  // Tensión: puntada floja → ligera curva (más notorio en running_stitch)
  const sagMult = stitchType === 'running_stitch' ? 1.4 : 1.0;
  if (tension < 0.7 && len > thick * 3) {
    const sag = thick * (1 - tension) * 0.8 * sagMult;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + ny * sag, my + nx * sag * 0.3, x1, y1);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // ── Brillo especular ──
  if (effectiveGloss > 0.15 && thick > 1.2) {
    const specStrength = effectiveGloss * normalDot * 0.9;
    if (specStrength > 0.06) {
      const specW    = profile.specularWidth;
      const specOffset = thick * 0.20;
      const specGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      specGrad.addColorStop(0,               'rgba(255,255,255,0)');
      specGrad.addColorStop(0.5 - specW / 2, `rgba(255,255,255,${(specStrength * 0.7).toFixed(2)})`);
      specGrad.addColorStop(0.5,             `rgba(255,255,255,${specStrength.toFixed(2)})`);
      specGrad.addColorStop(0.5 + specW / 2, `rgba(255,255,255,${(specStrength * 0.7).toFixed(2)})`);
      specGrad.addColorStop(1,               'rgba(255,255,255,0)');

      ctx.strokeStyle = specGrad;
      ctx.lineWidth   = Math.max(0.4, thick * 0.30);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + nx * specOffset, y0 + ny * specOffset);
      ctx.lineTo(x1 + nx * specOffset, y1 + ny * specOffset);
      ctx.stroke();
    }
  }
}

// ─── Underlay visual ──────────────────────────────────────────────────────────

/**
 * Dibuja la capa de underlay como líneas más finas y oscuras debajo del relleno principal.
 */
export function drawUnderlayStitches(ctx, stitches, color, params) {
  const underlayColor = darken(mix(color, '#000000', 0.3), 0.2);
  const underlayParams = {
    ...params,
    threadThicknessPx: params.threadThicknessPx * 0.6,
    glossiness: 0.1,
    layerDepth: 0,
  };
  ctx.globalAlpha = 0.55;
  for (const [x0, y0, x1, y1] of stitches) {
    drawPhysicalStitch(ctx, x0, y0, x1, y1, underlayColor, underlayParams);
  }
  ctx.globalAlpha = 1;
}

// ─── Configuración de simulación por tejido ───────────────────────────────────

export const FABRIC_SIM_PARAMS = {
  'Algodón':   { glossiness: 0.25, tensionBase: 0.75, threadMult: 1.0, lightAngleDeg: 40 },
  'Poliéster': { glossiness: 0.55, tensionBase: 0.85, threadMult: 0.95, lightAngleDeg: 35 },
  'Denim':     { glossiness: 0.15, tensionBase: 0.65, threadMult: 1.15, lightAngleDeg: 50 },
  'Lino':      { glossiness: 0.20, tensionBase: 0.70, threadMult: 1.05, lightAngleDeg: 45 },
  'Seda':      { glossiness: 0.80, tensionBase: 0.90, threadMult: 0.85, lightAngleDeg: 30 },
  'Lycra':     { glossiness: 0.40, tensionBase: 0.55, threadMult: 1.10, lightAngleDeg: 40 },
  'Mezcla':    { glossiness: 0.35, tensionBase: 0.75, threadMult: 1.0,  lightAngleDeg: 42 },
  'Otro':      { glossiness: 0.30, tensionBase: 0.75, threadMult: 1.0,  lightAngleDeg: 45 },
};