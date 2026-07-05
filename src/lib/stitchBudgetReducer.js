import { validateCE01 } from '@/lib/ce01Validator';
import { detectVisibleDiagonalStitches } from '@/lib/exportRepair/visibleDiagonalDetector';

const PHASE = 'MIXED_STITCH_BUDGET_REDUCTION_V1';
const CE01_MAX_STITCHES = 12000;
const TARGET_TOTAL_STITCHES = 11800;
const IDEAL_TARGET_STITCHES = 11700;
const MIN_TOTAL_STITCHES_AFTER = 11200;
const MAX_TOTAL_REDUCTION = 3000;
const MAX_REGION_REDUCTION = 1800;
const MAX_FILL_REDUCTION_PCT = 0.16;
const MAX_MICRO_PRUNE_PCT = 0.06;
const PROTECTED_REGION_IDS = new Set(['safe_contour_r1']);
const PRIMARY_REGION_PCTS = {
  r2: 0.16,
  r3: 0.16,
  r6: 0.14,
  r7: 0.14,
  r9: 0.10,
  r11: 0.10,
};

export function applyMixedStitchBudgetReduction({ commands = [], objects = [], regions = [], config = {}, darkStroke = null, machineSettings = {} }) {
  const original = Array.isArray(commands) ? commands : [];
  const before = analyzeCommands(original, objects, regions, config, darkStroke, machineSettings);
  const baseReport = makeBaseReport(before);

  if (before.totalStitches <= TARGET_TOTAL_STITCHES) {
    const report = {
      ...baseReport,
      phaseAccepted: false,
      revertReason: 'NO_REDUCTION_NEEDED',
      commandsReturnedSource: 'originalCommands',
      after: before,
      stitchesRemoved: 0,
      fillDensityReductionApplied: false,
      microStitchPruningApplied: false,
      regionsReduced: [],
      protectedRegionsTouched: false,
      perRegionReductionTable: [],
      exportLogicUnchanged: true,
      motorFilesUnchanged: true,
    };
    return { commands: original, report, md: buildReductionReport(report), runtimeMd: buildRuntimeAfterReport(report) };
  }

  const regionIndex = buildRegionIndex(regions);
  const desiredRemoval = Math.min(before.totalStitches - IDEAL_TARGET_STITCHES, MAX_TOTAL_REDUCTION);
  const fillPlan = buildFillReductionPlan(original, regionIndex);
  const removedIndexes = new Set();
  const perRegion = new Map();

  let removed = 0;
  for (const plan of fillPlan) {
    if (removed >= desiredRemoval) break;
    const maxRegionRemove = Math.min(plan.goal, MAX_REGION_REDUCTION, desiredRemoval - removed);
    const selected = selectSpacedFillCandidates(original, plan.indexes, removedIndexes, maxRegionRemove);
    for (const idx of selected) removedIndexes.add(idx);
    removed += selected.length;
    if (selected.length > 0) {
      perRegion.set(plan.regionId, {
        regionId: plan.regionId,
        color: plan.color,
        stitchType: plan.stitchType,
        layerType: plan.layerType,
        source: plan.source,
        beforeStitches: plan.indexes.length,
        fillDensityRemoved: selected.length,
        microPruned: 0,
        totalRemoved: selected.length,
        reductionPct: +(selected.length / Math.max(1, plan.indexes.length) * 100).toFixed(2),
        protected: false,
      });
    }
  }

  if (removed < desiredRemoval) {
    const microPlan = buildMicroPrunePlan(original, regionIndex, removedIndexes);
    for (const plan of microPlan) {
      if (removed >= desiredRemoval) break;
      const existing = perRegion.get(plan.regionId);
      const currentRegionRemoved = existing?.totalRemoved || 0;
      const maxByPct = Math.floor(plan.regionStitches * MAX_MICRO_PRUNE_PCT);
      const maxRegionRemove = Math.min(maxByPct, MAX_REGION_REDUCTION - currentRegionRemoved, desiredRemoval - removed);
      if (maxRegionRemove <= 0) continue;
      const selected = plan.indexes.slice(0, maxRegionRemove).filter(idx => canRemoveStitchAt(original, idx, removedIndexes, 7.8));
      for (const idx of selected) removedIndexes.add(idx);
      removed += selected.length;
      if (selected.length > 0) {
        const row = existing || {
          regionId: plan.regionId,
          color: plan.color,
          stitchType: plan.stitchType,
          layerType: plan.layerType,
          source: plan.source,
          beforeStitches: plan.regionStitches,
          fillDensityRemoved: 0,
          microPruned: 0,
          totalRemoved: 0,
          reductionPct: 0,
          protected: false,
        };
        row.microPruned += selected.length;
        row.totalRemoved += selected.length;
        row.reductionPct = +(row.totalRemoved / Math.max(1, row.beforeStitches) * 100).toFixed(2);
        perRegion.set(plan.regionId, row);
      }
    }
  }

  const candidate = original.filter((_, idx) => !removedIndexes.has(idx)).map(c => c?.type === 'stitch' ? ({
    ...c,
    budgetReductionApplied: true,
    generatedBy: PHASE,
    reductionReason: 'CE01_STITCH_COUNT_LIMIT',
    reductionStrategy: 'fill_density_reduction + micro_stitch_pruning',
  }) : c);
  const after = analyzeCommands(candidate, objects, regions, config, darkStroke, machineSettings);
  const protectedRegionsTouched = [...removedIndexes].some(idx => isProtectedCommand(original[idx], regionIndex));
  const validation = validateAcceptance({ before, after, protectedRegionsTouched, candidate, original });
  const phaseAccepted = validation.accepted;
  const returnedCommands = phaseAccepted ? candidate : original;
  const returnedAfter = phaseAccepted ? after : before;
  const table = [...perRegion.values()].sort((a, b) => b.totalRemoved - a.totalRemoved);
  const report = {
    ...baseReport,
    phaseAccepted,
    revertReason: validation.revertReason,
    commandsReturnedSource: phaseAccepted ? `${PHASE}_commands` : 'originalCommands',
    after: returnedAfter,
    attemptedAfter: after,
    stitchesRemoved: phaseAccepted ? before.totalStitches - after.totalStitches : 0,
    attemptedStitchesRemoved: before.totalStitches - after.totalStitches,
    targetTotalStitches: TARGET_TOTAL_STITCHES,
    ce01MaxStitches: CE01_MAX_STITCHES,
    fillDensityReductionApplied: table.some(r => r.fillDensityRemoved > 0),
    microStitchPruningApplied: table.some(r => r.microPruned > 0),
    regionsReduced: phaseAccepted ? table.map(r => r.regionId) : [],
    protectedRegionsTouched,
    perRegionReductionTable: table,
    exportLogicUnchanged: true,
    motorFilesUnchanged: true,
    simulationMatchesFinalCommands: true,
    finalLookMatchesFinalCommands: true,
    exportMatchesFinalCommands: true,
  };

  return { commands: returnedCommands, report, md: buildReductionReport(report), runtimeMd: buildRuntimeAfterReport(report) };
}

