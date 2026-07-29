# P1.F2 productive command contract audit

Classification: **`PRODUCTIVE_MM_CONTRACT_REQUIRES_START_ANCHOR_ADAPTER`**.

This was a read-only static inspection. No productive module is imported by the adapter and none of
`runPipeline`, `buildFinalCommands`, CE01, the encoders, or export code was executed.

## Verified boundary

`src/lib/exportPipeline.js::flattenToCommands` produces the flat command list consumed immediately by
`buildFinalCommands`. At that boundary, coordinates are full-precision **absolute millimeters**.
The operation field is `type`; a stitch is the exact literal `stitch`; its destination is `x/y`.
This is before direct DST conversion rounds coordinates to 0.1 mm and forms relative deltas.

The producer's broad shape is
`{ type, x, y, color, regionId, stitchType?, source?, layerType? }`. Immediate consumers require
`type/x/y`. `regionId` is a real contextual field used by CE01 and route/detail grouping. `color` is
normally present but consumers provide a fallback; P1.F1 contains no authoritative thread color.
No generic `metadata`, `objectId`, `op`, `command`, `dx`, or `dy` field belongs to this boundary.

P1.F2 therefore targets the exact, source-backed field set:

```js
{ type: "stitch", x: labCommand.toMm[0], y: labCommand.toMm[1], regionId: labModel.regionId }
```

`color`, `stitchType`, `source`, and `layerType` are deliberately excluded. Adding them would invent
thread, productive type, provenance, or layer context not carried by the P1.F1 model.

## Start anchor and controls

`flattenToCommands` normally knows the current needle position and can add a jump and possibly a trim
before an object's first stitch. A local P1.F1 column does not know that position. P1.F2 preserves
`startAnchorMm` outside `productiveCommands` with `requiresExternalSequencing: true`; command zero is
the destination of lab command zero. Command counts therefore remain equal.

No `jump`, `trim`, `end`, `colorChange`, tie-in, tie-off, underlay, or compensation is added.

## Downstream behavior

The CE01 sanitizer may remove duplicates/micro-stitches, split long stitches, optimize jumps, and
insert trims. Existing stitch objects are copied with spread syntax, so it does not strip named
stitch fields. The CE01 validator and command metrics consume `type/x/y` and optionally `regionId`
and `color`.

Direct DST export consumes absolute-mm commands, rounds `x/y * 10`, and encodes relative 0.1 mm
deltas. The standalone DST/DSB builders accept absolute points already expressed in 0.1 mm units.
Those quantized layers are intentionally not P1.F2's target.

## Meaning of compatibility

The mapping is exact and one-to-one once the start position is kept separate. It proves only that
the laboratory path can be represented with a verified productive command shape. It does not prove
sequencing, CE01 acceptance, encoder parity, export readiness, or physical machine behavior.
