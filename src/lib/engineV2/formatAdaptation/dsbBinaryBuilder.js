import { buildDSBHeader, decodeDSBRecord, encodeDSBRecord } from '../../dsbEncoder.js';

const HEADER_SIZE = 512; const EOF_BYTE = 0x1A; const RECORD_SIZE = 3;
const issue = (code, path, message) => ({ code, path, message });

function boundsFromRecords(records) {
  let x = 0; let y = 0; let minX = 0; let maxX = 0; let minY = 0; let maxY = 0;
  records.forEach(record => {
    if (!['stitch', 'jump'].includes(record.type)) return;
    x += record.dxUnits; y += record.dyUnits;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return { bounds: { plusX: maxX, minusX: Math.max(0, -minX), plusY: maxY, minusY: Math.max(0, -minY) }, finalX: x, finalY: y };
}

export function buildDSBBinaryFromRecordPlan({ adaptation, config = adaptation?.config || {} }) {
  const errors = [];
  if (!adaptation?.valid) errors.push(issue('DSB_INVALID_ADAPTATION_BLOCKED', 'adaptation.valid', 'Invalid or blocked adaptation cannot produce DSB bytes.'));
  if (adaptation?.recordPlan?.at(-1)?.type !== 'end') errors.push(issue('DSB_FINAL_END_REQUIRED', 'adaptation.recordPlan', 'Record plan must end with END.'));
  if (errors.length) return { valid: false, bytes: new Uint8Array(), blob: null, records: [], header: null, errors, warnings: [], metadata: { DSBLowLevelEncoderInvoked: false, binaryOutputGenerated: false } };

  const records = adaptation.recordPlan.map(plan => {
    const raw = encodeDSBRecord(plan.dxUnits, plan.dyUnits, plan.type); const decoded = decodeDSBRecord(raw);
    if (decoded.type !== plan.type || decoded.dx !== plan.dxUnits || decoded.dy !== plan.dyUnits) errors.push(issue('DSB_LOW_LEVEL_ROUNDTRIP_FAILED', `recordPlan[${plan.recordPlanIndex}]`, 'Low-level DSB record roundtrip changed type or signed delta.'));
    if (raw[0] !== plan.expectedCommandByte || raw[1] !== (plan.dyUnits < 0 ? plan.dyUnits + 256 : plan.dyUnits) || raw[2] !== (plan.dxUnits < 0 ? plan.dxUnits + 256 : plan.dxUnits)) errors.push(issue('DSB_RECORD_BYTE_ORDER_INVALID', `recordPlan[${plan.recordPlanIndex}]`, 'Record bytes must be command, Y, X.'));
    return Object.freeze({ index: plan.recordPlanIndex, bytes: Object.freeze([...raw]), commandByte: raw[0], type: decoded.type, dxUnits: decoded.dx, dyUnits: decoded.dy, sourceRecordPlanId: plan.id, sourceMachineCommandId: plan.sourceMachineCommandId });
  });
  if (errors.length) return { valid: false, bytes: new Uint8Array(), blob: null, records, header: null, errors, warnings: [], metadata: { DSBLowLevelEncoderInvoked: true, binaryOutputGenerated: false } };

  const movement = boundsFromRecords(records); const colorChanges = records.filter(record => record.type === 'colorChange').length;
  const headerInput = { label: adaptation.headerMetadata.label || config.label || 'design', stitchCount: records.length, colorChanges, bounds: movement.bounds, finalX: movement.finalX, finalY: movement.finalY };
  const headerString = buildDSBHeader(headerInput); const headerBytes = new Uint8Array(HEADER_SIZE);
  for (let index = 0; index < HEADER_SIZE; index += 1) headerBytes[index] = headerString.charCodeAt(index) & 0xFF;
  const bytes = new Uint8Array(HEADER_SIZE + records.length * RECORD_SIZE + 1); bytes.set(headerBytes, 0);
  records.forEach((record, index) => bytes.set(record.bytes, HEADER_SIZE + index * RECORD_SIZE)); bytes[bytes.length - 1] = EOF_BYTE;
  return {
    valid: true, bytes, blob: new Blob([bytes], { type: 'application/octet-stream' }), records,
    header: { ...headerInput, byteLength: HEADER_SIZE, terminatorPresent: headerBytes.includes(EOF_BYTE) }, errors: [], warnings: [],
    metadata: { DSBLowLevelEncoderInvoked: true, binaryOutputGenerated: true, encodeDSBRecordCallCount: records.length, decodeDSBRecordCallCount: records.length, buildDSBHeaderCallCount: 1, signedByteLogicDuplicated: false, encodeDSBMoveInvoked: false },
  };
}
