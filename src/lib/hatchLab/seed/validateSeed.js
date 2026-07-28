/**
 * validateSeed.js — Hatch Lab (P0.1)
 * Pure validators for seed cases and expectedResult criteria.
 * Never mutates its input.
 */

import {
  SEED_SCHEMA_VERSION, PHASES, CONFIDENCE_LEVELS, VIABILITY_LEVELS,
  EVIDENCE_TYPES, SOURCE_RELIABILITY, NON_EXTRACTABLE_TYPES, VERIFIED_PARSERS,
  SOURCE_FIELDS, REQUIRED_SOURCE_FIELDS, EVIDENCE_FIELDS,
  RULE_SCOPE_FIELDS, REQUIRED_RULE_SCOPE_FIELDS,
} from './seedSchema.js';
import {
  METRIC_DEFS, NUMERIC_OPERATORS, SEQUENCE_OPERATORS, OPERATORS, RELATIVE_DIRECTIONS,
} from '../bench/metricAvailability.js';

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isFiniteNum = v => typeof v === 'number' && Number.isFinite(v);

function validatePositiveDims(dims, field, errors) {
  if (dims == null) return;
  if (!isObject(dims)) { errors.push({ field, code: 'INVALID_TYPE', message: `${field} must be an object` }); return; }
  for (const k of ['width', 'height']) {
    const v = dims[k];
    if (v == null) { errors.push({ field: `${field}.${k}`, code: 'MISSING', message: `${field}.${k} is required when ${field} is present` }); continue; }
    if (!isFiniteNum(v) || v <= 0) {
      errors.push({ field: `${field}.${k}`, code: 'NOT_POSITIVE', message: `${field}.${k} must be a positive finite number` });
    }
  }
}

function validateTolerance(tol, at, errors) {
  if (tol == null) return;
  if (!isObject(tol)) { errors.push({ field: `${at}.tolerance`, code: 'INVALID_TOLERANCE', message: 'tolerance must be an object' }); return; }
  for (const k of ['absolute', 'relative']) {
    if (tol[k] != null && (!isFiniteNum(tol[k]) || tol[k] < 0)) {
      errors.push({ field: `${at}.tolerance.${k}`, code: 'INVALID_TOLERANCE', message: `tolerance.${k} must be a finite number ≥ 0` });
    }
  }
}

/**
 * Validates an expectedResult object. Pure.
 * @returns {{ errors: Array, warnings: Array, empty: boolean }}
 */
