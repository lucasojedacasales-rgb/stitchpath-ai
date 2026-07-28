// Utilidades de color para la previsualización Final (solo visual).

const cache = new Map();

function parse(hex) {
  const h = (hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '8');
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}

function toHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Aclara (amt>0) u oscurece (amt<0) un color. amt en [-1,1]. */
export function shade(hex, amt) {
  const key = `${hex}|${amt}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [r, g, b] = parse(hex);
  const f = amt >= 0
    ? [r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]
    : [r * (1 + amt), g * (1 + amt), b * (1 + amt)];
  const out = toHex(f[0], f[1], f[2]);
  if (cache.size < 4000) cache.set(key, out);
  return out;
}

/** Luminancia relativa aproximada [0,1]. */
export function luminance(hex) {
  const [r, g, b] = parse(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function rgba(hex, alpha) {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}