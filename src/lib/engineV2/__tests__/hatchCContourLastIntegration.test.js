import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileCanonicalCommandStream } from '../commandCompilation/canonicalCommandCompiler.js';
import {
  HATCH_C_REFERENCE_DESIGN_MM,
  HATCH_C_REFERENCE_FIXTURES,
  HATCH_C_REFERENCE_SOURCE,
  createHatchCReferenceRegions,
  createHatchCReferenceSemanticResult,
} from './fixtures/hatchCReferenceFixtures.js';
import { ingestV1RegionsToRegionGraphV2 } from '../ingestion/regionIngestion.js';
import { materializeEmbroideryObjectDrafts } from '../materialization/objectDraftMaterializer.js';
import { createRegionV2 } from '../model.js';
import { runEngineV2RegionToBinary } from '../orchestration/regionToBinaryOrchestrator.js';
import { createObjectPlanningDiagnostic } from '../planning/objectPlanningDiagnostics.js';
import { buildEmbroideryObjectProposalPlan } from '../planning/objectPlanningPipeline.js';
import { buildEmbroideryProposalDependencies } from '../planning/dependencyPlanner.js';
import { buildGlobalSequencePlan } from '../sequencing/globalSequencePlanner.js';
import { createSemanticRegionAssessmentV2 } from '../semantics/semanticRoleModel.js';
import { buildMachineIndependentPhysicalStitchPlan } from '../stitchGeneration/physicalStitchPipeline.js';
import { buildTechnicalEmbroideryPlan } from '../technical/technicalPlanningPipeline.js';
import { materializeThreadedEmbroideryObjects } from '../threads/finalObjectMaterializer.js';
import {
  CONTOUR_LAST_ASSOCIATION_LIMIT,
  CONTOUR_LAST_RULE_ID,
  evaluateContourLastProposalGuard,
} from '../rules/hatchEvidence/contourLast.js';
import { COLOR_GROUP_HEURISTIC_RULE_ID } from '../rules/hatchEvidence/colorGroupHeuristic.js';
import { MULTILAYER_DEPENDENCY_RULE_ID } from '../rules/hatchEvidence/multilayerDependency.js';
import {
  DEFAULT_HATCH_OVERLAP_PROFILE,
  DEFAULT_HATCH_OVERLAP_RULE_FLAGS,
  HATCH_OVERLAP_PROFILES,
  HATCH_OVERLAP_RULE_IDS,
  resolveHatchOverlapIntegrationConfig,
  validateHatchOverlapIntegrationConfig,
} from '../rules/hatchEvidence/overlapProfiles.js';
import {
  HATCH_EVIDENCE_RULE_IDS,
  resolveHatchEvidenceIntegrationConfig,
} from '../rules/hatchEvidence/profiles.js';
import {
  HATCH_EVIDENCE_REGISTRY,
  HATCH_EVIDENCE_RULES,
  getHatchEvidenceRules,
  validateHatchEvidenceRegistry,
} from '../rules/hatchEvidence/registry.js';
import {
  resolveObjectPlanningConfig,
  validateObjectPlanningConfig,
} from '../planning/planningConfig.js';

const C_CONFIG = Object.freeze({
  hatchOverlapProfile: 'hatch-c-experimental',
  hatchOverlapRuleFlags: Object.freeze({ [CONTOUR_LAST_RULE_ID]: true }),
});

const C_EXPECTED_DIGITAL_PROBES = Object.freeze({
  C7: Object.freeze({
    physicalPointCount: 412,
    commandCount: 427,
    physicalSha256: '734a4beb305bc6d3cf1eb790c4de283a8d585f976a33d2af928abec994de385a',
    commandSha256: '34515292bce20add7f4ebc9ab8f88047fdf725e5aa9d519cf41fda5bbad317d0',
  }),
  C8: Object.freeze({
    physicalPointCount: 285,
    commandCount: 291,
    physicalSha256: '6c9ce744f573b8009c5ae70c9010665005c04b9781b79756493aff89837b4237',
    commandSha256: 'a7d030f4dea4ae5cd80e98ff6b0c4391e47f4aede777a5695cbfec4038287d2e',
  }),
  C11: Object.freeze({
    physicalPointCount: 371,
    commandCount: 379,
    physicalSha256: '10e80f957920e77dc8c92e8e9706ef3c7c3ef2392c378b4c0a15ad822d259c50',
    commandSha256: '2ac7dbf99d6d65863c0698affea8a2bd25a7f685c91aecd8f18708858cfdd958',
  }),
  C12: Object.freeze({
    physicalPointCount: 428,
    commandCount: 440,
    physicalSha256: '500114469154a0191259d437f09226a7a9c4e5c2d0bbfc3275e5e3f24880d2bf',
    commandSha256: '14a9034a8b2ca0a6fe129f074fddbd7ca825610d191c137b9aa8df73e5082dae',
  }),
});

