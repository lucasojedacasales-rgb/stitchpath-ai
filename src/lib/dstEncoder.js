/**
 * DST Encoder — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Correct balanced ternary DST encoding with mandatory roundtrip validation.
 *
 * Bit mapping (CE01-compatible):
 *   Y: b0{0x01:+1, 0x02:-1, 0x04:+9, 0x08:-9}
 *      b1{0x01:+3, 0x02:-3, 0x04:+27, 0x08:-27}
 *      b2{0x04:+81, 0x08:-81}
 *   X: b0{0x80:+1, 0x40:-1, 0x20:+9, 0x10:-9}
 *      b1{0x80:+3, 0x40:-3, 0x20:+27, 0x10:-27}
 *      b2{0x20:+81, 0x10:-81}
 *   Base b2: 0x03 (stitch), 0x83 (jump), 0xC3 (colorChange), 0xF3 (end)
 *
 * 1 DST unit = 0.1 mm. Max delta per record = ±121 (1+3+9+27+81).
 */

const MAX_DELTA = 121;
const UNIT_MM = 0.1;

// ─── Balanced ternary conversion ────────────────────────────────────────
// Places: [1, 3, 9, 27, 81]. Each digit is -1, 0, or +1.

function toBalancedTernary(n) {
  const digits = [0, 0, 0, 0, 0];
  if (n === 0) return digits;
  let val = n;
  for (let place = 0; place < 5 && val !== 0; place++) {
    let rem = val % 3;
    if (rem === 2) { rem = -1; val = (val + 1) / 3; }
    else if (rem === -2) { rem = 1; val = (val - 1) / 3; }
    else if (rem === -1) { val = (val + 1) / 3; }
    else { val = (val - rem) / 3; }
    digits[place] = rem;
  }
  if (val !== 0) throw new Error(`[dst-encoder] Delta ${n} exceeds DST range (max ±${MAX_DELTA})`);
  return digits;
}

// ─── 1. decodeDSTRecord ─────────────────────────────────────────────────

export function decodeDSTRecord(record) {
  const [b0, b1, b2] = record;

  if (b2 === 0xF3) return { dx: 0, dy: 0, flag: 'end' };

  let dx = 0, dy = 0;

  // X
  if (b0 & 0x80) dx += 1;
  if (b0 & 0x40) dx -= 1;
  if (b0 & 0x20) dx += 9;
  if (b0 & 0x10) dx -= 9;
  if (b1 & 0x80) dx += 3;
  if (b1 & 0x40) dx -= 3;
  if (b1 & 0x20) dx += 27;
  if (b1 & 0x10) dx -= 27;
  if (b2 & 0x20) dx += 81;
  if (b2 & 0x10) dx -= 81;

  // Y
  if (b0 & 0x01) dy += 1;
  if (b0 & 0x02) dy -= 1;
  if (b0 & 0x04) dy += 9;
  if (b0 & 0x08) dy -= 9;
  if (b1 & 0x01) dy += 3;
  if (b1 & 0x02) dy -= 3;
  if (b1 & 0x04) dy += 27;
  if (b1 & 0x08) dy -= 27;
  if (b2 & 0x04) dy += 81;
  if (b2 & 0x08) dy -= 81;

  let flag = 'stitch';
  if (b2 & 0x40) flag = 'colorChange';
  else if (b2 & 0x80) flag = 'jump';

  return { dx, dy, flag };
}

// ─── 2. encodeDSTDelta (with mandatory roundtrip) ───────────────────────

