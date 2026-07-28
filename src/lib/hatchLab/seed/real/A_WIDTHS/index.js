/**
 * A_WIDTHS real seed subset — Hatch Lab (P0.2B)
 * Read-only data module. No rule is applied to the engine, no pipeline is run.
 * Nothing outside src/lib/hatchLab/** and src/tests/hatchLab/** imports this file.
 */

import packageProvenance from './packageProvenance.json';
import evidenceIndex from './evidenceIndex.json';
import seedManifest from './seedManifest.json';
import caseA1 from './cases/HATCH-A-WIDTHS-A1.json';
import caseA5 from './cases/HATCH-A-WIDTHS-A5.json';
import caseA6 from './cases/HATCH-A-WIDTHS-A6.json';
import caseA7 from './cases/HATCH-A-WIDTHS-A7.json';
import caseA8 from './cases/HATCH-A-WIDTHS-A8.json';

export const A_WIDTHS_PACKAGE_PROVENANCE = packageProvenance;
export const A_WIDTHS_EVIDENCE_INDEX = evidenceIndex;
export const A_WIDTHS_SEED_MANIFEST = seedManifest;
export const A_WIDTHS_CASES = [caseA1, caseA5, caseA6, caseA7, caseA8];

/** All evidence references declared in the index, as a lookup set. */
export function evidenceReferenceSet() {
  return new Set((evidenceIndex.entries || []).map(e => e.relativePath));
}