import React from 'react';

// Module-level cache: geometry key → dataURL. Thumbnails are generated once
// per region geometry/color and reused across renders and reorders.
const cache = new Map();

function keyFor(region, size) {
  const pts = region.path_points || [];
  const a = pts[0] || [0, 0];
  const b = pts[pts.length >> 1] || [0, 0];
  return `${region.id}|${region.color}|${pts.length}|${a[0]},${a[1]}|${b[0]},${b[1]}|${size}`;
}

/**
 * Real silhouette thumbnail of a vectorized region (not a generic color square).
 * Renders path_points normalized to the region's own bounding box.
 */
export default React.memo(function RegionThumbnail({ region, size = 30 }) {
  const key = keyFor(region, size);
  let url = cache.get(key);
  if (!url) {
    const px = size * 2; // 2x for retina
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1d27';
    ctx.fillRect(0, 0, px, px);
    const pts = region.path_points || [];
    if (pts.length >= 3) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const w = Math.max(1e-6, maxX - minX);
      const h = Math.max(1e-6, maxY - minY);
      const s = (px - 8) / Math.max(w, h);
      const ox = (px - w * s) / 2;
      const oy = (px - h * s) / 2;
      ctx.beginPath();
      ctx.moveTo(ox + (pts[0][0] - minX) * s, oy + (pts[0][1] - minY) * s);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(ox + (pts[i][0] - minX) * s, oy + (pts[i][1] - minY) * s);
      }
      ctx.closePath();
      ctx.fillStyle = region.color || '#888';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    url = c.toDataURL();
    if (cache.size > 600) cache.clear();
    cache.set(key, url);
  }
  return (
    <img
      src={url}
      alt=""
      className="rounded flex-shrink-0 border border-white/10"
      style={{ width: size, height: size }}
    />
  );
});