/**
 * satinColumnFlag.js — P1.F2 integration switch.
 *
 * The straight satin column path is OFF by default: with the flag disabled the
 * engine behaves exactly as before (satin main stitches = constant-density
 * boundary path). Enabling it is an explicit, reversible decision.
 */

let enabled = false;

export function isStraightSatinColumnEnabled() {
  return enabled === true;
}

export function setStraightSatinColumnEnabled(value) {
  enabled = value === true;
  return enabled;
}

export const STRAIGHT_SATIN_COLUMN_FLAG = {
  id: 'STRAIGHT_SATIN_COLUMN_P1F2',
  defaultEnabled: false,
  scope: 'main satin stitches inside processObjectStitches',
  fallback: 'constant-density boundary path (previous behaviour) whenever the geometry is not an eligible straight column',
};