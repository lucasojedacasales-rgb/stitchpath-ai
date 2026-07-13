import { beforeAll, describe, expect, it } from 'vitest';
import { createGenericMascotPhysicalFixture } from '../fixtures/genericMascotPhysicalFixture.js';
import { validateMachineIndependentPhysicalStitchPlan, validateObjectPhysicalStitchPathV2, validatePhysicalStitchPointV2, validatePhysicalStitchSubpathV2, validatePhysicalSubpathTransitionV2 } from '../stitchGeneration/physicalStitchValidation.js';

let fixture;
let path;
let object;
let specification;
let selected;
const clone = value => structuredClone(value);
const codes = result => result.errors.map(item => item.code);
beforeAll(() => { fixture = createGenericMascotPhysicalFixture(); path = fixture.physicalPlan.objectPaths[0]; object = fixture.threadedObjectMaterialization.objects.find(item => item.id === path.objectId); specification = fixture.technicalPlan.specifications.find(item => item.objectId === path.objectId); selected = fixture.sequencePlan.selectedEntryExitPairs.find(item => item.objectId === path.objectId); });

describe('Phase 9 physical stitch validation', () => {
  it('accepts a valid physical point', () => expect(validatePhysicalStitchPointV2(path.subpaths[0].points[0]).valid).toBe(true));
  it('rejects nonfinite point coordinates', () => { const point = clone(path.subpaths[0].points[0]); point.x = NaN; expect(codes(validatePhysicalStitchPointV2(point))).toContain('NONFINITE_PHYSICAL_COORDINATE'); });
  it('rejects command fields on physical points', () => { const point = clone(path.subpaths[0].points[0]); point.type = 'stitch'; expect(codes(validatePhysicalStitchPointV2(point))).toContain('COMMAND_OR_MACHINE_FIELD_ON_PHYSICAL_POINT'); });
  it('accepts a valid physical subpath', () => expect(validatePhysicalStitchSubpathV2(path.subpaths.find(item => item.phase === 'top'), object, specification).valid).toBe(true));
  it('rejects zero-length physical stitches', () => { const subpath = clone(path.subpaths.find(item => item.phase === 'top' && item.points.length > 1)); subpath.points[1].x = subpath.points[0].x; subpath.points[1].y = subpath.points[0].y; expect(codes(validatePhysicalStitchSubpathV2(subpath, object, specification))).toContain('ZERO_LENGTH_PHYSICAL_STITCH'); });
  it('accepts a valid diagnostic transition', () => expect(validatePhysicalSubpathTransitionV2(path.subpathTransitions[0]).valid).toBe(true));
  it('rejects command classification on a transition', () => { const gap = clone(path.subpathTransitions[0]); gap.jump = true; expect(codes(validatePhysicalSubpathTransitionV2(gap))).toContain('COMMAND_CLASSIFICATION_ON_PHYSICAL_GAP'); });
  it('accepts a valid object physical path', () => expect(validateObjectPhysicalStitchPathV2(path, object, specification, selected, fixture.physicalPlan.config).valid).toBe(true));
  it('detects selected candidate identity mutation', () => { const changed = clone(path); changed.entryCandidateId = 'different'; expect(codes(validateObjectPhysicalStitchPathV2(changed, object, specification, selected, fixture.physicalPlan.config))).toContain('SELECTED_CANDIDATE_IDENTITY_MUTATION'); });
  it('accepts the complete physical plan', () => expect(validateMachineIndependentPhysicalStitchPlan(fixture.physicalPlan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan).valid).toBe(true));
  it('detects a missing disposition', () => { const plan = clone(fixture.physicalPlan); plan.dispositions.pop(); expect(codes(validateMachineIndependentPhysicalStitchPlan(plan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan))).toContain('SCHEDULED_OBJECT_WITHOUT_PHYSICAL_DISPOSITION'); });
  it('detects forbidden command arrays', () => { const plan = clone(fixture.physicalPlan); plan.commands = [{ type: 'stitch' }]; expect(codes(validateMachineIndependentPhysicalStitchPlan(plan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan))).toContain('COMMAND_OUTPUT_FORBIDDEN_IN_PHASE_9'); });
  it('detects global sequence mutation', () => { const plan = clone(fixture.physicalPlan); plan.executionOrder.reverse(); expect(codes(validateMachineIndependentPhysicalStitchPlan(plan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan))).toContain('GLOBAL_SEQUENCE_MUTATION'); });
  it('detects thread-block mutation', () => { const plan = clone(fixture.physicalPlan); plan.threadBlockReferences = []; expect(codes(validateMachineIndependentPhysicalStitchPlan(plan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan))).toContain('THREAD_BLOCK_MUTATION'); });
  it('detects reported input mutation', () => { const plan = clone(fixture.physicalPlan); plan.metadata.inputMutationsDetected = true; expect(codes(validateMachineIndependentPhysicalStitchPlan(plan, fixture.threadedObjectMaterialization, fixture.technicalPlan, fixture.sequencePlan))).toContain('PHYSICAL_GENERATION_INPUT_MUTATION'); });
});