const sha256Json = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function planningConfig(extra = {}) {
  return {
    designWidthMm: HATCH_C_REFERENCE_DESIGN_MM.width,
    designHeightMm: HATCH_C_REFERENCE_DESIGN_MM.height,
    minimumTatamiAreaMm2: 5,
    ...extra,
  };
}

function runReference(referenceId, { contourLast = true, reverseInput = false, extraConfig = {} } = {}) {
  const sourceRegions = createHatchCReferenceRegions(referenceId);
  const technicalConfig = referenceId === 'C12'
    ? { tatami: { minimumAreaMm2: 5 } }
    : {};
  if (reverseInput) sourceRegions.reverse();
  const sourceBefore = structuredClone(sourceRegions);
  const ingestion = ingestV1RegionsToRegionGraphV2(sourceRegions, {
    coordinateSpace: 'millimeter',
    designWidthMm: HATCH_C_REFERENCE_DESIGN_MM.width,
    designHeightMm: HATCH_C_REFERENCE_DESIGN_MM.height,
  });
  const semanticResult = createHatchCReferenceSemanticResult(ingestion.regions, referenceId);
  const proposalPlan = buildEmbroideryObjectProposalPlan({
    regions: ingestion.regions,
    graph: ingestion.graph,
    semanticResult,
    config: planningConfig({
      ...(contourLast ? C_CONFIG : {}),
      ...extraConfig,
    }),
    technicalConfig,
  });
  const objectDraftMaterialization = materializeEmbroideryObjectDrafts({
    regions: ingestion.regions,
    graph: ingestion.graph,
    semanticResult,
    proposalPlan,
  });
  const threadedObjectMaterialization = materializeThreadedEmbroideryObjects({
    regions: ingestion.regions,
    objectDraftMaterialization,
  });
  const technicalPlan = buildTechnicalEmbroideryPlan({
    regions: ingestion.regions,
    threadedObjectMaterialization,
    config: technicalConfig,
  });
  const sequencePlan = buildGlobalSequencePlan({
    regions: ingestion.regions,
    threadedObjectMaterialization,
    technicalPlan,
  });
  const physicalPlan = buildMachineIndependentPhysicalStitchPlan({
    regions: ingestion.regions,
    threadedObjectMaterialization,
    technicalPlan,
    sequencePlan,
  });
  const canonicalCompilation = compileCanonicalCommandStream({
    regions: ingestion.regions,
    threadedObjectMaterialization,
    technicalPlan,
    sequencePlan,
    physicalPlan,
  });
  return {
    sourceRegions,
    sourceBefore,
    ingestion,
    semanticResult,
    proposalPlan,
    objectDraftMaterialization,
    threadedObjectMaterialization,
    technicalPlan,
    sequencePlan,
    physicalPlan,
    canonicalCompilation,
  };
}

function regionOrder(run, stage) {
  const objectById = new Map(run.threadedObjectMaterialization.objects.map(object => [object.id, object]));
  if (stage === 'proposals') return run.proposalPlan.proposals.map(item => item.regionId);
  if (stage === 'drafts') return run.objectDraftMaterialization.drafts.map(item => item.regionId);
  if (stage === 'objects') return run.threadedObjectMaterialization.objects.map(item => item.regionId);
  if (stage === 'execution') return run.sequencePlan.executionSteps.map(item => objectById.get(item.objectId).regionId);
  if (stage === 'physical') return run.physicalPlan.objectPaths.map(item => objectById.get(item.objectId).regionId);
  return run.canonicalCompilation.executionOrder.map(objectId => objectById.get(objectId).regionId);
}

