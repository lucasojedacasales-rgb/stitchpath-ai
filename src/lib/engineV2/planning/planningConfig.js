export const DEFAULT_OBJECT_PLANNING_CONFIG = Object.freeze({
  designWidthMm: 100, designHeightMm: 100, includeBackground: false,
  generateSyntheticOutlines: false, allowExplicitOutlineRegions: true,
  requireDarkStrokeSupportForOutline: true, minimumOutlineDarkStrokeSupport: 0.62,
  minimumPlanningConfidence: 0.72, minimumAutomaticStitchTypeConfidence: 0.78,
  minimumTatamiAreaMm2: 12, minimumSatinWidthMm: 1.0, maximumSatinWidthMm: 7.0,
  maximumRunningDetailWidthMm: 1.6, smallDetailAreaMm2: 5, conservativeMode: true,
});

const issue = (code, path, message) => ({ code, path, message });

export function resolveObjectPlanningConfig(config = {}) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const known = new Set(Object.keys(DEFAULT_OBJECT_PLANNING_CONFIG));
  const resolved = { ...DEFAULT_OBJECT_PLANNING_CONFIG };
  known.forEach(key => { if (Object.hasOwn(source, key)) resolved[key] = source[key]; });
  resolved.extras = Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)));
  return resolved;
}

export function validateObjectPlanningConfig(config = {}) {
  const resolved = resolveObjectPlanningConfig(config);
  const errors = [];
  ['designWidthMm', 'designHeightMm'].forEach(field => {
    if (!Number.isFinite(resolved[field]) || resolved[field] <= 0) errors.push(issue('INVALID_DESIGN_DIMENSION', field, `${field} must be finite and greater than zero.`));
  });
  ['minimumTatamiAreaMm2', 'minimumSatinWidthMm', 'maximumSatinWidthMm', 'maximumRunningDetailWidthMm', 'smallDetailAreaMm2'].forEach(field => {
    if (!Number.isFinite(resolved[field]) || resolved[field] < 0) errors.push(issue('INVALID_PLANNING_MINIMUM', field, `${field} must be a non-negative finite number.`));
  });
  ['minimumOutlineDarkStrokeSupport', 'minimumPlanningConfidence', 'minimumAutomaticStitchTypeConfidence'].forEach(field => {
    if (!Number.isFinite(resolved[field]) || resolved[field] < 0 || resolved[field] > 1) errors.push(issue('INVALID_PLANNING_CONFIDENCE', field, `${field} must be between 0 and 1.`));
  });
  if (resolved.minimumSatinWidthMm >= resolved.maximumSatinWidthMm) errors.push(issue('INVALID_SATIN_WIDTH_RANGE', 'minimumSatinWidthMm', 'minimumSatinWidthMm must be smaller than maximumSatinWidthMm.'));
  ['includeBackground', 'generateSyntheticOutlines', 'allowExplicitOutlineRegions', 'requireDarkStrokeSupportForOutline', 'conservativeMode'].forEach(field => {
    if (typeof resolved[field] !== 'boolean') errors.push(issue('INVALID_PLANNING_BOOLEAN', field, `${field} must be boolean.`));
  });
  return { valid: errors.length === 0, errors, warnings: [], config: resolved };
}