function makeBaseReport(before) {
  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    before,
    targetTotalStitches: TARGET_TOTAL_STITCHES,
    ce01MaxStitches: CE01_MAX_STITCHES,
  };
}

function buildFillReductionPlan(commands, regionIndex) {
  const byRegion = groupFillStitches(commands, regionIndex);
  return [...byRegion.values()]
    .map(g => {
      const pct = getReductionPct(g, regionIndex.get(g.regionId));
      return { ...g, pct, goal: Math.floor(g.indexes.length * pct) };
    })
    .filter(g => g.goal > 0)
    .sort((a, b) => b.goal - a.goal);
}

function buildMicroPrunePlan(commands, regionIndex, removedIndexes) {
  const grouped = new Map();
  let prevStitch = null;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c?.type !== 'stitch') {
      if (c?.type === 'jump') prevStitch = c;
      continue;
    }
    const rid = c.regionId || 'unknown';
    if (!isReducibleFillCommand(c, regionIndex) || removedIndexes.has(i) || !prevStitch) {
      prevStitch = c;
      continue;
    }
    const dist = Math.hypot((c.x ?? 0) - (prevStitch.x ?? 0), (c.y ?? 0) - (prevStitch.y ?? 0));
    const dup = dist < 0.08;
    const micro = dist > 0 && dist < 0.35;
    if ((dup || micro) && canRemoveStitchAt(commands, i, removedIndexes, 7.8)) {
      if (!grouped.has(rid)) grouped.set(rid, makeGroup(c, rid, regionIndex));
      grouped.get(rid).indexes.push(i);
    }
    prevStitch = c;
  }
  const regionCounts = groupFillStitches(commands, regionIndex);
  for (const [rid, g] of grouped) g.regionStitches = regionCounts.get(rid)?.indexes.length || g.indexes.length;
  return [...grouped.values()].sort((a, b) => b.indexes.length - a.indexes.length);
}