function operationalSnapshot(run) {
  return {
    proposalOrder: regionOrder(run, 'proposals'),
    draftOrder: regionOrder(run, 'drafts'),
    objectOrder: regionOrder(run, 'objects'),
    executionOrder: regionOrder(run, 'execution'),
    physicalOrder: regionOrder(run, 'physical'),
    canonicalOrder: regionOrder(run, 'canonical'),
    proposals: run.proposalPlan.proposals.map(item => ({
      regionId: item.regionId,
      role: item.proposedEmbroideryRole,
      stitchType: item.proposedStitchType,
      geometryMm: item.geometryMm,
      holesMm: item.holesMm,
      visualColor: item.visualColor,
      dependencyIds: item.dependencyIds,
    })),
    physicalPaths: run.physicalPlan.objectPaths,
    commands: run.canonicalCompilation.commands,
  };
}

function expectValidPreExportRun(run) {
  [
    run.ingestion,
    run.proposalPlan,
    run.objectDraftMaterialization,
    run.threadedObjectMaterialization,
    run.technicalPlan,
    run.sequencePlan,
    run.physicalPlan,
    run.canonicalCompilation,
  ].forEach(result => expect(result.valid).toBe(true));
  expect(run.sourceRegions).toEqual(run.sourceBefore);
}

describe('Hatch C independent profile', () => {
  it('defaults independently to legacy with CONTOUR-LAST OFF', () => {
    expect(DEFAULT_HATCH_OVERLAP_PROFILE).toBe('legacy');
    expect(HATCH_OVERLAP_PROFILES).toEqual(['legacy', 'hatch-c-experimental']);
    expect(HATCH_OVERLAP_RULE_IDS).toEqual([
      CONTOUR_LAST_RULE_ID,
      COLOR_GROUP_HEURISTIC_RULE_ID,
      MULTILAYER_DEPENDENCY_RULE_ID,
    ]);
    expect(DEFAULT_HATCH_OVERLAP_RULE_FLAGS).toEqual({
      [CONTOUR_LAST_RULE_ID]: false,
      [COLOR_GROUP_HEURISTIC_RULE_ID]: false,
      [MULTILAYER_DEPENDENCY_RULE_ID]: false,
    });
    expect(resolveHatchOverlapIntegrationConfig()).toEqual({
      profile: 'legacy',
      ruleFlags: DEFAULT_HATCH_OVERLAP_RULE_FLAGS,
      enabledRuleIds: [],
    });
  });

  it('resolves raw, resolved and reused C configuration idempotently with one extras', () => {
    const raw = {
      extras: {
        hatchOverlapProfile: 'legacy',
        hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: false },
        nestedOnly: true,
      },
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: true },
      topLevelOnly: true,
    };
    const first = resolveObjectPlanningConfig(raw);
    const second = resolveObjectPlanningConfig(first);
    const third = resolveObjectPlanningConfig(second);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first.extras).toMatchObject({
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: true },
      nestedOnly: true,
      topLevelOnly: true,
    });
    expect(first.extras).not.toHaveProperty('extras');
    expect(resolveHatchOverlapIntegrationConfig(first).enabledRuleIds).toEqual([CONTOUR_LAST_RULE_ID]);
  });

  it('rejects legacy activation, unknown profiles, fields, flags and flag types', () => {
    expect(validateHatchOverlapIntegrationConfig({
      hatchOverlapProfile: 'legacy',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: true },
    }).errors.map(error => error.code)).toContain('HATCH_OVERLAP_RULE_FLAG_REQUIRES_EXPERIMENTAL_PROFILE');
    expect(validateHatchOverlapIntegrationConfig({
      hatchOverlapProfile: 'future',
    }).errors.map(error => error.code)).toContain('INVALID_HATCH_OVERLAP_PROFILE');
    expect(validateHatchOverlapIntegrationConfig({
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapContext: {},
    }).errors.map(error => error.code)).toContain('UNKNOWN_HATCH_OVERLAP_CONFIG_FIELD');
    expect(validateHatchOverlapIntegrationConfig({
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { 'OVERLAP-CUTOUT-001': true },
    }).errors.map(error => error.code)).toContain('UNKNOWN_HATCH_OVERLAP_RULE_FLAG');
    expect(validateObjectPlanningConfig({
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: 'yes' },
    }).errors.map(error => error.code)).toContain('INVALID_HATCH_OVERLAP_RULE_FLAG_VALUE');
  });

  it('rejects explicit undefined C fields even when valid extras exist', () => {
    const validExtras = {
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: true },
    };
    expect(validateHatchOverlapIntegrationConfig({
      extras: validExtras,
      hatchOverlapProfile: undefined,
    }).errors.map(error => error.code)).toContain('INVALID_HATCH_OVERLAP_PROFILE');
    expect(validateHatchOverlapIntegrationConfig({
      extras: validExtras,
      hatchOverlapRuleFlags: undefined,
    }).errors.map(error => error.code)).toContain('INVALID_HATCH_OVERLAP_RULE_FLAGS');
    expect(validateHatchOverlapIntegrationConfig({
      hatchOverlapProfile: 'hatch-c-experimental',
      hatchOverlapRuleFlags: { [CONTOUR_LAST_RULE_ID]: undefined },
    }).errors.map(error => error.code)).toContain('INVALID_HATCH_OVERLAP_RULE_FLAG_VALUE');
    expect(validateObjectPlanningConfig({
      extras: validExtras,
      hatchOverlapProfile: undefined,
      hatchOverlapRuleFlags: undefined,
    }).valid).toBe(false);
  });

  it('does not require fabric, scale or a technical configuration', () => {
    expect(validateObjectPlanningConfig(C_CONFIG).valid).toBe(true);
  });

  it('preserves the exact pre-C representation of all 16 A/B flag combinations', () => {
    const combinations = Array.from({ length: 16 }, (_, mask) => resolveHatchEvidenceIntegrationConfig({
      hatchEvidenceProfile: 'hatch-a-f-experimental',
      hatchEvidenceRuleFlags: Object.fromEntries(HATCH_EVIDENCE_RULE_IDS.map((ruleId, index) => [
        ruleId,
        Boolean(mask & (1 << index)),
      ])),
    }));
    expect(crypto.createHash('sha256').update(JSON.stringify(combinations)).digest('hex'))
      .toBe('4f8f345d3f099ec7dc6ca0695427ebfbc1741e16df83ced707bfee908cfd0f0b');
  });
});

