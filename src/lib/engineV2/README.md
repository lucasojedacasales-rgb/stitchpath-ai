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

## Phase 2: region ingestion and topology

Phase 2 adds an isolated boundary that adapts legacy artwork regions into canonical `RegionV2` data and builds `RegionGraphV2`. Every source must declare its coordinate space explicitly as `normalized`, `pixel`, or `millimeter`; pixel and millimeter inputs also require their corresponding source or design dimensions. Output region geometry always remains normalized.

Geometry canonicalization is deterministic. It removes only duplicate closing and consecutive duplicate points, preserves meaningful corners, normalizes outer polygons counter-clockwise and explicit holes clockwise, and rejects invalid, degenerate, out-of-range, or obviously self-intersecting polygons. It does not smooth or repair artwork.

`RegionGraphV2` records containment, overlap, boundary touching, parent/child structure, and disconnected spatial components. A parent is the smallest containing region and is not automatically a hole. Holes come only from explicit source geometry or future explicit negative-space metadata. Disconnected regions with the same visual color remain separate.

The graph does not generate contours, stitches, embroidery objects, commands, routes, or thread assignments. Engine V2 remains disconnected from the production application after Phase 2.
