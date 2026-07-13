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

## Phase 5: reviewed unthreaded object drafts

Phase 5 creates an explicit disposition for every Phase 4 proposal. Valid active proposals may be accepted automatically, planning exclusions remain excluded, and manual-review or low-confidence proposals remain deferred. Explicit rejection and tightly validated overrides are recorded without changing source geometry or artwork color.

Only accepted or validly overridden proposals become immutable `EmbroideryObjectDraftV2` records. Drafts are not final `EmbroideryObjectV2` objects: final objects still require a real `threadId`, while every Phase 5 draft has `threadAssignmentStatus="pending"` and no `threadId` property. Negative space, excluded proposals, unresolved manual review, rejected proposals, blocked proposals, and unsafe outlines cannot materialize.

Draft dependencies preserve structural proposal dependencies only. Missing required dependencies block dependents to a stable fixed point; they do not trigger color grouping, arbitrary sibling order, or travel routing. Geometry, holes, visual color, layer, role, and reviewed stitch-type proposals remain unchanged. Entry and exit candidates stay empty.

Thread palette resolution and conversion to final embroidery objects are deferred to Phase 6. Stitch generation, density, fill angles, underlay, pull compensation, global sequencing, machine adaptation, commands, and encoding are also deferred. Engine V2 remains disconnected from the production application.

## Phase 6: thread resolution and final embroidery objects

Phase 6 gives every reviewed object draft one explicit thread-assignment disposition and materializes final `EmbroideryObjectV2` records only for drafts with valid thread definitions and structurally complete dependencies. Invalid artwork colors are blocked explicitly and are never converted to black. A blocked required dependency propagates to dependents before any final object is created.

Artwork `visualColor` remains separate from the selected machine thread color. The default `artwork_exact` policy creates deterministic internal thread definitions for exact normalized artwork colors, but does not claim that a matching physical manufacturer spool exists. Visually close colors remain separate under this policy; only identical normalized colors share a definition. Manufacturer catalogs must be supplied explicitly for `catalog_exact` or `catalog_nearest`, and Delta E matching occurs only under the latter policy. Catalog assignments preserve all contributing artwork colors in `visualColorSamples` without modifying final object colors.

The canonical `EmbroideryObjectV2` model now preserves millimetre `holes` and artwork `visualColor` while retaining backward-compatible factory defaults. Final objects require a valid `threadId`, preserve draft geometry, holes, role, stitch type, layer, and structural dependencies, and keep entry and exit candidates empty. Thread assignment is the only planning flag completed in this phase.

Phase 6 creates no `ThreadBlockV2` records and performs no color sequencing, global routing, travel optimization, stitch generation, underlay planning, density or fill-angle selection, pull compensation, machine adaptation, canonical command generation, or encoding. Engine V2 remains disconnected from the production application.

## Phase 7: technical stitch specifications

Phase 7 creates one immutable `ObjectTechnicalSpecificationV2` disposition for every validated final object. Specifications are separate records and do not mutate final `EmbroideryObjectV2` geometry, holes, visual colors, roles, stitch types, layers, dependencies, or thread IDs. A disposition is explicitly `planned`, `manual_required`, or `blocked`; no object disappears silently.

Material profiles are configurable internal planning assumptions, not machine profiles or manufacturer-certified settings. They centralize default tatami and satin spacing, running length, pull-compensation scale, and underlay scale for generic woven, lightweight woven, stretch knit, heavy woven, high-loft, and explicit custom materials.

Geometry analysis remains in millimetres and subtracts explicit holes. It reports deterministic area, bounds, perimeter, centroid, principal axes, and clearly labelled width estimates without smoothing, simplifying, offsetting, or inserting contour geometry. Stitch compatibility never changes an object's existing stitch type: unsuitable geometry becomes manual-required or blocked.

Tatami, satin, running, and manual parameter records contain technical limits only. Fill angles are planned but no rows are generated. Underlay components are planned but no underlay paths or coordinates are generated. Pull compensation is planned but geometry is not offset. Entry and exit candidates are individual source-backed points, not routes, and no final entry/exit pair is selected.

Phase 7 creates no thread blocks, global sequence, travel optimization, physical stitch coordinates, canonical commands, machine adaptation, CE01 behavior, or encoding. Engine V2 remains disconnected from the production application.

## Phase 8: global sequence and thread blocks