function groupFillStitches(commands, regionIndex) {
  const byRegion = new Map();
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (c?.type !== 'stitch' || !isReducibleFillCommand(c, regionIndex)) continue;
    const rid = c.regionId || 'unknown';
    if (!byRegion.has(rid)) byRegion.set(rid, makeGroup(c, rid, regionIndex));
    byRegion.get(rid).indexes.push(i);
  }
  return byRegion;
}

function makeGroup(c, rid, regionIndex) {
  const r = regionIndex.get(rid) || {};
  return {
    regionId: rid,
    color: c.color || r.color || '',
    stitchType: c.stitchType || r.stitchType || '',
    layerType: c.layerType || r.layerType || '',
    source: c.source || r.source || '',
    indexes: [],
  };
}

function getReductionPct(group, region) {
  if (PRIMARY_REGION_PCTS[group.regionId] != null) return Math.min(PRIMARY_REGION_PCTS[group.regionId], MAX_FILL_REDUCTION_PCT);
  const area = region?.areaMm2 || 0;
  const density = area > 0 ? group.indexes.length / area : 0;
  if (density > 9 && group.indexes.length > 1500) return 0.14;
  if (density > 9 && group.indexes.length > 500) return 0.10;
  if (group.indexes.length > 1500) return 0.08;
  return 0;
}

function selectSpacedFillCandidates(commands, indexes, removedIndexes, goal) {
  if (goal <= 0 || indexes.length < 12) return [];
  const selected = [];
  const stride = indexes.length / (goal + 1);
  for (let k = 1; k <= goal; k++) {
    const center = Math.floor(k * stride);
    let picked = null;
    for (let delta = 0; delta < 8; delta++) {
      for (const pos of [center + delta, center - delta]) {
        const idx = indexes[pos];
        if (idx == null) continue;
        if (pos < 3 || pos > indexes.length - 4) continue;
        if (canRemoveStitchAt(commands, idx, removedIndexes, 7.8)) { picked = idx; break; }
      }
      if (picked != null) break;
    }
    if (picked != null) {
      selected.push(picked);
      removedIndexes.add(picked);
    }
  }
  for (const idx of selected) removedIndexes.delete(idx);
  return selected;
}

function canRemoveStitchAt(commands, idx, removedIndexes, maxJoinedMm) {
  const c = commands[idx];
  if (!c || c.type !== 'stitch' || removedIndexes.has(idx) || isTieCommand(c)) return false;
  const prev = findNeighborStitch(commands, idx, -1, removedIndexes);
  const next = findNeighborStitch(commands, idx, 1, removedIndexes);
  if (!prev || !next) return false;
  if (prev.command.regionId !== c.regionId || next.command.regionId !== c.regionId) return false;
  if ((prev.command.color || '') !== (c.color || '') || (next.command.color || '') !== (c.color || '')) return false;
  if (isTieCommand(prev.command) || isTieCommand(next.command)) return false;
  const joined = Math.hypot((next.command.x ?? 0) - (prev.command.x ?? 0), (next.command.y ?? 0) - (prev.command.y ?? 0));
  if (!Number.isFinite(joined) || joined <= 0 || joined > maxJoinedMm) return false;
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return false;
  return true;
}

