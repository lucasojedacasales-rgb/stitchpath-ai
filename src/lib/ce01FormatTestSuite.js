/**
 * CE01 Format Test Suite — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal DST test files for Caydo CE01 compatibility verification.
 * Uses the corrected dstEncoder with mandatory roundtrip validation.
 */

import { encodeDSTDelta, decodeDSTRecord, encodeDSTFile, validateDSTFile } from './dstEncoder';

// ─── 5. Encode/decode unit tests ────────────────────────────────────────

export function runEncodeDecodeTests() {
  const tests = [
    { dx: 4,   dy: 0,  expectedBytes: [0x80, 0x80, 0x03] },
    { dx: -4,  dy: 0 },
    { dx: 0,   dy: 9 },
    { dx: 0,   dy: -9 },
    { dx: 12,  dy: 0 },
    { dx: 0,   dy: 12 },
    { dx: 100, dy: 0 },
    { dx: 0,   dy: 100 },
    { dx: -121,dy: 0 },
    { dx: 0,   dy: 121 },
    { dx: 121, dy: 121 },
    { dx: -121,dy: -121 },
    { dx: 50,  dy: 50 },
    { dx: -50, dy: -50 },
  ];

  const results = [];
  for (const t of tests) {
    try {
      const record = encodeDSTDelta(t.dx, t.dy, 'stitch');
      const decoded = decodeDSTRecord(record);
      const ok = decoded.dx === t.dx && decoded.dy === t.dy;
      const expectedMatch = t.expectedBytes
        ? (record[0] === t.expectedBytes[0] && record[1] === t.expectedBytes[1] && record[2] === t.expectedBytes[2])
        : null;
      results.push({
        name: `dx=${t.dx} dy=${t.dy}`,
        passed: ok && (expectedMatch === null || expectedMatch),
        record: record.map(b => b.toString(16).padStart(2, '0')).join(' '),
        decoded: `dx=${decoded.dx} dy=${decoded.dy}`,
        expected: t.expectedBytes ? t.expectedBytes.map(b => b.toString(16).padStart(2, '0')).join(' ') : null,
        expectedMatch,
      });
    } catch (e) {
      results.push({ name: `dx=${t.dx} dy=${t.dy}`, passed: false, error: e.message });
    }
  }
  return results;
}

// ─── 10. TEST01_LINE.dst — 10mm horizontal line ─────────────────────────
// Header +X=100, +Y=0. Decoded path X=100, Y=0. 1 color, no jumps, no trims.

export function generateTEST01_LINE() {
  // 10mm = 100 DST units (0.1mm each)
  const stitches = [
    { x: 0,  y: 0, type: 'stitch', color: '#000000' },
    { x: 10, y: 0, type: 'stitch', color: '#000000' },
    { x: 10, y: 0, type: 'end',    color: null },
  ];

  const buffer = encodeDSTFile(stitches, { ce01Strict: true, label: 'TEST01_LINE' });
  const validation = validateDSTFile(buffer);

  return { name: 'TEST01_LINE.dst', buffer, validation };
}

// ─── TEST02_SQUARE.dst — 30x30mm square ─────────────────────────────────
// Header 30x30mm. Decoded path 30x30mm. 1 color, no jumps, no trims.

export function generateTEST02_SQUARE() {
  // 30mm = 300 DST units
  const stitches = [
    { x: 0,  y: 0,  type: 'stitch', color: '#000000' },
    { x: 30, y: 0,  type: 'stitch', color: '#000000' },
    { x: 30, y: 30, type: 'stitch', color: '#000000' },
    { x: 0,  y: 30, type: 'stitch', color: '#000000' },
    { x: 0,  y: 0,  type: 'stitch', color: '#000000' },
    { x: 0,  y: 0,  type: 'end',    color: null },
  ];

  const buffer = encodeDSTFile(stitches, { ce01Strict: true, label: 'TEST02_SQUARE' });
  const validation = validateDSTFile(buffer);

  return { name: 'TEST02_SQUARE.dst', buffer, validation };
}

// ─── Run all tests ──────────────────────────────────────────────────────

export function runAllTests() {
  console.log('[ce01-test-suite] Running encode/decode unit tests...');
  const encodeTests = runEncodeDecodeTests();
  const encodePassed = encodeTests.every(t => t.passed);
  console.log(`[ce01-test-suite] Encode tests: ${encodeTests.filter(t => t.passed).length}/${encodeTests.length} passed`);

  console.log('[ce01-test-suite] Generating TEST01_LINE.dst...');
  const test01 = generateTEST01_LINE();
  console.log(`[ce01-test-suite] TEST01_LINE: valid=${test01.validation.valid}, ST match=${test01.validation.stMatch}, bounds match=${test01.validation.boundsMatch}`);

  console.log('[ce01-test-suite] Generating TEST02_SQUARE.dst...');
  const test02 = generateTEST02_SQUARE();
  console.log(`[ce01-test-suite] TEST02_SQUARE: valid=${test02.validation.valid}, ST match=${test02.validation.stMatch}, bounds match=${test02.validation.boundsMatch}`);

  const allPassed = encodePassed && test01.validation.valid && test02.validation.valid;

  return {
    allPassed,
    encodeTests,
    encodePassed,
    testFiles: [
      { name: test01.name, valid: test01.validation.valid, validation: test01.validation, buffer: test01.buffer },
      { name: test02.name, valid: test02.validation.valid, validation: test02.validation, buffer: test02.buffer },
    ],
  };
}