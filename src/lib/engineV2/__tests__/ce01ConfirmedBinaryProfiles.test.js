import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildDSTFile,
  decodeDSTRecord,
} from '../../dstEncoder.js';
import {
  buildDSBFile,
  decodeDSBRecord,
  encodeCE01DSBRecord,
  encodeDSBRecord,
} from '../../dsbEncoder.js';

const ORACLE_ROOT = 'C:/Users/lucas/Documents/StitchPath-References/yoshi-real-01/ce01-format-gate-forensics-r1';
const EXPECTED_DST_SHA256 = 'e6eed8ba205738c00e3bd1ce95a5b0940598f4b08ba7651921f6f8f70677917b';
const EXPECTED_DSB_SHA256 = '8c150261ebcd814f1dff06fb76432f86c169616a18c8da07d5dcc039932b1014';

const vertices = [
  [-220, -220], [220, -220], [220, 220], [-220, 220], [-220, -180],
  [180, -180], [180, 180], [-180, 180], [-180, -140], [140, -140],
  [140, 140], [-140, 140], [-140, -100], [100, -100], [100, 100],
  [-100, 100], [-100, -60], [60, -60], [60, 60], [-60, 60],
  [-60, -20], [20, -20], [20, 20], [-20, 20],
];

function subdivide(a, b, maximumLengthUnits) {
  const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maximumLengthUnits);
  return Array.from({ length: count }, (_, index) => [
    Math.round(a[0] + (b[0] - a[0]) * (index + 1) / count),
    Math.round(a[1] + (b[1] - a[1]) * (index + 1) / count),
  ]);
}

