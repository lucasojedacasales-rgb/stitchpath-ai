const OPTIMIZER_ID = 'UNIVERSAL_THREAD_COLOR_SEQUENCE_OPTIMIZER_V1';

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

function isFiniteCommandPoint(command) {
  return command && (command.type === 'stitch' || command.type === 'jump' || command.type === 'trim') &&
    Number.isFinite(command.x) && Number.isFinite(command.y);
}

function commandPoint(command) {
  return isFiniteCommandPoint(command) ? [command.x, command.y] : null;
}

function commandColor(command, fallback = '#000000') {
  return String(command?.color || fallback || '#000000').toLowerCase();
}

function commandKey(command, fallbackIndex) {
  return String(command?.regionId || command?.objectId || command?.blockId || command?.sourceObjectId || `cmd:${fallbackIndex}`);
}

function isDarkColor(color = '') {
  const h = String(color).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 70;
}

function blockLayerRank(block) {
  const text = `${block.key} ${block.commands.map(c => `${c?.stitchType || ''} ${c?.layerType || ''} ${c?.source || ''}`).join(' ')}`.toLowerCase();
  if (text.includes('outer_outline') || text.includes('outline') || text.includes('contour') || (text.includes('running') && isDarkColor(block.color))) return 90;
  if (text.includes('inner_outline') || text.includes('detail') || text.includes('mouth') || text.includes('running')) return 70;
  if (text.includes('satin')) return 30;
  return 10;
}

export function createUniversalThreadColorSequenceOptimizerReport(overrides = {}) {
  return {
    reportId: OPTIMIZER_ID,
    generatedAt: new Date().toISOString(),
    optInOnly: true,
    enabled: false,
    applied: false,
    defaultBehaviorChanged: false,
    encodersTouched: false,
    ExportModalTouched: false,
    MachineSimulatorTouched: false,
    FinalLookSimulatorTouched: false,
    originalRegionsMutated: false,
    originalPathPointsMutated: false,
    previewExportParityPreserved: true,
    preserveUniversalAutoDigitizerPro: true,
    preserveUnifiedStandardProProfile: true,
    reason: 'disabled_explicit_opt_in_required',
    blockCountBefore: 0,
    blockCountAfter: 0,
    colorChangesBefore: 0,
    colorChangesAfter: 0,
    colorChangeReduction: 0,
    stitchCountBefore: 0,
    stitchCountAfter: 0,
    uniqueColorCountBefore: 0,
    uniqueColorCountAfter: 0,
    orderedThreadColorCount: 0,
    reorderedBlockCount: 0,
    estimatedTravelBeforeMm: 0,
    estimatedTravelAfterMm: 0,
    estimatedTravelReductionMm: 0,
    estimatedTravelReductionPercent: 0,
    contourFinalLayerPreserved: true,
    commandIntegrityPreserved: true,
    ...overrides,
  };
}

export function shouldApplyUniversalThreadColorSequenceOptimizer(config = {}) {
  return config.universalThreadColorSequenceOptimizer === true || config.threadColorSequenceOptimizer === true;
}

function splitCommandBlocks(commands = []) {
  const blocks = [];
  let current = null;
  let activeColor = '#000000';
  let fallbackIndex = 0;

  const pushCurrent = () => {
    if (!current) return;
    const firstStitchIndex = current.commands.findIndex(c => c?.type === 'stitch' && Number.isFinite(c.x) && Number.isFinite(c.y));
    if (firstStitchIndex < 0) { current = null; return; }
    const sewCommands = current.commands.slice(firstStitchIndex).map(c => ({ ...c }));
    const entry = commandPoint(sewCommands[0]);
    let exit = entry;
    for (let i = sewCommands.length - 1; i >= 0; i--) {
      const p = commandPoint(sewCommands[i]);
      if (p) { exit = p; break; }
    }
    blocks.push({ ...current, commands: sewCommands, entry, exit, layerRank: blockLayerRank({ ...current, commands: sewCommands }) });
    current = null;
  };

  for (const command of commands || []) {
    if (!command || command.type === 'end') continue;
    if (command.type === 'colorChange') {
      activeColor = command.color || activeColor;
      continue;
    }
    if (!isFiniteCommandPoint(command)) continue;
    const key = commandKey(command, fallbackIndex);
    const color = commandColor(command, activeColor);
    const startsNewBlock = current && (key !== current.key || (command.type === 'stitch' && color !== current.color));
    if (!current || startsNewBlock) {
      pushCurrent();
      current = { key, color, commands: [], originalIndex: blocks.length };
      fallbackIndex++;
    }
    current.commands.push({ ...command, color: command.color || activeColor });
  }
  pushCurrent();
  return blocks;
}

