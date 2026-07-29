/**
 * aWidthsHoleSemantics.test.js — P1.F0.2 audit and reconciliation of the
 * productive `holes` field for the A_WIDTHS SATIN_COLUMN foundation.
 *
 * Laboratory only: no productive module is imported, no engine is executed,
 * no raw fixture value is modified.
 */

import fixture from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/fixtures/A_WIDTHS_STRAIGHT_BARS.json';
import capabilityReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/reports/capabilityReport.json';
import artifactManifest from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/artifactManifest.json';
import trace from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/holeSemantics/holeFieldTrace.json';
import topologyAudit from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/holeSemantics/topologyAudit.json';
import reconciliationReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/holeSemantics/reconciliationReport.json';
import closure from '@/lib/hatchLab/baselines/A_WIDTHS/archiveClosure/BASE-ENGINE-A-WIDTHS-V1.archiveClosure.json';
import {
  measureSatinCandidate,
  auditRegionTopology,
  reconcileHoleSemantics,
  resolveOverallEligibility,
  HOLE_FIELD_PRODUCER,
  HOLE_SEMANTIC_STATUSES,
  HOLE_METADATA_STATUS_VALUES,
  OVERALL_ELIGIBILITY_VALUES,
  ISOLATION_MANIFEST,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/index.js';

const RAW_HOLES = {
  'HATCH-A-WIDTHS-A1': { regionId: 'r_zbgef31', holes: 1 },
  'HATCH-A-WIDTHS-A5': { regionId: 'r_sv7z5qe', holes: 2 },
  'HATCH-A-WIDTHS-A6': { regionId: 'r_ecj9hl4', holes: 2 },
  'HATCH-A-WIDTHS-A7': { regionId: 'r_c92bxh3', holes: 1 },
  'HATCH-A-WIDTHS-A8': { regionId: 'r_zr65703', holes: 1 },
};
const DESIGN = { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 80 };
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const ringOf = (x, y, w, h) => rect(x, y, w, h);

export function runAWidthsHoleSemanticsTests() {
  const results = [];
  const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const ok = (c, m) => { if (!c) throw new Error(m); };

  const measure = (entry, opts) => measureSatinCandidate({ caseId: entry.caseId, regionId: entry.regionId, region: entry.region, design: fixture.design }, opts);
  const live = fixture.regions.map((e) => measure(e));
  const byCase = (id) => live.find((r) => r.caseId === id);
  const synth = (points, extra = {}) => ({
    caseId: extra.caseId || 'SYNTH', regionId: 'synth', design: DESIGN,
    region: { id: 'synth', path_points: points, ...extra.region },
  });

  // ── 1-6. raw values are preserved verbatim ───────────────────────────────
  for (const [caseId, exp] of Object.entries(RAW_HOLES)) {
    check(`${caseId} keeps raw holes = ${exp.holes} untouched`, () => {
      const entry = fixture.regions.find((e) => e.caseId === caseId);
      ok(entry, 'fixture entry exists');
      eq(entry.regionId, exp.regionId, 'regionId');
      eq(entry.region.holes, exp.holes, 'raw holes in the fixture');
      const r = byCase(caseId);
      eq(r.declaredHoleCount, exp.holes, 'declared count reported');
      eq(r.holeSemantics.sourceDeclaredHoles, exp.holes, 'reconciliation preserves the raw value');
      eq(r.holeSemantics.rawValuePreserved, true, 'rawValuePreserved');
      eq(entry.region.holes, exp.holes, 'still untouched after measuring');
    });
  }
  check('no raw value is overwritten by the audit (deep snapshot equality)', () => {
    const before = JSON.stringify(fixture.regions.map((e) => ({ id: e.regionId, holes: e.region.holes, n: e.region.path_points.length })));
    fixture.regions.forEach((e) => { auditRegionTopology(e.region, fixture.design); reconcileHoleSemantics({ region: e.region, topology: auditRegionTopology(e.region, fixture.design) }); });
    eq(JSON.stringify(fixture.regions.map((e) => ({ id: e.regionId, holes: e.region.holes, n: e.region.path_points.length }))), before, 'fixture unchanged');
  });

  // ── 7. producer semantics carry file + function ──────────────────────────
  check('semantics name the producing file and function with a formula', () => {
    eq(HOLE_FIELD_PRODUCER.producerFile, 'src/lib/regionBuilder.js', 'producerFile');
    eq(HOLE_FIELD_PRODUCER.producerFunction, 'estimateHoles', 'producerFunction');
    eq(HOLE_FIELD_PRODUCER.stage, 'region_builder (pipeline stage 6 of PIPELINE_STAGES)', 'stage');
    eq(HOLE_FIELD_PRODUCER.representsInteriorHoles, false, 'representsInteriorHoles');
    eq(HOLE_FIELD_PRODUCER.meaning, 'nearby_small_sibling_region_count', 'meaning');
    eq(HOLE_FIELD_PRODUCER.computedOver, 'sibling_region_metadata', 'computedOver');
    eq(HOLE_FIELD_PRODUCER.holeGeometryPreserved, false, 'holeGeometryPreserved');
    ok(HOLE_FIELD_PRODUCER.formula.includes('0.12') && HOLE_FIELD_PRODUCER.formula.includes('0.15'), 'formula thresholds');
    ok(HOLE_FIELD_PRODUCER.consumers.length >= 5, 'consumers listed');
    eq(trace.producer.file, 'src/lib/regionBuilder.js', 'trace file');
    eq(trace.producer.firstFunctionCreatingHoles, 'estimateHoles', 'trace function');
    ok(trace.stagesInspected.filter((s) => s.producesHoles).length === 1, 'exactly one producing stage');
  });

  // ── 8-11. topology never derives from the scalar ─────────────────────────
  check('a scalar never creates an interior ring', () => {
    for (const value of [1, 2, 7, true]) {
      const t = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.3, 0.05), holes: value }, DESIGN);
      eq(t.interiorRingCount, 0, `holes=${value} interiorRingCount`);
      eq(t.topologyHoleCount, 0, `holes=${value} topologyHoleCount`);
      eq(t.holeGeometryAvailable, false, `holes=${value} holeGeometryAvailable`);
    }
    const t2 = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.3, 0.05), holeCount: 4, explicitHoleCount: 9 }, DESIGN);
    eq(t2.interiorRingCount, 0, 'holeCount/explicitHoleCount create no ring');
  });
  check('a single path_points array yields exactly one declared ring', () => {
    const t = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.3, 0.05), holes: 2 }, DESIGN);
    eq(t.exteriorRingCount, 1, 'exteriorRingCount');
    eq(t.pathRingCount, 1, 'pathRingCount');
    eq(t.boundaryComponentCount, 1, 'boundaryComponentCount');
  });
  check('interiorRingCount and topologyHoleCount are computed without reading the scalar', () => {
    const withScalar = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.3, 0.05), holes: 5 }, DESIGN);
    const without = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.3, 0.05) }, DESIGN);
    eq(withScalar.readsScalarHoleMetadata, false, 'readsScalarHoleMetadata');
    eq(withScalar.interiorRingCount, without.interiorRingCount, 'interiorRingCount identical');
    eq(withScalar.topologyHoleCount, without.topologyHoleCount, 'topologyHoleCount identical');
    eq(withScalar.scalarHoleFieldsIgnored[0].usedAsTopologyInput, false, 'scalar marked as not an input');
    for (const r of live) eq(r.topology.readsScalarHoleMetadata, false, `${r.caseId} scalar not used`);
  });

  // ── 12-13. real hole geometry is detected ───────────────────────────────
  check('an array of real ring geometry is detected as a hole', () => {
    const region = { id: 'x', path_points: rect(0.1, 0.1, 0.5, 0.3), holes: [ringOf(0.2, 0.15, 0.1, 0.1)] };
    const t = auditRegionTopology(region, DESIGN);
    eq(t.interiorRingCount, 1, 'interiorRingCount');
    eq(t.topologyHoleCount, 1, 'topologyHoleCount');
    eq(t.holeGeometryAvailable, true, 'holeGeometryAvailable');
    eq(t.boundaryComponentCount, 2, 'boundaryComponentCount');
    const rec = reconcileHoleSemantics({ region, topology: t });
    eq(rec.holeSemanticStatus, 'confirmed_real_holes', 'confirmed_real_holes');
    eq(rec.holeMetadataStatus, 'real_holes', 'holeMetadataStatus');
  });
  check('an object carrying real ring geometry is detected as a hole', () => {
    const region = { id: 'x', path_points: rect(0.1, 0.1, 0.5, 0.3), holeGeometry: { points: ringOf(0.2, 0.15, 0.1, 0.1) } };
    const t = auditRegionTopology(region, DESIGN);
    eq(t.interiorRingCount, 1, 'interiorRingCount');
    eq(t.holeGeometryAvailable, true, 'holeGeometryAvailable');
    const nested = auditRegionTopology({ id: 'x', path_points: rect(0.1, 0.1, 0.5, 0.3), interiorRings: [{ path_points: ringOf(0.2, 0.15, 0.08, 0.08) }] }, DESIGN);
    eq(nested.interiorRingCount, 1, 'nested object ring detected');
  });

  // ── 14-16. reconciliation policy ────────────────────────────────────────
  check('a numeric count whose semantics mean real holes, without geometry, is a metadata_conflict', () => {
    const region = { id: 'x', path_points: rect(0.1, 0.1, 0.4, 0.05), holes: 2 };
    const t = auditRegionTopology(region, DESIGN);
    const rec = reconcileHoleSemantics({ region, topology: t, producerSemantics: { ...HOLE_FIELD_PRODUCER, representsInteriorHoles: true, meaning: 'interior_hole_count' } });
    eq(rec.holeSemanticStatus, 'metadata_conflict', 'metadata_conflict');
    eq(rec.holeMetadataStatus, 'conflict', 'holeMetadataStatus');
    eq(rec.geometryEligibilityImpact, 'blocked_missing_hole_geometry', 'impact names the missing geometry');
    eq(rec.sourceDeclaredHoles, 2, 'raw value preserved');
    ok(rec.warnings.some((w) => /indispensable/.test(w)), 'warning states the geometry is indispensable');
  });
  check('a metric proven non-topological does not block geometryEligibility', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { region: { holes: 3 } }));
    eq(r.geometryEligibility, 'eligible', 'geometryEligibility');
    eq(r.holeMetadataStatus, 'clear', 'holeMetadataStatus');
    eq(r.overallEligibility, 'eligible', 'overallEligibility');
    ok(!r.eligibilityChecks.some((c) => /hole/i.test(c.name) && !c.satisfied), 'no unsatisfied hole criterion');
  });
  check('unknown semantics produce unresolved and never a silent pass', () => {
    const region = { id: 'x', path_points: rect(0.1, 0.1, 0.4, 0.05), holes: 1 };
    const rec = reconcileHoleSemantics({ region, topology: auditRegionTopology(region, DESIGN), producerSemantics: { meaningKnown: false } });
    eq(rec.holeSemanticStatus, 'unresolved', 'unresolved');
    eq(rec.holeMetadataStatus, 'unresolved', 'holeMetadataStatus');
    eq(resolveOverallEligibility('eligible', 'unresolved'), 'metadata_conflict', 'overall cannot be eligible');
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { region: { holes: 1 } }), { producerSemantics: { meaningKnown: false } });
    eq(r.geometryEligibility, 'eligible', 'geometry stays eligible');
    eq(r.overallEligibility, 'metadata_conflict', 'overall metadata_conflict');
    eq(r.status, 'blocked_by_hole_metadata', 'status blocked_by_hole_metadata');
    eq(r.candidateGeometryComplete, true, 'candidate geometry preserved');
  });

  // ── 17-19. the three eligibilities are separate ─────────────────────────
  check('geometryEligibility is kept separate from the metadata verdict', () => {
    ok(OVERALL_ELIGIBILITY_VALUES.includes('metadata_conflict'), 'overall vocabulary');
    ok(HOLE_METADATA_STATUS_VALUES.includes('conflict') && HOLE_METADATA_STATUS_VALUES.includes('clear'), 'metadata vocabulary');
    eq(HOLE_SEMANTIC_STATUSES.length, 5, 'five semantic statuses');
    const bent = measureSatinCandidate(synth([[0.1, 0.1], [0.5, 0.1], [0.5, 0.12], [0.1, 0.22]], { caseId: 'SYNTH-TAPER', region: { holes: 2 } }));
    eq(bent.geometryEligibility, 'partial', 'geometry partial on its own merits');
    eq(bent.holeMetadataStatus, 'clear', 'metadata clear');
    eq(bent.overallEligibility, 'partial', 'overall follows geometry');
  });
  check('overallEligibility is never eligible while a conflict is unresolved', () => {
    eq(resolveOverallEligibility('eligible', 'conflict'), 'metadata_conflict', 'conflict');
    eq(resolveOverallEligibility('eligible', 'unresolved'), 'metadata_conflict', 'unresolved');
    eq(resolveOverallEligibility('eligible', 'real_holes'), 'ineligible', 'real holes');
    eq(resolveOverallEligibility('eligible', 'unavailable'), 'unavailable', 'unavailable');
    eq(resolveOverallEligibility('partial', 'clear'), 'partial', 'clear keeps geometry verdict');
  });
  check('overallEligibility is never ineligible because of the scalar alone', () => {
    for (const r of live) {
      ok(r.declaredHoleCount > 0, `${r.caseId} declares a scalar`);
      eq(r.overallEligibility, 'eligible', `${r.caseId} overallEligibility`);
      eq(r.geometryEligibility, 'eligible', `${r.caseId} geometryEligibility`);
      eq(r.reasons.length, 0, `${r.caseId} no failing criterion: ${r.reasons.join(' | ')}`);
    }
  });

  // ── 20-23. geometry survives untouched ──────────────────────────────────
  check('the five cases keep candidateGeometryComplete, pairing, straightness and containment', () => {
    for (const r of live) {
      eq(r.candidateGeometryComplete, true, `${r.caseId} candidateGeometryComplete`);
      eq(r.geometryComplete, true, `${r.caseId} geometryComplete`);
      eq(r.allStationsPaired, true, `${r.caseId} allStationsPaired`);
      eq(r.failedStations, 0, `${r.caseId} failedStations`);
      eq(r.rails.stationSuccessRatio, 1, `${r.caseId} stationSuccessRatio`);
      eq(r.straightness.withinStraightnessPolicy, true, `${r.caseId} straightness`);
      eq(r.containment.containmentStatus, 'contained', `${r.caseId} containment`);
      eq(r.containment.outsideSampleCount, 0, `${r.caseId} outsideSampleCount`);
      eq(r.zigzag.metrics.splitRequired, false, `${r.caseId} splitRequired`);
    }
  });
  check('topology audit report matches a live recomputation for the five cases', () => {
    eq(topologyAudit.cases.length, 5, 'five audited cases');
    eq(topologyAudit.scalarMetadataUsedAsInput, false, 'scalar excluded');
    for (const r of live) {
      const row = topologyAudit.cases.find((c) => c.caseId === r.caseId);
      ok(row, `row for ${r.caseId}`);
      eq(row.exteriorRingCount, r.topology.exteriorRingCount, `${r.caseId} exteriorRingCount`);
      eq(row.interiorRingCount, r.topology.interiorRingCount, `${r.caseId} interiorRingCount`);
      eq(row.topologyHoleCount, r.topology.topologyHoleCount, `${r.caseId} topologyHoleCount`);
      eq(row.pathRingCount, r.topology.pathRingCount, `${r.caseId} pathRingCount`);
      eq(row.boundaryComponentCount, r.topology.boundaryComponentCount, `${r.caseId} boundaryComponentCount`);
      eq(row.simplePolygon, r.topology.simplePolygon, `${r.caseId} simplePolygon`);
      eq(row.selfIntersectionCount, r.topology.selfIntersectionCount, `${r.caseId} selfIntersectionCount`);
      eq(row.holeGeometryAvailable, r.topology.holeGeometryAvailable, `${r.caseId} holeGeometryAvailable`);
      eq(row.ringWinding, r.topology.ringWinding, `${r.caseId} ringWinding`);
      eq(row.scalarHoleFieldsIgnored[0].value, RAW_HOLES[r.caseId].holes, `${r.caseId} recorded scalar`);
      ok(Math.abs(row.absoluteAreaMm2 - r.topology.absoluteAreaMm2) < 1e-3, `${r.caseId} area`);
      ok(Math.abs(row.perimeterMm - r.topology.perimeterMm) < 1e-3, `${r.caseId} perimeter`);
    }
  });
  check('reconciliation report matches a live recomputation for the five cases', () => {
    eq(reconciliationReport.rows.length, 5, 'five rows');
    eq(reconciliationReport.finalState, 'HOLE_SEMANTICS_RESOLVED_NO_REAL_HOLES', 'final state');
    eq(reconciliationReport.recommendation, 'PROCEED_TO_P1_F1_STRAIGHT_SATIN_COMMAND_MODEL', 'recommendation');
    eq(reconciliationReport.recommendationImplemented, false, 'recommendation not implemented');
    eq(reconciliationReport.eligibilityModel.geometryEligibilityDependsOnScalarMetadata, false, 'geometry independent of the scalar');
    for (const r of live) {
      const row = reconciliationReport.rows.find((x) => x.caseId === r.caseId);
      ok(row, `row for ${r.caseId}`);
      eq(row.rawHoles, RAW_HOLES[r.caseId].holes, `${r.caseId} rawHoles`);
      eq(row.regionId, RAW_HOLES[r.caseId].regionId, `${r.caseId} regionId`);
      eq(row.holeSemanticStatus, r.holeSemantics.holeSemanticStatus, `${r.caseId} holeSemanticStatus`);
      eq(row.geometryEligibility, r.geometryEligibility, `${r.caseId} geometryEligibility`);
      eq(row.holeMetadataStatus, r.holeMetadataStatus, `${r.caseId} holeMetadataStatus`);
      eq(row.overallEligibility, r.overallEligibility, `${r.caseId} overallEligibility`);
      eq(row.candidateGeometryComplete, r.candidateGeometryComplete, `${r.caseId} candidateGeometryComplete`);
      eq(row.status, r.status, `${r.caseId} status`);
      eq(row.topologyHoleCount, r.topology.topologyHoleCount, `${r.caseId} topologyHoleCount`);
      eq(row.holeGeometryAvailable, r.topology.holeGeometryAvailable, `${r.caseId} holeGeometryAvailable`);
      eq(row.blocked, false, `${r.caseId} not blocked`);
      ok(row.nextAllowedStep.includes('P1.F1'), `${r.caseId} next allowed step`);
    }
  });

  // ── 24-26. artifacts ────────────────────────────────────────────────────
  check('the five preview SVGs are still referenced and unchanged in the manifest', () => {
    for (const id of ['A1', 'A5', 'A6', 'A7', 'A8']) {
      const path = `previews/HATCH-A-WIDTHS-${id}-SATIN-CANDIDATE.svg`;
      const entry = artifactManifest.files.find((f) => f.path === path);
      ok(entry, `${id} preview in the manifest`);
      ok(/^[0-9A-F]{64}$/.test(entry.sha256), `${id} preview sha256`);
      ok(entry.sizeBytes > 0 && entry.persisted === true, `${id} preview persisted`);
      const row = capabilityReport.cases.find((c) => c.caseId === `HATCH-A-WIDTHS-${id}`);
      eq(row.previewSvg, path, `${id} report reference`);
    }
  });
  check('artifactManifest declares the holeSemantics artifacts exactly', () => {
    const expected = [
      'holeSemantics/README.md', 'holeSemantics/producerSemantics.js', 'holeSemantics/auditRegionTopology.js',
      'holeSemantics/reconcileHoleSemantics.js', 'holeSemantics/holeFieldTrace.json', 'holeSemantics/holeFieldTrace.md',
      'holeSemantics/topologyAudit.json', 'holeSemantics/topologyAudit.md',
      'holeSemantics/reconciliationReport.json', 'holeSemantics/reconciliationReport.md',
    ];
    for (const p of expected) {
      const entry = artifactManifest.files.find((f) => f.path === p);
      ok(entry, `${p} declared`);
      ok(entry.sizeBytes > 0, `${p} sizeBytes`);
      ok(/^[0-9A-F]{64}$/.test(entry.sha256), `${p} sha256 format`);
      eq(entry.persisted, true, `${p} persisted`);
    }
    eq(artifactManifest.files.length, artifactManifest.inventory.totalDeclaredFiles, 'declared total matches the entries');
    const paths = artifactManifest.files.map((f) => f.path);
    eq(new Set(paths).size, paths.length, 'no duplicated path');
    ok(artifactManifest.files.some((f) => f.path === 'src/tests/hatchLab/aWidthsHoleSemantics.test.js'), 'new suite declared');
  });
  check('every manifest digest is a well-formed SHA-256 and the audit flags stay false', () => {
    for (const f of artifactManifest.files) ok(/^[0-9A-F]{64}$/.test(f.sha256), `${f.path} sha256`);
    eq(artifactManifest.baselineModified, false, 'baselineModified');
    eq(artifactManifest.productiveCodeModified, false, 'productiveCodeModified');
    eq(artifactManifest.engineV2Modified, false, 'engineV2Modified');
    eq(artifactManifest.runPipelineExecuted, false, 'runPipelineExecuted');
    eq(artifactManifest.buildFinalCommandsExecuted, false, 'buildFinalCommandsExecuted');
  });

  // ── 27-33. purity, determinism, isolation, baseline ─────────────────────
  check('topology audit and reconciliation never mutate their inputs', () => {
    const entry = fixture.regions[1];
    const before = JSON.stringify(entry);
    const t = auditRegionTopology(entry.region, fixture.design);
    const rec = reconcileHoleSemantics({ region: entry.region, topology: t });
    eq(JSON.stringify(entry), before, 'fixture entry unchanged');
    eq(entry.region.stitch_type, 'fill', 'stitch_type untouched');
    ok(!('stitch_type' in rec), 'reconciliation never returns a stitch type');
    ok(t.interiorRingsMm !== entry.region.path_points, 'output arrays are new');
  });
  check('audit and reconciliation are deterministic', () => {
    const entry = fixture.regions[2];
    const a = auditRegionTopology(entry.region, fixture.design);
    const b = auditRegionTopology(entry.region, fixture.design);
    eq(JSON.stringify(a), JSON.stringify(b), 'topology identical');
    const ra = reconcileHoleSemantics({ region: entry.region, topology: a });
    const rb = reconcileHoleSemantics({ region: entry.region, topology: b });
    eq(JSON.stringify(ra), JSON.stringify(rb), 'reconciliation identical');
  });
  check('zero productive imports and no engine execution for this audit', () => {
    eq(ISOLATION_MANIFEST.productiveImports.length, 0, 'productiveImports');
    eq(ISOLATION_MANIFEST.enginesExecuted.length, 0, 'enginesExecuted');
    eq(ISOLATION_MANIFEST.producesMachineCommands, false, 'producesMachineCommands');
    eq(ISOLATION_MANIFEST.mutatesRegions, false, 'mutatesRegions');
    eq(trace.method.includes('no pipeline executed'), true, 'trace declares no pipeline execution');
    eq(reconciliationReport.engineExecuted, false, 'report engineExecuted');
    eq(reconciliationReport.buildFinalCommandsExecuted, false, 'report buildFinalCommandsExecuted');
    for (const r of live) ok(!('commands' in r) && !('sequence' in r), `${r.caseId} produced no commands`);
  });
  check('baseline, Engine V2 and the raw capture remain untouched', () => {
    eq(fixture.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', 'baselineId');
    eq(fixture.rawCaptureSha256, closure.rawCaptureSha256, 'capture hash unchanged');
    eq(topologyAudit.engineExecuted, false, 'topology audit ran no engine');
    eq(topologyAudit.rawFixtureModified, false, 'raw fixture not modified');
    eq(reconciliationReport.baselineModified, false, 'baseline not modified');
    eq(reconciliationReport.productiveCodeModified, false, 'productive code not modified');
    eq(reconciliationReport.rawValuesModified, false, 'raw values not modified');
  });
  check('capability report carries the reconciled verdicts for the five cases', () => {
    for (const r of live) {
      const row = capabilityReport.cases.find((c) => c.caseId === r.caseId);
      eq(row.geometryEligibility, r.geometryEligibility, `${r.caseId} geometryEligibility`);
      eq(row.holeMetadataStatus, r.holeMetadataStatus, `${r.caseId} holeMetadataStatus`);
      eq(row.overallEligibility, r.overallEligibility, `${r.caseId} overallEligibility`);
      eq(row.holeSemanticStatus, r.holeSemantics.holeSemanticStatus, `${r.caseId} holeSemanticStatus`);
      eq(row.topologyHoleCount, r.topology.topologyHoleCount, `${r.caseId} topologyHoleCount`);
      eq(row.declaredHoleCount, RAW_HOLES[r.caseId].holes, `${r.caseId} declaredHoleCount preserved`);
    }
    ok(/not a topological hole count/i.test(capabilityReport.closureFinding.title), 'closure finding updated');
  });

  const fails = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);
  return { name: 'aWidthsHoleSemantics', pass: fails.length === 0, checks: results.length, fails };
}