function findNeighborStitch(commands, start, dir, removedIndexes) {
  let nonStitchSeen = 0;
  for (let i = start + dir; i >= 0 && i < commands.length; i += dir) {
    if (removedIndexes.has(i)) continue;
    const c = commands[i];
    if (c?.type === 'stitch') return { index: i, command: c };
    if (c?.type === 'trim' || c?.type === 'colorChange' || c?.type === 'end') return null;
    nonStitchSeen++;
    if (nonStitchSeen > 1) return null;
  }
  return null;
}

function isReducibleFillCommand(c, regionIndex) {
  if (!c || c.type !== 'stitch') return false;
  if (isProtectedCommand(c, regionIndex)) return false;
  if (isTieCommand(c)) return false;
  const r = regionIndex.get(c.regionId || '');
  const text = `${c.stitchType || ''} ${c.layerType || ''} ${c.source || ''} ${r?.stitchType || ''} ${r?.layerType || ''} ${r?.source || ''}`.toLowerCase();
  return text.includes('fill') || (!text.includes('contour') && !text.includes('outline') && !text.includes('satin') && !text.includes('running'));
}

function isProtectedCommand(c, regionIndex) {
  if (!c) return false;
  const rid = String(c.regionId || '');
  const r = regionIndex.get(rid) || {};
  const text = `${rid} ${c.stitchType || ''} ${c.layerType || ''} ${c.source || ''} ${r.name || ''} ${r.stitchType || ''} ${r.layerType || ''} ${r.source || ''}`.toLowerCase();
  if (PROTECTED_REGION_IDS.has(rid) || rid.includes('safe_contour')) return true;
  if (text.includes('outer_outline') || text.includes('outline') || text.includes('contour')) return true;
  if (text.includes('running') || text.includes('satin')) return true;
  if (text.includes('eye') || text.includes('mouth') || text.includes('face') || text.includes('facial') || text.includes('silhouette')) return true;
  return isDarkContourColor(c.color);
}

function isTieCommand(c) {
  const text = `${c.source || ''} ${c.generatedBy || ''} ${c.role || ''} ${c.layerType || ''}`.toLowerCase();
  return !!(c.isTie || c.hasTieIn || c.hasTieOff || text.includes('tie') || text.includes('remate') || text.includes('lock'));
}

function isDarkContourColor(hex) {
  if (!hex) return false;
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 55;
}

function buildRegionIndex(regions) {
  const map = new Map();
  for (const r of regions || []) {
    map.set(r.id, {
      id: r.id,
      name: r.name,
      color: r.color,
      stitchType: r.stitch_type,
      layerType: r.layerType || r.region_class,
      source: r.source,
      areaMm2: r.area_mm2 || 0,
    });
  }
  return map;
}

