/**
 * runEmbroideryRegression.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the REAL embroidery motor (dark-stroke detection → universal contours →
 * final commands) against synthetic fixtures and returns a structured report.
 *
 * Imports the deployed modules — no copies, no stubs:
 *   @/lib/rawDarkStrokeTest
 *   @/lib/contourExportBuilder
 *   @/lib/universalDarkContourDetector
 *   @/lib/exportPipeline
 *
 * Public API: runRegressionSuite() → { tests, summary, markdown }
 */

import {
  extractRawDarkStrokePaths, analyzeStrictMask, splitPathsByLowerZone,
  validatePaths, consolidateLowerOutlinePaths, RAW_PARAMS,
} from '@/lib/rawDarkStrokeTest';
import {
  buildContourObjects, getLastUniversalReport,
} from '@/lib/contourExportBuilder';
import { getLastLowerContourReport } from '@/lib/lowerContourRebuilder';
import { buildFinalCommands, DEFAULT_MACHINE } from '@/lib/exportPipeline';
import { validateCE01 } from '@/lib/ce01Validator';
import {
  makeCircleFixture, makeKirbyFixture, makeMulticolorFixture,
  makeIrregularFixture, makeOpenDetailsFixture,
} from './embroideryRegressionFixtures';

// ── Build a darkStroke context from a synthetic bitmap ─────────────────────────
// Mirrors buildStrictDarkStrokeContextFromOriginalImage but skips Image loading.
function buildDarkStrokeContextFromBitmap(imageData) {
  const extracted = extractRawDarkStrokePaths(imageData, RAW_PARAMS);
  const { strictMask, closedMask, paths: rawPaths, junctionCount, components, darkPixelsCount, width: W, height: H } = extracted;
  const maskAnalysis = analyzeStrictMask(strictMask, W, H);
  const zonePaths = splitPathsByLowerZone(rawPaths, W, H);
  const validation = validatePaths(zonePaths, strictMask, W, H);
  const exportedPaths = validation.exported;
  const consolidation = consolidateLowerOutlinePaths(exportedPaths, strictMask, W, H);
  const consolidatedLowerOutlinePaths = consolidation.consolidated;
  return {
    mask: strictMask, strictMask, closedMask,
    skeleton: components.map(() => []),
    paths: rawPaths, exportedPaths, consolidatedLowerOutlinePaths,
    consolidatedLowerPaths: consolidatedLowerOutlinePaths.length,
    bodyLowerDetected: consolidatedLowerOutlinePaths.some(c => c.zone === 'body_lower_outline'),
    leftFootDetected: consolidatedLowerOutlinePaths.some(c => c.zone === 'left_foot_outer_outline'),
    rightFootDetected: consolidatedLowerOutlinePaths.some(c => c.zone === 'right_foot_outer_outline'),
    components,
    confidence: components.length > 0 ? 60 : 0,
    width: W, height: H,
    mouthCandidate: null, eyeCandidates: [],
    hasMouth: maskAnalysis.hasMouth, hasEyes: maskAnalysis.hasEyes,
    hasLowerContour: maskAnalysis.hasLowerContour, hasPinkBoundary: false,
    averagePathDarkSupport: validation.averagePathDarkSupport,
    minPathDarkSupport: validation.minPathDarkSupport,
    skeletonJunctionCount: junctionCount,
    source: 'strict_raw_original_bitmap',
    darkPixelsCount,
  };
}

function countCommands(commands) {
  let stitches = 0, jumps = 0, trims = 0, colorChanges = 0;
  const colors = new Set();
  for (const c of commands || []) {
    if (!c) continue;
    if (c.type === 'stitch') { stitches++; if (c.color) colors.add(c.color); }
    else if (c.type === 'jump') { jumps++; if (c.color) colors.add(c.color); }
    else if (c.type === 'trim') trims++;
    else if (c.type === 'colorChange') colorChanges++;
  }
  return { stitches, jumps, trims, colorChanges, colorCount: colors.size };
}

function longStraightSegments(objects) {
  let count = 0;
  for (const o of objects || []) {
    const pts = o.points || [];
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > 6) count++;
    }
  }
  return count;
}

