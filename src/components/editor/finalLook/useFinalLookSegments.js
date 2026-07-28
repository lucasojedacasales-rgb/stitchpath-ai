import { useMemo } from 'react';

/**
 * Convierte los comandos finales (solo lectura) en segmentos de dibujo.
 * NO modifica comandos, regiones ni geometría — solo prepara datos de render.
 */
export function useFinalLookSegments({ commands = [], objects = [], regions = [], detailReport, widthMm, heightMm }) {
  const objectById = useMemo(() => {
    const m = new Map();
    for (const o of objects) if (o?.id) m.set(o.id, o);
    for (const r of regions) if (r?.id && !m.has(r.id)) m.set(r.id, r);
    return m;
  }, [objects, regions]);

  const detailMap = useMemo(() => {
    const m = new Map();
    for (const d of detailReport?.details || []) m.set(d.id, d);
    return m;
  }, [detailReport]);

  return useMemo(() => {
    const segments = [];
    const jumps = [];
    const trims = [];
    const starts = [];
    const ends = [];
    const perRegion = new Map();
    let color = '#8a8a8a';
    let bounds = { minX: -widthMm / 2, maxX: widthMm / 2, minY: -heightMm / 2, maxY: heightMm / 2 };
    let order = 0;
    let prev = null;
    let blockStart = null;

    for (let i = 0; i < commands.length; i++) {
      const c = commands[i];
      if (c.type === 'colorChange') { color = c.color || color; prev = null; continue; }
      if (c.type === 'trim') { if (prev) trims.push([prev.x, prev.y]); prev = null; if (blockStart) { ends.push([blockStart.lx, blockStart.ly]); blockStart = null; } continue; }
      if (c.type === 'end') { if (prev) ends.push([prev.x, prev.y]); prev = null; continue; }
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;

      if (c.x < bounds.minX) bounds.minX = c.x;
      if (c.x > bounds.maxX) bounds.maxX = c.x;
      if (c.y < bounds.minY) bounds.minY = c.y;
      if (c.y > bounds.maxY) bounds.maxY = c.y;

      if (c.type === 'jump') {
        if (prev) jumps.push([prev.x, prev.y, c.x, c.y]);
        prev = c;
        continue;
      }
      if (c.type !== 'stitch') continue;

      const regionId = c.regionId || null;
      const region = regionId ? objectById.get(regionId) : null;
      const detail = regionId ? detailMap.get(regionId) : null;
      const st = region?.stitch_type;
      let kind = 'fill';
      if (st === 'running_stitch' || st === 'contour' || region?.type === 'contour') kind = 'contour';
      else if (st === 'satin') kind = 'satin';
      if (detail?.preserved && (detail.class === 'detail_run' || detail.class === 'decorative_detail')) kind = 'detail';
      const discarded = !!(detail && !detail.preserved && detail.score > 0);

      if (prev && (prev.type === 'stitch' || prev.type === 'jump')) {
        const len = Math.hypot(c.x - prev.x, c.y - prev.y);
        if (!(len > 6 && (kind === 'contour' || kind === 'detail'))) {
          segments.push({
            x0: prev.x, y0: prev.y, x1: c.x, y1: c.y,
            color: c.color || region?.color || color,
            kind, discarded, regionId, len,
          });
        }
      } else {
        starts.push([c.x, c.y]);
        blockStart = { lx: c.x, ly: c.y };
      }
      if (blockStart) { blockStart.lx = c.x; blockStart.ly = c.y; }

      if (regionId) {
        let s = perRegion.get(regionId);
        if (!s) {
          s = {
            id: regionId,
            name: region?.name || regionId,
            color: c.color || region?.color || color,
            kind,
            order: ++order,
            stitches: 0,
            totalLen: 0,
            angle: region?.angle ?? null,
            density: region?.density ?? region?.tatami_density ?? null,
            areaMm2: region?.area_mm2 ?? null,
          };
          perRegion.set(regionId, s);
        }
        s.stitches++;
        if (prev && prev.type === 'stitch') s.totalLen += Math.hypot(c.x - prev.x, c.y - prev.y);
      }
      prev = c;
    }

    return { segments, jumps, trims, starts, ends, bounds, regionStats: perRegion };
  }, [commands, objectById, detailMap, widthMm, heightMm]);
}