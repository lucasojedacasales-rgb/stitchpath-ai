/**
 * metricExtraction.test.js — Hatch Lab (P0.1)
 * Fixtures mirror the VERIFIED base-engine structures (types.js,
 * exportPipeline.flattenToCommands, runner.js logStage). Minimal synthetic
 * objects only — no productive code executed.
 */

import { extractMetrics, classifyRegion, normalizeCommandType } from '@/lib/hatchLab/bench/extractMetrics';
import { UNAVAILABLE } from '@/lib/hatchLab/bench/metricAvailability';

const square = (o = 0) => [[o, o], [o + 0.1, o], [o + 0.1, o + 0.1], [o, o + 0.1]];

// Region shapes as produced by regionBuilderStage + contour objects
const regionsFull = [
  { id: 'r_fill', color: '#DC2828', stitch_type: 'fill', path_points: square(0), area_mm2: 100, area_norm: 0.01, holes: 0 },
  { id: 'r_contour', color: '#000000', type: 'contour', stitch_type: 'running_stitch', region_class: 'outer_outline', path_points: square(0.2), area_mm2: 20, area_norm: 0.002, holes: 0 },
  { id: 'r_detail', color: '#dc2828', stitch_type: 'running_stitch', region_class: 'detail_run', path_points: square(0.4), area_mm2: 5, area_norm: 0.0005, holes: 1 },
  { id: 'r_hidden', color: '#ffffff', stitch_type: 'fill', visible: false, path_points: square(0.6), area_mm2: 50, area_norm: 0.005, holes: 0 },
];

// Command shape as produced by flattenToCommands / buildFinalCommands
const commandsFull = [
  { type: 'jump', x: 0, y: 0, color: '#dc2828', regionId: 'r_fill' },
  { type: 'stitch', x: 1, y: 1, color: '#dc2828', regionId: 'r_fill', stitchType: 'fill', source: 'clipped_fill_optimized' },
  { type: 'stitch', x: 2, y: 2, color: '#dc2828', regionId: 'r_fill', stitchType: 'fill', source: 'clipped_fill_optimized' },
  { type: 'colorChange', x: 2, y: 2, color: '#000000', regionId: 'r_contour' },
  { type: 'trim', x: 2, y: 2, color: '#000000', regionId: 'r_contour' },
  { type: 'end', x: 2, y: 2, color: null },
];

// stageLog shape as produced by types.js logStage (+ runner error attach)
const stageLogFull = [
  { stage: 'contour_engine', durationMs: 120, ok: true, ts: 1 },
  { stage: 'region_builder', durationMs: 80, ok: false, ts: 2, error: 'boom' },
];

