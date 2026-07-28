/**
 * seedStructuralConformance.test.js — Hatch Lab (P0.2C)
 * Proves that validateSeedCase really enforces the declared v1.1.0 contract
 * (source / input / configuration / observation / ruleScope / candidateRules /
 * evidence / booleans / enums / dimensions) and that the five real A_WIDTHS
 * cases conform to it. Pure: no engine, no pipeline, no rule application.
 */

import { validateSeedCase } from '@/lib/hatchLab/seed/validateSeed';
import { normalizeSeedCase } from '@/lib/hatchLab/seed/normalizeSeed';
import { syntheticSeedCase } from '@/lib/hatchLab/seed/syntheticSeedExample';
import {
  RULE_SCOPE_FIELDS, REQUIRED_RULE_SCOPE_FIELDS, EVIDENCE_FIELDS, SOURCE_FIELDS,
} from '@/lib/hatchLab/seed/seedSchema';
import {
  A_WIDTHS_CASES, A_WIDTHS_SEED_MANIFEST, A_WIDTHS_EVIDENCE_INDEX,
} from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';

const SHA256_RE = /^[A-Fa-f0-9]{64}$/;
const base = extra => ({ ...syntheticSeedCase, ...extra });
const codes = res => res.errors.map(e => e.code);

export function runSeedStructuralConformanceTests() {
  const fails = [];
  let checks = 0;
  const ok = (label, cond) => { checks++; if (!cond) fails.push(label); };
  const rejects = (label, seed, code) => ok(label, codes(validateSeedCase(seed)).includes(code));

  // 1–2 ruleScope
  rejects('1. ruleScope string rejected', base({ ruleScope: 'texto libre' }), 'RULE_SCOPE_NOT_OBJECT');
  rejects('1b. ruleScope array rejected', base({ ruleScope: ['x'] }), 'RULE_SCOPE_NOT_OBJECT');
  rejects('1c. ruleScope without phase rejected', base({ ruleScope: { geometryClass: 'barra_recta' } }), 'RULE_SCOPE_INCOMPLETE');
  rejects('1d. ruleScope unknown phase rejected', base({ ruleScope: { phase: 'Z_NOPE' } }), 'UNKNOWN_PHASE');
  rejects('1e. ruleScope sizeRangeMm minimum > maximum rejected', base({ ruleScope: { phase: 'A_WIDTHS', sizeRangeMm: { minimum: 8, maximum: 2, unit: 'mm' } } }), 'INVALID_RANGE');
  rejects('1f. ruleScope sizeRangeMm negative rejected', base({ ruleScope: { phase: 'A_WIDTHS', sizeRangeMm: { minimum: -1, maximum: 2, unit: 'mm' } } }), 'NOT_POSITIVE');
  ok('2. structured ruleScope accepted', validateSeedCase(base({
    ruleScope: { phase: 'A_WIDTHS', geometryClass: 'barra_recta', sizeRangeMm: { minimum: 0.5, maximum: 0.5, unit: 'mm' }, fabric: 'Pure Cotton', description: 'x' },
  })).valid === true);
  ok('2b. null ruleScope stays valid (optional)', validateSeedCase(base({ ruleScope: null })).valid === true);

  // 3–4 source
  rejects('3. source string rejected', base({ source: 'Hatch' }), 'INVALID_TYPE');
  rejects('3b. source array rejected', base({ source: [] }), 'INVALID_TYPE');
  rejects('4. source without tool rejected', base({ source: { version: null, author: null, date: null } }), 'MISSING');
  rejects('4b. source missing entirely rejected', base({ source: null }), 'MISSING');
  rejects('4c. non-string source.version rejected', base({ source: { tool: 'Hatch', version: 3 } }), 'INVALID_TYPE');
  rejects('4d. non-boolean source.physicalValidation rejected', base({ source: { tool: 'Hatch', physicalValidation: 'no' } }), 'INVALID_TYPE');

  // 5–7 input / configuration / observation
  rejects('5. input string rejected', base({ input: 'texto' }), 'INVALID_TYPE');
  rejects('6. configuration string rejected', base({ configuration: 'texto' }), 'INVALID_TYPE');
  rejects('7. observation string rejected', base({ observation: 'texto' }), 'INVALID_TYPE');
  ok('7b. null input/configuration/observation stay valid', validateSeedCase(base({ input: null, configuration: null, observation: null })).valid === true);

  // 8–10 candidateRules
  rejects('8. candidateRules object rejected', base({ candidateRules: { ruleId: 'R' } }), 'INVALID_TYPE');
  rejects('8b. candidate rule non-object rejected', base({ candidateRules: ['R-1'] }), 'INVALID_TYPE');
  rejects('9. candidate rule without ruleId rejected', base({ candidateRules: [{ expression: 'algo' }] }), 'EMPTY');
  rejects('10. candidate rule without expression rejected', base({ candidateRules: [{ ruleId: 'R-1' }] }), 'MISSING_EXPRESSION');
  rejects('10b. candidate rule parameters array rejected', base({ candidateRules: [{ ruleId: 'R-1', expression: 'x', parameters: [1] }] }), 'INVALID_TYPE');
  rejects('10c. candidate rule confidence > 1 rejected', base({ candidateRules: [{ ruleId: 'R-1', expression: 'x', confidence: 1.4 }] }), 'INVALID_VALUE');

  // 11–13 evidence
  rejects('11. evidence object rejected', base({ evidence: { evidenceId: 'E' } }), 'INVALID_TYPE');
  rejects('12. evidence without reference rejected', base({ evidence: [{ evidenceId: 'E', type: 'note', extractable: false }] }), 'EMPTY');
  rejects('13. EMB with extractable true rejected', base({ evidence: [{ evidenceId: 'E', type: 'emb', reference: 'f.emb', extractable: true }] }), 'NO_VERIFIED_PARSER');
  rejects('13b. evidence "notes" field rejected (description is canonical)', base({ evidence: [{ evidenceId: 'E', type: 'note', reference: 'inline://a', extractable: false, notes: 'libre' }] }), 'UNKNOWN_EVIDENCE_FIELD');

  // 14–17 booleans and enums
  rejects('14. non-boolean holdout rejected', base({ holdout: 'yes' }), 'INVALID_TYPE');
  rejects('15. non-boolean syntheticExample rejected', base({ syntheticExample: 'yes' }), 'INVALID_TYPE');
  rejects('16. unknown confidence rejected', base({ confidence: 'muy_probable' }), 'UNKNOWN_CONFIDENCE');
  rejects('17. unknown viability rejected', base({ viability: 'enorme' }), 'UNKNOWN_VIABILITY');

  // 18–20 dimensions
  rejects('18. NaN dimensions rejected', base({ dimensionsMm: { width: NaN, height: 10 } }), 'NOT_POSITIVE');
  rejects('19. Infinity dimensions rejected', base({ testedSizeMm: { width: Infinity, height: 10 } }), 'NOT_POSITIVE');
  rejects('20. negative dimensions rejected', base({ dimensionsMm: { width: -1, height: 10 } }), 'NOT_POSITIVE');

  // 21–26 the five real cases under the hardened validator
  const cases = A_WIDTHS_CASES;
  ok('21. five real cases present', cases.length === 5);
  cases.forEach(c => {
    const res = validateSeedCase(c);
    ok(`21. ${c.caseId} valid under hardened validator: ${JSON.stringify(res.errors)}`, res.valid === true);
    ok(`21. ${c.caseId} no structural warnings`, !res.warnings.some(w => ['SOURCE_FIELD_NOT_DECLARED', 'UNKNOWN_RULE_SCOPE_FIELD'].includes(w.code)));

    // 22 ruleScope conformance
    const rs = c.ruleScope;
    ok(`22. ${c.caseId} ruleScope is an object`, !!rs && typeof rs === 'object' && !Array.isArray(rs));
    ok(`22. ${c.caseId} ruleScope required fields present`, REQUIRED_RULE_SCOPE_FIELDS.every(f => typeof rs[f] === 'string' && rs[f].length > 0));
    ok(`22. ${c.caseId} ruleScope has no undeclared field`, Object.keys(rs).every(k => RULE_SCOPE_FIELDS.includes(k)));
    ok(`22. ${c.caseId} ruleScope keeps the original description`, typeof rs.description === 'string' && /Barra recta vertical de 16 mm de alto/.test(rs.description) && /divisi/.test(rs.description));
    ok(`22. ${c.caseId} ruleScope sizeRangeMm matches nominal width`, rs.sizeRangeMm.unit === 'mm'
      && rs.sizeRangeMm.minimum === c.observation.measured.nominalWidthMm
      && rs.sizeRangeMm.maximum === c.observation.measured.nominalWidthMm);
    ok(`22. ${c.caseId} ruleScope phase and fabric`, rs.phase === 'A_WIDTHS' && rs.fabric === 'Pure Cotton' && rs.geometryClass === 'barra_recta');

    // source / input conformance
    ok(`3. ${c.caseId} source declares tool/version/author/date`, SOURCE_FIELDS.every(f => f in c.source) && c.source.tool === 'Hatch'
      && c.source.version === null && c.source.author === null && c.source.date === '2026-07-22');
    ok(`3. ${c.caseId} source keeps extra documented fields`, ['labTestId', 'embFile', 'sourceImage', 'fabricProfile', 'physicalValidation', 'packagedAt']
      .every(f => f in c.source));
    ok(`3. ${c.caseId} input keeps imageRef, description and quantitative data`, typeof c.input.imageRef === 'string'
      && typeof c.input.description === 'string' && typeof c.input.testId === 'string'
      && c.input.geometry === 'barra_recta' && typeof c.input.family === 'string'
      && Number.isFinite(c.input.centerXMm) && Number.isFinite(c.input.centerYMm) && c.input.unit === 'mm');

    // 23 evidence conformance
    (c.evidence || []).forEach(e => {
      ok(`23. ${c.caseId}/${e.evidenceId} only declared evidence fields`, Object.keys(e).every(k => EVIDENCE_FIELDS.includes(k)));
      ok(`23. ${c.caseId}/${e.evidenceId} description migrated from notes`, typeof e.description === 'string' && e.description.length > 0 && !('notes' in e));
      ok(`23. ${c.caseId}/${e.evidenceId} extractable is boolean`, typeof e.extractable === 'boolean');
      if (e.type === 'emb' || e.type === 'image') ok(`23. ${c.caseId}/${e.evidenceId} non-extractable`, e.extractable === false);
      if (e.type === 'table' || e.type === 'measurement') ok(`23. ${c.caseId}/${e.evidenceId} extractable`, e.extractable === true);
      ok(`23. ${c.caseId}/${e.evidenceId} keeps sourceReliability`, typeof e.sourceReliability === 'string');
    });
    const ids = (c.evidence || []).map(e => e.evidenceId);
    ok(`23. ${c.caseId} unique evidenceIds`, new Set(ids).size === ids.length);

    // 24 no screenshot mapped
    ok(`24. ${c.caseId} no screenshot assigned`, !(c.evidence || []).some(e => e.type === 'screenshot' || /02_Capturas\//.test(e.reference)));
    // 25 expectedResult null
    ok(`25. ${c.caseId} expectedResult null`, c.expectedResult === null);
    // 26 no confirmed rule
    ok(`26. ${c.caseId} no confirmed rule`, c.confidence !== 'confirmed'
      && (c.candidateRules || []).every(r => r.status === 'candidata' && r.physicalValidation === false));
  });
  const shots = (A_WIDTHS_EVIDENCE_INDEX.entries || []).filter(e => e.evidenceType === 'screenshot');
  ok('24. all 78 screenshots stay unmapped', shots.length === 78 && shots.every(e => e.relationStatus === 'uncertain' && e.relatedCaseIds.length === 0));

  // 27 normalization does not mutate and does not silently change ruleScope
  const snapshot = JSON.stringify(cases);
  const normalized = cases.map(normalizeSeedCase);
  ok('27. normalizeSeedCase does not mutate inputs', JSON.stringify(cases) === snapshot);
  normalized.forEach((n, i) => {
    const c = cases[i];
    ok(`27. ${c.caseId} ruleScope unchanged by normalization`, JSON.stringify(n.ruleScope) === JSON.stringify(c.ruleScope));
    ok(`27. ${c.caseId} normalizer invents no source.version/author`, n.source.version === null && n.source.author === null);
    ok(`27. ${c.caseId} normalizer keeps confidence`, n.confidence === c.confidence);
    ok(`27. ${c.caseId} normalizer keeps expectedResult null`, n.expectedResult === null);
    ok(`27. ${c.caseId} normalizer keeps extra source fields`, n.source.labTestId === c.source.labTestId && n.source.physicalValidation === false);
    ok(`27. ${c.caseId} normalized case still valid`, validateSeedCase(n).valid === true);

    // 28 roundtrip: no technical data lost
    ok(`28. ${c.caseId} measured values preserved`, JSON.stringify(n.observation.measured) === JSON.stringify(c.observation.measured));
    ok(`28. ${c.caseId} configuration preserved`, JSON.stringify(n.configuration) === JSON.stringify(c.configuration));
    ok(`28. ${c.caseId} input preserved`, JSON.stringify(n.input) === JSON.stringify(c.input));
    ok(`28. ${c.caseId} candidateRules preserved`, JSON.stringify(n.candidateRules) === JSON.stringify(c.candidateRules));
    ok(`28. ${c.caseId} evidence references and descriptions preserved`,
      n.evidence.length === c.evidence.length
      && n.evidence.every((e, k) => e.reference === c.evidence[k].reference
        && e.description === c.evidence[k].description
        && e.extractable === c.evidence[k].extractable
        && e.sourceReliability === c.evidence[k].sourceReliability));
  });

  // 29 hashes intact
  const indexByPath = new Map((A_WIDTHS_EVIDENCE_INDEX.entries || []).map(e => [e.relativePath, e.sha256]));
  const manifestHashes = A_WIDTHS_SEED_MANIFEST.sourceHashes || {};
  ok('29. all manifest hashes are SHA-256', Object.values(manifestHashes).every(h => SHA256_RE.test(h)));
  ok('29. manifest hashes match the evidence index', Object.entries(manifestHashes)
    .filter(([p]) => indexByPath.has(p))
    .every(([p, h]) => indexByPath.get(p) === h));
  ok('29. evidence index still holds 89 hashed entries', (A_WIDTHS_EVIDENCE_INDEX.entries || []).length === 89
    && (A_WIDTHS_EVIDENCE_INDEX.entries || []).every(e => SHA256_RE.test(e.sha256)));

  // 30 manifest untouched except administrative documentation
  ok('30. manifest caseCount is 5', A_WIDTHS_SEED_MANIFEST.caseCount === 5);
  ok('30. manifest benchmarkReady false', A_WIDTHS_SEED_MANIFEST.benchmarkReady === false);
  ok('30. manifest motorIntegrationReady false', A_WIDTHS_SEED_MANIFEST.motorIntegrationReady === false);
  ok('30. manifest expectedResultReady false', A_WIDTHS_SEED_MANIFEST.expectedResultReady === false);
  ok('30. manifest physicalValidationAvailable false', A_WIDTHS_SEED_MANIFEST.physicalValidationAvailable === false);
  ok('30. manifest unresolvedEvidenceCount 78', A_WIDTHS_SEED_MANIFEST.unresolvedEvidenceCount === 78);
  ok('30. manifest holdout list still empty', A_WIDTHS_SEED_MANIFEST.holdoutCaseIds.length === 0);
  ok('30. manifest seedVersion still 1.1.0', A_WIDTHS_SEED_MANIFEST.seedVersion === '1.1.0');

  return { name: 'hatchLab/seedStructuralConformance', pass: fails.length === 0, checks, fails };
}