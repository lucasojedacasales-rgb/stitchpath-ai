/**
 * regionSourceSelector.js — Hatch Lab / evaluators / A_WIDTHS (P0.3A.1)
 * Explicit region-collection selection. Never picks the first non-empty
 * collection when more than one exists, and never mixes stages.
 */

import { REGION_SOURCES } from './evaluatorSchema.js';

const readSource = (result, key) => {
  if (key === 'optimizedSequence') return result?.optimized?.optimizedSequence;
  return result?.[key];
};

/**
 * @returns {{status:'resolved'|'ambiguous'|'unavailable', selectedRegionSource:string|null,
 *   sourceField:string|null, regions:Array, availableRegionSources:string[],
 *   countsByRegionSource:object, error:string|null, reason:string}}
 */
export function selectRegionSource({ result = null, options = {} } = {}) {
  const countsByRegionSource = {};
  const availableRegionSources = [];
  for (const key of Object.keys(REGION_SOURCES)) {
    const value = readSource(result, key);
    if (Array.isArray(value)) {
      countsByRegionSource[key] = value.length;
      if (value.length > 0) availableRegionSources.push(key);
    } else if (value !== undefined && value !== null) {
      countsByRegionSource[key] = null;
    }
  }

  const base = { selectedRegionSource: null, sourceField: null, regions: [], availableRegionSources, countsByRegionSource, error: null };
  const requested = options.regionSource;

  if (requested != null) {
    if (!Object.keys(REGION_SOURCES).includes(requested)) {
      return { ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE', reason: `options.regionSource "${requested}" is not one of ${Object.keys(REGION_SOURCES).join(', ')}.` };
    }
    const value = readSource(result, requested);
    if (!Array.isArray(value) || value.length === 0) {
      return { ...base, status: 'unavailable', error: 'REGION_SOURCE_UNAVAILABLE', reason: `options.regionSource "${requested}" (${REGION_SOURCES[requested]}) is absent or empty in the result.` };
    }
    return { ...base, status: 'resolved', selectedRegionSource: requested, sourceField: REGION_SOURCES[requested], regions: value, reason: `Region collection declared explicitly by options.regionSource = "${requested}".` };
  }

  if (availableRegionSources.length === 0) {
    const declaredEmpty = Object.keys(countsByRegionSource).length > 0;
    return {
      ...base,
      status: declaredEmpty ? 'resolved' : 'unavailable',
      selectedRegionSource: declaredEmpty ? (Object.keys(countsByRegionSource)[0]) : null,
      sourceField: declaredEmpty ? REGION_SOURCES[Object.keys(countsByRegionSource)[0]] : null,
      regions: [],
      error: declaredEmpty ? null : 'REGION_SOURCE_UNAVAILABLE',
      reason: declaredEmpty ? 'All declared region collections are empty; nothing to measure.' : 'The result declares no region collection.',
    };
  }

  if (availableRegionSources.length > 1) {
    return {
      ...base, status: 'ambiguous', error: 'AMBIGUOUS_REGION_SOURCE',
      reason: `${availableRegionSources.length} non-empty region collections are present (${availableRegionSources.map(k => `${k}=${countsByRegionSource[k]}`).join(', ')}); options.regionSource must declare which one to use. No automatic selection is made.`,
    };
  }

  const only = availableRegionSources[0];
  return {
    ...base, status: 'resolved', selectedRegionSource: only, sourceField: REGION_SOURCES[only],
    regions: readSource(result, only),
    reason: `Only one non-empty region collection exists ("${only}"); it is used and recorded.`,
  };
}