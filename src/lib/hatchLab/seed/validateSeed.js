/**
 * validateSeed.js — Hatch Lab (P0)
 * Pure validator for seed cases. Never mutates its input.
 */

import {
  SEED_SCHEMA_VERSION, PHASES, CONFIDENCE_LEVELS, VIABILITY_LEVELS,
  EVIDENCE_TYPES, SOURCE_RELIABILITY, NON_EXTRACTABLE_TYPES, VERIFIED_PARSERS,
} from './seedSchema.js';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

function validatePositiveDims(dims, field, errors) {
  if (dims == null) return;
  if (!isObject(dims)) { errors.push({ field, code: 'INVALID_TYPE', message: `${field} must be an object` }); return; }
  for (const k of ['width', 'height']) {
    const v = dims[k];
    if (v == null) { errors.push({ field: `${field}.${k}`, code: 'MISSING', message: `${field}.${k} is required when ${field} is present` }); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      errors.push({ field: `${field}.${k}`, code: 'NOT_POSITIVE', message: `${field}.${k} must be a positive number` });
    }
  }
}

function validateEvidence(list, errors, warnings) {
  if (!Array.isArray(list)) { errors.push({ field: 'evidence', code: 'INVALID_TYPE', message: 'evidence must be an array' }); return; }
  const seenIds = new Set();
  const seenRefs = new Set();
  list.forEach((ev, i) => {
    const at = `evidence[${i}]`;
    if (!isObject(ev)) { errors.push({ field: at, code: 'INVALID_TYPE', message: 'evidence item must be an object' }); return; }
    if (!isNonEmptyString(ev.evidenceId)) errors.push({ field: `${at}.evidenceId`, code: 'EMPTY', message: 'evidenceId is required' });
    else if (seenIds.has(ev.evidenceId)) errors.push({ field: `${at}.evidenceId`, code: 'DUPLICATE_EVIDENCE', message: `duplicated evidenceId "${ev.evidenceId}"` });
    else seenIds.add(ev.evidenceId);

    if (!EVIDENCE_TYPES.includes(ev.type)) errors.push({ field: `${at}.type`, code: 'UNKNOWN_EVIDENCE_TYPE', message: `unknown evidence type "${ev.type}"` });
    if (!isNonEmptyString(ev.reference)) errors.push({ field: `${at}.reference`, code: 'EMPTY', message: 'reference is required' });
    else if (seenRefs.has(`${ev.type}:${ev.reference}`)) errors.push({ field: `${at}.reference`, code: 'DUPLICATE_EVIDENCE', message: `duplicated evidence reference "${ev.reference}"` });
    else seenRefs.add(`${ev.type}:${ev.reference}`);

    if (typeof ev.extractable !== 'boolean') {
      errors.push({ field: `${at}.extractable`, code: 'MISSING', message: 'extractable must be declared explicitly' });
    } else if (ev.extractable === true && NON_EXTRACTABLE_TYPES.includes(ev.type) && !VERIFIED_PARSERS.includes(ev.type)) {
      errors.push({ field: `${at}.extractable`, code: 'NO_VERIFIED_PARSER', message: `evidence type "${ev.type}" cannot be extractable: no verified parser exists` });
    }
    if (ev.sourceReliability != null && !SOURCE_RELIABILITY.includes(ev.sourceReliability)) {
      warnings.push({ field: `${at}.sourceReliability`, code: 'UNKNOWN_RELIABILITY', message: `unknown sourceReliability "${ev.sourceReliability}"` });
    }
  });
}

/**
 * @param {object} seedCase — never mutated
 * @returns {{valid:boolean, errors:Array, warnings:Array, schemaVersion:string}}
 */
