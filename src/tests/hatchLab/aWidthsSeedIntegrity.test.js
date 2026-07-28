/**
 * aWidthsSeedIntegrity.test.js — Hatch Lab (P0.2B)
 * Integrity suite for the real A_WIDTHS seed subset (A1, A5, A6, A7, A8).
 * Pure checks only: no pipeline, no engine, no rule application.
 */

import { validateSeedCase, validateSeedCollection } from '@/lib/hatchLab/seed/validateSeed';
import {
  A_WIDTHS_CASES, A_WIDTHS_SEED_MANIFEST, A_WIDTHS_EVIDENCE_INDEX, evidenceReferenceSet,
} from '@/lib/hatchLab/seed/real/A_WIDTHS/index.js';

const SHA256_RE = /^[A-Fa-f0-9]{64}$/;
const EXPECTED_IDS = ['HATCH-A-WIDTHS-A1', 'HATCH-A-WIDTHS-A5', 'HATCH-A-WIDTHS-A6', 'HATCH-A-WIDTHS-A7', 'HATCH-A-WIDTHS-A8'];

/** Extracts the manifest-relative path from an evidence reference "<zip>#<path>" or "<file>#<sheet>". */
function referencePath(reference) {
  const hashIdx = reference.indexOf('#');
  if (reference.startsWith('A_Anchuras_parte_') && hashIdx > -1) {
    return reference.slice(hashIdx + 1).split('#')[0];
  }
  return null; // xlsx sheet references are resolved by file name below
}

