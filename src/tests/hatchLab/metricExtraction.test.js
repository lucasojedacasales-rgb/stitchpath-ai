/**
 * metricExtraction.test.js — Hatch Lab (P0)
 * Uses minimal synthetic objects: the existing embroidery fixtures produce
 * bitmaps + regions for the real motor and are not modified or executed here.
 */

import { extractMetrics } from '@/lib/hatchLab/bench/extractMetrics';
import { UNAVAILABLE } from '@/lib/hatchLab/bench/metricAvailability';

const square = (o = 0) => [[o, o], [o + 0.1, o], [o + 0.1, o + 0.1], [o, o + 0.1]];

const fullResult = {
  regions: [
    { id: 'r1', color: '#DC2828', type: 'fill', path_points: square(0), area_mm2: 100, holes: [] },
    { id: 'r2', color: '#dc2828', type: 'fill', path_points: square(0.2), area_mm2: 300, holes: [[/* one hole */]] },
    { id: 'r3', color: '#000000', type: 'contour', stitch_type: 'running_stitch', path_points: square(0.4), area_mm2: 20, holes: [] },
  ],
  commands: [
    { type: 'jump', x: 0, y: 0 },
    { type: 'stitch', x: 1, y: 1 },
    { type: 'stitch', x: 2, y: 2 },
    { type: 'colorChange' },
    { type: 'trim' },
    { type: 'end' },
  ],
  stageLog: [{ stage: 'contour_engine', ms: 120, ok: true }, { stage: 'region_builder', ms: 80, ok: true }],
  warnings: ['w1'],
  errors: [],
};

export function runMetricExtractionTests() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  const m = extractMetrics(fullResult, { smallRegionAreaThreshold: 50 });
  ok(m.regionCount === 3, `regionCount ${m.regionCount}`);
  ok(m.fillRegionCount === 2, `fillRegionCount ${m.fillRegionCount}`);
  ok(m.contourRegionCount === 1, `contourRegionCount ${m.contourRegionCount}`);
  ok(m.colorCount === 2, `colorCount should be case-insensitive, got ${m.colorCount}`);
  ok(Array.isArray(m.orderedRegionIds) && m.orderedRegionIds.join() === 'r1,r2,r3', 'orderedRegionIds wrong');
  ok(m.explicitHoleCount === 1, `explicitHoleCount ${m.explicitHoleCount}`);
  ok(m.smallRegionCount === 1, `smallRegionCount ${m.smallRegionCount}`);
  ok(m.totalArea === 420, `totalArea ${m.totalArea}`);
  ok(m.minimumRegionArea === 20 && m.maximumRegionArea === 300, 'min/max area wrong');
  ok(m.stitchCount === 2 && m.jumpCount === 1 && m.trimCount === 1 && m.colorChangeCount === 1, 'command counts wrong');
  ok(m.commandCount === 6, `commandCount ${m.commandCount}`);
  ok(m.processingTimeMs === 200, `processingTimeMs from stageLog ${m.processingTimeMs}`);
  ok(m.warningCount === 1 && m.errorCount === 0, 'warning/error counts wrong');

  // partial data: regions only, no commands
  const partial = extractMetrics({ regions: fullResult.regions });
  ok(partial.regionCount === 3, 'partial regionCount wrong');
  ok(partial.stitchCount === UNAVAILABLE, 'missing commands must be unavailable, not 0');
  ok(partial.processingTimeMs === UNAVAILABLE, 'missing timing must be unavailable');

  // explicit empty command list is a known zero, not unavailable
  const empty = extractMetrics({ regions: [], commands: [] });
  ok(empty.commandCount === 0 && empty.stitchCount === 0, 'empty command array must report 0');
  ok(empty.regionCount === 0, 'empty region array must report 0');
  ok(empty.colorCount === UNAVAILABLE, 'no colors available must be unavailable, not 0');

  // no holes declared anywhere → unavailable, never inferred
  const noHoles = extractMetrics({ regions: [{ id: 'a', color: '#fff', path_points: square(0), area_mm2: 5 }] });
  ok(noHoles.explicitHoleCount === UNAVAILABLE, 'hole count must not be inferred');

  // garbage input
  const none = extractMetrics(null);
  ok(none.regionCount === UNAVAILABLE && none.commandCount === UNAVAILABLE, 'null input must yield unavailable metrics');

  return { name: 'hatchLab/metricExtraction', pass: fails.length === 0, fails };
}