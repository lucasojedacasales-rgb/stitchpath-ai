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
    tension = 0.5,           // 0 = flojo, 1 = tenso
    lightAngleDeg = 45,
    glossiness = 0.6,        // 0 = mate, 1 = satinado
    zoom = 1,
    layerDepth = 0,          // 0 = base, 1+ = capas superiores
  } = params;

  const thick = Math.max(1.2, threadThicknessPx / zoom);
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;

  // Normal perpendicular a la puntada
  const nx = -dy / len, ny = dx / len;

  // Dirección de la luz
  const lightRad = (lightAngleDeg * Math.PI) / 180;
  const lx = Math.cos(lightRad), ly = Math.sin(lightRad);

  // Dot product: cuánto alinea la puntada con la luz
  const dot = Math.abs(dx / len * lx + dy / len * ly);
  const normalDot = Math.abs(nx * lx + ny * ly); // para brillo especular

  // ── Sombra de proyección (relieve/solapamiento) ──
  if (layerDepth > 0) {
    const shadowOffset = Math.min(thick * 0.5 * layerDepth, thick * 1.5);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = thick * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + shadowOffset * 0.5, y0 + shadowOffset * 0.7);
    ctx.lineTo(x1 + shadowOffset * 0.5, y1 + shadowOffset * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  // ── Cuerpo del hilo con gradiente transversal (perfil cilíndrico) ──
  const perpLen = thick * 0.8;
  // Dos puntos en los extremos perpendiculares
  const gx0 = (x0 + x1) / 2 - nx * perpLen;
  const gy0 = (y0 + y1) / 2 - ny * perpLen;
  const gx1 = (x0 + x1) / 2 + nx * perpLen;
  const gy1 = (y0 + y1) / 2 + ny * perpLen;

  const bodyGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);

  const baseR = hexToRgb(color);
  const brightFactor = 0.3 + dot * 0.2;
  const darkFactor   = 0.25 + (1 - dot) * 0.15;

  // Perfil: oscuro en borde izquierdo → claro en cima → oscuro en borde derecho
  bodyGrad.addColorStop(0,    `rgba(${Math.round(baseR.r*(1-darkFactor))},${Math.round(baseR.g*(1-darkFactor))},${Math.round(baseR.b*(1-darkFactor))},0.9)`);
  bodyGrad.addColorStop(0.25, `rgba(${baseR.r},${baseR.g},${baseR.b},0.95)`);
  bodyGrad.addColorStop(0.5,  `rgba(${Math.min(255,Math.round(baseR.r+(255-baseR.r)*brightFactor*0.8))},${Math.min(255,Math.round(baseR.g+(255-baseR.g)*brightFactor*0.8))},${Math.min(255,Math.round(baseR.b+(255-baseR.b)*brightFactor*0.8))},1)`);
  bodyGrad.addColorStop(0.75, `rgba(${baseR.r},${baseR.g},${baseR.b},0.95)`);
  bodyGrad.addColorStop(1,    `rgba(${Math.round(baseR.r*(1-darkFactor*0.8))},${Math.round(baseR.g*(1-darkFactor*0.8))},${Math.round(baseR.b*(1-darkFactor*0.8))},0.88)`);

  ctx.strokeStyle = bodyGrad;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';

  // Tensión: puntada tensa → recta, floja → ligera curva
  if (tension < 0.7 && len > thick * 3) {
    const sag = thick * (1 - tension) * 0.8;
    const mx = (x0 + x1) / 2 + ny * sag;
    const my = (y0 + y1) / 2 + nx * sag * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // ── Brillo especular ──
  if (glossiness > 0.2 && thick > 1.5) {
    const specStrength = glossiness * normalDot * 0.85;
    if (specStrength > 0.05) {
      // Línea de brillo desplazada hacia la luz
      const specOffset = thick * 0.22;
      const specGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      specGrad.addColorStop(0, 'rgba(255,255,255,0)');
      specGrad.addColorStop(0.45, `rgba(255,255,255,${(specStrength * 0.9).toFixed(2)})`);
      specGrad.addColorStop(0.55, `rgba(255,255,255,${specStrength.toFixed(2)})`);
      specGrad.addColorStop(0.65, `rgba(255,255,255,${(specStrength * 0.6).toFixed(2)})`);
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.strokeStyle = specGrad;
      ctx.lineWidth = Math.max(0.5, thick * 0.35);
      ctx.lineCap = 'round';
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