# P1.F2 productive adapter report

Contract: `STITCHPATH-FLATTEN-TO-COMMANDS-ABSOLUTE-MM-STITCH-CORE-V1`

Classification: **`PRODUCTIVE_MM_CONTRACT_REQUIRES_START_ANCHOR_ADAPTER`**

All values below come from persisted P1.F1 fixtures adapted through the real P1.F2 API. No productive pipeline, CE01, encoder, or export was executed.

| case | commands lab/productive | min mm | max mm | total mm | delta mm | adapter hash | fixture SHA-256 |
|---|---:|---:|---:|---:|---:|---|---|
| HATCH-A-WIDTHS-A1 | 77/77 | 0.4393027296107982 | 0.6317707966326372 | 43.010824435239314 | 0 | `fnv1a32:A7502B2D` | `A10B86055EAC0160BC83FA4C7BE5690226640B7266B3700195E3C94F657A0444` |
| HATCH-A-WIDTHS-A5 | 79/79 | 2.81850991000595 | 3.045389543198542 | 239.18294471768104 | 0 | `fnv1a32:5C2A00E1` | `FFC49A5CEF40E165A9499A4FF46E9B33AAF3F117F9489A14F7A2CCCE0056E75A` |
| HATCH-A-WIDTHS-A6 | 79/79 | 3.8475687276300405 | 4.010272681315522 | 315.5654393008484 | 0 | `fnv1a32:99D40A99` | `58536990D1AAACD3CF1C1CA804A49B9071D2DFC6C50055EBEA3922893F87E23E` |
| HATCH-A-WIDTHS-A7 | 79/79 | 5.910060266258054 | 6.0506128690080425 | 477.0617609379029 | 0 | `fnv1a32:1A350716` | `F91EE5E6D3FA65CBDE36CED6A269AAE654DE1B76C0C0D179780D287BE935176B` |
| HATCH-A-WIDTHS-A8 | 79/79 | 7.854420945332152 | 7.988801282670796 | 630.3780931397922 | 0 | `fnv1a32:8354BAF0` | `F9A2FD68C063F5F2CD07F41C022D91EDF9E3C0833E242FCC84F08897AD9AB729` |

Every case has one-to-one order, exact absolute-mm destinations, zero field-set mismatch, zero forbidden operations, and a separately preserved start anchor.

P1.F1 is the source laboratory segment model. P1.F2 is only a shape-compatible wrapper. An active productive command, a CE01 command, an encoder record, and a physical machine command are later and distinct layers.

Final state: **STRAIGHT_SATIN_PRODUCTIVE_ADAPTER_READY**.

Recommendation: **PROCEED_TO_P1_F3_SHADOW_PRODUCTIVE_COMMAND_VALIDATION**.
