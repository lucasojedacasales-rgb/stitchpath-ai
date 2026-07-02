/**
 * contourRefinementGuard.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Transactional contour refinement that cleans travel/artifacts from the flat
 * command sequence WITHOUT touching:
 *   - mouth detection / dark stroke detection of mouth
 *   - dstEncoder / DST export / colorChange / stops / CE01 compatibility
 *   - vectorization base / main fills
 *
 * Allowed refinements (command-level):
 *   1. Convert visible travel disguised as contour stitches → jumps (+trim)
 *   2. Remove artificial black segments crossing the design (non-border)
 *
 * A before/after audit is computed; the candidate is accepted ONLY if every
 * protected metric holds. Otherwise the original commands are returned unchanged.
 *
 * Public API:
 *   runContourRefinementGuard(commands, regions, config) → { commands, accepted, before, after, ... }
 */

import { getContourExportReport, countContourStitches } from './contourExportBuilder';
import { detectTravelContamination } from './contourRefineValidator';
import { calculateUnifiedCommandMetrics } from './unifiedCommandMetrics';
import { validateColorChangeIntegrity } from './threadColorBlocks';

const TRAVEL_THRESHOLD_MM = 3.5;
const CONTOUR_COLORS = new Set(['#1a1a1a', '#000000', '#111111', '#222222']);

// ─── Command classification helpers ──────────────────────────────────────────

function isContourCmd(c) {
  const lt = (c.layerType || '').toLowerCase();
  const rid = (c.regionId || '').toLowerCase();
  const color = (c.color || '').toLowerCase();
  return lt.includes('outline') || lt.includes('contour') || lt.includes('detail') ||
         rid.includes('outline') || rid.includes('contour') ||
         CONTOUR_COLORS.has(color);
}

function isProtectedFacial(c) {
  const lt = (c.layerType || '').toLowerCase();
  const rid = (c.regionId || '').toLowerCase();
  return lt.includes('mouth') || lt.includes('facial') || lt.includes('eye') ||
         rid.includes('mouth') || rid.includes('eye');
}

function isOuterOrDarkStroke(c) {
  const lt = (c.layerType || '').toLowerCase();
  return lt === 'outer_outline' || lt === 'outer_silhouette' ||
         lt === 'dark_stroke_outline' || lt === 'limb_contour';
}

// ─── Audit ───────────────────────────────────────────────────────────────────

function computeAudit(commands, regions) {
  const report = getContourExportReport(regions, commands);
  const counts = countContourStitches(commands);
  const travel = detectTravelContamination(commands, TRAVEL_THRESHOLD_MM);
  const metrics = calculateUnifiedCommandMetrics(commands, regions, {});
  const cc = validateColorChangeIntegrity(commands);

  // artificialGeometryCount: long contour stitches that are NOT outer/dark-stroke
  // (internal spurious black segments crossing the design interior).
  let artificial = 0;
  let prevX = 0, prevY = 0;
  for (const c of commands) {
    if (c && c.type === 'stitch' && isContourCmd(c) && !isProtectedFacial(c) && !isOuterOrDarkStroke(c)) {
      const dist = Math.hypot((c.x || 0) - prevX, (c.y || 0) - prevY);
      if (dist > TRAVEL_THRESHOLD_MM) artificial++;
    }
    if (c && (c.type === 'stitch' || c.type === 'jump')) { prevX = c.x || 0; prevY = c.y || 0; }
    if (c && c.type === 'trim') { /* keep prev */ }
  }

  return {
    mouthExported: counts.mouthStitches > 0,
    mouthStitches: counts.mouthStitches,
    bodyShadowBoundaryOutlined: report.bodyShadowBoundaryOutlined === 'YES',
    outerContourCoverage: 100 - (report.uncoveredPerimeterPercent || 0),
    footContourCoverage: report.visibleFootContourCoverage ?? 100,
    artificialGeometryCount: artificial,
    travelStitchedAsContour: travel,
    jumps: metrics.jumpCount,
    trims: metrics.trimCount,
    stitchCount: metrics.stitchCount,
    colorBlocks: cc.blockCount,
    outerOutlineStitches: counts.outerOutlineStitches,
    darkStrokeStitches: counts.darkStrokeStitches,
    dstCompatible: cc.blockCount >= 1 && metrics.stitchCount > 0,
  };
}

