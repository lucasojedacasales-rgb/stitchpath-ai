import { describe, expect, it } from 'vitest';
import { createEngineV2PipelineStageDefinition, createEngineV2PipelineStageResult, createEngineV2RegionToBinaryRequest, createEngineV2RegionToBinaryResult, ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES, ENGINE_V2_PIPELINE_STAGE_STATUSES, normalizeEngineV2BinaryFormat, pipelineStageResultId } from '../orchestration/endToEndPipelineModel.js';
import { createEndToEndRegionFixture } from '../fixtures/endToEndRegionFixture.js';

describe('Phase 13A end-to-end models', () => {
  it.each([['dst', 'DST'], [' Dsb ', 'DSB'], ['DST', 'DST'], ['', null], [null, null], [12, null]])('normalizes format %#', (value, expected) => expect(normalizeEngineV2BinaryFormat(value)).toBe(expected));
  it.each(ENGINE_V2_PIPELINE_STAGE_STATUSES)('exposes stage status %s', value => expect(ENGINE_V2_PIPELINE_STAGE_STATUSES).toContain(value));
  it.each(ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES)('exposes outcome category %s', value => expect(ENGINE_V2_PIPELINE_OUTCOME_CATEGORIES).toContain(value));
  it.each([[0, 'region_ingestion', 'pipeline-stage:00:region_ingestion'], [9, 'machine_adaptation', 'pipeline-stage:09:machine_adaptation'], [10, 'binary_export', 'pipeline-stage:10:binary_export']])('builds deterministic stage id %#', (index, id, expected) => expect(pipelineStageResultId(index, id)).toBe(expected));

  const fixture = createEndToEndRegionFixture();
  const request = createEngineV2RegionToBinaryRequest(fixture);
  it('creates deterministic request ID', () => expect(request.id).toBe(`engine-v2-run:DST:${request.sourceFingerprint}`));
  it('creates deterministic request fingerprint', () => expect(request.sourceFingerprint).toMatch(/^[0-9a-f]{8}$/));
  it('freezes request root', () => expect(Object.isFrozen(request)).toBe(true));
  it('freezes request regions', () => expect(Object.isFrozen(request.regions)).toBe(true));
  it('freezes request nested geometry', () => expect(Object.isFrozen(request.regions[0].geometry)).toBe(true));
  it('clones request input', () => { const source = createEndToEndRegionFixture(); const created = createEngineV2RegionToBinaryRequest(source); source.regions[0].geometry[0].x = 0.9; expect(created.regions[0].geometry[0].x).toBe(0.05); });
  it('repeats request ID exactly', () => expect(createEngineV2RegionToBinaryRequest(fixture).id).toBe(request.id));
  it('changes request ID when design size changes', () => expect(createEngineV2RegionToBinaryRequest({ ...fixture, designSizeMm: { width: 31, height: 35 } }).id).not.toBe(request.id));
  it('allows metadata without changing source fingerprint', () => expect(createEngineV2RegionToBinaryRequest({ ...fixture, metadata: { another: true } }).sourceFingerprint).toBe(request.sourceFingerprint));

  const definition = createEngineV2PipelineStageDefinition({ id: 'x', sequenceIndex: 3, inputContract: 'A', outputContract: 'B', sourceModule: 'x.js' });
  it.each([['id', 'x'], ['sequenceIndex', 3], ['inputContract', 'A'], ['outputContract', 'B'], ['sourceModule', 'x.js'], ['transactional', true]])('preserves stage definition %s', (key, value) => expect(definition[key]).toBe(value));
  it('freezes stage definition', () => expect(Object.isFrozen(definition)).toBe(true));

  const stage = createEngineV2PipelineStageResult({ stageId: 'region_ingestion', sequenceIndex: 0, status: 'completed', outcomeCategory: 'accepted', inputFingerprint: '12345678', outputFingerprint: 'abcdef01', inputCount: 2, outputCount: 2, valid: true, result: { ok: true } });
  it.each([['id', 'pipeline-stage:00:region_ingestion'], ['stageId', 'region_ingestion'], ['sequenceIndex', 0], ['status', 'completed'], ['outcomeCategory', 'accepted'], ['inputCount', 2], ['outputCount', 2], ['valid', true]])('preserves stage result %s', (key, value) => expect(stage[key]).toBe(value));
  it('freezes stage result recursively', () => { expect(Object.isFrozen(stage)).toBe(true); expect(Object.isFrozen(stage.result)).toBe(true); });
  it('defaults stage result to skipped not executed', () => { const value = createEngineV2PipelineStageResult(); expect(value.status).toBe('skipped'); expect(value.outcomeCategory).toBe('not_executed'); });

  const result = createEngineV2RegionToBinaryResult({ request, stageResults: [stage], valid: true, pipelineCompleted: true, binaryAccepted: true });
  it('sets result version', () => expect(result.version).toBe('2-region-to-binary-orchestrator'));
  it('preserves result booleans', () => { expect(result.valid).toBe(true); expect(result.pipelineCompleted).toBe(true); expect(result.binaryAccepted).toBe(true); });
  it('freezes result recursively', () => { expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.stageResults)).toBe(true); });
});