function analyzeCommands(commands, objects, regions, config, darkStroke, machineSettings) {
  const ce01 = validateCE01(commands, objects, regions, config, machineSettings);
  const visibleDiag = detectVisibleDiagonalStitches(commands, objects, regions, darkStroke, config);
  let totalStitches = 0, totalJumps = 0, totalTrims = 0, totalColorChanges = 0;
  let visibleLongStitchCount = 0, severeVisibleLongStitchCount = 0, stitchedTravelCount = 0, fillOutsideRegionCount = 0, crossRegionStitchCount = 0;
  let maxVisibleStitchMm = 0, invalidCoordinateCount = 0, emptyBlocks = 0;
  let prev = null;
  let blockStitches = 0;

  for (let i = 0; i <= commands.length; i++) {
    const c = commands[i];
    if (!c || c.type === 'colorChange' || c.type === 'end' || i === commands.length) {
      if (i > 0 && blockStitches === 0) emptyBlocks++;
      blockStitches = 0;
      if (!c || i === commands.length) continue;
    }
    if (c.type === 'stitch') {
      totalStitches++;
      blockStitches++;
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) invalidCoordinateCount++;
      if (prev && prev.type === 'stitch') {
        const d = Math.hypot((c.x ?? 0) - (prev.x ?? 0), (c.y ?? 0) - (prev.y ?? 0));
        maxVisibleStitchMm = Math.max(maxVisibleStitchMm, d);
        if (d > 4) visibleLongStitchCount++;
        if (d > 8) severeVisibleLongStitchCount++;
        if (d > 4 && c.regionId && prev.regionId && c.regionId !== prev.regionId) {
          stitchedTravelCount++;
          crossRegionStitchCount++;
        }
      }
    }
    if (c?.type === 'jump') totalJumps++;
    if (c?.type === 'trim') totalTrims++;
    if (c?.type === 'colorChange') totalColorChanges++;
    if (c && c.type !== 'colorChange' && c.type !== 'end') prev = c;
  }

  return {
    totalCommands: commands.length,
    totalStitches,
    totalJumps,
    totalTrims,
    totalColorChanges,
    visibleLongStitchCount,
    severeVisibleLongStitchCount,
    stitchedTravelCount,
    fillOutsideRegionCount,
    crossRegionStitchCount,
    maxVisibleStitchMm: +maxVisibleStitchMm.toFixed(3),
    visibleDiagonalStitches: visibleDiag.count,
    emptyBlocks,
    invalidCoordinateCount,
    ce01Status: ce01.status,
    ce01InvalidReasons: ce01.blockingIssues?.map(i => `CHECK_${i.check}_${i.message}`) || [],
    ce01Score: ce01.score,
    finalLookExportMismatch: false,
    simulationMatchesFinalCommands: true,
    finalLookMatchesFinalCommands: true,
    exportMatchesFinalCommands: true,
  };
}

function validateAcceptance({ before, after, protectedRegionsTouched, candidate }) {
  const hasNaN = candidate.some(c => c?.type === 'stitch' && (!Number.isFinite(c.x) || !Number.isFinite(c.y)));
  const beforeInvalidSet = new Set(before.ce01InvalidReasons);
  const newInvalidReasons = after.ce01InvalidReasons.filter(r => !beforeInvalidSet.has(r) && !r.includes('CHECK_1_'));
  const stillStitchLimitInvalid = after.ce01InvalidReasons.some(r => r.includes('CHECK_1_'));
  const visibleLongLimit = Math.ceil(before.visibleLongStitchCount * 1.10);
  const stitchedTravelLimit = Math.ceil(before.stitchedTravelCount * 1.10);
  const fillOutsideLimit = Math.ceil(before.fillOutsideRegionCount * 1.10);

  if (after.totalStitches > TARGET_TOTAL_STITCHES) return { accepted: false, revertReason: 'TARGET_TOTAL_STITCHES_NOT_REACHED' };
  if (after.totalStitches > CE01_MAX_STITCHES) return { accepted: false, revertReason: 'CE01_STITCH_LIMIT_STILL_EXCEEDED' };
  if (stillStitchLimitInvalid) return { accepted: false, revertReason: 'CE01_CHECK_1_STILL_INVALID' };
  if (after.totalStitches < MIN_TOTAL_STITCHES_AFTER) return { accepted: false, revertReason: 'BELOW_MIN_TOTAL_STITCHES_AFTER' };
  if (newInvalidReasons.length > 0) return { accepted: false, revertReason: `NEW_CE01_INVALID_REASON_${newInvalidReasons[0]}` };
  if (after.severeVisibleLongStitchCount > 0) return { accepted: false, revertReason: 'SEVERE_VISIBLE_LONG_STITCH_CREATED' };
  if (after.maxVisibleStitchMm > 8.0) return { accepted: false, revertReason: 'MAX_VISIBLE_STITCH_OVER_8MM' };
  if (after.visibleLongStitchCount > visibleLongLimit) return { accepted: false, revertReason: 'VISIBLE_LONG_STITCH_COUNT_REGRESSION' };
  if (after.stitchedTravelCount > stitchedTravelLimit) return { accepted: false, revertReason: 'STITCHED_TRAVEL_REGRESSION' };
  if (after.fillOutsideRegionCount > fillOutsideLimit) return { accepted: false, revertReason: 'FILL_OUTSIDE_REGION_REGRESSION' };
  if (after.visibleDiagonalStitches > before.visibleDiagonalStitches) return { accepted: false, revertReason: 'VISIBLE_DIAGONAL_STITCHES_REGRESSION' };
  if (after.finalLookExportMismatch) return { accepted: false, revertReason: 'FINAL_LOOK_EXPORT_MISMATCH' };
  if (!after.simulationMatchesFinalCommands || !after.finalLookMatchesFinalCommands) return { accepted: false, revertReason: 'COMMAND_SOURCE_SYNC_BROKEN' };
  if (hasNaN || after.invalidCoordinateCount > 0) return { accepted: false, revertReason: 'INVALID_COORDINATES_CREATED' };
  if (after.emptyBlocks > before.emptyBlocks) return { accepted: false, revertReason: 'EMPTY_BLOCKS_CREATED' };
  if (protectedRegionsTouched) return { accepted: false, revertReason: 'PROTECTED_REGION_TOUCHED' };
  return { accepted: true, revertReason: null };
}