export function validateExpectedResult(expectedResult) {
  const errors = [];
  const warnings = [];
  if (expectedResult == null) return { errors, warnings, empty: true };
  if (!isObject(expectedResult)) {
    return { errors: [{ field: 'expectedResult', code: 'INVALID_TYPE', message: 'expectedResult must be an object' }], warnings, empty: true };
  }
  const criteria = expectedResult.criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    errors.push({ field: 'expectedResult.criteria', code: 'EMPTY_EXPECTED_RESULT', message: 'expectedResult must declare a non-empty criteria array' });
    return { errors, warnings, empty: true };
  }

  criteria.forEach((c, i) => {
    const at = `expectedResult.criteria[${i}]`;
    if (!isObject(c)) { errors.push({ field: at, code: 'INVALID_TYPE', message: 'criterion must be an object' }); return; }

    const def = METRIC_DEFS[c.metric];
    if (!def) {
      errors.push({ field: `${at}.metric`, code: 'UNKNOWN_EXPECTED_METRIC', message: `unknown metric "${c.metric}"` });
      return;
    }
    if (!OPERATORS.includes(c.operator)) {
      errors.push({ field: `${at}.operator`, code: 'UNKNOWN_OPERATOR', message: `unknown operator "${c.operator}"` });
      return;
    }
    // operator / metric-type compatibility
    if (def.type === 'object') {
      errors.push({ field: `${at}.metric`, code: 'INCOMPATIBLE_OPERATOR', message: `metric "${c.metric}" is not comparable in criteria` });
      return;
    }
    if (def.type === 'number' && !NUMERIC_OPERATORS.includes(c.operator)) {
      errors.push({ field: `${at}.operator`, code: 'INCOMPATIBLE_OPERATOR', message: `operator "${c.operator}" incompatible with numeric metric "${c.metric}"` });
    }
    if (def.type === 'sequence' && !SEQUENCE_OPERATORS.includes(c.operator)) {
      errors.push({ field: `${at}.operator`, code: 'INCOMPATIBLE_OPERATOR', message: `operator "${c.operator}" incompatible with sequence metric "${c.metric}"` });
    }

    if (typeof c.required !== 'boolean') {
      errors.push({ field: `${at}.required`, code: 'REQUIRED_NOT_BOOLEAN', message: 'required must be declared explicitly as boolean' });
    }
    validateTolerance(c.tolerance, at, errors);

    // operator-specific values — no NaN/Infinity ever
    if (['equals', 'minimum', 'maximum'].includes(c.operator)) {
      if (!isFiniteNum(c.value)) errors.push({ field: `${at}.value`, code: 'INVALID_VALUE', message: `${c.operator} requires a finite numeric value` });
    }
    if (c.operator === 'between') {
      if (!isFiniteNum(c.min) || !isFiniteNum(c.max)) {
        errors.push({ field: `${at}`, code: 'INVALID_VALUE', message: 'between requires finite min and max' });
      } else if (c.min > c.max) {
        errors.push({ field: `${at}`, code: 'INVALID_VALUE', message: 'between requires min ≤ max' });
      }
    }
    if (SEQUENCE_OPERATORS.includes(c.operator) && !Array.isArray(c.value)) {
      errors.push({ field: `${at}.value`, code: 'INVALID_VALUE', message: `${c.operator} requires an array value` });
    }
    if (c.operator === 'relative_to_baseline') {
      if (!RELATIVE_DIRECTIONS.includes(c.direction)) {
        errors.push({ field: `${at}.direction`, code: 'INVALID_VALUE', message: `relative_to_baseline requires direction ∈ ${RELATIVE_DIRECTIONS.join('|')}` });
      }
      for (const k of ['minimumDelta', 'maximumDelta']) {
        if (c[k] != null && (!isFiniteNum(c[k]) || c[k] < 0)) {
          errors.push({ field: `${at}.${k}`, code: 'INVALID_VALUE', message: `${k} must be a finite number ≥ 0` });
        }
      }
    }
  });

  return { errors, warnings, empty: false };
}

/** Object-typed optional field: null/absent is valid, wrong type is not. */
function validateObjectField(value, field, errors) {
  if (value == null) return false;
  if (!isObject(value)) {
    errors.push({ field, code: 'INVALID_TYPE', message: `${field} must be an object` });
    return false;
  }
  return true;
}

function validateSource(source, errors, warnings) {
  if (!validateObjectField(source, 'source', errors)) {
    if (source == null) errors.push({ field: 'source', code: 'MISSING', message: 'source is required' });
    return;
  }
  for (const key of REQUIRED_SOURCE_FIELDS) {
    if (!isNonEmptyString(source[key])) {
      errors.push({ field: `source.${key}`, code: 'MISSING', message: `source.${key} is required (Hatch / Wilcom / …)` });
    }
  }
  for (const key of SOURCE_FIELDS) {
    const v = source[key];
    if (v != null && typeof v !== 'string') {
      errors.push({ field: `source.${key}`, code: 'INVALID_TYPE', message: `source.${key} must be a string or null` });
    }
  }
  for (const key of ['version', 'author', 'date']) {
    if (!(key in source)) {
      warnings.push({ field: `source.${key}`, code: 'SOURCE_FIELD_NOT_DECLARED', message: `source.${key} is not declared; declare it explicitly as null when undocumented` });
    }
  }
  if (source.physicalValidation != null && typeof source.physicalValidation !== 'boolean') {
    errors.push({ field: 'source.physicalValidation', code: 'INVALID_TYPE', message: 'source.physicalValidation must be a boolean' });
  }
}

