/**
 * EMBROIDERY VALIDATOR
 * Validación y optimización de archivos de bordado
 * Basado en estándares de stitchjs y pyembroidery
 */

export function validateEmbroideryFile(stitches) {
  const issues = [];
  
  // Validación 1: Rango válido
  const bounds = getBounds(stitches);
  if (bounds.minX < -500 || bounds.maxX > 500 || bounds.minY < -500 || bounds.maxY > 500) {
    issues.push({
      severity: 'warning',
      message: 'Stitches out of typical hoop range',
      bounds
    });
  }

  // Validación 2: Saltos grandes
  for (let i = 1; i < stitches.length; i++) {
    const prev = stitches[i - 1];
    const curr = stitches[i];
    
    if (curr.cmd === 'stitch' && prev.cmd === 'stitch') {
      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (dist > 8) {  // > 8mm
        issues.push({
          severity: 'info',
          message: `Large jump at stitch ${i}: ${dist.toFixed(1)}mm`,
          index: i,
          distance: dist
        });
      }
    }
  }

  // Validación 3: Demasiadas puntadas
  const stitchCount = stitches.filter(s => s.cmd === 'stitch').length;
  if (stitchCount > 500000) {
    issues.push({
      severity: 'error',
      message: `Too many stitches: ${stitchCount} (max 500,000)`,
      count: stitchCount
    });
  }

  // Validación 4: Colores inconsistentes
  const colorCount = new Set(stitches.map(s => s.color).filter(Boolean)).size;
  if (colorCount > 99) {
    issues.push({
      severity: 'error',
      message: `Too many colors: ${colorCount} (max 99)`,
      colors: colorCount
    });
  }

  return {
    valid: !issues.some(i => i.severity === 'error'),
    stitchCount,
    colorCount,
    bounds,
    issues
  };
}

export function optimizeEmbroideryFile(stitches) {
  const optimized = [];
  
  // Remover stitches duplicados consecutivos
  for (let i = 0; i < stitches.length; i++) {
    if (i > 0) {
      const prev = stitches[i - 1];
      const curr = stitches[i];
      
      if (curr.x === prev.x && curr.y === prev.y && curr.cmd === prev.cmd) {
        continue;  // Skip duplicate
      }
    }
    
    optimized.push(stitches[i]);
  }

  // Simplificar path: remover puntos muy cercanos (< 0.1mm)
  const simplified = [];
  for (let i = 0; i < optimized.length; i++) {
    if (simplified.length === 0) {
      simplified.push(optimized[i]);
    } else {
      const last = simplified[simplified.length - 1];
      const curr = optimized[i];
      const dist = Math.hypot(curr.x - last.x, curr.y - last.y);
      
      if (dist >= 0.1 || curr.cmd !== 'stitch') {
        simplified.push(curr);
      }
    }
  }

  return simplified;
}

export function estimateEmbroideryTime(stitches, speedSpm = 800) {
  const stitchCount = stitches.filter(s => s.cmd === 'stitch').length;
  const timeMinutes = stitchCount / speedSpm;
  
  return {
    stitches: stitchCount,
    speedSpm,
    timeMinutes: Math.round(timeMinutes * 10) / 10,
    timeHms: formatTime(timeMinutes)
  };
}

function getBounds(stitches) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (const s of stitches) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  }
  
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.round((minutes % 1) * 60);
  
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function convertToMachineFormat(stitches, format) {
  // Placeholder: cada formato tiene su propia estructura
  switch (format) {
    case 'dst':
      return convertToDST(stitches);
    case 'pes':
      return convertToPES(stitches);
    case 'jef':
      return convertToJEF(stitches);
    default:
      return stitches;
  }
}

function convertToDST(stitches) {
  // Tajima DST format: 3 bytes per stitch
  return stitches.map(s => ({
    ...s,
    format: 'dst'
  }));
}

function convertToPES(stitches) {
  // Brother PES format
  return stitches.map(s => ({
    ...s,
    format: 'pes'
  }));
}

function convertToJEF(stitches) {
  // Janome JEF format
  return stitches.map(s => ({
    ...s,
    format: 'jef'
  }));
}