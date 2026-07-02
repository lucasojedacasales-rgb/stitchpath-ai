/**
 * CE01 Format Test Suite — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates minimal, design-independent test files in DST and DSB formats
 * to diagnose Caydo CE01 compatibility issues.
 *
 * These files bypass ALL processing pipelines (stitch planner, optimizer,
 * autofix, adaptive engine, sanitizer, CE01 safe fill). They are generated
 * directly from simple coordinates.
 *
 * Tests:
 *   TEST_01_DST_LINE     — 10×10mm line, 1 color, ~25 stitches
 *   TEST_02_DST_SQUARE   — 30×30mm square outline, 1 color, <300 stitches
 *   TEST_03_DST_FILL     — 50×50mm filled square, 1 color, <1000 stitches
 *   TEST_04_DSB_LINE     — same as 01 but DSB (Barudan signed-byte encoding)
 *   TEST_05_DSB_SQUARE   — same as 02 but DSB
 */

const HEADER_SIZE = 512;
const EOF_BYTE = 0x1A;
const RECORD_SIZE = 3;

// ─── Header builder (512-byte ASCII, shared by DST and DSB) ──────────────

function buildHeader(label, stitchCount, colorCount, bounds) {
  const fields = [
    `LA:${(label || 'test').padEnd(16, ' ').substring(0, 16)}`,
    `ST:${String(stitchCount).padStart(6, ' ')}`,
    `CO:${String(colorCount).padStart(4, ' ')}`,
    `+X:${String(bounds.plusX).padStart(6, ' ')}`,
    `-X:${String(bounds.minusX).padStart(6, ' ')}`,
    `+Y:${String(bounds.plusY).padStart(6, ' ')}`,
    `-Y:${String(bounds.minusY).padStart(6, ' ')}`,
    `AX:${String(bounds.plusX).padStart(6, ' ')}`,
    `AY:${String(bounds.plusY).padStart(6, ' ')}`,
    `MX:${String(0).padStart(6, ' ')}`,
    `MY:${String(0).padStart(6, ' ')}`,
    `PD:******`,
  ];

  let header = fields.join('\r\n') + '\r\n';
  while (header.length < HEADER_SIZE) header += ' ';
  return header.substring(0, HEADER_SIZE);
}

// ─── DST record encoder (Tajima bit-packed) ──────────────────────────────

function encodeDSTStitch(dx, dy) {
  let b0 = 0, b1 = 0xC0, b2 = 0x03; // b1 bits 6,7 always set; b2 bits 0,1 for stitch
  const ax = Math.abs(Math.round(dx));
  const ay = Math.abs(Math.round(dy));

  if (ax & 1) b0 |= 0x01;
  if (ax & 2) b0 |= 0x02;
  if (ax & 4) b0 |= 0x04;
  if (ax & 8) b0 |= 0x08;
  if (ax & 16) b1 |= 0x01;
  if (ax & 32) b1 |= 0x02;
  if (dx < 0) b1 |= 0x04;

  if (ay & 1) b0 |= 0x10;
  if (ay & 2) b0 |= 0x20;
  if (ay & 4) b0 |= 0x40;
  if (ay & 8) b0 |= 0x80;
  if (ay & 16) b1 |= 0x08;
  if (ay & 32) b1 |= 0x10;
  if (dy < 0) b1 |= 0x20;

  return [b0, b1, b2];
}

function encodeDSTEnd() {
  return [0x00, 0x00, 0xF3];
}

// ─── DSB record encoder (Barudan signed-byte) ────────────────────────────

function encodeDSBStitch(dx, dy) {
  let ddx = Math.round(dx);
  let ddy = Math.round(dy);
  if (ddx > 127) ddx = 127;
  if (ddx < -128) ddx = -128;
  if (ddy > 127) ddy = 127;
  if (ddy < -128) ddy = -128;

  const b0 = ddx & 0xFF;
  const b1 = ddy & 0xFF;
  const b2 = 0x03; // normal stitch (same flags as DST for compatibility)
  return [b0, b1, b2];
}

function encodeDSBEnd() {
  return [0x00, 0x00, 0xF3];
}

// ─── Coordinate generators ───────────────────────────────────────────────

/** Line from origin, split into equal stitches. All units in 0.1mm. */
function generateLinePoints(lengthUnits, stitchCount) {
  const points = [];
  const step = lengthUnits / stitchCount;
  for (let i = 1; i <= stitchCount; i++) {
    points.push([Math.round(step * i), 0]);
  }
  return points;
}

