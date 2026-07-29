/**
 * aWidthsSatinFoundation.test.js — P1.F0.1 SATIN_COLUMN foundation suite.
 * Tests ONLY the foundation (never re-runs the other lab suites, never runs the
 * engine). Synthetic fixtures are explicitly marked synthetic: true.
 */

import {
  measureSatinCandidate, normalizePolygonMm, computePrincipalAxis, hasSelfIntersection,
  analyzePolygonSimplicity, describeHoleDeclaration, measureCenterlineStraightness,
  checkZigzagContainment, isInsideOrOnPolygon,
  verifyStraightColumnFixture, hashPolygon, AUTHORIZED_REGIONS, BASELINE_ID, RAW_CAPTURE_SHA256,
  DEFAULT_OPTIONS, ISOLATION_MANIFEST, SYNTH_STRAIGHT_BAR, SYNTH_BENT_CONSTANT_WIDTH,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/index.js';
import fixture from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/fixtures/A_WIDTHS_STRAIGHT_BARS.json';
import capabilityReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/reports/capabilityReport.json';
import artifactManifest from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/artifactManifest.json';
import closure from '@/lib/hatchLab/baselines/A_WIDTHS/archiveClosure/BASE-ENGINE-A-WIDTHS-V1.archiveClosure.json';

const DESIGN_100 = { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 100 }; // isotropic synthetic space

// synthetic: true — laboratory-invented shapes, never real baseline data
const synth = (points, extra = {}) => ({
  synthetic: true,
  caseId: extra.caseId || 'SYNTH',
  regionId: extra.regionId || 'synth_1',
  region: {
    id: extra.regionId || 'synth_1', path_points: points,
    ...(extra.regionExtra || {}),
    holes: Object.prototype.hasOwnProperty.call(extra, 'holes') ? extra.holes : null,
    region_class: extra.region_class || null, type: 'fill', stitch_type: 'fill',
  },
  design: extra.design || DESIGN_100,
});
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const deepHasBadNumber = (v) => {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(deepHasBadNumber);
  if (v && typeof v === 'object') return Object.values(v).some(deepHasBadNumber);
  return false;
};
const measureCase = (entry, opts = {}) =>
  measureSatinCandidate({ caseId: entry.caseId, regionId: entry.regionId, region: entry.region, design: fixture.design }, opts);

const ORIGINAL_22 = [
  'README.md', 'foundationSchema.js', 'sourceProvenance.json', 'extractStraightColumnFixture.js',
  'renderSatinCandidateSvg.js', 'index.js',
  'geometry/normalizePolygonMm.js', 'geometry/polygonValidation.js', 'geometry/principalAxis.js',
  'geometry/boundaryIntersections.js', 'geometry/buildColumnRails.js', 'geometry/buildSatinZigzag.js',
  'geometry/measureSatinCandidate.js', 'eligibility/evaluateStraightColumnEligibility.js',
  'fixtures/A_WIDTHS_STRAIGHT_BARS.json', 'reports/capabilityReport.json', 'reports/capabilityReport.md',
  'previews/HATCH-A-WIDTHS-A1-SATIN-CANDIDATE.svg', 'previews/HATCH-A-WIDTHS-A5-SATIN-CANDIDATE.svg',
  'previews/HATCH-A-WIDTHS-A6-SATIN-CANDIDATE.svg', 'previews/HATCH-A-WIDTHS-A7-SATIN-CANDIDATE.svg',
  'previews/HATCH-A-WIDTHS-A8-SATIN-CANDIDATE.svg',
];

export function runAWidthsSatinFoundationTests() {
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.message }); }
  };
  const ok = (v, msg) => { if (!v) throw new Error(msg); };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
  const near = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg}: |${a} - ${b}| > ${tol}`); };

  // ── provenance and hashes ────────────────────────────────────────────────
  check('fixture verifies against baseline provenance and polygon hashes', () => {
    const v = verifyStraightColumnFixture(fixture);
    ok(v.valid, v.reasons.join('; '));
  });
  check('fixture is bound to the sealed capture, engine not re-executed', () => {
    eq(fixture.baselineId, BASELINE_ID, 'baselineId');
    eq(fixture.rawCaptureSha256, RAW_CAPTURE_SHA256, 'rawCaptureSha256');
    eq(fixture.rawCaptureSha256, closure.rawCaptureSha256, 'must match archive closure hash (baseline intact)');
    eq(fixture.provenance.engineExecuted, false, 'engineExecuted');
    eq(fixture.synthetic, false, 'real fixture must not be synthetic');
  });
  check('exactly the five authorized regions with correct identity', () => {
    eq(fixture.regions.length, 5, 'region count');
    for (const auth of AUTHORIZED_REGIONS) {
      const e = fixture.regions.find((r) => r.caseId === auth.caseId);
      ok(e, `missing ${auth.caseId}`);
      eq(e.regionId, auth.regionId, `${auth.caseId} regionId`);
      eq(e.sourceIndex, auth.sourceIndex, `${auth.caseId} sourceIndex`);
      eq(hashPolygon(e.region.path_points), e.polygonHash, `${auth.caseId} polygonHash reproduces`);
    }
  });

  // ── persistence inventory (checks 1–4 of the closure brief) ──────────────
  check('artifactManifest declares the 22 original artifacts as persisted', () => {
    const byPath = new Map(artifactManifest.files.map((f) => [f.path, f]));
    for (const p of ORIGINAL_22) {
      const f = byPath.get(p);
      ok(f, `manifest is missing ${p}`);
      eq(f.persisted, true, `${p} persisted`);
      ok(f.sizeBytes > 0, `${p} sizeBytes`);
      ok(f.readable, `${p} readable`);
    }
    eq(ORIGINAL_22.length, 22, 'original artifact count');
  });
  check('artifactManifest is internally valid: unique paths, SHA-256 format, exact count', () => {
    ok(Array.isArray(artifactManifest.files) && artifactManifest.files.length > 0, 'files array');
    eq(artifactManifest.files.length, artifactManifest.inventory.totalDeclaredFiles, 'declared total matches list length');
    const paths = artifactManifest.files.map((f) => f.path);
    eq(new Set(paths).size, paths.length, 'paths are unique');
    for (const f of artifactManifest.files) {
      ok(/^[0-9A-F]{64}$/.test(f.sha256), `${f.path} sha256 format`);
      ok(typeof f.type === 'string' && f.type.length > 0, `${f.path} type`);
    }
    eq(artifactManifest.candidateOnly, true, 'candidateOnly');
    eq(artifactManifest.integrated, false, 'integrated');
  });
  check('fixture and report hashes are declared in the manifest', () => {
    for (const p of ['fixtures/A_WIDTHS_STRAIGHT_BARS.json', 'reports/capabilityReport.json', 'reports/capabilityReport.md']) {
      const f = artifactManifest.files.find((x) => x.path === p);
      ok(f && /^[0-9A-F]{64}$/.test(f.sha256), `${p} hash declared`);
      ok(f.jsonValid !== false, `${p} json validity`);
    }
  });
  check('the five previews are declared persisted, non-empty and SVG-valid', () => {
    for (const c of ['A1', 'A5', 'A6', 'A7', 'A8']) {
      const p = `previews/HATCH-A-WIDTHS-${c}-SATIN-CANDIDATE.svg`;
      const f = artifactManifest.files.find((x) => x.path === p);
      ok(f, `manifest entry for ${p}`);
      eq(f.svgValid, true, `${p} svgValid`);
      ok(f.sizeBytes > 500, `${p} non-empty`);
    }
  });

  // ── coordinate conversion ────────────────────────────────────────────────
  check('normalized→mm conversion is explicit and exact (100×80 declared)', () => {
    const n = normalizePolygonMm([[0.5, 0.5], [0.6, 0.5], [0.6, 0.75]], { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 80 });
    ok(n.ok, 'conversion must succeed');
    eq(n.pointsMm[0][0], 50, 'xMm = x*100'); eq(n.pointsMm[0][1], 40, 'yMm = y*80');
    eq(n.pointsMm[2][1], 60, 'yMm uses heightMm 80');
    ok(n.originalPoints[0][0] === 0.5, 'original points preserved');
  });
  check('undeclared coordinate space is refused, never deduced from ranges', () => {
    const n = normalizePolygonMm([[0.1, 0.1]], { widthMm: 100, heightMm: 80 });
    eq(n.ok, false, 'must refuse');
  });

  // ── five real cases: measured geometry ───────────────────────────────────
  const live = fixture.regions.map((e) => measureCase(e));
  const byCase = (id) => live.find((r) => r.caseId === id);

  check('five real cases produce complete, contained candidate geometry', () => {
    for (const r of live) {
      eq(r.geometryComplete, true, `${r.caseId} geometryComplete`);
      eq(r.containment.containmentStatus, 'contained', `${r.caseId} containment`);
      eq(r.zigzag.candidateOnly, true, 'candidateOnly');
      eq(r.zigzag.integrated, false, 'integrated');
      eq(r.zigzag.technique, 'satin_candidate', 'technique');
      eq(r.zigzag.geometryType, 'paired_boundary_zigzag', 'geometryType');
    }
  });
  check('five real cases are ineligible because they declare numeric holes', () => {
    for (const r of live) {
      eq(r.holeStatus, 'present', `${r.caseId} holeStatus`);
      eq(r.holeSourceField, 'holes', `${r.caseId} holeSourceField`);
      ok(r.declaredHoleCount > 0, `${r.caseId} declaredHoleCount`);
      eq(r.eligibility, 'ineligible', `${r.caseId} eligibility`);
      eq(r.status, 'ineligible', `${r.caseId} status`);
      ok(r.reasons.some((x) => /hole/i.test(x)), `${r.caseId} reason names holes`);
    }
  });
  for (const id of ['A1', 'A5', 'A6', 'A7', 'A8']) {
    check(`allStationsPaired in ${id} (every station exactly two intersections)`, () => {
      const r = byCase(`HATCH-A-WIDTHS-${id}`);
      eq(r.allStationsPaired, true, 'allStationsPaired');
      eq(r.rails.stationSuccessRatio, 1, 'stationSuccessRatio');
      ok(r.rails.stations.every((s) => s.intersectionCount === 2), 'every station has exactly two intersections');
      eq(r.stationGapCount, 0, 'stationGapCount');
      eq(r.maximumStationGapMm, 0, 'maximumStationGapMm');
    });
  }
  check('failedStations is zero for the five real cases', () => {
    for (const r of live) {
      eq(r.failedStations, 0, `${r.caseId} failedStations`);
      eq(r.failedStationIndices.length, 0, `${r.caseId} failedStationIndices`);
    }
  });
  check('no NaN/Infinity anywhere in the five measured results', () => {
    for (const r of live) ok(!deepHasBadNumber(r), `${r.caseId} contains a non-finite number`);
  });
  check('every station has both rails, failed stations invent nothing', () => {
    for (const r of live) {
      for (const st of r.rails.stations) {
        if (st.leftRailPoint) {
          eq(st.intersectionCount, 2, `${r.caseId} station intersections`);
          ok(st.rightRailPoint && st.widthMm > 0, `${r.caseId} station width`);
        } else {
          ok(st.rightRailPoint === null, `${r.caseId} failed station must not invent a rail`);
        }
      }
    }
  });
  check('zigzag alternates the two rails: L0→R0→L1→R1…', () => {
    for (const r of live) {
      const pts = r.zigzag.pointsMm;
      ok(pts.length >= 4, `${r.caseId} zigzag length`);
      for (let i = 0; i < pts.length; i++) {
        const rail = i % 2 === 0 ? r.rails.leftRail : r.rails.rightRail;
        const p = rail[Math.floor(i / 2)];
        ok(p && p[0] === pts[i][0] && p[1] === pts[i][1], `${r.caseId} point ${i} must lie on the ${i % 2 === 0 ? 'left' : 'right'} rail`);
      }
    }
  });
  check('stitches really cross the column: crossings ⟂ major axis, length = station width', () => {
    for (const r of live) {
      const used = r.rails.stations.filter((s) => s.leftRailPoint);
      const pts = r.zigzag.pointsMm;
      for (let k = 0; k < Math.min(used.length, 5); k++) {
        const dx = pts[2 * k + 1][0] - pts[2 * k][0];
        const dy = pts[2 * k + 1][1] - pts[2 * k][1];
        near(Math.hypot(dx, dy), used[k].widthMm, 1e-9, `${r.caseId} crossing length = width`);
        const dot = dx * r.axis.majorAxis[0] + dy * r.axis.majorAxis[1];
        near(dot, 0, 1e-6, `${r.caseId} crossing must be perpendicular to the axis`);
      }
    }
  });
  check('trajectory is not the polygon boundary, a centerline, or a scanline fill', () => {
    for (const r of live) {
      ok(r.zigzag.pointsMm.length !== r.pointsMm.length, `${r.caseId} zigzag is not the boundary array`);
      ok(r.zigzag.metrics.averageStitchLengthMm > r.rails.meanWidthMm * 0.45, `${r.caseId} not a centerline`);
      const p = r.zigzag.pointsMm;
      const s0 = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
      const s1 = [p[2][0] - p[1][0], p[2][1] - p[1][1]];
      const cross = s0[0] * s1[1] - s0[1] * s1[0];
      const parallel = Math.abs(cross) < 1e-12 && s0[0] * s1[0] + s0[1] * s1[1] > 0;
      ok(!parallel, `${r.caseId} consecutive segments must not continue like a scanline`);
    }
  });
  check('spacing is explicit configuration and echoed in the result', () => {
    for (const r of live) { eq(r.options.spacingMm, 0.4, 'spacingMm'); eq(r.zigzag.spacingMm, 0.4, 'zigzag spacingMm'); }
    eq(DEFAULT_OPTIONS.spacingMm, 0.4, 'schema default');
    eq(DEFAULT_OPTIONS.requireAllStationsPaired, true, 'requireAllStationsPaired default');
  });
  check('invalid spacing is rejected as unavailable with a concrete reason', () => {
    for (const bad of [0, -1, NaN]) {
      const r = measureCase(fixture.regions[0], { spacingMm: bad });
      eq(r.status, 'unavailable', `spacing ${bad}`);
      ok(r.reasons.some((x) => /spacingMm/.test(x)), 'reason names spacingMm');
    }
  });
  check('stitch lengths measured and under the 12.1 mm limit for all five cases', () => {
    for (const r of live) {
      const m = r.zigzag.metrics;
      ok(m.minimumStitchLengthMm > 0 && m.averageStitchLengthMm > 0, `${r.caseId} lengths`);
      ok(m.maximumStitchLengthMm <= 12.1, `${r.caseId} max length`);
      eq(m.splitRequired, false, `${r.caseId} splitRequired`);
      eq(m.maxStitchLengthLimitMm, 12.1, 'limit echoed');
      eq(m.stitchCount, r.zigzag.pointsMm.length - 1, `${r.caseId} stitchCount`);
    }
  });

  // ── strict station policy ────────────────────────────────────────────────
  check('a failed station prevents eligible even with a valid hole-free polygon', () => {
    const u = [[0, 0], [0.12, 0], [0.12, 0.2], [0.08, 0.2], [0.08, 0.04], [0.04, 0.04], [0.04, 0.2], [0, 0.2]]
      .map(([x, y]) => [x + 0.2, y + 0.2]);
    const r = measureSatinCandidate(synth(u, { caseId: 'SYNTH-U' }));
    ok(r.failedStations > 0, 'failed stations recorded');
    eq(r.allStationsPaired, false, 'allStationsPaired false');
    ok(r.eligibility !== 'eligible', 'not eligible');
    ok(r.rails.stations.filter((s) => s.intersectionCount !== 2).every((s) => s.leftRailPoint === null), 'no rail invented');
  });
  check('a failed station prevents candidate_geometry_complete and is not hidden by split', () => {
    const u = [[0, 0], [0.12, 0], [0.12, 0.2], [0.08, 0.2], [0.08, 0.04], [0.04, 0.04], [0.04, 0.2], [0, 0.2]]
      .map(([x, y]) => [x * 2.4 + 0.1, y * 2.4 + 0.1]);
    const r = measureSatinCandidate(synth(u, { caseId: 'SYNTH-U-WIDE' }));
    ok(r.failedStations > 0, 'failed stations');
    eq(r.geometryComplete, false, 'geometryComplete false');
    ok(r.status !== 'candidate_geometry_complete', 'status not complete');
    ok(r.status !== 'unsupported_requires_split', 'split must not mask the pairing failure');
  });
  check('a straight hole-free synthetic bar is eligible with all stations paired', () => {
    const r = measureSatinCandidate(SYNTH_STRAIGHT_BAR);
    eq(r.eligibility, 'eligible', 'eligibility');
    eq(r.status, 'candidate_geometry_complete', 'status');
    eq(r.allStationsPaired, true, 'allStationsPaired');
    eq(r.geometryComplete, true, 'geometryComplete');
  });

  // ── hole representation policy ───────────────────────────────────────────
  check('a numeric hole count is rejected as a hole declaration', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { holes: 2 }));
    eq(r.holeStatus, 'present', 'holeStatus');
    eq(r.declaredHoleCount, 2, 'declaredHoleCount');
    eq(r.eligibility, 'ineligible', 'eligibility');
  });
  check('holeCount / hole_count / explicitHoleCount and boolean flags are honoured', () => {
    const hc = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { regionExtra: { holeCount: 3 } }));
    eq(hc.holeSourceField, 'holeCount', 'holeCount detected');
    eq(hc.declaredHoleCount, 3, 'count from holeCount');
    eq(hc.eligibility, 'ineligible', 'holeCount ineligible');
    eq(describeHoleDeclaration({ hole_count: 1 }).holeStatus, 'present', 'hole_count');
    eq(describeHoleDeclaration({ explicitHoleCount: 5 }).declaredHoleCount, 5, 'explicitHoleCount');
    eq(describeHoleDeclaration({ holes: true }).declaredHoleCount, null, 'boolean flag must not invent a count');
    eq(describeHoleDeclaration({ holes: { a: [1] } }).holeStatus, 'present', 'non-empty object');
  });
  check('empty array, zero, false and null remain absence of holes', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { holes: [] }));
    eq(r.holeStatus, 'absent', 'empty array');
    eq(r.eligibility, 'eligible', 'still eligible');
    eq(describeHoleDeclaration({ holes: 0 }).holeStatus, 'absent', 'zero');
    eq(describeHoleDeclaration({ holes: false }).holeStatus, 'absent', 'false');
    eq(describeHoleDeclaration({ holes: null }).holeStatus, 'absent', 'null');
    eq(describeHoleDeclaration({}).holeStatus, 'absent', 'no field');
  });

  // ── robust polygon simplicity ────────────────────────────────────────────
  check('bowtie self-intersection is detected and refused', () => {
    const bowtie = [[0.1, 0.1], [0.38, 0.32], [0.3, 0.1], [0.1, 0.3]];
    const mm = normalizePolygonMm(bowtie, DESIGN_100).pointsMm;
    ok(hasSelfIntersection(mm), 'bowtie detected');
    eq(analyzePolygonSimplicity(mm).defects.some((d) => d.kind === 'strictCrossing'), true, 'strictCrossing kind');
    const r = measureSatinCandidate(synth(bowtie));
    eq(r.eligibility, 'ineligible', 'eligibility');
    eq(r.polygonSimple, false, 'polygonSimple false');
  });
  check('collinear overlap between non-adjacent edges is detected', () => {
    // edges (40,20)→(10,20) and (0,20)→(25,20) are non-adjacent, collinear and overlap on x∈[10,25]
    const pts = [[0, 0], [40, 0], [40, 20], [10, 20], [0, 20], [25, 20]];
    const a = analyzePolygonSimplicity(pts, { geometryEpsilonMm: 1e-9 });
    eq(a.simple, false, 'not simple');
    ok(a.defects.some((d) => d.kind === 'collinearOverlap'), `collinear overlap kind, got ${JSON.stringify(a.defects.map((d) => d.kind))}`);
  });
  check('a vertex touching a non-adjacent edge is detected', () => {
    const pts = [[0, 0], [40, 0], [40, 20], [20, 0], [0, 20]];
    const a = analyzePolygonSimplicity(pts, { geometryEpsilonMm: 1e-9 });
    eq(a.simple, false, 'not simple');
    ok(a.defects.some((d) => /vertexOnNonAdjacentEdge|nonAdjacentEdgeContact|strictCrossing/.test(d.kind)), 'vertex-on-edge kind');
  });
  check('a repeated edge and a zero-length edge are detected', () => {
    const repeated = [[0, 0], [20, 0], [0, 0], [20, 0]];
    const ra = analyzePolygonSimplicity(repeated);
    ok(ra.defects.some((d) => d.kind === 'repeatedEdge'), 'repeatedEdge');
    const zero = [[0, 0], [0, 0], [20, 0], [20, 10]];
    ok(analyzePolygonSimplicity(zero).defects.some((d) => d.kind === 'zeroLengthEdge'), 'zeroLengthEdge');
  });
  check('a valid polygon with shared adjacent vertices stays simple', () => {
    const mm = normalizePolygonMm(rect(0.1, 0.1, 0.4, 0.05), DESIGN_100).pointsMm;
    const a = analyzePolygonSimplicity(mm);
    eq(a.simple, true, `simple, defects: ${JSON.stringify(a.defects)}`);
    eq(hasSelfIntersection(mm), false, 'no self-intersection');
    eq(a.epsilonMm, DEFAULT_OPTIONS.geometryEpsilonMm, 'explicit epsilon echoed');
  });

  // ── straightness ─────────────────────────────────────────────────────────
  check('a bent constant-width bar is never eligible: refused by straightness', () => {
    const r = measureSatinCandidate(SYNTH_BENT_CONSTANT_WIDTH);
    ok(r.eligibility === 'partial' || r.eligibility === 'ineligible', `eligibility was ${r.eligibility}`);
    ok(r.straightness.centerlineMaximumDeviationMm > DEFAULT_OPTIONS.maximumCenterlineDeviationMm, 'deviation above the limit');
    eq(r.straightness.withinStraightnessPolicy, false, 'straightness policy not met');
    ok(r.reasons.some((x) => /centerlineStraight/.test(x)), 'reason names centerlineStraight');
    ok(r.rails.successfulStations > 10, 'many stations still paired');
  });
  check('centerlineMaximumDeviationMm is computed for the five real cases and within policy', () => {
    for (const r of live) {
      ok(Number.isFinite(r.straightness.centerlineMaximumDeviationMm), `${r.caseId} devMax finite`);
      ok(r.straightness.centerlineMaximumDeviationMm <= DEFAULT_OPTIONS.maximumCenterlineDeviationMm, `${r.caseId} devMax within policy`);
      eq(r.straightness.centerlinePointCount, r.rails.successfulStations, `${r.caseId} centerlinePointCount`);
      eq(r.straightness.withinStraightnessPolicy, true, `${r.caseId} straightness policy`);
    }
  });
  check('centerlineRmsDeviationMm, ratio and axis delta are computed and bounded', () => {
    for (const r of live) {
      const s = r.straightness;
      ok(Number.isFinite(s.centerlineRmsDeviationMm) && s.centerlineRmsDeviationMm >= 0, `${r.caseId} rms`);
      ok(s.centerlineRmsDeviationMm <= s.centerlineMaximumDeviationMm + 1e-12, `${r.caseId} rms ≤ max`);
      ok(s.centerlineDeviationRatio <= DEFAULT_OPTIONS.maximumCenterlineDeviationRatio, `${r.caseId} ratio`);
      ok(s.principalAxisVsCenterlineAngleDeltaDeg <= DEFAULT_OPTIONS.maximumCenterlineAngleDeltaDeg, `${r.caseId} axis delta`);
      ok(Number.isFinite(s.centerlineStartToEndAngleDeg), `${r.caseId} start-to-end angle`);
    }
  });
  check('straightness of a perfectly straight synthetic centerline is exactly zero', () => {
    const pts = [[0, 0], [0, 5], [0, 10], [0, 15]];
    const s = measureCenterlineStraightness(pts, { majorAxis: [0, 1] }, DEFAULT_OPTIONS);
    near(s.centerlineMaximumDeviationMm, 0, 1e-12, 'devMax');
    near(s.centerlineRmsDeviationMm, 0, 1e-12, 'rms');
    eq(s.withinStraightnessPolicy, true, 'within policy');
  });

  // ── zigzag containment ───────────────────────────────────────────────────
  for (const id of ['A1', 'A5', 'A6', 'A7', 'A8']) {
    check(`all zigzag segments of ${id} stay inside the polygon`, () => {
      const r = byCase(`HATCH-A-WIDTHS-${id}`);
      eq(r.containment.outsideSampleCount, 0, 'outsideSampleCount');
      eq(r.containment.outsideSegmentIndices.length, 0, 'outsideSegmentIndices');
      eq(r.containment.segmentsChecked, r.zigzag.metrics.stitchCount, 'segmentsChecked');
      eq(r.containment.samplesChecked, r.containment.segmentsChecked * 5, '5 samples per segment');
      eq(r.containment.containmentStatus, 'contained', 'containmentStatus');
    });
  }
  check('a trajectory leaving the polygon is detected and cannot be eligible', () => {
    const poly = rect(0, 0, 40, 10);
    const escaping = [[5, 5], [80, 5], [10, 5]];
    const c = checkZigzagContainment(escaping, poly, DEFAULT_OPTIONS);
    eq(c.containmentStatus, 'escapes', 'status');
    ok(c.outsideSampleCount > 0, 'outside samples counted');
    ok(c.outsideSegmentIndices.length > 0, 'outside segments indexed');
    eq(isInsideOrOnPolygon([80, 5], poly, 1e-4), false, 'point outside');
    eq(isInsideOrOnPolygon([0, 5], poly, 1e-4), true, 'boundary point counts as inside');
  });

  // ── invariances ──────────────────────────────────────────────────────────
  const a5 = fixture.regions.find((r) => r.caseId === 'HATCH-A-WIDTHS-A5');
  const a5Base = measureCase(a5);
  check('start-point rotation preserves axis, rails and the geometric sequence', () => {
    const pts = a5.region.path_points;
    const rotated = [...pts.slice(57), ...pts.slice(0, 57)];
    const r = measureSatinCandidate({ ...a5, region: { ...a5.region, path_points: rotated }, design: fixture.design });
    near(r.axis.axisAngleDeg, a5Base.axis.axisAngleDeg, 1e-6, 'angle');
    near(r.axis.centroidMm[0], a5Base.axis.centroidMm[0], 1e-9, 'centroid x');
    near(r.rails.meanWidthMm, a5Base.rails.meanWidthMm, 1e-6, 'mean width');
    eq(r.rails.successfulStations, a5Base.rails.successfulStations, 'stations');
    eq(r.zigzag.pointsMm.length, a5Base.zigzag.pointsMm.length, 'zigzag length');
    for (let i = 0; i < r.zigzag.pointsMm.length; i++) {
      near(r.zigzag.pointsMm[i][0], a5Base.zigzag.pointsMm[i][0], 1e-6, `point ${i} x`);
      near(r.zigzag.pointsMm[i][1], a5Base.zigzag.pointsMm[i][1], 1e-6, `point ${i} y`);
    }
  });
  check('winding reversal preserves width, canonical rails and station pairing', () => {
    const reversed = [...a5.region.path_points].reverse();
    const r = measureSatinCandidate({ ...a5, region: { ...a5.region, path_points: reversed }, design: fixture.design });
    near(r.axis.axisAngleDeg, a5Base.axis.axisAngleDeg, 1e-6, 'angle');
    near(r.rails.meanWidthMm, a5Base.rails.meanWidthMm, 1e-6, 'mean width');
    eq(r.allStationsPaired, true, 'all stations still paired');
    eq(r.rails.leftRail.length, a5Base.rails.leftRail.length, 'left rail length');
    for (let i = 0; i < r.rails.leftRail.length; i++) {
      near(r.rails.leftRail[i][0], a5Base.rails.leftRail[i][0], 1e-6, `left rail ${i} x`);
      near(r.rails.leftRail[i][1], a5Base.rails.leftRail[i][1], 1e-6, `left rail ${i} y`);
      near(r.rails.rightRail[i][0], a5Base.rails.rightRail[i][0], 1e-6, `right rail ${i} x`);
    }
  });
  check('translation preserves mean width, stitch lengths and the axis angle', () => {
    const base = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.04)));
    const moved = measureSatinCandidate(synth(rect(0.3, 0.2, 0.4, 0.04)));
    near(moved.axis.axisAngleDeg, base.axis.axisAngleDeg, 1e-9, 'angle unchanged');
    near(moved.axis.centroidMm[0] - base.axis.centroidMm[0], 20, 1e-9, 'centroid shifted +20mm x');
    near(moved.rails.meanWidthMm, base.rails.meanWidthMm, 1e-9, 'mean width');
    eq(moved.zigzag.metrics.stitchCount, base.zigzag.metrics.stitchCount, 'stitchCount');
    near(moved.zigzag.metrics.averageStitchLengthMm, base.zigzag.metrics.averageStitchLengthMm, 1e-9, 'average stitch length');
    near(moved.zigzag.metrics.maximumStitchLengthMm, base.zigzag.metrics.maximumStitchLengthMm, 1e-9, 'maximum stitch length');
  });
  check('rotation preserves width and stitch count, and rotates the axis', () => {
    const deg = 30, rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const basePts = rect(-0.2, -0.02, 0.4, 0.04).map(([x, y]) => [x + 0.5, y + 0.5]);
    const rotPts = rect(-0.2, -0.02, 0.4, 0.04).map(([x, y]) => [x * c - y * s + 0.5, x * s + y * c + 0.5]);
    const base = measureSatinCandidate(synth(basePts, { caseId: 'SYNTH-ROT-0' }));
    const rot = measureSatinCandidate(synth(rotPts, { caseId: 'SYNTH-ROT-30' }));
    near(computePrincipalAxis(normalizePolygonMm(basePts, DESIGN_100).pointsMm).axisAngleDeg, 0, 1e-6, 'base horizontal');
    near(rot.axis.axisAngleDeg, deg, 1e-6, 'rotated by 30°');
    near(rot.rails.meanWidthMm, base.rails.meanWidthMm, 1e-6, 'mean width preserved');
    eq(rot.zigzag.metrics.stitchCount, base.zigzag.metrics.stitchCount, 'stitchCount preserved');
    near(rot.rails.minimumWidthMm, base.rails.minimumWidthMm, 1e-6, 'min width preserved');
  });
  check('horizontal bar → axis 0°, vertical bar → axis 90°, both eligible', () => {
    const h = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.04), { caseId: 'SYNTH-H' }));
    const v = measureSatinCandidate(synth(rect(0.1, 0.1, 0.04, 0.4), { caseId: 'SYNTH-V' }));
    near(h.axis.axisAngleDeg, 0, 1e-6, 'horizontal');
    near(v.axis.axisAngleDeg, 90, 1e-6, 'vertical');
    eq(h.eligibility, 'eligible', 'horizontal eligible');
    eq(v.eligibility, 'eligible', 'vertical eligible');
  });

  // ── other incompatible synthetic shapes ─────────────────────────────────
  check('too-wide synthetic bar: splitRequired without autoSplit', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.2), { caseId: 'SYNTH-WIDE' }));
    eq(r.zigzag.metrics.splitRequired, true, 'splitRequired');
    eq(r.status, 'unsupported_requires_split', 'status');
    ok(r.zigzag.metrics.maximumStitchLengthMm > 12.1, 'stitch exceeds limit');
    near(r.zigzag.metrics.maximumStitchLengthMm, 20, 0.5, 'crossing kept whole');
    eq(r.zigzag.pointsMm.length, r.rails.successfulStations * 2, 'no extra points inserted');
  });
  check('strongly variable width (taper) is partial via widthVariationRatio', () => {
    const taper = [[0.1, 0.1], [0.5, 0.1], [0.5, 0.12], [0.1, 0.22]];
    const r = measureSatinCandidate(synth(taper, { caseId: 'SYNTH-TAPER' }));
    ok(r.rails.widthVariationRatio > 0.35, 'variation above threshold');
    eq(r.eligibility, 'partial', 'eligibility');
    ok(r.reasons.some((x) => /widthVariation/.test(x)), 'reason names widthVariation');
  });
  check('consecutive duplicates are removed and recorded, never silent', () => {
    const dup = [[0.1, 0.1], [0.1, 0.1], [0.5, 0.1], [0.5, 0.14], [0.1, 0.14], [0.1, 0.1]];
    const r = measureSatinCandidate(synth(dup));
    ok(r.warnings.some((w) => /duplicate/.test(w)), 'duplicate removal recorded');
    eq(r.normalization.removedConsecutiveDuplicates, 1, 'one consecutive duplicate');
    eq(r.normalization.removedClosingDuplicate, true, 'closing duplicate');
  });
  check('empty arrays and partial data return unavailable', () => {
    eq(measureSatinCandidate(synth([])).status, 'unavailable', 'empty points');
    eq(measureSatinCandidate({ caseId: 'X', regionId: 'x' }).status, 'unavailable', 'missing region');
    eq(measureSatinCandidate(synth([[0.1], [0.2, Infinity], [0.3, 0.3]])).status, 'unavailable', 'malformed points');
  });

  // ── purity, determinism, isolation ───────────────────────────────────────
  check('measurement never mutates its input (stitch_type included)', () => {
    const entry = fixture.regions[0];
    const before = JSON.stringify(entry);
    const r = measureCase(entry);
    eq(JSON.stringify(entry), before, 'fixture entry unchanged');
    eq(entry.region.stitch_type, 'fill', 'stitch_type untouched');
    ok(r.pointsMm !== entry.region.path_points, 'output arrays are new');
  });
  check('measurement is deterministic across repeated runs', () => {
    const r1 = measureCase(a5);
    const r2 = measureCase(a5);
    eq(JSON.stringify(r1), JSON.stringify(r2), 'identical results');
  });
  check('foundation is isolated: zero productive imports, no engines executed, no commands', () => {
    eq(ISOLATION_MANIFEST.productiveImports.length, 0, 'productiveImports');
    eq(ISOLATION_MANIFEST.enginesExecuted.length, 0, 'enginesExecuted (runPipeline/buildFinalCommands never invoked)');
    eq(ISOLATION_MANIFEST.mutatesRegions, false, 'mutatesRegions');
    eq(ISOLATION_MANIFEST.producesMachineCommands, false, 'producesMachineCommands');
    eq(ISOLATION_MANIFEST.integrated, false, 'integrated');
    eq(artifactManifest.enginesExecuted.length, 0, 'manifest declares no engine executions');
  });
  check('runPipeline and buildFinalCommands were not executed for this foundation', () => {
    eq(fixture.provenance.engineExecuted, false, 'fixture engineExecuted');
    eq(artifactManifest.runPipelineExecuted, false, 'runPipeline not executed');
    eq(artifactManifest.buildFinalCommandsExecuted, false, 'buildFinalCommands not executed');
    for (const r of live) ok(!('commands' in r) && !('sequence' in r), `${r.caseId} produced no commands`);
  });
  check('baseline and Engine V2 remain untouched by this foundation', () => {
    eq(closure.baselineId, BASELINE_ID, 'baseline id');
    eq(fixture.rawCaptureSha256, closure.rawCaptureSha256, 'baseline capture hash unchanged');
    eq(artifactManifest.baselineModified, false, 'baseline not modified');
    eq(artifactManifest.engineV2Modified, false, 'Engine V2 not modified');
    eq(artifactManifest.productiveCodeModified, false, 'productive code not modified');
  });
  check('capability report matches a live recomputation of the five cases', () => {
    eq(capabilityReport.cases.length, 5, 'report case count');
    for (const r of live) {
      const row = capabilityReport.cases.find((c) => c.caseId === r.caseId);
      ok(row, `report row for ${r.caseId}`);
      eq(row.status, r.status, `${r.caseId} status`);
      eq(row.eligibility, r.eligibility, `${r.caseId} eligibility`);
      eq(row.geometryComplete, r.geometryComplete, `${r.caseId} geometryComplete`);
      eq(row.allStationsPaired, r.allStationsPaired, `${r.caseId} allStationsPaired`);
      eq(row.failedStations, r.failedStations, `${r.caseId} failedStations`);
      eq(row.declaredHoleCount, r.declaredHoleCount, `${r.caseId} declaredHoleCount`);
      near(row.meanWidthMm, r.rails.meanWidthMm, 1e-6, `${r.caseId} meanWidthMm`);
      near(row.maximumStitchLengthMm, r.zigzag.metrics.maximumStitchLengthMm, 1e-6, `${r.caseId} max stitch`);
      near(row.centerlineMaximumDeviationMm, r.straightness.centerlineMaximumDeviationMm, 1e-6, `${r.caseId} devMax`);
      near(row.centerlineRmsDeviationMm, r.straightness.centerlineRmsDeviationMm, 1e-6, `${r.caseId} devRms`);
      eq(row.outsideSampleCount, r.containment.outsideSampleCount, `${r.caseId} outsideSampleCount`);
      eq(row.splitRequired, r.zigzag.metrics.splitRequired, `${r.caseId} splitRequired`);
      ok(/SATIN-CANDIDATE\.svg$/.test(row.previewSvg), `${r.caseId} preview reference`);
    }
    eq(capabilityReport.candidateOnly, true, 'report candidateOnly');
    eq(capabilityReport.integrated, false, 'report integrated');
  });
  check('report synthetic controls match a live recomputation', () => {
    const rows = capabilityReport.syntheticControls;
    eq(rows.length, 2, 'two controls');
    const straight = measureSatinCandidate(SYNTH_STRAIGHT_BAR);
    const bent = measureSatinCandidate(SYNTH_BENT_CONSTANT_WIDTH);
    const rowOf = (id) => rows.find((r) => r.caseId === id);
    eq(rowOf('SYNTH-STRAIGHT-BAR').eligibility, straight.eligibility, 'straight control eligibility');
    eq(rowOf('SYNTH-BENT-CONSTANT-WIDTH').eligibility, bent.eligibility, 'bent control eligibility');
    near(rowOf('SYNTH-BENT-CONSTANT-WIDTH').centerlineMaximumDeviationMm, bent.straightness.centerlineMaximumDeviationMm, 1e-6, 'bent devMax');
    for (const r of rows) eq(r.synthetic, true, `${r.caseId} marked synthetic`);
  });

  const fails = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);
  return { name: 'aWidthsSatinFoundation', pass: fails.length === 0, checks: results.length, fails };
}