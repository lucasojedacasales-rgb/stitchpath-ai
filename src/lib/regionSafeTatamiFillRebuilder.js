const DEFAULT_MAX_VISIBLE_MM = 4.03;
const HARD_MAX_VISIBLE_MM = 4.5;
const MAX_CONNECTOR_INSIDE_FILL_MM = 6.0;
const MIN_STITCH_MM = 0.35;
const NEEDLE_INSET_MM = 0.35;
const TRIM_THRESHOLD_MM = 3.5;
const TATAMI_PHASES = [0, 0.25, 0.5, 0.75];

export function generateRegionSafeTatamiFillCommands(obj, options = {}) {
  const { designOffset = [0, 0], config = {} } = options;
  const [offX, offY] = designOffset;
  const polygon = Array.isArray(obj?.points) ? obj.points : [];
  const regionId = obj?.id || 'fill';
  const color = obj?.color || '#000000';
  const maxVisible = Math.min(Number(config.learnedMaxVisibleStitchMm ?? obj.learnedMaxVisibleStitchMm ?? DEFAULT_MAX_VISIBLE_MM) || DEFAULT_MAX_VISIBLE_MM, HARD_MAX_VISIBLE_MM);
  const spacing = clamp(Number(obj?.density ?? config.learnedFillDensityMm ?? 0.45) || 0.45, 0.35, 0.65);
  const angleDeg = Number(config.learnedFillAngleDeg ?? obj?.angle ?? 45) || 45;

  if (polygon.length < 3) return [];

  const safePolygon = insetPolygon(polygon, NEEDLE_INSET_MM);
  const rows = buildScanlineRows(safePolygon, spacing, angleDeg, maxVisible);
  const commands = [];
  let previousPoint = null;
  let rowCounter = 0;

  const mk = (type, x, y, extra = {}) => ({
    type,
    x: x + offX,
    y: y + offY,
    regionId,
    blockId: regionId,
    stitchType: 'fill',
    source: 'ce01_safe_fill',
    color,
    generatedBy: 'REGION_SAFE_TATAMI_FILL_REBUILDER_V1',
    ...extra,
  });

  for (const row of rows) {
    const intervals = rowCounter % 2 === 0 ? row.intervals : [...row.intervals].reverse();
    for (const interval of intervals) {
      const forward = rowCounter % 2 === 0;
      const points = placeNeedles(interval.xL, interval.xR, interval.y, maxVisible, rowCounter, forward, angleDeg);
      if (points.length === 0) continue;
      const first = points[0];
      if (previousPoint) {
        const d = dist(previousPoint, first);
        if (d > maxVisible || d > MAX_CONNECTOR_INSIDE_FILL_MM || !segmentInside(previousPoint, first, polygon)) {
          if (commands.length > 0 && d > TRIM_THRESHOLD_MM && commands[commands.length - 1]?.type !== 'trim') {
            commands.push(mk('trim', previousPoint.x, previousPoint.y, { trimReason: 'safe_tatami_gap' }));
          }
          commands.push(mk('jump', first.x, first.y, { jumpReason: 'safe_tatami_gap' }));
        }
      }
      for (const p of points) {
        if (!pointInPolygon(p.x, p.y, polygon)) continue;
        const last = lastPointCommand(commands, offX, offY);
        if (last && commands[commands.length - 1]?.type !== 'jump') {
          const d = dist(last, p);
          if (d < MIN_STITCH_MM && d > 0) continue;
          if (d > maxVisible || !segmentInside(last, p, polygon)) {
            if (d > TRIM_THRESHOLD_MM && commands[commands.length - 1]?.type !== 'trim') {
              commands.push(mk('trim', last.x, last.y, { trimReason: 'safe_tatami_segment_break' }));
            }
            commands.push(mk('jump', p.x, p.y, { jumpReason: 'safe_tatami_segment_break' }));
          }
        }
        commands.push(mk('stitch', p.x, p.y));
        previousPoint = p;
      }
    }
    rowCounter++;
  }

  const metrics = measureFillSegments(commands, polygon, offX, offY);
  console.log('[SAFE TATAMI SOURCE]', {
    functionName: 'generateRegionSafeTatamiFillCommands',
    regionId,
    generatedSegments: metrics.stitchSegments,
    maxSegmentMm: metrics.maxSegmentMm,
    source: 'ce01_safe_fill',
  });

  return commands;
}

