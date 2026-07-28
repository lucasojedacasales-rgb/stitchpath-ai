/**
 * aWidthsEvaluator.test.js — Hatch Lab (P0.3A)
 * Covers the 45 required checks for the pure A_WIDTHS evaluator.
 * All engine results here are SYNTHETIC fixtures — never real evidence.
 */

import {
  evaluateAWidthsResult, resolveCoordinateSystem, normalizeTechnique, normalizeUnderlay,
  extractAWidthsActual, buildReference, measureRegion, createPointConverter,
  CONCLUSIONS, DEFAULT_OPTIONS,
} from '@/lib/hatchLab/evaluators/A_WIDTHS/index.js';
import { validateSeedCase } from '@/lib/hatchLab/seed/validateSeed';
import { A_WIDTHS_CASES } from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';
import { runSeedValidationTests } from './seedValidation.test.js';
import { runMetricExtractionTests } from './metricExtraction.test.js';
import { runMetricComparisonTests } from './metricComparison.test.js';
import { runMutationSafetyTests } from './mutationSafety.test.js';
import { runAWidthsSeedIntegrityTests } from './aWidthsSeedIntegrity.test.js';
import { runSeedStructuralConformanceTests } from './seedStructuralConformance.test.js';

const DESIGN_MM = { widthMm: 100, heightMm: 80, coordinateSpace: 'mm' };

/** SYNTHETIC bar in mm — not real evidence. */
function bar({ id, cx, cy, w, h, extra = {} }) {
  return {
    id,
    path_points: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]],
    stitch_type: 'satin',
    density: 0.36,
    pull_compensation: 0.4,
    angle: 0,
    underlay: true,
    recommended_underlay: { enabled: true, type: 'edge_walk_zigzag', density_mm: 2, angle_deg: 90, rationale: 'synthetic' },
    color: '#000000',
    ...extra,
  };
}

const CASE_GEOMETRY = { 'HATCH-A-WIDTHS-A1': [7, 13, 0.5], 'HATCH-A-WIDTHS-A5': [55, 13, 3], 'HATCH-A-WIDTHS-A6': [67, 13, 4], 'HATCH-A-WIDTHS-A7': [80, 13, 6], 'HATCH-A-WIDTHS-A8': [93, 13, 8] };

function mmResult(ids = Object.keys(CASE_GEOMETRY)) {
  return { regions: ids.map(id => { const [cx, cy, w] = CASE_GEOMETRY[id]; return bar({ id: `bar_${id}`, cx, cy, w, h: 16 }); }) };
}
function convertResult(result, fn) {
  return { regions: result.regions.map(r => ({ ...r, path_points: r.path_points.map(fn) })) };
}

