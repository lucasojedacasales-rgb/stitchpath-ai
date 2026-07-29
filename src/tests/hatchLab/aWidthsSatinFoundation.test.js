/**
 * aWidthsSatinFoundation.test.js — P1.F0 SATIN_COLUMN foundation suite.
 * Tests ONLY the foundation (never re-runs the other lab suites, never runs
 * the engine). Synthetic fixtures are explicitly marked synthetic: true.
 */

import {
  measureSatinCandidate, normalizePolygonMm, computePrincipalAxis, hasSelfIntersection,
  verifyStraightColumnFixture, hashPolygon, AUTHORIZED_REGIONS, BASELINE_ID, RAW_CAPTURE_SHA256,
  DEFAULT_OPTIONS, ISOLATION_MANIFEST,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/index.js';
import fixture from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/fixtures/A_WIDTHS_STRAIGHT_BARS.json';
import capabilityReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/reports/capabilityReport.json';
import closure from '@/lib/hatchLab/baselines/A_WIDTHS/archiveClosure/BASE-ENGINE-A-WIDTHS-V1.archiveClosure.json';

const DESIGN_100 = { coordinateSpace: 'normalized_0_1', widthMm: 100, heightMm: 100 }; // isotropic synthetic space

// synthetic: true — laboratory-invented shapes, never real baseline data
const synth = (points, extra = {}) => ({
  synthetic: true,
  caseId: extra.caseId || 'SYNTH',
  regionId: extra.regionId || 'synth_1',
  region: { id: extra.regionId || 'synth_1', path_points: points, holes: extra.holes || null, region_class: extra.region_class || null, type: 'fill', stitch_type: 'fill' },
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
  check('five real cases produce eligible candidate geometry', () => {
    for (const r of live) {
      eq(r.eligibility, 'eligible', `${r.caseId} eligibility`);
      eq(r.status, 'candidate_geometry_complete', `${r.caseId} status`);
      eq(r.zigzag.candidateOnly, true, 'candidateOnly');
      eq(r.zigzag.integrated, false, 'integrated');
      eq(r.zigzag.technique, 'satin_candidate', 'technique');
      eq(r.zigzag.geometryType, 'paired_boundary_zigzag', 'geometryType');
    }
  });
  check('no NaN/Infinity anywhere in the five measured results', () => {
    for (const r of live) ok(!deepHasBadNumber(r), `${r.caseId} contains a non-finite number`);
  });
  check('every successful station has exactly two intersections and both rails', () => {
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
      // A centerline would have near-zero crossing widths; crossings equal the real width.
      ok(r.zigzag.metrics.averageStitchLengthMm > r.rails.meanWidthMm * 0.45, `${r.caseId} not a centerline`);
      // A scanline fill continues in one direction; a zigzag alternates sides every point.
      const p = r.zigzag.pointsMm;
      const s0 = [p[1][0] - p[0][0], p[1][1] - p[0][1]];
      const s1 = [p[2][0] - p[1][0], p[2][1] - p[1][1]];
      const cross = s0[0] * s1[1] - s0[1] * s1[0];
      const parallel = Math.abs(cross) < 1e-12 && s0[0] * s1[0] + s0[1] * s1[1] > 0;
      ok(!parallel, `${r.caseId} consecutive segments must not continue in the same direction like a scanline`);
    }
  });
  check('spacing is explicit configuration and echoed in the result', () => {
    for (const r of live) { eq(r.options.spacingMm, 0.4, 'spacingMm'); eq(r.zigzag.spacingMm, 0.4, 'zigzag spacingMm'); }
    eq(DEFAULT_OPTIONS.spacingMm, 0.4, 'schema default');
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

  // ── axis invariances (real + synthetic) ──────────────────────────────────
  const a5 = fixture.regions.find((r) => r.caseId === 'HATCH-A-WIDTHS-A5');
  const a5Base = measureCase(a5);
  check('axis and rails invariant to the polygon start point (array rotation)', () => {
    const pts = a5.region.path_points;
    const rotated = [...pts.slice(57), ...pts.slice(0, 57)];
    const r = measureSatinCandidate({ ...a5, region: { ...a5.region, path_points: rotated }, design: fixture.design });
    near(r.axis.axisAngleDeg, a5Base.axis.axisAngleDeg, 1e-6, 'angle');
    near(r.axis.centroidMm[0], a5Base.axis.centroidMm[0], 1e-9, 'centroid x');
    near(r.rails.meanWidthMm, a5Base.rails.meanWidthMm, 1e-6, 'mean width');
    eq(r.rails.successfulStations, a5Base.rails.successfulStations, 'stations');
  });
  check('axis and rails invariant to winding direction (point reversal)', () => {
    const reversed = [...a5.region.path_points].reverse();
    const r = measureSatinCandidate({ ...a5, region: { ...a5.region, path_points: reversed }, design: fixture.design });
    near(r.axis.axisAngleDeg, a5Base.axis.axisAngleDeg, 1e-6, 'angle');
    near(r.axis.centroidMm[1], a5Base.axis.centroidMm[1], 1e-9, 'centroid y');
    near(r.rails.meanWidthMm, a5Base.rails.meanWidthMm, 1e-6, 'mean width');
  });
  check('translation shifts the centroid, never the axis angle', () => {
    const base = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.04)));
    const moved = measureSatinCandidate(synth(rect(0.3, 0.2, 0.4, 0.04)));
    near(moved.axis.axisAngleDeg, base.axis.axisAngleDeg, 1e-9, 'angle unchanged');
    near(moved.axis.centroidMm[0] - base.axis.centroidMm[0], 20, 1e-9, 'centroid shifted +20mm x');
    near(moved.axis.centroidMm[1] - base.axis.centroidMm[1], 10, 1e-9, 'centroid shifted +10mm y');
  });
  check('rotation rotates the axis by the same angle (synthetic, isotropic space)', () => {
    const deg = 30, rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const base = rect(-0.2, -0.02, 0.4, 0.04).map(([x, y]) => [x + 0.5, y + 0.5]);
    const rot = rect(-0.2, -0.02, 0.4, 0.04).map(([x, y]) => [x * c - y * s + 0.5, x * s + y * c + 0.5]);
    const r0 = computePrincipalAxis(normalizePolygonMm(base, DESIGN_100).pointsMm);
    const r1 = computePrincipalAxis(normalizePolygonMm(rot, DESIGN_100).pointsMm);
    near(r0.axisAngleDeg, 0, 1e-6, 'base horizontal');
    near(r1.axisAngleDeg, deg, 1e-6, 'rotated by 30°');
  });
  check('horizontal bar → axis 0°, vertical bar → axis 90°, both eligible', () => {
    const h = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.04), { caseId: 'SYNTH-H' }));
    const v = measureSatinCandidate(synth(rect(0.1, 0.1, 0.04, 0.4), { caseId: 'SYNTH-V' }));
    near(h.axis.axisAngleDeg, 0, 1e-6, 'horizontal');
    near(v.axis.axisAngleDeg, 90, 1e-6, 'vertical');
    eq(h.eligibility, 'eligible', 'horizontal eligible');
    eq(v.eligibility, 'eligible', 'vertical eligible');
  });

  // ── incompatible synthetic shapes (all marked synthetic) ────────────────
  check('too-wide synthetic bar: splitRequired without autoSplit', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.2), { caseId: 'SYNTH-WIDE' }));
    eq(r.zigzag.metrics.splitRequired, true, 'splitRequired');
    eq(r.status, 'unsupported_requires_split', 'status');
    ok(r.zigzag.metrics.maximumStitchLengthMm > 12.1, 'stitch exceeds limit');
    // No autoSplit: crossings keep their full ~20mm length, no midpoints injected.
    near(r.zigzag.metrics.maximumStitchLengthMm, 20, 0.5, 'crossing kept whole');
    eq(r.zigzag.pointsMm.length, r.rails.successfulStations * 2, 'no extra points inserted');
  });
  check('region with holes is refused with a concrete reason', () => {
    const r = measureSatinCandidate(synth(rect(0.1, 0.1, 0.4, 0.05), { holes: [rect(0.2, 0.11, 0.05, 0.02)] }));
    eq(r.eligibility, 'ineligible', 'eligibility');
    ok(r.reasons.some((x) => /holes/.test(x)), 'reason mentions holes');
  });
  check('self-intersecting polygon (bowtie) is ineligible', () => {
    // Asymmetric bowtie: non-zero net area so the self-intersection check is reached.
    const bowtie = [[0.1, 0.1], [0.38, 0.32], [0.3, 0.1], [0.1, 0.3]];
    ok(hasSelfIntersection(normalizePolygonMm(bowtie, DESIGN_100).pointsMm), 'bowtie detected');
    const r = measureSatinCandidate(synth(bowtie));
    eq(r.eligibility, 'ineligible', 'eligibility');
    ok(r.reasons.some((x) => /self-intersect/.test(x)), 'reason mentions self-intersection');
  });
  check('complex concavity (U shape) yields >2 intersections and is not eligible', () => {
    const u = [[0, 0], [0.12, 0], [0.12, 0.2], [0.08, 0.2], [0.08, 0.04], [0.04, 0.04], [0.04, 0.2], [0, 0.2]]
      .map(([x, y]) => [x + 0.2, y + 0.2]);
    const r = measureSatinCandidate(synth(u, { caseId: 'SYNTH-U' }));
    ok(r.rails.stations.some((s) => s.intersectionCount > 2), 'some station has more than two intersections');
    ok(r.rails.failedStations > 0, 'failed stations recorded');
    ok(r.rails.stations.filter((s) => s.intersectionCount !== 2).every((s) => s.leftRailPoint === null), 'no edge invented');
    ok(r.eligibility !== 'eligible', 'not eligible');
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
  });
  check('capability report matches a live recomputation of the five cases', () => {
    eq(capabilityReport.cases.length, 5, 'report case count');
    for (const r of live) {
      const row = capabilityReport.cases.find((c) => c.caseId === r.caseId);
      ok(row, `report row for ${r.caseId}`);
      eq(row.status, r.status, `${r.caseId} status`);
      eq(row.eligibility, r.eligibility, `${r.caseId} eligibility`);
      near(row.meanWidthMm, r.rails.meanWidthMm, 1e-9, `${r.caseId} meanWidthMm`);
      near(row.maximumStitchLengthMm, r.zigzag.metrics.maximumStitchLengthMm, 1e-9, `${r.caseId} max stitch`);
      eq(row.splitRequired, r.zigzag.metrics.splitRequired, `${r.caseId} splitRequired`);
      ok(/SATIN-CANDIDATE\.svg$/.test(row.previewSvg), `${r.caseId} preview reference`);
    }
    eq(capabilityReport.candidateOnly, true, 'report candidateOnly');
    eq(capabilityReport.integrated, false, 'report integrated');
  });

  const fails = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`);
  return { name: 'aWidthsSatinFoundation', pass: fails.length === 0, checks: results.length, fails };
}