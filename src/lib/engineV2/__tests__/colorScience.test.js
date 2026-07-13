import { describe, expect, it } from 'vitest';
import { deltaE76, deltaE2000, determineColorFamily, hexToLab, linearRgbToXyz, parseHexColor, rgbToLab, rgbToLinearRgb, xyzToLab } from '../index.js';

describe('Phase 6 color science', () => {
  it.each([['#abc', '#AABBCC'], ['abc', '#AABBCC'], ['#12ab34', '#12AB34'], ['FFFFFF', '#FFFFFF']])('normalizes %s', (value, expected) => expect(parseHexColor(value).normalizedHex).toBe(expected));
  it.each([null, '', '#12', '#12345G', 'red', {}, 123])('rejects invalid color %j explicitly', value => { const parsed = parseHexColor(value); expect(parsed.valid).toBe(false); expect(parsed.rgb).toBeNull(); });
  it('parses RGB channels', () => expect(parseHexColor('#12AB34').rgb).toEqual({ r: 18, g: 171, b: 52 }));
  it('converts black to zero linear RGB', () => expect(rgbToLinearRgb({ r: 0, g: 0, b: 0 })).toEqual({ r: 0, g: 0, b: 0 }));
  it('converts white near the D65 reference', () => { const xyz = linearRgbToXyz(rgbToLinearRgb({ r: 255, g: 255, b: 255 })); expect(xyz.x).toBeCloseTo(95.047, 2); expect(xyz.y).toBeCloseTo(100, 2); });
  it('converts D65 white to Lab', () => expect(xyzToLab({ x: 95.047, y: 100, z: 108.883 }).l).toBeCloseTo(100, 6));
  it('is deterministic for RGB to Lab', () => expect(rgbToLab({ r: 12, g: 34, b: 56 })).toEqual(rgbToLab({ r: 12, g: 34, b: 56 })));
  it('returns an explicit invalid hex-to-Lab result', () => expect(hexToLab('nope').valid).toBe(false));
  it('returns zero Delta E for identical colors', () => { const lab = hexToLab('#123456').lab; expect(deltaE76(lab, lab)).toBe(0); expect(deltaE2000(lab, lab)).toBe(0); });
  it('keeps both Delta E formulas symmetric', () => { const a = hexToLab('#123456').lab; const b = hexToLab('#ABCDEF').lab; expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 10); expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10); });
  it('matches a published CIEDE2000 reference pair', () => expect(deltaE2000({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 4));
  it.each([['#000000', 'black'], ['#FFFFFF', 'white'], ['#808080', 'gray'], ['#8B4513', 'brown'], ['#FF0000', 'red'], ['#FF8800', 'orange'], ['#FFFF00', 'yellow'], ['#00AA22', 'green'], ['#00FFFF', 'cyan'], ['#0055FF', 'blue'], ['#8000CC', 'purple'], ['#FF00AA', 'magenta'], ['invalid', 'unknown']])('classifies %s as %s', (color, family) => expect(determineColorFamily(color)).toBe(family));
});
