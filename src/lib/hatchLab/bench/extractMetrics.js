/**
 * extractMetrics.js — Hatch Lab (P0.1)
 * Pure metric extraction from an ALREADY produced base-engine result.
 *
 * Verified structures (read-only inspection, 2026-07-28):
 *  - Regions (types.js EnrichedRegion + regionBuilderStage.js): id, color,
 *    stitch_type ∈ fill|satin|running_stitch, visible, path_points (normalized
 *    0–1 [[x,y],…]), area_mm2 (number), area_norm (number, contour stage),
 *    holes (NUMBER per EnrichedRegion typedef), region_class/layerType
 *    (outer_outline|inner_outline|detail_run|detail|micro_fill), and contour
 *    objects carry type:'contour' + contour_points.
 *  - Commands (exportPipeline.flattenToCommands/buildFinalCommands): type ∈
 *    'stitch'|'jump'|'trim'|'colorChange'|'end' with x, y, color, regionId,
 *    stitchType, source, layerType. 'stop' was NOT observed in the generator;
 *    it is counted literally if present, never mapped from another type.
 *  - stageLog (types.js logStage + runner.js): [{ stage, durationMs, ok, ts,
 *    error? }].
 *
 * Returns { metrics, availability, warnings }. Never mutates inputs, never
 * runs the pipeline, never confuses 0 with unavailable.
 */

import {
  UNAVAILABLE, METRIC_KEYS, METRIC_DEFS,
  availabilityEntry, unavailableEntry,
} from './metricAvailability.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── Command type normalization (verified literals only) ─────────────────────
const VERIFIED_COMMAND_TYPES = Object.freeze(['stitch', 'jump', 'trim', 'colorChange', 'end', 'stop']);

/** Pure. Recognizes only verified literal types; everything else → 'unknown'. */
export function normalizeCommandType(type) {
  return VERIFIED_COMMAND_TYPES.includes(type) ? type : 'unknown';
}

// ── Region classification (mutually exclusive, priority order) ───────────────
/**
 * discarded → contour → detail → fill → unknown.
 * A bare stitch_type 'running_stitch' WITHOUT type:'contour' or an outline
 * region_class is NOT confirmed as contour by the real model → 'unknown'.
 */
export function classifyRegion(r) {
  if (!r || typeof r !== 'object') return 'unknown';
  if (r.visible === false) return 'discarded';
  const rc = r.region_class || r.layerType || '';
  if (r.type === 'contour' || rc === 'outer_outline' || rc === 'inner_outline') return 'contour';
  if (rc === 'detail_run' || rc === 'detail') return 'detail';
  if (r.stitch_type === 'fill' || r.stitch_type === 'satin') return 'fill';
  return 'unknown';
}

const isValidColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c);