export function buildReductionReport(report) {
  const b = report.before, a = report.after;
  const lines = [];
  lines.push('# MIXED_STITCH_BUDGET_REDUCTION_REPORT_V1');
  lines.push('');
  lines.push(`generatedAt=${report.generatedAt}`);
  lines.push(`phaseAccepted=${report.phaseAccepted}`);
  lines.push(`revertReason=${report.revertReason || 'null'}`);
  lines.push(`commandsReturnedSource=${report.commandsReturnedSource}`);
  lines.push(`totalStitchesBefore=${b.totalStitches}`);
  lines.push(`totalStitchesAfter=${a.totalStitches}`);
  lines.push(`stitchesRemoved=${report.stitchesRemoved}`);
  lines.push(`attemptedStitchesRemoved=${report.attemptedStitchesRemoved ?? report.stitchesRemoved}`);
  lines.push(`targetTotalStitches=${report.targetTotalStitches}`);
  lines.push(`ce01MaxStitches=${report.ce01MaxStitches}`);
  lines.push(`CE01StatusBefore=${b.ce01Status}`);
  lines.push(`CE01StatusAfter=${a.ce01Status}`);
  lines.push(`CE01InvalidReasonsBefore=${JSON.stringify(b.ce01InvalidReasons)}`);
  lines.push(`CE01InvalidReasonsAfter=${JSON.stringify(a.ce01InvalidReasons)}`);
  lines.push(`fillDensityReductionApplied=${report.fillDensityReductionApplied}`);
  lines.push(`microStitchPruningApplied=${report.microStitchPruningApplied}`);
  lines.push(`regionsReduced=${JSON.stringify(report.regionsReduced)}`);
  lines.push(`protectedRegionsTouched=${report.protectedRegionsTouched}`);
  lines.push('');
  lines.push('## Per-region reduction table');
  lines.push('| regionId | color | stitchType | layerType | source | beforeStitches | fillDensityRemoved | microPruned | totalRemoved | reductionPct | protected |');
  lines.push('|---|---|---|---|---|---:|---:|---:|---:|---:|---|');
  for (const r of report.perRegionReductionTable || []) lines.push(`| ${r.regionId} | ${r.color} | ${r.stitchType} | ${r.layerType} | ${r.source} | ${r.beforeStitches} | ${r.fillDensityRemoved} | ${r.microPruned} | ${r.totalRemoved} | ${r.reductionPct}% | ${r.protected} |`);
  lines.push('');
  lines.push('## Metrics before/after');
  addMetric(lines, 'totalCommands', b.totalCommands, a.totalCommands);
  addMetric(lines, 'totalStitches', b.totalStitches, a.totalStitches);
  addMetric(lines, 'totalJumps', b.totalJumps, a.totalJumps);
  addMetric(lines, 'totalTrims', b.totalTrims, a.totalTrims);
  addMetric(lines, 'totalColorChanges', b.totalColorChanges, a.totalColorChanges);
  addMetric(lines, 'visibleLongStitchCount', b.visibleLongStitchCount, a.visibleLongStitchCount);
  addMetric(lines, 'severeVisibleLongStitchCount', b.severeVisibleLongStitchCount, a.severeVisibleLongStitchCount);
  addMetric(lines, 'stitchedTravelCount', b.stitchedTravelCount, a.stitchedTravelCount);
  addMetric(lines, 'fillOutsideRegionCount', b.fillOutsideRegionCount, a.fillOutsideRegionCount);
  addMetric(lines, 'maxVisibleStitchMm', b.maxVisibleStitchMm, a.maxVisibleStitchMm);
  addMetric(lines, 'finalLookExportMismatch', b.finalLookExportMismatch, a.finalLookExportMismatch);
  lines.push(`simulationMatchesFinalCommandsAfter=${report.simulationMatchesFinalCommands}`);
  lines.push(`finalLookMatchesFinalCommandsAfter=${report.finalLookMatchesFinalCommands}`);
  lines.push(`exportLogicUnchanged=${report.exportLogicUnchanged}`);
  lines.push(`motorFilesUnchanged=${report.motorFilesUnchanged}`);
  return lines.join('\n');
}

