/**
 * extractMetrics.js — Hatch Lab (P0)
 * Pure metric extraction from an ALREADY produced base-engine result.
 * Does not run the pipeline, does not import productive modules, does not
 * mutate the received regions / commands / context.
 */

import { UNAVAILABLE, METRIC_KEYS } from './metricAvailability.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function emptyMetrics() {
  const m = {};
  for (const k of METRIC_KEYS) m[k] = UNAVAILABLE;
  return m;
}

function isContour(r) {
  return r.type === 'contour' || r.stitch_type === 'running_stitch' ||
    (typeof r.layerType === 'string' && r.layerType.toLowerCase().includes('outline'));
}

function isDetail(r) {
  const t = `${r.region_class || ''} ${r.layerType || ''} ${r.universalClass || ''}`.toLowerCase();
  return t.includes('detail');
}

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const p = points[i], q = points[j];
    if (!Array.isArray(p) || !Array.isArray(q)) return null;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function regionMetrics(regions, out, options) {
  if (!Array.isArray(regions)) return;
  out.regionCount = regions.length;
  out.contourRegionCount = regions.filter(isContour).length;
  out.detailRegionCount = regions.filter(isDetail).length;
  out.fillRegionCount = regions.filter(r => !isContour(r)).length;

  const colors = regions.map(r => (typeof r.color === 'string' ? r.color.toLowerCase() : null)).filter(Boolean);
  out.colorCount = colors.length ? new Set(colors).size : UNAVAILABLE;
  out.colorSequence = colors.length ? colors : UNAVAILABLE;

  const ids = regions.map(r => r.id).filter(id => typeof id === 'string');
  out.orderedRegionIds = ids.length === regions.length && ids.length > 0 ? ids : UNAVAILABLE;

  // Holes are only counted when the data model declares them explicitly.
  // They are never inferred from geometry or from a screenshot.
  const holeAware = regions.filter(r => Array.isArray(r.holes));
  out.explicitHoleCount = holeAware.length > 0
    ? holeAware.reduce((s, r) => s + r.holes.length, 0)
    : UNAVAILABLE;

  const areas = regions
    .map(r => num(r.area_mm2) ?? num(r.area_norm) ?? polygonArea(r.path_points))
    .filter(v => v != null);
  if (areas.length === regions.length && areas.length > 0) {
    const total = areas.reduce((s, v) => s + v, 0);
    out.totalArea = total;
    out.averageRegionArea = total / areas.length;
    out.minimumRegionArea = Math.min(...areas);
    out.maximumRegionArea = Math.max(...areas);
    const threshold = num(options?.smallRegionAreaThreshold);
    out.smallRegionCount = threshold != null ? areas.filter(a => a < threshold).length : UNAVAILABLE;
  }
}

function commandMetrics(commands, out) {
  if (!Array.isArray(commands)) return;
  if (commands.length === 0) {
    // Empty array is a real, known result: zero commands.
    out.commandCount = 0;
    out.stitchCount = 0;
    out.jumpCount = 0;
    out.trimCount = 0;
    out.colorChangeCount = 0;
    return;
  }
  let stitch = 0, jump = 0, trim = 0, colorChange = 0;
  for (const c of commands) {
    if (!c || typeof c !== 'object') continue;
    if (c.type === 'stitch') stitch++;
    else if (c.type === 'jump') jump++;
    else if (c.type === 'trim') trim++;
    else if (c.type === 'colorChange') colorChange++;
  }
  out.commandCount = commands.length;
  out.stitchCount = stitch;
  out.jumpCount = jump;
  out.trimCount = trim;
  out.colorChangeCount = colorChange;
}

/**
 * @param {object} result
 *   { regions?, commands?, stageLog?, processingTimeMs?, warnings?, errors?, discardedRegions? }
 * @param {object} [options] { smallRegionAreaThreshold }
 * @returns {object} metrics — every key present, unavailable where unknown
 */
export function extractMetrics(result, options = {}) {
  const out = emptyMetrics();
  if (!result || typeof result !== 'object') return out;

  regionMetrics(result.regions, out, options);
  commandMetrics(result.commands, out);

  if (Array.isArray(result.discardedRegions)) out.discardedRegionCount = result.discardedRegions.length;
  else if (num(result.discardedRegionCount) != null) out.discardedRegionCount = result.discardedRegionCount;

  if (num(result.processingTimeMs) != null) out.processingTimeMs = result.processingTimeMs;

  if (Array.isArray(result.stageLog) && result.stageLog.length > 0) {
    out.stageTimings = result.stageLog.map(s => ({
      stage: s?.stage ?? s?.id ?? null,
      ms: num(s?.ms) ?? num(s?.durationMs) ?? null,
      ok: typeof s?.ok === 'boolean' ? s.ok : null,
    }));
    if (out.processingTimeMs === UNAVAILABLE) {
      const total = out.stageTimings.reduce((s, t) => (t.ms == null ? s : s + t.ms), null);
      if (total != null) out.processingTimeMs = total;
    }
  }

  if (Array.isArray(result.warnings)) out.warningCount = result.warnings.length;
  if (Array.isArray(result.errors)) out.errorCount = result.errors.length;

  return out;
}