function shoelaceNormalized(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    if (!Array.isArray(p) || !Array.isArray(q) || num(p[0]) == null || num(p[1]) == null || num(q[0]) == null || num(q[1]) == null) return null;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function initOutput() {
  const metrics = {};
  const availability = {};
  for (const k of METRIC_KEYS) {
    metrics[k] = UNAVAILABLE;
    availability[k] = unavailableEntry('not extracted', METRIC_DEFS[k].unit);
  }
  return { metrics, availability, warnings: [] };
}

function set(out, key, value, source, complete = true, reason = null) {
  out.metrics[key] = value;
  out.availability[key] = availabilityEntry(METRIC_DEFS[key].unit, source, complete, reason);
}
function unset(out, key, reason) {
  out.metrics[key] = UNAVAILABLE;
  out.availability[key] = unavailableEntry(reason, METRIC_DEFS[key].unit);
}

// ── Regions ──────────────────────────────────────────────────────────────────
function extractRegionMetrics(regions, out, options) {
  if (!Array.isArray(regions)) {
    const reason = 'regions not provided';
    for (const k of ['regionCount', 'fillRegionCount', 'contourRegionCount', 'detailRegionCount',
      'discardedRegionCount', 'unknownRegionTypeCount', 'classifiedRegionCoverage', 'colorCount', 'colorCoverage',
      'orderedRegionIds', 'colorSequence', 'explicitHoleCount', 'holeCoverage', 'smallRegionCount',
      'totalAreaMm2', 'averageRegionAreaMm2', 'minimumRegionAreaMm2', 'maximumRegionAreaMm2',
      'totalAreaNormalized', 'averageRegionAreaNormalized']) unset(out, k, reason);
    return;
  }

  const src = 'result.regions';
  const classes = regions.map(classifyRegion);
  const countOf = c => classes.filter(x => x === c).length;
  set(out, 'regionCount', regions.length, src);
  set(out, 'fillRegionCount', countOf('fill'), src);
  set(out, 'contourRegionCount', countOf('contour'), src);
  set(out, 'detailRegionCount', countOf('detail'), src);
  set(out, 'discardedRegionCount', countOf('discarded'), src);
  const unknownRegions = countOf('unknown');
  set(out, 'unknownRegionTypeCount', unknownRegions, src);
  set(out, 'classifiedRegionCoverage', regions.length ? (regions.length - unknownRegions) / regions.length : 1, src);
  if (unknownRegions > 0) out.warnings.push(`region-classification: ${unknownRegions} region(s) of unknown type`);

  const active = regions.filter(r => classifyRegion(r) !== 'discarded');

  // colors
  const colors = active.map(r => (isValidColor(r?.color) ? r.color.toLowerCase() : null));
  const present = colors.filter(Boolean);
  const colorCoverage = active.length ? present.length / active.length : 1;
  set(out, 'colorCoverage', colorCoverage, src);
  if (active.length === 0) {
    set(out, 'colorCount', 0, src);
    set(out, 'colorSequence', [], src);
  } else if (colorCoverage === 1) {
    set(out, 'colorCount', new Set(present).size, src);
    set(out, 'colorSequence', present, src);
  } else {
    const reason = `missing/invalid color on ${active.length - present.length} of ${active.length} regions`;
    out.warnings.push(`colors: ${reason}`);
    set(out, 'colorCount', new Set(present).size, src, false, reason);
    set(out, 'colorSequence', present, src, false, reason);
  }

  // ids
  const ids = regions.map(r => (typeof r?.id === 'string' && r.id ? r.id : null));
  const idOk = ids.every(Boolean);
  set(out, 'orderedRegionIds', ids.filter(Boolean), src, idOk, idOk ? null : 'some regions have no string id');

  // holes — only explicit numeric `holes` (EnrichedRegion declares a number). Never inferred.
  const declared = active.filter(r => num(r?.holes) != null && r.holes >= 0);
  const holeCoverage = active.length ? declared.length / active.length : 1;
  set(out, 'holeCoverage', holeCoverage, src);
  if (active.length === 0) {
    set(out, 'explicitHoleCount', 0, src);
  } else if (declared.length === 0) {
    unset(out, 'explicitHoleCount', 'no region declares an explicit holes field');
  } else {
    const sum = declared.reduce((s, r) => s + r.holes, 0);
    set(out, 'explicitHoleCount', sum, 'region.holes', holeCoverage === 1,
      holeCoverage === 1 ? null : `only ${declared.length}/${active.length} regions declare holes — partial sum`);
    if (holeCoverage < 1) out.warnings.push('holes: partial declaration — explicitHoleCount is incomplete');
  }

  // areas mm² — never mixed with other units, all-or-unavailable
  const mm2 = active.map(r => num(r?.area_mm2));
  if (active.length === 0) {
    set(out, 'totalAreaMm2', 0, 'region.area_mm2');
    for (const k of ['averageRegionAreaMm2', 'minimumRegionAreaMm2', 'maximumRegionAreaMm2']) unset(out, k, 'no active regions');
  } else if (mm2.every(v => v != null && v >= 0)) {
    const total = mm2.reduce((s, v) => s + v, 0);
    set(out, 'totalAreaMm2', total, 'region.area_mm2');
    set(out, 'averageRegionAreaMm2', total / mm2.length, 'region.area_mm2');
    set(out, 'minimumRegionAreaMm2', Math.min(...mm2), 'region.area_mm2');
    set(out, 'maximumRegionAreaMm2', Math.max(...mm2), 'region.area_mm2');
  } else {
    const reason = 'area_mm2 not declared on all active regions — units are never mixed';
    for (const k of ['totalAreaMm2', 'averageRegionAreaMm2', 'minimumRegionAreaMm2', 'maximumRegionAreaMm2']) unset(out, k, reason);
  }

  // areas normalized — single method per computation, never mixed with mm²
  if (active.length === 0) {
    set(out, 'totalAreaNormalized', 0, 'region.area_norm');
    unset(out, 'averageRegionAreaNormalized', 'no active regions');
  } else {
    const norm = active.map(r => num(r?.area_norm));
    if (norm.every(v => v != null && v >= 0)) {
      const total = norm.reduce((s, v) => s + v, 0);
      set(out, 'totalAreaNormalized', total, 'region.area_norm');
      set(out, 'averageRegionAreaNormalized', total / norm.length, 'region.area_norm');
    } else {
      const sh = active.map(r => shoelaceNormalized(r?.path_points));
      if (sh.every(v => v != null)) {
        const total = sh.reduce((s, v) => s + v, 0);
        set(out, 'totalAreaNormalized', total, 'shoelace(path_points)');
        set(out, 'averageRegionAreaNormalized', total / sh.length, 'shoelace(path_points)');
      } else {
        const reason = 'neither area_norm nor valid path_points on all active regions';
        unset(out, 'totalAreaNormalized', reason);
        unset(out, 'averageRegionAreaNormalized', reason);
      }
    }
  }

  // small regions — requires explicit mm² threshold + complete mm² areas
  const threshold = num(options?.smallRegionAreaThresholdMm2);
  if (threshold == null) {
    unset(out, 'smallRegionCount', 'no smallRegionAreaThresholdMm2 option provided');
  } else if (out.availability.totalAreaMm2.available && out.availability.totalAreaMm2.complete && active.length > 0) {
    set(out, 'smallRegionCount', mm2.filter(v => v < threshold).length, `region.area_mm2 < ${threshold} mm²`);
  } else if (active.length === 0) {
    set(out, 'smallRegionCount', 0, `region.area_mm2 < ${threshold} mm²`);
  } else {
    unset(out, 'smallRegionCount', 'mm² areas incomplete — cannot apply threshold');
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────
function extractCommandMetrics(commands, out) {
  if (!Array.isArray(commands)) {
    const reason = 'commands not provided';
    for (const k of ['stitchCount', 'jumpCount', 'trimCount', 'colorChangeCount', 'endCount', 'stopCount',
      'unknownCommandCount', 'commandCount', 'commandRecognitionCoverage']) unset(out, k, reason);
    return;
  }
  const src = 'result.commands';
  const counts = { stitch: 0, jump: 0, trim: 0, colorChange: 0, end: 0, stop: 0, unknown: 0 };
  const unknownTypes = new Set();
  for (const c of commands) {
    const t = normalizeCommandType(c?.type);
    counts[t]++;
    if (t === 'unknown') unknownTypes.add(String(c?.type));
  }
  const total = commands.length;
  const coverage = total > 0 ? (total - counts.unknown) / total : 1;
  const complete = counts.unknown === 0;
  const reason = complete ? null : `unknown command types present: ${[...unknownTypes].join(', ')}`;
  if (!complete) out.warnings.push(`commands: ${reason}`);

  set(out, 'stitchCount', counts.stitch, src, complete, reason);
  set(out, 'jumpCount', counts.jump, src, complete, reason);
  set(out, 'trimCount', counts.trim, src, complete, reason);
  set(out, 'colorChangeCount', counts.colorChange, src, complete, reason);
  set(out, 'endCount', counts.end, src, complete, reason);
  set(out, 'stopCount', counts.stop, src, complete, reason);
  set(out, 'unknownCommandCount', counts.unknown, src);
  set(out, 'commandCount', total, src);
  set(out, 'commandRecognitionCoverage', coverage, src);
}

// ── Stage log (verified: [{ stage, durationMs, ok, ts, error? }]) ────────────
function extractStageMetrics(result, out) {
  const log = result.stageLog;
  if (Array.isArray(log) && log.length > 0) {
    const src = 'ctx.stageLog';
    const timings = log.map(s => ({
      stage: typeof s?.stage === 'string' ? s.stage : null,
      durationMs: num(s?.durationMs),
      ok: typeof s?.ok === 'boolean' ? s.ok : null,
      error: typeof s?.error === 'string' ? s.error : null,
    }));
    const missingTiming = timings.filter(t => t.durationMs == null).length;
    set(out, 'stageTimings', timings, src);
    set(out, 'stageFailureCount', timings.filter(t => t.ok === false).length, src);
    set(out, 'completedStageCount', timings.filter(t => t.ok === true).length, src);
    set(out, 'unavailableStageTimingCount', missingTiming, src);
    const declared = num(result.processingTimeMs);
    if (declared != null) {
      set(out, 'processingTimeMs', declared, 'result.processingTimeMs');
    } else {
      const sum = timings.reduce((s, t) => s + (t.durationMs ?? 0), 0);
      set(out, 'processingTimeMs', sum, 'sum(stageLog.durationMs)', missingTiming === 0,
        missingTiming === 0 ? null : `${missingTiming} stage(s) without durationMs — partial sum`);
    }
  } else {
    const declared = num(result.processingTimeMs);
    if (declared != null) set(out, 'processingTimeMs', declared, 'result.processingTimeMs');
    else unset(out, 'processingTimeMs', 'no stageLog and no processingTimeMs');
    for (const k of ['stageTimings', 'stageFailureCount', 'completedStageCount', 'unavailableStageTimingCount']) {
      unset(out, k, 'stageLog not provided');
    }
  }

  if (Array.isArray(result.warnings)) set(out, 'warningCount', result.warnings.length, 'result.warnings');
  else unset(out, 'warningCount', 'warnings not provided');
  if (Array.isArray(result.errors)) set(out, 'errorCount', result.errors.length, 'result.errors');
  else unset(out, 'errorCount', 'errors not provided');
}

/**
 * @param {object} result — { regions?, commands?, stageLog?, processingTimeMs?, warnings?, errors? }
 * @param {object} [options] — { smallRegionAreaThresholdMm2 }
 * @returns {{ metrics: object, availability: object, warnings: string[] }}
 */
export function extractMetrics(result, options = {}) {
  const out = initOutput();
  if (!result || typeof result !== 'object') {
    out.warnings.push('extraction: result is not an object — all metrics unavailable');
    for (const k of METRIC_KEYS) unset(out, k, 'no result provided');
    return out;
  }
  extractRegionMetrics(result.regions, out, options);
  extractCommandMetrics(result.commands, out);
  extractStageMetrics(result, out);
  return out;
}