describe('Hatch C partial registry integration', () => {
  it('registers only the independently gated C1, C2 and C3 rules in hatch-c-experimental', () => {
    expect(getHatchEvidenceRules({ profile: 'hatch-c-experimental' }).map(rule => rule.id))
      .toEqual([
        CONTOUR_LAST_RULE_ID,
        COLOR_GROUP_HEURISTIC_RULE_ID,
        MULTILAYER_DEPENDENCY_RULE_ID,
      ]);
    expect(HATCH_EVIDENCE_REGISTRY.activeIntegration).toEqual({
      profile: 'hatch-a-f-experimental',
      phases: ['A_Anchuras', 'B_Huecos'],
      ruleIds: HATCH_EVIDENCE_RULE_IDS,
      defaultRuleFlags: {
        'SATIN-RANGE-OBSERVED-001': false,
        'LOCAL-WIDTH-PROFILE-001': false,
        'HOLE-PRESERVE-001': false,
        'HOLE-MIN-SIZE-001': false,
      },
      independentlyConfigurable: true,
      defaultEnabled: false,
    });
    expect(HATCH_EVIDENCE_REGISTRY.partialIntegrations).toEqual([{
      profile: 'hatch-c-experimental',
      phase: 'C_Solapes',
      ruleIds: [
        CONTOUR_LAST_RULE_ID,
        COLOR_GROUP_HEURISTIC_RULE_ID,
        MULTILAYER_DEPENDENCY_RULE_ID,
      ],
      defaultRuleFlags: {
        [CONTOUR_LAST_RULE_ID]: false,
        [COLOR_GROUP_HEURISTIC_RULE_ID]: false,
        [MULTILAYER_DEPENDENCY_RULE_ID]: false,
      },
      independentlyConfigurable: true,
      defaultEnabled: false,
      integrationStatus: 'partial',
    }]);
    expect(HATCH_EVIDENCE_REGISTRY.inactivePhases).toEqual(['D_Técnicas', 'E_Telas', 'F_Escalado']);
  });

  it('keeps the other five C rules inactive and rejects unauthorized C activation', () => {
    const cRules = HATCH_EVIDENCE_RULES.filter(rule => rule.phase === 'C_Solapes');
    expect(cRules.filter(rule => ![
      CONTOUR_LAST_RULE_ID,
      COLOR_GROUP_HEURISTIC_RULE_ID,
      MULTILAYER_DEPENDENCY_RULE_ID,
    ].includes(rule.id))
      .every(rule => rule.activatedInProfiles.length === 0)).toBe(true);
    const alteredRules = HATCH_EVIDENCE_REGISTRY.rules.map(rule => rule.id === 'OVERLAP-CUTOUT-001'
      ? { ...rule, activatedInProfiles: ['hatch-c-experimental'] }
      : rule);
    expect(validateHatchEvidenceRegistry({
      ...HATCH_EVIDENCE_REGISTRY,
      rules: alteredRules,
    }).errors.map(error => error.code)).toContain('HATCH_EVIDENCE_UNAUTHORIZED_C_ACTIVATION');
    expect(validateHatchEvidenceRegistry()).toEqual({ valid: true, errors: [], warnings: [] });
  });
});

