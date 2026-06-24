/* global Deno */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Export stitch data to embroidery machine formats (DST, PES, JEF, EXP, VP3)
 * with metadata calculation and format-specific optimization
 */
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      stitch_blocks = [],
      format_type = 'DST',
      project_name = 'design',
      thread_colors = [],
      metadata = {}
    } = payload;

    console.log(`[EXPORT] Converting to ${format_type}: ${stitch_blocks.length} blocks`);

    if (!stitch_blocks || stitch_blocks.length === 0) {
      throw new Error('No stitch blocks provided');
    }

    // 1. Flatten stitch blocks into coordinate array
    const stitchData = flattenStitchBlocks(stitch_blocks);

    // 2. Calculate essential metadata
    const calculatedMetadata = calculateMetadata(stitchData, stitch_blocks);

    // 3. Select exporter based on format
    const exporter = getExporter(format_type);

    // 4. Prepare export data with format-specific optimization
    const exportData = exporter.prepare(stitchData, {
      ...calculatedMetadata,
      ...metadata,
      thread_colors,
      project_name
    });

    // 5. Encode to format
    const binary = exporter.encode(exportData);

    // 6. Generate filename
    const filename = `${project_name}.${format_type.toLowerCase()}`;

    console.log(`[EXPORT] ${format_type} export: ${binary.length} bytes, ${exportData.stitches.length} stitches`);

    return Response.json({
      success: true,
      data: {
        format: format_type,
        filename,
        size_bytes: binary.length,
        metadata: calculatedMetadata,
        stitches: exportData.stitches.length,
        colors: exportData.colors,
        binary: Array.from(new Uint8Array(binary))
      }
    });
  } catch (error) {
    console.error('[EXPORT] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// ============================================================================
// METADATA CALCULATION
// ============================================================================

function flattenStitchBlocks(blocks) {
  const stitches = [];

  for (const block of blocks) {
    if (block.type === 'trim' || block.type === 'command') {
      // Command stitches
      stitches.push({
        x: 0,
        y: 0,
        command: block.command || 'TRIM'
      });
    } else if (block.stitches && Array.isArray(block.stitches)) {
      // Regular stitches
      for (const [x, y] of block.stitches) {
        stitches.push({
          x,
          y,
          color: block.color,
          type: block.type
        });
      }
    }
  }

  return stitches;
}

function calculateMetadata(stitches, blocks) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let colorChanges = 0;
  let lastColor = null;

  for (const stitch of stitches) {
    if (stitch.command) continue;

    minX = Math.min(minX, stitch.x);
    maxX = Math.max(maxX, stitch.x);
    minY = Math.min(minY, stitch.y);
    maxY = Math.max(maxY, stitch.y);

    if (stitch.color !== lastColor) {
      if (lastColor !== null) colorChanges++;
      lastColor = stitch.color;
    }
  }

  // Extract unique colors
  const uniqueColors = [];
  const colorSet = new Set();
  for (const block of blocks) {
    if (block.type !== 'trim' && block.color && !colorSet.has(block.color)) {
      colorSet.add(block.color);
      uniqueColors.push(block.color);
    }
  }

  return {
    stitch_count: stitches.length,
    color_count: uniqueColors.length,
    color_changes: colorChanges,
    dimensions: {
      min_x: minX === Infinity ? 0 : minX,
      min_y: minY === Infinity ? 0 : minY,
      max_x: maxX === -Infinity ? 0 : maxX,
      max_y: maxY === -Infinity ? 0 : maxY,
      width_mm: (maxX - minX) || 0,
      height_mm: (maxY - minY) || 0
    },
    colors: uniqueColors,
    bounding_box: {
      x: minX === Infinity ? 0 : minX,
      y: minY === Infinity ? 0 : minY,
      w: Math.ceil((maxX - minX) || 0),
      h: Math.ceil((maxY - minY) || 0)
    }
  };
}

// ============================================================================
// EXPORTER FACTORY & BASE CLASS
// ============================================================================

function getExporter(format) {
  const exporters = {
    'DST': new DSTExporter(),
    'PES': new PESExporter(),
    'JEF': new JEFExporter(),
    'EXP': new EXPExporter(),
    'VP3': new VP3Exporter()
  };

  return exporters[format.toUpperCase()] || new DSTExporter();
}

class BaseExporter {
  prepare(stitches, metadata) {
    // Normalize coordinates: convert mm to machine units
    const normalized = stitches.map(s => ({
      ...s,
      x: Math.round((s.x || 0) * 10), // 1mm = 10 units
      y: Math.round((s.y || 0) * 10)
    }));

    return {
      stitches: normalized,
      colors: metadata.colors || [],
      metadata
    };
  }

  encode(data) {
    // Base implementation: return empty buffer
    // Subclasses override with format-specific encoding
    return new Uint8Array(0);
  }
}

// ============================================================================
// DST EXPORTER (Tajima - Most universal)
// ============================================================================

class DSTExporter extends BaseExporter {
  encode(data) {
    const buffer = new Uint8Array(512); // DST header + data
    let offset = 0;

    // DST Header (512 bytes)
    const header = new TextEncoder().encode('LA:');
    buffer.set(header, offset);
    offset = 512; // Data starts at byte 512

    // Encode stitches
    const stitchBuffer = [];
    let lastX = 0, lastY = 0;

    for (const stitch of data.stitches) {
      const dx = stitch.x - lastX;
      const dy = stitch.y - lastY;

      if (stitch.command === 'TRIM') {
        stitchBuffer.push(0xD0); // TRIM command
      } else if (stitch.command === 'END') {
        stitchBuffer.push(0xF0); // END command
      } else {
        // Regular stitch: encode delta
        const encoded = encodeDSTDelta(dx, dy);
        stitchBuffer.push(...encoded);

        lastX = stitch.x;
        lastY = stitch.y;
      }
    }

    // Combine header + stitches
    const finalBuffer = new Uint8Array(512 + stitchBuffer.length);
    finalBuffer.set(buffer);
    finalBuffer.set(new Uint8Array(stitchBuffer), 512);

    return finalBuffer;
  }
}

function encodeDSTDelta(dx, dy) {
  // DST uses 3-byte format with special encoding
  // Simplified version for demonstration
  const bytes = [];

  // Clamp to DST limits (-127 to +127)
  const x = Math.max(-127, Math.min(127, Math.round(dx)));
  const y = Math.max(-127, Math.min(127, Math.round(dy)));

  // Byte 0: high nibble = x_high, low nibble = y_high
  // Byte 1: x_low
  // Byte 2: y_low
  const xHigh = (x >> 4) & 0x0F;
  const xLow = x & 0x0F;
  const yHigh = (y >> 4) & 0x0F;
  const yLow = y & 0x0F;

  bytes.push((yHigh << 4) | xHigh);
  bytes.push(xLow);
  bytes.push(yLow);

  return bytes;
}

// ============================================================================
// PES EXPORTER (Brother/Babylock)
// ============================================================================

class PESExporter extends BaseExporter {
  encode(data) {
    const buffer = [];

    // PES Header
    buffer.push(...'PES'.split('').map(c => c.charCodeAt(0)));
    buffer.push(0x00); // Version
    buffer.push(...[0x00, 0x00, 0x00, 0x00]); // Reserved

    // Encode stitches
    let lastX = 0, lastY = 0;
    for (const stitch of data.stitches) {
      const dx = Math.round(stitch.x - lastX);
      const dy = Math.round(stitch.y - lastY);

      if (stitch.command === 'TRIM') {
        buffer.push(0xFF, 0x00); // TRIM
      } else {
        // Variable-length encoding
        buffer.push(...encodePESDelta(dx, dy));
        lastX = stitch.x;
        lastY = stitch.y;
      }
    }

    // End marker
    buffer.push(0xFF, 0xFF);

    return new Uint8Array(buffer);
  }
}

function encodePESDelta(dx, dy) {
  const bytes = [];

  if (Math.abs(dx) <= 127 && Math.abs(dy) <= 127) {
    bytes.push(dx & 0xFF);
    bytes.push(dy & 0xFF);
  } else {
    // Extended encoding for larger deltas
    bytes.push(0x80);
    bytes.push((dx >> 8) & 0xFF);
    bytes.push(dx & 0xFF);
    bytes.push((dy >> 8) & 0xFF);
    bytes.push(dy & 0xFF);
  }

  return bytes;
}

// ============================================================================
// JEF EXPORTER (Janome)
// ============================================================================

class JEFExporter extends BaseExporter {
  encode(data) {
    const buffer = [];

    // JEF Header
    buffer.push(...'JEF'.split('').map(c => c.charCodeAt(0)));
    buffer.push(0x00); // Version

    // Encode stitches similar to PES
    let lastX = 0, lastY = 0;
    for (const stitch of data.stitches) {
      const dx = Math.round(stitch.x - lastX);
      const dy = Math.round(stitch.y - lastY);

      buffer.push(...encodePESDelta(dx, dy));
      lastX = stitch.x;
      lastY = stitch.y;
    }

    buffer.push(0xFF, 0xFF); // End marker

    return new Uint8Array(buffer);
  }
}

// ============================================================================
// EXP EXPORTER (Melco)
// ============================================================================

class EXPExporter extends BaseExporter {
  encode(data) {
    const buffer = [];

    // EXP Header
    buffer.push(...[0x54, 0x54, 0x00, 0x00]); // Melco signature
    buffer.push(...[0x00, 0x00, 0x00, 0x00]); // Placeholder

    // Encode stitches
    let lastX = 0, lastY = 0;
    for (const stitch of data.stitches) {
      const dx = Math.round((stitch.x - lastX) / 2); // Melco uses 0.2mm units
      const dy = Math.round((stitch.y - lastY) / 2);

      buffer.push(...encodeEXPDelta(dx, dy));
      lastX = stitch.x;
      lastY = stitch.y;
    }

    return new Uint8Array(buffer);
  }
}

function encodeEXPDelta(dx, dy) {
  const bytes = [];
  const x = Math.max(-32768, Math.min(32767, dx));
  const y = Math.max(-32768, Math.min(32767, dy));

  bytes.push(x & 0xFF);
  bytes.push((x >> 8) & 0xFF);
  bytes.push(y & 0xFF);
  bytes.push((y >> 8) & 0xFF);

  return bytes;
}

// ============================================================================
// VP3 EXPORTER (Husqvarna Viking)
// ============================================================================

class VP3Exporter extends BaseExporter {
  encode(data) {
    const buffer = [];

    // VP3 Header
    buffer.push(...[0x00, 0x00, 0x00, 0x00]); // VP3 signature
    buffer.push(...[0x00, 0x00, 0x00, 0x00]); // Version

    // Encode stitches (similar to PES with some differences)
    let lastX = 0, lastY = 0;
    for (const stitch of data.stitches) {
      const dx = Math.round(stitch.x - lastX);
      const dy = Math.round(stitch.y - lastY);

      buffer.push(...encodePESDelta(dx, dy));
      lastX = stitch.x;
      lastY = stitch.y;
    }

    buffer.push(0xFF, 0xFF); // End marker

    return new Uint8Array(buffer);
  }
}