/** Square outline, split into small stitches. */
function generateSquarePoints(sizeUnits, stitchLen) {
  const points = [];
  const sides = [
    [0, 0, sizeUnits, 0],
    [sizeUnits, 0, sizeUnits, sizeUnits],
    [sizeUnits, sizeUnits, 0, sizeUnits],
    [0, sizeUnits, 0, 0],
  ];
  for (const [x1, y1, x2, y2] of sides) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const count = Math.max(1, Math.round(dist / stitchLen));
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      points.push([
        Math.round(x1 + (x2 - x1) * t),
        Math.round(y1 + (y2 - y1) * t),
      ]);
    }
  }
  return points;
}

/** Serpentine (boustrophedon) fill of a square. */
function generateFillPoints(sizeUnits, rowSpacing, stitchLen) {
  const points = [];
  const rowCount = Math.floor(sizeUnits / rowSpacing);
  const stitchesPerRow = Math.floor(sizeUnits / stitchLen);

  for (let row = 0; row <= rowCount; row++) {
    const y = row * rowSpacing;
    if (row % 2 === 0) {
      for (let i = 1; i <= stitchesPerRow; i++) {
        points.push([i * stitchLen, y]);
      }
    } else {
      for (let i = stitchesPerRow; i >= 0; i--) {
        points.push([i * stitchLen, y]);
      }
    }
  }
  return points;
}

// ─── File builder ────────────────────────────────────────────────────────

function buildFile(format, label, stitchPoints, colorCount) {
  const encode = format === 'DSB' ? encodeDSBStitch : encodeDSTStitch;
  const encodeEnd = format === 'DSB' ? encodeDSBEnd : encodeDSTEnd;
  const maxDisp = format === 'DSB' ? 100 : 121;

  const records = [];
  let prevX = 0, prevY = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  for (const [absX, absY] of stitchPoints) {
    if (absX < minX) minX = absX;
    if (absX > maxX) maxX = absX;
    if (absY < minY) minY = absY;
    if (absY > maxY) maxY = absY;

    const totalDx = Math.round(absX - prevX);
    const totalDy = Math.round(absY - prevY);
    const steps = Math.max(1,
      Math.ceil(Math.abs(totalDx) / maxDisp),
      Math.ceil(Math.abs(totalDy) / maxDisp)
    );

    for (let s = 1; s <= steps; s++) {
      const dx = Math.round(totalDx * s / steps) - Math.round(totalDx * (s - 1) / steps);
      const dy = Math.round(totalDy * s / steps) - Math.round(totalDy * (s - 1) / steps);
      records.push(encode(dx, dy));
    }
    prevX = absX;
    prevY = absY;
  }

  // END record
  records.push(encodeEnd());

  const stitchCount = records.length - 1; // exclude END
  const bounds = {
    plusX: maxX,
    minusX: -minX,
    plusY: maxY,
    minusY: -minY,
  };

  // Build header
  const headerStr = buildHeader(label, stitchCount, colorCount, bounds);
  const headerBytes = new Uint8Array(HEADER_SIZE);
  for (let i = 0; i < HEADER_SIZE; i++) {
    headerBytes[i] = headerStr.charCodeAt(i) & 0xFF;
  }

  // Build record bytes
  const recordBytes = new Uint8Array(records.length * RECORD_SIZE);
  for (let i = 0; i < records.length; i++) {
    recordBytes[i * 3] = records[i][0];
    recordBytes[i * 3 + 1] = records[i][1];
    recordBytes[i * 3 + 2] = records[i][2];
  }

  // Combine: header + records + 0x1A
  const totalSize = HEADER_SIZE + records.length * RECORD_SIZE + 1;
  const fileBytes = new Uint8Array(totalSize);
  fileBytes.set(headerBytes, 0);
  fileBytes.set(recordBytes, HEADER_SIZE);
  fileBytes[totalSize - 1] = EOF_BYTE;

  // Logs
  console.log('[ce01-format-test] generating:', label);
  console.log('[ce01-format-test] format:', format);
  console.log('[ce01-format-test] header:', `${HEADER_SIZE} bytes, ST=${stitchCount}, CO=${colorCount}`);
  console.log('[ce01-format-test] records:', records.length, '(stitches + END)');
  console.log('[ce01-format-test] end command:', `0x${records[records.length-1][0].toString(16).padStart(2,'0')} 0x${records[records.length-1][1].toString(16).padStart(2,'0')} 0x${records[records.length-1][2].toString(16).padStart(2,'0')}`);
  console.log('[ce01-format-test] eof byte:', `0x${EOF_BYTE.toString(16).toUpperCase()}`);
  console.log('[ce01-format-test] bounds:', bounds);
  console.log('[ce01-format-test] ready:', true);

  return {
    blob: new Blob([fileBytes], { type: 'application/octet-stream' }),
    bytes: fileBytes,
    meta: {
      format,
      label,
      stitchCount,
      recordCount: records.length,
      bounds,
      fileSize: totalSize,
      colorCount,
    },
  };
}