export function measureFillSegments(commands = [], polygon = null, offX = 0, offY = 0) {
  let prev = null;
  let maxSegmentMm = 0;
  let stitchSegments = 0;
  let fillAbove45 = 0;
  let fillAbove8 = 0;
  let ce01Above6 = 0;
  let crossesOutside = 0;
  const offenders = [];
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (!c || (c.type !== 'stitch' && c.type !== 'jump')) continue;
    const p = { x: c.x - offX, y: c.y - offY };
    if (c.type === 'jump') { prev = p; continue; }
    if (prev) {
      const d = dist(prev, p);
      maxSegmentMm = Math.max(maxSegmentMm, d);
      stitchSegments++;
      const crosses = polygon ? !segmentInside(prev, p, polygon) : false;
      if (d > 4.5) fillAbove45++;
      if (d > 8) fillAbove8++;
      if (d > 6 && c.source === 'ce01_safe_fill') ce01Above6++;
      if (crosses) crossesOutside++;
      if (d > 4.5 || crosses) offenders.push({ index: i, distanceMm: round(d), regionId: c.regionId, source: c.source, crossesOutside: crosses, from: prev, to: p });
    }
    prev = p;
  }
  return { maxSegmentMm: round(maxSegmentMm), stitchSegments, fillAbove45, fillAbove8, ce01Above6, crossesOutside, offenders };
}

function buildScanlineRows(polygon, spacing, angleDeg, pitch) {
  const rad = angleDeg * Math.PI / 180;
  const cosF = Math.cos(-rad), sinF = Math.sin(-rad);
  const toF = (x, y) => [x * cosF - y * sinF, x * sinF + y * cosF];
  const rp = polygon.map(([x, y]) => toF(x, y));
  const ys = rp.map(p => p[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < spacing) return [];
  const rows = [];
  let rowIdx = 0;
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
    const xs = edgeIntersections(rp, y).sort((a, b) => a - b);
    const intervals = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xL = xs[i] + NEEDLE_INSET_MM;
      const xR = xs[i + 1] - NEEDLE_INSET_MM;
      if (xR - xL >= Math.max(MIN_STITCH_MM, pitch * 0.45)) intervals.push({ xL, xR, y });
    }
    if (intervals.length) rows.push({ rowIdx, y, intervals });
    rowIdx++;
  }
  return rows;
}

function placeNeedles(xL, xR, y, pitch, rowIdx, forward, angleDeg) {
  const phase = (TATAMI_PHASES[rowIdx % TATAMI_PHASES.length] * pitch) % pitch;
  const xs = [xL];
  let x = xL + phase;
  if (x <= xL + MIN_STITCH_MM) x += pitch;
  while (x < xR - MIN_STITCH_MM) { xs.push(x); x += pitch; }
  xs.push(xR);
  const deduped = [];
  for (const vx of xs) {
    if (!deduped.length || Math.abs(vx - deduped[deduped.length - 1]) >= MIN_STITCH_MM) deduped.push(vx);
  }
  const ordered = forward ? deduped : deduped.reverse();
  const rad = angleDeg * Math.PI / 180;
  const cosB = Math.cos(rad), sinB = Math.sin(rad);
  return ordered.map(vx => ({ x: vx * cosB - y * sinB, y: vx * sinB + y * cosB }));
}

function segmentInside(a, b, polygon) {
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!pointInPolygon(x, y, polygon)) return false;
  }
  return true;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersects = ((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function edgeIntersections(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / ((by - ay) || 1e-9)) * (bx - ax));
  }
  return xs;
}

function insetPolygon(polygon, amount) {
  let cx = 0, cy = 0;
  for (const [x, y] of polygon) { cx += x; cy += y; }
  cx /= polygon.length; cy /= polygon.length;
  return polygon.map(([x, y]) => {
    const dx = cx - x, dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    const move = Math.min(amount, len * 0.35);
    return [x + dx / len * move, y + dy / len * move];
  });
}

function lastPointCommand(commands, offX, offY) {
  for (let i = commands.length - 1; i >= 0; i--) {
    const c = commands[i];
    if (c && (c.type === 'stitch' || c.type === 'jump')) return { x: c.x - offX, y: c.y - offY };
  }
  return null;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round(n) { return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0; }