export function encodeDSTDelta(dx, dy, flag = 'stitch') {
  dx = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, Math.round(dx)));
  dy = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, Math.round(dy)));

  console.log(`[dst-encoder] requested delta: dx=${dx} dy=${dy} flag=${flag}`);

  // END is always 00 00 F3
  if (flag === 'end') {
    if (dx !== 0 || dy !== 0) {
      throw new Error(`[dst-encoder] END record must have dx=0 dy=0, got dx=${dx} dy=${dy}`);
    }
    const endRecord = [0x00, 0x00, 0xF3];
    console.log(`[dst-encoder] encoded record: 00 00 f3`);
    console.log(`[dst-encoder] decoded delta: dx=0 dy=0 flag=end`);
    console.log(`[dst-encoder] roundtrip ok: dx=0 dy=0`);
    return endRecord;
  }

  const xD = toBalancedTernary(dx);
  const yD = toBalancedTernary(dy);

  let b2 = 0x03;
  if (flag === 'jump') b2 = 0x83;
  else if (flag === 'colorChange') b2 = 0xC3;

  let b0 = 0, b1 = 0;

  // X mapping: place[0]=1, place[1]=3, place[2]=9, place[3]=27, place[4]=81
  if (xD[0] === 1) b0 |= 0x80; else if (xD[0] === -1) b0 |= 0x40;
  if (xD[1] === 1) b1 |= 0x80; else if (xD[1] === -1) b1 |= 0x40;
  if (xD[2] === 1) b0 |= 0x20; else if (xD[2] === -1) b0 |= 0x10;
  if (xD[3] === 1) b1 |= 0x20; else if (xD[3] === -1) b1 |= 0x10;
  if (xD[4] === 1) b2 |= 0x20; else if (xD[4] === -1) b2 |= 0x10;

  // Y mapping: place[0]=1, place[1]=3, place[2]=9, place[3]=27, place[4]=81
  if (yD[0] === 1) b0 |= 0x01; else if (yD[0] === -1) b0 |= 0x02;
  if (yD[1] === 1) b1 |= 0x01; else if (yD[1] === -1) b1 |= 0x02;
  if (yD[2] === 1) b0 |= 0x04; else if (yD[2] === -1) b0 |= 0x08;
  if (yD[3] === 1) b1 |= 0x04; else if (yD[3] === -1) b1 |= 0x08;
  if (yD[4] === 1) b2 |= 0x04; else if (yD[4] === -1) b2 |= 0x08;

  const record = [b0, b1, b2];
  console.log(`[dst-encoder] encoded record: ${hex(b0)} ${hex(b1)} ${hex(b2)}`);

  // ── Mandatory roundtrip validation ──
  const decoded = decodeDSTRecord(record);
  console.log(`[dst-encoder] decoded delta: dx=${decoded.dx} dy=${decoded.dy} flag=${decoded.flag}`);

  if (decoded.dx !== dx || decoded.dy !== dy) {
    throw new Error(`[dst-encoder] roundtrip FAILED: requested dx=${dx} dy=${dy}, decoded dx=${decoded.dx} dy=${decoded.dy}`);
  }

  console.log(`[dst-encoder] roundtrip ok: dx=${dx} dy=${dy}`);
  return record;
}

// ─── 6. splitLongMove ───────────────────────────────────────────────────

export function splitLongMove(dx, dy, flag = 'stitch') {
  if (Math.abs(dx) <= MAX_DELTA && Math.abs(dy) <= MAX_DELTA) {
    return [[dx, dy, flag]];
  }
  const steps = Math.max(Math.ceil(Math.abs(dx) / MAX_DELTA), Math.ceil(Math.abs(dy) / MAX_DELTA));
  const result = [];
  for (let s = 1; s <= steps; s++) {
    const sdx = Math.round((dx * s) / steps) - Math.round((dx * (s - 1)) / steps);
    const sdy = Math.round((dy * s) / steps) - Math.round((dy * (s - 1)) / steps);
    result.push([sdx, sdy, flag]);
  }
  return result;
}

// ─── Full DST file encoder ──────────────────────────────────────────────
// stitches: [{ x, y, type, color }] — x/y in millimeters

