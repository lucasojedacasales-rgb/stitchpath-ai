import { decodeDSBRecord } from '../../dsbEncoder.js';

const HEADER_SIZE = 512; const EOF_BYTE = 0x1A; const RECORD_SIZE = 3;
const issue = (code, path, message) => ({ code, path, message });

function parseHeader(bytes) {
  const text = Array.from(bytes.slice(0, HEADER_SIZE), byte => byte >= 32 && byte <= 126 || byte === 13 ? String.fromCharCode(byte) : byte === EOF_BYTE ? '\x1A' : '').join('');
  const field = name => {
    const match = text.match(new RegExp(`${name.replace(/[+]/g, '\\+')}:[ ]*(-?\\d+)`));
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const labelMatch = text.match(/LA:([^\r]*)/);
  return {
    label: labelMatch ? labelMatch[1].trimEnd() : null, ST: field('ST'), CO: field('CO'), plusX: field('+X'), minusX: field('-X'),
    plusY: field('+Y'), minusY: field('-Y'), AX: field('AX'), AY: field('AY'), terminatorPresent: bytes.slice(0, HEADER_SIZE).includes(EOF_BYTE), byteLength: HEADER_SIZE,
  };
}

export function parseEngineV2DSBBinary(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(); const errors = []; const warnings = [];
  if (!(input instanceof Uint8Array)) errors.push(issue('DSB_PARSER_UINT8ARRAY_REQUIRED', 'bytes', 'DSB parser requires Uint8Array bytes.'));
  if (bytes.length < HEADER_SIZE + RECORD_SIZE + 1) errors.push(issue('DSB_PARSER_BINARY_TOO_SHORT', 'bytes', 'DSB binary must contain a 512-byte header, END record and EOF.'));
  const finalEOFPresent = bytes.at(-1) === EOF_BYTE; if (!finalEOFPresent) errors.push(issue('DSB_PARSER_EOF_MISSING', 'bytes', 'Final EOF byte 0x1A is missing.'));
  const dataEnd = finalEOFPresent ? bytes.length - 1 : bytes.length; const trailingBytes = Math.max(0, (dataEnd - HEADER_SIZE) % RECORD_SIZE);
  if (trailingBytes) errors.push(issue('DSB_PARSER_TRAILING_BYTES', 'records', 'Record data has trailing bytes.'));
  const header = bytes.length >= HEADER_SIZE ? parseHeader(bytes) : null;
  if (header && !header.terminatorPresent) errors.push(issue('DSB_PARSER_HEADER_TERMINATOR_MISSING', 'header', 'Header terminator is missing.'));
  const records = []; const commandDistribution = {}; let xUnits = 0; let yUnits = 0; let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
  for (let offset = HEADER_SIZE, index = 0; offset + 2 < dataEnd; offset += RECORD_SIZE, index += 1) {
    const raw = [bytes[offset], bytes[offset + 1], bytes[offset + 2]]; const decoded = decodeDSBRecord(raw);
    if (![0x80, 0x81, 0x88, 0xF8].includes(raw[0])) errors.push(issue('DSB_PARSER_UNKNOWN_RECORD', `records[${index}]`, 'Unknown DSB command byte.'));
    if (['stitch', 'jump'].includes(decoded.type)) {
      xUnits += decoded.dx; yUnits += decoded.dy; minX = Math.min(minX, xUnits); maxX = Math.max(maxX, xUnits); minY = Math.min(minY, yUnits); maxY = Math.max(maxY, yUnits);
    }
    commandDistribution[decoded.type] = (commandDistribution[decoded.type] || 0) + 1;
    records.push(Object.freeze({ index, offset, bytes: Object.freeze(raw), commandByte: decoded.command, type: decoded.type, dxUnits: decoded.dx, dyUnits: decoded.dy, xUnits, yUnits }));
  }
  const endIndexes = records.filter(record => record.type === 'end').map(record => record.index);
  if (endIndexes.length !== 1) errors.push(issue('DSB_PARSER_END_COUNT_INVALID', 'records', 'Exactly one END record is required.'));
  if (endIndexes.length === 1 && endIndexes[0] !== records.length - 1) errors.push(issue('DSB_PARSER_RECORD_AFTER_END', 'records', 'END must be the final record.'));
  const bounds = { plusX: maxX, minusX: Math.max(0, -minX), plusY: maxY, minusY: Math.max(0, -minY) };
  if (header) {
    if (header.ST !== records.length) errors.push(issue('DSB_PARSER_HEADER_ST_MISMATCH', 'header.ST', 'ST must equal actual record count.'));
    if (header.CO !== (commandDistribution.colorChange || 0)) errors.push(issue('DSB_PARSER_HEADER_CO_MISMATCH', 'header.CO', 'CO must equal actual color-change count.'));
    if ([header.plusX, header.minusX, header.plusY, header.minusY].join(',') !== [bounds.plusX, bounds.minusX, bounds.plusY, bounds.minusY].join(',')) errors.push(issue('DSB_PARSER_HEADER_BOUNDS_MISMATCH', 'header', 'Header bounds must match decoded full movement bounds.'));
    if (header.AX !== xUnits || header.AY !== yUnits) errors.push(issue('DSB_PARSER_HEADER_FINAL_POSITION_MISMATCH', 'header', 'Header AX/AY must match decoded final position.'));
  }
  return Object.freeze({
    valid: errors.length === 0, bytesLength: bytes.length, header, records: Object.freeze(records), recordCount: records.length,
    commandDistribution: Object.freeze(commandDistribution), decodedBounds: Object.freeze(bounds), finalPosition: Object.freeze({ xUnits, yUnits }),
    endRecordCount: endIndexes.length, finalEOFPresent, trailingBytes, errors: Object.freeze(errors), warnings: Object.freeze(warnings),
  });
}