function canonicalSpiral() {
  const points = [[...vertices[0]]];
  for (let index = 1; index < vertices.length; index += 1) {
    points.push(...subdivide(vertices[index - 1], vertices[index], 21));
  }
  return points;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function headerLines(bytes) {
  return Buffer.from(bytes.slice(0, 124)).toString('ascii').split('\r').filter(Boolean);
}

function fieldWidth(lines, name) {
  return lines.find((line) => line.startsWith(`${name}:`)).slice(name.length + 1).length;
}

function records(bytes) {
  const result = [];
  for (let offset = 512; offset < bytes.length - 1; offset += 3) {
    result.push(Array.from(bytes.slice(offset, offset + 3)));
  }
  return result;
}

describe('CE01-confirmed DST binary profile', () => {
  const generated = buildDSTFile({ label: 'CE01F0', stitchPoints: canonicalSpiral() });
  const bytes = Buffer.from(generated.bytes);
  const payloadRecords = records(bytes);

  it('uses the canonical 124-byte header prefix and field widths', () => {
    const lines = headerLines(bytes);
    expect(bytes[124]).toBe(0x1A);
    expect(bytes.slice(125, 512).every((byte) => byte === 0x20)).toBe(true);
    expect(fieldWidth(lines, 'ST')).toBe(7);
    expect(fieldWidth(lines, 'CO')).toBe(3);
    for (const field of ['+X', '-X', '+Y', '-Y']) expect(fieldWidth(lines, field)).toBe(5);
    expect(bytes.slice(512, 515).length).toBe(3);
  });

  it('emits two initial zero jumps, returns to origin, and has one terminal END', () => {
    expect(payloadRecords.slice(0, 2)).toEqual([[0x00, 0x00, 0x83], [0x00, 0x00, 0x83]]);
    const decoded = payloadRecords.map(decodeDSTRecord);
    expect(decoded.filter((record) => record.flag === 'end')).toHaveLength(1);
    expect(payloadRecords.at(-1)).toEqual([0x00, 0x00, 0xF3]);
    const final = decoded.filter((record) => record.flag !== 'end')
      .reduce((point, record) => ({ x: point.x + record.dx, y: point.y + record.dy }), { x: 0, y: 0 });
    expect(final).toEqual({ x: 0, y: 0 });
    expect(generated.meta.bounds).toEqual({ plusX: 220, minusX: 220, plusY: 220, minusY: 220 });
    expect(bytes.at(-1)).toBe(0x1A);
  });

  it('regenerates the exact immutable CE01F0 oracle deterministically', () => {
    expect(sha256(bytes)).toBe(EXPECTED_DST_SHA256);
    expect(Buffer.from(buildDSTFile({ label: 'CE01F0', stitchPoints: canonicalSpiral() }).bytes)).toEqual(bytes);
    if (fs.existsSync(`${ORACLE_ROOT}/CE01F0.DST`)) {
      expect(bytes).toEqual(fs.readFileSync(`${ORACLE_ROOT}/CE01F0.DST`));
    }
  });
});

describe('CE01-confirmed DSB binary profile', () => {
  const generated = buildDSBFile({ label: 'CE01F1', stitchPoints: canonicalSpiral() });
  const bytes = Buffer.from(generated.bytes);
  const payloadRecords = records(bytes);

  it('uses the canonical 124-byte header prefix and field widths', () => {
    const lines = headerLines(bytes);
    expect(bytes[124]).toBe(0x1A);
    expect(bytes.slice(125, 512).every((byte) => byte === 0x20)).toBe(true);
    expect(fieldWidth(lines, 'ST')).toBe(7);
    expect(fieldWidth(lines, 'CO')).toBe(3);
    for (const field of ['+X', '-X', '+Y', '-Y']) expect(fieldWidth(lines, field)).toBe(5);
    expect(bytes.slice(512, 515).length).toBe(3);
  });

  it('encodes every sign family with magnitude payloads', () => {
    expect(encodeCE01DSBRecord(7, 5, 'stitch')).toEqual([0x80, 0x05, 0x07]);
    expect(encodeCE01DSBRecord(-7, 5, 'stitch')).toEqual([0xA0, 0x05, 0x07]);
    expect(encodeCE01DSBRecord(7, -5, 'stitch')).toEqual([0xC0, 0x05, 0x07]);
    expect(encodeCE01DSBRecord(-7, -5, 'stitch')).toEqual([0xE0, 0x05, 0x07]);
    expect(encodeCE01DSBRecord(-7, -5, 'jump')).toEqual([0xE1, 0x05, 0x07]);
    expect(encodeDSBRecord(-7, -5, 'stitch')).toEqual([0xE0, 0x05, 0x07]);
    expect(generated.meta.legacyMovementCount).toBe(0);
  });

  it('returns to origin and has one terminal END without unsupported controls', () => {
    const decoded = payloadRecords.map(decodeDSBRecord);
    expect(decoded.filter((record) => record.type === 'end')).toHaveLength(1);
    expect(payloadRecords.at(-1)).toEqual([0xF8, 0x00, 0x00]);
    expect(payloadRecords.some(([command]) => command === 0x88 || command === 0xE7 || (command >= 0xE8 && command <= 0xEF))).toBe(false);
    const final = decoded.filter((record) => record.type !== 'end')
      .reduce((point, record) => ({ x: point.x + record.dx, y: point.y + record.dy }), { x: 0, y: 0 });
    expect(final).toEqual({ x: 0, y: 0 });
    expect(generated.meta.bounds).toEqual({ plusX: 220, minusX: 220, plusY: 220, minusY: 220 });
    expect(bytes.at(-1)).toBe(0x1A);
  });

  it('regenerates the exact immutable CE01F1 oracle deterministically', () => {
    expect(sha256(bytes)).toBe(EXPECTED_DSB_SHA256);
    expect(Buffer.from(buildDSBFile({ label: 'CE01F1', stitchPoints: canonicalSpiral() }).bytes)).toEqual(bytes);
    if (fs.existsSync(`${ORACLE_ROOT}/CE01F1.DSB`)) {
      expect(bytes).toEqual(fs.readFileSync(`${ORACLE_ROOT}/CE01F1.DSB`));
    }
  });
});