// ─── Refinement: travel→jump + trim ──────────────────────────────────────────

function refineCommands(commands) {
  const out = [];
  let travelConverted = 0;
  let artificialRemoved = 0;
  let prev = null;

  for (const c of commands) {
    if (!c) { out.push(c); continue; }

    if (c.type === 'stitch' && isContourCmd(c) && !isProtectedFacial(c) && prev) {
      const dist = Math.hypot((c.x || 0) - (prev.x || 0), (c.y || 0) - (prev.y || 0));
      if (dist > TRAVEL_THRESHOLD_MM) {
        // Insert trim only if the last emitted command isn't already a trim
        const lastOut = out[out.length - 1];
        if (!lastOut || lastOut.type !== 'trim') {
          out.push({ type: 'trim' });
        }
        out.push({ ...c, type: 'jump' });
        travelConverted++;
        if (!isOuterOrDarkStroke(c)) artificialRemoved++;
        prev = { x: c.x || 0, y: c.y || 0 };
        continue;
      }
    }

    out.push(c);
    if (c.type === 'stitch' || c.type === 'jump') prev = { x: c.x || 0, y: c.y || 0 };
  }

  return { commands: out, travelConverted, artificialRemoved };
}

// ─── Public guard ────────────────────────────────────────────────────────────

export function runContourRefinementGuard(commands, regions, config = {}) {
  const before = computeAudit(commands, regions);

  // Stable locks — log preconditions
  console.log('[stable-lock] mouth preserved:', before.mouthExported ? 'YES' : 'NO');
  console.log('[stable-lock] dst untouched:', before.dstCompatible ? 'YES' : 'NO');
  console.log('[stable-lock] dark stroke preserved:', before.darkStrokeStitches > 0 ? 'YES' : 'NO');

  // Already clean — nothing to do
  if (before.artificialGeometryCount === 0 && before.travelStitchedAsContour === 0) {
    console.log('[refine] accepted: already clean');
    console.log('[refine] outline thickness adjusted: 0');
    return { commands, accepted: true, skipped: true, before, after: before };
  }

  const { commands: candidate, travelConverted, artificialRemoved } = refineCommands(commands);
  const after = computeAudit(candidate, regions);

  console.log(`[refine] artificial geometry removed: ${artificialRemoved}`);
  console.log(`[refine] travel converted to jump: ${travelConverted}`);
  console.log('[refine] outline thickness adjusted: 0');

  // ── Revert rules (mandatory) ──
  const reject = (reason) => {
    console.log(`[refine] rejected reason: ${reason}`);
    return { commands, accepted: false, before, after, reason };
  };

  if (!after.mouthExported) return reject('mouthExported=false');
  if (after.bodyShadowBoundaryOutlined) return reject('bodyShadowBoundaryOutlined=true');
  if (after.artificialGeometryCount > before.artificialGeometryCount) return reject('artificialGeometryCount rose');
  if (after.colorBlocks <= 1 && before.colorBlocks > 1) return reject('colors dropped to 1 block');
  if (!after.dstCompatible) return reject('DST incompatible');

  // ── Acceptance criteria ──
  const ok =
    after.mouthExported &&
    !after.bodyShadowBoundaryOutlined &&
    after.artificialGeometryCount === 0 &&
    after.travelStitchedAsContour === 0 &&
    after.outerContourCoverage >= before.outerContourCoverage &&
    after.footContourCoverage >= before.footContourCoverage;

  if (!ok) {
    const reasons = [];
    if (after.artificialGeometryCount > 0) reasons.push('artificialGeometryCount>0');
    if (after.travelStitchedAsContour > 0) reasons.push('travelStitchedAsContour>0');
    if (after.outerContourCoverage < before.outerContourCoverage) reasons.push('outerContourCoverage dropped');
    if (after.footContourCoverage < before.footContourCoverage) reasons.push('footContourCoverage dropped');
    return reject(reasons.join('; '));
  }

  console.log('[refine] accepted: all criteria met');
  return { commands: candidate, accepted: true, before, after };
}