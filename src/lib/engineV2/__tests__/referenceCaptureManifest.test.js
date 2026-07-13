import { describe, expect, it } from 'vitest';
import { buildEngineV2ReferenceCaptureManifest } from '../referenceCapture/referenceCaptureManifest.js';

const provenance = { sourceKind: 'synthetic', sourceName: 'fixture', sourceFingerprint: '12345678', evidenceType: 'synthetic_fixture', evidenceReference: 'fixture.js', verified: true };
const stageResults = Array.from({ length: 11 }, (_, index) => ({ stageId: `stage-${index}`, outputFingerprint: index.toString(16).padStart(8, '0') }));
const summary = { regionCount: 2, proposalCount: 2, draftCount: 2, finalObjectCount: 2, threadDefinitionCount: 2, technicalSpecificationCount: 2, executionStepCount: 2, threadBlockCount: 2, physicalPointCount: 20, physicalStitchCount: 18, canonicalCommandCount: 25, machineAdaptedCommandCount: 25, requestedFormat: 'DST', binaryAccepted: true, binaryByteLength: 600, binaryChecksum: 42, parserRoundtripPassed: true, deterministicBytesVerified: true };
const pipelineResult = { request: { sourceFingerprint: '12345678' }, stageResults, summary, binaryExport: { limitations: ['synthetic only'], readiness: { ready: false } } };
const gateResult = { captureAllowed: true, warnings: [] };

describe('Phase 13A reference-capture manifest', () => {
  const manifest = buildEngineV2ReferenceCaptureManifest({ pipelineResult, provenance, physicalMachineTest: { status: 'not_tested' }, gateResult });
  it('returns null when gate blocks', () => expect(buildEngineV2ReferenceCaptureManifest({ pipelineResult, provenance, physicalMachineTest: {}, gateResult: { captureAllowed: false } })).toBeNull());
  it('creates a valid manifest', () => expect(manifest.valid).toBe(true));
  it('captures eleven fingerprints', () => expect(Object.keys(manifest.stageFingerprints)).toHaveLength(11));
  it.each(Object.entries(summary))('preserves summary metric %s', (key, value) => { const manifestKey = ({ threadDefinitionCount: 'threadCount', machineAdaptedCommandCount: 'machineCommandCount' })[key] || key; expect(manifest[manifestKey]).toBe(value); });
  it('preserves limitations', () => expect(manifest.limitations).toEqual(['synthetic only']));
  it('records in-memory capture', () => expect(manifest.metadata.captureInMemoryOnly).toBe(true));
  it('records no persistence', () => expect(manifest.metadata.persisted).toBe(false));
  it('records no real fixture', () => expect(manifest.metadata.realReferenceFixtureAvailable).toBe(false));
  it('records no physical acceptance', () => expect(manifest.metadata.physicalMachineAcceptanceVerified).toBe(false));
  it('freezes the manifest', () => expect(Object.isFrozen(manifest)).toBe(true));
});
