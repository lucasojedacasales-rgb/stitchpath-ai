/**
 * evaluateAWidthsResult.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 *
 * Pure, deterministic evaluator over an ALREADY GENERATED engine result.
 * It never runs the engine, never applies rules and never writes expectedResult.
 */

import { EVALUATOR_VERSION, DEFAULT_OPTIONS, MEASUREMENT_METHOD } from './evaluatorSchema.js';
import { resolveCoordinateSystem, createPointConverter } from './coordinateNormalizer.js';
import { measureRegion } from './geometryMeasurement.js';
import { matchCaseToRegion } from './regionMatcher.js';
import { extractAWidthsActual } from './extractAWidthsActual.js';
import { buildReference, compareAWidthsReference } from './compareAWidthsReference.js';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function pickRegions(result) {
  const sources = [
    ['result.regions', result?.regions],
    ['result.optimizedRegions', result?.optimizedRegions],
    ['result.optimized.optimizedSequence', result?.optimized?.optimizedSequence],
    ['result.objects', result?.objects],
  ];
  for (const [sourceField, value] of sources) {
    if (Array.isArray(value) && value.length > 0) return { regions: value, sourceField };
  }
  const empty = sources.find(([, v]) => Array.isArray(v));
  return { regions: [], sourceField: empty ? empty[0] : null };
}

function planIndex(result) {
  const seq = result?.plan?.sequence;
  const map = new Map();
  if (Array.isArray(seq)) for (const entry of seq) if (isObject(entry) && entry.regionId != null) map.set(entry.regionId, entry);
  return map;
}