export function runMetricExtractionTests() {
  const fails = [];
  let checks = 0;
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

  // ── classification: mutually exclusive ──
  ok(classifyRegion(regionsFull[0]) === 'fill', 'fill region misclassified');
  ok(classifyRegion(regionsFull[1]) === 'contour', 'contour region misclassified');
  ok(classifyRegion(regionsFull[2]) === 'detail', 'detail region misclassified');
  ok(classifyRegion(regionsFull[3]) === 'discarded', 'invisible region not discarded');
  // bare running_stitch without contour/outline confirmation → unknown, never contour
  ok(classifyRegion({ id: 'x', color: '#111111', stitch_type: 'running_stitch', path_points: square(0) }) === 'unknown',
    'bare running_stitch wrongly auto-classified as contour');

  const full = extractMetrics({ regions: regionsFull, commands: commandsFull, stageLog: stageLogFull, warnings: ['w1'], errors: [] },
    { smallRegionAreaThresholdMm2: 50 });
  const m = full.metrics, av = full.availability;

  ok(m.regionCount === 4, `regionCount ${m.regionCount}`);
  ok(m.fillRegionCount === 1 && m.contourRegionCount === 1 && m.detailRegionCount === 1 && m.discardedRegionCount === 1,
    `exclusive classification broken: fill=${m.fillRegionCount} contour=${m.contourRegionCount} detail=${m.detailRegionCount} discarded=${m.discardedRegionCount}`);
  ok(m.fillRegionCount + m.contourRegionCount + m.detailRegionCount + m.discardedRegionCount + m.unknownRegionTypeCount === m.regionCount,
    'classification counts do not sum to regionCount');
  ok(m.unknownRegionTypeCount === 0 && m.classifiedRegionCoverage === 1, 'coverage wrong for fully classified set');

  // colors (case-insensitive, active regions only)
  ok(m.colorCount === 2 && av.colorCount.complete, `colorCount ${m.colorCount} complete=${av.colorCount.complete}`);
  ok(m.colorCoverage === 1, `colorCoverage ${m.colorCoverage}`);

  // holes — all active regions declare numeric holes → complete
  ok(m.explicitHoleCount === 1 && av.explicitHoleCount.complete && m.holeCoverage === 1,
    `holes: count=${m.explicitHoleCount} complete=${av.explicitHoleCount.complete} coverage=${m.holeCoverage}`);

  // areas mm² — active only, units never mixed
  ok(m.totalAreaMm2 === 125 && m.minimumRegionAreaMm2 === 5 && m.maximumRegionAreaMm2 === 100,
    `mm² areas wrong: total=${m.totalAreaMm2} min=${m.minimumRegionAreaMm2} max=${m.maximumRegionAreaMm2}`);
  ok(av.totalAreaMm2.unit === 'mm2' && av.totalAreaNormalized.unit === 'normalized', 'units not declared');
  ok(Math.abs(m.totalAreaNormalized - 0.0125) < 1e-9, `normalized area ${m.totalAreaNormalized}`);
  ok(m.smallRegionCount === 2 && av.smallRegionCount.source.includes('mm²'), `smallRegionCount ${m.smallRegionCount} (${av.smallRegionCount.source})`);

  // commands — verified types
  ok(m.stitchCount === 2 && m.jumpCount === 1 && m.trimCount === 1 && m.colorChangeCount === 1 && m.endCount === 1 && m.stopCount === 0,
    'command counts wrong');
  ok(m.commandCount === 6 && m.unknownCommandCount === 0 && m.commandRecognitionCoverage === 1, 'command coverage wrong');
  ok(av.stitchCount.complete === true, 'stitchCount should be complete with recognized commands');

  // stageLog
  ok(m.stageFailureCount === 1 && m.completedStageCount === 1 && m.unavailableStageTimingCount === 0, 'stageLog metrics wrong');
  ok(m.processingTimeMs === 200 && av.processingTimeMs.complete, `processingTimeMs ${m.processingTimeMs}`);
  ok(m.warningCount === 1 && m.errorCount === 0, 'warning/error counts wrong');

  // ── unit mixing forbidden: mm² incomplete → all mm² metrics unavailable ──
  const mixed = extractMetrics({ regions: [regionsFull[0], { id: 'nomm', color: '#123456', stitch_type: 'fill', path_points: square(0.3), area_norm: 0.003 }] });
  ok(mixed.metrics.totalAreaMm2 === UNAVAILABLE, 'mm² total computed from mixed units');
  ok(mixed.availability.totalAreaMm2.reason.includes('never mixed'), 'unit-mixing reason missing');
  ok(mixed.metrics.totalAreaNormalized !== UNAVAILABLE, 'normalized total should still be computable from area_norm');

  // ── missing colors → incomplete, never a definitive total ──
  const noColor = extractMetrics({ regions: [regionsFull[0], { id: 'nc', stitch_type: 'fill', path_points: square(0.3), area_mm2: 10, area_norm: 0.001, holes: 0 }] });
  ok(noColor.availability.colorCount.complete === false, 'colorCount marked complete with missing colors');
  ok(noColor.metrics.colorCoverage === 0.5, `colorCoverage ${noColor.metrics.colorCoverage}`);

  // ── partial holes → incomplete ──
  const partialHoles = extractMetrics({ regions: [regionsFull[2], { id: 'nh', color: '#123456', stitch_type: 'fill', path_points: square(0.3), area_mm2: 10, area_norm: 0.001 }] });
  ok(partialHoles.availability.explicitHoleCount.available && partialHoles.availability.explicitHoleCount.complete === false,
    'partial hole declaration presented as complete total');
  ok(partialHoles.metrics.holeCoverage === 0.5, `holeCoverage ${partialHoles.metrics.holeCoverage}`);
  // no holes declared at all → unavailable, never inferred
  const noHoles = extractMetrics({ regions: [{ id: 'a', color: '#ffffff', stitch_type: 'fill', path_points: square(0), area_mm2: 5, area_norm: 0.001 }] });
  ok(noHoles.metrics.explicitHoleCount === UNAVAILABLE, 'hole count must not be inferred');

  // ── zero vs unavailable ──
  const empty = extractMetrics({ regions: [], commands: [] });
  ok(empty.metrics.regionCount === 0, 'empty regions must be 0');
  ok(empty.metrics.colorCount === 0, 'empty regions → colorCount must be 0');
  ok(empty.metrics.stitchCount === 0 && empty.metrics.commandCount === 0, 'empty commands must be 0');
  const noCommands = extractMetrics({ regions: regionsFull });
  ok(noCommands.metrics.stitchCount === UNAVAILABLE, 'absent commands field must be unavailable, not 0');
  ok(noCommands.availability.stitchCount.available === false, 'availability must flag absent commands');

  // ── unknown commands ──
  ok(normalizeCommandType('stitch') === 'stitch' && normalizeCommandType('stop') === 'stop', 'verified type not recognized');
  ok(normalizeCommandType('needle_down') === 'unknown', 'unverified type not mapped to unknown');
  const withUnknown = extractMetrics({ commands: [...commandsFull, { type: 'needle_down', x: 0, y: 0 }] });
  ok(withUnknown.metrics.unknownCommandCount === 1, 'unknownCommandCount wrong');
  ok(withUnknown.metrics.commandRecognitionCoverage < 1, 'recognition coverage must drop');
  ok(withUnknown.availability.stitchCount.complete === false, 'command-derived metric must be incomplete with unknown types');
  ok(withUnknown.warnings.some(w => w.includes('needle_down')), 'unknown command type not reported in warnings');

  // garbage input
  const none = extractMetrics(null);
  ok(none.metrics.regionCount === UNAVAILABLE && none.metrics.commandCount === UNAVAILABLE, 'null input must yield unavailable metrics');

  return { name: 'hatchLab/metricExtraction', pass: fails.length === 0, fails, checks };
}