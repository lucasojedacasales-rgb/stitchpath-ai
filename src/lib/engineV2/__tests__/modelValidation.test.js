import { describe, expect, it } from 'vitest';
import {
  createCanonicalCommandV2,
  createEmbroideryObjectV2,
  createEngineDocumentV2,
  createRegionV2,
  createThreadBlockV2,
  createThreadDefinitionV2,
  validateCanonicalCommandV2,
  validateEmbroideryObjectV2,
  validateEngineDocumentV2,
  validateRegionV2,
} from '../index.js';

const polygon = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.5, y: 0.9 },
];

function validDocument() {
  return createEngineDocumentV2({
    regions: [createRegionV2({ id: 'region-1', geometry: polygon, visualColor: '#ffffff', source: 'test' })],
    threads: [createThreadDefinitionV2({ id: 'thread-1', machineColor: '#ffffff', source: 'test' })],
    objects: [createEmbroideryObjectV2({
      id: 'object-1',
      regionId: 'region-1',
      role: 'base_fill',
      stitchType: 'tatami',
      geometry: [{ x: 1, y: 1 }, { x: 5, y: 5 }],
      threadId: 'thread-1',
      source: 'test',
    })],
    threadBlocks: [createThreadBlockV2({ id: 'block-1', threadId: 'thread-1', objectIds: ['object-1'] })],
    commands: [
      createCanonicalCommandV2({ type: 'stitch', x: 1, y: 1, threadId: 'thread-1', objectId: 'object-1', regionId: 'region-1', source: 'test' }),
      createCanonicalCommandV2({ type: 'end', source: 'test' }),
    ],
  });
}

