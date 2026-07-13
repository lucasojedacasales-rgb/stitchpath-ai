import { describe, expect, it } from 'vitest';
import { GENERIC_DST_MACHINE_PROFILE } from '../machineAdaptation/machineProfileModel.js';
import { resolveMachineAdaptationConfig } from '../machineAdaptation/machineAdaptationConfig.js';
import { inverseTransformMachineMillimetersToDesignPoint, transformDesignPointToMachineMillimeters } from '../machineAdaptation/machineCoordinateTransform.js';
const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 20, centerX: 5, centerY: 10 };
const apply = (point, transform) => transformDesignPointToMachineMillimeters({ point, designBounds: bounds, profile: GENERIC_DST_MACHINE_PROFILE, config: resolveMachineAdaptationConfig({ transform }) });
describe('Phase 11 coordinate transform', () => {
  it('preserves identity', () => expect(apply({ x: 2, y: 3 }, {})).toEqual({ x: 2, y: 3 }));
  it('translates explicitly', () => expect(apply({ x: 2, y: 3 }, { translateXmm: 4, translateYmm: -1 })).toEqual({ x: 6, y: 2 }));
  it('scales uniformly', () => expect(apply({ x: 2, y: 3 }, { scale: 2 })).toEqual({ x: 4, y: 6 }));
  it('inverts x', () => expect(apply({ x: 2, y: 3 }, { invertX: true })).toEqual({ x: -2, y: 3 }));
  it('centers design origin', () => expect(apply({ x: 5, y: 10 }, { originMode: 'design_center_to_machine_origin' })).toEqual({ x: 0, y: 0 }));
  it('normalizes negative rotation', () => { const value = apply({ x: 1, y: 0 }, { rotationDegrees: -90 }); expect(value.x).toBeCloseTo(0); expect(value.y).toBeCloseTo(-1); });
  it.each(Array.from({ length: 12 }, (_, index) => [index * 30]))('round trips rotation %i', rotationDegrees => { const config = resolveMachineAdaptationConfig({ transform: { scale: 1.5, rotationDegrees, invertY: true, translateXmm: 3 } }); const point = { x: 2.5, y: -4 }; const transformed = transformDesignPointToMachineMillimeters({ point, designBounds: bounds, profile: GENERIC_DST_MACHINE_PROFILE, config }); const inverse = inverseTransformMachineMillimetersToDesignPoint({ point: transformed, designBounds: bounds, profile: GENERIC_DST_MACHINE_PROFILE, config }); expect(inverse.x).toBeCloseTo(point.x); expect(inverse.y).toBeCloseTo(point.y); });
});
