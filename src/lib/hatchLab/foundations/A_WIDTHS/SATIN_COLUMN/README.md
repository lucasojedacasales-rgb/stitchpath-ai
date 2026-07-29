# SATIN_COLUMN foundation — P1.F0.1 straight-column closure (laboratory only)

Isolated geometric prototype that decides whether a real A_WIDTHS region is a straight bar apt for a
satin column and, when the geometry allows it, builds candidate satin geometry: principal axis →
perpendicular sections → left/right rails → transversal zigzag → centerline straightness →
zigzag containment → criterion-based eligibility → technical SVG preview.

**candidateOnly: true · integrated: false.** Nothing here is imported by the productive engine, and
this foundation imports nothing from `src/lib/pipeline/**`, the productive motor modules,
`referenceLearning` or any UI component. It never runs `runPipeline` or `buildFinalCommands`, never
touches simulators, exporters or encoders, and never changes a region's `stitch_type`.

## Data source

The five real regions come exclusively from the sealed baseline `BASE-ENGINE-A-WIDTHS-V1`
(cases A1, A5, A6, A7, A8), extracted once from the verified external capture into
`fixtures/A_WIDTHS_STRAIGHT_BARS.json` with full-precision points, explicit
`coordinateSpace: normalized_0_1`, the 100 × 80 mm design size and a per-polygon FNV-1a hash. The
engine was **not** re-executed. See `sourceProvenance.json`.

Coordinates: `xMm = xNormalized × 100 ; yMm = yNormalized × 80`, from the baseline's explicit
declaration — never deduced from numeric ranges. No pixels.

## P1.F0.1 hardening

1. **Strict station pairing** (`requireAllStationsPaired: true`) — `eligible` requires
   `failedStations === 0`, `stationSuccessRatio === 1` and every station returning exactly two
   intersections. Failed stations are indexed (`failedStationIndices`), the axial holes they create
   are measured (`stationGapCount`, `maximumStationGapMm`), the rails are never joined across a gap,
   and `splitRequired` can no longer mask an earlier geometric failure. New result fields:
   `geometryComplete`, `allStationsPaired`.
2. **Robust polygon simplicity** (`geometry/polygonSimplicity.js`) — strict crossings, a non-adjacent
   vertex on an edge, contact between non-adjacent edges, collinear overlap, zero-length edges and
   repeated edges, all with the declared `geometryEpsilonMm`. Shared endpoints of genuinely adjacent
   edges are never a defect.
3. **Hole representation** (`geometry/holeDeclaration.js`) — non-empty array, finite number > 0,
   non-empty object, `true`, `holeCount`, `hole_count`, `explicitHoleCount` mean holes present;
   `0`, `false`, `[]`, `{}`, `null` mean absent. Reports `holeStatus`, `holeSourceField` and
   `declaredHoleCount` (never invented from a boolean flag).
4. **Centerline straightness** (`geometry/measureCenterlineStraightness.js`) — deviation of the
   station centerline from a total-least-squares line through its centroid, plus the angle against
   the principal axis. Configured a priori: 0.25 mm / 2 % / 5°.
5. **Zigzag containment** (`geometry/checkZigzagContainment.js` + `geometry/pointInPolygon.js`) —
   every segment sampled at 0/25/50/75/100 %; `candidate_geometry_complete` requires
   `outsideSampleCount === 0`.

### Closure finding — revised by P1.F0.2

The five real regions declare `holes: 1` / `holes: 2` **numerically**. P1.F0.1 read any count > 0 as
a hole declaration and refused the five cases. P1.F0.2 (`holeSemantics/`) traced the field to
`src/lib/regionBuilder.js::estimateHoles`: it counts **sibling regions** that are small (< 12 % of
this area) and centroid-near (< 0.15), never inspecting the region's own boundary and storing no hole
geometry. The independent topology audit measures one exterior ring and zero interior rings for all
five, so the scalar is preserved as metadata and no longer blocks the geometry.

### P1.F1 — laboratory command model

`commandModel/` turns the closed geometry into a local sequence of stitch moves
(`P1.F1-A_WIDTHS-STRAIGHT-SATIN-LAB-COMMAND-MODEL-V1`): one `stitch` command per consecutive point
pair, alternating `cross_column` / `advance_diagonal`, absolute mm at full precision, with
`startAnchorMm` equal to the first point and no jump / trim / tie / colour / end op. It is **not** the
productive command shape and not a machine command — the read-only contract audit classifies a future
mapping as `compatible_with_adapter`. See `commandModel/README.md`.

### P1.F0.2 — three separate verdicts

- `geometryEligibility` — polygon, axis, straightness, stations, rails, containment, width, split.
- `holeMetadataStatus` — `clear` / `real_holes` / `conflict` / `unresolved` / `unavailable`.
- `overallEligibility` — combines both and can be `metadata_conflict` without destroying
  `candidateGeometryComplete`.

Real interior ring geometry (`confirmed_real_holes`) still removes a region from the straight-column
scope; a count claiming holes with no boundary geometry becomes `metadata_conflict`, never a silent
rejection. Details in `holeSemantics/README.md`.

## Why `generateSatinColumnPath` was not reused

The existing generator (read-only inspection of `src/lib/contourExportBuilder.js`) consumes a
**centerline + constant width** and alternates sides by sample parity. The five regions are boundary
polygons with varying width and no centerline, so this foundation implements the geometric principle
(paired opposing boundary rails) independently. Full analysis in `sourceProvenance.json`.

## Artifacts

- `fixtures/A_WIDTHS_STRAIGHT_BARS.json` — verified real fixture (five regions).
- `fixtures/syntheticFixtures.js` — laboratory shapes (`synthetic: true`): `SYNTH-STRAIGHT-BAR`
  positive control and `SYNTH-BENT-CONSTANT-WIDTH` curved control.
- `reports/capabilityReport.json` / `.md` — measured results with value kinds
  (extracted / computed / configured / documentary / unavailable).
- `previews/HATCH-A-WIDTHS-{A1,A5,A6,A7,A8}-SATIN-CANDIDATE.svg` — technical diagnostics.
- `artifactManifest.json` — real persisted inventory with sizes and SHA-256 digests.

## Limitations

- Straight, hole-free, almost-convex bars only; one column per region.
- `spacingMm: 0.4` is an initial experimental configuration, not a Hatch equivalence.
- No curved columns, no width → technique rule, no `stitch_type` change, no compensation, no
  underlay, no autoSplit, no integration, no machine-compatibility claim, no physical validation and
  no Hatch conformance statement.