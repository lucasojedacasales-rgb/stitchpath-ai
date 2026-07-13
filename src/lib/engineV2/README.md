# Universal Embroidery Engine V2 Foundation

Engine V2 exists to provide one canonical, machine-independent embroidery model before future processing stages are introduced. The current V1 pipeline remains active and unchanged. V2 is isolated, disabled by default, not imported by the application, and is not production-ready.

## Coordinate and color contracts

- `RegionV2` preserves source artwork geometry in normalized 0-1 coordinates.
- `EmbroideryObjectV2` represents planned embroidery geometry in millimetres.
- Artwork visual colors and selected machine threads are separate concepts. `visualColor` never acts as `threadId`.
- Semantic role and stitch type are separate concepts. For example, `outer_outline` is a role while `running` is a stitch type.

Disconnected contours must remain separate embroidery objects and must never be concatenated. Structural and layer order is represented with explicit object dependencies. A future V2 pipeline will have only one global sequence planner so competing local ordering passes cannot silently override one another.

## Machine boundary

Canonical commands are universal. Machine-specific coordinate transforms, limits, and encoding happen only after canonical command compilation. CE01 will become a machine adapter rather than the universal generator. DST and DSB encoding are outside this foundation.

## Phase 1 scope

Phase 1 provides immutable factories, configuration resolution, validation, diagnostics, tests, and documentation. It performs no image segmentation, vectorization, fill generation, contour generation, routing, machine adaptation, or file encoding. Enabling configuration flags only makes the resolver report V2 as enabled; no production application path invokes it in this phase.
