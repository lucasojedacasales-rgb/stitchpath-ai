/**
 * canonicalSnapshot.js — Hatch Lab / baselines / A_WIDTHS (P0.3B)
 *
 * Pure helpers that turn a sanitized pipeline snapshot into the reproducible
 * baseline artefacts: canonical JSON text, the region summary (rows + CSV), the
 * canonical region-source resolution and the engine input audit.
 *
 * No engine imports. No rounding. Nothing invented: absent data stays null.
 */

import { REGION_SUMMARY_COLUMNS, FORBIDDEN_INPUT_KEYS, SEED_CASE_IDS, DESIGN_MM } from './baselineSchema.js';

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const get = (obj, key) => (isPlainObject(obj) && obj[key] !== undefined ? obj[key] : null);

/** Stable, key-sorted JSON so identical data always produces identical bytes. */
export function canonicalJson(value, indent = 2) {
  const sort = v => {
    if (Array.isArray(v)) return v.map(sort);
    if (isPlainObject(v)) {
      return Object.keys(v).sort().reduce((out, k) => { out[k] = sort(v[k]); return out; }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

/**
 * Resolves which collection of the real result is the canonical final one.
 * Decided from the captured data plus the declared stage contract — never assumed.
 */
export function resolveCanonicalRegionSource(snapshot) {
  const counts = {
    regions: Array.isArray(snapshot?.regions) ? snapshot.regions.length : null,
    optimizedRegions: Array.isArray(snapshot?.optimizedRegions) ? snapshot.optimizedRegions.length : null,
    optimizedSequence: Array.isArray(snapshot?.optimized?.optimizedSequence) ? snapshot.optimized.optimizedSequence.length : null,
    objects: Array.isArray(snapshot?.objects) ? snapshot.objects.length : null,
  };
  const stitchOptimizerRan = (snapshot?.stageLog || []).some(s => s?.stage === 'stitch_optimizer' && s?.ok);
  const declared = Object.entries(counts).filter(([, n]) => n !== null).map(([k]) => k);

  // Contract (src/lib/pipeline/stages/stitchOptimizerStage.js): the optimizer writes
  // the final production order back into ctx.regions, so ctx.regions is canonical.
  const canonical = counts.regions !== null ? 'regions' : (declared[0] || null);

  return {
    selectedRegionSource: canonical,
    declaredCollections: declared,
    countsByCollection: counts,
    stitchOptimizerRan,
    justification: canonical === 'regions'
      ? 'stitch_optimizer writes the final production order back into ctx.regions; optimized.optimizedSequence is a report of the same objects, so ctx.regions is the canonical final collection.'
      : 'ctx.regions is absent in this run; the canonical collection is documented explicitly and collections are never mixed.',
  };
}

/**
 * Declares the coordinate space from the real stage contract, never from value ranges.
 */
export function resolveCoordinateDeclaration({ widthPx, heightPx, regionSource }) {
  return {
    design: {
      widthMm: DESIGN_MM.widthMm,
      heightMm: DESIGN_MM.heightMm,
      widthPx,
      heightPx,
      coordinateSpace: 'normalized_0_1',
    },
    justification: 'normalizeRegionForPipeline (src/lib/pipeline/regionNormalize.js) normalizes region.path_points to the [0,1]² space before region_builder, and no later stage converts them back to mm or pixels. The declaration comes from that stage contract, not from observing values between 0 and 1.',
    regionSource,
  };
}

function boundingBox(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = Array.isArray(p) ? p[0] : p?.x;
    const y = Array.isArray(p) ? p[1] : p?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/** One row per region. Absent values are null; nothing is invented or rounded. */
export function buildRegionsSummary(regions, { widthMm = DESIGN_MM.widthMm, heightMm = DESIGN_MM.heightMm } = {}) {
  const list = Array.isArray(regions) ? regions : [];
  return list.map((region, sourceIndex) => {
    const bbox = boundingBox(region?.path_points);
    const underlay = get(region, 'recommended_underlay');
    return {
      sourceIndex,
      id: get(region, 'id'),
      type: get(region, 'type'),
      region_class: get(region, 'region_class'),
      parentRegionId: get(region, 'parentRegionId'),
      color: get(region, 'color') ?? get(region, 'hex'),
      boundingWidthMm: bbox ? (bbox.maxX - bbox.minX) * widthMm : null,
      boundingHeightMm: bbox ? (bbox.maxY - bbox.minY) * heightMm : null,
      centerXMm: bbox ? ((bbox.minX + bbox.maxX) / 2) * widthMm : null,
      centerYMm: bbox ? ((bbox.minY + bbox.maxY) / 2) * heightMm : null,
      areaMm2: get(region, 'area_mm2'),
      stitch_type: get(region, 'stitch_type'),
      density: get(region, 'density'),
      pull_compensation: get(region, 'pull_compensation'),
      angle: get(region, 'angle'),
      underlay: get(region, 'underlay'),
      'recommended_underlay.enabled': isPlainObject(underlay) ? get(underlay, 'enabled') : null,
      'recommended_underlay.type': isPlainObject(underlay) ? get(underlay, 'type') : null,
      'recommended_underlay.density_mm': isPlainObject(underlay) ? get(underlay, 'density_mm') : null,
      priority: get(region, 'priority'),
      layer_order: get(region, 'layer_order'),
      travelOrder: get(region, 'travelOrder'),
      pathPointCount: Array.isArray(region?.path_points) ? region.path_points.length : null,
      contourPointCount: Array.isArray(region?.contour_points) ? region.contour_points.length : null,
    };
  });
}

export function regionsSummaryToCsv(rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = REGION_SUMMARY_COLUMNS.join(',');
  const body = (rows || []).map(row => REGION_SUMMARY_COLUMNS.map(c => cell(row[c])).join(','));
  return [header, ...body].join('\n');
}

/**
 * Proves the engine input carries no Hatch reference material.
 * Scans keys AND string values of the exact object handed to the pipeline.
 */
export function buildEngineInputAudit({ imageUrl, config, initialCtx = null }) {
  const input = { imageUrl, config, initialCtx };
  const text = JSON.stringify(input, (key, value) => (typeof value === 'function' ? '[function]' : value)) || '';

  const foundKeys = [];
  const scan = (value, path) => {
    if (Array.isArray(value)) { value.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_INPUT_KEYS.includes(key)) foundKeys.push(`${path}.${key}`);
      scan(value[key], `${path}.${key}`);
    }
  };
  scan(input, 'engineInput');

  const foundCaseIds = SEED_CASE_IDS.filter(id => text.includes(id));

  return {
    scannedKeys: FORBIDDEN_INPUT_KEYS,
    scannedCaseIds: SEED_CASE_IDS,
    forbiddenKeysFound: foundKeys,
    seedCaseIdsFound: foundCaseIds,
    containsExpectedResult: foundKeys.some(k => k.endsWith('.expectedResult')),
    containsCandidateRules: foundKeys.some(k => k.endsWith('.candidateRules')),
    containsHatchTechnicalValues: foundKeys.length > 0,
    clean: foundKeys.length === 0 && foundCaseIds.length === 0,
    configKeys: isPlainObject(config) ? Object.keys(config).sort() : [],
    initialCtxKeys: isPlainObject(initialCtx) ? Object.keys(initialCtx).sort() : [],
    note: 'Technique, density, pull compensation, underlay and angle are OUTPUTS observed from the engine. None of them is supplied as input, and no Hatch value fills any gap.',
  };
}