export function runAWidthsEvaluatorTests() {
  const fails = [];
  let checks = 0;
  const ok = (label, cond) => { checks++; if (!cond) fails.push(label); };
  const caseOf = (out, id) => out.cases.find(c => c.caseId === id);
  const cmp = (c, name) => c.comparisons.find(x => x.name === name);

  // 1
  ok('1. five real seed cases available', A_WIDTHS_CASES.length === 5 && Object.keys(CASE_GEOMETRY).every(id => A_WIDTHS_CASES.some(c => c.caseId === id)));

  // 2 — mm
  const mm = evaluateAWidthsResult({ result: mmResult(), seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('2. five bars in mm → evaluated with 5 matches', mm.conclusion === 'evaluated' && mm.matchCoverage.matched === 5);
  ok('2b. coordinate system resolved as mm', mm.coordinateSystem.space === 'mm' && mm.coordinateSystem.status === 'resolved');

  // 3 — normalized
  const norm = evaluateAWidthsResult({
    result: convertResult(mmResult(), ([x, y]) => [x / 100, y / 80]),
    seedCases: A_WIDTHS_CASES,
    design: { widthMm: 100, heightMm: 80, coordinateSpace: 'normalized_0_1' },
  });
  ok('3. normalized coordinates → same 5 matches', norm.matchCoverage.matched === 5 && norm.conclusion === 'evaluated');
  ok('3b. normalized widths equal the mm widths', Object.keys(CASE_GEOMETRY).every(id =>
    Math.abs(caseOf(norm, id).actual.widthMm.normalizedValue - caseOf(mm, id).actual.widthMm.normalizedValue) < 1e-9));

  // 4 — pixels
  const px = evaluateAWidthsResult({
    result: convertResult(mmResult(), ([x, y]) => [x * 10, y * 10]),
    seedCases: A_WIDTHS_CASES,
    design: { widthMm: 100, heightMm: 80, widthPx: 1000, heightPx: 800, coordinateSpace: 'pixels' },
  });
  ok('4. pixel coordinates → same 5 matches', px.matchCoverage.matched === 5);
  ok('4b. pixel conversion documented', px.coordinateSystem.conversions.length === 1 && /widthPx/.test(px.coordinateSystem.conversions[0]));

  // 5 — missing widthMm/heightMm
  const noDims = evaluateAWidthsResult({ result: convertResult(mmResult(), ([x, y]) => [x / 100, y / 80]), seedCases: A_WIDTHS_CASES, design: { coordinateSpace: 'normalized_0_1' } });
  ok('5. normalized without widthMm/heightMm → unavailable + inconclusive', noDims.coordinateSystem.status === 'unavailable' && noDims.conclusion === 'inconclusive');
  ok('5b. pixels without widthPx → unavailable', resolveCoordinateSystem({ design: { coordinateSpace: 'pixels', widthMm: 100, heightMm: 80 }, options: DEFAULT_OPTIONS }).status === 'unavailable');
  ok('5c. every case reported as unavailable match', noDims.cases.every(c => c.status === 'unavailable'));

  // 6 — unknown coordinate space, and no inference from 0–1 ranges
  const unknownSpace = evaluateAWidthsResult({ result: mmResult(), seedCases: A_WIDTHS_CASES, design: { widthMm: 100, heightMm: 80, coordinateSpace: 'inches' } });
  ok('6. unknown coordinate space rejected', unknownSpace.coordinateSystem.status === 'unavailable' && /Unsupported coordinate space/.test(unknownSpace.coordinateSystem.reason));
  ok('6b. no space declared → never inferred', resolveCoordinateSystem({ design: { widthMm: 100, heightMm: 80 }, result: { regions: [] }, options: DEFAULT_OPTIONS }).status === 'unavailable');
  ok('6c. result.meta space ignored unless opted in', resolveCoordinateSystem({ design: { widthMm: 100, heightMm: 80 }, result: { meta: { coordinateSpace: 'mm' } }, options: DEFAULT_OPTIONS }).status === 'unavailable');

  // 7 — exact centre match
  const a7 = caseOf(mm, 'HATCH-A-WIDTHS-A7');
  ok('7. exact centre match', a7.match.status === 'matched' && a7.match.selectedRegionId === 'bar_HATCH-A-WIDTHS-A7' && a7.match.centerDistanceMm < 1e-9);

  // 8 — small tolerance
  const shifted = { regions: mmResult().regions.map(r => ({ ...r, path_points: r.path_points.map(([x, y]) => [x + 0.3, y - 0.2]) })) };
  const tolOut = evaluateAWidthsResult({ result: shifted, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('8. small offset still matches', tolOut.matchCoverage.matched === 5 && caseOf(tolOut, 'HATCH-A-WIDTHS-A5').match.centerDistanceMm > 0);

  // 9 — region too far
  const far = { regions: [bar({ id: 'far', cx: 7, cy: 70, w: 0.5, h: 16 })] };
  const farOut = evaluateAWidthsResult({ result: far, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('9. distant region → unmatched, no_matches', farOut.matchCoverage.unmatched === 5 && farOut.conclusion === 'no_matches');

  // 10 — two equally valid candidates
  const dupOut = evaluateAWidthsResult({
    result: { regions: [bar({ id: 'p1', cx: 80, cy: 13, w: 6, h: 16 }), bar({ id: 'p2', cx: 80, cy: 13, w: 6, h: 16 })] },
    seedCases: [A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A7')], design: DESIGN_MM,
  });
  const dupCase = dupOut.cases[0];
  ok('10. two equal candidates → ambiguous with both ids', dupCase.match.status === 'ambiguous' && dupCase.match.candidateRegionIds.length === 2 && dupCase.match.selectedRegionId === null);
  ok('10b. ambiguous case extracts no values', dupCase.actual.technique.availability === 'unavailable' && cmp(dupCase, 'technique').comparisonStatus === 'ambiguous_match');
  ok('10c. overall conclusion ambiguous', dupOut.conclusion === 'ambiguous');

  // 11 — absent region
  const partial = evaluateAWidthsResult({ result: mmResult(['HATCH-A-WIDTHS-A1', 'HATCH-A-WIDTHS-A5', 'HATCH-A-WIDTHS-A6', 'HATCH-A-WIDTHS-A7']), seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('11. missing region → unmatched for that case', caseOf(partial, 'HATCH-A-WIDTHS-A8').match.status === 'unmatched');

  // 12 — never match by index
  const reversed = { regions: [...mmResult().regions].reverse() };
  const revOut = evaluateAWidthsResult({ result: reversed, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('12. matching independent of array position', Object.keys(CASE_GEOMETRY).every(id => caseOf(revOut, id).match.selectedRegionId === `bar_${id}`));
  ok('12b. same matches with a shuffled result', JSON.stringify(revOut.cases.map(c => [c.caseId, c.match.selectedRegionId])) === JSON.stringify(mm.cases.map(c => [c.caseId, c.match.selectedRegionId])));

  // 13 — nearby contour never replaces the main object
  const withContour = {
    regions: [
      bar({ id: 'bar_A7', cx: 80, cy: 13, w: 6, h: 16 }),
      { id: 'contour_A7', type: 'contour', region_class: 'outer_outline', parentRegionId: 'bar_A7', stitch_type: 'running_stitch', contour_width_mm: 1.2, contour_points: [[77, 5], [83, 5], [83, 21], [77, 21]] },
    ],
  };
  const contourOut = evaluateAWidthsResult({ result: withContour, seedCases: [A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A7')], design: DESIGN_MM });
  ok('13. contour does not replace the main object', contourOut.cases[0].match.selectedRegionId === 'bar_A7' && contourOut.cases[0].match.status === 'matched');
  ok('13b. contour kept as excluded context', contourOut.cases[0].match.reasons.some(r => /contour\/auxiliary/.test(r)));
  const onlyContour = evaluateAWidthsResult({ result: { regions: [withContour.regions[1]] }, seedCases: [A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A7')], design: DESIGN_MM });
  ok('13c. only contours nearby → ambiguous, not silently filtered', onlyContour.cases[0].match.status === 'ambiguous' && onlyContour.cases[0].match.candidateRegionIds.includes('contour_A7'));

  // 14 — unknown region type
  const unknownType = evaluateAWidthsResult({ result: { regions: [bar({ id: 'x', cx: 80, cy: 13, w: 6, h: 16, extra: { type: 'mystery_object' } })] }, seedCases: [A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A7')], design: DESIGN_MM });
  ok('14. unknown region type still a main-object candidate', unknownType.cases[0].actual.regionRole.normalizedValue === 'main_object_candidate' && unknownType.cases[0].actual.regionRole.rawValue === 'mystery_object');

  // 15–16 technique
  const techSatin = normalizeTechnique({ region: { stitch_type: 'satin' } });
  ok('15. satin recognized from a verified value', techSatin.normalizedValue === 'satin' && techSatin.availability === 'available' && techSatin.sourceField === 'region.stitch_type');
  ok('15b. fill never promoted to tatami', normalizeTechnique({ region: { stitch_type: 'fill' } }).normalizedValue === 'fill');
  ok('15c. running_stitch → running', normalizeTechnique({ region: { stitch_type: 'running_stitch' } }).normalizedValue === 'running');
  ok('16. unknown technique → unknown with rawValue kept', (() => { const t = normalizeTechnique({ region: { stitch_type: 'sculpted_column' } }); return t.normalizedValue === 'unknown' && t.rawValue === 'sculpted_column'; })());
  ok('16b. absent technique → unavailable', normalizeTechnique({ region: {} }).normalizedValue === 'unavailable');
  ok('16c. technique never taken from the seed', normalizeTechnique({ region: {}, planEntry: null }).sourceField === null);

  // 17–19 underlay
  const uCenter = normalizeUnderlay({ region: { recommended_underlay: { enabled: true, type: 'centre_walk' } } });
  ok('17. centre_walk → center_run', uCenter.primaryUnderlay.normalizedValue === 'center_run' && uCenter.underlayEnabled.normalizedValue === true);
  const uEdgeZig = normalizeUnderlay({ region: { recommended_underlay: { enabled: true, type: 'edge_walk_zigzag', density_mm: 2, angle_deg: 90 } } });
  ok('18. edge_walk_zigzag → edge_run_plus_zigzag', uEdgeZig.primaryUnderlay.normalizedValue === 'edge_run_plus_zigzag');
  ok('18b. underlay lengths unavailable', uEdgeZig.primaryLengthMm.availability === 'unavailable' && uEdgeZig.secondaryLengthMm.availability === 'unavailable');
  ok('18c. secondary underlay unavailable, never invented', uEdgeZig.secondaryUnderlay.availability === 'unavailable');
  const uBool = normalizeUnderlay({ region: { underlay: true } });
  ok('19. boolean-only underlay → type unavailable, boolean kept', uBool.underlayEnabled.normalizedValue === true && uBool.primaryUnderlay.availability === 'unavailable' && uBool.primaryUnderlay.normalizedValue === null);
  ok('19b. full_coverage has no equivalent → unknown', normalizeUnderlay({ region: { recommended_underlay: { enabled: true, type: 'full_coverage' } } }).primaryUnderlay.normalizedValue === 'unknown');

  // 20–22 spacing / density
  const refA1 = buildReference(A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A1'));
  ok('20. automatic spacing with absent value stays null', refA1.spacingMode === 'automático' && refA1.spacingMm === null);
  const a1Case = caseOf(mm, 'HATCH-A-WIDTHS-A1');
  ok('20b. null reference spacing is not zero and not an error', cmp(a1Case, 'spacingMm').comparisonStatus === 'not_comparable' && cmp(a1Case, 'spacingMm').actualValue === null);
  const refA7 = buildReference(A_WIDTHS_CASES.find(c => c.caseId === 'HATCH-A-WIDTHS-A7'));
  ok('21. manual spacing 0.36 read from the seed', refA7.spacingMode === 'manual' && refA7.spacingMm === 0.36);
  const actualA7 = a7.actual;
  ok('22. density never converted into spacing', actualA7.spacing.spacingMm.availability === 'unavailable' && actualA7.spacing.density.normalizedValue === 0.36 && actualA7.spacing.densityUnit === 'mm_row_or_column_spacing');
  ok('22b. spacingMode unavailable in the engine', actualA7.spacing.spacingMode.availability === 'unavailable');
  const derivedSpacing = extractAWidthsActual({ region: bar({ id: 'z', cx: 80, cy: 13, w: 6, h: 16 }), options: { ...DEFAULT_OPTIONS, treatDensityAsSpacing: true } });
  ok('22c. opt-in spacing is marked derived with its formula', derivedSpacing.spacing.spacingMm.derived === true && /identity formula/.test(derivedSpacing.spacing.spacingMm.reason));

  // 23–26 compensation, autoSplit, angle
  ok('23. compensation 0.4 extracted and compared', actualA7.pullCompensationMm.normalizedValue === 0.4 && cmp(a7, 'pullCompensationMm').comparisonStatus === 'equal');
  ok('24. autoSplit true in the reference, unavailable in the engine', refA7.autoSplit === true && actualA7.autoSplit.availability === 'unavailable' && cmp(a7, 'autoSplit').comparisonStatus === 'unavailable_actual');
  const seedFalseSplit = { ...A_WIDTHS_CASES[0], observation: { ...A_WIDTHS_CASES[0].observation, measured: { ...A_WIDTHS_CASES[0].observation.measured, autoSplit: false } } };
  ok('25. autoSplit false preserved, never confused with absent', buildReference(seedFalseSplit).autoSplit === false && buildReference({ ...A_WIDTHS_CASES[0], observation: {}, configuration: {} }).autoSplit === null);
  ok('26. angle 0 preserved as a value', actualA7.stitchAngleDeg.normalizedValue === 0 && actualA7.stitchAngleDeg.availability === 'available' && cmp(a7, 'stitchAngleDeg').comparisonStatus === 'equal');

  // 27 absent field ≠ zero
  const sparse = extractAWidthsActual({ region: { id: 's', path_points: [[0, 0], [1, 0], [1, 1]] } });
  ok('27. absent numeric fields are unavailable with null value', sparse.pullCompensationMm.availability === 'unavailable' && sparse.pullCompensationMm.normalizedValue === null
    && sparse.stitchAngleDeg.availability === 'unavailable' && sparse.spacing.density.normalizedValue === null);

  // 28–29 measurement method
  ok('28. straight bar width from bounding box', Math.abs(a7.actual.widthMm.normalizedValue - 6) < 1e-9 && a7.actual.geometry.measurementMethod === 'bounding_box_width' && a7.actual.widthMm.derived === true);
  ok('28b. nominal / Hatch-observed / engine widths stay distinct', a7.reference.nominalWidthMm === 6 && a7.reference.observedWidthMm === 6.09
    && cmp(a7, 'observedWidthMm_vs_engineWidthMm').delta === null && cmp(a7, 'observedWidthMm_vs_engineWidthMm').comparisonStatus === 'informational');
  ok('29. bounding box not presented as a universal local profile', /NOT a universal local width profile/.test(a7.actual.geometry.limitation)
    && /straight bars/.test(a7.actual.widthMm.reason));
  const curvedSeed = { ...A_WIDTHS_CASES[3], ruleScope: { ...A_WIDTHS_CASES[3].ruleScope, geometryClass: 'banda_curva' } };
  const curvedOut = evaluateAWidthsResult({ result: mmResult(['HATCH-A-WIDTHS-A7']), seedCases: [curvedSeed], design: DESIGN_MM });
  ok('29b. non-straight geometry raises a warning', curvedOut.cases[0].warnings.some(w => /must not be used as the main width measurement/.test(w)));

  // 30–33 conclusions
  ok('30. partial result', partial.conclusion === 'partial' && partial.matchCoverage.matched === 4);
  ok('31. ambiguous result', dupOut.conclusion === 'ambiguous');
  ok('32. invalid input', evaluateAWidthsResult({ result: null, seedCases: A_WIDTHS_CASES }).conclusion === 'invalid_input'
    && evaluateAWidthsResult({ result: {}, seedCases: [] }).conclusion === 'invalid_input'
    && evaluateAWidthsResult({ result: {}, seedCases: [{ noId: true }] }).conclusion === 'invalid_input');
  const serialized = JSON.stringify([mm, partial, dupOut, farOut]);
  ok('33. no global pass/fail vocabulary', CONCLUSIONS.includes(mm.conclusion) && !/"(pass|fail|improved|regressed)"/.test(serialized));
  ok('33b. every case status is a match status', [mm, partial, dupOut].every(o => o.cases.every(c => ['matched', 'ambiguous', 'unmatched', 'unavailable'].includes(c.status))));

  // 34–36 purity
  const resultFixture = mmResult();
  const seedSnapshot = JSON.stringify(A_WIDTHS_CASES);
  const resultSnapshot = JSON.stringify(resultFixture);
  const run1 = evaluateAWidthsResult({ result: resultFixture, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  const run2 = evaluateAWidthsResult({ result: resultFixture, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('34. result not mutated', JSON.stringify(resultFixture) === resultSnapshot);
  ok('35. seedCases not mutated', JSON.stringify(A_WIDTHS_CASES) === seedSnapshot);
  ok('36. same input → same output', JSON.stringify(run1) === JSON.stringify(run2) && run1.generatedAt === null);

  // 37–40 robustness
  const empty = evaluateAWidthsResult({ result: { regions: [], plan: { sequence: [] }, commands: [] }, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('37. empty arrays are safe', empty.conclusion === 'no_matches' && empty.inputSummary.regionCount === 0 && empty.warnings.length >= 0);
  const partialData = evaluateAWidthsResult({ result: { regions: [{ id: 'no_geometry' }, bar({ id: 'bar_HATCH-A-WIDTHS-A7', cx: 80, cy: 13, w: 6, h: 16, extra: { stitch_type: undefined, density: undefined } })] }, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('38. partial data is safe', partialData.conclusion === 'partial' && partialData.inputSummary.measurableRegionCount === 1
    && caseOf(partialData, 'HATCH-A-WIDTHS-A7').actual.technique.availability === 'unavailable');
  const dupIds = evaluateAWidthsResult({ result: { regions: [bar({ id: 'same', cx: 80, cy: 13, w: 6, h: 16 }), bar({ id: 'same', cx: 7, cy: 13, w: 0.5, h: 16 })] }, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('39. duplicated ids reported', dupIds.warnings.some(w => /Duplicated region ids/.test(w)));
  const unknownFieldOut = evaluateAWidthsResult({ result: { regions: [bar({ id: 'u', cx: 80, cy: 13, w: 6, h: 16, extra: { experimentalHatchField: 7 } })] }, seedCases: A_WIDTHS_CASES, design: DESIGN_MM });
  ok('40. unknown fields recorded', unknownFieldOut.unknownFields.includes('experimentalHatchField'));
  ok('40b. unavailable fields recorded', mm.unavailableFields.includes('autoSplit') && mm.unavailableFields.includes('spacingMode') && mm.unavailableFields.includes('spacingMm'));
  ok('40c. field coverage reported per data point', mm.fieldCoverage.technique.available === 5 && mm.fieldCoverage.autoSplit.unavailable === 5);

  // 41 previous suites
  const previous = [runSeedValidationTests, runMetricExtractionTests, runMetricComparisonTests, runMutationSafetyTests, runAWidthsSeedIntegrityTests, runSeedStructuralConformanceTests].map(fn => fn());
  ok('41. the six previous suites still pass', previous.length === 6 && previous.every(s => s.pass === true));

  // 42–44 seed untouched
  ok('42. the five cases remain structurally valid', A_WIDTHS_CASES.every(c => validateSeedCase(c).valid === true));
  ok('43. expectedResult still null', A_WIDTHS_CASES.every(c => c.expectedResult === null));
  ok('44. no rule promoted to confirmed', A_WIDTHS_CASES.every(c => c.confidence !== 'confirmed' && c.candidateRules.every(r => r.status === 'candidata' && r.physicalValidation === false)));
  ok('44b. the evaluator never writes expectedResult', !/expectedResult/.test(JSON.stringify(mm.cases.map(c => c.actual))));

  // 45 isolation contract: works on frozen plain data only
  const frozen = Object.freeze({ regions: Object.freeze(mmResult().regions.map(r => Object.freeze({ ...r }))) });
  const frozenOut = evaluateAWidthsResult({ result: frozen, seedCases: Object.freeze([...A_WIDTHS_CASES]), design: Object.freeze({ ...DESIGN_MM }) });
  ok('45. evaluator operates on plain frozen data (no engine objects, no writes)', frozenOut.matchCoverage.matched === 5);
  ok('45b. measurement works standalone with an injected converter', (() => {
    const conv = createPointConverter({ status: 'resolved', space: 'mm' });
    const m = measureRegion(bar({ id: 'q', cx: 10, cy: 10, w: 2, h: 4 }), conv);
    return Math.abs(m.boundingWidthMm - 2) < 1e-9 && Math.abs(m.boundingHeightMm - 4) < 1e-9 && m.pointCount === 4;
  })());

  return { name: 'hatchLab/aWidthsEvaluator', pass: fails.length === 0, checks, fails };
}