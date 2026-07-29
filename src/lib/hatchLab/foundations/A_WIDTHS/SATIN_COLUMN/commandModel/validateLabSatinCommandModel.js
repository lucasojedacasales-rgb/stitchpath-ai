/**
 * validateLabSatinCommandModel.js — declarative validation of a compiled lab
 * model against the source geometry. Pure; reports, never repairs.
 */

import { ALLOWED_OPS, FORBIDDEN_OPS, SEGMENT_KINDS, RAIL_LABELS, LENGTH_LIMITS } from './commandModelSchema.js';
import { computeCommandModelHash } from './canonicalizeLabSatinCommands.js';

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

export function validateLabSatinCommandModel(model, candidate, limits = LENGTH_LIMITS) {
  const checks = [];
  const add = (name, satisfied, detail) => checks.push({ name, satisfied: !!satisfied, detail: detail ?? null });

  const pts = Array.isArray(candidate?.pointsMm) ? candidate.pointsMm : [];
  const cmds = Array.isArray(model?.commands) ? model.commands : [];
  const stations = candidate?.stationCount ?? 0;

  add('coordinateSpaceMm', model?.coordinateSpace === 'mm', model?.coordinateSpace);
  add('candidateOnly', model?.candidateOnly === true);
  add('notIntegrated', model?.integrated === false);
  add('notMachineReady', model?.machineReady === false && model?.exportReady === false);

  // ── forbidden productive ops ───────────────────────────────────────────
  const forbidden = cmds.filter((c) => FORBIDDEN_OPS.includes(c.op)).map((c) => `${c.commandIndex}:${c.op}`);
  add('noForbiddenOps', forbidden.length === 0, forbidden.length ? `forbidden ops present: ${forbidden.join(', ')}` : 'none');
  add('allOpsAllowed', cmds.every((c) => ALLOWED_OPS.includes(c.op)), `${new Set(cmds.map((c) => c.op)).size} distinct op(s)`);
  add('allSegmentKindsKnown', cmds.every((c) => SEGMENT_KINDS.includes(c.segmentKind)));
  add('allRailLabelsKnown', cmds.every((c) => RAIL_LABELS.includes(c.fromRail) && RAIL_LABELS.includes(c.toRail)));

  // ── counts ────────────────────────────────────────────────────────────
  add('commandCountEqualsPointsMinusOne', cmds.length === Math.max(pts.length - 1, 0), `${cmds.length} vs ${pts.length - 1}`);
  add('crossColumnCountEqualsStations', model?.metrics?.crossColumnCommandCount === stations, `${model?.metrics?.crossColumnCommandCount} vs ${stations}`);
  add('advanceDiagonalCountEqualsStationsMinusOne', model?.metrics?.advanceDiagonalCommandCount === Math.max(stations - 1, 0));
  add('totalCountEqualsTwoStationsMinusOne', cmds.length === Math.max(2 * stations - 1, 0));

  // ── exact geometry correspondence ─────────────────────────────────────
  add('startAnchorIsFirstPoint', same(model?.startAnchorMm, pts[0]));
  add('endAnchorIsLastPoint', same(model?.endAnchorMm, pts[pts.length - 1]));
  const driftIndex = cmds.findIndex((c, i) => !same(c.fromMm, pts[i]) || !same(c.toMm, pts[i + 1]));
  add('noCoordinateDrift', driftIndex === -1, driftIndex === -1 ? 'every fromMm/toMm equals its source point' : `first drift at command ${driftIndex}`);
  add('orderPreserved', cmds.every((c, i) => c.commandIndex === i && c.sourcePointIndex === i + 1));
  const deltaBad = cmds.findIndex((c) => c.deltaMm[0] !== c.toMm[0] - c.fromMm[0] || c.deltaMm[1] !== c.toMm[1] - c.fromMm[1]);
  add('deltaMatchesEndpoints', deltaBad === -1, deltaBad === -1 ? null : `command ${deltaBad}`);
  const lenBad = cmds.findIndex((c) => Math.abs(c.lengthMm - Math.hypot(c.deltaMm[0], c.deltaMm[1])) > 1e-12);
  add('lengthMatchesDelta', lenBad === -1, lenBad === -1 ? null : `command ${lenBad}`);
  const sum = cmds.reduce((a, c) => a + c.lengthMm, 0);
  let sourceWalk = 0;
  for (let i = 0; i + 1 < pts.length; i++) sourceWalk += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  add('totalLengthMatchesSourceWalk', Math.abs(sum - sourceWalk) < 1e-9, `${sum} vs ${sourceWalk}`);

  // ── segment semantics ─────────────────────────────────────────────────
  const kindBad = cmds.findIndex((c, i) => c.segmentKind !== (i % 2 === 0 ? 'cross_column' : 'advance_diagonal'));
  add('segmentKindAlternates', kindBad === -1, kindBad === -1 ? null : `command ${kindBad}`);
  const crossBad = cmds.findIndex((c) => c.segmentKind === 'cross_column'
    && !(c.fromRail === 'left' && c.toRail === 'right' && c.fromStationIndex === c.toStationIndex));
  add('crossColumnJoinsBothRailsOfOneStation', crossBad === -1, crossBad === -1 ? null : `command ${crossBad}`);
  const advBad = cmds.findIndex((c) => c.segmentKind === 'advance_diagonal'
    && !(c.fromRail === 'right' && c.toRail === 'left' && c.toStationIndex === c.fromStationIndex + 1));
  add('advanceDiagonalConnectsConsecutiveStations', advBad === -1, advBad === -1 ? null : `command ${advBad}`);

  // Cross-column stitches must reproduce the station width measured by the rails.
  const widths = Array.isArray(candidate?.stationWidthsMm) ? candidate.stationWidthsMm : [];
  const widthBad = cmds.filter((c) => c.segmentKind === 'cross_column')
    .findIndex((c, k) => Number.isFinite(widths[k]) && Math.abs(c.lengthMm - widths[k]) > 1e-9);
  add('crossColumnPreservesStationWidth', widthBad === -1, widthBad === -1 ? 'every cross stitch equals its station width' : `station ${widthBad}`);

  // ── numeric safety ────────────────────────────────────────────────────
  add('allLengthsFinite', cmds.every((c) => Number.isFinite(c.lengthMm)));
  add('noZeroLengthCommands', model?.metrics?.zeroLengthCommandCount === 0);
  add('noCommandAboveMaximum', model?.metrics?.aboveMaximumCommandCount === 0, `limit ${limits.maxStitchLengthMm} mm`);
  add('noCommandBelowMinimum', model?.metrics?.belowMinimumCommandCount === 0, `limit ${limits.minStitchLengthMm} mm`);
  add('noNonFiniteCommands', model?.metrics?.nonFiniteCommandCount === 0);
  add('nothingAddedRemovedOrMerged', model?.safety?.commandsAdded === 0 && model?.safety?.commandsRemoved === 0 && model?.safety?.commandsMerged === 0);
  add('containmentPreserved', candidate?.containmentStatus === 'contained' && candidate?.outsideSampleCount === 0);

  // ── traceability ──────────────────────────────────────────────────────
  for (const key of ['baselineId', 'rawCaptureSha256', 'caseId', 'regionId', 'polygonHash', 'sourceCandidateHash', 'compilerVersion', 'modelVersion']) {
    add(`traceability.${key}`, model?.[key] != null && model[key] !== '', String(model?.[key] ?? 'missing'));
  }
  add('hashReproducible', model?.commandModelHash === computeCommandModelHash(model), model?.commandModelHash);

  const failed = checks.filter((c) => !c.satisfied);
  return {
    valid: failed.length === 0,
    checks,
    failedChecks: failed.map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`),
  };
}