// ─── Test definitions ────────────────────────────────────────────────────

const TESTS = {
  TEST_01_DST_LINE: {
    format: 'DST',
    label: 'TEST01_LINE',
    generate: () => {
      // 10mm line = 100 units, 25 stitches of 4 units each
      const points = generateLinePoints(100, 25);
      return buildFile('DST', 'TEST01_LINE', points, 1);
    },
  },
  TEST_02_DST_SQUARE: {
    format: 'DST',
    label: 'TEST02_SQUARE',
    generate: () => {
      // 30×30mm = 300×300 units, stitch len 5 units (0.5mm)
      // Perimeter 1200 units / 5 = 240 stitches
      const points = generateSquarePoints(300, 5);
      return buildFile('DST', 'TEST02_SQUARE', points, 1);
    },
  },
  TEST_03_DST_SIMPLE_FILL: {
    format: 'DST',
    label: 'TEST03_FILL',
    generate: () => {
      // 50×50mm = 500×500 units, row spacing 30 units (3mm), stitch 10 units (1mm)
      // ~17 rows × 50 stitches + transitions ≈ 866 stitches
      const points = generateFillPoints(500, 30, 10);
      return buildFile('DST', 'TEST03_FILL', points, 1);
    },
  },
  TEST_04_DSB_LINE: {
    format: 'DSB',
    label: 'TEST04_LINE',
    generate: () => {
      const points = generateLinePoints(100, 25);
      return buildFile('DSB', 'TEST04_LINE', points, 1);
    },
  },
  TEST_05_DSB_SQUARE: {
    format: 'DSB',
    label: 'TEST05_SQUARE',
    generate: () => {
      const points = generateSquarePoints(300, 5);
      return buildFile('DSB', 'TEST05_SQUARE', points, 1);
    },
  },
};

/**
 * Generates a test file by ID.
 * @param {string} testId — one of TEST_01_DST_LINE, TEST_02_DST_SQUARE, etc.
 * @returns {{ blob, bytes, meta }}
 */
export function generateTestFile(testId) {
  const test = TESTS[testId];
  if (!test) throw new Error(`Unknown test: ${testId}`);
  return test.generate();
}

/**
 * Returns metadata for all available tests (without generating files).
 */
export function listTests() {
  return Object.entries(TESTS).map(([id, t]) => ({
    id,
    format: t.format,
    label: t.label,
  }));
}

/**
 * Triggers a browser download for a generated test file.
 */
