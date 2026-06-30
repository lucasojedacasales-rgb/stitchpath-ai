import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Auto-Adjust and Re-Digitize
 * Reads quality analysis, identifies problems, adjusts parameters, and re-digitizes
 * Goal: iteratively improve from 8/10 → 10/10
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Get project
    const project = await base44.entities.Project.get(project_id);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get latest analysis
    const decisions = await base44.asServiceRole.entities.DigitizationDecision.filter(
      { design_name: project.name },
      '-created_date',
      1
    );
    if (!decisions || decisions.length === 0) {
      return Response.json({ error: 'No analysis found — run analyzeDigitizationQuality first' }, { status: 400 });
    }
    
    const latestDecision = decisions[0];
    const { quality_assessment: qa } = latestDecision;
    const currentRating = qa?.overall_rating || 0;

    // If already 10/10, no changes needed
    if (currentRating >= 10) {
      return Response.json({
        success: true,
        message: 'Already at 10/10 — no adjustments needed',
        current_rating: currentRating,
        adjustments_applied: [],
      });
    }

    // Identify issues and determine which parameter to adjust
    const adjustments = [];
    const newConfig = { ...project.config };

    // === ISSUE 1: color_separation not EXCELLENT ===
    if (qa?.color_separation !== 'EXCELLENT' && !adjustments.some(a => a.param === 'max_colors')) {
      adjustments.push({
        param: 'max_colors',
        reason: `color_separation is ${qa?.color_separation}, not EXCELLENT`,
        old_value: project.config?.color_count || 8,
        new_value: Math.min(16, (project.config?.color_count || 8) + 2),
      });
      newConfig.color_count = adjustments[adjustments.length - 1].new_value;
    }

    // === ISSUE 2: stitch_distribution not BALANCED ===
    if (qa?.stitch_distribution !== 'BALANCED' && !adjustments.some(a => a.param === 'adaptive_density')) {
      adjustments.push({
        param: 'adaptive_density',
        reason: `stitch_distribution is ${qa?.stitch_distribution}, not BALANCED`,
        old_value: 'disabled',
        new_value: 'enabled',
      });
      newConfig.adaptive_density = true;
    }

    // === ISSUE 3: detail_visibility not HIGH ===
    if (qa?.detail_visibility !== 'HIGH' && !adjustments.some(a => a.param === 'minAreaPx')) {
      adjustments.push({
        param: 'minAreaPx',
        reason: `detail_visibility is ${qa?.detail_visibility}, not HIGH`,
        old_value: 60,
        new_value: 45,
      });
      // Note: minAreaPx is in contourEngine, passed via config to pipeline
      newConfig.contour_min_area_px = 45;
    }

    // === ISSUE 4: layer_integrity not PERFECT ===
    if (qa?.layer_integrity !== 'PERFECT') {
      adjustments.push({
        param: 'layer_integrity_fix',
        reason: `layer_integrity is ${qa?.layer_integrity}, must rebuild priorities`,
        old_value: 'auto-assign',
        new_value: 'explicit priority reset',
      });
      // This requires region rebuilding; signal to re-run pipeline
      newConfig.rebuild_priorities = true;
    }

    // If no issues found, already at target
    if (adjustments.length === 0) {
      return Response.json({
        success: true,
        message: 'All metrics at target levels',
        current_rating: currentRating,
        adjustments_applied: [],
      });
    }

    // Update project config with adjustments
    await base44.entities.Project.update(project_id, {
      config: newConfig,
      step: 2, // mark for re-processing
    });

    // Invoke hybridDigitize with new parameters
    const digitizeResult = await base44.functions.invoke('hybridDigitize', {
      image_url: project.image_url,
      width_mm: project.width_mm || 100,
      height_mm: project.height_mm || 100,
      color_count: newConfig.color_count,
      mode: project.digitize_mode || 'hybrid',
      // Pass existing regions as seed for vectorEngine
      traced_contours: {
        regions: project.regions || [],
        imageWidth: 1024,
        imageHeight: 1024,
      },
    });

    if (!digitizeResult.success) {
      throw new Error(`hybridDigitize failed: ${digitizeResult.error}`);
    }

    // Update project with new regions
    const newRegions = digitizeResult.data.regions || [];
    const totalStitches = digitizeResult.data.total_stitches || 0;

    await base44.entities.Project.update(project_id, {
      regions: newRegions,
      total_stitches: totalStitches,
      color_count: digitizeResult.data.colors_used || 0,
      step: 3,
      status: 'ready',
    });

    return Response.json({
      success: true,
      message: `Re-digitized with ${adjustments.length} adjustment(s)`,
      current_rating: currentRating,
      adjustments_applied: adjustments,
      new_region_count: newRegions.length,
      new_stitch_count: totalStitches,
      next_step: 'Run analyzeDigitizationQuality again to verify improvement',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});