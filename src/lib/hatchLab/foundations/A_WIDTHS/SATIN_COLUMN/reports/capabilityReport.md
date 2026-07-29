# SATIN_COLUMN capability report — P1.F0.1 closure (laboratory, candidateOnly)

Foundation `P1.F0.1-A_WIDTHS-SATIN_COLUMN-STRAIGHT-CLOSURE-V1`.
Configured a priori (never derived from A1–A8): spacingMm 0.4 · edgeMarginMm 0.2 ·
maxStitchLengthMm 12.1 · requireAllStationsPaired true · straightness 0.25 mm / 2 % / 5° ·
containment tolerance 1e-4 mm sampled at 0/25/50/75/100 % of every segment.

Values recomputed from the persisted fixture of `BASE-ENGINE-A-WIDTHS-V1` (hash-verified, engine not
re-executed) and rounded to 6 decimals. `candidateOnly: true`, `integrated: false`. No Hatch
conformance and no physical validation is asserted.

## Closure finding — declared holes

Every authorized region declares interior holes **numerically** (`holes: 1` / `holes: 2`). P1.F0 only
tested `Array.isArray(region.holes)`, so the declaration was invisible and the five cases were
reported `eligible`. Under the hardened hole policy the five are now **`ineligible`**, while their
measured geometry stays **complete, fully paired, straight and contained**.

## Measured results

| case | status | eligibility | geometryComplete | allStationsPaired | stations ok/total | gaps | holes (count) | widthMm min/mean/max | varRatio | stitches | stitchMm min/avg/max | split |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | ineligible | ineligible | true | true | 39/39 | 0 | present (1) | 0.439303/0.487726/0.489000 | 0.101896 | 77 | 0.439303/0.558582/0.631771 | false |
| A5 | ineligible | ineligible | true | true | 40/40 | 0 | present (2) | 2.818510/3.012777/3.019089 | 0.066576 | 79 | 2.818510/3.027632/3.045390 | false |
| A6 | ineligible | ineligible | true | true | 40/40 | 0 | present (2) | 3.847569/3.983486/3.990184 | 0.035802 | 79 | 3.847569/3.994499/4.010273 | false |
| A7 | ineligible | ineligible | true | true | 40/40 | 0 | present (1) | 5.910060/6.031475/6.037252 | 0.021088 | 79 | 5.910060/6.038756/6.050613 | false |
| A8 | ineligible | ineligible | true | true | 40/40 | 0 | present (1) | 7.854421/7.974416/7.978471 | 0.015556 | 79 | 7.854421/7.979470/7.988801 | false |

`failedStations: 0`, `failedStationIndices: []`, `stationGapCount: 0`, `maximumStationGapMm: 0`,
`polygonSimple: true` for the five cases.

## Centerline straightness (total least squares through the station centroid)

| case | points | devMax mm (≤0.25) | devRms mm | devRatio (≤0.02) | axisΔ° (≤5) | start→end angle° | verdict |
|---|---|---|---|---|---|---|---|
| A1 | 39 | 0.001502 | 0.000253 | 0.000099 | 0.002872 | −90.006281 | within policy |
| A5 | 40 | 0.048932 | 0.008935 | 0.003137 | 0.003200 | 89.866150 | within policy |
| A6 | 40 | 0.056137 | 0.009855 | 0.003599 | 0.007720 | 90.095203 | within policy |
| A7 | 40 | 0.057915 | 0.009739 | 0.003712 | 0.010045 | 90.131816 | within policy |
| A8 | 40 | 0.055252 | 0.009548 | 0.003542 | 0.003194 | 90.180691 | within policy |

## Zigzag containment

| case | segments | samples | outside samples | outside segments | status |
|---|---|---|---|---|---|
| A1 | 77 | 385 | 0 | — | contained |
| A5 | 79 | 395 | 0 | — | contained |
| A6 | 79 | 395 | 0 | — | contained |
| A7 | 79 | 395 | 0 | — | contained |
| A8 | 79 | 395 | 0 | — | contained |

## Synthetic controls (`synthetic: true`)

| fixture | status | eligibility | why |
|---|---|---|---|
| SYNTH-STRAIGHT-BAR | candidate_geometry_complete | eligible | hole-free straight bar, 75/75 paired, devMax 0, contained |
| SYNTH-BENT-CONSTANT-WIDTH | partial | partial | 147/147 paired and contained, but devMax 9.681856 mm and devRatio 0.165785 exceed the straightness policy (width variation 1.418640 also exceeds 0.35) |

Previews: one technical SVG per real case under `previews/`.