/**
 * Complete geometric pipeline for embroidery digitization
 * Image -> Vectorization -> Closed Polygons -> Safety Offset -> Stitch Generation -> Final Clip -> Render
 * 
 * CRITICAL: Stitches ONLY from final vector polygons, never from pixel data directly.
 */

import { closePolygon, repairGaps, validatePolygon } from './polygonValidator.js';
import { offsetPolygon, applyPullCompensation } from './polygonOffsetting.js';
import { clipPolygon, clipPathToPolygon } from './clipperEngine.js';

/**
 * Main pipeline orchestrator
 * Converts raw regions from vectorization into production-ready stitch paths
 */
export async function executeGeometricPipeline(regions, canvasWidth, canvasHeight, config = {}) {
  const pipeline = {
    step1_input: regions,
    step2_closedPolygons: [],
    step3_offsetPolygons: [],
    step4_clippedPolygons: [],
    step5_stitchPaths: [],
    errors: [],
    warnings: [],
    statistics: {}
  };

  try {
    // ──────────────────────────────────────────────────────────────────────
    // STEP 1: Input validation
    // ──────────────────────────────────────────────────────────────────────
    if (!regions || regions.length === 0) {
      throw new Error('No regions to process');
    }

    // ──────────────────────────────────────────────────────────────────────
    // STEP 2: Ensure all polygons are closed & repaired
    // ──────────────────────────────────────────────────────────────────────
    pipeline.step2_closedPolygons = regions.map((region, idx) => {
      let pts = region.path_points;
      
      if (!pts || pts.length < 3) {
        pipeline.errors.push(`Region ${idx}: Invalid polygon (< 3 points)`);
        return null;
      }

      // Close polygon
      pts = closePolygon(pts);
      
      // Repair gaps
      pts = repairGaps(pts, 0.003);

      // Validate
      const validation = validatePolygon(pts);
      if (!validation.valid) {
        pipeline.warnings.push(`Region ${idx}: Polygon validation failed`);
      }

      return {
        ...region,
        path_points: pts,
        validation,
        is_closed: true,
        is_repaired: true
      };
    }).filter(r => r !== null);

    if (pipeline.step2_closedPolygons.length === 0) {
      throw new Error('No valid closed polygons generated');
    }

    // ──────────────────────────────────────────────────────────────────────
    // STEP 3: Apply safety offset (inward for fills, preserve contours)
    // ──────────────────────────────────────────────────────────────────────
    const safetyMarginMm = config.safetyMargin || 0.5;
    const pullComp = config.pullCompensation || 0;

    pipeline.step3_offsetPolygons = pipeline.step2_closedPolygons.map((region, idx) => {
      try {
        let offsetPath = region.path_points;

        // Only apply offset to fill regions (not contours)
        if (region.stitch_type === 'fill') {
          // Inward offset for safety (prevent overflow)
          offsetPath = offsetPolygon(
            region.path_points,
            safetyMarginMm / 100, // Convert mm to normalized units
            'inward'
          );

          if (!offsetPath || offsetPath.length < 3) {
            pipeline.warnings.push(`Region ${idx}: Offset failed, using original`);
            offsetPath = region.path_points;
          }

          // Apply pull compensation if needed
          if (pullComp !== 0) {
            offsetPath = applyPullCompensation(offsetPath, pullComp);
          }
        }

        return {
          ...region,
          path_points: offsetPath,
          offset_applied: true,
          safety_margin_mm: safetyMarginMm
        };
      } catch (err) {
        pipeline.warnings.push(`Region ${idx}: Offset error - ${err.message}`);
        return region;
      }
    });

    // ──────────────────────────────────────────────────────────────────────
    // STEP 4: Final clipping to canvas bounds
    // ──────────────────────────────────────────────────────────────────────
    const clipBounds = [
      [0, 0],
      [canvasWidth, 0],
      [canvasWidth, canvasHeight],
      [0, canvasHeight]
    ];

    pipeline.step4_clippedPolygons = pipeline.step3_offsetPolygons.map((region, idx) => {
      try {
        const clipped = clipPolygon(
          region.path_points,
          clipBounds
        );

        if (!clipped || clipped.length < 3) {
          pipeline.warnings.push(`Region ${idx}: Completely clipped outside bounds`);
          return null;
        }

        return {
          ...region,
          path_points: clipped,
          clipping_applied: true,
          bounds: calculateBounds(clipped)
        };
      } catch (err) {
        pipeline.errors.push(`Region ${idx}: Clipping failed - ${err.message}`);
        return null;
      }
    }).filter(r => r !== null);

    if (pipeline.step4_clippedPolygons.length === 0) {
      throw new Error('No regions survived clipping');
    }

    // ──────────────────────────────────────────────────────────────────────
    // STEP 5: Generate stitch paths ONLY from final polygons
    // ──────────────────────────────────────────────────────────────────────
    // NOTE: This step only PREPARES the regions; actual stitch generation
    // happens in tatamiEngine, satinEngine, etc. with these final polygons.
    // NEVER extract pixels at this stage.

    pipeline.step5_stitchPaths = pipeline.step4_clippedPolygons.map((region, idx) => {
      // Mark that this region is ready for stitch generation
      return {
        ...region,
        ready_for_stitching: true,
        stitch_source: 'vector_polygon', // CRITICAL: Not from pixels
        region_index: idx
      };
    });

    // ──────────────────────────────────────────────────────────────────────
    // Statistics & summary
    // ──────────────────────────────────────────────────────────────────────
    pipeline.statistics = {
      input_regions: regions.length,
      closed_polygons: pipeline.step2_closedPolygons.length,
      offset_applied: pipeline.step3_offsetPolygons.filter(r => r.offset_applied).length,
      final_regions: pipeline.step5_stitchPaths.length,
      total_errors: pipeline.errors.length,
      total_warnings: pipeline.warnings.length
    };

    return {
      success: true,
      pipeline,
      regions: pipeline.step5_stitchPaths // Return final production regions
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      pipeline,
      regions: []
    };
  }
}