function validateSizeRange(range, at, errors) {
  if (range == null) return;
  if (!isObject(range)) { errors.push({ field: at, code: 'INVALID_TYPE', message: `${at} must be an object` }); return; }
  for (const k of ['minimum', 'maximum']) {
    if (!isFiniteNum(range[k]) || range[k] <= 0) {
      errors.push({ field: `${at}.${k}`, code: 'NOT_POSITIVE', message: `${at}.${k} must be a positive finite number` });
    }
  }
  if (isFiniteNum(range.minimum) && isFiniteNum(range.maximum) && range.minimum > range.maximum) {
    errors.push({ field: at, code: 'INVALID_RANGE', message: `${at} requires minimum ≤ maximum` });
  }
  if (range.unit != null && typeof range.unit !== 'string') {
    errors.push({ field: `${at}.unit`, code: 'INVALID_TYPE', message: `${at}.unit must be a string` });
  }
}

/** ruleScope is a structured object; free text lives in ruleScope.description. */
function validateRuleScope(ruleScope, errors, warnings) {
  if (ruleScope == null) return;
  if (typeof ruleScope === 'string') {
    errors.push({ field: 'ruleScope', code: 'RULE_SCOPE_NOT_OBJECT', message: 'ruleScope must be an object; put free text in ruleScope.description' });
    return;
  }
  if (!isObject(ruleScope)) {
    errors.push({ field: 'ruleScope', code: 'RULE_SCOPE_NOT_OBJECT', message: 'ruleScope must be an object' });
    return;
  }
  for (const key of REQUIRED_RULE_SCOPE_FIELDS) {
    if (!isNonEmptyString(ruleScope[key])) {
      errors.push({ field: `ruleScope.${key}`, code: 'RULE_SCOPE_INCOMPLETE', message: `ruleScope.${key} is required` });
    }
  }
  if (ruleScope.phase != null && isNonEmptyString(ruleScope.phase) && !PHASES.includes(ruleScope.phase)) {
    errors.push({ field: 'ruleScope.phase', code: 'UNKNOWN_PHASE', message: `unknown ruleScope.phase "${ruleScope.phase}"` });
  }
  for (const key of ['geometryClass', 'fabric', 'description']) {
    if (ruleScope[key] != null && typeof ruleScope[key] !== 'string') {
      errors.push({ field: `ruleScope.${key}`, code: 'INVALID_TYPE', message: `ruleScope.${key} must be a string or null` });
    }
  }
  validateSizeRange(ruleScope.sizeRangeMm, 'ruleScope.sizeRangeMm', errors);
  for (const key of Object.keys(ruleScope)) {
    if (!RULE_SCOPE_FIELDS.includes(key)) {
      warnings.push({ field: `ruleScope.${key}`, code: 'UNKNOWN_RULE_SCOPE_FIELD', message: `ruleScope.${key} is not a declared ruleScope field` });
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
    if (ev.description != null && typeof ev.description !== 'string') {
      errors.push({ field: `${at}.description`, code: 'INVALID_TYPE', message: 'evidence description must be a string or null' });
    }
    for (const key of Object.keys(ev)) {
      if (!EVIDENCE_FIELDS.includes(key)) {
        errors.push({ field: `${at}.${key}`, code: 'UNKNOWN_EVIDENCE_FIELD', message: `"${key}" is not a declared evidence field; free text belongs in description` });
      }
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

  validateSource(seedCase.source, errors, warnings);
  validateObjectField(seedCase.input, 'input', errors);
  validateObjectField(seedCase.configuration, 'configuration', errors);
  validateObjectField(seedCase.observation, 'observation', errors);
  validateRuleScope(seedCase.ruleScope, errors, warnings);

  for (const key of ['holdout', 'syntheticExample']) {
    if (seedCase[key] != null && typeof seedCase[key] !== 'boolean') {
      errors.push({ field: key, code: 'INVALID_TYPE', message: `${key} must be a boolean` });
    }
  }
  if (seedCase.exceptions != null && !Array.isArray(seedCase.exceptions)) {
    errors.push({ field: 'exceptions', code: 'INVALID_TYPE', message: 'exceptions must be an array' });
  }

  if (!CONFIDENCE_LEVELS.includes(seedCase.confidence)) {
    errors.push({ field: 'confidence', code: 'UNKNOWN_CONFIDENCE', message: `confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` });
  }
  if (seedCase.viability != null && !VIABILITY_LEVELS.includes(seedCase.viability)) {
    errors.push({ field: 'viability', code: 'UNKNOWN_VIABILITY', message: `viability must be one of ${VIABILITY_LEVELS.join(', ')}` });
  }

  validatePositiveDims(seedCase.dimensionsMm, 'dimensionsMm', errors);
  validatePositiveDims(seedCase.testedSizeMm, 'testedSizeMm', errors);

  // expectedResult — explicit criteria, strictly separate from observation
  const er = validateExpectedResult(seedCase.expectedResult);
  errors.push(...er.errors);
  warnings.push(...er.warnings);
  if (isObject(seedCase.observation) && ('criteria' in seedCase.observation || 'candidateRules' in seedCase.observation)) {
    errors.push({ field: 'observation', code: 'OBSERVATION_AS_RULE', message: 'criteria/rules must not be nested inside observation' });
  }

  // candidate rules — separate from observations
  if (seedCase.candidateRules != null && !Array.isArray(seedCase.candidateRules)) {
    errors.push({ field: 'candidateRules', code: 'INVALID_TYPE', message: 'candidateRules must be an array' });
  } else {
    (seedCase.candidateRules || []).forEach((rule, i) => {
      const at = `candidateRules[${i}]`;
      if (!isObject(rule)) {
        errors.push({ field: at, code: 'INVALID_TYPE', message: 'candidate rule must be an object' });
        return;
      }
      if (!isNonEmptyString(rule.ruleId)) {
        errors.push({ field: `${at}.ruleId`, code: 'EMPTY', message: 'candidate rule requires a ruleId' });
      }
      if ('text' in rule && !('expression' in rule)) {
        errors.push({ field: at, code: 'OBSERVATION_AS_RULE', message: 'free text belongs in observation, not in a candidate rule' });
      }
      if (!isNonEmptyString(rule.expression)) {
        errors.push({ field: `${at}.expression`, code: 'MISSING_EXPRESSION', message: 'candidate rule requires a non-empty expression' });
      }
      if (rule.parameters != null && (!isObject(rule.parameters))) {
        errors.push({ field: `${at}.parameters`, code: 'INVALID_TYPE', message: 'candidate rule parameters must be an object' });
      }
      if (rule.evidence != null && !Array.isArray(rule.evidence)) {
        errors.push({ field: `${at}.evidence`, code: 'INVALID_TYPE', message: 'candidate rule evidence must be an array' });
      }
      if (rule.confidence != null && (!isFiniteNum(rule.confidence) || rule.confidence < 0 || rule.confidence > 1)) {
        errors.push({ field: `${at}.confidence`, code: 'INVALID_VALUE', message: 'candidate rule confidence must be a finite number in [0, 1]' });
      }
      if (rule.physicalValidation != null && typeof rule.physicalValidation !== 'boolean') {
        errors.push({ field: `${at}.physicalValidation`, code: 'INVALID_TYPE', message: 'candidate rule physicalValidation must be a boolean' });
      }
    });
  }

  // synthetic cases: never confirmed, never holdout, never evidence
  if (seedCase.syntheticExample === true) {
    if (seedCase.confidence === 'confirmed') {
      errors.push({ field: 'confidence', code: 'SYNTHETIC_CANNOT_BE_CONFIRMED', message: 'a syntheticExample case cannot declare confidence "confirmed"' });
    }
    if (seedCase.holdout === true) {
      errors.push({ field: 'holdout', code: 'SYNTHETIC_CANNOT_BE_HOLDOUT', message: 'a syntheticExample case cannot be used as a holdout validation case' });
    }
    warnings.push({ field: 'syntheticExample', code: 'SYNTHETIC_EXAMPLE', message: 'synthetic example: schema verification only, never learning evidence, never pass/fail' });
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