export function downloadTestFile(testId) {
  const { blob, meta } = generateTestFile(testId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = meta.format.toLowerCase();
  a.download = `${meta.label}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  return meta;
}

// ─── compareToWilcomDSB ──────────────────────────────────────────────────

function parseHeaderFields(bytes) {
  if (bytes.length < HEADER_SIZE) return null;
  let headerStr = '';
  for (let i = 0; i < HEADER_SIZE; i++) {
    const b = bytes[i];
    if (b === 13) headerStr += '\r';
    else if (b === 10) headerStr += '\n';
    else if (b >= 32 && b <= 126) headerStr += String.fromCharCode(b);
    else headerStr += '.';
  }

  const getField = (name) => {
    const tag = name + ':';
    const idx = headerStr.indexOf(tag);
    if (idx === -1) return null;
    const rest = headerStr.substring(idx + tag.length);
    const match = rest.match(/^\s*(-?\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const getLabel = () => {
    const idx = headerStr.indexOf('LA:');
    if (idx === -1) return null;
    const rest = headerStr.substring(idx + 3);
    const end = rest.indexOf('\r');
    return (end !== -1 ? rest.substring(0, end) : rest.substring(0, 16)).replace(/\s+$/, '');
  };

  return {
    label: getLabel(),
    ST: getField('ST'),
    CO: getField('CO'),
    plusX: getField('+X'),
    minusX: getField('-X'),
    plusY: getField('+Y'),
    minusY: getField('-Y'),
  };
}

function decodeDSTStyle(b0, b1, b2) {
  let x = 0, y = 0;
  if (b0 & 0x01) x += 1;
  if (b0 & 0x02) x += 2;
  if (b0 & 0x04) x += 4;
  if (b0 & 0x08) x += 8;
  if (b0 & 0x10) y += 1;
  if (b0 & 0x20) y += 2;
  if (b0 & 0x40) y += 4;
  if (b0 & 0x80) y += 8;
  if (b1 & 0x01) x += 16;
  if (b1 & 0x02) x += 32;
  if (b1 & 0x08) y += 16;
  if (b1 & 0x10) y += 32;
  if (b1 & 0x04) x = -x;
  if (b1 & 0x20) y = -y;

  let type = 'stitch';
  if (b2 === 0xF3) type = 'end';
  else if (b2 & 0x80) type = 'jump';
  else if (b2 & 0x40) type = 'colorChange';
  return { x, y, type };
}

function decodeDSBStyle(b0, b1, b2) {
  let x = b0 > 127 ? b0 - 256 : b0;
  let y = b1 > 127 ? b1 - 256 : b1;
  let type = 'stitch';
  if (b2 === 0xF3) type = 'end';
  else if (b2 & 0x80) type = 'jump';
  else if (b2 & 0x40) type = 'colorChange';
  return { x, y, type };
}

function analyzeRecords(bytes, decoder) {
  let stitches = 0, jumps = 0, colorChanges = 0, hasEnd = false;
  let cumX = 0, cumY = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let maxDisp = 0;
  let overLimit = 0;

  const dataEnd = bytes[bytes.length - 1] === EOF_BYTE ? bytes.length - 1 : bytes.length;

  for (let i = HEADER_SIZE; i + 2 < dataEnd; i += 3) {
    const rec = decoder(bytes[i], bytes[i + 1], bytes[i + 2]);
    if (rec.type === 'end') { hasEnd = true; break; }

    const disp = Math.hypot(rec.x, rec.y);
    if (disp > maxDisp) maxDisp = disp;
    if (disp > 121) overLimit++;

    cumX += rec.x;
    cumY += rec.y;
    if (cumX < minX) minX = cumX;
    if (cumX > maxX) maxX = cumX;
    if (cumY < minY) minY = cumY;
    if (cumY > maxY) maxY = cumY;

    if (rec.type === 'stitch') stitches++;
    else if (rec.type === 'jump') jumps++;
    else if (rec.type === 'colorChange') colorChanges++;
  }

  return {
    stitches, jumps, colorChanges, hasEnd,
    maxDisp, overLimit,
    bounds: { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY },
  };
}

/**
 * Compares a functional Wilcom DSB reference with a generated file.
 * Reports structural, header, record, bounds, and encoding-style differences.
 */
export function compareToWilcomDSB(referenceBuffer, generatedBuffer) {
  const refBytes = new Uint8Array(referenceBuffer);
  const genBytes = new Uint8Array(generatedBuffer);

  const refHeader = parseHeaderFields(refBytes);
  const genHeader = parseHeaderFields(genBytes);

  // Structure
  const refHasEof = refBytes[refBytes.length - 1] === EOF_BYTE;
  const genHasEof = genBytes[genBytes.length - 1] === EOF_BYTE;
  const refDataEnd = refHasEof ? refBytes.length - 1 : refBytes.length;
  const genDataEnd = genHasEof ? genBytes.length - 1 : genBytes.length;
  const refRecordCount = Math.floor((refDataEnd - HEADER_SIZE) / RECORD_SIZE);
  const genRecordCount = Math.floor((genDataEnd - HEADER_SIZE) / RECORD_SIZE);
  const refTrailing = (refDataEnd - HEADER_SIZE) % RECORD_SIZE;
  const genTrailing = (genDataEnd - HEADER_SIZE) % RECORD_SIZE;

  // Decode both files with both encodings to detect style
  const refDST = analyzeRecords(refBytes, decodeDSTStyle);
  const refDSB = analyzeRecords(refBytes, decodeDSBStyle);
  const genDST = analyzeRecords(genBytes, decodeDSTStyle);
  const genDSB = analyzeRecords(genBytes, decodeDSBStyle);

  // Detect reference encoding style: whichever produces fewer over-limit moves
  const refIsDSTStyle = refDST.overLimit <= refDSB.overLimit;
  const refEncoding = refIsDSTStyle ? 'DST-bit-packed' : 'DSB-signed-byte';

  const differences = [];
  const rejectReasons = [];

  // Header size
  if (refBytes.length >= HEADER_SIZE && genBytes.length < HEADER_SIZE) {
    differences.push({ field: 'headerSize', message: 'Generado no tiene cabecera de 512 bytes' });
    rejectReasons.push('Cabecera incompleta');
  }

  // ST match
  if (refHeader && genHeader) {
    if (refHeader.ST === refRecordCount && genHeader.ST !== genRecordCount) {
      differences.push({ field: 'stMatch', message: `Referencia ST=${refHeader.ST} coincide; generado ST=${genHeader.ST} ≠ records=${genRecordCount}` });
      rejectReasons.push('ST del header no coincide con records reales');
    }
  }

  // EOF byte
  if (refHasEof && !genHasEof) {
    differences.push({ field: 'eofByte', message: 'Referencia tiene 0x1A, generado no' });
    rejectReasons.push('Falta byte final 0x1A');
  }

  // Trailing bytes
  if (refTrailing === 0 && genTrailing > 0) {
    differences.push({ field: 'trailing', message: `Generado tiene ${genTrailing} bytes sobrantes` });
    rejectReasons.push('Bytes sobrantes después del último record');
  }

  // END command
  if (refDST.hasEnd && !genDST.hasEnd) {
    differences.push({ field: 'endCommand', message: 'Referencia tiene END, generado no' });
    rejectReasons.push('Falta comando END');
  }

  // Encoding style
  differences.push({ field: 'encodingStyle', message: `Referencia usa: ${refEncoding}` });

  // Bounds comparison
  if (refHeader && genHeader) {
    if (refHeader.plusX !== null && genHeader.plusX !== null) {
      if (Math.abs(refHeader.plusX - genHeader.plusX) > 500) {
        differences.push({ field: 'bounds', message: `Bounds difieren: ref +X=${refHeader.plusX} vs gen +X=${genHeader.plusX}` });
      }
    }
  }

  // Special commands comparison
  if (refDST.jumps === 0 && genDST.jumps > 0) {
    differences.push({ field: 'jumps', message: `Referencia sin jumps; generado tiene ${genDST.jumps} jumps` });
    rejectReasons.push('Generado tiene jumps que la referencia no tiene');
  }
  if (refDST.colorChanges === 0 && genDST.colorChanges > 0) {
    differences.push({ field: 'colorChanges', message: `Referencia sin color changes; generado tiene ${genDST.colorChanges}` });
  }

  // Over-limit moves
  if (genDST.overLimit > 0) {
    differences.push({ field: 'overLimit', message: `${genDST.overLimit} movimientos >12.1mm en generado` });
    rejectReasons.push('Movimientos excesivos sin dividir');
  }

  console.log('[ce01-format-test] compareToWilcomDSB:');
  console.log('[ce01-format-test]   reference encoding:', refEncoding);
  console.log('[ce01-format-test]   reference records:', refRecordCount, 'ST:', refHeader?.ST);
  console.log('[ce01-format-test]   generated records:', genRecordCount, 'ST:', genHeader?.ST);
  console.log('[ce01-format-test]   differences:', differences.length);
  console.log('[ce01-format-test]   reject reasons:', rejectReasons.length);

  return {
    reference: {
      fileSize: refBytes.length,
      header: refHeader,
      recordCount: refRecordCount,
      hasEof: refHasEof,
      trailingBytes: refTrailing,
      encoding: refEncoding,
      analysis: refIsDSTStyle ? refDST : refDSB,
    },
    generated: {
      fileSize: genBytes.length,
      header: genHeader,
      recordCount: genRecordCount,
      hasEof: genHasEof,
      trailingBytes: genTrailing,
      analysis: genDST,
    },
    differences,
    rejectReasons,
    encodingMatch: refEncoding === 'DST-bit-packed', // generated files use bit-packed for DST, signed for DSB
  };
}