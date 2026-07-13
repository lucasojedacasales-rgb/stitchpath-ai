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

## Phase 3: hole-aware topology and artwork semantics

Phase 3 treats a region's effective area as its counter-clockwise outer polygon minus its explicitly supplied clockwise holes. Point, containment, overlap, touching, equality, parent selection, and area calculations respect those holes. A region entirely inside an explicit hole is outside the containing region's effective area and cannot receive it as a parent. No new holes are inferred.

Artwork interpretation uses a separate semantic model: `background`, `primary_shape`, `secondary_shape`, `internal_feature`, `dark_mark`, `highlight`, `negative_space`, and `unknown`. These are artwork semantic roles, not embroidery roles. In particular, `dark_mark` is a candidate interpretation and is never automatically an outline. A visual color remains artwork evidence and is never a machine thread.

Semantic analysis combines controlled source labels, normalized geometry, graph topology, explicit negative-space evidence, dark-stroke support, and deterministic color features. Default color thresholds use relative luminance values of `0.10` for very dark, `0.22` for dark, `0.78` for light, and `0.90` for very light, with `0.12` as the neutral saturation threshold. Callers may override these thresholds explicitly.

`negative_space` requires explicit hole or trusted negative-space, cutout, or void evidence; nesting alone is insufficient. Assessments below the default accepted confidence of `0.72`, or with conflicting evidence, are marked for review and prefer `unknown` over an unsafe guess.

Phase 3 assigns no stitch types, contours, threads, embroidery objects, commands, sequence plans, or machine adaptations. Engine V2 remains disconnected from the application.

## Phase 4: conservative embroidery-object proposals

Phase 4 adds a planning-only decision layer over accepted `RegionV2`, `RegionGraphV2`, and semantic assessments. Controlled source vocabulary now recognizes equivalent English and Spanish concepts while preserving the exact source values and rejecting unsafe substring matches. Artwork roles remain distinct from proposed embroidery roles.

Every accepted region receives exactly one immutable decision: an active proposal, an explicit exclusion, or manual review. A proposed stitch type is only a recommendation and contains no stitch coordinates. Negative space is excluded, backgrounds are excluded by default, and unknown or ambiguous regions are retained for manual review instead of disappearing.

Outline proposals are allowed only for explicit, region-backed outline evidence that also passes dark-color, dark-stroke-support, topology, confidence, and conflict checks. Dark color alone never implies an outline. Synthetic outlines remain disabled, and disconnected explicit outline regions remain separate.

Phase 4 does not materialize final `EmbroideryObjectV2` objects. Thread assignment, physical stitch generation, global sequencing, travel routing, machine adaptation, and encoding remain deferred. Engine V2 is still isolated from and unimported by the production application.
