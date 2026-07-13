# Engine V2 Phase 2 Region Ingestion Report

- Branch: `engine-v2`
- Starting commit: `cdf868c9bdc9cbb9ff9ef7917a71e64dab40b4fc`
- Ending commit: commit containing this report; exact immutable hash is reported after commit creation
- Repository: `C:\Users\lucas\Documents\Codex\stitchpath-engine-v2-clean`
- Total existing tests before Phase 2: 30
- New tests: 51
- Total tests after Phase 2: 81
- Engine V2 test result: passed, 9 files and 81 tests
- Targeted Engine V2 lint: passed
- Initial build result: passed
- Final build result: passed
- Sandbox note: one intermediate parallel run encountered the documented esbuild `spawn EPERM`; the established unrestricted verification passed without code changes

## Files Created

- `src/lib/engineV2/ingestion/geometryCanonicalization.js`
- `src/lib/engineV2/ingestion/v1RegionAdapter.js`
- `src/lib/engineV2/ingestion/regionIngestion.js`
- `src/lib/engineV2/ingestion/ingestionDiagnostics.js`
- `src/lib/engineV2/topology/regionGraph.js`
- `src/lib/engineV2/topology/regionGraphValidation.js`
- `src/lib/engineV2/topology/regionRelations.js`
- `src/lib/engineV2/fixtures/simpleRegionsFixture.js`
- `src/lib/engineV2/fixtures/nestedRegionsFixture.js`
- `src/lib/engineV2/fixtures/overlappingRegionsFixture.js`
- `src/lib/engineV2/fixtures/disconnectedSameColorFixture.js`
- `src/lib/engineV2/fixtures/explicitHoleFixture.js`
- `src/lib/engineV2/fixtures/invalidRegionsFixture.js`
- `src/lib/engineV2/fixtures/mascotStructureFixture.js`
- `src/lib/engineV2/__tests__/geometryCanonicalization.test.js`
- `src/lib/engineV2/__tests__/v1RegionAdapter.test.js`
- `src/lib/engineV2/__tests__/regionIngestion.test.js`
- `src/lib/engineV2/__tests__/regionGraph.test.js`
- `src/lib/engineV2/__tests__/regionGraphValidation.test.js`
- `src/lib/engineV2/__tests__/ingestionDiagnostics.test.js`
- `ENGINE_V2_PHASE_2_REGION_INGESTION_REPORT.md`

## Files Modified

- `src/lib/engineV2/index.js`: stable Phase 2 public exports only.
- `src/lib/engineV2/README.md`: Phase 2 contracts and isolation guarantees.

## Fixture Ingestion and Graph Summary

All entries use synthetic data. No fixture is represented as extracted from Yoshi, Wilcom, or another real design.

| Fixture | Source | Accepted | Rejected | Roots | Components | Contains | Overlaps | Touches | Explicit holes | Equal candidates | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| simple | 2 | 2 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | true |
| touching | 2 | 2 | 0 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | true |
| nested | 2 | 2 | 0 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | true |
| threeLevel | 3 | 3 | 0 | 1 | 1 | 3 | 0 | 0 | 0 | 0 | true |
| overlapping | 2 | 2 | 0 | 2 | 1 | 0 | 1 | 0 | 0 | 0 | true |
| equalGeometry | 2 | 2 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 1 | true |
| disconnectedSameColor | 2 | 2 | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | true |
| explicitHole | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | true |
| genericMascot | 11 | 11 | 0 | 5 | 1 | 8 | 9 | 0 | 0 | 0 | true |

The invalid fixture catalog verifies duplicate IDs, missing IDs, NaN, Infinity, out-of-range coordinates, self-intersection, duplicate closing points, consecutive duplicates, pixel conversion, millimeter conversion, contour fallback, and hidden-region handling. Invalid inputs are rejected individually while valid inputs remain available.

## Required Verification

- Deterministic graph verification: passed with reversed input order.
- Input mutation verification: passed for geometry, adapter, ingestion, graph fixtures, and mascot fixture.
- `realReferenceFixtureAvailable=false`
- `inferredHoleCount=0`
- `defaultBehaviorChanged=false`
- `applicationImportsEngineV2=false`
- `v2InvokedByApplication=false`
- `stitchGenerationAdded=false`
- `contourGenerationAdded=false`
- `machineAdaptationAdded=false`
- `encodingAdded=false`
- V1 files touched: none.
- Protected files touched: `[]`

## Known Limitations

- Relation analysis targets deterministic simple polygons and does not support curved segments or multipolygons.
- Obvious segment intersections are detected, but this is not a full computational-geometry kernel.
- Explicit holes are preserved but are not subtracted during outer-polygon containment or overlap analysis in Phase 2.
- Equal-geometry detection requires equivalent vertex sets within the normalized point tolerance.
- Hidden regions skipped by policy are reported as warnings and remain absent from the graph.
- No real saved region snapshot suitable for an isolated V2 fixture was found; existing regression fixtures explicitly identify themselves as synthetic.

## Recommended Phase 3

Add isolated semantic region-role analysis over `RegionV2` and `RegionGraphV2`, with fixture-driven confidence reporting. Keep role analysis separate from stitch type, thread assignment, object planning, sequencing, and machine adaptation.

## Exact Git Diff Summary

- Exact git diff summary: 23 files changed, 1499 insertions(+), 0 deletions(-).
