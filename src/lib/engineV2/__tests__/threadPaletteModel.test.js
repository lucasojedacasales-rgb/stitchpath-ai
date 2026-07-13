import { describe, expect, it } from 'vitest';
import { createExactArtworkPaletteEntry, createThreadPaletteEntryV2 } from '../index.js';

describe('Phase 6 thread palette model', () => {
  const input = () => ({ id: 'green-1', name: 'Green', hex: '#0f0', manufacturer: 'Synthetic', code: 'G1', source: { fixture: true }, metadata: { family: 'green' } });
  it('creates a normalized palette entry', () => expect(createThreadPaletteEntryV2(input()).hex).toBe('#00FF00'));
  it('preserves manufacturer and code', () => expect(createThreadPaletteEntryV2(input())).toMatchObject({ manufacturer: 'Synthetic', code: 'G1' }));
  it('defaults the name to the ID', () => expect(createThreadPaletteEntryV2({ id: 'x', hex: '#123456' }).name).toBe('x'));
  it('deeply freezes the entry', () => { const entry = createThreadPaletteEntryV2(input()); expect(Object.isFrozen(entry)).toBe(true); expect(Object.isFrozen(entry.metadata)).toBe(true); });
  it('clones metadata and source', () => { const value = input(); const entry = createThreadPaletteEntryV2(value); value.metadata.family = 'changed'; value.source.fixture = false; expect(entry.metadata.family).toBe('green'); expect(entry.source.fixture).toBe(true); });
  it('rejects missing IDs', () => expect(() => createThreadPaletteEntryV2({ hex: '#fff' })).toThrow(/id/i));
  it('rejects invalid HEX', () => expect(() => createThreadPaletteEntryV2({ id: 'x', hex: 'black' })).toThrow(/hex/i));
  it('rejects malformed metadata', () => expect(() => createThreadPaletteEntryV2({ id: 'x', hex: '#000', metadata: [] })).toThrow(/metadata/i));
  it('creates deterministic exact artwork entries', () => expect(createExactArtworkPaletteEntry('#1a2b3c')).toMatchObject({ id: 'artwork:1A2B3C', name: 'Artwork #1A2B3C', hex: '#1A2B3C', manufacturer: null, code: null, source: 'artwork_exact' }));
  it('marks exact artwork spool availability unverified', () => expect(createExactArtworkPaletteEntry('#fff').metadata.physicalSpoolAvailabilityVerified).toBe(false));
});
