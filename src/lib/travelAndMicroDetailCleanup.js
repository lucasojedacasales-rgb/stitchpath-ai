const REPORT_ID = 'TRAVEL_AND_MICRO_DETAIL_CLEANUP_V1';

function cloneCommand(command) {
  return command && typeof command === 'object' ? { ...command } : command;
}

function hasPoint(command) {
  return command && Number.isFinite(command.x) && Number.isFinite(command.y);
}

function distance(a, b) {
  return hasPoint(a) && hasPoint(b) ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

function commandColorSet(commands = []) {
  return new Set(commands.filter(c => c?.color && (c.type === 'stitch' || c.type === 'jump' || c.type === 'colorChange')).map(c => String(c.color).toLowerCase()));
}

function countType(commands = [], type) {
  return commands.filter(c => c?.type === type).length;
}

function isProtectedDetail(command = {}) {
  const text = `${command.regionId || ''} ${command.stitchType || ''} ${command.layerType || ''} ${command.source || ''}`.toLowerCase();
  return text.includes('contour') || text.includes('outline') || text.includes('running') || text.includes('mouth') || text.includes('detail');
}

function createReport(extra = {}) {
  return {
    reportId: REPORT_ID,
    generatedAt: new Date().toISOString(),
    optInOnly: true,
    travelAndMicroDetailCleanupRequested: false,
    travelAndMicroDetailCleanupApplied: false,
    commandsChanged: false,
    convertedStitchedTravelCount: 0,
    removedMicroDuplicateCount: 0,
    originalCommandCount: 0,
    finalCommandCount: 0,
    originalStitchCount: 0,
    finalStitchCount: 0,
    originalJumpCount: 0,
    finalJumpCount: 0,
    originalTrimCount: 0,
    finalTrimCount: 0,
    colorChangePreserved: true,
    commandColorCountPreserved: true,
    protectedDetailPreserved: true,
    originalRegionsMutated: false,
    originalPathPointsMutated: false,
    previewExportParityPreserved: true,
    reverted: false,
    revertReason: null,
    ...extra,
  };
}

function summarize(before, after, report) {
  const beforeColors = commandColorSet(before);
  const afterColors = commandColorSet(after);
  return {
    ...report,
    originalCommandCount: before.length,
    finalCommandCount: after.length,
    originalStitchCount: countType(before, 'stitch'),
    finalStitchCount: countType(after, 'stitch'),
    originalJumpCount: countType(before, 'jump'),
    finalJumpCount: countType(after, 'jump'),
    originalTrimCount: countType(before, 'trim'),
    finalTrimCount: countType(after, 'trim'),
    colorChangePreserved: countType(before, 'colorChange') === countType(after, 'colorChange'),
    commandColorCountPreserved: beforeColors.size === afterColors.size,
    protectedDetailPreserved: countProtectedDetails(after) >= countProtectedDetails(before),
  };
}

function countProtectedDetails(commands = []) {
  return commands.filter(c => c?.type === 'stitch' && isProtectedDetail(c)).length;
}

function ensureEndLast(commands = []) {
  const withoutEnd = commands.filter(c => c?.type !== 'end');
  const lastPoint = [...withoutEnd].reverse().find(hasPoint) || { x: 0, y: 0 };
  return [...withoutEnd, { type: 'end', x: lastPoint.x, y: lastPoint.y, color: null }];
}

export function applyTravelAndMicroDetailCleanup({ commands = [], regions = [], config = {}, machineSettings = {} } = {}) {
  const requested = config.travelAndMicroDetailCleanup === true;
  if (!requested) return { commands, report: createReport() };

  const originalRegionsSnapshot = JSON.stringify(regions || []);
  const originalPathPointsSnapshot = JSON.stringify((regions || []).map(r => r.path_points || []));
  const trimThreshold = Number(machineSettings.trimThreshold) || 3.5;
  const maxVisibleTravelMm = Math.max(4.5, trimThreshold + 0.75);
  const microDuplicateMm = 0.12;
  const output = [];
  let previousPointCommand = null;
  let convertedStitchedTravelCount = 0;
  let removedMicroDuplicateCount = 0;

  for (const command of commands || []) {
    if (!command || command.type === 'end') continue;
    const next = cloneCommand(command);

    if (next.type === 'stitch' && previousPointCommand && hasPoint(next)) {
      const d = distance(previousPointCommand, next);
      const sameRegion = String(previousPointCommand.regionId || '') === String(next.regionId || '');
      const protectedDetail = isProtectedDetail(next) || isProtectedDetail(previousPointCommand);

      if (!protectedDetail && sameRegion && d > 0 && d < microDuplicateMm) {
        removedMicroDuplicateCount++;
        continue;
      }

      if (!protectedDetail && d > maxVisibleTravelMm && (!sameRegion || d > maxVisibleTravelMm * 1.6)) {
        if (output.length > 0 && output[output.length - 1]?.type !== 'trim') {
          output.push({ type: 'trim', x: previousPointCommand.x, y: previousPointCommand.y, color: next.color, regionId: next.regionId, source: REPORT_ID });
        }
        output.push({ ...next, type: 'jump', source: REPORT_ID });
        previousPointCommand = { ...next, type: 'jump' };
        convertedStitchedTravelCount++;
        continue;
      }
    }

    output.push(next);
    if (hasPoint(next)) previousPointCommand = next;
  }

  if (convertedStitchedTravelCount === 0 && removedMicroDuplicateCount === 0) {
    const report = summarize(commands, commands, createReport({
      travelAndMicroDetailCleanupRequested: true,
      originalRegionsMutated: originalRegionsSnapshot !== JSON.stringify(regions || []),
      originalPathPointsMutated: originalPathPointsSnapshot !== JSON.stringify((regions || []).map(r => r.path_points || [])),
    }));
    return { commands, report };
  }

  const finalCommands = ensureEndLast(output);
  let report = summarize(commands, finalCommands, createReport({
    travelAndMicroDetailCleanupRequested: true,
    convertedStitchedTravelCount,
    removedMicroDuplicateCount,
    commandsChanged: true,
    originalRegionsMutated: originalRegionsSnapshot !== JSON.stringify(regions || []),
    originalPathPointsMutated: originalPathPointsSnapshot !== JSON.stringify((regions || []).map(r => r.path_points || [])),
  }));

  if (!report.colorChangePreserved || !report.commandColorCountPreserved || !report.protectedDetailPreserved || report.originalRegionsMutated || report.originalPathPointsMutated) {
    report = summarize(commands, commands, { ...report, travelAndMicroDetailCleanupApplied: false, commandsChanged: false, reverted: true, revertReason: 'transactional_guard_failed' });
    return { commands, report };
  }

  report.travelAndMicroDetailCleanupApplied = report.commandsChanged;
  return { commands: finalCommands, report };
}

export function buildTravelAndMicroDetailCleanupMarkdown(report = createReport()) {
  const lines = [];
  lines.push('# TRAVEL_AND_MICRO_DETAIL_CLEANUP_V1');
  lines.push('');
  for (const [key, value] of Object.entries(report)) {
    lines.push(`${key}=${Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  return lines.join('\n');
}