export function runAWidthsSeedIntegrityTests() {
  const fails = [];
  let checks = 0;
  const ok = (label, cond) => { checks++; if (!cond) fails.push(label); };

  const cases = A_WIDTHS_CASES;
  const indexPaths = evidenceReferenceSet();

  // 1–8: structural invariants
  ok('exactly five cases', cases.length === 5);
  ok('unique caseIds', new Set(cases.map(c => c.caseId)).size === 5);
  ok('caseIds match the authorized subset', EXPECTED_IDS.every(id => cases.some(c => c.caseId === id)));
  ok('all cases phase A_WIDTHS', cases.every(c => c.phase === 'A_WIDTHS'));
  ok('all cases syntheticExample false', cases.every(c => c.syntheticExample === false));
  ok('all cases holdout false', cases.every(c => c.holdout === false));
  ok('all cases expectedResult null', cases.every(c => c.expectedResult === null));
  ok('all cases confidence probable', cases.every(c => c.confidence === 'probable'));
  ok('all cases viability high', cases.every(c => c.viability === 'high'));
  ok('all cases declare physicalValidation false', cases.every(c => c.source?.physicalValidation === false));

  // 9: schema validation
  cases.forEach(c => ok(`validateSeedCase(${c.caseId}) valid`, validateSeedCase(c).valid === true));
  const collection = validateSeedCollection(cases);
  ok('validateSeedCollection valid (no duplicated ids)', collection.valid === true);

  // 10–12: quantitative invariants
  cases.forEach(c => {
    const m = c.observation?.measured || {};
    ok(`${c.caseId} nominal width positive`, typeof m.nominalWidthMm === 'number' && m.nominalWidthMm > 0);
    ok(`${c.caseId} observed width positive when available`, m.observedWidthMm == null || (typeof m.observedWidthMm === 'number' && m.observedWidthMm > 0));
    ok(`${c.caseId} unit declared`, m.unit === 'mm' && c.input?.unit === 'mm');
  });

  // 13–15: mandatory evidence kinds
  cases.forEach(c => {
    const ev = c.evidence || [];
    ok(`${c.caseId} references EXACT-map.csv`, ev.some(e => /HATCH-A-WIDTHS-EXACT-map\.csv/.test(e.reference)));
    ok(`${c.caseId} references analisis-ABCD.xlsx`, ev.some(e => /analisis-ABCD\.xlsx#/.test(e.reference)));
    const emb = ev.find(e => e.type === 'emb');
    ok(`${c.caseId} references EMB with extractable false`, !!emb && emb.extractable === false);
  });

  // 16: no screenshot assigned to an individual case
  cases.forEach(c => {
    ok(`${c.caseId} has no screenshot evidence`, !(c.evidence || []).some(e => e.type === 'screenshot' || /02_Capturas\//.test(e.reference)));
  });
  const screenshotEntries = (A_WIDTHS_EVIDENCE_INDEX.entries || []).filter(e => e.evidenceType === 'screenshot');
  ok('all screenshots remain unmapped and uncertain', screenshotEntries.length === 78
    && screenshotEntries.every(e => e.relationStatus === 'uncertain' && Array.isArray(e.relatedCaseIds) && e.relatedCaseIds.length === 0));

  // 17: every package reference exists in evidenceIndex
  cases.forEach(c => {
    (c.evidence || []).forEach(e => {
      const p = referencePath(e.reference);
      if (p) ok(`${c.caseId} evidence path in index: ${p}`, indexPaths.has(p));
      else ok(`${c.caseId} xlsx reference resolves to indexed workbook`,
        /analisis-ABCD\.xlsx/.test(e.reference) && indexPaths.has('05_Datos_Objetos/HATCH-A-WIDTHS-R01-analisis-ABCD.xlsx'));
    });
  });

  // 18: hash format
  ok('evidenceIndex holds 89 entries', (A_WIDTHS_EVIDENCE_INDEX.entries || []).length === 89);
  ok('all evidenceIndex hashes are SHA-256', (A_WIDTHS_EVIDENCE_INDEX.entries || []).every(e => SHA256_RE.test(e.sha256)));
  ok('all seedManifest source hashes are SHA-256', Object.values(A_WIDTHS_SEED_MANIFEST.sourceHashes || {}).every(h => SHA256_RE.test(h)));

  // 19: no duplicated evidence
  const allPaths = (A_WIDTHS_EVIDENCE_INDEX.entries || []).map(e => e.relativePath);
  ok('no duplicated evidence paths in index', new Set(allPaths).size === allPaths.length);
  cases.forEach(c => {
    const refs = (c.evidence || []).map(e => `${e.type}:${e.reference}`);
    const ids = (c.evidence || []).map(e => e.evidenceId);
    ok(`${c.caseId} no duplicated evidence refs`, new Set(refs).size === refs.length);
    ok(`${c.caseId} no duplicated evidenceIds`, new Set(ids).size === ids.length);
  });

  // 20: candidate rules keep their candidate status
  cases.forEach(c => {
    const rules = c.candidateRules || [];
    ok(`${c.caseId} has candidate rules`, rules.length > 0);
    ok(`${c.caseId} all rules status candidata`, rules.every(r => r.status === 'candidata'));
    ok(`${c.caseId} all rules physicalValidation false`, rules.every(r => r.physicalValidation === false));
    ok(`${c.caseId} rules cite evidence`, rules.every(r => Array.isArray(r.evidence) && r.evidence.length > 0));
  });

  // 21: no invented expectedResult anywhere
  ok('no case declares criteria', cases.every(c => c.expectedResult === null && !('criteria' in (c.observation || {}))));

  // 22: validation does not mutate inputs
  const snapshot = JSON.stringify(cases);
  cases.forEach(c => validateSeedCase(c));
  validateSeedCollection(cases);
  ok('inputs not mutated by validation', JSON.stringify(cases) === snapshot);

  // 23–25: manifest flags
  ok('seedManifest.caseCount is 5', A_WIDTHS_SEED_MANIFEST.caseCount === 5);
  ok('seedManifest.benchmarkReady is false', A_WIDTHS_SEED_MANIFEST.benchmarkReady === false);
  ok('seedManifest.motorIntegrationReady is false', A_WIDTHS_SEED_MANIFEST.motorIntegrationReady === false);
  ok('seedManifest.expectedResultReady is false', A_WIDTHS_SEED_MANIFEST.expectedResultReady === false);
  ok('seedManifest.physicalValidationAvailable is false', A_WIDTHS_SEED_MANIFEST.physicalValidationAvailable === false);
  ok('seedManifest holdout list empty', Array.isArray(A_WIDTHS_SEED_MANIFEST.holdoutCaseIds) && A_WIDTHS_SEED_MANIFEST.holdoutCaseIds.length === 0);
  ok('seedManifest unresolvedEvidenceCount is 78', A_WIDTHS_SEED_MANIFEST.unresolvedEvidenceCount === 78);

  return { name: 'hatchLab/aWidthsSeedIntegrity', pass: fails.length === 0, checks, fails };
}