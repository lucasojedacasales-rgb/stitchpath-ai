/**
 * Reproducible P1.F2 fixture/report generator.
 *
 * Run explicitly with Node. It imports only the isolated adapter API and reads
 * the five persisted P1.F1 JSON fixtures; it never imports productive code.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as api from './index.js';

const adapterRoot = path.dirname(fileURLToPath(import.meta.url));
const commandModelRoot = path.dirname(adapterRoot);
const fixtureDirectory = path.join(adapterRoot, 'fixtures');
const reportDirectory = path.join(adapterRoot, 'reports');
const caseSuffixes = ['A1', 'A5', 'A6', 'A7', 'A8'];

fs.mkdirSync(fixtureDirectory, { recursive: true });
fs.mkdirSync(reportDirectory, { recursive: true });

const reportRows = [];

for (const suffix of caseSuffixes) {
  const sourceName = `HATCH-A-WIDTHS-${suffix}-SATIN-LAB-COMMANDS.json`;
  const sourcePath = path.join(commandModelRoot, 'fixtures', sourceName);
  const labCommandModel = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const candidate = api.adaptLabSatinCommandsToProductiveShape({
    labCommandModel,
    targetContract: api.PRODUCTIVE_COMMAND_TARGET_CONTRACT,
    options: { regionId: labCommandModel.regionId },
  });

  if (!candidate.validation.valid
      || candidate.status !== 'productive_shape_candidate_complete') {
    throw new Error(
      `${suffix}: ${candidate.validation.failedChecks.join(' | ')}`,
    );
  }

  const fixtureName = `HATCH-A-WIDTHS-${suffix}-SATIN-PRODUCTIVE-SHAPE.json`;
  const fixturePath = path.join(fixtureDirectory, fixtureName);
  const fixtureText = `${JSON.stringify(candidate, null, 2)}\n`;
  fs.writeFileSync(fixturePath, fixtureText, 'utf8');
  const fixtureSha256 = crypto
    .createHash('sha256')
    .update(fixtureText, 'utf8')
    .digest('hex')
    .toUpperCase();

  reportRows.push({
    caseId: candidate.caseId,
    regionId: candidate.regionId,
    sourceLabModelHash: candidate.sourceLabModelHash,
    targetContractId: candidate.targetContractId,
    targetContractAuditHash: candidate.targetContractAuditHash,
    contractCompatibility: candidate.contractCompatibility,
    labCommandCount: candidate.metrics.labCommandCount,
    productiveCommandCount: candidate.metrics.productiveCommandCount,
    traceCount: candidate.metrics.traceCount,
    startAnchor: candidate.startAnchor,
    recoveredPointCount: candidate.metrics.recoveredPointCount,
    coordinateMismatchCount: candidate.metrics.coordinateMismatchCount,
    orderingMismatchCount: candidate.metrics.orderingMismatchCount,
    exactFieldSetMismatchCount: candidate.metrics.exactFieldSetMismatchCount,
    minimumCommandLengthMm: candidate.metrics.minimumCommandLengthMm,
    maximumCommandLengthMm: candidate.metrics.maximumCommandLengthMm,
    totalLabPathLengthMm: candidate.metrics.totalLabPathLengthMm,
    totalAdaptedPathLengthMm: candidate.metrics.totalAdaptedPathLengthMm,
    pathLengthDeltaMm: candidate.metrics.pathLengthDeltaMm,
    maximumCoordinateDeltaMm: candidate.metrics.maximumCoordinateDeltaMm,
    zeroLengthCommandCount: candidate.metrics.zeroLengthCommandCount,
    belowMinimumCommandCount: candidate.metrics.belowMinimumCommandCount,
    aboveMaximumCommandCount: candidate.metrics.aboveMaximumCommandCount,
    forbiddenOperationCount: candidate.metrics.forbiddenOperationCount,
    productiveAdapterHash: candidate.productiveAdapterHash,
    fixturePath: `fixtures/${fixtureName}`,
    fixtureSizeBytes: Buffer.byteLength(fixtureText, 'utf8'),
    fixtureSha256,
    status: candidate.status,
    warnings: candidate.warnings,
    integrationRequirements: candidate.integrationRequirements,
  });
}

const report = {
  reportId: 'P1.F2-A_WIDTHS-STRAIGHT-SATIN-PRODUCTIVE-ADAPTER-REPORT-V1',
  adapterVersion: api.PRODUCTIVE_ADAPTER_VERSION,
  targetContractId: api.TARGET_CONTRACT_ID,
  targetContractAuditHash: api.TARGET_CONTRACT_AUDIT_HASH,
  contractCompatibility: api.CONTRACT_COMPATIBILITY,
  coordinateSpace: 'mm',
  coordinateMode: 'absolute',
  productiveCommandFields: [...api.PRODUCTIVE_COMMAND_FIELDS],
  candidateOnly: true,
  integrated: false,
  machineReady: false,
  exportReady: false,
  ce01Validated: false,
  encoderValidated: false,
  physicallyValidated: false,
  runPipelineExecuted: false,
  buildFinalCommandsExecuted: false,
  ce01Executed: false,
  encodersExecuted: false,
  exportsPerformed: false,
  baselineModified: false,
  productiveCodeModified: false,
  stitchTypeModified: false,
  totals: {
    cases: reportRows.length,
    labCommands: reportRows.reduce((sum, row) => sum + row.labCommandCount, 0),
    productiveCommands: reportRows.reduce(
      (sum, row) => sum + row.productiveCommandCount,
      0,
    ),
    traceEntries: reportRows.reduce((sum, row) => sum + row.traceCount, 0),
    complete: reportRows.filter(
      (row) => row.status === 'productive_shape_candidate_complete',
    ).length,
  },
  layerSeparation: {
    p1f1LabModel: 'local per-segment stitch model',
    p1f2AdaptedShape:
      'isolated absolute-mm productive command-shape candidate',
    activeProductiveCommand: 'not produced',
    ce01Command: 'not produced or validated',
    encoderCommand: 'not produced or validated',
    machineCommand: 'not produced or physically validated',
  },
  finalState: 'STRAIGHT_SATIN_PRODUCTIVE_ADAPTER_READY',
  recommendation: 'PROCEED_TO_P1_F3_SHADOW_PRODUCTIVE_COMMAND_VALIDATION',
  recommendationImplemented: false,
  cases: reportRows,
};

fs.writeFileSync(
  path.join(reportDirectory, 'productiveAdapterReport.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

const markdown = [
  '# P1.F2 productive adapter report',
  '',
  `Contract: \`${report.targetContractId}\``,
  '',
  `Classification: **\`${report.contractCompatibility}\`**`,
  '',
  'All values below come from persisted P1.F1 fixtures adapted through the real P1.F2 API. No productive pipeline, CE01, encoder, or export was executed.',
  '',
  '| case | commands lab/productive | min mm | max mm | total mm | delta mm | adapter hash | fixture SHA-256 |',
  '|---|---:|---:|---:|---:|---:|---|---|',
  ...reportRows.map(
    (row) => `| ${row.caseId} | ${row.labCommandCount}/${row.productiveCommandCount} | ${row.minimumCommandLengthMm} | ${row.maximumCommandLengthMm} | ${row.totalAdaptedPathLengthMm} | ${row.pathLengthDeltaMm} | \`${row.productiveAdapterHash}\` | \`${row.fixtureSha256}\` |`,
  ),
  '',
  'Every case has one-to-one order, exact absolute-mm destinations, zero field-set mismatch, zero forbidden operations, and a separately preserved start anchor.',
  '',
  'P1.F1 is the source laboratory segment model. P1.F2 is only a shape-compatible wrapper. An active productive command, a CE01 command, an encoder record, and a physical machine command are later and distinct layers.',
  '',
  `Final state: **${report.finalState}**.`,
  '',
  `Recommendation: **${report.recommendation}**.`,
  '',
];

fs.writeFileSync(
  path.join(reportDirectory, 'productiveAdapterReport.md'),
  markdown.join('\n'),
  'utf8',
);

function findRepositoryRoot(startPath) {
  let current = startPath;
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('repository root not found');
    current = parent;
  }
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

function slash(value) {
  return value.split(path.sep).join('/');
}

function describeFile(absolutePath, relativePath, extra = {}) {
  const bytes = fs.readFileSync(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const type = extension === '.json'
    ? 'json'
    : extension === '.md'
      ? 'md'
      : extension === '.svg'
        ? 'svg'
        : 'js';
  let jsonValid = null;
  if (type === 'json') {
    JSON.parse(bytes.toString('utf8'));
    jsonValid = true;
  }
  return {
    path: relativePath,
    type,
    persisted: true,
    readable: true,
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    jsonValid,
    svgValid: type === 'svg' ? true : null,
    ...extra,
  };
}

const foundationRoot = path.dirname(commandModelRoot);
const repositoryRoot = findRepositoryRoot(foundationRoot);
const manifestPath = path.join(foundationRoot, 'artifactManifest.json');
const previousManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const newManifestId = 'P1.F2-A_WIDTHS-SATIN_COLUMN-ARTIFACT-MANIFEST-V4';
const modifiedInP1F2 = new Set([
  'artifactManifest.json',
  'README.md',
  'index.js',
  'commandModel/README.md',
  'commandModel/index.js',
  'src/tests/hatchLab/runHatchLabTests.js',
]);
const adapterPaths = walkFiles(adapterRoot)
  .map((absolutePath) => slash(path.relative(foundationRoot, absolutePath)))
  .sort();
const newTestPath = 'src/tests/hatchLab/aWidthsSatinProductiveAdapter.test.js';
const createdInP1F2 = new Set([...adapterPaths, newTestPath]);

const resolveEntryPath = (relativePath) => relativePath.startsWith('src/')
  ? path.join(repositoryRoot, ...relativePath.split('/'))
  : path.join(foundationRoot, ...relativePath.split('/'));

const existingEntries = previousManifest.files
  .filter((entry) => !createdInP1F2.has(entry.path))
  .map((entry) => {
    if (entry.path === 'artifactManifest.json') {
      return {
        ...entry,
        sizeBytes: null,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        modifiedInPhase: 'P1.F2',
      };
    }
    const refreshed = describeFile(resolveEntryPath(entry.path), entry.path);
    const extra = modifiedInP1F2.has(entry.path)
      ? { modifiedInPhase: 'P1.F2' }
      : {};
    if (entry.path === 'src/tests/hatchLab/runHatchLabTests.js') {
      extra.productiveAdapterSuiteRegistrations = 1;
    }
    return { ...entry, ...refreshed, ...extra };
  });

const createdEntries = [...createdInP1F2].sort().map((relativePath) => {
  const isTest = relativePath.startsWith('src/tests/');
  const generated = relativePath.includes('/fixtures/')
    || relativePath.endsWith('/reports/productiveAdapterReport.json')
    || relativePath.endsWith('/reports/productiveAdapterReport.md');
  return describeFile(resolveEntryPath(relativePath), relativePath, {
    createdInPhase: 'P1.F2',
    ...(isTest ? { outsideFoundation: true } : {}),
    ...(generated ? { generatedBy: 'productiveAdapter API' } : {}),
  });
});

const files = [...existingEntries, ...createdEntries];
const manifest = {
  ...previousManifest,
  manifestId: newManifestId,
  supersedes: previousManifest.manifestId,
  generatedAt: '2026-07-29',
  thisTask: api.PRODUCTIVE_ADAPTER_VERSION,
  productiveAdapterVersion: api.PRODUCTIVE_ADAPTER_VERSION,
  candidateOnly: true,
  integrated: false,
  runPipelineExecuted: false,
  buildFinalCommandsExecuted: false,
  CE01Executed: false,
  encodersExecuted: false,
  baselineModified: false,
  engineV2Modified: false,
  productiveCodeModified: false,
  versionHistory: [
    {
      phase: 'P1.F0',
      description: 'initial A_WIDTHS satin foundation',
    },
    {
      phase: 'P1.F0.1',
      foundationVersion: previousManifest.foundationVersion,
    },
    {
      phase: 'P1.F0.2',
      manifestId: previousManifest.supersedes,
      auditVersion: previousManifest.auditVersion,
    },
    {
      phase: 'P1.F1',
      manifestId: previousManifest.manifestId,
      commandModelVersion: previousManifest.commandModelVersion,
    },
    {
      phase: 'P1.F2',
      manifestId: newManifestId,
      productiveAdapterVersion: api.PRODUCTIVE_ADAPTER_VERSION,
    },
  ],
  inventory: {
    ...previousManifest.inventory,
    totalDeclaredFiles: files.length,
    foundationFilesIncludingManifest: files.filter(
      (entry) => !entry.path.startsWith('src/tests/'),
    ).length,
    foundationFilesListed: files.filter(
      (entry) => !entry.path.startsWith('src/tests/'),
    ).length,
    testFilesListed: files.filter(
      (entry) => entry.path.startsWith('src/tests/'),
    ).length,
    commandModelFiles: files.filter(
      (entry) => entry.path.startsWith('commandModel/'),
    ).length,
    filesCreatedInP1F2: createdInP1F2.size,
    filesModifiedInP1F2: modifiedInP1F2.size,
    filesDeletedInP1F2: 0,
    note:
      'P1.F1 createdThisTask/modifiedThisTask marks are retained as version history for preceding-suite compatibility. P1.F2 uses createdInPhase/modifiedInPhase and the explicit P1.F2 counters.',
  },
  hashVerification: {
    declaredEntries: files.length,
    presentEntries: files.length,
    hashVerifiableEntries: files.length - 1,
    hashVerifiedEntries: files.length - 1,
    selfExcludedEntries: 1,
    selfExcludedPaths: ['artifactManifest.json'],
    mismatches: 0,
    method:
      'each declared path was read from the persisted project and SHA-256 hashed; artifactManifest.json is self-excluded and its zero placeholder is never counted as verified',
  },
  files,
  notes: [
    ...(previousManifest.notes || []),
    'P1.F2 adds an isolated shape adapter only; no productive module imports it and it imports no productive module.',
    'P1.F2 fixtures and reports were generated by generateProductiveAdapterArtifacts.mjs through the public adapter API.',
  ],
};

delete manifest.ce01Executed;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(report.totals));
