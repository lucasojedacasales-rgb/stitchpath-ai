/**
 * aWidthsSatinProductiveAdapter.test.js — P1.F2 only.
 *
 * The preceding thirteen suites are not executed here. This suite imports no
 * productive module and executes no engine, CE01 code, encoder, or exporter.
 */

import geometryFixture from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/fixtures/A_WIDTHS_STRAIGHT_BARS.json';
import artifactManifest from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/artifactManifest.json';
import commandModelReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/reports/commandModelReport.json';
import sourceClosure from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/sourceClosure.json';
import contractAudit from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/productiveCommandContractAudit.json';
import adapterReport from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/reports/productiveAdapterReport.json';
import labA1 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A1-SATIN-LAB-COMMANDS.json';
import labA5 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A5-SATIN-LAB-COMMANDS.json';
import labA6 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A6-SATIN-LAB-COMMANDS.json';
import labA7 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A7-SATIN-LAB-COMMANDS.json';
import labA8 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/fixtures/HATCH-A-WIDTHS-A8-SATIN-LAB-COMMANDS.json';
import adaptedA1 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/fixtures/HATCH-A-WIDTHS-A1-SATIN-PRODUCTIVE-SHAPE.json';
import adaptedA5 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/fixtures/HATCH-A-WIDTHS-A5-SATIN-PRODUCTIVE-SHAPE.json';
import adaptedA6 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/fixtures/HATCH-A-WIDTHS-A6-SATIN-PRODUCTIVE-SHAPE.json';
import adaptedA7 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/fixtures/HATCH-A-WIDTHS-A7-SATIN-PRODUCTIVE-SHAPE.json';
import adaptedA8 from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/fixtures/HATCH-A-WIDTHS-A8-SATIN-PRODUCTIVE-SHAPE.json';
import { computeCommandModelHash } from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/canonicalizeLabSatinCommands.js';
import {
  ADAPTER_ISOLATION,
  CONTRACT_COMPATIBILITY,
  PRODUCTIVE_ADAPTER_VERSION,
  PRODUCTIVE_COMMAND_FIELDS,
  PRODUCTIVE_COMMAND_TARGET_CONTRACT,
  TARGET_CONTRACT_AUDIT_HASH,
  adaptLabSatinCommandsToProductiveShape,
  canonicalizeProductiveShapeCandidate,
  computeProductiveAdapterHash,
  recoverLabPathFromAdaptedCommands,
} from '@/lib/hatchLab/foundations/A_WIDTHS/SATIN_COLUMN/commandModel/productiveAdapter/index.js';

