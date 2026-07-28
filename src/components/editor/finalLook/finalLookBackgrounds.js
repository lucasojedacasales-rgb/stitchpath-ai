// Fondos de inspección para la pestaña Final (solo visual).

export const BACKGROUNDS = [
  { id: 'neutral', label: 'Gris neutro', base: '#5a5a5a' },
  { id: 'light',   label: 'Claro',       base: '#d9d9d9' },
  { id: 'dark',    label: 'Oscuro',      base: '#171a21' },
  { id: 'white',   label: 'Blanco',      base: '#ffffff' },
  { id: 'black',   label: 'Negro',       base: '#000000' },
  { id: 'fabric',  label: 'Tejido liso', base: '#6b6259' },
  { id: 'weave',   label: 'Textura textil', base: '#7a7169' },
];

export function getBackground(id) {
  return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
}

/**
 * Elige el fondo con mejor contraste medio frente a los colores del diseño.
 * lum = luminancia media del bordado [0,1].
 */
export function pickHighContrastBackground(lum) {
  if (lum >= 0.62) return 'dark';
  if (lum <= 0.3) return 'light';
  return 'neutral';
}

/** Dibuja el fondo. Nunca compite visualmente con el bordado. */
export function drawBackground(ctx, w, h, id, scale = 1) {
  const bg = getBackground(id);
  ctx.fillStyle = bg.base;
  ctx.fillRect(0, 0, w, h);
  if (id !== 'weave' && id !== 'fabric') return;

  const step = Math.max(3, Math.min(9, 3.2 * Math.max(0.6, scale / 6)));
  ctx.save();
  ctx.globalAlpha = id === 'weave' ? 0.06 : 0.03;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
  ctx.globalAlpha = id === 'weave' ? 0.05 : 0.025;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  for (let x = step / 2; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  ctx.stroke();
  ctx.restore();
}