export function validateSeedCase(seedCase) {
  const errors = [];
  const warnings = [];

  if (!isObject(seedCase)) {
    return { valid: false, errors: [{ field: 'root', code: 'INVALID_TYPE', message: 'seed case must be an object' }], warnings, schemaVersion: SEED_SCHEMA_VERSION };
  }

  if (!isNonEmptyString(seedCase.seedVersion)) {
    errors.push({ field: 'seedVersion', code: 'MISSING_VERSION', message: 'seedVersion is required' });
  } else if (seedCase.seedVersion !== SEED_SCHEMA_VERSION) {
    warnings.push({ field: 'seedVersion', code: 'VERSION_MISMATCH', message: `seed declares ${seedCase.seedVersion}, validator implements ${SEED_SCHEMA_VERSION}` });
  }

  if (!isNonEmptyString(seedCase.caseId)) errors.push({ field: 'caseId', code: 'EMPTY_CASE_ID', message: 'caseId must be a non-empty string' });
  if (!PHASES.includes(seedCase.phase)) errors.push({ field: 'phase', code: 'UNKNOWN_PHASE', message: `unknown phase "${seedCase.phase}"` });

  if (!isObject(seedCase.source) || !isNonEmptyString(seedCase.source.tool)) {
    errors.push({ field: 'source', code: 'MISSING', message: 'source.tool is required (Hatch / Wilcom / …)' });
  }

  if (!CONFIDENCE_LEVELS.includes(seedCase.confidence)) {
    errors.push({ field: 'confidence', code: 'UNKNOWN_CONFIDENCE', message: `confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` });
  }
  if (seedCase.viability != null && !VIABILITY_LEVELS.includes(seedCase.viability)) {
    errors.push({ field: 'viability', code: 'UNKNOWN_VIABILITY', message: `viability must be one of ${VIABILITY_LEVELS.join(', ')}` });
  }

  validatePositiveDims(seedCase.dimensionsMm, 'dimensionsMm', errors);
  validatePositiveDims(seedCase.testedSizeMm, 'testedSizeMm', errors);

  // Observation vs candidate rule separation
  if (seedCase.candidateRules != null && !Array.isArray(seedCase.candidateRules)) {
    errors.push({ field: 'candidateRules', code: 'INVALID_TYPE', message: 'candidateRules must be an array' });
  } else {
    (seedCase.candidateRules || []).forEach((rule, i) => {
      if (!isObject(rule) || !isNonEmptyString(rule.ruleId)) {
        errors.push({ field: `candidateRules[${i}].ruleId`, code: 'EMPTY', message: 'candidate rule requires a ruleId' });
      }
      if (rule && typeof rule === 'object' && 'text' in rule && !('expression' in rule)) {
        errors.push({ field: `candidateRules[${i}]`, code: 'OBSERVATION_AS_RULE', message: 'free text belongs in observation, not in a candidate rule' });
      }
    });
  }
  if (isObject(seedCase.observation) && Array.isArray(seedCase.observation.candidateRules)) {
    errors.push({ field: 'observation.candidateRules', code: 'OBSERVATION_AS_RULE', message: 'candidate rules must not be nested inside observation' });
  }

  // Synthetic examples can never claim confirmed status or count as evidence.
  if (seedCase.syntheticExample === true) {
    if (seedCase.confidence === 'confirmed') {
      errors.push({ field: 'confidence', code: 'SYNTHETIC_CANNOT_BE_CONFIRMED', message: 'a syntheticExample case cannot declare confidence "confirmed"' });
    }
    if (seedCase.holdout === true) {
      errors.push({ field: 'holdout', code: 'SYNTHETIC_CANNOT_BE_HOLDOUT', message: 'a syntheticExample case cannot be used as a holdout validation case' });
    }
    warnings.push({ field: 'syntheticExample', code: 'NOT_EVIDENCE', message: 'synthetic example: schema verification only, never learning evidence' });
  }

  if (seedCase.confidence === 'confirmed' && (!Array.isArray(seedCase.evidence) || seedCase.evidence.length === 0)) {
    errors.push({ field: 'evidence', code: 'CONFIRMED_WITHOUT_EVIDENCE', message: 'confidence "confirmed" requires at least one evidence entry' });
  }

  validateEvidence(seedCase.evidence || [], errors, warnings);

  return { valid: errors.length === 0, errors, warnings, schemaVersion: SEED_SCHEMA_VERSION };
}

/** Validates a whole seed collection and reports duplicated caseIds. */
export function validateSeedCollection(cases) {
  if (!Array.isArray(cases)) {
    return { valid: false, results: [], errors: [{ field: 'root', code: 'INVALID_TYPE', message: 'seed collection must be an array' }] };
  }
  const seen = new Set();
  const errors = [];
  const results = cases.map((c, i) => {
    const id = isObject(c) ? c.caseId : null;
    if (isNonEmptyString(id)) {
      if (seen.has(id)) errors.push({ field: `[${i}].caseId`, code: 'DUPLICATE_CASE_ID', message: `duplicated caseId "${id}"` });
      else seen.add(id);
    }
    return { caseId: id ?? null, ...validateSeedCase(c) };
  });
  return { valid: errors.length === 0 && results.every(r => r.valid), results, errors };
}