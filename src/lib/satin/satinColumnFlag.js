/**
 * satinColumnFlag.js — P1.F2 integration switch.
 *
 * The straight satin column path is ON by default (P1.F2 activation): eligible
 * straight bars are stitched as real satin columns. Regions that are not proven
 * eligible still fall back to the previous constant-density boundary path, and
 * setStraightSatinColumnEnabled(false) restores the old behaviour completely.
 */

let enabled = true;

export function isStraightSatinColumnEnabled() {
  return enabled === true;
}

export function setStraightSatinColumnEnabled(value) {
  enabled = value === true;
  return enabled;
}

export const STRAIGHT_SATIN_COLUMN_FLAG = {
  id: 'STRAIGHT_SATIN_COLUMN_P1F2',
  defaultEnabled: true,
  scope: 'main satin stitches inside processObjectStitches',
  fallback: 'constant-density boundary path (previous behaviour) whenever the geometry is not an eligible straight column',
};