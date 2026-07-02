/**
 * DST Direct Export — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Encodes finalEmbroideryCommands directly to a DST file using the stable
 * dstEncoder (balanced-ternary record encoding). No backend roundtrip,
 * no base64, no atob/btoa, no binary string, no DSB involvement.
 *
 * Flow: finalEmbroideryCommands → dstEncoder → Uint8Array → Blob → .dst
 */

import { encodeDSTDelta, encodeDSTMove } from './dstEncoder';
import { buildThreadColorBlocks, ensureColorChangesBetweenBlocks } from './threadColorBlocks';

const HEADER_SIZE = 512;
const RECORD_SIZE = 3;
const EOF_BYTE = 0x1A;

// ─── Header field formatting (signed AX/AY) ──────────────────────────────

function formatCoord(v) {
  const sign = v >= 0 ? '+' : '-';
  return sign + String(Math.abs(Math.round(v))).padStart(5, '0');
}

// ─── Main builder ────────────────────────────────────────────────────────

/**
 * Builds a complete DST file from finalEmbroideryCommands.
 *
 * @param {Array}  commands    — finalEmbroideryCommands [{ type, x, y, color }]
 * @param {Object} opts        — { label, ce01Strict }
 * @returns {{ bytes: Uint8Array, blob: Blob, meta: Object }}
 */
export function buildDSTFromCommands(commands, { label = 'design', ce01Strict = true } = {}) {
  // ── Guarantee colorChange records between distinct color blocks ──────
  // Even if optimizers stripped some colorChange commands, re-insert them
  // here so the DST file always has real STOP records.
  const safeCommands = ensureColorChangesBetweenBlocks(commands || []);
  const threadBlocks = buildThreadColorBlocks(safeCommands);

  const records = [];
  let prevX = 0, prevY = 0; // 0.1mm units (DST coordinate space)
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let colorChanges = 0;
  let stitchRecords = 0;

  for (const cmd of safeCommands) {
    if (!cmd || !cmd.type) continue;

    if (cmd.type === 'end') {
      records.push([0x00, 0x00, 0xF3]);
      break;
    }

    if (cmd.type === 'colorChange') {
      records.push(encodeDSTDelta(0, 0, 'colorChange'));
      colorChanges++;
      continue;
    }

    if (cmd.type === 'trim') {
      // Tajima trim sequence: 3 jump records at current position
      records.push(encodeDSTDelta(0, 0, 'jump'));
      records.push(encodeDSTDelta(0, 0, 'jump'));
      records.push(encodeDSTDelta(0, 0, 'jump'));
      continue;
    }

    // stitch or jump — compute delta in 0.1mm units
    const absX = Math.round((cmd.x || 0) * 10);
    const absY = Math.round((cmd.y || 0) * 10);
    const dx = absX - prevX;
    const dy = absY - prevY;
    const flag = cmd.type === 'jump' ? 'jump' : 'stitch';

    const moveRecords = encodeDSTMove(dx, dy, flag);
    for (const rec of moveRecords) records.push(rec);

    prevX = absX;
    prevY = absY;

    if (cmd.type === 'stitch') {
      stitchRecords += moveRecords.length;
      if (absX < minX) minX = absX;
      if (absX > maxX) maxX = absX;
      if (absY < minY) minY = absY;
      if (absY > maxY) maxY = absY;
    }
  }

  // Ensure END record exists
  if (records.length === 0 || records[records.length - 1][2] !== 0xF3) {
    records.push([0x00, 0x00, 0xF3]);
  }

  const recordCount = records.length;
  const bounds = { plusX: maxX, minusX: -minX, plusY: maxY, minusY: -minY };

  // ── Build header (512 bytes, CR line breaks, signed AX/AY, 0x1A after PD) ──
  const fields = [
    `LA:${(label || 'design').padEnd(16, ' ').substring(0, 16)}`,
    `ST:${String(recordCount).padStart(7, '0')}`,
    `CO:${String(colorChanges).padStart(3, '0')}`,
    `+X:${String(bounds.plusX).padStart(5, '0')}`,
    `-X:${String(bounds.minusX).padStart(5, '0')}`,
    `+Y:${String(bounds.plusY).padStart(5, '0')}`,
    `-Y:${String(bounds.minusY).padStart(5, '0')}`,
    `AX:${formatCoord(prevX)}`,
    `AY:${formatCoord(prevY)}`,
    `MX:+00000`,
    `MY:+00000`,
    `PD:******`,
  ];

  let headerStr = fields.join('\r') + '\r' + '\x1A';
  while (headerStr.length < HEADER_SIZE) headerStr += ' ';
  headerStr = headerStr.substring(0, HEADER_SIZE);

  // ── Assemble bytes ──────────────────────────────────────────────────────
  const headerBytes = new Uint8Array(HEADER_SIZE);
  for (let i = 0; i < HEADER_SIZE; i++) {
    headerBytes[i] = headerStr.charCodeAt(i) & 0xFF;
  }

  const recordBytes = new Uint8Array(records.length * RECORD_SIZE);
  for (let i = 0; i < records.length; i++) {
    recordBytes[i * 3] = records[i][0];
    recordBytes[i * 3 + 1] = records[i][1];
    recordBytes[i * 3 + 2] = records[i][2];
  }

  const totalSize = HEADER_SIZE + records.length * RECORD_SIZE + (ce01Strict ? 1 : 0);
  const fileBytes = new Uint8Array(totalSize);
  fileBytes.set(headerBytes, 0);
  fileBytes.set(recordBytes, HEADER_SIZE);
  if (ce01Strict) fileBytes[totalSize - 1] = EOF_BYTE;

  // ── Color export logs ──────────────────────────────────────────────────
  const visualColorSet = new Set();
  for (const c of safeCommands) {
    if (c.color && (c.type === 'stitch' || c.type === 'jump')) visualColorSet.add(c.color);
  }
  console.log('[color-export] visual colors:', visualColorSet.size);
  console.log('[color-export] thread blocks:', threadBlocks.length);
  console.log('[color-export] color changes inserted:', colorChanges);
  console.log('[color-export] header CO:', colorChanges);
  console.log('[color-export] expected machine colors:', colorChanges + 1);
  if (threadBlocks[0]) console.log('[color-export] first block color:', threadBlocks[0].colorHex);
  if (threadBlocks[1]) console.log('[color-export] second block color:', threadBlocks[1].colorHex);
  console.log('[color-export] dst color stop records:', colorChanges);
  console.log('[color-export] ready:', colorChanges === Math.max(0, threadBlocks.length - 1));

  return {
    bytes: fileBytes,
    blob: new Blob([fileBytes], { type: 'application/octet-stream' }),
    meta: {
      format: 'DST',
      recordCount,
      stitchRecords,
      colorChanges,
      threadBlocks: threadBlocks.length,
      bounds,
      finalX: prevX,
      finalY: prevY,
      fileSize: totalSize,
    },
  };
}