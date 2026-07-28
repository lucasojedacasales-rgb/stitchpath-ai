/**
 * coordinateNormalizer.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Resolves the coordinate space explicitly. Never guesses it from value ranges.
 */

import { COORDINATE_SPACES } from './evaluatorSchema.js';

const isPositive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Priority: 1) design.coordinateSpace  2) verified result metadata (opt-in only,
 * because the base engine declares none)  3) options.coordinateSpace.
 * @returns {{space:string|null, status:'resolved'|'unavailable', source:string|null,
 *            widthMm:number|null, heightMm:number|null, widthPx:number|null,
 *            heightPx:number|null, conversions:string[], reason:string}}
 */
export function resolveCoordinateSystem({ design = null, result = null, options = {} } = {}) {
  const d = design && typeof design === 'object' ? design : {};
  const widthMm = isPositive(d.widthMm) ? d.widthMm : null;
  const heightMm = isPositive(d.heightMm) ? d.heightMm : null;
  const widthPx = isPositive(d.widthPx) ? d.widthPx : null;
  const heightPx = isPositive(d.heightPx) ? d.heightPx : null;

  let declared = null;
  let source = null;
  if (typeof d.coordinateSpace === 'string') { declared = d.coordinateSpace; source = 'design.coordinateSpace'; }
  else if (options.allowResultMetaCoordinateSpace === true && typeof result?.meta?.coordinateSpace === 'string') {
    declared = result.meta.coordinateSpace;
    source = 'result.meta.coordinateSpace (unverified in the base engine)';
  } else if (typeof options.coordinateSpace === 'string') { declared = options.coordinateSpace; source = 'options.coordinateSpace'; }

  const base = { space: null, status: 'unavailable', source, widthMm, heightMm, widthPx, heightPx, conversions: [] };

  if (declared == null) {
    return { ...base, reason: 'No coordinate space was declared; it is never inferred from value ranges.' };
  }
  if (!COORDINATE_SPACES.includes(declared)) {
    return { ...base, space: null, reason: `Unsupported coordinate space "${declared}"; only ${COORDINATE_SPACES.join(', ')} are accepted.` };
  }
  if (declared === 'normalized_0_1' && (widthMm == null || heightMm == null)) {
    return { ...base, reason: 'normalized_0_1 requires design.widthMm and design.heightMm.' };
  }
  if (declared === 'pixels' && (widthPx == null || heightPx == null || widthMm == null || heightMm == null)) {
    return { ...base, reason: 'pixels requires design.widthPx, design.heightPx, design.widthMm and design.heightMm.' };
  }

  const conversions = [];
  if (declared === 'normalized_0_1') conversions.push('xMm = x * design.widthMm; yMm = y * design.heightMm');
  if (declared === 'pixels') conversions.push('xMm = x * (design.widthMm / design.widthPx); yMm = y * (design.heightMm / design.heightPx)');
  if (declared === 'mm') conversions.push('no conversion applied');

  return { ...base, space: declared, status: 'resolved', conversions, reason: `Coordinate space "${declared}" declared by ${source}.` };
}

/** Returns a pure point→mm converter, or null when the space is unavailable. */
export function createPointConverter(coordinateSystem) {
  if (!coordinateSystem || coordinateSystem.status !== 'resolved') return null;
  const { space, widthMm, heightMm, widthPx, heightPx } = coordinateSystem;
  if (space === 'mm') return ([x, y]) => [x, y];
  if (space === 'normalized_0_1') return ([x, y]) => [x * widthMm, y * heightMm];
  const sx = widthMm / widthPx;
  const sy = heightMm / heightPx;
  return ([x, y]) => [x * sx, y * sy];
}