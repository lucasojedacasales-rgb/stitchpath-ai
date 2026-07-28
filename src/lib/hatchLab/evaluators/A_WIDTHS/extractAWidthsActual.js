/**
 * extractAWidthsActual.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Reads the requested data points from an ALREADY GENERATED engine result,
 * reconciling region and plan provenance. `0` and `false` are values.
 */

import { makeField, unavailableField } from './evaluatorSchema.js';
import { resolveFieldSources, numericNormalizer } from './resolveFieldSources.js';
import { normalizeTechniqueValue } from './normalizeTechnique.js';
import { buildUnderlayFields } from './normalizeUnderlay.js';
import { KNOWN_REGION_KEYS, UNAVAILABLE_ENGINE_FIELDS } from './verifiedFieldMap.js';
import { isContourLike } from './regionRole.js';

const DUPLICATED_PLAN_NOTE = 'Several plan entries share this regionId; plan-sourced values are marked unavailable instead of taking one arbitrarily.';

function emptyActual(reason) {
  return {
    internalCandidateKey: null, regionId: null, sourceIndex: null, identityStatus: null,
    regionRole: unavailableField(reason),
    geometry: null,
    widthMm: unavailableField(reason, null, 'mm'),
    heightMm: unavailableField(reason, null, 'mm'),
    technique: unavailableField(reason),
    densityMm: unavailableField(reason, null, 'mm'),
    planDensityMm: unavailableField(reason, null, 'mm'),
    underlay: buildUnderlayFields({}),
    spacing: {
      spacingMode: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMode),
      spacingMm: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMm, null, 'mm'),
    },
    pullCompensationMm: unavailableField(reason, null, 'mm'),
    autoSplit: unavailableField(UNAVAILABLE_ENGINE_FIELDS.autoSplit),
    stitchAngleDeg: unavailableField(reason, null, 'degrees'),
    planStatus: 'missing',
    unknownFields: [],
    unavailableFields: [],
    conflictFields: [],
  };
}

