import { describe, expect, it } from 'vitest';
import { DEFAULT_TECHNICAL_PLANNING_CONFIG, resolveTechnicalPlanningConfig, validateTechnicalPlanningConfig } from '../index.js';
import { createMaterialProfilesFixture } from '../fixtures/materialProfilesFixture.js';

describe('Phase 7 technical configuration', () => {
  it('resolves the documented balanced defaults', () => expect(resolveTechnicalPlanningConfig()).toMatchObject(DEFAULT_TECHNICAL_PLANNING_CONFIG));
  it('uses generic medium woven by default', () => expect(resolveTechnicalPlanningConfig().materialProfile).toBe('generic_medium_woven'));
  it.each([['fast', 4], ['balanced', 8], ['detailed', 12]])('applies %s candidate resolution', (profile, count) => expect(resolveTechnicalPlanningConfig({ profile }).entryExit.maximumCandidatesPerObject).toBe(count));
  it('preserves an explicit candidate limit', () => expect(resolveTechnicalPlanningConfig({ profile: 'fast', entryExit: { maximumCandidatesPerObject: 6 } }).entryExit.maximumCandidatesPerObject).toBe(6));
  it('falls back to balanced deterministically', () => expect(resolveTechnicalPlanningConfig({ profile: 'mystery' })).toMatchObject({ profile: 'balanced', requestedProfile: 'mystery', profileFallbackApplied: true }));
  it('detects invalid profile requests', () => expect(validateTechnicalPlanningConfig({ profile: 'mystery' }).errors.some(item => item.code === 'INVALID_TECHNICAL_PROFILE')).toBe(true));
  it('moves unknown root fields to extras', () => expect(resolveTechnicalPlanningConfig({ futureOption: 7 }).extras.futureOption).toBe(7));
  it('detects unsupported root fields', () => expect(validateTechnicalPlanningConfig({ futureOption: 7 }).errors.some(item => item.code === 'UNSUPPORTED_TECHNICAL_CONFIG_FIELD')).toBe(true));
  it('accepts a valid custom material profile', () => expect(validateTechnicalPlanningConfig({ materialProfile: createMaterialProfilesFixture().custom }).valid).toBe(true));
  it('rejects unknown material profiles', () => expect(validateTechnicalPlanningConfig({ materialProfile: 'missing' }).errors.some(item => item.code === 'UNKNOWN_MATERIAL_PROFILE')).toBe(true));
  it.each([['tatami', 'minimumStitchLengthMm', 5, 'maximumStitchLengthMm', 4], ['running', 'minimumStitchLengthMm', 4, 'maximumStitchLengthMm', 3]])('rejects invalid %s length ranges', (section, minKey, min, maxKey, max) => expect(validateTechnicalPlanningConfig({ [section]: { [minKey]: min, [maxKey]: max } }).errors.some(item => item.code === 'INVALID_STITCH_LENGTH_RANGE')).toBe(true));
  it('rejects invalid satin width range', () => expect(validateTechnicalPlanningConfig({ satin: { minimumWidthMm: 8, maximumWidthMm: 7 } }).errors.some(item => item.code === 'INVALID_SATIN_WIDTH_RANGE')).toBe(true));
  it.each([NaN, Infinity, -1])('rejects non-finite or negative values %j', value => expect(validateTechnicalPlanningConfig({ tatami: { spacingMm: value } }).errors.some(item => item.code === 'INVALID_TECHNICAL_NUMERIC_VALUE')).toBe(true));
  it.each(['generatePhysicalStitches', 'generatePhysicalUnderlay', 'selectFinalEntryExitPair', 'globalSequencing', 'travelOptimization', 'machineAdaptation'])('forbids enabling %s', field => expect(validateTechnicalPlanningConfig({ [field]: true }).errors.some(item => item.code === 'FORBIDDEN_TECHNICAL_STAGE_ENABLEMENT')).toBe(true));
});