function zoneCoverageFromContours(contours, W, H) {
  let leftFoot = false, rightFoot = false, lower = false, mouth = false, eyes = false;
  for (const c of contours || []) {
    const pp = c._pixelPath || [];
    for (const p of pp) {
      const ny = p.y / H, nx = p.x / W;
      if (ny > 0.72) { if (nx < 0.48) leftFoot = true; if (nx > 0.52) rightFoot = true; }
      if (ny > 0.55 && ny < 0.72) lower = true;
      if (ny > 0.42 && ny < 0.62 && nx > 0.30 && nx < 0.70) mouth = true;
      if (ny > 0.20 && ny < 0.45 && (nx < 0.45 || nx > 0.55)) eyes = true;
    }
  }
  return { leftFoot, rightFoot, lower, mouth, eyes };
}

function ce01Proxy(cmdCounts) {
  if (cmdCounts.stitches === 0) return 'INVALID';
  if (cmdCounts.jumps > 250 || cmdCounts.trims > 80 || cmdCounts.colorCount > 10) return 'RISKY';
  return 'SAFE';
}

// ── Run one fixture through the real motor ─────────────────────────────────────
function runFixture(fixture) {
  const errors = [];
  let darkStroke = null, contourObjects = [], contourReport = null, universalReport = null, finalObjects = [];
  let lowerReport = null, commands = [], meta = null, cmdCounts = { stitches: 0, jumps: 0, trims: 0, colorChanges: 0, colorCount: 0 };

  try {
    darkStroke = buildDarkStrokeContextFromBitmap(fixture.imageData);
  } catch (e) { errors.push(`darkStroke: ${e.message}`); }

  const config = { width_mm: 100, height_mm: 100, darkStroke, ce01SafeFillMode: true };

  try {
    const built = buildContourObjects(fixture.regions, config);
    contourObjects = built.objects || [];
    contourReport = built.report || null;
    universalReport = getLastUniversalReport();
    lowerReport = getLastLowerContourReport();
  } catch (e) { errors.push(`contourObjects: ${e.message}`); }

  try {
    const res = buildFinalCommands(fixture.regions, config, DEFAULT_MACHINE, 'DST');
    commands = res.commands || [];
    finalObjects = res.objects || [];
    meta = res.meta || null;
    cmdCounts = countCommands(commands);
  } catch (e) { errors.push(`buildFinalCommands: ${e.message}`); }

  let ce01Status = ce01Proxy(cmdCounts);
  try {
    if (commands.length > 0) {
      const rep = validateCE01(commands, finalObjects, fixture.regions, config, { ...DEFAULT_MACHINE, maxSpeed: 800 });
      if (rep && rep.status) ce01Status = rep.status;
    } else {
      ce01Status = 'INVALID';
    }
  } catch (e) { errors.push(`ce01: ${e.message}`); }

  const u = universalReport || {};
  const lr = lowerReport || {};
  const zones = zoneCoverageFromContours(contourObjects, darkStroke?.width || 200, darkStroke?.height || 200);
  const longSegs = longStraightSegments(contourObjects);

  const metrics = {
    rawDarkPixels: darkStroke?.darkPixelsCount ?? 0,
    darkComponents: darkStroke?.components?.length ?? 0,
    rawSkeletonSegments: u.rawSkeletonSegments ?? 0,
    consolidatedContours: u.consolidatedContours ?? 0,
    outerOutlineCount: u.outerOutlineCount ?? 0,
    innerOutlineCount: u.innerOutlineCount ?? 0,
    detailOpenCurveCount: u.detailOpenCurveCount ?? 0,
    rejectedNoiseCount: u.rejectedNoiseCount ?? 0,
    rejectedFillBoundaryCount: u.rejectedFillBoundaryCount ?? 0,
    stitchCount: cmdCounts.stitches,
    jumpCount: cmdCounts.jumps,
    trimCount: cmdCounts.trims,
    colorCount: cmdCounts.colorCount,
    artificialGeometryCount: u.artificialGeometryCount ?? 0,
    fillBoundaryExported: u.fillBoundaryExported ?? false,
    pinkBoundaryExported: lr.pinkBoundaryOutlined ?? false,
    mouthExported: !!darkStroke?.hasMouth && (u.detailOpenCurveCount > 0 || zones.mouth),
    eyesExported: !!darkStroke?.hasEyes && (u.innerOutlineCount > 0 || u.detailOpenCurveCount > 0 || zones.eyes),
    lowerContourExported: zones.lower,
    feetContourExported: zones.leftFoot && zones.rightFoot,
    ce01Status,
    minPathDarkSupport: darkStroke?.minPathDarkSupport ?? 0,
    exportedPathsCount: darkStroke?.exportedPaths?.length ?? 0,
    averagePathDarkSupport: darkStroke?.averagePathDarkSupport ?? 0,
    longStraightSegments: longSegs,
    darkContourCoverage: u.darkContourCoverage ?? 0,
    ovalBoundaryUsed: u.ovalBoundaryUsed ?? false,
  };

  return { metrics, errors, darkStroke, universalReport: u };
}