export function encodeDSTFile(stitches, options = {}) {
  const { ce01Strict = true, label = 'StitchPath' } = options;
  const records = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    const tx = Math.round(s.x / UNIT_MM);
    const ty = Math.round(s.y / UNIT_MM);
    const dx = tx - cx;
    const dy = ty - cy;

    if (s.type === 'end') {
      records.push([0x00, 0x00, 0xF3]);
      break;
    }

    let flag = 'stitch';
    if (s.type === 'jump') flag = 'jump';
    else if (s.type === 'colorChange') flag = 'colorChange';
    else if (s.type === 'trim') {
      // Trim = 3 jump records at current position (Tajima convention)
      records.push(encodeDSTDelta(0, 0, 'jump'));
      records.push(encodeDSTDelta(0, 0, 'jump'));
      records.push(encodeDSTDelta(0, 0, 'jump'));
      continue;
    }

    // Split long moves (>±121 units)
    const parts = splitLongMove(dx, dy, flag);
    for (const [pdx, pdy, pflag] of parts) {
      records.push(encodeDSTDelta(pdx, pdy, pflag));
    }

    cx = tx;
    cy = ty;
  }

  // Ensure END exists
  if (records.length === 0 || records[records.length - 1][2] !== 0xF3) {
    records.push([0x00, 0x00, 0xF3]);
  }

  // ── 7. Recalculate bounds from decoded records ──
  let cumX = 0, cumY = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let colorChanges = 0;

  for (const rec of records) {
    const decoded = decodeDSTRecord(rec);
    cumX += decoded.dx;
    cumY += decoded.dy;
    if (decoded.flag === 'colorChange') colorChanges++;
    if (cumX < minX) minX = cumX;
    if (cumX > maxX) maxX = cumX;
    if (cumY < minY) minY = cumY;
    if (cumY > maxY) maxY = cumY;
  }

  const stitchCount = records.length; // All records including END
  const finalX = cumX;
  const finalY = cumY;

  const decodedBounds = { minX, maxX, minY, maxY };
  const headerBounds = { plusX: maxX, minusX: -minX, plusY: maxY, minusY: -minY };

  console.log(`[dst-encoder] decoded bounds: minX=${minX} maxX=${maxX} minY=${minY} maxY=${maxY}`);
  console.log(`[dst-encoder] header bounds: plusX=${maxX} minusX=${-minX} plusY=${maxY} minusY=${-minY}`);
  console.log(`[dst-encoder] header matches decoded: true`);
  console.log(`[dst-encoder] binary ready: ${records.length} records, ST=${stitchCount}, CO=${colorChanges}`);

  // ── 8. Build header (512 bytes, CR line endings, 0x1A after PD) ──
  const header = new Uint8Array(512).fill(0x20);
  let hpos = 0;
  const writeStr = (s) => {
    for (let i = 0; i < s.length && hpos < 510; i++) header[hpos++] = s.charCodeAt(i);
    header[hpos++] = 0x0D; // CR only, no CRLF
  };

  writeStr(`LA:${label.padEnd(16, ' ').slice(0, 16)}`);
  writeStr(`ST:${String(stitchCount).padStart(7, '0')}`);
  writeStr(`CO:${String(colorChanges).padStart(3, '0')}`);
  writeStr(`+X:${String(maxX).padStart(5, '0')}`);
  writeStr(`-X:${String(-minX).padStart(5, '0')}`);
  writeStr(`+Y:${String(maxY).padStart(5, '0')}`);
  writeStr(`-Y:${String(-minY).padStart(5, '0')}`);
  writeStr(`AX:${finalX >= 0 ? '+' : '-'}${String(Math.abs(finalX)).padStart(5, '0')}`);
  writeStr(`AY:${finalY >= 0 ? '+' : '-'}${String(Math.abs(finalY)).padStart(5, '0')}`);
  writeStr('MX:+00000');
  writeStr('MY:+00000');
  writeStr('PD:******');

  // 0x1A after PD line, within the 512-byte header
  if (hpos < 512) header[hpos++] = 0x1A;

  // ── 9. Assemble file (header + records + END + optional EOF 0x1A) ──
  const eofByte = ce01Strict ? 1 : 0;
  const buf = new Uint8Array(512 + records.length * 3 + eofByte);
  buf.set(header, 0);
  let pos = 512;
  for (const rec of records) {
    buf[pos++] = rec[0];
    buf[pos++] = rec[1];
    buf[pos++] = rec[2];
  }
  if (ce01Strict) buf[pos++] = 0x1A;

  return buf;
}

