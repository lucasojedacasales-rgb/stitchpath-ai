/**
 * regionSourceSelector.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.2)
 * Explicit region-collection selection. Never picks a collection silently when
 * more than one is declared, never mixes stages, and never confuses
 * "zero regions" with "source does not exist".
 */

import { REGION_SOURCES } from './evaluatorSchema.js';

const readSource = (result, key) => {
  if (key === 'optimizedSequence') return result?.optimized?.optimizedSequence;
  return result?.[key];
};

/**
 * @returns {{status:'resolved'|'ambiguous'|'unavailable', selectedRegionSource:string|null,
 *   sourceField:string|null, regions:Array, availableRegionSources:string[],
 *   declaredRegionSources:string[], emptyRegionSources:string[],
 *   invalidTypeRegionSources:string[], countsByRegionSource:object,
 *   error:string|null, reason:string}}
 */
export function selectRegionSource({ result = null, options = {} } = {}) {
  const countsByRegionSource = {};
  const declaredRegionSources = [];   // present AND an array (empty or not)
  const availableRegionSources = [];  // present, an array, non-empty
  const emptyRegionSources = [];
  const invalidTypeRegionSources = [];

  for (const key of Object.keys(REGION_SOURCES)) {
    const value = readSource(result, key);
    if (Array.isArray(value)) {
      countsByRegionSource[key] = value.length;
      declaredRegionSources.push(key);
      if (value.length > 0) availableRegionSources.push(key); else emptyRegionSources.push(key);
    } else if (value !== undefined && value !== null) {
      countsByRegionSource[key] = null;
      invalidTypeRegionSources.push(key);
    }
  }

  const base = {
    selectedRegionSource: null, sourceField: null, regions: [],
    availableRegionSources, declaredRegionSources, emptyRegionSources,
    invalidTypeRegionSources, countsByRegionSource, error: null,
  };
  const requested = options.regionSource;

  if (requested != null) {
    if (!Object.keys(REGION_SOURCES).includes(requested)) {
      return { ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE', reason: `options.regionSource "${requested}" is not one of ${Object.keys(REGION_SOURCES).join(', ')}.` };
    }
    const value = readSource(result, requested);
    if (value === undefined || value === null) {
      return { ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE', reason: `options.regionSource "${requested}" (${REGION_SOURCES[requested]}) does not exist in the result.` };
    }
    if (!Array.isArray(value)) {
      return { ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE', reason: `options.regionSource "${requested}" (${REGION_SOURCES[requested]}) exists but is not an array (incompatible type).` };
    }
    return {
      ...base, status: 'resolved', selectedRegionSource: requested, sourceField: REGION_SOURCES[requested], regions: value,
      reason: value.length === 0
        ? `Region collection declared explicitly by options.regionSource = "${requested}" and present but empty; zero regions is a valid engine result.`
        : `Region collection declared explicitly by options.regionSource = "${requested}".`,
    };
  }

  if (availableRegionSources.length > 1) {
    return {
      ...base, status: 'ambiguous', error: 'AMBIGUOUS_REGION_SOURCE',
      reason: `${availableRegionSources.length} non-empty region collections are present (${availableRegionSources.map(k => `${k}=${countsByRegionSource[k]}`).join(', ')}); options.regionSource must declare which one to use. No automatic selection is made.`,
    };
  }

  if (availableRegionSources.length === 1) {
    const only = availableRegionSources[0];
    return {
      ...base, status: 'resolved', selectedRegionSource: only, sourceField: REGION_SOURCES[only], regions: readSource(result, only),
      reason: `Only one non-empty region collection exists ("${only}"); it is used and recorded.`,
    };
  }

  if (emptyRegionSources.length > 1) {
    return {
      ...base, status: 'ambiguous', error: 'AMBIGUOUS_REGION_SOURCE',
      reason: `${emptyRegionSources.length} region collections are declared as empty arrays (${emptyRegionSources.join(', ')}) and none has regions; options.regionSource must declare which one is being evaluated. No automatic selection is made.`,
    };
  }

  if (emptyRegionSources.length === 1) {
    const only = emptyRegionSources[0];
    return {
      ...base, status: 'resolved', selectedRegionSource: only, sourceField: REGION_SOURCES[only], regions: [],
      reason: `The only declared region collection ("${only}") is an empty array; zero regions is a valid engine result, not a missing source.`,
    };
  }

  return {
    ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE',
    reason: invalidTypeRegionSources.length
      ? `The result declares no region array; these fields exist with an incompatible type: ${invalidTypeRegionSources.join(', ')}.`
      : 'The result declares no region collection.',
  };
}