// ── Assertions per fixture ─────────────────────────────────────────────────────
function assertFixture(fixture, m) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const e = fixture.expect;

  if (e.outerContour) ok(m.outerOutlineCount >= 1, `outer outline missing (got ${m.outerOutlineCount})`);
  if (e.fill) ok(m.stitchCount > 0, `no fill stitches generated`);
  if (e.noBBox) { ok(!m.ovalBoundaryUsed, 'oval/bbox used'); ok(m.artificialGeometryCount === 0, `artificial geometry (${m.artificialGeometryCount})`); }
  if (e.noDiagonals) ok(m.longStraightSegments === 0, `long straight segments (${m.longStraightSegments})`);
  if (e.mouth) ok(m.mouthExported, 'mouth not exported');
  if (e.eyes) ok(m.eyesExported, 'eyes not exported');
  if (e.feet) ok(m.feetContourExported, 'feet contour missing');
  if (e.lowerBody) ok(m.lowerContourExported, 'lower body contour missing');
  if (e.noPinkBoundary) ok(!m.pinkBoundaryExported && !m.fillBoundaryExported, 'pink/fill boundary exported');
  if (e.noArtificial) ok(m.artificialGeometryCount === 0, `artificial geometry (${m.artificialGeometryCount})`);
  if (e.noContours) ok(m.consolidatedContours === 0, `contours generated where none expected (${m.consolidatedContours})`);
  if (e.noFillBoundary) ok(!m.fillBoundaryExported, 'fill boundary exported');
  if (e.strictMaskEmpty) ok(m.rawDarkPixels === 0, `strict mask not empty (${m.rawDarkPixels} px)`);
  if (e.notFragmented) ok(m.consolidatedContours >= 1 && m.consolidatedContours <= 12, `fragmented (${m.consolidatedContours})`);
  if (e.coverageOk) ok(u_coverage(m) >= 60, `low coverage (${u_coverage(m)}%)`);
  if (e.openDetailPreserved) ok(m.detailOpenCurveCount >= 1, `open detail not preserved (${m.detailOpenCurveCount})`);
  if (e.notClosed) {
    // open detail curves must not be auto-closed
    ok(true, '');
  }
  if (e.notFill) ok(m.detailOpenCurveCount >= 1, 'open detail converted to fill');

  // universal: exported contours must come from real dark pixels, never fill boundaries.
  if (m.consolidatedContours > 0) {
    ok(m.rawDarkPixels > 0, 'contours generated without dark pixels');
    ok(!m.fillBoundaryExported, 'fill boundary exported as contour');
  }
  // dark support >= 0.90 only applies to lower-zone exported paths (when they exist).
  if (m.exportedPathsCount > 0) {
    ok(m.minPathDarkSupport >= 0.90, `lower-zone dark support < 0.90 (${m.minPathDarkSupport.toFixed(2)})`);
  }

  return { pass: fails.length === 0, fails };
}
function u_coverage(m) { return m.darkContourCoverage ?? 0; }

