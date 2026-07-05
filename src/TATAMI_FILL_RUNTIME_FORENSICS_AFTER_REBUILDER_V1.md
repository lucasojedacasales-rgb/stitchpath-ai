# TATAMI_FILL_RUNTIME_FORENSICS_AFTER_REBUILDER_V1

> Runtime audit after REGION_SAFE_TATAMI_FILL_REBUILDER_V1.

## Summary

totalCommands=16778
totalStitches=15354
totalJumps=773
totalTrims=630
totalColors=9
maxVisibleStitchMm=5.214
maxFillSegmentMm=4.229
maxCe01SafeFillSegmentMm=4.229
fillStitchesOver4_5mm=0
fillStitchesOver8mm=0
ce01SafeFillSegmentsOver6mm=0
macroCriticalLongStitches=0
severeVisibleLongStitchCount=0
exportBlocked=false
blockingReason=none
universalStatus=VALID
formatStatusDST=VALID
formatStatusDSB=VALID

## Top 50 longest visible stitches

| rank | cmdIndex | lengthMm | regionId | prevRegionId | source | stitchType | isFill |
|---:|---:|---:|---|---|---|---|---|
| 1 | 4027 | 5.214 | safe_contour_r13 | safe_contour_r13 | standard | running_stitch | false |
| 2 | 4026 | 5.087 | safe_contour_r13 | safe_contour_r13 | standard | running_stitch | false |
| 3 | 4044 | 5.019 | safe_contour_r13 | safe_contour_r13 | standard | running_stitch | false |
| 4 | 3831 | 4.963 | safe_contour_r1 | safe_contour_r1 | standard | running_stitch | false |
| 5 | 4167 | 4.922 | safe_contour_r30 | safe_contour_r30 | standard | running_stitch | false |
| 6 | 4048 | 4.828 | safe_contour_r13 | safe_contour_r13 | standard | running_stitch | false |
| 7 | 4101 | 4.638 | safe_contour_r26 | safe_contour_r26 | standard | running_stitch | false |
| 8 | 3827 | 4.542 | safe_contour_r1 | safe_contour_r1 | standard | running_stitch | false |
| 9 | 4071 | 4.533 | safe_contour_r34 | safe_contour_r34 | standard | running_stitch | false |
| 10 | 4094 | 4.350 | safe_contour_r26 | safe_contour_r26 | standard | running_stitch | false |
| 11 | 3955 | 4.302 | safe_contour_r15 | safe_contour_r15 | standard | running_stitch | false |
| 12 | 4163 | 4.300 | safe_contour_r30 | safe_contour_r30 | standard | running_stitch | false |
| 13 | 2376 | 4.229 | r5 | r5 | ce01_safe_fill | fill | true |
| 14 | 4128 | 4.163 | safe_contour_r36 | safe_contour_r36 | standard | running_stitch | false |
| 15 | 15 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 16 | 19 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 17 | 23 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 18 | 35 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 19 | 39 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 20 | 59 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 21 | 60 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 22 | 63 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 23 | 67 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 24 | 81 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 25 | 85 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 26 | 86 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 27 | 100 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 28 | 103 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 29 | 138 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 30 | 142 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 31 | 169 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 32 | 173 | 4.030 | r12 | r12 | ce01_safe_fill | fill | true |
| 33-50 | — | <=4.030 | fill/contour | same/validated | ce01_safe_fill/standard | fill/running_stitch | mixed |

## Top offending regions

| regionId | countAbove4_5 | maxMm | note |
|---|---:|---:|---|
| safe_contour_r13 | 4 | 5.214 | contour only, not fill |
| safe_contour_r1 | 2 | 4.963 | contour only, not fill |
| safe_contour_r30 | 1 | 4.922 | contour only, not fill |
| safe_contour_r26 | 1 | 4.638 | contour only, not fill |
| safe_contour_r34 | 1 | 4.533 | contour only, not fill |
| r5 | 0 over 4.5 | 4.229 | fill, safe |
| r12 | 0 over 4.5 | 4.030 | fill, safe |

## All fill stitches >4.5mm

None.

## All fill stitches >8mm

None.

## All ce01_safe_fill segments >6mm

None.

## Cross-region / outside check

anySegmentCrossesOutsideItsRegion=false_for_ce01_safe_fill_segments_over_4_5mm
fillOutsideRegionCount=25_total_detector_count_after_rebuilder
fillOutsideRegionCountInterpretation=remaining detector count includes sampled region support mismatches under 4.5mm; no long visible fill segments remain.

## Bounding-box-long stitches

anyRegionStillProducesBoundingBoxLongStitches=false
maxCe01SafeFillSegmentMm=4.229
previousBoundingBoxLongPattern=eliminated_by_region_safe_scanline_clipping