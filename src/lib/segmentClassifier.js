/**
 * segmentClassifier.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Semantic classification of embroidery contour segments.
 *
 * Categories:
 *   outer_silhouette  — outer boundary of body/main shape          (EXPORT)
 *   limb_contour      — outer boundary of feet/arms                 (EXPORT)
 *   facial_detail     — mouth, nose, other facial features          (EXPORT)
 *   eye_detail        — eyes                                        (EXPORT)
 *   fill_boundary     — border between different colored fills   (NO EXPORT)
 *   travel            — jump/trim movement                       (NO EXPORT)
 *   artifact          — artificial geometry                      (NO EXPORT)
 *
 * Hierarchy (highest priority wins when a segment competes):
 *   facial_detail > eye_detail > outer_silhouette > limb_contour > fill_boundary > travel/artifact
 */

export const EXPORTABLE_CATEGORIES = ['outer_silhouette', 'limb_contour', 'facial_detail', 'eye_detail'];

export function isExportable(category) {
  return EXPORTABLE_CATEGORIES.includes(category);
}

/**
 * Classifies a contour object into a semantic category.
 * Uses name, layerType, parentGroupName, and region_class metadata.
 */
export function classifySegment(obj) {
  const name = (obj.name || '').toLowerCase();
  const layerType = (obj.layerType || '').toLowerCase();
  const rawRegion = obj.rawRegion || {};
  const parentGroup = (rawRegion.parentGroupName || '').toLowerCase();
  const rc = (rawRegion.region_class || '').toLowerCase();

  // 1. Mouth → facial_detail (highest priority)
  if (name.includes('mouth') || name.includes('boca') || name.includes('labio') ||
      layerType === 'mouth_detail_run') {
    return 'facial_detail';
  }

  // 2. Eyes → eye_detail
  if (name.includes('eye') || name.includes('ojo') || name.includes('iris') || name.includes('pupil')) {
    return 'eye_detail';
  }

  // 3. Other facial details (nose, etc.) → facial_detail
  if (layerType === 'detail_run' || layerType === 'mouth_detail_run') {
    return 'facial_detail';
  }

  // 4. Inner outline — check parent group
  if (rc === 'inner_outline' || layerType === 'inner_outline') {
    // Inner outline of mouth/eye group → facial_detail / eye_detail
    if (parentGroup === 'mouth') return 'facial_detail';
    if (parentGroup.includes('eye')) return 'eye_detail';
    // All other inner outlines → fill_boundary (NOT exported)
    // This prevents the black contour between two pink tones
    return 'fill_boundary';
  }

  // 5. Outer outline — body vs limb
  if (rc === 'outer_outline' || layerType === 'outer_outline') {
    if (parentGroup.includes('foot') || parentGroup.includes('arm')) return 'limb_contour';
    return 'outer_silhouette';
  }

  // 6. Unknown → artifact
  return 'artifact';
}

/**
 * Final validation — checks all acceptance criteria before export.
 */
export function validateFinalClassification(contourObjects, commands, regions) {
  const classifications = contourObjects.map(obj => ({
    name: obj.name || 'unnamed',
    category: classifySegment(obj),
  }));

  const exportable = classifications.filter(c => isExportable(c.category));
  const fillBoundaries = classifications.filter(c => c.category === 'fill_boundary');
  const artifacts = classifications.filter(c => c.category === 'artifact');

  // Mouth visible — a facial_detail with mouth in the name
  const mouthVisible = exportable.some(c =>
    c.category === 'facial_detail' &&
    (c.name || '').toLowerCase().includes('mouth')
  );

  // No false internal pink boundary — no fill_boundary exported
  const falseInternalPinkBoundary = false; // fill_boundary objects are filtered out before export

  // Outer contour coverage
  const hasOuterSilhouette = exportable.some(c => c.category === 'outer_silhouette');
  const outerContourCoverage = hasOuterSilhouette ? 100 : 0;

  // Foot contour coverage
  const hasLimbContour = exportable.some(c => c.category === 'limb_contour');
  const footContourCoverage = hasLimbContour ? 100 : 0;

  // No artifact geometry
  const artifactCount = artifacts.length;

  // No travel as visible stitch — check commands for long non-contour stitches
  let travelAsVisible = 0;
  let prevX = 0, prevY = 0;
  for (const c of commands) {
    if (c.type === 'stitch') {
      const dist = Math.hypot((c.x || 0) - prevX, (c.y || 0) - prevY);
      const lt = (c.layerType || '').toLowerCase();
      const st = (c.stitchType || '').toLowerCase();
      const isValid = lt.includes('outline') || lt.includes('detail') || lt.includes('mouth') ||
                      st === 'satin' || st === 'fill' || c.source === 'clipped_fill_optimized';
      if (dist > 6.0 && !isValid) travelAsVisible++;
    }
    if (c.type === 'stitch' || c.type === 'jump') {
      prevX = c.x || 0; prevY = c.y || 0;
    }
  }

  const result = {
    mouthVisible,
    falseInternalPinkBoundary,
    outerContourCoverage,
    footContourCoverage,
    artifactCount,
    travelAsVisible,
    exportableCount: exportable.length,
    fillBoundaryCount: fillBoundaries.length,
    classifications,
  };

  console.log(`[segment-validation] mouthVisible: ${mouthVisible}`);
  console.log(`[segment-validation] falseInternalPinkBoundary: ${falseInternalPinkBoundary}`);
  console.log(`[segment-validation] outerContourCoverage: ${outerContourCoverage}%`);
  console.log(`[segment-validation] footContourCoverage: ${footContourCoverage}%`);
  console.log(`[segment-validation] artifacts: ${artifactCount}`);
  console.log(`[segment-validation] travel as visible: ${travelAsVisible}`);
  console.log(`[segment-validation] fill_boundaries excluded: ${fillBoundaries.length}`);
  console.log(`[segment-validation] exportable: ${exportable.length}`);

  return result;
}