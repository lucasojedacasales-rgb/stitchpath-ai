# Productive command contract — read-only audit (P1.F1)

Static inspection only. No productive module is imported by the command model, no engine was
executed, `runPipeline` / `buildFinalCommands` / the encoders were not run.

## Layers found

| layer | producer | shape | units |
|---|---|---|---|
| stitch object | `buildStitchObjects`, `buildContourObjects` | `{ id, color, name, stitch_type, priority, points: [[x, y]], layerType }` | mm, absolute |
| object stitch points | `processObjectStitches(obj, machine)` | `Array<[x, y]>` | mm, absolute |
| productive command | `flattenToCommands` (used by `buildFinalCommands`) | `{ type, x, y, color, regionId, stitchType?, source?, layerType? }` | mm, **absolute per command** |
| machine command | `dstEncoder`, `dsbEncoder` | 3-byte records | **0.1 mm deltas**, DST ±121 (12.1 mm), DSB ±127 (12.7 mm) |
| export format | `buildDSTFile`, `buildDSBFile` | bytes | file |

Productive command types: `stitch`, `jump`, `trim`, `colorChange`, `end`. Required: `type`, `x`, `y`.
Usually present: `color`, `regionId`. Optional: `stitchType`, `source`, `layerType`. There is **no
explicit object-begin command**: object boundaries are implied by `regionId` changes plus the
`trim` / `colorChange` commands emitted between objects, and the design ends with one `end` command.
`processObjectStitches` is where tie-in, edge-run underlay, grid underlay and tie-off are injected.

## Differences against the lab model

- per-point absolute vs per-segment `fromMm → toMm` + `deltaMm` + `lengthMm`;
- `type/x/y` vs `op/fromMm/toMm`;
- productive commands need `color` and `regionId`; the lab model is context-free;
- the lab model forbids `jump`, `trim`, `colorChange`, `end`, tie and underlay ops;
- encoders quantize to 0.1 mm relative units and split long moves; the lab model keeps full
  precision and only *reports* `splitRequired`.

## Risks

An adapter would have to supply colour, region identity, object sequencing and the entry/exit moves,
decide whether the first point becomes a jump or a stitch, and accept that 0.1 mm quantization will
change measured lengths. Underlay and compensation are absent by design.

## Fields that could not be verified

- an explicit object-begin command: none exists in the inspected code, so it cannot be mapped;
- a canonical schema file for productive commands: none found; the contract is implicit in
  `flattenToCommands` and its consumers.

## Classification

**`compatible_with_adapter`** — each lab command maps 1:1 to `{ type: 'stitch', x, y }` using `toMm`
(with `startAnchorMm` emitted first by the caller), but the missing context above must come from an
adapter. That adapter is **not implemented in P1.F1**.