// ─── Validate DST file by decoding all records ──────────────────────────

export function validateDSTFile(buffer) {
  const bytes = new Uint8Array(buffer);
  const fileSize = bytes.length;
  const hasHeader512 = fileSize >= 512;
  const hasEofByte = bytes[fileSize - 1] === 0x1A;

  const dataStart = 512;
  const dataEnd = hasEofByte ? fileSize - 1 : fileSize;
  const dataLength = dataEnd - dataStart;
  const recordCount = Math.floor(dataLength / 3);
  const trailingBytes = dataLength % 3;

  // Decode all records
  let cumX = 0, cumY = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let stitchCount = 0;
  let colorChanges = 0;
  let hasEnd = false;

  for (let i = dataStart; i + 2 < dataEnd; i += 3) {
    const rec = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const decoded = decodeDSTRecord(rec);

    if (decoded.flag === 'end') { hasEnd = true; break; }

    cumX += decoded.dx;
    cumY += decoded.dy;
    stitchCount++;
    if (decoded.flag === 'colorChange') colorChanges++;
    if (cumX < minX) minX = cumX;
    if (cumX > maxX) maxX = cumX;
    if (cumY < minY) minY = cumY;
    if (cumY > maxY) maxY = cumY;
  }

  // Parse header
  const headerStr = bufferToAscii(bytes.slice(0, 512));
  const headerST = parseField(headerStr, 'ST');
  const headerCO = parseField(headerStr, 'CO');
  const headerPlusX = parseField(headerStr, '+X');
  const headerMinusX = parseField(headerStr, '-X');
  const headerPlusY = parseField(headerStr, '+Y');
  const headerMinusY = parseField(headerStr, '-Y');

  const stMatch = headerST === stitchCount;
  const coMatch = headerCO === colorChanges;
  const boundsMatch = headerPlusX !== null &&
    headerPlusX >= maxX * 0.95 && headerMinusX >= -minX * 0.95 &&
    headerPlusY >= maxY * 0.95 && headerMinusY >= -minY * 0.95;

  console.log(`[dst-encoder] decoded bounds: minX=${minX} maxX=${maxX} minY=${minY} maxY=${maxY}`);
  console.log(`[dst-encoder] header bounds: plusX=${headerPlusX} minusX=${headerMinusX} plusY=${headerPlusY} minusY=${headerMinusY}`);
  console.log(`[dst-encoder] header matches decoded: ${stMatch && boundsMatch}`);
  console.log(`[dst-encoder] binary ready: ${stMatch && boundsMatch && hasEnd && trailingBytes === 0}`);

  return {
    valid: stMatch && boundsMatch && hasEnd && trailingBytes === 0,
    stMatch,
    coMatch,
    boundsMatch,
    hasEnd,
    hasHeader512,
    hasEofByte,
    trailingBytes,
    recordCount,
    declaredST: headerST,
    actualStitches: stitchCount,
    declaredCO: headerCO,
    actualColorChanges: colorChanges,
    bounds: { minX, maxX, minY, maxY },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function hex(b) { return b.toString(16).padStart(2, '0'); }

function bufferToAscii(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13) str += '\r';
    else if (b === 10) str += '\n';
    else if (b >= 32 && b <= 126) str += String.fromCharCode(b);
    else str += '.';
  }
  return str;
}

function parseField(headerStr, field) {
  const tag = field + ':';
  const idx = headerStr.indexOf(tag);
  if (idx === -1) return null;
  const rest = headerStr.substring(idx + tag.length);
  const match = rest.match(/^\s*(-?\d+)/);
  return match ? parseInt(match[1], 10) : null;
}