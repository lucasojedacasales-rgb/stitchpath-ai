import { createRegionV2 } from '../model.js';
import { fingerprintEngineV2Value } from '../orchestration/deterministicStageFingerprint.js';

export function createEndToEndRegions() {
  return [
    createRegionV2({
      id: 'phase13a-green-body',
      geometry: [{ x: 0.05, y: 0.05 }, { x: 0.45, y: 0.05 }, { x: 0.45, y: 0.45 }, { x: 0.05, y: 0.45 }],
      visualColor: '#33AA55', semanticRole: 'primary_shape', confidence: 1,
      source: { fixture: 'synthetic_phase_13a', name: 'body', regionClass: 'primary_shape' },
    }),
    createRegionV2({
      id: 'phase13a-red-feature',
      geometry: [{ x: 0.55, y: 0.55 }, { x: 0.90, y: 0.55 }, { x: 0.90, y: 0.90 }, { x: 0.55, y: 0.90 }],
      visualColor: '#D73535', semanticRole: 'secondary_shape', confidence: 1,
      source: { fixture: 'synthetic_phase_13a', name: 'face', regionClass: 'secondary_shape' },
    }),
  ];
}

export function createEndToEndSyntheticProvenance(regions = createEndToEndRegions()) {
  return {
    sourceKind: 'synthetic', sourceName: 'phase13a-end-to-end-regions', sourceFingerprint: fingerprintEngineV2Value(regions),
    evidenceType: 'synthetic_fixture', evidenceReference: 'src/lib/engineV2/fixtures/endToEndRegionFixture.js',
    verified: true, notes: 'Deterministic synthetic RegionV2 fixture; not a real artwork or machine reference.',
  };
}

export function createEndToEndRegionFixture(overrides = {}) {
  const regions = overrides.regions ?? createEndToEndRegions();
  return {
    regions,
    designSizeMm: overrides.designSizeMm ?? { width: 30, height: 35 },
    format: overrides.format ?? 'DST',
    metadata: { fixture: 'synthetic-phase13a-end-to-end', ...(overrides.metadata || {}) },
    provenance: overrides.provenance ?? createEndToEndSyntheticProvenance(regions),
    stageConfig: overrides.stageConfig ?? { binaryExport: { formatConfig: { label: 'PHASE13A' } } },
    config: overrides.config ?? {},
  };
}
