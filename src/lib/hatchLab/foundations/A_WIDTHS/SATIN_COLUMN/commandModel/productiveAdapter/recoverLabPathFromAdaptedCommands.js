/**
 * Pure geometric recovery from the separated start anchor and absolute-mm
 * productive command candidates.
 */

import { isSupportedProductiveTargetContract } from './productiveCommandFieldMap.js';

const finitePoint = (point) => Array.isArray(point)
  && point.length === 2
  && Number.isFinite(point[0])
  && Number.isFinite(point[1]);

/**
 * @param {{
 *   startAnchor?: { pointMm?: Array<number> },
 *   productiveCommands?: Array<Object>,
 *   targetContract?: Object
 * }} [input]
 */
export function recoverLabPathFromAdaptedCommands({
  startAnchor,
  productiveCommands,
  targetContract,
} = {}) {
  const diagnostics = [];
  if (!isSupportedProductiveTargetContract(targetContract)) {
    diagnostics.push('unsupported target contract');
  }
  if (!finitePoint(startAnchor?.pointMm)) {
    diagnostics.push('startAnchor.pointMm must be a finite [x,y] point');
  }
  if (!Array.isArray(productiveCommands)) {
    diagnostics.push('productiveCommands must be an array');
  }

  if (diagnostics.length > 0) {
    return { valid: false, pointsMm: [], diagnostics };
  }

  const pointsMm = [[...startAnchor.pointMm]];
  for (let i = 0; i < productiveCommands.length; i++) {
    const command = productiveCommands[i];
    const point = [command?.[targetContract.xField], command?.[targetContract.yField]];
    if (!finitePoint(point)) {
      diagnostics.push(`command ${i} has a non-finite destination`);
      return { valid: false, pointsMm: [], diagnostics };
    }
    pointsMm.push(point);
  }

  return { valid: true, pointsMm, diagnostics: [] };
}
