/**
 * normalizeSeed.js — Hatch Lab (P0.1)
 * Safe normalization. NEVER makes an invalid case valid:
 *  - required fields (seedVersion, caseId, phase, confidence, source) are
 *    NEVER auto-filled — absent stays null;
 *  - only optional fields get safe defaults;
 *  - confidence is never raised;
 *  - missing data stays null, never an invented zero.
 *
 * Correct sequence: validate original → normalize only valid input → keep an
 * explicit validation result. Use prepareSeedCase for that flow.
 */

import { CONFIDENCE_LEVELS, VIABILITY_LEVELS } from './seedSchema.js';
import { validateSeedCase } from './validateSeed.js';

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
 * @returns {object} normalized deep copy. Required fields are NOT auto-filled.
 */
export function normalizeSeedCase(seedCase) {
  const src = seedCase && typeof seedCase === 'object' ? seedCase : {};
  return {
    // required fields: null when absent/invalid — never invented
    seedVersion: str(src.seedVersion),
    caseId: str(src.caseId),
    phase: str(src.phase),
    confidence: CONFIDENCE_LEVELS.includes(src.confidence) ? src.confidence : null,
    source: clone(src.source),
    // optional fields: safe defaults allowed
    title: str(src.title),
    input: clone(src.input),
    dimensionsMm: clone(src.dimensionsMm),
    testedSizeMm: clone(src.testedSizeMm),
    fabric: str(src.fabric),
    configuration: clone(src.configuration),
    observation: clone(src.observation),
    expectedResult: clone(src.expectedResult),
    candidateRules: Array.isArray(src.candidateRules) ? clone(src.candidateRules) : [],
    ruleScope: clone(src.ruleScope),
    exceptions: Array.isArray(src.exceptions) ? clone(src.exceptions) : [],
    evidence: normalizeEvidence(src.evidence),
    viability: VIABILITY_LEVELS.includes(src.viability) ? src.viability : 'insufficient',
    holdout: src.holdout === true,
    syntheticExample: src.syntheticExample === true,
    _normalized: { confidenceRaised: false, requiredFieldsAutoFilled: false },
  };
}

/**
 * Validate-first flow: an invalid case is never normalized into use.
 * @returns {{ validation: object, normalized: object|null }}
 */
export function prepareSeedCase(seedCase) {
  const validation = validateSeedCase(seedCase);
  return { validation, normalized: validation.valid ? normalizeSeedCase(seedCase) : null };
}

export function normalizeSeedCollection(cases) {
  return Array.isArray(cases) ? cases.map(normalizeSeedCase) : [];
}