function estimateBlockTravel(blocks = []) {
  let cursor = [0, 0];
  let total = 0;
  for (const block of blocks) {
    if (!block.entry) continue;
    total += Math.hypot(block.entry[0] - cursor[0], block.entry[1] - cursor[1]);
    cursor = block.exit || cursor;
  }
  return total;
}

function orderBlocksByThread(blocks = []) {
  const ranks = [...new Set(blocks.map(b => b.layerRank))].sort((a, b) => a - b);
  const ordered = [];
  for (const rank of ranks) {
    const bucket = blocks.filter(b => b.layerRank === rank);
    if (rank >= 90) {
      ordered.push(...bucket.sort((a, b) => a.originalIndex - b.originalIndex));
      continue;
    }
    const colorOrder = [];
    const byColor = new Map();
    for (const block of bucket) {
      if (!byColor.has(block.color)) { byColor.set(block.color, []); colorOrder.push(block.color); }
      byColor.get(block.color).push(block);
    }
    colorOrder.sort((a, b) => {
      const firstA = byColor.get(a)[0]?.originalIndex ?? 0;
      const firstB = byColor.get(b)[0]?.originalIndex ?? 0;
      const sizeDelta = byColor.get(b).length - byColor.get(a).length;
      return sizeDelta || firstA - firstB;
    });
    for (const color of colorOrder) ordered.push(...byColor.get(color).sort((a, b) => a.originalIndex - b.originalIndex));
  }
  return ordered;
}

function appendTravel(output, cursor, target, template, machineSettings = {}) {
  if (!cursor || !target) return target || cursor || [0, 0];
  const distance = Math.hypot(target[0] - cursor[0], target[1] - cursor[1]);
  if (distance <= 0.05) return target;
  const trimThreshold = Number(machineSettings.trimThreshold) || 3.5;
  const maxJumpLength = Math.max(0.5, Number(machineSettings.maxJumpLength) || 12.1);
  const last = output[output.length - 1];
  if (distance > trimThreshold && last?.type !== 'trim' && last?.type !== 'colorChange') {
    output.push({ type: 'trim', x: cursor[0], y: cursor[1], color: template.color, regionId: template.key, source: OPTIMIZER_ID });
  }
  const steps = Math.max(1, Math.ceil(distance / maxJumpLength));
  for (let i = 1; i <= steps; i++) {
    output.push({
      type: 'jump',
      x: cursor[0] + (target[0] - cursor[0]) * i / steps,
      y: cursor[1] + (target[1] - cursor[1]) * i / steps,
      color: template.color,
      regionId: template.key,
      source: OPTIMIZER_ID,
    });
  }
  return target;
}

function rebuildCommandsFromBlocks(blocks = [], machineSettings = {}) {
  const output = [];
  let cursor = [0, 0];
  let previousColor = null;
  for (const block of blocks) {
    if (!block.entry || block.commands.length === 0) continue;
    if (previousColor !== block.color) {
      output.push({ type: 'colorChange', x: cursor[0], y: cursor[1], color: block.color, regionId: block.key, source: OPTIMIZER_ID });
      previousColor = block.color;
    }
    cursor = appendTravel(output, cursor, block.entry, block, machineSettings);
    output.push(...block.commands.map(c => ({ ...c, color: c.color || block.color })));
    cursor = block.exit || cursor;
  }
  output.push({ type: 'end', x: cursor[0], y: cursor[1], color: null });
  while (output.length > 1 && output[0]?.type === 'colorChange') output.shift();
  return output;
}