export function evaluateAWidthsResult({ result = null, seedCases = null, design = null, options = null } = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(isObject(options) ? options : {}) };
  const warnings = [];

  const shell = {
    evaluatorVersion: EVALUATOR_VERSION,
    generatedAt: opts.generatedAt ?? null,
    status: 'invalid_input',
    inputSummary: { regionSourceField: null, regionCount: 0, planEntryCount: 0, seedCaseCount: 0, measurableRegionCount: 0, measurementMethod: MEASUREMENT_METHOD },
    coordinateSystem: null,
    fieldCoverage: {},
    matchCoverage: { matched: 0, ambiguous: 0, unmatched: 0, unavailable: 0 },
    cases: [],
    unknownFields: [],
    unavailableFields: [],
    warnings,
    conclusion: 'invalid_input',
  };

  if (!isObject(result)) {
    warnings.push('`result` must be an object with an already generated engine result.');
    return shell;
  }
  if (!Array.isArray(seedCases) || seedCases.length === 0) {
    warnings.push('`seedCases` must be a non-empty array of A_WIDTHS seed cases.');
    return shell;
  }
  const usableCases = seedCases.filter(c => isObject(c) && typeof c.caseId === 'string' && c.caseId.length > 0);
  if (usableCases.length !== seedCases.length) warnings.push(`${seedCases.length - usableCases.length} seed case(s) without a valid caseId were ignored.`);
  if (usableCases.length === 0) {
    warnings.push('No seed case carries a valid caseId.');
    return shell;
  }

  const { regions, sourceField } = pickRegions(result);
  const plans = planIndex(result);
  const coordinateSystem = resolveCoordinateSystem({ design, result, options: opts });
  const convert = createPointConverter(coordinateSystem);

  const seenIds = new Set();
  const duplicated = new Set();
  for (const r of regions) {
    const id = isObject(r) ? r.id : null;
    if (id == null) continue;
    if (seenIds.has(id)) duplicated.add(id); else seenIds.add(id);
  }
  if (duplicated.size > 0) warnings.push(`Duplicated region ids in the result: ${[...duplicated].sort().join(', ')}. Matching stays traceable but the selected id is not unique.`);

  const measured = [];
  if (convert) {
    regions.forEach((region, index) => {
      if (!isObject(region)) { warnings.push(`Element ${index} of ${sourceField} is not an object; ignored.`); return; }
      const metrics = measureRegion(region, convert);
      if (metrics) measured.push({ region, metrics, index });
    });
  } else {
    warnings.push(`Coordinate space unavailable: ${coordinateSystem.reason} No geometric measurement is performed.`);
  }

  const unknownFields = new Set();
  const unavailableFields = new Set();
  const coverageCounters = {};
  const cases = usableCases.map(seedCase => {
    const match = convert
      ? matchCaseToRegion(seedCase, measured, opts)
      : { status: 'unavailable', selectedRegionId: null, candidateRegionIds: [], score: null, centerDistanceMm: null, widthDifferenceMm: null, heightDifferenceMm: null, reasons: ['Coordinate space unavailable.'], tolerancesUsed: null, matchPolicy: opts.matchPolicy, target: null };

    const selected = match.status === 'matched'
      ? measured.find(m => m.region.id === match.selectedRegionId) || null
      : null;
    const planEntry = selected ? plans.get(selected.region.id) ?? null : null;
    const actual = extractAWidthsActual({ region: selected?.region ?? null, planEntry, metrics: selected?.metrics ?? null, options: opts });
    const reference = buildReference(seedCase);
    const comparisons = compareAWidthsReference({ reference, actual, matchStatus: match.status, options: opts });

    actual.unknownFields.forEach(f => unknownFields.add(f));
    actual.unavailableFields.forEach(f => unavailableFields.add(f));
    for (const key of ['technique', 'pullCompensationMm', 'stitchAngleDeg', 'autoSplit']) {
      const field = key === 'technique' ? actual.technique : actual[key];
      coverageCounters[key] = coverageCounters[key] || { available: 0, unavailable: 0, unknown: 0 };
      coverageCounters[key][field.availability] += 1;
    }
    for (const [key, field] of [['spacingMm', actual.spacing.spacingMm], ['spacingMode', actual.spacing.spacingMode], ['density', actual.spacing.density], ['underlayType', actual.underlay.primaryUnderlay], ['underlayEnabled', actual.underlay.underlayEnabled]]) {
      coverageCounters[key] = coverageCounters[key] || { available: 0, unavailable: 0, unknown: 0 };
      coverageCounters[key][field.availability] += 1;
    }

    const caseWarnings = [];
    if (match.status === 'ambiguous') caseWarnings.push('Ambiguous match: no value is attributed to this case.');
    if (match.status === 'unmatched') caseWarnings.push('No region matched this case within the declared tolerances.');
    if (reference.geometryClass !== 'barra_recta') caseWarnings.push('geometryClass is not barra_recta: bounding_box_width must not be used as the main width measurement.');

    return {
      caseId: seedCase.caseId,
      match,
      reference,
      actual,
      comparisons,
      warnings: caseWarnings,
      status: match.status,
    };
  });

  const matchCoverage = { matched: 0, ambiguous: 0, unmatched: 0, unavailable: 0 };
  for (const c of cases) matchCoverage[c.status] += 1;

  let conclusion;
  if (coordinateSystem.status !== 'resolved') conclusion = 'inconclusive';
  else if (matchCoverage.matched === 0 && matchCoverage.ambiguous > 0) conclusion = 'ambiguous';
  else if (matchCoverage.matched === 0) conclusion = 'no_matches';
  else if (matchCoverage.matched === cases.length) conclusion = 'evaluated';
  else conclusion = 'partial';

  return {
    ...shell,
    status: conclusion,
    inputSummary: {
      regionSourceField: sourceField,
      regionCount: regions.length,
      planEntryCount: plans.size,
      seedCaseCount: usableCases.length,
      measurableRegionCount: measured.length,
      measurementMethod: MEASUREMENT_METHOD,
      optionsUsed: opts,
    },
    coordinateSystem,
    fieldCoverage: coverageCounters,
    matchCoverage,
    cases,
    unknownFields: [...unknownFields].sort(),
    unavailableFields: [...unavailableFields].sort(),
    warnings,
    conclusion,
  };
}