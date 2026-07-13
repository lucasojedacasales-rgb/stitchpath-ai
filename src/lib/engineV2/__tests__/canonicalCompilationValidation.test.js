import { beforeAll, describe, expect, it } from 'vitest';
import { validateCanonicalCommandCompilationV2, validateCanonicalCompilationDispositionV2, validateCanonicalDiscontinuityClassificationV2, validateCanonicalObjectCommandSpanV2 } from '../commandCompilation/canonicalCompilationValidation.js';
import { createGenericMascotCommandFixture } from '../fixtures/genericMascotCommandFixture.js';

let fixture; let compilation;
const clone = value => structuredClone(value);
const validate = value => validateCanonicalCommandCompilationV2(value, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan, fixture.physicalPlan);
const codes = value => validate(value).errors.map(item => item.code);
beforeAll(() => { fixture = createGenericMascotCommandFixture(); compilation = fixture.canonicalCompilation; });

describe('Phase 10 canonical compilation validation', () => {
  it('accepts a valid compilation disposition', () => expect(validateCanonicalCompilationDispositionV2(compilation.dispositions[0]).valid).toBe(true));
  it('rejects nondeterministic disposition ids', () => { const value = clone(compilation.dispositions[0]); value.id = 'wrong'; expect(validateCanonicalCompilationDispositionV2(value).valid).toBe(false); });
  it('accepts a valid command span', () => expect(validateCanonicalObjectCommandSpanV2(compilation.objectCommandSpans[0], compilation.commands.length).valid).toBe(true));
  it('rejects out-of-range command spans', () => { const value = clone(compilation.objectCommandSpans[0]); value.lastCommandIndex = compilation.commands.length; expect(validateCanonicalObjectCommandSpanV2(value, compilation.commands.length).valid).toBe(false); });
  it('accepts a valid discontinuity classification', () => expect(validateCanonicalDiscontinuityClassificationV2(compilation.discontinuityClassifications[0]).valid).toBe(true));
  it('rejects unknown discontinuity classifications', () => { const value = clone(compilation.discontinuityClassifications[0]); value.classification = 'hidden'; expect(validateCanonicalDiscontinuityClassificationV2(value).valid).toBe(false); });
  it('accepts the complete canonical stream', () => expect(validate(compilation).valid).toBe(true));
  it('detects a missing object disposition', () => { const value = clone(compilation); value.dispositions.pop(); expect(codes(value)).toContain('SCHEDULED_OBJECT_WITHOUT_CANONICAL_DISPOSITION'); });
  it('detects overlapping object spans', () => { const value = clone(compilation); value.objectCommandSpans[1].firstCommandIndex = value.objectCommandSpans[0].lastCommandIndex; expect(codes(value)).toContain('OVERLAPPING_COMMAND_SPANS'); });
  it('detects object-order mutation', () => { const value = clone(compilation); value.executionOrder.reverse(); expect(codes(value)).toContain('CANONICAL_OBJECT_ORDER_MUTATION'); });
  it('detects thread-block-order mutation', () => { const value = clone(compilation); value.threadBlockOrder.reverse(); expect(codes(value)).toContain('CANONICAL_THREAD_BLOCK_ORDER_MUTATION'); });
  it('detects noncontiguous command indexes', () => { const value = clone(compilation); value.commands[1].sequenceIndex = 99; expect(codes(value)).toContain('NONCONTIGUOUS_CANONICAL_COMMAND_INDEX'); });
  it('detects nondeterministic command ids', () => { const value = clone(compilation); value.commands[1].id = 'wrong'; expect(codes(value)).toContain('NONDETERMINISTIC_CANONICAL_COMMAND_ID'); });
  it('detects unknown thread ids', () => { const value = clone(compilation); value.commands[1].threadId = 'thread:unknown'; expect(codes(value)).toContain('UNKNOWN_THREAD_ID'); });
  it('detects changed physical coordinates', () => { const value = clone(compilation); const command = value.commands.find(item => item.reasonCode === 'PHYSICAL_SOURCE_STITCH'); command.x += 1; expect(codes(value)).toContain('PHYSICAL_POINT_COORDINATE_CHANGED'); });
  it('detects missing physical movement mapping', () => { const value = clone(compilation); const index = value.commands.findIndex(item => item.reasonCode === 'PHYSICAL_SOURCE_STITCH'); value.commands.splice(index, 1); expect(codes(value)).toContain('PHYSICAL_STITCH_MOVEMENT_MISSING'); });
  it('detects duplicate movement mapping', () => { const value = clone(compilation); const command = clone(value.commands.find(item => item.reasonCode === 'PHYSICAL_SOURCE_STITCH')); value.commands.splice(-1, 0, command); expect(codes(value)).toContain('PHYSICAL_MOVEMENT_MAPPED_MORE_THAN_ONCE'); });
  it('detects an unclassified discontinuity', () => { const value = clone(compilation); value.discontinuityClassifications.pop(); expect(codes(value)).toContain('UNCLASSIFIED_PHYSICAL_DISCONTINUITY'); });
  it('detects multiple end commands', () => { const value = clone(compilation); value.commands.push(clone(value.commands.at(-1))); expect(codes(value)).toContain('MULTIPLE_END_COMMANDS'); });
  it('detects commands after end', () => { const value = clone(compilation); value.commands.push({ ...clone(value.commands[0]), sequenceIndex: value.commands.length }); expect(codes(value)).toContain('COMMANDS_AFTER_END'); });
  it('detects machine-coordinate metadata', () => { const value = clone(compilation); value.commands[0].machineX = 0; expect(codes(value)).toContain('MACHINE_OR_ENCODING_OUTPUT_FORBIDDEN_IN_PHASE_10'); });
  it('detects physical subpath order mutation', () => { const value = clone(compilation); const objectId = value.executionOrder[0]; const commands = value.commands.filter(item => item.objectId === objectId && item.subpathId); const first = commands[0].subpathId; const later = commands.find(item => item.subpathId !== first); commands[0].subpathId = later.subpathId; expect(codes(value)).toContain('PHYSICAL_SUBPATH_ORDER_CHANGED'); });
  it('detects connector object-boundary mutation', () => { const value = clone(compilation); const command = value.commands.find(item => item.reasonCode === 'SAFE_SUBPATH_CONNECTOR'); command.objectId = value.executionOrder[1]; expect(codes(value)).toContain('CONNECTOR_STITCH_ACROSS_OBJECT_BOUNDARY'); });
});
