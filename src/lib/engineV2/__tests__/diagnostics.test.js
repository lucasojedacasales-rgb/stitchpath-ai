import { describe, expect, it } from 'vitest';
import {
  createCanonicalCommandV2,
  createEmbroideryObjectV2,
  createEngineDocumentV2,
  createEngineV2FoundationDiagnostic,
  createRegionV2,
  createThreadBlockV2,
  createThreadDefinitionV2,
} from '../index.js';

describe('Engine V2 foundation diagnostics', () => {
  it('counts document content and invalid references without mutation', () => {
    const document = createEngineDocumentV2({
      regions: [createRegionV2({ id: 'r1', geometry: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] })],
      threads: [createThreadDefinitionV2({ id: 't1' })],
      objects: [createEmbroideryObjectV2({
        id: 'o1', regionId: 'missing-region', role: 'base_fill', stitchType: 'tatami',
        geometry: [{ x: 1, y: 1 }], dependencyIds: ['missing-object'], threadId: 'missing-thread',
      })],
      threadBlocks: [createThreadBlockV2({ id: 'b1', threadId: 't1', objectIds: ['missing-object'] })],
      commands: [createCanonicalCommandV2({ type: 'stitch', x: 1, y: 1, objectId: 'missing-object', threadId: 'missing-thread' })],
    });
    const before = structuredClone(document);
    const diagnostic = createEngineV2FoundationDiagnostic(document);

    expect(diagnostic).toMatchObject({
      valid: false,
      version: '2',
      regionCount: 1,
      objectCount: 1,
      threadCount: 1,
      threadBlockCount: 1,
      commandCount: 1,
      dependencyCount: 1,
      missingEndCommand: true,
    });
    expect(diagnostic.unknownRegionReferenceCount).toBeGreaterThan(0);
    expect(diagnostic.unknownThreadReferenceCount).toBeGreaterThan(0);
    expect(diagnostic.unknownObjectReferenceCount).toBeGreaterThan(0);
    expect(document).toEqual(before);
  });
});
