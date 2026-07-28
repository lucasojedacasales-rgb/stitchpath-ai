/**
 * normalizeSeed.js — Hatch Lab (P0)
 * Produces a new, fully-shaped copy of a seed case. Never mutates the input,
 * never raises confidence, never invents zeros: missing data stays null.
 */

import { SEED_SCHEMA_VERSION, CONFIDENCE_LEVELS, VIABILITY_LEVELS } from './seedSchema.js';

const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
const str = v => (typeof v === 'string' && v.trim().length > 0 ? v : null);

function normalizeEvidence(list) {
  if (!Array.isArray(list)) return [];
  return list.map(ev => ({
    evidenceId: str(ev?.evidenceId),
    type: str(ev?.type),
    reference: str(ev?.reference),
    // Absent extractable is NOT assumed true.
    extractable: typeof ev?.extractable === 'boolean' ? ev.extractable : false,
    description: str(ev?.description),
    sourceReliability: str(ev?.sourceReliability) || 'observed',
  }));
}

/**
 * @param {object} seedCase — never mutated
 * @returns {object} normalized copy
 */
export function normalizeSeedCase(seedCase) {
  const src = seedCase && typeof seedCase === 'object' ? seedCase : {};
  const confidence = CONFIDENCE_LEVELS.includes(src.confidence) ? src.confidence : 'hypothetical';
  const viability = VIABILITY_LEVELS.includes(src.viability) ? src.viability : 'insufficient';

  return {
    seedVersion: str(src.seedVersion) || SEED_SCHEMA_VERSION,
    caseId: str(src.caseId),
    phase: str(src.phase),
    title: str(src.title),
    source: clone(src.source),
    input: clone(src.input),
    dimensionsMm: clone(src.dimensionsMm),
    testedSizeMm: clone(src.testedSizeMm),
    fabric: str(src.fabric),
    configuration: clone(src.configuration),
    observation: clone(src.observation),
    // Absence of an expected result is explicit — it drives "no_expected_result".
    expectedResult: clone(src.expectedResult),
    candidateRules: Array.isArray(src.candidateRules) ? clone(src.candidateRules) : [],
    ruleScope: clone(src.ruleScope),
    exceptions: Array.isArray(src.exceptions) ? clone(src.exceptions) : [],
    evidence: normalizeEvidence(src.evidence),
    confidence,
    viability,
    holdout: src.holdout === true,
    syntheticExample: src.syntheticExample === true,
    _normalized: { schemaVersion: SEED_SCHEMA_VERSION, confidenceRaised: false },
  };
}

export function normalizeSeedCollection(cases) {
  return Array.isArray(cases) ? cases.map(normalizeSeedCase) : [];
}