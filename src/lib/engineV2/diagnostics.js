import { validateEngineDocumentV2, _validationInternals } from './modelValidation.js';

function countCodes(errors, codes) {
  const accepted = new Set(codes);
  return errors.filter(item => accepted.has(item.code)).length;
}

export function createEngineV2FoundationDiagnostic(document) {
  const validation = validateEngineDocumentV2(document);
  const safe = document && typeof document === 'object' ? document : {};
  const objects = Array.isArray(safe.objects) ? safe.objects : [];
  const commands = Array.isArray(safe.commands) ? safe.commands : [];
  const endCount = commands.filter(command => command?.type === 'end').length;

  return {
    valid: validation.valid,
    version: safe.version ?? null,
    regionCount: Array.isArray(safe.regions) ? safe.regions.length : 0,
    objectCount: objects.length,
    threadCount: Array.isArray(safe.threads) ? safe.threads.length : 0,
    threadBlockCount: Array.isArray(safe.threadBlocks) ? safe.threadBlocks.length : 0,
    commandCount: commands.length,
    dependencyCount: objects.reduce((sum, object) => sum + (Array.isArray(object?.dependencyIds) ? object.dependencyIds.length : 0), 0),
    circularDependencyCount: _validationInternals.dependencyCycleIds(objects).length,
    invalidGeometryCount: countCodes(validation.errors, ['INVALID_GEOMETRY', 'INVALID_POLYGON', 'INVALID_HOLE_GEOMETRY', 'NON_FINITE_COORDINATE', 'NORMALIZED_COORDINATE_OUT_OF_RANGE']),
    duplicateIdCount: countCodes(validation.errors, ['DUPLICATE_ID', 'DUPLICATE_BLOCK_OBJECT_ID']),
    unknownRegionReferenceCount: countCodes(validation.errors, ['UNKNOWN_REGION_REFERENCE']),
    unknownThreadReferenceCount: countCodes(validation.errors, ['UNKNOWN_THREAD_REFERENCE']),
    unknownObjectReferenceCount: countCodes(validation.errors, ['UNKNOWN_OBJECT_REFERENCE', 'MISSING_DEPENDENCY']),
    missingEndCommand: endCount === 0,
    multipleEndCommands: endCount > 1,
    commandsAfterEnd: validation.errors.some(item => item.code === 'COMMAND_AFTER_END'),
    errors: validation.errors.map(item => ({ ...item })),
    warnings: validation.warnings.map(item => ({ ...item })),
  };
}
