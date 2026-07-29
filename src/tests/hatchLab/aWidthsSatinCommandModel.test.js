/**
 * aWidthsSatinCommandModel.test.js — P1.F1 straight satin LAB command model.
 *
 * Tests only P1.F1. The previous suites are executed once by the aggregator and
 * are NOT re-run here. Laboratory only: no productive import, no engine, no
 * export, no baseline write.
 */

import fixture from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/fixtures/A_WIDTHS_STRAIGHT_BARS.json';
import artifactManifest from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/artifactManifest.json';
import { measureSatinCandidate, auditRegionTopology, reconcileHoleSemantics } from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/index.js';
import {
  buildLabSatinCandidate, compileStraightSatinCandidateToLabCommands,
  validateLabSatinCommandModel, computeCommandModelHash, canonicalizeLabSatinCommands,
  COMMAND_MODEL_VERSION, COMPILER_VERSION, LENGTH_LIMITS, FORBIDDEN_OPS,
  COMMAND_MODEL_ISOLATION, LAYER_SEPARATION,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/index.js';
import sourceClosure from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/sourceClosure.json';
import contractAudit from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveCommandContractAudit.json';
import commandModelReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/reports/commandModelReport.json';
import fixtureA1 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A1-SATIN-LAB-COMMANDS.json';
import fixtureA5 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A5-SATIN-LAB-COMMANDS.json';
import fixtureA6 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A6-SATIN-LAB-COMMANDS.json';
import fixtureA7 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A7-SATIN-LAB-COMMANDS.json';
import fixtureA8 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A8-SATIN-LAB-COMMANDS.json';

const PERSISTED = {
  'HATCH-A-WIDTHS-A1': fixtureA1,
  'HATCH-A-WIDTHS-A5': fixtureA5,
  'HATCH-A-WIDTHS-A6': fixtureA6,
  'HATCH-A-WIDTHS-A7': fixtureA7,
  'HATCH-A-WIDTHS-A8': fixtureA8,
};
const CASE_IDS = Object.keys(PERSISTED);
const IDENTITY = {
  'HATCH-A-WIDTHS-A1': 'r_zbgef31',
  'HATCH-A-WIDTHS-A5': 'r_sv7z5qe',
  'HATCH-A-WIDTHS-A6': 'r_ecj9hl4',
  'HATCH-A-WIDTHS-A7': 'r_c92bxh3',
  'HATCH-A-WIDTHS-A8': 'r_zr65703',
};

function compileCase(entry, overrides = {}) {
  const measured = measureSatinCandidate({ caseId: entry.caseId, regionId: entry.regionId, region: entry.region, design: fixture.design });
  const rec = reconcileHoleSemantics({ region: entry.region, topology: auditRegionTopology(entry.region, fixture.design) });
  const candidate = {
    ...buildLabSatinCandidate(measured, {
      baselineId: fixture.baselineId, rawCaptureSha256: fixture.rawCaptureSha256,
      caseId: entry.caseId, regionId: entry.regionId, sourceIndex: entry.sourceIndex, polygonHash: entry.polygonHash,
    }),
    ...overrides,
  };
  const model = compileStraightSatinCandidateToLabCommands({ candidate, holeReconciliation: rec });
  return { measured, candidate, model, validation: validateLabSatinCommandModel(model, candidate) };
}

export function runAWidthsSatinCommandModelTests() {
  const results = [];
  const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const ok = (c, m) => { if (!c) throw new Error(m); };

  const compiled = fixture.regions.map((e) => compileCase(e));
  const byCase = (id) => compiled.find((c) => c.model.caseId === id);
  const synthCandidate = (over = {}) => ({
    baselineId: 'LAB', rawCaptureSha256: 'LAB', caseId: 'SYNTH', regionId: 'synth', sourceIndex: 0,
    polygonHash: 'fnv1a32:00000000', sourceCandidateHash: 'fnv1a32:00000000',
    candidateOnly: true, integrated: false, coordinateSpace: 'mm',
    geometryType: 'paired_boundary_zigzag', geometryEligibility: 'eligible', overallEligibility: 'eligible',
    holeMetadataStatus: 'clear', candidateGeometryComplete: true, allStationsPaired: true, failedStations: 0,
    containmentStatus: 'contained', outsideSampleCount: 0, splitRequired: false,
    pointsMm: [[0, 0], [3, 0], [0, 1], [3, 1]], stationCount: 2, stationWidthsMm: [3, 3],
    spacingMm: 1, maximumStitchLengthMm: 12.1, ...over,
  });

  // ── 1-2. formal state ────────────────────────────────────────────────────
  check('formal hole-semantics state and authorized step are recorded', () => {
    eq(sourceClosure.holeSemanticsResolution, 'HOLE_SEMANTICS_RESOLVED_NO_REAL_HOLES', 'holeSemanticsResolution');
    eq(sourceClosure.authorizedNextStep, 'PROCEED_TO_P1_F1_STRAIGHT_SATIN_COMMAND_MODEL', 'authorizedNextStep');
    eq(sourceClosure.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', 'baselineId');
    eq(sourceClosure.rawCaptureSha256, fixture.rawCaptureSha256, 'rawCaptureSha256');
    eq(sourceClosure.sourceFixtureModified, false, 'sourceFixtureModified');
    eq(commandModelReport.holeSemanticsResolution, 'HOLE_SEMANTICS_RESOLVED_NO_REAL_HOLES', 'report resolution');
  });
  check('layer separation and length-limit provenance are declared', () => {
    eq(LENGTH_LIMITS.minStitchLengthMm, 0.3, 'min');
    eq(LENGTH_LIMITS.maxStitchLengthMm, 12.1, 'max');
    eq(LENGTH_LIMITS.enforcement, 'diagnostic_only', 'enforcement');
    ok(/machineSettings/.test(LENGTH_LIMITS.provenance), 'provenance names machineSettings');
    ok(/NOT produced here/.test(LAYER_SEPARATION.machineCommand), 'machine layer marked as not produced');
    ok(/NOT produced here/.test(LAYER_SEPARATION.exportFormat), 'export layer marked as not produced');
  });

  // ── 3-7. source verdicts ────────────────────────────────────────────────
  check('the five candidates report eligible geometry, clear metadata and eligible overall', () => {
    eq(compiled.length, 5, 'five cases');
    for (const { candidate } of compiled) {
      eq(candidate.geometryEligibility, 'eligible', `${candidate.caseId} geometryEligibility`);
      eq(candidate.holeMetadataStatus, 'clear', `${candidate.caseId} holeMetadataStatus`);
      eq(candidate.overallEligibility, 'eligible', `${candidate.caseId} overallEligibility`);
      eq(candidate.candidateGeometryComplete, true, `${candidate.caseId} candidateGeometryComplete`);
      eq(candidate.splitRequired, false, `${candidate.caseId} splitRequired`);
      eq(candidate.allStationsPaired, true, `${candidate.caseId} allStationsPaired`);
      eq(candidate.failedStations, 0, `${candidate.caseId} failedStations`);
    }
  });

  // ── 8-11. fixtures, identity and provenance ─────────────────────────────
  check('exactly five persisted command fixtures with the correct identities', () => {
    eq(CASE_IDS.length, 5, 'five fixtures');
    eq(commandModelReport.cases.length, 5, 'five report rows');
    for (const id of CASE_IDS) {
      const f = PERSISTED[id];
      eq(f.caseId, id, 'caseId');
      eq(f.regionId, IDENTITY[id], `${id} regionId`);
      eq(f.modelVersion, COMMAND_MODEL_VERSION, `${id} modelVersion`);
      eq(f.compilerVersion, COMPILER_VERSION, `${id} compilerVersion`);
      eq(f.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', `${id} baselineId`);
      eq(f.rawCaptureSha256, fixture.rawCaptureSha256, `${id} rawCaptureSha256`);
      eq(f.candidateOnly, true, `${id} candidateOnly`);
      eq(f.integrated, false, `${id} integrated`);
      eq(f.machineReady, false, `${id} machineReady`);
      eq(f.exportReady, false, `${id} exportReady`);
      eq(f.coordinateSpace, 'mm', `${id} coordinateSpace`);
    }
  });
  check('polygon hashes and source indices are preserved from the geometry fixture', () => {
    for (const entry of fixture.regions) {
      const f = PERSISTED[entry.caseId];
      eq(f.polygonHash, entry.polygonHash, `${entry.caseId} polygonHash`);
      eq(f.sourceIndex, entry.sourceIndex, `${entry.caseId} sourceIndex`);
      ok(typeof f.sourceCandidateHash === 'string' && f.sourceCandidateHash.startsWith('fnv1a32:'), `${entry.caseId} sourceCandidateHash`);
      eq(f.holeReconciliationStatus, 'clear', `${entry.caseId} holeReconciliationStatus`);
      eq(f.sourceSpacingMm, 0.4, `${entry.caseId} sourceSpacingMm`);
      eq(f.sourceMaximumStitchLengthMm, 12.1, `${entry.caseId} sourceMaximumStitchLengthMm`);
    }
  });

  // ── 12-17. counts and anchors ───────────────────────────────────────────
  check('startAnchor and endAnchor are exactly the first and last geometry points', () => {
    for (const { candidate, model } of compiled) {
      const pts = candidate.pointsMm;
      eq(model.startAnchorMm[0], pts[0][0], `${model.caseId} startAnchor x`);
      eq(model.startAnchorMm[1], pts[0][1], `${model.caseId} startAnchor y`);
      eq(model.endAnchorMm[0], pts[pts.length - 1][0], `${model.caseId} endAnchor x`);
      eq(model.endAnchorMm[1], pts[pts.length - 1][1], `${model.caseId} endAnchor y`);
      ok(/NOT converted into a jump/.test(model.startAnchorPolicy), 'anchor policy stated');
    }
  });
  check('commandCount = pointCount - 1 = 2 x stationCount - 1 with the right split', () => {
    for (const { candidate, model } of compiled) {
      const n = candidate.stationCount;
      eq(model.metrics.commandCount, candidate.pointsMm.length - 1, `${model.caseId} commandCount`);
      eq(model.metrics.crossColumnCommandCount, n, `${model.caseId} cross`);
      eq(model.metrics.advanceDiagonalCommandCount, n - 1, `${model.caseId} diagonal`);
      eq(model.metrics.commandCount, 2 * n - 1, `${model.caseId} total`);
      eq(model.commands.length, model.metrics.commandCount, `${model.caseId} array length`);
    }
  });

  // ── 18-23. ops ──────────────────────────────────────────────────────────
  check('every op is stitch and no productive control op appears', () => {
    for (const { model } of compiled) {
      ok(model.commands.every((c) => c.op === 'stitch'), `${model.caseId} all stitch`);
      for (const forbidden of ['jump', 'trim', 'color_change', 'colorChange', 'end', 'stop', 'tie_in', 'tie_off', 'needle_up', 'needle_down', 'underlay', 'compensation', 'export', 'machine_code']) {
        ok(!model.commands.some((c) => c.op === forbidden), `${model.caseId} contains ${forbidden}`);
        ok(FORBIDDEN_OPS.includes(forbidden) || forbidden === 'stitch', `${forbidden} declared forbidden`);
      }
      ok(!JSON.stringify(model.commands).includes('"jump"'), `${model.caseId} serialized jump`);
      ok(!JSON.stringify(model.commands).includes('"trim"'), `${model.caseId} serialized trim`);
    }
  });

  // ── 24-31. geometry correspondence ──────────────────────────────────────
  check('fromMm, toMm, delta, length, kind, stations and rails are all exact', () => {
    for (const { candidate, model } of compiled) {
      const pts = candidate.pointsMm;
      model.commands.forEach((c, i) => {
        eq(c.fromMm[0], pts[i][0], `${model.caseId} c${i} fromMm x`);
        eq(c.fromMm[1], pts[i][1], `${model.caseId} c${i} fromMm y`);
        eq(c.toMm[0], pts[i + 1][0], `${model.caseId} c${i} toMm x`);
        eq(c.toMm[1], pts[i + 1][1], `${model.caseId} c${i} toMm y`);
        eq(c.deltaMm[0], pts[i + 1][0] - pts[i][0], `${model.caseId} c${i} dx`);
        eq(c.deltaMm[1], pts[i + 1][1] - pts[i][1], `${model.caseId} c${i} dy`);
        eq(c.lengthMm, Math.hypot(c.deltaMm[0], c.deltaMm[1]), `${model.caseId} c${i} length`);
        eq(c.commandIndex, i, `${model.caseId} c${i} index`);
        eq(c.sourcePointIndex, i + 1, `${model.caseId} c${i} sourcePointIndex`);
        eq(c.segmentKind, i % 2 === 0 ? 'cross_column' : 'advance_diagonal', `${model.caseId} c${i} kind`);
        if (c.segmentKind === 'cross_column') {
          eq(c.fromRail, 'left', `${model.caseId} c${i} fromRail`);
          eq(c.toRail, 'right', `${model.caseId} c${i} toRail`);
          eq(c.fromStationIndex, c.toStationIndex, `${model.caseId} c${i} station`);
          eq(c.fromStationIndex, i / 2, `${model.caseId} c${i} stationIndex`);
        } else {
          eq(c.fromRail, 'right', `${model.caseId} c${i} fromRail`);
          eq(c.toRail, 'left', `${model.caseId} c${i} toRail`);
          eq(c.toStationIndex, c.fromStationIndex + 1, `${model.caseId} c${i} advance`);
        }
      });
    }
  });
  check('cross_column stitches reproduce their station width', () => {
    for (const { candidate, model } of compiled) {
      const cross = model.commands.filter((c) => c.segmentKind === 'cross_column');
      eq(cross.length, candidate.stationWidthsMm.length, `${model.caseId} station count`);
      cross.forEach((c, k) => {
        ok(Math.abs(c.lengthMm - candidate.stationWidthsMm[k]) < 1e-9,
          `${model.caseId} station ${k}: ${c.lengthMm} vs ${candidate.stationWidthsMm[k]}`);
      });
    }
  });

  // ── 32-38. numeric safety ───────────────────────────────────────────────
  check('no NaN, no Infinity, no zero-length, none above 12.1 mm, none below 0.3 mm', () => {
    for (const { model } of compiled) {
      for (const c of model.commands) {
        ok(Number.isFinite(c.lengthMm) && !Number.isNaN(c.lengthMm), `${model.caseId} c${c.commandIndex} length finite`);
        ok(Number.isFinite(c.deltaMm[0]) && Number.isFinite(c.deltaMm[1]), `${model.caseId} c${c.commandIndex} delta finite`);
        ok(c.lengthMm > 0, `${model.caseId} c${c.commandIndex} positive`);
        ok(c.lengthMm >= LENGTH_LIMITS.minStitchLengthMm, `${model.caseId} c${c.commandIndex} below minimum`);
        ok(c.lengthMm <= LENGTH_LIMITS.maxStitchLengthMm, `${model.caseId} c${c.commandIndex} above maximum`);
      }
      eq(model.metrics.zeroLengthCommandCount, 0, `${model.caseId} zeroLength`);
      eq(model.metrics.belowMinimumCommandCount, 0, `${model.caseId} belowMinimum`);
      eq(model.metrics.aboveMaximumCommandCount, 0, `${model.caseId} aboveMaximum`);
      eq(model.metrics.nonFiniteCommandCount, 0, `${model.caseId} nonFinite`);
      eq(model.safety.splitRequired, false, `${model.caseId} splitRequired`);
      eq(model.safety.shortStitchHandlingRequired, false, `${model.caseId} shortStitchHandlingRequired`);
      eq(model.safety.modelComplete, true, `${model.caseId} modelComplete`);
      eq(model.status, 'lab_command_model_complete', `${model.caseId} status`);
    }
  });
  check('total path length is reproducible from the source walk and containment is preserved', () => {
    for (const { candidate, model } of compiled) {
      let walk = 0;
      const pts = candidate.pointsMm;
      for (let i = 0; i + 1 < pts.length; i++) walk += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      ok(Math.abs(model.metrics.totalPathLengthMm - walk) < 1e-9, `${model.caseId} total length`);
      const sum = model.commands.reduce((a, c) => a + c.lengthMm, 0);
      ok(Math.abs(sum - model.metrics.totalPathLengthMm) < 1e-9, `${model.caseId} sum of lengths`);
      eq(model.containmentStatus, 'contained', `${model.caseId} containment`);
      eq(candidate.outsideSampleCount, 0, `${model.caseId} outsideSampleCount`);
      eq(model.safety.commandsAdded + model.safety.commandsRemoved + model.safety.commandsMerged, 0, `${model.caseId} nothing altered`);
    }
  });

  // ── 39-43. purity, determinism, hashing ─────────────────────────────────
  check('the compiler never mutates the candidate or the source geometry', () => {
    const entry = fixture.regions[0];
    const before = JSON.stringify(entry);
    const { candidate } = compileCase(entry);
    const candBefore = JSON.stringify(candidate);
    compileStraightSatinCandidateToLabCommands({ candidate });
    eq(JSON.stringify(candidate), candBefore, 'candidate unchanged');
    eq(JSON.stringify(entry), before, 'fixture entry unchanged');
    eq(entry.region.stitch_type, 'fill', 'stitch_type untouched');
    eq(entry.region.holes, 1, 'raw holes untouched');
  });
  check('compilation is deterministic and the canonical hash is reproducible', () => {
    for (const entry of fixture.regions) {
      const a = compileCase(entry).model;
      const b = compileCase(entry).model;
      eq(JSON.stringify(a), JSON.stringify(b), `${entry.caseId} deterministic`);
      eq(a.commandModelHash, computeCommandModelHash(a), `${entry.caseId} hash reproducible`);
      ok(!JSON.stringify(canonicalizeLabSatinCommands(a)).includes('commandModelHash'), 'hash excluded from canonical form');
      ok(!JSON.stringify(canonicalizeLabSatinCommands(a)).includes('generatedAt'), 'timestamp excluded from canonical form');
    }
  });
  check('editing a point or reordering commands changes the hash', () => {
    const base = compileStraightSatinCandidateToLabCommands({ candidate: synthCandidate() });
    const moved = compileStraightSatinCandidateToLabCommands({ candidate: synthCandidate({ pointsMm: [[0, 0], [3.0001, 0], [0, 1], [3, 1]], stationWidthsMm: [3.0001, 3] }) });
    ok(base.commandModelHash !== moved.commandModelHash, 'point edit changes the hash');
    const reordered = { ...base, commands: [base.commands[1], base.commands[0], base.commands[2]] };
    ok(computeCommandModelHash(reordered) !== base.commandModelHash, 'reordering changes the hash');
  });

  // ── 44-51. rejections ───────────────────────────────────────────────────
  check('partial, metadata_conflict, ineligible and splitRequired candidates are rejected', () => {
    const cases = [
      [synthCandidate({ geometryEligibility: 'partial', overallEligibility: 'partial' }), 'ineligible'],
      [synthCandidate({ holeMetadataStatus: 'conflict', overallEligibility: 'metadata_conflict' }), 'metadata_conflict'],
      [synthCandidate({ geometryEligibility: 'ineligible', overallEligibility: 'ineligible' }), 'ineligible'],
      [synthCandidate({ splitRequired: true }), 'unsupported_requires_split'],
      [synthCandidate({ candidateOnly: false }), 'unavailable'],
      [synthCandidate({ integrated: true }), 'unavailable'],
      [synthCandidate({ coordinateSpace: 'normalized_0_1' }), 'unavailable'],
      [synthCandidate({ geometryType: 'centerline_walk' }), 'invalid_geometry'],
      [synthCandidate({ allStationsPaired: false, failedStations: 2 }), 'ineligible'],
      [synthCandidate({ containmentStatus: 'outside', outsideSampleCount: 3 }), 'ineligible'],
    ];
    for (const [candidate, expected] of cases) {
      const m = compileStraightSatinCandidateToLabCommands({ candidate });
      eq(m.status, expected, `status for ${expected}`);
      eq(m.commands.length, 0, 'no usable commands produced');
      eq(m.commandModelHash, null, 'no hash for a rejected candidate');
      ok(m.diagnostics.length > 0 && m.warnings.length > 0, 'diagnostics preserved');
      eq(m.safety.modelComplete, false, 'not complete');
    }
  });
  check('empty, non-finite and duplicated points are rejected with diagnostics', () => {
    for (const pts of [[], [[0, 0]], [[0, 0], [NaN, 1], [0, 1], [3, 1]], [[0, 0], [Infinity, 0], [0, 1], [3, 1]], [[0, 0], [0, 0], [0, 1], [3, 1]], [[0, 0], [3, 0], [0, 1]]]) {
      const m = compileStraightSatinCandidateToLabCommands({ candidate: synthCandidate({ pointsMm: pts }) });
      eq(m.status, 'invalid_geometry', `status for ${JSON.stringify(pts).slice(0, 40)}`);
      eq(m.commands.length, 0, 'no commands');
      ok(m.diagnostics.some((d) => d.status === 'invalid_geometry'), 'diagnostic recorded');
    }
    const m = compileStraightSatinCandidateToLabCommands({});
    eq(m.status, 'unavailable', 'missing candidate');
  });
  check('an injected forbidden op makes validation fail instead of being stripped', () => {
    const { candidate, model } = byCase('HATCH-A-WIDTHS-A1');
    const tampered = { ...model, commands: model.commands.map((c, i) => (i === 3 ? { ...c, op: 'jump' } : c)) };
    const v = validateLabSatinCommandModel(tampered, candidate);
    eq(v.valid, false, 'validation fails');
    ok(v.failedChecks.some((f) => /noForbiddenOps/.test(f)), 'forbidden op reported');
    eq(tampered.commands.length, model.commands.length, 'nothing was removed silently');
    const trimmed = { ...model, commands: model.commands.map((c, i) => (i === 0 ? { ...c, op: 'trim' } : c)) };
    eq(validateLabSatinCommandModel(trimmed, candidate).valid, false, 'trim also fails');
  });

  // ── 52-55. persisted fixtures ───────────────────────────────────────────
  check('the five persisted fixtures equal a fresh recompilation canonically', () => {
    for (const entry of fixture.regions) {
      const fresh = compileCase(entry).model;
      const stored = PERSISTED[entry.caseId];
      eq(stored.commandModelHash, fresh.commandModelHash, `${entry.caseId} hash`);
      eq(JSON.stringify(canonicalizeLabSatinCommands(stored)), JSON.stringify(canonicalizeLabSatinCommands(fresh)), `${entry.caseId} canonical equality`);
      eq(stored.commands.length, fresh.commands.length, `${entry.caseId} command count`);
      eq(stored.status, 'lab_command_model_complete', `${entry.caseId} status`);
    }
  });
  check('report rows match the persisted fixtures and declare the fixture digests', () => {
    for (const row of commandModelReport.cases) {
      const stored = PERSISTED[row.caseId];
      eq(row.regionId, stored.regionId, `${row.caseId} regionId`);
      eq(row.commandCount, stored.commands.length, `${row.caseId} commandCount`);
      eq(row.commandModelHash, stored.commandModelHash, `${row.caseId} hash`);
      eq(row.fixturePath, `fixtures/${row.caseId}-SATIN-LAB-COMMANDS.json`, `${row.caseId} fixturePath`);
      ok(/^[0-9A-F]{64}$/.test(row.fixtureSha256), `${row.caseId} fixtureSha256 format`);
      eq(row.status, 'lab_command_model_complete', `${row.caseId} status`);
      eq(row.validationValid, true, `${row.caseId} validation`);
      eq(row.crossColumnCommandCount, row.stationCount, `${row.caseId} cross`);
      eq(row.advanceDiagonalCommandCount, row.stationCount - 1, `${row.caseId} diagonal`);
    }
    eq(commandModelReport.finalState, 'STRAIGHT_SATIN_LAB_COMMAND_MODEL_READY', 'finalState');
    eq(commandModelReport.recommendation, 'PROCEED_TO_P1_F2_ISOLATED_PRODUCTIVE_COMMAND_ADAPTER', 'recommendation');
    eq(commandModelReport.recommendationImplemented, false, 'recommendation not implemented');
  });
  check('the declarative validator passes every real case', () => {
    for (const { validation } of compiled) {
      eq(validation.valid, true, `failed checks: ${validation.failedChecks.join(' | ')}`);
      ok(validation.checks.length >= 30, 'validator covers at least 30 criteria');
    }
  });

  // ── 56-58. manifest bookkeeping ─────────────────────────────────────────
  check('artifactManifest declares every command model artifact exactly once', () => {
    const expected = [
      'commandModel/README.md', 'commandModel/commandModelSchema.js', 'commandModel/sourceClosure.json',
      'commandModel/productiveCommandContractAudit.json', 'commandModel/productiveCommandContractAudit.md',
      'commandModel/buildLabSatinCandidate.js', 'commandModel/compileStraightSatinCandidateToLabCommands.js',
      'commandModel/validateLabSatinCommandModel.js', 'commandModel/measureLabSatinCommands.js',
      'commandModel/canonicalizeLabSatinCommands.js', 'commandModel/index.js',
      'commandModel/reports/commandModelReport.json', 'commandModel/reports/commandModelReport.md',
      ...CASE_IDS.map((id) => `commandModel/fixtures/${id}-SATIN-LAB-COMMANDS.json`),
      'src/tests/hatchLab/aWidthsSatinCommandModel.test.js',
    ];
    const paths = artifactManifest.files.map((f) => f.path);
    for (const p of expected) {
      eq(paths.filter((x) => x === p).length, 1, `${p} declared exactly once`);
      const f = artifactManifest.files.find((x) => x.path === p);
      ok(f.sizeBytes > 0 && f.persisted === true, `${p} persisted with size`);
      ok(/^[0-9A-F]{64}$/.test(f.sha256), `${p} sha256 format`);
    }
    eq(new Set(paths).size, paths.length, 'no duplicated path');
    eq(artifactManifest.files.length, artifactManifest.inventory.totalDeclaredFiles, 'totalDeclaredFiles matches entries');
  });
  check('filesModifiedThisTask matches the marked entries', () => {
    const marked = artifactManifest.files.filter((f) => f.modifiedThisTask).map((f) => f.path);
    const created = artifactManifest.files.filter((f) => f.createdThisTask).map((f) => f.path);
    eq(artifactManifest.inventory.filesModifiedThisTask, marked.length, `declared vs marked (${marked.join(', ')})`);
    eq(artifactManifest.inventory.filesCreatedThisTask, created.length, 'created count matches marks');
    eq(artifactManifest.inventory.filesDeletedThisTask, 0, 'nothing deleted');
  });
  check('hash verification distinguishes selfEntry from hash-verifiable files', () => {
    const hv = artifactManifest.hashVerification;
    ok(hv, 'hashVerification block present');
    eq(hv.declaredEntries, artifactManifest.files.length, 'declaredEntries');
    eq(hv.presentEntries, artifactManifest.files.length, 'presentEntries');
    eq(hv.selfExcludedEntries, 1, 'one self-excluded entry');
    eq(hv.selfExcludedPaths[0], 'artifactManifest.json', 'self-excluded path');
    eq(hv.hashVerifiableEntries, hv.declaredEntries - hv.selfExcludedEntries, 'verifiable = declared - self');
    eq(hv.hashVerifiedEntries, hv.hashVerifiableEntries, 'all verifiable entries verified');
    eq(hv.mismatches, 0, 'no mismatch');
    const self = artifactManifest.files.find((f) => f.selfEntry);
    eq(self.hashVerifiable, false, 'selfEntry not hash verifiable');
    ok(typeof self.exclusionReason === 'string' && self.exclusionReason.length > 0, 'exclusionReason present');
  });

  // ── 59-66. isolation ────────────────────────────────────────────────────
  check('the command model declares zero productive imports and no engine execution', () => {
    eq(COMMAND_MODEL_ISOLATION.productiveImports.length, 0, 'productiveImports');
    eq(COMMAND_MODEL_ISOLATION.enginesExecuted.length, 0, 'enginesExecuted');
    eq(COMMAND_MODEL_ISOLATION.producesMachineCommands, false, 'producesMachineCommands');
    eq(COMMAND_MODEL_ISOLATION.producesExportBytes, false, 'producesExportBytes');
    eq(COMMAND_MODEL_ISOLATION.mutatesRegions, false, 'mutatesRegions');
    eq(COMMAND_MODEL_ISOLATION.changesStitchType, false, 'changesStitchType');
    eq(contractAudit.modulesImportedByCommandModel.length, 0, 'audit declares no imports');
    eq(contractAudit.mode, 'read_only_static_inspection', 'audit mode');
  });
  check('runPipeline, buildFinalCommands, CE01, encoders and exports were not executed', () => {
    eq(contractAudit.runPipelineExecuted, false, 'runPipeline');
    eq(contractAudit.buildFinalCommandsExecuted, false, 'buildFinalCommands');
    eq(contractAudit.encodersExecuted, false, 'encoders');
    eq(commandModelReport.runPipelineExecuted, false, 'report runPipeline');
    eq(commandModelReport.buildFinalCommandsExecuted, false, 'report buildFinalCommands');
    eq(commandModelReport.ce01Executed, false, 'report CE01');
    eq(commandModelReport.encodersExecuted, false, 'report encoders');
    eq(commandModelReport.exportsPerformed, false, 'report exports');
    eq(sourceClosure.guarantees.ce01Executed, false, 'closure CE01');
    eq(sourceClosure.guarantees.exportsPerformed, false, 'closure exports');
    for (const { model } of compiled) {
      ok(!('bytes' in model) && !('blob' in model) && !('dst' in model), `${model.caseId} produced no file payload`);
    }
  });
  check('baseline, stitch_type and Engine V2 remain untouched', () => {
    eq(fixture.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', 'baselineId');
    eq(sourceClosure.guarantees.baselineModified, false, 'baselineModified');
    eq(sourceClosure.guarantees.engineV2Modified, false, 'engineV2Modified');
    eq(sourceClosure.guarantees.stitchTypeModified, false, 'stitchTypeModified');
    eq(sourceClosure.guarantees.productiveCodeModified, false, 'productiveCodeModified');
    eq(sourceClosure.guarantees.rawFixtureValuesModified, false, 'rawFixtureValuesModified');
    eq(artifactManifest.baselineModified, false, 'manifest baselineModified');
    eq(artifactManifest.engineV2Modified, false, 'manifest engineV2Modified');
    eq(artifactManifest.productiveCodeModified, false, 'manifest productiveCodeModified');
    for (const entry of fixture.regions) eq(entry.region.stitch_type, 'fill', `${entry.caseId} stitch_type`);
  });
  check('the productive contract audit classifies compatibility explicitly', () => {
    eq(contractAudit.futureCompatibility.classification, 'compatible_with_adapter', 'classification');
    ok(contractAudit.filesInspected.length >= 6, 'inspected files listed');
    ok(contractAudit.contractDifferences.length >= 4, 'differences listed');
    ok(contractAudit.risks.length >= 3, 'risks listed');
    ok(contractAudit.unverifiableFields.length >= 1, 'unverifiable fields listed');
    ok(contractAudit.futureCompatibility.notImplementedHere.includes('adapter'), 'adapter deferred');
  });

  const fails = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);
  return { name: 'aWidthsSatinCommandModel', pass: fails.length === 0, checks: results.length, fails };
}