describe('RegionV2', () => {
  it('validates a valid region', () => {
    const region = createRegionV2({ id: 'r1', geometry: polygon, visualColor: '#00ff00', source: 'test' });
    expect(validateRegionV2(region).valid).toBe(true);
  });

  it('does not mutate its input', () => {
    const input = { id: 'r1', geometry: polygon.map(point => ({ ...point })), holes: [], darkStrokeSupport: { available: true, ratio: 0.5, source: { detector: 'test' } } };
    const before = structuredClone(input);
    const region = createRegionV2(input);
    region.geometry[0].x = 0.2;
    region.darkStrokeSupport.source.detector = 'changed';
    expect(input).toEqual(before);
  });

  it('rejects a polygon with fewer than three points', () => {
    const region = createRegionV2({ id: 'r1', geometry: polygon.slice(0, 2) });
    expect(validateRegionV2(region).errors.some(item => item.code === 'INVALID_POLYGON')).toBe(true);
  });

  it('rejects a NaN coordinate', () => {
    const region = createRegionV2({ id: 'r1', geometry: [{ x: NaN, y: 0 }, ...polygon.slice(1)] });
    expect(validateRegionV2(region).errors.some(item => item.code === 'NON_FINITE_COORDINATE')).toBe(true);
  });

  it('rejects normalized coordinates outside 0-1', () => {
    const region = createRegionV2({ id: 'r1', geometry: [{ x: 1.1, y: 0 }, ...polygon.slice(1)] });
    expect(validateRegionV2(region).errors.some(item => item.code === 'NORMALIZED_COORDINATE_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects an invalid hole', () => {
    const region = createRegionV2({ id: 'r1', geometry: polygon, holes: [[{ x: 0.2, y: 0.2 }]] });
    expect(validateRegionV2(region).errors.some(item => item.code === 'INVALID_HOLE_GEOMETRY')).toBe(true);
  });
});

describe('EmbroideryObjectV2', () => {
  const validInput = {
    id: 'o1', regionId: 'r1', role: 'base_fill', stitchType: 'tatami',
    geometry: [{ x: 1, y: 2 }], threadId: 't1', source: 'test',
  };

  it('validates a valid object', () => {
    expect(validateEmbroideryObjectV2(createEmbroideryObjectV2(validInput)).valid).toBe(true);
  });

  it('rejects an unknown role', () => {
    const object = createEmbroideryObjectV2({ ...validInput, role: 'decoration' });
    expect(validateEmbroideryObjectV2(object).errors.some(item => item.code === 'INVALID_ROLE')).toBe(true);
  });

  it('rejects an unknown stitch type', () => {
    const object = createEmbroideryObjectV2({ ...validInput, stitchType: 'cross_stitch' });
    expect(validateEmbroideryObjectV2(object).errors.some(item => item.code === 'INVALID_STITCH_TYPE')).toBe(true);
  });

  it('does not mutate its input', () => {
    const input = { ...validInput, geometry: [{ x: 1, y: 2 }], parameters: { density: { value: 0.4 } } };
    const before = structuredClone(input);
    const object = createEmbroideryObjectV2(input);
    object.geometry[0].x = 99;
    object.parameters.density.value = 1;
    expect(input).toEqual(before);
  });
});

describe('EngineDocumentV2 references and dependencies', () => {
  it('detects a missing dependency', () => {
    const document = validDocument();
    document.objects[0].dependencyIds = ['missing'];
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'MISSING_DEPENDENCY')).toBe(true);
  });

  it('detects a self-dependency', () => {
    const document = validDocument();
    document.objects[0].dependencyIds = ['object-1'];
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'SELF_DEPENDENCY')).toBe(true);
  });

  it('detects a three-object circular dependency', () => {
    const document = validDocument();
    document.objects = ['a', 'b', 'c'].map((id, index, ids) => createEmbroideryObjectV2({
      id,
      regionId: 'region-1',
      role: 'base_fill',
      stitchType: 'tatami',
      geometry: [{ x: index, y: index }],
      dependencyIds: [ids[(index + 1) % ids.length]],
      threadId: 'thread-1',
    }));
    document.threadBlocks = [];
    document.commands = [createCanonicalCommandV2({ type: 'end' })];
    expect(validateEngineDocumentV2(document).errors.filter(item => item.code === 'CIRCULAR_DEPENDENCY')).toHaveLength(3);
  });

  it('detects an unknown thread reference', () => {
    const document = validDocument();
    document.objects[0].threadId = 'missing';
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'UNKNOWN_THREAD_REFERENCE')).toBe(true);
  });

  it('detects an unknown region reference', () => {
    const document = validDocument();
    document.objects[0].regionId = 'missing';
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'UNKNOWN_REGION_REFERENCE')).toBe(true);
  });

  it('detects an unknown object in a thread block', () => {
    const document = validDocument();
    document.threadBlocks[0].objectIds = ['missing'];
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'UNKNOWN_OBJECT_REFERENCE')).toBe(true);
  });

  it('detects duplicate object ids in a thread block', () => {
    const document = validDocument();
    document.threadBlocks[0].objectIds = ['object-1', 'object-1'];
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'DUPLICATE_BLOCK_OBJECT_ID')).toBe(true);
  });
});

describe('canonical command stream', () => {
  it('validates a complete command stream', () => {
    expect(validateEngineDocumentV2(validDocument()).valid).toBe(true);
  });

  it('rejects a stitch without coordinates', () => {
    const command = createCanonicalCommandV2({ type: 'stitch' });
    expect(validateCanonicalCommandV2(command).errors.some(item => item.code === 'COMMAND_COORDINATES_REQUIRED')).toBe(true);
  });

  it('rejects a color change without thread', () => {
    const command = createCanonicalCommandV2({ type: 'colorChange' });
    expect(validateCanonicalCommandV2(command).errors.some(item => item.code === 'COLOR_CHANGE_THREAD_REQUIRED')).toBe(true);
  });

  it('detects a missing END command', () => {
    const document = validDocument();
    document.commands.pop();
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'MISSING_END_COMMAND')).toBe(true);
  });

  it('detects multiple END commands', () => {
    const document = validDocument();
    document.commands.push(createCanonicalCommandV2({ type: 'end' }));
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'MULTIPLE_END_COMMANDS')).toBe(true);
  });

  it('detects a command after END', () => {
    const document = validDocument();
    document.commands.push(createCanonicalCommandV2({ type: 'jump', x: 2, y: 2 }));
    expect(validateEngineDocumentV2(document).errors.some(item => item.code === 'COMMAND_AFTER_END')).toBe(true);
  });

  it('validates a complete EngineDocumentV2', () => {
    const document = validDocument();
    expect(document.version).toBe('2');
    expect(validateEngineDocumentV2(document)).toEqual({ valid: true, errors: [], warnings: [] });
  });
});