Phase 8 provides the only global sequence planner in Engine V2. It consumes final objects, thread definitions, structural dependencies, Phase 7 technical specifications, and valid Phase 7 entry/exit candidates. Every final object receives exactly one explicit sequence disposition: `scheduled`, `manual_required`, or `blocked`.

The planner uses a strict lexicographic objective. Dependency validity has the highest priority, followed by complete scheduled coverage, thread changes, thread revisits, estimated interobject travel, and stable identifiers. Thread changes are therefore minimized before estimated travel, and neither metric can override a structural dependency. Exact search is used for bounded inputs and deterministic beam search for larger inputs; beam output explicitly does not claim optimality.

Selected entry and exit points are existing Phase 7 candidate points. They are chosen jointly with object order and are never invented, moved, or converted into centerlines or paths. Reported transition distance is only the Euclidean estimate from one selected exit to the next selected entry. It is not a physical stitch route or actual machine travel.

`ThreadBlockV2` records are planning blocks derived from the single global order. Same-thread objects remain separate embroidery objects, and disconnected objects or contours are never concatenated. A later block that reuses a closed thread requires an explicit reason. Black is not moved last automatically, and outlines are not moved last unless structural dependencies require that order.

Phase 8 generates no physical stitches, underlay coordinates, jumps, trims, color-change commands, canonical commands, machine adaptation, CE01 behavior, or encoding. Engine V2 remains disconnected from and unimported by the production application.

## Phase 9: machine-independent physical stitch paths

Phase 9 is the first Engine V2 phase that generates physical needle-point coordinates. It consumes immutable final objects, thread definitions, Phase 7 technical specifications, and the authoritative Phase 8 execution order, thread blocks, and selected entry/exit candidate identities. It does not reinterpret or reorder those decisions.

Physical subpaths contain actual stitch movements: each consecutive pair of points inside one continuous subpath is one physical stitch. Gaps between subpaths are explicit diagnostic discontinuities. They are not stitches, jumps, trims, color changes, or machine movements; classification remains deferred to a future canonical-command compiler.

Running generation follows and deterministically resamples source geometry. It never invents a centerline. Tatami generation uses clipped scanlines, preserves explicit holes, alternates rows, and leaves disconnected row intervals as separate subpaths. Satin generation uses cross-sections across the column rather than tracing polygon boundaries and blocks unsupported hole, branching, and width cases instead of falling back to another stitch type.

Phase 7 underlay plans now produce physical `center_run`, `edge_run`, `zigzag`, and `tatami_lattice` subpaths before top stitches. Pull compensation may adjust generated endpoints within the configured envelope, but source object geometry and holes remain unchanged. Selected Phase 8 entry and exit points become explicit anchor subpaths and remain the first and last physical points.

There is no silent point or stitch cap, including no 12,000-point cap. Configured object, total-point, and scanline limits block generation transactionally and never return a truncated or partially valid path. Phase 9 creates no canonical commands, jump commands, trim commands, color-change commands, end commands, machine limits, hoop transforms, CE01 behavior, DST/DSB encoding, or application integration. V1 remains active and untouched, and Engine V2 remains disconnected from the application.

## Phase 10: universal canonical command compilation

Phase 10 compiles validated Phase 9 physical paths into one deterministic universal stream containing only `stitch`, `jump`, `trim`, `colorChange`, and `end`. Stitch commands are needle-penetrating movements; jumps are unadapted non-sewing movements; trims are universal thread-cut intents. All movement coordinates remain absolute design-space millimetres.

The Phase 8 object order and thread-block order remain authoritative. `initialThreadId` activates the first block without an initial color change, and the default stream begins with one positioning jump to the first physical anchor. Exactly one color change is emitted between adjacent Phase 8 blocks, including dependency-required revisits, and exactly one `end` terminates the stream.

Every Phase 9 physical stitch maps to exactly one physical-source stitch command. Every physical point is reached, and every explicit subpath discontinuity is classified exactly once. A discontinuity becomes a connector stitch only when the Phase 9 transition proves same-object continuity, remains inside effective geometry, avoids holes, and fits the Phase 7 technical maximum. Other gaps remain non-sewing jumps, optionally preceded by one deduplicated trim. A stitch is never introduced across an object boundary.

Commands preserve object, region, thread, execution-step, thread-block, subpath, physical-point, transition, phase, and technique lineage. Coordinates are not quantized, movements are not split, and no machine profile, hoop transform, CE01 rule, DST/DSB encoder, or encoder byte limit is used. Engine V2 remains disconnected from the application and V1 remains unchanged.