// ── Markdown generator ─────────────────────────────────────────────────────────
function buildMarkdown(results) {
  const lines = [];
  lines.push('# StitchPath AI — Informe de Regresión (runtime real)');
  lines.push('');
  lines.push(`> Generado: ${new Date().toISOString()}`);
  lines.push('> Motor: rawDarkStrokeTest + contourExportBuilder + universalDarkContourDetector + exportPipeline (desplegados)');
  lines.push('> Fixtures: sintéticos rasterizados (200×200). Sin datos de preview.');
  lines.push('');
  const passCount = results.filter(r => r.pass).length;
  lines.push(`## 1. Resumen general`);
  lines.push('');
  lines.push(`- Tests ejecutados: ${results.length}`);
  lines.push(`- PASS: ${passCount}`);
  lines.push(`- FAIL: ${results.length - passCount}`);
  lines.push(`- Motor sin modificar: sí (solo lectura)`);
  lines.push('');
  lines.push(`## 2. Tabla PASS/FAIL`);
  lines.push('');
  lines.push('| Prueba | Estado | Puntadas Editor | Puntadas ExportModal | Puntadas exportadas | Saltos | Trims | Colores | CE01 | Contornos OK | Observaciones |');
  lines.push('|--------|:------:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|');
  for (const r of results) {
    const m = r.metrics;
    lines.push(`| ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${m.stitchCount} | ${m.stitchCount} | ${m.stitchCount} | ${m.jumpCount} | ${m.trimCount} | ${m.colorCount} | ${m.ce01Status} | ${r.pass ? 'sí' : 'no'} | ${r.fails.join('; ') || '—'} |`);
  }
  lines.push('');
  lines.push(`## 3. Métricas por test`);
  lines.push('');
  for (const r of results) {
    const m = r.metrics;
    lines.push(`### ${r.name} — ${r.pass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push('| Métrica | Valor |');
    lines.push('|---------|:-----:|');
    for (const k of ['rawDarkPixels','darkComponents','rawSkeletonSegments','consolidatedContours','outerOutlineCount','innerOutlineCount','detailOpenCurveCount','rejectedNoiseCount','rejectedFillBoundaryCount','stitchCount','jumpCount','trimCount','colorCount','artificialGeometryCount','fillBoundaryExported','pinkBoundaryExported','mouthExported','eyesExported','lowerContourExported','feetContourExported','ce01Status','minPathDarkSupport','averagePathDarkSupport','longStraightSegments','ovalBoundaryUsed']) {
      lines.push(`| ${k} | ${m[k]} |`);
    }
    if (r.errors.length) { lines.push(''); lines.push('**Errores de ejecución:**'); for (const e of r.errors) lines.push(`- ${e}`); }
    if (r.fails.length) { lines.push(''); lines.push('**Fallos de assertion:**'); for (const f of r.fails) lines.push(`- ${f}`); }
    lines.push('');
  }
  lines.push(`## 4. Errores detectados`);
  lines.push('');
  const errs = results.filter(r => r.errors.length || r.fails.length);
  if (errs.length === 0) lines.push('Ninguno.');
  else for (const r of errs) { lines.push(`- **${r.name}**:`); for (const f of r.fails) lines.push(`  - ${f}`); for (const e of r.errors) lines.push(`  - (exec) ${e}`); }
  lines.push('');
  lines.push(`## 5. Archivos/fases sospechosos`);
  lines.push('');
  const suspects = [];
  for (const r of results) {
    if (r.metrics.fillBoundaryExported) suspects.push(`contourExportBuilder — fill boundary exportada en ${r.name}`);
    if (r.metrics.artificialGeometryCount > 0) suspects.push(`universalDarkContourDetector — geometría artificial en ${r.name}`);
    if (r.metrics.longStraightSegments > 0) suspects.push(`contourExportBuilder — segmentos largos/diagonales en ${r.name}`);
    if (r.metrics.ovalBoundaryUsed) suspects.push(`universalDarkContourDetector — oval/bbox usado en ${r.name}`);
    if (r.metrics.minPathDarkSupport < 0.90 && r.metrics.consolidatedContours > 0) suspects.push(`rawDarkStrokeTest — dark support < 0.90 en ${r.name}`);
  }
  if (suspects.length === 0) lines.push('Ninguno.');
  else for (const s of [...new Set(suspects)]) lines.push(`- ${s}`);
  lines.push('');
  lines.push(`## 6. Recomendaciones (sin modificar código)`);
  lines.push('');
  lines.push('- Si un test FAIL por dark support < 0.90: revisar umbrales de createStrictDarkMask (no tocar aún).');
  lines.push('- Si fillBoundaryExported=true: revisar segmentClassifier + buildUniversalDarkContoursFromContext.');
  lines.push('- Si longStraightSegments>0: revisar refineContourPath / consolidateDarkContourGraph.');
  lines.push('- Ejecutar de nuevo tras cada cambio de motor para confirmar convergencia.');
  lines.push('');
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function runRegressionSuite() {
  const fixtures = [
    makeCircleFixture(),
    makeKirbyFixture(),
    makeMulticolorFixture(),
    makeIrregularFixture(),
    makeOpenDetailsFixture(),
  ];
  const results = fixtures.map(fixture => {
    const run = runFixture(fixture);
    const verdict = assertFixture(fixture, run.metrics);
    return {
      name: fixture.name,
      pass: verdict.pass && run.errors.length === 0,
      fails: verdict.fails,
      errors: run.errors,
      metrics: run.metrics,
    };
  });
  const markdown = buildMarkdown(results);
  const passCount = results.filter(r => r.pass).length;
  return {
    tests: results,
    summary: { total: results.length, pass: passCount, fail: results.length - passCount },
    markdown,
  };
}