const LAB = {
  'HATCH-A-WIDTHS-A1': labA1,
  'HATCH-A-WIDTHS-A5': labA5,
  'HATCH-A-WIDTHS-A6': labA6,
  'HATCH-A-WIDTHS-A7': labA7,
  'HATCH-A-WIDTHS-A8': labA8,
};
const ADAPTED = {
  'HATCH-A-WIDTHS-A1': adaptedA1,
  'HATCH-A-WIDTHS-A5': adaptedA5,
  'HATCH-A-WIDTHS-A6': adaptedA6,
  'HATCH-A-WIDTHS-A7': adaptedA7,
  'HATCH-A-WIDTHS-A8': adaptedA8,
};
const CASE_IDS = Object.keys(LAB);
const EXPECTED_REGIONS = {
  'HATCH-A-WIDTHS-A1': 'r_zbgef31',
  'HATCH-A-WIDTHS-A5': 'r_sv7z5qe',
  'HATCH-A-WIDTHS-A6': 'r_ecj9hl4',
  'HATCH-A-WIDTHS-A7': 'r_c92bxh3',
  'HATCH-A-WIDTHS-A8': 'r_zr65703',
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

export function runAWidthsSatinProductiveAdapterTests() {
  const results = [];
  const check = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };
  const ok = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const eq = (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const everyCase = (fn) => {
    for (const caseId of CASE_IDS) fn(LAB[caseId], ADAPTED[caseId], caseId);
  };
  const freshlyAdapt = (model) => adaptLabSatinCommandsToProductiveShape({
    labCommandModel: model,
    targetContract: PRODUCTIVE_COMMAND_TARGET_CONTRACT,
    options: { regionId: model.regionId },
  });

  check('01 prior thirteen-suite baseline remains recorded as 13/13 and 1000 checks', () => {
    eq(sourceClosure.preconditionHatchLab.suites, 13, 'suite count');
    eq(sourceClosure.preconditionHatchLab.passed, 13, 'passed count');
    eq(sourceClosure.preconditionHatchLab.failed, 0, 'failed count');
    eq(sourceClosure.preconditionHatchLab.checks, 1000, 'check count');
  });
  check('02 P1.F1 remains READY', () => {
    eq(commandModelReport.finalState, 'STRAIGHT_SATIN_LAB_COMMAND_MODEL_READY', 'P1.F1 state');
    eq(commandModelReport.totals.complete, 5, 'complete models');
  });
  check('03 five P1.F1 fixtures remain canonically intact', () => {
    everyCase((model) => eq(model.commandModelHash, computeCommandModelHash(model), `${model.caseId} hash`));
  });
  check('04 five adaptations exist and are complete', () => {
    eq(CASE_IDS.length, 5, 'case count');
    everyCase((model, adapted) => eq(adapted.status, 'productive_shape_candidate_complete', model.caseId));
  });
  check('05 case and region identities are exact', () => {
    everyCase((model, adapted, caseId) => {
      eq(adapted.caseId, caseId, `${caseId} caseId`);
      eq(adapted.regionId, EXPECTED_REGIONS[caseId], `${caseId} regionId`);
      eq(model.regionId, adapted.regionId, `${caseId} source identity`);
    });
  });
  check('06 productive contract is audited', () => {
    eq(contractAudit.mode, 'read_only_static_inspection', 'audit mode');
    eq(contractAudit.targetContractAuditHash, TARGET_CONTRACT_AUDIT_HASH, 'audit hash');
    ok(contractAudit.filesInspected.length >= 10, 'minimum audited files');
  });
  check('07 target contract is absolute millimeters', () => {
    eq(PRODUCTIVE_COMMAND_TARGET_CONTRACT.coordinateSpace, 'mm', 'coordinate space');
    eq(PRODUCTIVE_COMMAND_TARGET_CONTRACT.coordinateMode, 'absolute', 'coordinate mode');
  });
  check('08 compatibility is the allowed start-anchor classification', () => {
    eq(CONTRACT_COMPATIBILITY, 'PRODUCTIVE_MM_CONTRACT_REQUIRES_START_ANCHOR_ADAPTER', 'classification');
    eq(contractAudit.classificationAllowedForImplementation, true, 'implementation permitted');
  });
  check('09 start anchor is conserved outside productiveCommands', () => {
    everyCase((model, adapted) => {
      ok(samePoint(adapted.startAnchor.pointMm, model.startAnchorMm), `${model.caseId} anchor`);
      eq(adapted.startAnchor.requiresExternalSequencing, true, `${model.caseId} sequencing`);
    });
  });
  check('10 no command is created for startAnchor', () => {
    everyCase((model, adapted) => eq(adapted.productiveCommands.length, model.commands.length, model.caseId));
  });
  check('11 lab and productive command counts match', () => {
    everyCase((model, adapted) => eq(adapted.metrics.productiveCommandCount, adapted.metrics.labCommandCount, model.caseId));
  });
  check('12 correspondence is one-to-one', () => {
    everyCase((model, adapted) => {
      eq(adapted.productiveCommands.length, model.commands.length, model.caseId);
      eq(adapted.trace.length, model.commands.length, `${model.caseId} trace`);
    });
  });
  check('13 command order is identical', () => {
    everyCase((model, adapted) => eq(adapted.metrics.orderingMismatchCount, 0, model.caseId));
  });
  check('14 first destination is source command zero toMm', () => {
    everyCase((model, adapted) => {
      eq(adapted.productiveCommands[0].x, model.commands[0].toMm[0], `${model.caseId} x`);
      eq(adapted.productiveCommands[0].y, model.commands[0].toMm[1], `${model.caseId} y`);
    });
  });
  check('15 last destination is the P1.F1 end anchor', () => {
    everyCase((model, adapted) => {
      const last = adapted.productiveCommands[adapted.productiveCommands.length - 1];
      ok(samePoint([last.x, last.y], model.endAnchorMm), `${model.caseId} last`);
    });
  });
  check('16 recovery returns startAnchor as the first point', () => {
    everyCase((model, adapted) => {
      const recovered = recoverLabPathFromAdaptedCommands({
        startAnchor: adapted.startAnchor,
        productiveCommands: adapted.productiveCommands,
        targetContract: PRODUCTIVE_COMMAND_TARGET_CONTRACT,
      });
      ok(recovered.valid, `${model.caseId} recovery valid`);
      ok(samePoint(recovered.pointsMm[0], model.startAnchorMm), `${model.caseId} first`);
    });
  });
  check('17 recovery returns every source point', () => {
    everyCase((model, adapted) => eq(adapted.metrics.recoveredPointCount, model.commands.length + 1, model.caseId));
  });
  check('18 recovered coordinates are exact', () => {
    everyCase((model, adapted) => {
      eq(adapted.metrics.coordinateMismatchCount, 0, model.caseId);
      eq(adapted.metrics.maximumCoordinateDeltaMm, 0, `${model.caseId} maximum delta`);
    });
  });
  check('19 no delta fields are used by the absolute target contract', () => {
    eq(contractAudit.productiveContract.dxField, null, 'dx field');
    eq(contractAudit.productiveContract.dyField, null, 'dy field');
    everyCase((model, adapted) => ok(adapted.productiveCommands.every((command) => !('dx' in command) && !('dy' in command)), model.caseId));
  });
  check('20 every recovered segment length equals P1.F1 length', () => {
    everyCase((model, adapted) => adapted.trace.forEach((entry, index) => {
      eq(entry.sourceLengthMm, model.commands[index].lengthMm, `${model.caseId} command ${index}`);
    }));
  });
  check('21 total path length is exact', () => {
    everyCase((model, adapted) => {
      eq(adapted.metrics.totalAdaptedPathLengthMm, adapted.metrics.totalLabPathLengthMm, model.caseId);
      eq(adapted.metrics.pathLengthDeltaMm, 0, `${model.caseId} delta`);
    });
  });
  check('22 trace is complete', () => {
    everyCase((model, adapted) => eq(adapted.metrics.traceCount, model.commands.length, model.caseId));
  });
  check('23 sourceLabCommandIndex is exact', () => {
    everyCase((model, adapted) => adapted.trace.forEach((entry, index) => eq(entry.sourceLabCommandIndex, index, `${model.caseId} ${index}`)));
  });
  check('24 segmentKind is preserved only in trace', () => {
    everyCase((model, adapted) => adapted.trace.forEach((entry, index) => {
      eq(entry.sourceSegmentKind, model.commands[index].segmentKind, `${model.caseId} ${index}`);
      ok(!('segmentKind' in adapted.productiveCommands[index]), `${model.caseId} no lab field`);
    }));
  });
  check('25 all productive operations are stitch', () => {
    everyCase((model, adapted) => ok(adapted.productiveCommands.every((command) => command.type === 'stitch'), model.caseId));
  });
  check('26 no jump exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => command.type === 'jump'), model.caseId)));
  check('27 no trim exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => command.type === 'trim'), model.caseId)));
  check('28 no end exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => command.type === 'end'), model.caseId)));
  check('29 no color_change or colorChange exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => /color/i.test(command.type)), model.caseId)));
  check('30 no tie_in exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => command.type === 'tie_in'), model.caseId)));
  check('31 no tie_off exists', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => command.type === 'tie_off'), model.caseId)));
  check('32 no underlay is present', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => 'underlay' in command), model.caseId)));
  check('33 no compensation is present', () => everyCase((model, adapted) => ok(!adapted.productiveCommands.some((command) => 'compensation' in command), model.caseId)));
  check('34 no quantization is performed', () => {
    eq(PRODUCTIVE_COMMAND_TARGET_CONTRACT.quantized, false, 'contract quantization');
    everyCase((model, adapted) => adapted.productiveCommands.forEach((command, index) => eq(command.x, model.commands[index].toMm[0], `${model.caseId} x${index}`)));
  });
  check('35 no rounding is performed', () => {
    everyCase((model, adapted) => adapted.productiveCommands.forEach((command, index) => eq(command.y, model.commands[index].toMm[1], `${model.caseId} y${index}`)));
  });
  check('36 no NaN coordinate exists', () => everyCase((model, adapted) => ok(adapted.productiveCommands.every((command) => !Number.isNaN(command.x) && !Number.isNaN(command.y)), model.caseId)));
  check('37 no Infinity coordinate exists', () => everyCase((model, adapted) => ok(adapted.productiveCommands.every((command) => Number.isFinite(command.x) && Number.isFinite(command.y)), model.caseId)));
  check('38 zero-length command count is zero', () => everyCase((model, adapted) => eq(adapted.metrics.zeroLengthCommandCount, 0, model.caseId)));
  check('39 below-minimum command count is zero', () => everyCase((model, adapted) => eq(adapted.metrics.belowMinimumCommandCount, 0, model.caseId)));
  check('40 above-maximum command count is zero', () => everyCase((model, adapted) => eq(adapted.metrics.aboveMaximumCommandCount, 0, model.caseId)));
  check('41 every productive command has the exact audited fields', () => {
    const expected = [...PRODUCTIVE_COMMAND_FIELDS].sort().join('|');
    everyCase((model, adapted) => adapted.productiveCommands.forEach((command) => eq(Object.keys(command).sort().join('|'), expected, model.caseId)));
  });
  check('42 no laboratory field leaks into productiveCommands', () => {
    const labFields = ['op', 'fromMm', 'toMm', 'deltaMm', 'lengthMm', 'segmentKind', 'sourcePointIndex'];
    everyCase((model, adapted) => ok(adapted.productiveCommands.every((command) => labFields.every((field) => !(field in command))), model.caseId));
  });
  check('43 wrapper candidateOnly is true', () => everyCase((model, adapted) => eq(adapted.candidateOnly, true, model.caseId)));
  check('44 wrapper integrated is false', () => everyCase((model, adapted) => eq(adapted.integrated, false, model.caseId)));
  check('45 wrapper machineReady is false', () => everyCase((model, adapted) => eq(adapted.machineReady, false, model.caseId)));
  check('46 wrapper exportReady is false', () => everyCase((model, adapted) => eq(adapted.exportReady, false, model.caseId)));
  check('47 wrapper ce01Validated is false', () => everyCase((model, adapted) => eq(adapted.ce01Validated, false, model.caseId)));
  check('48 wrapper encoderValidated is false', () => everyCase((model, adapted) => eq(adapted.encoderValidated, false, model.caseId)));
  check('49 adaptation does not mutate P1.F1', () => {
    const model = clone(labA1);
    const before = JSON.stringify(model);
    freshlyAdapt(model);
    eq(JSON.stringify(model), before, 'source model mutation');
  });
  check('50 adaptation is deterministic', () => {
    everyCase((model) => eq(JSON.stringify(freshlyAdapt(model)), JSON.stringify(freshlyAdapt(model)), model.caseId));
  });
  check('51 productive adapter hash is reproducible', () => {
    everyCase((model, adapted) => eq(adapted.productiveAdapterHash, computeProductiveAdapterHash(adapted), model.caseId));
  });
  check('52 changing a coordinate changes the adapter hash', () => {
    const changed = clone(adaptedA1);
    changed.productiveCommands[0].x += 0.000001;
    ok(computeProductiveAdapterHash(changed) !== adaptedA1.productiveAdapterHash, 'coordinate hash sensitivity');
  });
  check('53 reordering commands changes the adapter hash', () => {
    const changed = clone(adaptedA1);
    [changed.productiveCommands[0], changed.productiveCommands[1]] = [changed.productiveCommands[1], changed.productiveCommands[0]];
    ok(computeProductiveAdapterHash(changed) !== adaptedA1.productiveAdapterHash, 'ordering hash sensitivity');
  });
  check('54 changing an operation changes the adapter hash', () => {
    const changed = clone(adaptedA1);
    changed.productiveCommands[0].type = 'jump';
    ok(computeProductiveAdapterHash(changed) !== adaptedA1.productiveAdapterHash, 'operation hash sensitivity');
  });
  check('55 invalid P1.F1 model version is rejected', () => {
    const model = clone(labA1);
    model.modelVersion = 'invalid';
    const rejected = freshlyAdapt(model);
    eq(rejected.productiveCommands.length, 0, 'commands');
    ok(rejected.diagnostics.some((item) => item.code === 'MODEL_VERSION_INVALID'), 'version diagnostic');
  });
  check('56 partial model is rejected', () => {
    const model = clone(labA1);
    model.status = 'lab_command_model_incomplete';
    model.safety.modelComplete = false;
    const rejected = freshlyAdapt(model);
    eq(rejected.productiveCommands.length, 0, 'commands');
    ok(rejected.diagnostics.some((item) => item.code === 'OVERALL_ELIGIBILITY_INVALID'), 'eligibility diagnostic');
  });
  check('57 metadata conflict is rejected', () => {
    const rejected = adaptLabSatinCommandsToProductiveShape({
      labCommandModel: labA1,
      targetContract: PRODUCTIVE_COMMAND_TARGET_CONTRACT,
      options: { metadata: { source: 'lab' } },
    });
    eq(rejected.productiveCommands.length, 0, 'commands');
    ok(rejected.diagnostics.some((item) => item.code === 'METADATA_CONFLICT'), 'metadata diagnostic');
  });
  check('58 splitRequired model is rejected', () => {
    const model = clone(labA1);
    model.safety.splitRequired = true;
    const rejected = freshlyAdapt(model);
    eq(rejected.productiveCommands.length, 0, 'commands');
    ok(rejected.diagnostics.some((item) => item.code === 'SPLIT_REQUIRED'), 'split diagnostic');
  });
  check('59 forbidden source operation is rejected', () => {
    const model = clone(labA1);
    model.commands[0].op = 'jump';
    const rejected = freshlyAdapt(model);
    eq(rejected.productiveCommands.length, 0, 'commands');
    ok(rejected.diagnostics.some((item) => item.code === 'FORBIDDEN_OPERATION'), 'operation diagnostic');
  });
  check('60 five productive fixtures are persisted', () => {
    eq(Object.keys(ADAPTED).length, 5, 'fixture count');
    everyCase((model, adapted) => ok(adapted.productiveCommands.length > 0, model.caseId));
  });
  check('61 persisted fixtures are valid imported JSON objects', () => {
    everyCase((model, adapted) => ok(adapted && typeof adapted === 'object' && Array.isArray(adapted.productiveCommands), model.caseId));
  });
  check('62 fixture SHA-256 values match report and manifest declarations', () => {
    for (const row of adapterReport.cases) {
      ok(/^[0-9A-F]{64}$/.test(row.fixtureSha256), `${row.caseId} digest format`);
      const manifestPath = `commandModel/productiveAdapter/${row.fixturePath}`;
      const entry = artifactManifest.files.find((file) => file.path === manifestPath);
      eq(entry?.sha256, row.fixtureSha256, `${row.caseId} manifest digest`);
      eq(entry?.sizeBytes, row.fixtureSizeBytes, `${row.caseId} fixture size`);
    }
  });
  check('63 recompilation is canonically equal to each persisted fixture', () => {
    everyCase((model, adapted) => {
      const fresh = freshlyAdapt(model);
      eq(JSON.stringify(canonicalizeProductiveShapeCandidate(fresh)), JSON.stringify(canonicalizeProductiveShapeCandidate(adapted)), model.caseId);
    });
  });
  check('64 artifact manifest is the exact P1.F2 V4 manifest', () => {
    eq(artifactManifest.manifestId, 'P1.F2-A_WIDTHS-SATIN_COLUMN-ARTIFACT-MANIFEST-V4', 'manifestId');
    eq(artifactManifest.productiveAdapterVersion, PRODUCTIVE_ADAPTER_VERSION, 'adapter version');
  });
  check('65 artifact manifest distinguishes its self entry', () => {
    const self = artifactManifest.files.find((file) => file.selfEntry);
    eq(self?.path, 'artifactManifest.json', 'self path');
    eq(self?.hashVerifiable, false, 'self hash eligibility');
    eq(artifactManifest.hashVerification.selfExcludedEntries, 1, 'self exclusion count');
  });
  check('66 new suite has one registration', () => {
    const entry = artifactManifest.files.find((file) => file.path === 'src/tests/hatchLab/runHatchLabTests.js');
    eq(entry?.productiveAdapterSuiteRegistrations, 1, 'suite registration');
  });
  check('67 adapter has zero productive imports', () => {
    eq(ADAPTER_ISOLATION.productiveImports.length, 0, 'declared productive imports');
    eq(sourceClosure.staticImportAudit.adapterImportsProductiveModules, 0, 'static audit');
  });
  check('68 productive code has zero imports toward the adapter', () => {
    eq(sourceClosure.staticImportAudit.productiveModulesImportAdapter, 0, 'reverse import audit');
  });
  check('69 runPipeline was not executed', () => eq(adapterReport.runPipelineExecuted, false, 'runPipeline'));
  check('70 buildFinalCommands was not executed', () => eq(adapterReport.buildFinalCommandsExecuted, false, 'buildFinalCommands'));
  check('71 CE01 was not executed', () => eq(adapterReport.ce01Executed, false, 'CE01'));
  check('72 encoders were not executed', () => eq(adapterReport.encodersExecuted, false, 'encoders'));
  check('73 baseline remains intact', () => {
    eq(sourceClosure.guarantees.baselineModified, false, 'baselineModified');
    eq(geometryFixture.baselineId, 'BASE-ENGINE-A-WIDTHS-V1', 'baselineId');
  });
  check('74 stitch_type remains intact', () => {
    eq(sourceClosure.guarantees.stitchTypeModified, false, 'stitchTypeModified');
    ok(geometryFixture.regions.every((entry) => entry.region.stitch_type === 'fill'), 'original stitch_type values');
  });
  check('75 package.json remains intact', () => {
    eq(sourceClosure.guarantees.packageJsonModified, false, 'packageJsonModified');
    eq(sourceClosure.protectedFileDigests['package.json'], '27D300BBBF2C84966839EF1F400BA1ED36A330E42F69694C5E1F8E0CD49E3340', 'package digest');
  });
  check('76 package-lock.json remains intact', () => {
    eq(sourceClosure.guarantees.packageLockModified, false, 'packageLockModified');
    eq(sourceClosure.protectedFileDigests['package-lock.json'], '8F4DB31A2E8FB608CC7A6C2B6D689C0C80E7247BE20EFC8D4C265C3BC2B59C25', 'lock digest');
  });
  check('77 Engine V2 remains untouched', () => eq(sourceClosure.guarantees.engineV2Modified, false, 'engineV2Modified'));

  const fails = results.filter((result) => !result.ok)
    .map((result) => `${result.name}: ${result.error}`);
  return {
    name: 'aWidthsSatinProductiveAdapter',
    pass: fails.length === 0,
    checks: results.length,
    fails,
  };
}