export function extractAWidthsActual({ candidate = null, planEntry = null, planStatus = 'missing', options = {} } = {}) {
  if (!candidate) return emptyActual('No region assigned to this case.');
  const { region, metrics } = candidate;
  const planNote = planStatus === 'duplicated' ? { forcedAvailability: 'unavailable', reason: DUPLICATED_PLAN_NOTE } : {};
  const planUsable = planStatus === 'single' && planEntry !== null;

  const widthMm = makeField({
    rawValue: metrics.boundingWidthMm, normalizedValue: metrics.boundingWidthMm,
    sourceField: `${metrics.pointsSourceField} → bounding box`, availability: 'available', derived: true, unit: 'mm',
    reason: 'measurementMethod = bounding_box_width; valid as the main measurement for straight bars only.',
  });
  const heightMm = makeField({
    rawValue: metrics.boundingHeightMm, normalizedValue: metrics.boundingHeightMm,
    sourceField: `${metrics.pointsSourceField} → bounding box`, availability: 'available', derived: true, unit: 'mm',
    reason: 'Bounding-box height.',
  });

  const alternatives = Array.isArray(options.alternativeFields?.technique) ? options.alternativeFields.technique : [];
  const technique = resolveFieldSources({
    fieldName: 'technique',
    sources: [
      { sourceField: 'region.stitch_type', present: region.stitch_type !== undefined, rawValue: region.stitch_type },
      { sourceField: 'plan.sequence[].stitchType', present: (planUsable || planStatus === 'duplicated') && (planEntry?.stitchType !== undefined || planStatus === 'duplicated'), rawValue: planEntry?.stitchType, ...planNote },
      ...alternatives.map(k => ({ sourceField: `region.${k}`, present: region[k] !== undefined, rawValue: region[k] })),
    ],
    normalizer: normalizeTechniqueValue,
    tolerance: null,
    unavailableReason: 'No technique field present in the result.',
  });

  const densityMm = resolveFieldSources({
    fieldName: 'densityMm',
    sources: [
      { sourceField: 'region.density', present: region.density !== undefined, rawValue: region.density },
      { sourceField: 'plan.sequence[].density', present: (planUsable || planStatus === 'duplicated') && (planEntry?.density !== undefined || planStatus === 'duplicated'), rawValue: planEntry?.density, ...planNote },
    ],
    normalizer: numericNormalizer('Engine density: row spacing (fill) / column spacing (satin) in mm. Its equivalence with the Hatch spacing column is NOT verified.'),
    tolerance: options.densityToleranceMm ?? 0.001,
    unit: 'mm',
    unavailableReason: 'No density present in the result.',
  });

  const planDensityMm = resolveFieldSources({
    fieldName: 'planDensityMm',
    sources: [{ sourceField: 'plan.sequence[].density', present: planUsable ? planEntry.density !== undefined : planStatus === 'duplicated', rawValue: planUsable ? planEntry.density : undefined, ...planNote }],
    normalizer: numericNormalizer('Planner density in mm, kept separate from region.density.'),
    tolerance: options.densityToleranceMm ?? 0.001,
    unit: 'mm',
    unavailableReason: 'The plan declares no density for this region.',
  });

  const stitchAngleDeg = resolveFieldSources({
    fieldName: 'stitchAngleDeg',
    sources: [
      { sourceField: 'region.angle', present: region.angle !== undefined, rawValue: region.angle },
      { sourceField: 'region.fill_angle', present: region.fill_angle !== undefined, rawValue: region.fill_angle },
      { sourceField: 'plan.sequence[].optimalAngle', present: (planUsable || planStatus === 'duplicated') && (planEntry?.optimalAngle !== undefined || planStatus === 'duplicated'), rawValue: planEntry?.optimalAngle, ...planNote },
    ],
    normalizer: numericNormalizer('Stitch angle in degrees; 0 is a valid value and never becomes unavailable.'),
    tolerance: options.angleToleranceDeg ?? 0,
    unit: 'degrees',
    unavailableReason: 'No stitch angle present in the result.',
  });

  const pullCompensationMm = resolveFieldSources({
    fieldName: 'pullCompensationMm',
    sources: [{ sourceField: 'region.pull_compensation', present: region.pull_compensation !== undefined, rawValue: region.pull_compensation }],
    normalizer: numericNormalizer('Pull compensation in mm; 0 is a valid value.'),
    tolerance: options.valueToleranceMm ?? 0.01,
    unit: 'mm',
    unavailableReason: 'No pull compensation present in the result.',
  });

  const actual = {
    internalCandidateKey: candidate.internalCandidateKey,
    regionId: candidate.declaredRegionId,
    sourceIndex: candidate.sourceIndex,
    identityStatus: candidate.identityStatus,
    regionRole: makeField({
      rawValue: region.type ?? region.region_class ?? null,
      normalizedValue: isContourLike(region) ? 'contour_or_auxiliary' : 'main_object_candidate',
      sourceField: 'region.type / region.region_class / region.parentRegionId',
      availability: region.type != null || region.region_class != null || region.parentRegionId != null ? 'available' : 'unknown',
      reason: 'Fill objects carry no type field; absence of markers only means "not marked as contour".',
    }),
    geometry: metrics,
    widthMm,
    heightMm,
    technique,
    densityMm,
    planDensityMm,
    underlay: buildUnderlayFields({ region, planEntry: planUsable ? planEntry : null, planStatus, options }),
    spacing: {
      spacingMode: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMode),
      spacingMm: unavailableField(`${UNAVAILABLE_ENGINE_FIELDS.spacingMm} region.density is reported as densityMm and is never converted into spacing; the equivalence remains pending validation.`, null, 'mm'),
    },
    pullCompensationMm,
    autoSplit: unavailableField(UNAVAILABLE_ENGINE_FIELDS.autoSplit),
    stitchAngleDeg,
    planStatus,
    unknownFields: Object.keys(region).filter(k => !KNOWN_REGION_KEYS.includes(k)).sort(),
    unavailableFields: [],
    conflictFields: [],
  };

  const namedFields = [
    ['widthMm', actual.widthMm], ['heightMm', actual.heightMm], ['technique', actual.technique],
    ['densityMm', actual.densityMm], ['planDensityMm', actual.planDensityMm],
    ['pullCompensationMm', actual.pullCompensationMm], ['stitchAngleDeg', actual.stitchAngleDeg],
    ['underlayEnabled', actual.underlay.underlayEnabled], ['underlayType', actual.underlay.primaryUnderlay],
    ['underlayDensityMm', actual.underlay.underlayDensityMm], ['underlayAngleDeg', actual.underlay.underlayAngleDeg],
    ['secondaryUnderlay', actual.underlay.secondaryUnderlay], ['secondaryLengthMm', actual.underlay.secondaryLengthMm],
    ['secondarySpacingMm', actual.underlay.secondarySpacingMm], ['primaryLengthMm', actual.underlay.primaryLengthMm],
    ['spacingMode', actual.spacing.spacingMode], ['spacingMm', actual.spacing.spacingMm], ['autoSplit', actual.autoSplit],
  ];
  actual.unavailableFields = namedFields.filter(([, f]) => f.availability === 'unavailable').map(([k]) => k);
  actual.conflictFields = namedFields.filter(([, f]) => f.availability === 'conflict').map(([k]) => k);
  actual.namedFieldKeys = namedFields.map(([k]) => k);
  return actual;
}

export { emptyActual };