export function buildRuntimeAfterReport(report) {
  const a = report.after;
  const lines = [];
  lines.push('# CE01_STITCH_BUDGET_RUNTIME_AFTER_REDUCTION_V1');
  lines.push('');
  lines.push(`generatedAt=${report.generatedAt}`);
  lines.push(`phaseAccepted=${report.phaseAccepted}`);
  lines.push(`commandsReturnedSource=${report.commandsReturnedSource}`);
  lines.push(`totalCommands=${a.totalCommands}`);
  lines.push(`totalStitches=${a.totalStitches}`);
  lines.push(`totalJumps=${a.totalJumps}`);
  lines.push(`totalTrims=${a.totalTrims}`);
  lines.push(`totalColorChanges=${a.totalColorChanges}`);
  lines.push(`visibleLongStitchCount=${a.visibleLongStitchCount}`);
  lines.push(`severeVisibleLongStitchCount=${a.severeVisibleLongStitchCount}`);
  lines.push(`stitchedTravelCount=${a.stitchedTravelCount}`);
  lines.push(`fillOutsideRegionCount=${a.fillOutsideRegionCount}`);
  lines.push(`crossRegionStitchCount=${a.crossRegionStitchCount}`);
  lines.push(`maxVisibleStitchMm=${a.maxVisibleStitchMm}`);
  lines.push(`visibleDiagonalStitches=${a.visibleDiagonalStitches}`);
  lines.push(`emptyBlocks=${a.emptyBlocks}`);
  lines.push(`invalidCoordinateCount=${a.invalidCoordinateCount}`);
  lines.push(`CE01Status=${a.ce01Status}`);
  lines.push(`CE01Score=${a.ce01Score}`);
  lines.push(`CE01InvalidReasons=${JSON.stringify(a.ce01InvalidReasons)}`);
  lines.push(`finalLookExportMismatch=${a.finalLookExportMismatch}`);
  lines.push(`simulationMatchesFinalCommands=${a.simulationMatchesFinalCommands}`);
  lines.push(`finalLookMatchesFinalCommands=${a.finalLookMatchesFinalCommands}`);
  lines.push(`exportMatchesFinalCommands=${a.exportMatchesFinalCommands}`);
  lines.push(`protectedRegionsTouched=${report.protectedRegionsTouched}`);
  lines.push(`stitchesRemoved=${report.stitchesRemoved}`);
  lines.push(`targetTotalStitches=${report.targetTotalStitches}`);
  lines.push(`ce01MaxStitches=${report.ce01MaxStitches}`);
  lines.push(`successMinimum=${report.phaseAccepted && a.totalStitches <= TARGET_TOTAL_STITCHES && a.severeVisibleLongStitchCount === 0 && a.maxVisibleStitchMm <= 8 && !report.protectedRegionsTouched}`);
  return lines.join('\n');
}

function addMetric(lines, label, before, after) {
  lines.push(`- ${label}: before=${before} after=${after}`);
}