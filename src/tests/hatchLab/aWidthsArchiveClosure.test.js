/**
 * aWidthsArchiveClosure.test.js — structural tests for the storage closure of
 * BASE-ENGINE-A-WIDTHS-V1.
 *
 * These tests never run the engine and never fetch anything. They only assert
 * that the closure document keeps telling the truth it was written with:
 * the two big JSON files are external references, not repository content, and
 * every integrity claim is accompanied by its evidence.
 */

import closure from '@/lib/hatchLab/baselines/A_WIDTHS/archiveClosure/BASE-ENGINE-A-WIDTHS-V1.archiveClosure.json';
import rawSourceReference from '@/lib/hatchLab/baselines/A_WIDTHS/BASE-ENGINE-A-WIDTHS-V1/raw/rawSourceReference.json';

const SHA256_HEX = /^[0-9A-F]{64}$/;

export function runAWidthsArchiveClosureTests() {
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.message }); }
  };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
  const ok = (v, msg) => { if (!v) throw new Error(msg); };

  check('closure binds to the sealed baseline', () => {
    eq(closure.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', 'baselineId');
    eq(closure.closureId, 'BASE-ENGINE-A-WIDTHS-V1-ARCHIVE-CLOSURE', 'closureId');
  });

  check('storage mode is external_verified, never claimed self_contained', () => {
    eq(closure.rawStorageMode, 'external_verified', 'rawStorageMode');
    eq(closure.captureStoredInRepository, false, 'captureStoredInRepository');
    eq(closure.summaryStoredInRepository, false, 'summaryStoredInRepository');
  });

  check('the repository raw folder holds only the reference file', () => {
    eq(closure.repositoryRawFolderContents.length, 1, 'raw folder entry count');
    eq(closure.repositoryRawFolderContents[0], 'rawSourceReference.json', 'raw folder entry');
  });

  check('external references are absolute URLs', () => {
    for (const key of ['captureExternalReference', 'summaryExternalReference']) {
      ok(/^https:\/\//.test(closure[key]), `${key} must be an https URL`);
    }
  });

  check('every declared hash is a full SHA-256 hex digest', () => {
    for (const key of ['rawCaptureSha256', 'rawSummarySha256', 'embeddedResultSha256']) {
      ok(SHA256_HEX.test(closure[key]), `${key} must be 64 uppercase hex chars`);
    }
  });

  check('closure hashes match the baseline raw reference manifest', () => {
    const manifest = JSON.stringify(rawSourceReference).toUpperCase();
    ok(manifest.includes(closure.rawCaptureSha256), 'capture hash must appear in rawSourceReference.json');
    ok(manifest.includes(closure.rawSummarySha256), 'summary hash must appear in rawSourceReference.json');
  });

  check('retrieval was verified with byte counts, not asserted', () => {
    const r = closure.retrievalEvidence;
    eq(closure.retrievalVerified, true, 'retrievalVerified');
    eq(r.captureBytesRetrieved, closure.captureSizeBytes, 'capture byte count');
    eq(r.summaryBytesRetrieved, closure.summarySizeBytes, 'summary byte count');
    eq(r.captureShaMatchesDeclared, true, 'captureShaMatchesDeclared');
    eq(r.summaryShaMatchesDeclared, true, 'summaryShaMatchesDeclared');
    eq(r.captureValidJson, true, 'captureValidJson');
    eq(r.summaryValidJson, true, 'summaryValidJson');
  });

  check('embedded hash claim carries its reproduction procedure', () => {
    eq(closure.embeddedHashReproduced, true, 'embeddedHashReproduced');
    ok(typeof closure.embeddedHashProcedure === 'string' && closure.embeddedHashProcedure.length > 40, 'embeddedHashProcedure must be documented');
  });

  check('both files are bound to one single invocation', () => {
    const id = closure.retrievalEvidence.identityFields;
    eq(id.baselineId, closure.baselineId, 'identity baselineId');
    eq(id.pipelineInvocationCount, 1, 'pipelineInvocationCount');
    ok(id.pipelineInvocationCountFoundIn.includes('capture'), 'count present in capture');
    ok(id.pipelineInvocationCountFoundIn.includes('summary'), 'count present in summary');
    eq(id.resultSha256SharedByBothFiles, true, 'shared resultSha256');
  });

  check('capture sections include the artefacts the baseline folder exposes', () => {
    for (const section of ['pipelineSnapshot', 'regionsSummary', 'evaluationReport', 'stageLog', 'engineInputAudit', 'editorParityAudit', 'baselineConfig']) {
      ok(closure.retrievalEvidence.captureTopLevelSections.includes(section), `capture must contain ${section}`);
    }
  });

  check('the earlier ambiguous wording is corrected, not deleted', () => {
    ok(closure.reclassification.previousWording.length > 0, 'previousWording recorded');
    ok(/(?:\b(?:is|are)\s+not\s+stored\s+inside\s+the\s+repository\b|\bneither\s+json\s+is\s+stored\s+inside\s+the\s+repository\b)/i.test(closure.reclassification.correctedStatement), 'correctedStatement must state the files are not in the repository');
  });

  check('limitations stay declared, including host dependency and IndexedDB scope', () => {
    const text = closure.limitations.join(' ');
    ok(closure.limitations.length >= 4, 'at least four limitations');
    ok(/external file host/i.test(text), 'host dependency declared');
    ok(/IndexedDB/i.test(text), 'IndexedDB scope declared');
    ok(/No second execution/i.test(text), 'single-execution guard declared');
  });

  check('the immutable baseline folder is declared untouched', () => {
    ok(/read only/i.test(closure.immutableFolderUntouched), 'immutableFolderUntouched must declare read-only access');
  });

  const fails = results.filter(r => !r.ok).map(r => `${r.name}: ${r.error}`);
  return {
    name: 'aWidthsArchiveClosure',
    pass: fails.length === 0,
    checks: results.length,
    fails,
  };
}