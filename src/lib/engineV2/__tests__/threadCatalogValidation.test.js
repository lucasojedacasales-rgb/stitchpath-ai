import { describe, expect, it } from 'vitest';
import { validateThreadCatalog } from '../index.js';
import { createThreadCatalogFixture } from '../fixtures/threadCatalogFixture.js';

describe('Phase 6 thread catalog validation', () => {
  it('validates a synthetic catalog', () => expect(validateThreadCatalog(createThreadCatalogFixture()).valid).toBe(true));
  it('rejects non-arrays', () => expect(validateThreadCatalog({}).errors[0].code).toBe('INVALID_THREAD_CATALOG'));
  it('rejects malformed entries', () => expect(validateThreadCatalog([null]).errors.some(item => item.code === 'INVALID_CATALOG_ENTRY')).toBe(true));
  it('rejects missing IDs', () => expect(validateThreadCatalog([{ hex: '#fff' }]).errors.some(item => item.code === 'MISSING_CATALOG_ENTRY_ID')).toBe(true));
  it('rejects duplicate IDs', () => expect(validateThreadCatalog([{ id: 'x', hex: '#000' }, { id: 'x', hex: '#fff' }]).errors.some(item => item.code === 'DUPLICATE_CATALOG_ENTRY_ID')).toBe(true));
  it('rejects invalid colors', () => expect(validateThreadCatalog([{ id: 'x', hex: 'black' }]).valid).toBe(false));
  it('rejects malformed metadata', () => expect(validateThreadCatalog([{ id: 'x', hex: '#000', metadata: [] }]).errors.some(item => item.code === 'INVALID_CATALOG_METADATA')).toBe(true));
  it('warns but preserves duplicate HEX entries', () => { const result = validateThreadCatalog([{ id: 'a', hex: '#000' }, { id: 'b', hex: '#000' }]); expect(result.valid).toBe(true); expect(result.entries).toHaveLength(2); expect(result.warnings[0].code).toBe('DUPLICATE_CATALOG_HEX'); });
  it('sorts entries deterministically by ID', () => expect(validateThreadCatalog([{ id: 'z', hex: '#000' }, { id: 'a', hex: '#fff' }]).entries.map(item => item.id)).toEqual(['a', 'z']));
  it('is independent of catalog input order', () => { const catalog = createThreadCatalogFixture(); expect(validateThreadCatalog(catalog).entries).toEqual(validateThreadCatalog([...catalog].reverse()).entries); });
  it('normalizes catalog HEX values', () => expect(validateThreadCatalog([{ id: 'x', hex: '#abc' }]).entries[0].hex).toBe('#AABBCC'));
  it('preserves explicit duplicate colors rather than merging them', () => expect(validateThreadCatalog([{ id: 'a', hex: '#abc' }, { id: 'b', hex: '#AABBCC' }]).entries.map(item => item.id)).toEqual(['a', 'b']));
});
