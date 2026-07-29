# P1.F1 lab command model report

`P1.F1-A_WIDTHS-STRAIGHT-SATIN-LAB-COMMAND-MODEL-V1` - compiler `compileStraightSatinCandidateToLabCommands@P1.F1-V1`

Layer separation - **geometry candidate** (mm zigzag points) -> **lab command model** (this document) ->
**productive command contract** (`flattenToCommands`, not produced here) -> **machine command** (0.1 mm encoder
deltas, not produced here) -> **export format** (DST/DSB bytes, not produced here). This is **not** a machine command.

Length audit window 0.3 mm / 12.1 mm from the baseline machineSettings; diagnostics only (no autoSplit, no
short-stitch filtering). Metrics below are rounded to 6 decimals for reading; fixtures keep full precision.

## Commands and lengths

| case | regionId | points | stations | commands | cross | diagonal | minMm | maxMm | avgMm | totalMm | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | r_zbgef31 | 78 | 39 | 77 | 39 | 38 | 0.439303 | 0.631771 | 0.558582 | 43.010824 | lab_command_model_complete |
| A5 | r_sv7z5qe | 80 | 40 | 79 | 40 | 39 | 2.81851 | 3.04539 | 3.027632 | 239.182945 | lab_command_model_complete |
| A6 | r_ecj9hl4 | 80 | 40 | 79 | 40 | 39 | 3.847569 | 4.010273 | 3.994499 | 315.565439 | lab_command_model_complete |
| A7 | r_c92bxh3 | 80 | 40 | 79 | 40 | 39 | 5.91006 | 6.050613 | 6.038756 | 477.061761 | lab_command_model_complete |
| A8 | r_zr65703 | 80 | 40 | 79 | 40 | 39 | 7.854421 | 7.988801 | 7.97947 | 630.378093 | lab_command_model_complete |

## Anchors and safety

| case | startAnchorMm | endAnchorMm | zero | belowMin | aboveMax | nonFinite | splitRequired | shortStitchPolicy | containment | holeMetadata |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | [6.715515, 20.746392] | [7.178, 5.546408] | 0 | 0 | 0 | 0 | false | false | contained | clear |
| A5 | [56.332794, 5.138287] | [53.474997, 20.740358] | 0 | 0 | 0 | 0 | false | false | contained | clear |
| A6 | [68.887717, 5.13343] | [65.003963, 20.736051] | 0 | 0 | 0 | 0 | false | false | contained | clear |
| A7 | [82.941045, 5.132573] | [76.981381, 20.73761] | 0 | 0 | 0 | 0 | false | false | contained | clear |
| A8 | [96.89413, 5.132505] | [88.945848, 20.741641] | 0 | 0 | 0 | 0 | false | false | contained | clear |

## Hashes and fixtures

| case | commandModelHash | fixture | fixtureSha256 | bytes | warnings |
|---|---|---|---|---|---|
| A1 | fnv1a32:0AF1C2C8 | fixtures/HATCH-A-WIDTHS-A1-SATIN-LAB-COMMANDS.json | ECE98F15131D7D39... | 48858 | - |
| A5 | fnv1a32:31C54B0F | fixtures/HATCH-A-WIDTHS-A5-SATIN-LAB-COMMANDS.json | 524805341B91A617... | 51775 | - |
| A6 | fnv1a32:FB2A0DFE | fixtures/HATCH-A-WIDTHS-A6-SATIN-LAB-COMMANDS.json | 66174BE66EF746EF... | 51706 | - |
| A7 | fnv1a32:EE54B846 | fixtures/HATCH-A-WIDTHS-A7-SATIN-LAB-COMMANDS.json | DC016628CE41DD54... | 51612 | - |
| A8 | fnv1a32:C5E13D01 | fixtures/HATCH-A-WIDTHS-A8-SATIN-LAB-COMMANDS.json | CADE2E661D6DC967... | 51597 | - |

## State

- final state: **STRAIGHT_SATIN_LAB_COMMAND_MODEL_READY**
- recommendation: **PROCEED_TO_P1_F2_ISOLATED_PRODUCTIVE_COMMAND_ADAPTER** (not implemented here)
- runPipeline, buildFinalCommands, CE01 and the encoders were not executed; baseline, productive code and stitch_type unchanged.