function countCommands(commands = [], type) {
  return commands.filter(c => c?.type === type).length;
}

function uniqueColors(commands = []) {
  return new Set(commands.filter(c => c?.color && (c.type === 'stitch' || c.type === 'jump')).map(c => String(c.color).toLowerCase())).size;
}

function validateOptimizerResult(before = [], after = []) {
  const stitchCountBefore = countCommands(before, 'stitch');
  const stitchCountAfter = countCommands(after, 'stitch');
  const uniqueColorCountBefore = uniqueColors(before);
  const uniqueColorCountAfter = uniqueColors(after);
  const endCount = countCommands(after, 'end');
  const finite = after.every(c => c?.type === 'colorChange' || c?.type === 'end' || (Number.isFinite(c.x) && Number.isFinite(c.y)));
  return stitchCountBefore === stitchCountAfter && uniqueColorCountBefore === uniqueColorCountAfter && endCount === 1 && finite;
}

export function applyUniversalThreadColorSequenceOptimizer(commands = [], config = {}, machineSettings = {}) {
  const enabled = shouldApplyUniversalThreadColorSequenceOptimizer(config);
  const report = createUniversalThreadColorSequenceOptimizerReport({ enabled });
  if (!enabled) return { commands, report };
  if (!Array.isArray(commands) || commands.length <= 2) {
    return { commands, report: { ...report, reason: 'not_enough_commands' } };
  }

  const blocks = splitCommandBlocks(commands);
  if (blocks.length <= 1) {
    return { commands, report: { ...report, reason: 'not_enough_blocks', blockCountBefore: blocks.length, blockCountAfter: blocks.length } };
  }

  const orderedBlocks = orderBlocksByThread(blocks);
  const changed = orderedBlocks.some((block, index) => block.originalIndex !== blocks[index]?.originalIndex);
  if (!changed) {
    return { commands, report: { ...report, reason: 'already_optimal', blockCountBefore: blocks.length, blockCountAfter: blocks.length } };
  }

  const optimized = rebuildCommandsFromBlocks(orderedBlocks, machineSettings);
  const integrity = validateOptimizerResult(commands, optimized);
  const colorChangesBefore = countCommands(commands, 'colorChange');
  const colorChangesAfter = countCommands(optimized, 'colorChange');
  const travelBefore = estimateBlockTravel(blocks);
  const travelAfter = estimateBlockTravel(orderedBlocks);
  const reorderedBlockCount = orderedBlocks.filter((block, index) => block.originalIndex !== blocks[index]?.originalIndex).length;
  const reduction = travelBefore - travelAfter;

  if (!integrity || colorChangesAfter > colorChangesBefore) {
    return {
      commands,
      report: createUniversalThreadColorSequenceOptimizerReport({
        enabled,
        reason: integrity ? 'color_change_regression_discarded' : 'command_integrity_guard_discarded',
        blockCountBefore: blocks.length,
        blockCountAfter: blocks.length,
        colorChangesBefore,
        colorChangesAfter,
        stitchCountBefore: countCommands(commands, 'stitch'),
        stitchCountAfter: countCommands(optimized, 'stitch'),
        uniqueColorCountBefore: uniqueColors(commands),
        uniqueColorCountAfter: uniqueColors(optimized),
        commandIntegrityPreserved: integrity,
      }),
    };
  }

  return {
    commands: optimized,
    report: createUniversalThreadColorSequenceOptimizerReport({
      enabled,
      applied: true,
      reason: 'thread_color_blocks_reordered',
      blockCountBefore: blocks.length,
      blockCountAfter: orderedBlocks.length,
      colorChangesBefore,
      colorChangesAfter,
      colorChangeReduction: Math.max(0, colorChangesBefore - colorChangesAfter),
      stitchCountBefore: countCommands(commands, 'stitch'),
      stitchCountAfter: countCommands(optimized, 'stitch'),
      uniqueColorCountBefore: uniqueColors(commands),
      uniqueColorCountAfter: uniqueColors(optimized),
      orderedThreadColorCount: new Set(orderedBlocks.map(b => b.color)).size,
      reorderedBlockCount,
      estimatedTravelBeforeMm: roundMetric(travelBefore),
      estimatedTravelAfterMm: roundMetric(travelAfter),
      estimatedTravelReductionMm: roundMetric(reduction),
      estimatedTravelReductionPercent: travelBefore > 0 ? roundMetric((reduction / travelBefore) * 100) : 0,
      commandIntegrityPreserved: integrity,
    }),
  };
}

