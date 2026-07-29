# SATIN_COLUMN foundation — P1.F0 (laboratory only)

Isolated geometric prototype that validates whether a real A_WIDTHS region is a
straight bar apt for a satin column and, when it is, builds candidate satin
geometry: principal axis → perpendicular sections → left/right rails →
transversal zigzag → measured widths, stations and stitch lengths → technical
SVG preview.

**candidateOnly: true · integrated: false.** Nothing here is imported by the
productive engine, and this foundation imports nothing from
`src/lib/pipeline/**`, the productive `src/lib/*` motor modules,
`referenceLearning` or any UI component. It never runs `runPipeline`,
`buildFinalCommands`, CE01, simulators or exporters, and never changes any
region's `stitch_type`.

## Data source

The five real regions come exclusively from the sealed baseline
`BASE-ENGINE-A-WIDTHS-V1` (cases A1, A5, A6, A7, A8). The repository
`pipelineSnapshot.json` is sanitised and keeps no `path_points`, so the
verified external capture (3 140 114 bytes, SHA-256 recomputed and matched
before extraction) was used. Only the five authorized regions were extracted
into `fixtures/A_WIDTHS_STRAIGHT_BARS.json` with full-precision original
points, explicit `coordinateSpace: normalized_0_1`, the 100×80 mm design size,
a per-polygon FNV-1a hash and minimal provenance. The engine was **not**
re-executed. See `sourceProvenance.json`.

## Coordinates

`xMm = xNormalized × 100 ; yMm = yNormalized × 80`. The space is taken from the
baseline's explicit declaration, never deduced from numeric ranges. No pixels.

## Algorithm

1. `geometry/normalizePolygonMm.js` — explicit mm conversion; duplicate removal
   is recorded, never silent.
2. `geometry/polygonValidation.js` — simple, hole-free, positive-area,
   non-self-intersecting polygon + identity/role checks. Incompatible shapes
   return concrete reasons; nothing is repaired.
3. `geometry/principalAxis.js` — axis from polygon **area moments**
   (covariance of the filled region), invariant to start point, array rotation
   and winding. `region.angle` / `fill_angle` / `plan.optimalAngle` are never
   used.
4. `geometry/boundaryIntersections.js` + `geometry/buildColumnRails.js` —
   perpendicular section per station (spacingMm 0.4, experimental configured
   value, not declared equivalent to Hatch spacing); exactly two deduplicated
   intersections required; deterministic left/right by the canonical minor
   axis; missing edges are reported as failed stations, never invented.
5. `geometry/buildSatinZigzag.js` — left[0] → right[0] → left[1] → right[1] …;
   stitch lengths measured against maxStitchLengthMm 12.1; exceeding it sets
   `splitRequired: true` and status `unsupported_requires_split` (no autoSplit).
6. `eligibility/evaluateStraightColumnEligibility.js` — criterion-based
   eligibility; every threshold declared in `foundationSchema.js`, echoed in
   the result and overridable via options.
7. `renderSatinCandidateSvg.js` — raw technical previews under `previews/`
   (polygon, axis, rails, stations, intersection pairs, zigzag, mm scale).

## Why `generateSatinColumnPath` was not reused

The existing generator (read-only inspection, `src/lib/contourExportBuilder.js`)
consumes a **centerline + constant width** and alternates sides by sample
parity around that centerline. Regions provide boundary polygons with varying
width and no centerline, so the foundation implements the geometric principle
(paired opposing boundary rails) independently. Full analysis in
`sourceProvenance.json`.

## Outputs

- `fixtures/A_WIDTHS_STRAIGHT_BARS.json` — verified real fixture.
- `reports/capabilityReport.json` / `.md` — measured results per case, with
  extracted / computed / configured / documentary / unavailable value kinds.
- `previews/HATCH-A-WIDTHS-{A1,A5,A6,A7,A8}-SATIN-CANDIDATE.svg`.

## Limitations

- Straight, hole-free, almost-convex bars only; one column per region.
- spacingMm 0.4 is an initial experimental configuration.
- No satin/fill selection, no stitch_type changes, no compensation, no
  underlay, no autoSplit, no integration, no machine compatibility claim,
  no physical validation, no Hatch conformance statement.