/**
 * Calculate bounding box of polygon
 */
export function calculateBounds(polygon) {
  if (!polygon || polygon.length === 0) return null;
  
  let minX = polygon[0][0], maxX = polygon[0][0];
  let minY = polygon[0][1], maxY = polygon[0][1];

  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Validate entire pipeline output
 */
export function validatePipelineOutput(pipelineResult) {
  const validation = {
    isValid: false,
    issues: [],
    regionChecks: []
  };

  if (!pipelineResult.success) {
    validation.issues.push(`Pipeline failed: ${pipelineResult.error}`);
    return validation;
  }

  const regions = pipelineResult.regions || [];

  if (regions.length === 0) {
    validation.issues.push('No regions in output');
    return validation;
  }

  // Check each region
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const check = {
      index: i,
      name: region.name,
      valid: true,
      issues: []
    };

    if (!region.path_points || region.path_points.length < 3) {
      check.valid = false;
      check.issues.push('Invalid polygon points');
    }

    if (!region.ready_for_stitching) {
      check.valid = false;
      check.issues.push('Not ready for stitching');
    }

    if (region.stitch_source !== 'vector_polygon') {
      check.valid = false;
      check.issues.push('Invalid stitch source (not vector)');
    }

    if (!check.valid) {
      validation.issues.push(`Region ${i}: ${check.issues.join('; ')}`);
    }

    validation.regionChecks.push(check);
  }

  validation.isValid = validation.issues.length === 0;
  return validation;
}

/**
 * Export pipeline for debugging/diagnostics
 */
export function exportPipelineReport(pipelineResult) {
  return {
    timestamp: new Date().toISOString(),
    success: pipelineResult.success,
    statistics: pipelineResult.pipeline?.statistics || {},
    errors: pipelineResult.pipeline?.errors || [],
    warnings: pipelineResult.pipeline?.warnings || [],
    regionCount: pipelineResult.regions?.length || 0,
    validation: validatePipelineOutput(pipelineResult)
  };
}