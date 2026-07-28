/**
 * aWidthsStoredBaseline.test.js — structural tests for the CLOSED baseline
 * BASE-ENGINE-A-WIDTHS-V1.
 *
 * These tests never run the engine, never import the pipeline and never apply a
 * criterion: they only assert that the archived baseline is internally coherent
 * and still declares itself rule-free and immutable.
 */

import runManifest from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/runManifest.json';
import baselineConfig from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/baselineConfig.json';
import parityAudit from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/editorParityAudit.json';
import inputAudit from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/engineInputAudit.json';
import stageLog from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/stageLog.json';
import regionsSummary from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/regionsSummary.json';
import evaluationReport from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/evaluationReport.json';
import snapshot from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/pipelineSnapshot.json';

const CASE_IDS = ['HATCH-A-WIDTHS-A1', 'HATCH-A-WIDTHS-A5', 'HATCH-A-WIDTHS-A6', 'HATCH-A-WIDTHS-A7', 'HATCH-A-WIDTHS-A8'];

function col(name) {
  const i = regionsSummary.columns.indexOf(name);
  if (i < 0) throw new Error(`unknown column ${name}`);
  return i;
}
const cell = (row, name) => row[col(name)];

export function runAWidthsStoredBaselineTests() {
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.message }); }
  };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
  const ok = (v, msg) => { if (!v) throw new Error(msg); };

  // ── Immutability + rule-free state ─────────────────────────────────────────
  check('every artefact declares itself immutable', () => {
    for (const [name, file] of Object.entries({ runManifest, stageLog, regionsSummary, evaluationReport, snapshot })) {
      eq(file.immutableBaseline, true, `${name}.immutableBaseline`);
    }
  });

  check('baseline carries no rules and no physical validation', () => {
    const r = runManifest.readiness || {};
    for (const key of Object.keys(r)) ok(r[key] === false, `readiness.${key} must stay false`);
  });

  check('run completed with all 9 stages ok', () => {
    eq(stageLog.stageCount, 9, 'stageCount');
    eq(stageLog.failedStageCount, 0, 'failedStageCount');
    eq(stageLog.stages.length, 9, 'stages.length');
    ok(stageLog.stages.every(s => s.ok === true), 'every stage ok');
  });

  // ── Region summary coherence ───────────────────────────────────────────────
  check('26 regions, one row each, column arity respected', () => {
    eq(regionsSummary.regionCount, 26, 'regionCount');
    eq(regionsSummary.rows.length, 26, 'rows.length');
    ok(regionsSummary.rows.every(r => r.length === regionsSummary.columns.length), 'row arity');
  });

  check('sourceIndex is dense and ordered', () => {
    regionsSummary.rows.forEach((r, i) => eq(cell(r, 'sourceIndex'), i, `row ${i} sourceIndex`));
  });

  check('region ids are unique', () => {
    const ids = regionsSummary.rows.map(r => cell(r, 'id'));
    eq(new Set(ids).size, ids.length, 'unique ids');
  });

  check('captured fact: every region is fill (no satin, no running stitch)', () => {
    ok(regionsSummary.rows.every(r => cell(r, 'stitch_type') === 'fill'), 'all stitch_type fill');
  });

  check('captured fact: two parameter families (17 with density, 9 without)', () => {
    const withDensity = regionsSummary.rows.filter(r => cell(r, 'density') === 0.4);
    const without = regionsSummary.rows.filter(r => cell(r, 'density') === 0);
    eq(withDensity.length, 17, 'regions with density 0.4');
    eq(without.length, 9, 'regions with density 0');
    ok(without.every(r => cell(r, 'pull_compensation') === 0 && cell(r, 'underlay') === false), 'density-0 family has no compensation and no underlay');
  });

  check('captured fact: no contour objects in the final collection', () => {
    ok(regionsSummary.rows.every(r => cell(r, 'region_class') === null && cell(r, 'parentRegionId') === null && cell(r, 'contourPointCount') === null), 'contour fields all null');
  });

  // ── Evaluator report coherence ─────────────────────────────────────────────
  check('evaluator conclusion is evaluated, complete, all_assigned', () => {
    eq(evaluationReport.conclusion, 'evaluated', 'conclusion');
    eq(evaluationReport.dataConclusion, 'complete', 'dataConclusion');
    eq(evaluationReport.matchConclusion, 'all_assigned', 'matchConclusion');
    eq(evaluationReport.comparisonSuppressed, false, 'comparisonSuppressed');
    eq(evaluationReport.optimalityProven, true, 'optimalityProven');
  });

  check('coverage matches the five seed cases', () => {
    eq(evaluationReport.matchCoverage.matched, 5, 'matched');
    eq(evaluationReport.matchCoverage.ambiguous, 0, 'ambiguous');
    eq(evaluationReport.matchCoverage.unmatched, 0, 'unmatched');
    eq(evaluationReport.cases.length, 5, 'cases.length');
    eq(evaluationReport.cases.map(c => c.caseId).sort().join(','), [...CASE_IDS].sort().join(','), 'case ids');
  });

  check('every assigned region really exists in the region summary', () => {
    const ids = new Set(regionsSummary.rows.map(r => cell(r, 'id')));
    for (const [caseId, regionId] of Object.entries(evaluationReport.assignment)) {
      ok(ids.has(regionId), `${caseId} assigned to unknown region ${regionId}`);
    }
    eq(new Set(Object.values(evaluationReport.assignment)).size, 5, 'assignment is injective');
  });

  check('assignment is consistent between cases[] and assignment{}', () => {
    for (const c of evaluationReport.cases) eq(evaluationReport.assignment[c.caseId], c.regionId, `${c.caseId} assignment`);
  });

  check('search was complete and unlimited', () => {
    const s = evaluationReport.assignmentSearch;
    eq(s.searchComplete, true, 'searchComplete');
    eq(s.stoppedEarly, false, 'stoppedEarly');
    eq(s.candidateLimitApplied, false, 'candidateLimitApplied');
    eq(s.solutionLimitApplied, false, 'solutionLimitApplied');
    eq(s.pruning.total, s.pruning.byMatchCount + s.pruning.byScore + s.pruning.byDistance + s.pruning.byOther, 'pruning total');
  });

  check('technique differs from the reference in all five cases', () => {
    for (const c of evaluationReport.cases) {
      eq(c.comparisons.technique.status, 'different', `${c.caseId} technique status`);
    }
  });

  check('conflict fields are declared and never compared', () => {
    const a1 = evaluationReport.cases.find(c => c.caseId === 'HATCH-A-WIDTHS-A1');
    eq(a1.conflictFields.length, 3, 'A1 conflict field count');
    for (const field of a1.conflictFields) {
      ok(!Object.prototype.hasOwnProperty.call(a1.comparisons, field), `${field} must not be compared`);
    }
  });

  check('unavailable fields are declared, not silently filled', () => {
    ok(evaluationReport.unavailableFields.includes('autoSplit'), 'autoSplit unavailable');
    ok(evaluationReport.unavailableFields.includes('spacingMm'), 'spacingMm unavailable');
    for (const c of evaluationReport.cases) {
      eq(c.actual.autoSplit, 'unavailable', `${c.caseId} autoSplit`);
    }
  });

  // ── Isolation guarantees ───────────────────────────────────────────────────
  check('engine input carries no Hatch reference material', () => {
    eq(inputAudit.clean, true, 'inputAudit.clean');
    eq((inputAudit.forbiddenKeysFound || []).length, 0, 'forbiddenKeysFound');
    eq((inputAudit.seedCaseIdsFound || []).length, 0, 'seedCaseIdsFound');
  });

  check('parity with the productive Editor call allowed the run', () => {
    eq(parityAudit.runAllowed, true, 'runAllowed');
    ok(['exact', 'equivalent'].includes(parityAudit.parityStatus), `parityStatus ${parityAudit.parityStatus}`);
    eq((parityAudit.missingInHarness || []).length, 0, 'missingInHarness');
    eq((parityAudit.additionalInHarness || []).length, 0, 'additionalInHarness');
  });

  check('captured config declares the productive design size and fabric', () => {
    const cfg = baselineConfig.config || baselineConfig;
    eq(cfg.width_mm, 100, 'width_mm');
    eq(cfg.height_mm, 80, 'height_mm');
  });

  check('coordinate space is declared, not inferred', () => {
    eq(snapshot.coordinateDeclaration.design.coordinateSpace, 'normalized_0_1', 'coordinateSpace');
    eq(evaluationReport.coordinateSystem.space, 'normalized_0_1', 'evaluator coordinateSpace');
    eq(snapshot.selectedRegionSource, 'regions', 'selectedRegionSource');
  });

  const fails = results.filter(r => !r.ok).map(r => `${r.name}: ${r.error}`);
  return {
    name: 'aWidthsStoredBaseline',
    pass: fails.length === 0,
    checks: results.length,
    fails,
  };
}