export function createThreadCatalogFixture() {
  return [
    { id: 'catalog-green', name: 'Leaf Green', hex: '#12AB34', manufacturer: 'Synthetic Threads', code: 'ST-101', source: { fixture: 'synthetic_phase_6' }, metadata: { family: 'green' } },
    { id: 'catalog-red', name: 'Signal Red', hex: '#D12A32', manufacturer: 'Synthetic Threads', code: 'ST-202', source: { fixture: 'synthetic_phase_6' }, metadata: { family: 'red' } },
    { id: 'catalog-white', name: 'Clean White', hex: '#F9F9F9', manufacturer: 'Synthetic Threads', code: 'ST-303', source: { fixture: 'synthetic_phase_6' }, metadata: { family: 'white' } },
  ];
}