export function buildUniversalThreadColorSequenceOptimizerMarkdown(report = createUniversalThreadColorSequenceOptimizerReport()) {
  const r = { ...createUniversalThreadColorSequenceOptimizerReport(), ...(report || {}) };
  const lines = [];
  lines.push(`# ${OPTIMIZER_ID}`);
  lines.push('');
  lines.push(`Fecha: ${r.generatedAt}`);
  lines.push('Tipo: optimizador universal opt-in de secuencia de colores de hilo.');
  lines.push('Restricción: no muta regiones ni path_points; solo devuelve una secuencia de comandos reconstruida y validada.');
  lines.push('');
  lines.push('## Estado');
  lines.push(`- enabled: ${r.enabled}`);
  lines.push(`- applied: ${r.applied}`);
  lines.push(`- reason: ${r.reason}`);
  lines.push(`- optInOnly: ${r.optInOnly}`);
  lines.push(`- defaultBehaviorChanged: ${r.defaultBehaviorChanged}`);
  lines.push(`- encodersTouched: ${r.encodersTouched}`);
  lines.push(`- originalRegionsMutated: ${r.originalRegionsMutated}`);
  lines.push(`- originalPathPointsMutated: ${r.originalPathPointsMutated}`);
  lines.push(`- previewExportParityPreserved: ${r.previewExportParityPreserved}`);
  lines.push(`- preserveUniversalAutoDigitizerPro: ${r.preserveUniversalAutoDigitizerPro}`);
  lines.push(`- preserveUnifiedStandardProProfile: ${r.preserveUnifiedStandardProProfile}`);
  lines.push('');
  lines.push('## Métricas');
  lines.push(`- blockCountBefore: ${r.blockCountBefore}`);
  lines.push(`- blockCountAfter: ${r.blockCountAfter}`);
  lines.push(`- reorderedBlockCount: ${r.reorderedBlockCount}`);
  lines.push(`- colorChangesBefore: ${r.colorChangesBefore}`);
  lines.push(`- colorChangesAfter: ${r.colorChangesAfter}`);
  lines.push(`- colorChangeReduction: ${r.colorChangeReduction}`);
  lines.push(`- stitchCountBefore: ${r.stitchCountBefore}`);
  lines.push(`- stitchCountAfter: ${r.stitchCountAfter}`);
  lines.push(`- uniqueColorCountBefore: ${r.uniqueColorCountBefore}`);
  lines.push(`- uniqueColorCountAfter: ${r.uniqueColorCountAfter}`);
  lines.push(`- estimatedTravelBeforeMm: ${r.estimatedTravelBeforeMm}`);
  lines.push(`- estimatedTravelAfterMm: ${r.estimatedTravelAfterMm}`);
  lines.push(`- estimatedTravelReductionMm: ${r.estimatedTravelReductionMm}`);
  lines.push(`- estimatedTravelReductionPercent: ${r.estimatedTravelReductionPercent}`);
  lines.push(`- contourFinalLayerPreserved: ${r.contourFinalLayerPreserved}`);
  lines.push(`- commandIntegrityPreserved: ${r.commandIntegrityPreserved}`);
  return lines.join('\n');
}