describe('Hatch C exact reference fixtures', () => {
  it('binds exact SVG, CSV and XLSX artifacts while supplying closed-reference roles explicitly', () => {
    expect(HATCH_C_REFERENCE_SOURCE).toMatchObject({
      packageName: 'PAQUETE_MAESTRO_STITCHPATH_HATCH_A_F.zip',
      packageSha256: 'd2ca1f36db18a6d48fe8d471f66d4cf1f96e2804ca65979d57752e97812bf8e3',
      packageByteLength: 320891578,
      derivation: {
        maximumChordDeviationMm: 0.03,
        runtimeDependency: 'none; fixtures are checked-in test constants and never read the 320 MB package at runtime',
      },
    });
    expect(Object.values(HATCH_C_REFERENCE_SOURCE.artifacts)).toHaveLength(3);
    Object.values(HATCH_C_REFERENCE_SOURCE.artifacts).forEach(artifact => {
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    Object.values(HATCH_C_REFERENCE_FIXTURES).forEach(fixture => {
      expect(fixture.sourceArtifacts).toEqual(['overlapsSvg', 'overlapsCsv', 'overlapsXlsx']);
      expect(fixture.svgSourceLines.length).toBe(fixture.svgPrimitives.length);
      expect(fixture.csvLine).toBeGreaterThan(1);
      expect(fixture.xlsxRanges.length).toBeGreaterThanOrEqual(3);
    });
    expect(HATCH_C_REFERENCE_FIXTURES.C12.cutoutCorrectnessClaimed).toBe(false);
    expect(HATCH_C_REFERENCE_SOURCE.derivation.semanticRoleMethod)
      .toContain('does not test image-to-role semantic discovery');
  });

  it.each(['C8', 'C11', 'C12'])('%s preserves dependent-before-contour order through every pre-export stage', referenceId => {
    const run = runReference(referenceId);
    expectValidPreExportRun(run);
    const expected = HATCH_C_REFERENCE_FIXTURES[referenceId].expectedRegionOrder;
    ['proposals', 'drafts', 'objects', 'execution', 'physical', 'canonical'].forEach(stage => {
      expect(regionOrder(run, stage)).toEqual(expected);
    });
    expect(run.proposalPlan.hatchOverlapTrace).toMatchObject({
      ruleId: CONTOUR_LAST_RULE_ID,
      status: 'validated',
      applied: true,
      eligibleOutlineCount: 1,
      exactGeometricAssociation: false,
      associationLimit: CONTOUR_LAST_ASSOCIATION_LIMIT,
      geometryChanged: false,
      stitchTechniqueChanged: false,
      dependenciesChanged: false,
      physicalImprovementClaimed: false,
    });
    expect(run.proposalPlan.hatchOverlapTrace.evaluations[0]).toMatchObject({
      applied: true,
      allConditionsSatisfied: true,
      missingDependencyIds: [],
      unknownDependencyIds: [],
      dependencyLayerViolations: [],
      cycleDetected: false,
    });
  });

  it('preserves the explicit C7 hole without classifying white in production', () => {
    const run = runReference('C7');
    expectValidPreExportRun(run);
    const baseProposal = run.proposalPlan.byRegionId['hatch-c7-01-green-base'];
    const baseObject = run.threadedObjectMaterialization.byRegionId['hatch-c7-01-green-base'];
    const basePath = run.physicalPlan.byObjectId[baseObject.id];
    expect(baseProposal.holesMm).toHaveLength(1);
    expect(baseObject.holes).toEqual(baseProposal.holesMm);
    expect(basePath.coverageMetrics.holeCrossingSegmentCount).toBe(0);
    expect(HATCH_C_REFERENCE_SOURCE.derivation.c7HoleMethod)
      .toContain('explicit fixture hole');
  });

  it.each(['C7', 'C8', 'C11', 'C12'])('%s is invariant to reversed input and repeated execution', referenceId => {
    const first = operationalSnapshot(runReference(referenceId));
    const reversed = operationalSnapshot(runReference(referenceId, { reverseInput: true }));
    const repeated = operationalSnapshot(runReference(referenceId));
    expect(reversed).toEqual(first);
    expect(repeated).toEqual(first);
  });

  it.each(['C7', 'C8', 'C11', 'C12'])('%s ON/OFF changes only validation and trace, not geometry or commands', referenceId => {
    const off = runReference(referenceId, { contourLast: false });
    const on = runReference(referenceId);
    const expectedProbe = C_EXPECTED_DIGITAL_PROBES[referenceId];
    expectValidPreExportRun(off);
    expectValidPreExportRun(on);
    expect(off.proposalPlan).not.toHaveProperty('hatchOverlapTrace');
    expect(off.proposalPlan).not.toHaveProperty('hatchOverlapDependencyContract');
    expect(off.proposalPlan).not.toHaveProperty('hatchOverlapIntegrationMarker');
    expect(off.proposalPlan.proposals.every(proposal => !proposal.source?.hatchOverlap)).toBe(true);
    expect(on.proposalPlan.hatchOverlapIntegrationMarker).toMatchObject({
      ruleId: CONTOUR_LAST_RULE_ID,
      active: true,
    });
    expect(on.proposalPlan.hatchOverlapTrace.applied).toBe(referenceId !== 'C7');
    expect(on.proposalPlan.hatchOverlapTrace.status)
      .toBe(referenceId === 'C7' ? 'not_applicable' : 'validated');
    expect(operationalSnapshot(on).proposals).toEqual(operationalSnapshot(off).proposals);
    expect(on.proposalPlan.executionLayers).toEqual(off.proposalPlan.executionLayers);
    expect(on.physicalPlan.objectPaths).toEqual(off.physicalPlan.objectPaths);
    expect(on.canonicalCompilation.commands).toEqual(off.canonicalCompilation.commands);
    expect(on.physicalPlan.summary.physicalPointCount).toBe(expectedProbe.physicalPointCount);
    expect(on.canonicalCompilation.commands).toHaveLength(expectedProbe.commandCount);
    expect(sha256Json(on.physicalPlan.objectPaths)).toBe(expectedProbe.physicalSha256);
    expect(sha256Json(off.physicalPlan.objectPaths)).toBe(expectedProbe.physicalSha256);
    expect(sha256Json(on.canonicalCompilation.commands)).toBe(expectedProbe.commandSha256);
    expect(sha256Json(off.canonicalCompilation.commands)).toBe(expectedProbe.commandSha256);
  });

  it('propagates deterministic C trace to planning diagnostics', () => {
    const run = runReference('C8');
    const diagnostic = createObjectPlanningDiagnostic({
      regions: run.ingestion.regions,
      graph: run.ingestion.graph,
      semanticResult: run.semanticResult,
      plan: run.proposalPlan,
    });
    expect(diagnostic).toMatchObject({
      valid: true,
      contourLastEvaluatorInvoked: true,
      contourLastEligibleOutlineCount: 1,
      contourLastApplied: true,
      contourLastStatus: 'validated',
      contourLastPhysicalImprovementClaimed: false,
    });
    expect(diagnostic.hatchOverlapTrace).toEqual(run.proposalPlan.hatchOverlapTrace);
  });
});

describe('CONTOUR-LAST guard failures and scope', () => {
  function guardedAlteration(mutate) {
    const run = runReference('C8');
    const proposals = structuredClone(run.proposalPlan.proposals).map(proposal => {
      const copy = structuredClone(proposal);
      delete copy.source?.hatchOverlap;
      return copy;
    });
    mutate(proposals);
    return evaluateContourLastProposalGuard({
      proposals,
      regions: run.ingestion.regions,
      graph: run.ingestion.graph,
      semanticResult: run.semanticResult,
      config: run.proposalPlan.config,
      executionLayers: run.proposalPlan.executionLayers,
      contourDependencyContract: run.proposalPlan.hatchOverlapDependencyContract,
      integration: resolveHatchOverlapIntegrationConfig(C_CONFIG),
    });
  }

  it('blocks a missing required dependency without inventing or repairing it', () => {
    const result = guardedAlteration(proposals => {
      proposals.find(proposal => proposal.proposedEmbroideryRole === 'outer_outline').dependencyIds = [];
    });
    expect(result.errors.map(error => error.code)).toContain('CONTOUR_LAST_REQUIRED_DEPENDENCY_MISSING');
    expect(result.trace).toMatchObject({
      applied: false,
      status: 'blocked',
      dependenciesChanged: false,
      transaction: {
        valid: false,
        physicalOutputAllowed: false,
        canonicalOutputAllowed: false,
        partialOutputAllowed: false,
      },
    });
    expect(result.proposals.find(proposal => proposal.proposedEmbroideryRole === 'outer_outline').dependencyIds).toEqual([]);
  });

  it('blocks unknown and cyclic dependencies with no applied=true trace', () => {
    const unknown = guardedAlteration(proposals => {
      proposals.find(proposal => proposal.proposedEmbroideryRole === 'outer_outline').dependencyIds.push('proposal:unknown');
    });
    expect(unknown.errors.map(error => error.code)).toContain('CONTOUR_LAST_UNKNOWN_DEPENDENCY');
    expect(unknown.trace.applied).toBe(false);
    expect(unknown.trace.evaluations.every(evaluation => evaluation.applied === false)).toBe(true);

    const cyclic = guardedAlteration(proposals => {
      const outline = proposals.find(proposal => proposal.proposedEmbroideryRole === 'outer_outline');
      proposals.find(proposal => proposal.proposedEmbroideryRole === 'foreground_fill').dependencyIds.push(outline.id);
    });
    expect(cyclic.errors.map(error => error.code)).toContain('CONTOUR_LAST_DEPENDENCY_CYCLE');
    expect(cyclic.trace.applied).toBe(false);
    expect(cyclic.trace.transaction.partialOutputAllowed).toBe(false);
  });

  it('keeps synthetic or non-explicit outlines outside the rule', () => {
    const run = runReference('C8');
    const proposals = structuredClone(run.proposalPlan.proposals);
    const outline = proposals.find(proposal => proposal.proposedEmbroideryRole === 'outer_outline');
    delete outline.source.hatchOverlap;
    outline.outlineEligibility.regionBackedGeometry = false;
    const dependencyResult = buildEmbroideryProposalDependencies(
      proposals,
      run.ingestion.regions,
      run.ingestion.graph,
      run.semanticResult,
      run.proposalPlan.config,
    );
    const result = evaluateContourLastProposalGuard({
      proposals: dependencyResult.proposals,
      regions: run.ingestion.regions,
      graph: run.ingestion.graph,
      semanticResult: run.semanticResult,
      config: run.proposalPlan.config,
      executionLayers: dependencyResult.executionLayers,
      contourDependencyContract: dependencyResult.contourDependencyContract,
      integration: resolveHatchOverlapIntegrationConfig(C_CONFIG),
    });
    expect(result.trace).toMatchObject({
      status: 'not_applicable',
      applied: false,
      eligibleOutlineCount: 0,
      evaluationCount: 0,
    });
    expect(result.proposals.every(proposal => !proposal.source?.hatchOverlap)).toBe(true);
  });

  it('coexists with A/B configuration and preserves both trace namespaces', () => {
    const sources = [
      {
        id: 'coexist-01-base',
        color: '#2e7d32',
        region_class: 'body',
        path_points: [[20, 20], [50, 20], [50, 50], [20, 50]],
      },
      {
        id: 'coexist-02-detail',
        color: '#552277',
        region_class: 'detail',
        path_points: [[28, 25], [34, 25], [34, 40], [28, 40]],
      },
      {
        id: 'coexist-99-outline',
        color: '#111111',
        region_class: 'outer outline',
        path_points: [[19, 19], [51, 19], [51, 51], [19, 51]],
        darkStrokeSupport: { available: true, ratio: 1 },
        source: { outlineIntent: 'outer outline' },
      },
    ];
    const ingestion = ingestV1RegionsToRegionGraphV2(sources, {
      coordinateSpace: 'millimeter',
      designWidthMm: 100,
      designHeightMm: 80,
    });
    const roleById = {
      'coexist-01-base': 'primary_shape',
      'coexist-02-detail': 'internal_feature',
      'coexist-99-outline': 'dark_mark',
    };
    const assessments = ingestion.regions.map(region => createSemanticRegionAssessmentV2({
      regionId: region.id,
      semanticRole: roleById[region.id],
      confidence: 0.98,
      evidence: [{ code: 'COEXISTENCE_FIXTURE', message: 'A/B plus C trace fixture.' }],
    }));
    const plan = buildEmbroideryObjectProposalPlan({
      regions: ingestion.regions,
      graph: ingestion.graph,
      semanticResult: {
        assessments,
        byRegionId: Object.fromEntries(assessments.map(item => [item.regionId, item])),
      },
      config: planningConfig({
        ...C_CONFIG,
        hatchEvidenceProfile: 'hatch-a-f-experimental',
        hatchEvidenceRuleFlags: { 'LOCAL-WIDTH-PROFILE-001': true },
        hatchEvidenceContext: {
          fabricProfile: 'Pure Cotton',
          referenceScaleCompatible: true,
        },
      }),
      technicalConfig: {},
    });
    expect(plan.valid).toBe(true);
    expect(plan.byRegionId['coexist-02-detail'].source.hatchEvidence.evaluations.map(item => item.ruleId))
      .toEqual(['LOCAL-WIDTH-PROFILE-001']);
    expect(plan.byRegionId['coexist-99-outline'].source.hatchOverlap).toMatchObject({
      ruleId: CONTOUR_LAST_RULE_ID,
      applied: true,
    });
    expect(plan.byRegionId['coexist-99-outline'].source).not.toHaveProperty('hatchEvidence');
    expect(resolveHatchEvidenceIntegrationConfig(plan.config).enabledRuleIds)
      .toEqual(['LOCAL-WIDTH-PROFILE-001']);
    expect(resolveHatchOverlapIntegrationConfig(plan.config).enabledRuleIds)
      .toEqual([CONTOUR_LAST_RULE_ID]);
  });

  it('invalidates an ambiguous plan transactionally and the orchestrator emits zero physical or canonical output', () => {
    const outer = createRegionV2({
      id: 'ambiguous-99-outline',
      geometry: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
      visualColor: '#111111',
      semanticRole: 'dark mark',
      darkStrokeSupport: { available: true, ratio: 1 },
      confidence: 1,
      source: { originalSource: { outlineIntent: 'outer outline' } },
    });
    const negative = createRegionV2({
      id: 'ambiguous-01-negative',
      geometry: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }],
      visualColor: '#ffffff',
      semanticRole: 'negative_space',
      confidence: 1,
      source: { originalSource: { negativeSpace: true } },
    });
    const result = runEngineV2RegionToBinary({
      regions: [outer, negative],
      designSizeMm: { width: 100, height: 80 },
      format: 'DST',
      stageConfig: {
        objectPlanning: C_CONFIG,
      },
    });
    expect(result.firstBlockingStageId).toBe('object_planning');
    expect(result.objectPlanning.errors.map(error => error.code))
      .toContain('CONTOUR_LAST_ASSOCIATION_AMBIGUOUS');
    expect(result.objectPlanning.hatchOverlapTrace.transaction).toMatchObject({
      physicalOutputAllowed: false,
      canonicalOutputAllowed: false,
      partialOutputAllowed: false,
    });
    expect(result.physicalGeneration).toBeNull();
    expect(result.canonicalCompilation).toBeNull();
    expect(result.binaryExport).toBeNull();
    expect(result.summary.physicalPointCount).toBe(0);
    expect(result.summary.canonicalCommandCount).toBe(0);
  });

  it('never activates or applies another C rule when only C1 is enabled', () => {
    const run = runReference('C12');
    const forbidden = [
      'OVERLAP-CUTOUT-001',
      'SPLIT-OCCLUDED-001',
      'SAME-COLOR-UNION-001',
      'WHITE-FABRIC-001',
      'ADJACENT-UNDERLAP-001',
      'COLOR-GROUP-HEURISTIC-001',
      'MULTILAYER-DEPENDENCY-001',
    ];
    expect(run.proposalPlan.hatchOverlapTrace.enabledRuleIds).toEqual([CONTOUR_LAST_RULE_ID]);
    forbidden.forEach(ruleId => expect(JSON.stringify(run)).not.toContain(ruleId));
  });
});
