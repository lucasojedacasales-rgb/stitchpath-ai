/**
 * trainLearningModel — Backend function para entrenar modelos de mejora
 * Expone la funcionalidad de aprendizaje a herramientas externas.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, project_id, limit = 500 } = await req.json();

    if (!action) {
      return Response.json({ error: 'action required (export, analyze, export_csv, export_jsonl)' }, { status: 400 });
    }

    // ─── Helper: Serialize para training ───────────────────────────────────
    function serializeForTraining(feedbackList) {
      const records = [];
      for (const fb of feedbackList) {
        if (!fb.region_properties || !fb.recommendation || !fb.user_change) continue;

        records.push({
          // Features (entrada)
          area_mm2: fb.region_properties.area_mm2 || 0,
          avg_width_mm: fb.region_properties.avg_width_mm || 0,
          convexity: fb.region_properties.convexity || 0.5,
          curvature: fb.region_properties.curvature || 0,
          complexity_score: fb.region_properties.complexity_score || 0,
          inertia_ratio: fb.region_properties.inertia_ratio || 1,
          fabric_type: fb.fabric_type || 'Algodón',
          image_type: fb.image_type || 'unknown',

          // Targets (salida)
          stitch_type: fb.user_change.stitch_type || fb.recommendation.stitch_type,
          density: fb.user_change.density !== undefined ? fb.user_change.density : fb.recommendation.density,
          angle: fb.user_change.angle !== undefined ? fb.user_change.angle : fb.recommendation.angle,
          pull_compensation: fb.user_change.pull_compensation !== undefined ? fb.user_change.pull_compensation : fb.recommendation.pull_compensation,
          underlay: fb.user_change.underlay !== undefined ? (fb.user_change.underlay ? 1 : 0) : (fb.recommendation.underlay ? 1 : 0),

          // Metadata
          original_confidence: fb.recommendation.confidence || 0.5,
          changed_fields: fb.changed_fields ? fb.changed_fields.join(',') : '',
          timestamp: fb.created_date,
        });
      }
      return records;
    }

    // ─── Helper: Generate CSV ─────────────────────────────────────────────
    function generateTrainingCSV(feedbackList) {
      const records = serializeForTraining(feedbackList);
      if (records.length === 0) return '';

      const header = Object.keys(records[0]).join(',');
      const rows = records.map(r => Object.values(r).map(v => {
        if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
        return v;
      }).join(','));

      return [header, ...rows].join('\n');
    }

    // ─── Helper: Generate JSONL ──────────────────────────────────────────
    function generateTrainingJSONL(feedbackList) {
      const records = serializeForTraining(feedbackList);
      return records.map(r => JSON.stringify(r)).join('\n');
    }

    // ─── ACTION: Export feedback ───────────────────────────────────────────
    if (action === 'export') {
      const feedback = await base44.asServiceRole.entities.UserFeedback.filter(
        { project_id, processed_for_training: false },
        '-created_date',
        limit
      );

      if (feedback.length === 0) {
        return Response.json({
          success: true,
          message: 'No feedback available',
          records: [],
        });
      }

      const training = serializeForTraining(feedback);
      return Response.json({
        success: true,
        records_count: training.length,
        records: training,
      });
    }

    // ─── ACTION: Export as CSV ────────────────────────────────────────────
    if (action === 'export_csv') {
      const feedback = await base44.asServiceRole.entities.UserFeedback.filter(
        { project_id },
        '-created_date',
        limit
      );

      const csv = generateTrainingCSV(feedback);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="training_data_${project_id}.csv"`,
        },
      });
    }

    // ─── ACTION: Export as JSONL ──────────────────────────────────────────
    if (action === 'export_jsonl') {
      const feedback = await base44.asServiceRole.entities.UserFeedback.filter(
        { project_id },
        '-created_date',
        limit
      );

      const jsonl = generateTrainingJSONL(feedback);
      return new Response(jsonl, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': `attachment; filename="training_data_${project_id}.jsonl"`,
        },
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[trainLearningModel]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});