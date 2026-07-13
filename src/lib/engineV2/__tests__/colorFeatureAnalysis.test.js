import { describe, expect, it } from 'vitest';
import { analyzeArtworkColor } from '../index.js';

describe('Phase 3 artwork color feature analysis', () => {
  it('analyzes valid six-digit HEX deterministically', () => {
    const first = analyzeArtworkColor('#33aa66');
    const second = analyzeArtworkColor('#33aa66');
    expect(first).toEqual(second);
    expect(first).toMatchObject({ valid: true, normalizedHex: '#33aa66', red: 51, green: 170, blue: 102, isChromatic: true });
  });

  it('expands shorthand HEX', () => {
    expect(analyzeArtworkColor('#abc').normalizedHex).toBe('#aabbcc');
  });

  it.each([null, '', 'black', '#12', '#gggggg'])('rejects invalid artwork color %s explicitly', color => {
    const result = analyzeArtworkColor(color);
    expect(result.valid).toBe(false);
    expect(result.normalizedHex).toBeNull();
    expect(result.errors[0].code).toBe('INVALID_ARTWORK_COLOR');
  });

  it('detects dark and very dark colors', () => {
    expect(analyzeArtworkColor('#050505')).toMatchObject({ isDark: true, isVeryDark: true, isNeutral: true });
  });

  it('detects light and very light colors', () => {
    expect(analyzeArtworkColor('#ffffff')).toMatchObject({ isLight: true, isVeryLight: true, isNeutral: true });
  });

  it('distinguishes neutral and chromatic colors', () => {
    expect(analyzeArtworkColor('#888888').isNeutral).toBe(true);
    expect(analyzeArtworkColor('#ff0000').isChromatic).toBe(true);
  });

  it('supports configurable dark thresholds without changing source color', () => {
    const color = '#555555';
    expect(analyzeArtworkColor(color, { darkLuminance: 0.5 }).isDark).toBe(true);
    expect(color).toBe('#555555');
  });
});
