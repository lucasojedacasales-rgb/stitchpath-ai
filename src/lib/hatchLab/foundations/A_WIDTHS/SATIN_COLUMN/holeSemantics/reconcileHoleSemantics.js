/**
 * reconcileHoleSemantics.js — P1.F0.2 pure reconciliation between the declared
 * scalar metadata, the producer semantics and the topology actually represented.
 *
 * The raw declared value is always preserved. `sourceDeclaredHoles > 0` is never
 * used on its own as a reason to reject a geometry.
 */

import { describeHoleDeclaration } from '../geometry/holeDeclaration.js';
import { HOLE_FIELD_PRODUCER } from './producerSemantics.js';

export const HOLE_SEMANTIC_STATUSES = ['confirmed_no_real_holes', 'confirmed_real_holes', 'metadata_conflict', 'unresolved', 'unavailable'];
export const HOLE_METADATA_STATUSES = ['clear', 'real_holes', 'conflict', 'unresolved', 'unavailable'];

const STATUS_TO_METADATA = {
  confirmed_no_real_holes: 'clear',
  confirmed_real_holes: 'real_holes',
  metadata_conflict: 'conflict',
  unresolved: 'unresolved',
  unavailable: 'unavailable',
};

/**
 * @param {Object} args
 * @param {Object} args.region             read-only region (never mutated)
 * @param {Object} args.topology           result of auditRegionTopology
 * @param {Object} [args.producerSemantics] defaults to the verified regionBuilder trace
 */
export function reconcileHoleSemantics({ region = {}, topology = null, producerSemantics = HOLE_FIELD_PRODUCER } = {}) {
  const declaration = describeHoleDeclaration(region);
  const reasons = [];
  const warnings = [];
  const sourceField = declaration.holeSourceField;
  const sourceDeclaredHoles = declaration.declaredHoleCount;
  const producer = producerSemantics || {};

  const out = (holeSemanticStatus, geometryEligibilityImpact) => ({
    sourceDeclaredHoles,
    sourceField,
    sourceDeclarationStatus: declaration.holeStatus,
    sourceValueType: sourceField ? (Array.isArray(region[sourceField]) ? 'array' : typeof region[sourceField]) : null,
    sourceMeaning: producer.meaning ?? null,
    sourceMeaningConfidence: producer.meaningConfidence ?? 'unknown',
    sourceProducer: producer.producerFunction ? `${producer.producerFile}::${producer.producerFunction}` : null,
    sourceStage: producer.stage ?? null,
    sourceGeometryReferences: producer.holeGeometryFields ?? [],
    topologyHoleCount: topology ? topology.topologyHoleCount : null,
    interiorRingCount: topology ? topology.interiorRingCount : null,
    holeGeometryAvailable: topology ? !!topology.holeGeometryAvailable : false,
    holeSemanticStatus,
    holeMetadataStatus: STATUS_TO_METADATA[holeSemanticStatus],
    geometryEligibilityImpact,
    rawValuePreserved: true,
    reasons,
    warnings,
  });

  if (!topology || topology.topologyStatus !== 'measured') {
    reasons.push('topology could not be measured, so the declaration cannot be reconciled');
    return out('unavailable', 'unavailable');
  }

  // Real interior geometry always wins: a represented hole is never ignored.
  if (topology.holeGeometryAvailable) {
    reasons.push(`${topology.interiorRingCount} interior ring(s) are actually represented in the region geometry`);
    return out('confirmed_real_holes', 'out_of_scope_for_straight_satin_column');
  }

  if (producer.meaningKnown !== true) {
    reasons.push('the meaning of the declared field could not be demonstrated from its producer');
    if (declaration.holeStatus === 'present') warnings.push('a non-zero declaration with unknown semantics must not be interpreted');
    return out('unresolved', 'blocked_unknown_semantics');
  }

  if (producer.representsInteriorHoles === true) {
    if (declaration.holeStatus !== 'present' || !sourceDeclaredHoles) {
      reasons.push('producer represents interior holes but the region declares none, and no interior ring exists');
      return out('confirmed_no_real_holes', 'none');
    }
    reasons.push(`producer semantics "${producer.meaning}" declare real interior holes, but no interior ring geometry is available in the region`);
    warnings.push('indispensable hole boundary geometry is missing — the region cannot be modelled until it is provided');
    return out('metadata_conflict', 'blocked_missing_hole_geometry');
  }

  // Producer proven non-topological → the scalar stays metadata and blocks nothing.
  reasons.push(`declared value ${sourceDeclaredHoles} on "${sourceField ?? 'none'}" is "${producer.meaning}" (${producer.meaningPlainText ?? 'non-topological metric'}), computed over ${producer.computedOver} — not interior rings`);
  reasons.push('measured topology is unambiguously hole-free: one exterior ring, zero interior rings, zero interior boundaries');
  return out('confirmed_no_real_holes', 'none');
}

/** Maps the reconciliation + geometry verdict into overallEligibility. */
export function resolveOverallEligibility(geometryEligibility, holeMetadataStatus) {
  if (geometryEligibility === 'unavailable' || holeMetadataStatus === 'unavailable') return 'unavailable';
  if (holeMetadataStatus === 'real_holes') return 'ineligible';
  if (holeMetadataStatus === 'conflict' || holeMetadataStatus === 'unresolved') return 'metadata_conflict';
  return geometryEligibility;
}