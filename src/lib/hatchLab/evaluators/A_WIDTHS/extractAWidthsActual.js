/**
 * extractAWidthsActual.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A)
 * Reads the ten requested data points from an ALREADY GENERATED engine result.
 * `0` and `false` are values; `value || null` is never used.
 */

import { makeField, unavailableField } from './evaluatorSchema.js';
import { normalizeTechnique } from './normalizeTechnique.js';
import { normalizeUnderlay } from './normalizeUnderlay.js';
import { KNOWN_REGION_KEYS, UNAVAILABLE_ENGINE_FIELDS } from './verifiedFieldMap.js';
import { isContourLike } from './regionMatcher.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function numericField(value, sourceField, reason) {
  const n = num(value);
  if (n === null) return unavailableField(`${reason} (absent or non-numeric; absence is not 0).`, sourceField);
  return makeField({ rawValue: value, normalizedValue: n, sourceField, availability: 'available', reason });
}

export function extractAWidthsActual({ region = null, planEntry = null, metrics = null, options = {} } = {}) {
  if (!region) {
    return {
      regionId: null, regionRole: unavailableField('No region matched.'),
      geometry: null,
      widthMm: unavailableField('No region matched.'),
      heightMm: unavailableField('No region matched.'),
      technique: unavailableField('No region matched.'),
      underlay: normalizeUnderlay({}),
      spacing: {
        spacingMode: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMode),
        spacingMm: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMm),
        density: unavailableField('No region matched.'),
        densityUnit: null,
      },
      pullCompensationMm: unavailableField('No region matched.'),
      autoSplit: unavailableField(UNAVAILABLE_ENGINE_FIELDS.autoSplit),
      stitchAngleDeg: unavailableField('No region matched.'),
      unknownFields: [],
      unavailableFields: Object.keys(UNAVAILABLE_ENGINE_FIELDS),
    };
  }

  const width = metrics
    ? makeField({ rawValue: metrics.boundingWidthMm, normalizedValue: metrics.boundingWidthMm, sourceField: `${metrics.pointsSourceField} → bounding box`, availability: 'available', derived: true, reason: 'measurementMethod = bounding_box_width; valid as the main measurement for straight bars only.' })
    : unavailableField('The region has no measurable geometry.');
  const height = metrics
    ? makeField({ rawValue: metrics.boundingHeightMm, normalizedValue: metrics.boundingHeightMm, sourceField: `${metrics.pointsSourceField} → bounding box`, availability: 'available', derived: true, reason: 'Bounding-box height.' })
    : unavailableField('The region has no measurable geometry.');

  const densityField = numericField(region.density, 'region.density', 'Engine density: row spacing (fill) / column spacing (satin) in mm.');
  const spacingMm = options.treatDensityAsSpacing === true && densityField.availability === 'available'
    ? makeField({ rawValue: region.density, normalizedValue: region.density, sourceField: 'region.density', availability: 'available', derived: true, reason: 'spacingMm = region.density under the explicit option treatDensityAsSpacing; identity formula, no 1/density conversion. Equivalence with the Hatch spacing column is NOT verified.' })
    : unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMm, 'region.density');

  const angleSource = region.angle !== undefined && region.angle !== null ? ['region.angle', region.angle]
    : region.fill_angle !== undefined && region.fill_angle !== null ? ['region.fill_angle', region.fill_angle]
      : planEntry && planEntry.optimalAngle !== undefined && planEntry.optimalAngle !== null ? ['plan.sequence[].optimalAngle', planEntry.optimalAngle]
        : [null, undefined];

  const unknownFields = Object.keys(region).filter(k => !KNOWN_REGION_KEYS.includes(k)).sort();

  const actual = {
    regionId: region.id ?? null,
    regionRole: makeField({
      rawValue: region.type ?? region.region_class ?? null,
      normalizedValue: isContourLike(region) ? 'contour_or_auxiliary' : 'main_object_candidate',
      sourceField: 'region.type / region.region_class / region.parentRegionId',
      availability: region.type != null || region.region_class != null || region.parentRegionId != null ? 'available' : 'unknown',
      reason: 'Fill objects carry no type field; absence of markers only means "not marked as contour".',
    }),
    geometry: metrics,
    widthMm: width,
    heightMm: height,
    technique: normalizeTechnique({ region, planEntry, options }),
    underlay: normalizeUnderlay({ region, planEntry }),
    spacing: {
      spacingMode: unavailableField(UNAVAILABLE_ENGINE_FIELDS.spacingMode),
      spacingMm,
      density: densityField,
      densityUnit: densityField.availability === 'available' ? 'mm_row_or_column_spacing' : null,
    },
    pullCompensationMm: numericField(region.pull_compensation, 'region.pull_compensation', 'Pull compensation in mm; 0 is a valid value.'),
    autoSplit: unavailableField(UNAVAILABLE_ENGINE_FIELDS.autoSplit),
    stitchAngleDeg: numericField(angleSource[1], angleSource[0], 'Stitch angle in degrees; 0 is a valid value and is never turned into unavailable.'),
    unknownFields,
    unavailableFields: [],
  };

  actual.unavailableFields = [
    ['spacingMode', actual.spacing.spacingMode],
    ['spacingMm', actual.spacing.spacingMm],
    ['density', actual.spacing.density],
    ['autoSplit', actual.autoSplit],
    ['pullCompensationMm', actual.pullCompensationMm],
    ['stitchAngleDeg', actual.stitchAngleDeg],
    ['technique', actual.technique],
    ['underlayType', actual.underlay.primaryUnderlay],
    ['underlayEnabled', actual.underlay.underlayEnabled],
    ['underlayLengthMm', actual.underlay.primaryLengthMm],
    ['secondaryUnderlay', actual.underlay.secondaryUnderlay],
    ['widthMm', actual.widthMm],
    ['heightMm', actual.heightMm],
  ].filter(([, f]) => f.availability === 'unavailable').map(([k]) => k);

  return actual;
}