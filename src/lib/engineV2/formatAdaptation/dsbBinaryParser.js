import { decodeDSBRecord } from '../../dsbEncoder.js';

const HEADER_SIZE = 512;
const EOF_BYTE = 0x1A;
const RECORD_SIZE = 3;
const WILCOM_MOVEMENT_LOW_BITS = new Set([0, 1]);
const issue = (code, path, message) => ({ code, path, message });

function headerText(bytes) {
  return Array.from(bytes.slice(0, HEADER_SIZE), byte => (
    byte >= 32 && byte <= 126 || byte === 13
      ? String.fromCharCode(byte)
      : byte === EOF_BYTE ? '\x1A' : ''
  )).join('');
}

function parseLegacyHeader(bytes) {
  const text = headerText(bytes);
  const field = name => {
    const match = text.match(new RegExp(`${name.replace(/[+]/g, '\\+')}:[ ]*(-?\\d+)`));
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const labelMatch = text.match(/LA:([^\r]*)/);
  return {
    label: labelMatch ? labelMatch[1].trimEnd() : null,
    ST: field('ST'),
    CO: field('CO'),
    plusX: field('+X'),
    minusX: field('-X'),
    plusY: field('+Y'),
    minusY: field('-Y'),
    AX: field('AX'),
    AY: field('AY'),
    terminatorPresent: bytes.slice(0, HEADER_SIZE).includes(EOF_BYTE),
    byteLength: HEADER_SIZE,
  };
}

function parseWilcomHeader(bytes) {
  const text = headerText(bytes);
  const field = name => {
    const escaped = name.replace(/[+]/g, '\\+');
    const match = text.match(new RegExp(`${escaped}:([+-])?\\s*(\\d+)`));
    if (!match) return null;
    return (match[1] === '-' ? -1 : 1) * Number.parseInt(match[2], 10);
  };
  const labelMatch = text.match(/LA:([^\r]*)/);
  return {
    label: labelMatch ? labelMatch[1].trimEnd() : null,
    ST: field('ST'),
    CO: field('CO'),
    plusX: field('+X'),
    minusX: field('-X'),
    plusY: field('+Y'),
    minusY: field('-Y'),
    AX: field('AX'),
    AY: field('AY'),
    terminatorPresent: bytes.slice(0, HEADER_SIZE).includes(EOF_BYTE),
    byteLength: HEADER_SIZE,
  };
}

export function decodeWilcomDSBRecord(rawRecord) {
  const raw = Array.from(rawRecord || []);
  const control = raw[0];
  const yMagnitude = raw[1];
  const xMagnitude = raw[2];
  const lowBits = control & 0x1F;

  if (WILCOM_MOVEMENT_LOW_BITS.has(lowBits)) {
    const dxUnits = (control & 0x20 ? -1 : 1) * xMagnitude;
    const dyUnits = (control & 0x40 ? -1 : 1) * yMagnitude;
    const type = lowBits === 0 ? 'stitch' : 'jump';
    return {
      command: control,
      type,
      dx: dxUnits,
      dy: dyUnits,
      controlFamily: type === 'stitch' ? 'wilcom_sign_magnitude_sewn_like_movement' : 'wilcom_sign_magnitude_jump_like_movement',
      literalControlValue: control,
      decodedDelta: Object.freeze({ xUnits: dxUnits, yUnits: dyUnits }),
      parserConfidence: 'high',
      physicalSemanticStatus: 'movement_structure_resolved',
    };
  }

  if (control === 0x88) {
    return {
      command: control,
      type: 'colorChange',
      dx: 0,
      dy: 0,
      controlFamily: 'legacy_engine_v2_color_change',
      literalControlValue: control,
      decodedDelta: Object.freeze({ xUnits: 0, yUnits: 0 }),
      parserConfidence: 'high',
      physicalSemanticStatus: 'legacy_engine_v2_semantics_preserved',
    };
  }

  if (control === 0xE7) {
    return {
      command: control,
      type: 'opaqueControl',
      dx: 0,
      dy: 0,
      controlFamily: 'opaque_zero_displacement_control',
      literalControlValue: control,
      decodedDelta: Object.freeze({ xUnits: 0, yUnits: 0 }),
      parserConfidence: 'high_for_structure_only',
      physicalSemanticStatus: 'unresolved_not_trim_or_thread_cut',
    };
  }

  if (control >= 0xE8 && control <= 0xEF) {
    return {
      command: control,
      type: 'opaqueStateControl',
      dx: 0,
      dy: 0,
      controlFamily: 'opaque_colour_or_state_control_with_literal_preserved',
      literalControlValue: control,
      decodedDelta: Object.freeze({ xUnits: 0, yUnits: 0 }),
      parserConfidence: 'high_for_structure_only',
      physicalSemanticStatus: 'unresolved_not_a_verified_physical_colour_block',
    };
  }

  if (control === 0xF8) {
    return {
      command: control,
      type: 'end',
      dx: 0,
      dy: 0,
      controlFamily: 'end',
      literalControlValue: control,
      decodedDelta: Object.freeze({ xUnits: 0, yUnits: 0 }),
      parserConfidence: 'high',
      physicalSemanticStatus: 'end_structure_resolved',
    };
  }

  return {
    command: control,
    type: 'unknownCriticalControl',
    dx: 0,
    dy: 0,
    controlFamily: 'unsupported_critical_control',
    literalControlValue: control,
    decodedDelta: Object.freeze({ xUnits: 0, yUnits: 0 }),
    parserConfidence: 'none',
    physicalSemanticStatus: 'unresolved_unsupported_critical_control',
  };
}

function frozenWilcomRecord({ index, offset, raw, decoded, xUnits, yUnits }) {
  return Object.freeze({
    index,
    offset,
    bytes: Object.freeze([...raw]),
    commandByte: decoded.command,
    type: decoded.type,
    dxUnits: decoded.dx,
    dyUnits: decoded.dy,
    xUnits,
    yUnits,
    rawControlByte: decoded.command,
    rawRecordBytes: Object.freeze([...raw]),
    controlFamily: decoded.controlFamily,
    literalControlValue: decoded.literalControlValue,
    decodedDelta: decoded.decodedDelta,
    parserConfidence: decoded.parserConfidence,
    physicalSemanticStatus: decoded.physicalSemanticStatus,
  });
}

export function parseEngineV2DSBBinary(input, rawOptions = {}) {
  const experimentalEnabled = rawOptions.experimentalWilcomDsbSignMagnitudeFamilyDecode === true;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array();
  const errors = [];
  const warnings = [];
  if (!(input instanceof Uint8Array)) errors.push(issue('DSB_PARSER_UINT8ARRAY_REQUIRED', 'bytes', 'DSB parser requires Uint8Array bytes.'));
  if (bytes.length < HEADER_SIZE + RECORD_SIZE + 1) errors.push(issue('DSB_PARSER_BINARY_TOO_SHORT', 'bytes', 'DSB binary must contain a 512-byte header, END record and EOF.'));
  const finalEOFPresent = bytes.at(-1) === EOF_BYTE;
  if (!finalEOFPresent) errors.push(issue('DSB_PARSER_EOF_MISSING', 'bytes', 'Final EOF byte 0x1A is missing.'));
  const dataEnd = finalEOFPresent ? bytes.length - 1 : bytes.length;
  const trailingBytes = Math.max(0, (dataEnd - HEADER_SIZE) % RECORD_SIZE);
  if (trailingBytes) errors.push(issue('DSB_PARSER_TRAILING_BYTES', 'records', 'Record data has trailing bytes.'));
  const header = bytes.length >= HEADER_SIZE ? (experimentalEnabled ? parseWilcomHeader(bytes) : parseLegacyHeader(bytes)) : null;
  if (header && !header.terminatorPresent) errors.push(issue('DSB_PARSER_HEADER_TERMINATOR_MISSING', 'header', 'Header terminator is missing.'));
  if (experimentalEnabled && header) {
    ['ST', 'CO', 'plusX', 'minusX', 'plusY', 'minusY', 'AX', 'AY'].forEach(field => {
      if (!Number.isInteger(header[field])) errors.push(issue('DSB_PARSER_HEADER_FIELD_INVALID', `header.${field}`, `${field} must be an integer header field.`));
    });
  }

  const records = [];
  const commandDistribution = {};
  let xUnits = 0;
  let yUnits = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (let offset = HEADER_SIZE, index = 0; offset + 2 < dataEnd; offset += RECORD_SIZE, index += 1) {
    const raw = [bytes[offset], bytes[offset + 1], bytes[offset + 2]];
    const decoded = experimentalEnabled ? decodeWilcomDSBRecord(raw) : decodeDSBRecord(raw);
    if (experimentalEnabled ? decoded.type === 'unknownCriticalControl' : ![0x80, 0x81, 0x88, 0xF8].includes(raw[0])) {
      errors.push(issue('DSB_PARSER_UNKNOWN_RECORD', `records[${index}]`, 'Unknown DSB command byte.'));
    }
    if (['stitch', 'jump'].includes(decoded.type)) {
      xUnits += decoded.dx;
      yUnits += decoded.dy;
      minX = Math.min(minX, xUnits);
      maxX = Math.max(maxX, xUnits);
      minY = Math.min(minY, yUnits);
      maxY = Math.max(maxY, yUnits);
    }
    commandDistribution[decoded.type] = (commandDistribution[decoded.type] || 0) + 1;
    records.push(experimentalEnabled
      ? frozenWilcomRecord({ index, offset, raw, decoded, xUnits, yUnits })
      : Object.freeze({ index, offset, bytes: Object.freeze(raw), commandByte: decoded.command, type: decoded.type, dxUnits: decoded.dx, dyUnits: decoded.dy, xUnits, yUnits }));
  }
  const endIndexes = records.filter(record => record.type === 'end').map(record => record.index);
  if (endIndexes.length !== 1) errors.push(issue('DSB_PARSER_END_COUNT_INVALID', 'records', 'Exactly one END record is required.'));
  if (endIndexes.length === 1 && endIndexes[0] !== records.length - 1) errors.push(issue('DSB_PARSER_RECORD_AFTER_END', 'records', 'END must be the final record.'));
  const bounds = { plusX: maxX, minusX: Math.max(0, -minX), plusY: maxY, minusY: Math.max(0, -minY) };
  if (header) {
    if (header.ST !== records.length) errors.push(issue('DSB_PARSER_HEADER_ST_MISMATCH', 'header.ST', 'ST must equal actual record count.'));
    const structuralColorControlCount = experimentalEnabled
      ? (commandDistribution.opaqueStateControl || 0) + (commandDistribution.colorChange || 0)
      : (commandDistribution.colorChange || 0);
    if (header.CO !== structuralColorControlCount) errors.push(issue('DSB_PARSER_HEADER_CO_MISMATCH', 'header.CO', 'CO must equal actual colour/state-control count.'));
    if ([header.plusX, header.minusX, header.plusY, header.minusY].join(',') !== [bounds.plusX, bounds.minusX, bounds.plusY, bounds.minusY].join(',')) errors.push(issue('DSB_PARSER_HEADER_BOUNDS_MISMATCH', 'header', 'Header bounds must match decoded full movement bounds.'));
    if (header.AX !== xUnits || header.AY !== yUnits) errors.push(issue('DSB_PARSER_HEADER_FINAL_POSITION_MISMATCH', 'header', 'Header AX/AY must match decoded final position.'));
  }
  return Object.freeze({
    valid: errors.length === 0,
    bytesLength: bytes.length,
    header,
    records: Object.freeze(records),
    recordCount: records.length,
    commandDistribution: Object.freeze(commandDistribution),
    decodedBounds: Object.freeze(bounds),
    finalPosition: Object.freeze({ xUnits, yUnits }),
    endRecordCount: endIndexes.length,
    finalEOFPresent,
    trailingBytes,
    experimentalWilcomDsbSignMagnitudeFamilyDecode: experimentalEnabled,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}
