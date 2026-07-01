import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { stitchPaths, format = 'DST', machineSettings = {} } = await req.json();
    if (!stitchPaths || !Array.isArray(stitchPaths)) {
      return Response.json({ error: 'stitchPaths array required' }, { status: 400 });
    }

    const ms = {
      maxStitchLength: 12.1,
      maxJumpLength: 12.1,
      hoopSize: [100, 100],
      designOffset: [0, 0],
      trimThreshold: 5.0,       // distancia para emitir trim
      ...machineSettings,
    };

    // ── Flatten + optimize stitches ──────────────────────────────────────────
    const stitches = flattenAndOptimize(stitchPaths, ms);

    // ── Validation ─────────────────────────────────────────────────────────
    const warnings = validateStitches(stitches, ms);

    // ── Encode ─────────────────────────────────────────────────────────────
    let fileBuffer, mimeType, ext;
    const fmt = format.toUpperCase();

    if (fmt === 'DST') {
      fileBuffer = encodeDST(stitches, ms);
      mimeType = 'application/octet-stream';
      ext = 'dst';
    } else if (fmt === 'PES') {
      fileBuffer = encodePES(stitches, ms, stitchPaths);
      mimeType = 'application/octet-stream';
      ext = 'pes';
    } else if (fmt === 'JEF') {
      fileBuffer = encodeJEF(stitches, ms, stitchPaths);
      mimeType = 'application/octet-stream';
      ext = 'jef';
    } else if (fmt === 'EXP') {
      fileBuffer = encodeEXP(stitches);
      mimeType = 'application/octet-stream';
      ext = 'exp';
    } else if (fmt === 'VP3') {
      return Response.json({ error: 'VP3 format not yet implemented. Use DST, PES, JEF, or EXP.' }, { status: 501 });
    } else {
      return Response.json({ error: `Unsupported format: ${format}` }, { status: 400 });
    }

    // ── Checksum ───────────────────────────────────────────────────────────
    let checksum = 0;
    for (let i = 0; i < fileBuffer.length; i++) checksum ^= fileBuffer[i];

    const suggestedName = `design.${ext}`;
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${suggestedName}"`,
        'X-File-Size': String(fileBuffer.length),
        'X-Checksum': String(checksum),
        'X-Warnings': JSON.stringify(warnings),
        'X-Suggested-Name': suggestedName,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  FLATTEN & OPTIMIZE
//  KEY FIX: Group ALL paths by color FIRST, then emit at most MAX_COLORS
//  color-change events — not one per path.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_COLORS = 15;

function flattenAndOptimize(stitchPaths, ms) {
  const [offX, offY] = ms.designOffset || [0, 0];

  // ── Step 1: Collect unique colors in appearance order ───────────────────
  const colorOrderMap = new Map(); // color → index
  for (const path of stitchPaths) {
    const c = (path.color || '#000000').toLowerCase();
    if (!colorOrderMap.has(c)) colorOrderMap.set(c, colorOrderMap.size);
  }

  // Quantize to MAX_COLORS if needed (merge by nearest)
  const uniqueColors = [...colorOrderMap.keys()];
  let colorPalette = uniqueColors;
  if (uniqueColors.length > MAX_COLORS) {
    colorPalette = kMeansColorReduce(uniqueColors, MAX_COLORS);
  }

  // Build color → palette color mapping
  const colorToGroup = new Map();
  for (const c of uniqueColors) {
    colorToGroup.set(c, nearestPaletteColor(c, colorPalette));
  }

  // ── Step 2: Group all paths by palette color, preserving order ───────────
  const groupOrder = [];
  const groups = new Map(); // paletteColor → [{ path, pts }]

  for (const path of stitchPaths) {
    const rawColor = (path.color || '#000000').toLowerCase();
    const groupColor = colorToGroup.get(rawColor) || rawColor;
    if (!groups.has(groupColor)) {
      groups.set(groupColor, []);
      groupOrder.push(groupColor);
    }
    if ((path.points || []).length > 0) {
      groups.get(groupColor).push({ path, pts: path.points });
    }
  }

  // ── Step 3: Emit stitches group by group ─────────────────────────────────
  const all = [];
  let prevX = 0, prevY = 0;
  let firstGroup = true;

  for (const groupColor of groupOrder) {
    const pathsInGroup = groups.get(groupColor) || [];
    if (pathsInGroup.length === 0) continue;

    // ONE color change per group (not per path)
    if (!firstGroup) {
      all.push({ x: prevX, y: prevY, type: 'colorChange', color: groupColor });
    }
    firstGroup = false;

    for (const { pts } of pathsInGroup) {
      if (!pts || pts.length === 0) continue;

      for (let i = 0; i < pts.length; i++) {
        const x = (typeof pts[i] === 'object' && !Array.isArray(pts[i]))
          ? pts[i].x + offX
          : pts[i][0] + offX;
        const y = (typeof pts[i] === 'object' && !Array.isArray(pts[i]))
          ? pts[i].y + offY
          : pts[i][1] + offY;

        if (i === 0) {
          const dist = Math.hypot(x - prevX, y - prevY);
          if (all.length > 0 && dist > ms.maxJumpLength) {
            const steps = Math.ceil(dist / ms.maxJumpLength);
            for (let s = 1; s <= steps; s++) {
              all.push({
                x: prevX + (x - prevX) * s / steps,
                y: prevY + (y - prevY) * s / steps,
                type: 'jump',
                color: groupColor,
              });
            }
          } else if (all.length > 0 && dist > 0.3) {
            all.push({ x, y, type: 'jump', color: groupColor });
          } else {
            all.push({ x, y, type: 'stitch', color: groupColor });
          }
        } else {
          const lastStitch = all[all.length - 1];
          const dist = Math.hypot(x - lastStitch.x, y - lastStitch.y);
          if (dist > ms.maxStitchLength) {
            const steps = Math.ceil(dist / ms.maxStitchLength);
            for (let s = 1; s < steps; s++) {
              all.push({
                x: lastStitch.x + (x - lastStitch.x) * s / steps,
                y: lastStitch.y + (y - lastStitch.y) * s / steps,
                type: 'stitch',
                color: groupColor,
              });
            }
          }
          all.push({ x, y, type: 'stitch', color: groupColor });
        }

        prevX = x;
        prevY = y;
      }
    }
  }

  // End stitch
  const last = all.length > 0 ? all[all.length - 1] : { x: 0, y: 0 };
  all.push({ x: last.x, y: last.y, type: 'end', color: null });

  return all;
}

// ── Color quantization helpers ──────────────────────────────────────────────

function hexToRgbArr(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
}

function colorDist(a, b) {
  const [r1,g1,b1] = hexToRgbArr(a);
  const [r2,g2,b2] = hexToRgbArr(b);
  return Math.hypot(r1-r2, g1-g2, b1-b2);
}

function nearestPaletteColor(color, palette) {
  let best = palette[0], bestD = Infinity;
  for (const p of palette) {
    const d = colorDist(color, p);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function kMeansColorReduce(colors, k) {
  // Simple: pick k evenly-spaced colors from the sorted list as centroids
  const step = Math.max(1, Math.floor(colors.length / k));
  const palette = [];
  for (let i = 0; i < k && i * step < colors.length; i++) {
    palette.push(colors[i * step]);
  }
  return palette;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateStitches(stitches, ms) {
  const warnings = [];
  const [hw, hh] = ms.hoopSize;
  let outOfHoop = 0;

  for (const s of stitches) {
    if (Math.abs(s.x) > hw / 2 || Math.abs(s.y) > hh / 2) outOfHoop++;
  }
  if (outOfHoop > 0) warnings.push(`${outOfHoop} stitches outside hoop (${hw}x${hh}mm)`);

  let jumpStreak = 0, isolated = 0;
  for (const s of stitches) {
    if (s.type === 'jump') { jumpStreak++; }
    else if (s.type === 'stitch') { if (jumpStreak > 5) isolated++; jumpStreak = 0; }
    else { jumpStreak = 0; }
  }
  if (isolated > 0) warnings.push(`${isolated} potentially isolated stitch islands detected`);

  return warnings;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DST ENCODER (Tajima) — CORRECTED
//
//  DST units = 0.1mm.  Stitches arrive in mm → multiply by 10.
//  Max delta per record = ±121 DST units (±12.1mm).
//  If a move is larger, split into JUMP records.
//  Header: 512-byte ASCII block with fields like "LA:name\r\nST:nnn\r\n..."
// ═══════════════════════════════════════════════════════════════════════════

function encodeDST(stitches, ms) {
  // ── 1. Compute bounding box from ALL actual stitch coords (in mm) ────────
  let minXmm = Infinity, maxXmm = -Infinity;
  let minYmm = Infinity, maxYmm = -Infinity;
  let stitchCount = 0;
  let colorChanges = 0;

  for (const s of stitches) {
    if (s.type === 'stitch' || s.type === 'jump') {
      minXmm = Math.min(minXmm, s.x); maxXmm = Math.max(maxXmm, s.x);
      minYmm = Math.min(minYmm, s.y); maxYmm = Math.max(maxYmm, s.y);
    }
    if (s.type === 'stitch') stitchCount++;
    if (s.type === 'colorChange') colorChanges++;
  }
  if (minXmm === Infinity) { minXmm = 0; maxXmm = 0; minYmm = 0; maxYmm = 0; }

  const widthMm  = maxXmm - minXmm;
  const heightMm = maxYmm - minYmm;

  // DST stores bounds in 0.1mm units (integer, signed)
  const axMm = (maxXmm + minXmm) / 2;  // center of design
  const ayMm = (maxYmm + minYmm) / 2;

  // ── 2. Build 512-byte ASCII header ──────────────────────────────────────
  // Format: "FIELD:VALUE\r\n" lines, padded with spaces to 512 bytes.
  // Required fields: LA (label), ST (stitches), CO (color changes),
  //   +X,-X,+Y,-Y (extent from center in 0.1mm), AX,AY (last needle pos),
  //   MX,MY (machine offset), PD (unknown, use +00000).
  const halfW = Math.round(widthMm / 2 * 10);
  const halfH = Math.round(heightMm / 2 * 10);
  const axU = Math.round(axMm * 10);
  const ayU = Math.round(ayMm * 10);

  function dstNum(v) {
    // DST signed number: sign + 5 digits, e.g. "+00267" or "-00123"
    const abs = Math.abs(Math.round(v));
    return (v >= 0 ? '+' : '-') + String(abs).padStart(5, '0');
  }

  const designName = 'STITCHPATH';
  const headerLines = [
    `LA:${designName.substring(0, 16).padEnd(16, ' ')}`,
    `ST:${String(stitchCount).padStart(7, ' ')}`,
    `CO:${String(Math.min(colorChanges, 99)).padStart(3, ' ')}`,
    `+X:${dstNum(halfW)}`,
    `-X:${dstNum(halfW)}`,
    `+Y:${dstNum(halfH)}`,
    `-Y:${dstNum(halfH)}`,
    `AX:${dstNum(axU)}`,
    `AY:${dstNum(ayU)}`,
    `MX:${dstNum(0)}`,
    `MY:${dstNum(0)}`,
    `PD:******`,
  ];

  const headerStr = headerLines.join('\r\n') + '\r\n';
  const header = new Uint8Array(512).fill(0x20); // fill with spaces
  for (let i = 0; i < headerStr.length && i < 512; i++) {
    header[i] = headerStr.charCodeAt(i);
  }
  header[511] = 0x1A; // Ctrl-Z end marker (standard DST)

  // ── 3. Encode body records ───────────────────────────────────────────────
  // Each stitch = 3 bytes. Delta in DST units (0.1mm). Max ±121 per record.
  const records = [];

  // Encode one DST record with given dx, dy (in DST units) and flag byte.
  // Uses the standard Tajima bit layout.
  const encodeDSTRecord = (dx, dy, flag) => {
    // Clamp to ±121
    dx = Math.max(-121, Math.min(121, dx));
    dy = Math.max(-121, Math.min(121, dy));

    let b0 = 0, b1 = 0, b2 = flag & 0x0F; // low nibble of flag

    // ── Y bits into b0, X bits into b1, overflow into b2 ──
    // Tajima encoding: positive Y = bits at positions 0,1,2,(skip3,4=neg),5,6,7
    // Negative Y: complement bits shifted

    // Positive Y
    if (dy > 0) {
      if (dy & 1)  b0 |= 0x01;
      if (dy & 2)  b0 |= 0x02;
      if (dy & 4)  b0 |= 0x04;
      // bit 3 of b0 unused for +Y
      if (dy & 8)  b2 |= 0x40; // overflow
      if (dy & 16) b0 |= 0x10;
      if (dy & 32) b0 |= 0x20;
      if (dy & 64) b0 |= 0x40;
    } else if (dy < 0) {
      const d = -dy;
      if (d & 1)  b0 |= 0x08;
      if (d & 2)  b0 |= 0x10;
      if (d & 4)  b0 |= 0x20;
      if (d & 8)  b2 |= 0x80; // overflow
      if (d & 16) b0 |= 0x01;
      if (d & 32) b0 |= 0x02;
      if (d & 64) b0 |= 0x04;
    }

    // Positive X
    if (dx > 0) {
      if (dx & 1)  b1 |= 0x01;
      if (dx & 2)  b1 |= 0x02;
      if (dx & 4)  b1 |= 0x04;
      if (dx & 8)  b2 |= 0x10; // overflow
      if (dx & 16) b1 |= 0x10;
      if (dx & 32) b1 |= 0x20;
      if (dx & 64) b1 |= 0x40;
    } else if (dx < 0) {
      const d = -dx;
      if (d & 1)  b1 |= 0x08;
      if (d & 2)  b1 |= 0x10;
      if (d & 4)  b1 |= 0x20;
      if (d & 8)  b2 |= 0x20; // overflow
      if (d & 16) b1 |= 0x01;
      if (d & 32) b1 |= 0x02;
      if (d & 64) b1 |= 0x04;
    }

    records.push(b0, b1, b2);
  };

  // Emit a move (possibly > 121 DST units) as a series of JUMP records
  // followed by the final record with the given endFlag.
  const emitMove = (dxUnits, dyUnits, endFlag) => {
    const MAX_DELTA = 121;
    let remX = dxUnits, remY = dyUnits;

    while (Math.abs(remX) > MAX_DELTA || Math.abs(remY) > MAX_DELTA) {
      const stepX = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, remX));
      const stepY = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, remY));
      encodeDSTRecord(stepX, stepY, 0x83); // JUMP flag
      remX -= stepX;
      remY -= stepY;
    }
    encodeDSTRecord(remX, remY, endFlag);
  };

  // Walk stitches; cx/cy track current needle position in DST units
  let cx = 0, cy = 0;

  for (const s of stitches) {
    if (s.type === 'end') {
      // DST end record: 0x00 0x00 0xF3
      records.push(0x00, 0x00, 0xF3);
      break;
    }

    if (s.type === 'colorChange') {
      // Color change: encode at current position with flag 0xC3
      encodeDSTRecord(0, 0, 0xC3);
      continue; // do NOT update cx/cy — needle stays put
    }

    // Convert mm → DST units (0.1mm), round to nearest integer
    const tx = Math.round(s.x * 10);
    const ty = Math.round(s.y * 10);
    const dxUnits = tx - cx;
    const dyUnits = ty - cy;

    if (s.type === 'jump') {
      emitMove(dxUnits, dyUnits, 0x83); // JUMP
    } else {
      // Normal stitch — if distance > MAX_DELTA, break into jumps + final stitch
      emitMove(dxUnits, dyUnits, 0x03); // STITCH
    }

    cx = tx;
    cy = ty;
  }

  // ── 4. Assemble final buffer ─────────────────────────────────────────────
  const buf = new Uint8Array(512 + records.length);
  buf.set(header, 0);
  buf.set(new Uint8Array(records), 512);
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PES ENCODER (Brother)
// ═══════════════════════════════════════════════════════════════════════════

const BROTHER_THREADS = [
  [0,0,0,'BLK'],[255,255,255,'WHT'],[255,0,0,'RED'],[0,255,0,'GRN'],
  [0,0,255,'BLU'],[255,255,0,'YEL'],[255,0,255,'MGT'],[0,255,255,'CYN'],
  [255,128,0,'ORG'],[128,0,128,'PUR'],[0,128,0,'DGRN'],[128,64,0,'BRN'],
  [255,192,203,'PNK'],[192,192,192,'SLV'],[128,128,128,'GRY'],
];

function nearestThreadIdx(hex, palette) {
  if (!hex || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = Math.hypot(r - palette[i][0], g - palette[i][1], b - palette[i][2]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function encodePES(stitches, ms, stitchPaths) {
  const colorOrder = [];
  const seenColors = new Set();
  for (const path of stitchPaths) {
    const c = path.color || '#000000';
    if (!seenColors.has(c)) { seenColors.add(c); colorOrder.push(c); }
  }
  const colorIndices = colorOrder.map(c => nearestThreadIdx(c, BROTHER_THREADS));
  const numColorChanges = Math.max(0, colorOrder.length - 1);

  const pecStitches = [];
  let cx = 0, cy = 0;

  const getColorIdx = (color) => {
    const idx = colorOrder.indexOf(color);
    return idx >= 0 ? colorIndices[idx] : 0;
  };

  for (const s of stitches) {
    const x = Math.round(s.x * 10);
    const y = Math.round(s.y * 10);
    const dx = x - cx;
    const dy = y - cy;
    cx = x; cy = y;

    if (s.type === 'end') { pecStitches.push(0xFF, 0x00); break; }
    if (s.type === 'colorChange' || s.type === 'trim') {
      pecStitches.push(0xFE, 0xB0, getColorIdx(s.color));
      continue;
    }

    const isJump = s.type === 'jump';
    if (!isJump && dx >= -64 && dx <= 63 && dy >= -64 && dy <= 63) {
      pecStitches.push(dx < 0 ? dx + 128 : dx, dy < 0 ? dy + 128 : dy);
    } else {
      const typeByte = isJump ? 0x04 : 0x01;
      const encX = dx < 0 ? dx + 4096 : dx;
      const encY = dy < 0 ? dy + 4096 : dy;
      pecStitches.push(0x80, typeByte, (encX >> 4) & 0xFF,
        ((encX & 0x0F) << 4) | ((encY >> 8) & 0x0F), encY & 0xFF);
    }
  }

  const buf = new DynBuf();
  buf.writeStr('#PES0001');
  const pecOffsetPos = buf.pos;
  buf.writeU32LE(0);

  buf.writeU16LE(0x0001);
  buf.writeU16LE(1);
  buf.writeU16LE(0x0000);
  buf.writeFloat32LE(0);
  buf.writeFloat32LE(0);
  buf.writeFloat32LE(ms.hoopSize[0]);
  buf.writeFloat32LE(ms.hoopSize[1]);

  buf.writeU16LE(colorOrder.length);
  for (const ci of colorIndices) {
    buf.writeU8(ci); buf.writeU8(0); buf.writeU8(0);
    buf.writeU8(0); buf.writeU8(0); buf.writeU8(0);
  }

  while (buf.pos % 8 !== 0) buf.writeU8(0);
  const pecStart = buf.pos;
  buf.patchU32LE(pecOffsetPos, pecStart);

  const label = 'LA:design';
  buf.writeStr(label);
  for (let i = label.length; i < 19; i++) buf.writeU8(0x20);
  buf.writeU8(0x0D);
  buf.writeU8(0x20);
  for (let i = 0; i < 13; i++) buf.writeU8(0x20);
  buf.writeU8(numColorChanges);
  buf.writeU8(0x20);
  for (const ci of colorIndices) buf.writeU8(ci);

  const headerUsed = 35 + colorOrder.length;
  for (let i = 0; i < 512 - headerUsed; i++) buf.writeU8(0x20);

  for (const b of pecStitches) buf.writeU8(b);
  return buf.toUint8Array();
}

// ═══════════════════════════════════════════════════════════════════════════
//  JEF ENCODER (Janome)
// ═══════════════════════════════════════════════════════════════════════════

const JANOME_THREADS = [
  [0,0,0,0],[255,255,255,1],[255,0,0,2],[0,200,0,3],
  [0,0,255,4],[255,255,0,5],[255,0,255,6],[0,255,255,7],
  [255,128,0,8],[128,0,128,9],[0,128,0,10],[128,64,0,11],
  [255,192,203,12],[192,192,192,13],[128,128,128,14],
];

function nearestJanomeThread(hex) {
  if (!hex || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return 0;
  let best = 0, bestD = Infinity;
  for (const t of JANOME_THREADS) {
    const d = Math.hypot(r - t[0], g - t[1], b - t[2]);
    if (d < bestD) { bestD = d; best = t[3]; }
  }
  return best;
}

function encodeJEF(stitches, ms, stitchPaths) {
  const colorOrder = [];
  const seenColors = new Set();
  for (const path of stitchPaths) {
    const c = path.color || '#000000';
    if (!seenColors.has(c)) { seenColors.add(c); colorOrder.push(c); }
  }

  const buf = new DynBuf();
  const dataOffsetPos = buf.pos;
  buf.writeU32LE(0);
  buf.writeU32LE(0);
  buf.writeU32LE(0);

  const stitchCount = stitches.filter(s => s.type === 'stitch').length;
  buf.writeU32LE(stitchCount);
  buf.writeU32LE(colorOrder.length);
  buf.writeS16LE(Math.round(ms.hoopSize[0] * 10));
  buf.writeS16LE(Math.round(ms.hoopSize[1] * 10));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of stitches) {
    if (s.type === 'stitch') {
      const x10 = Math.round(s.x * 10), y10 = Math.round(s.y * 10);
      minX = Math.min(minX, x10); minY = Math.min(minY, y10);
      maxX = Math.max(maxX, x10); maxY = Math.max(maxY, y10);
    }
  }
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
  buf.writeS16LE(minX); buf.writeS16LE(minY);
  buf.writeS16LE(maxX); buf.writeS16LE(maxY);

  for (let i = 0; i < 12; i++) buf.writeU32LE(0);

  for (const c of colorOrder) buf.writeU32LE(nearestJanomeThread(c));
  while (buf.pos < 256) buf.writeU8(0);
  buf.patchU32LE(dataOffsetPos, buf.pos);

  let cx = 0, cy = 0;
  for (const s of stitches) {
    const x = Math.round(s.x * 10), y = Math.round(s.y * 10);
    const dx = x - cx, dy = y - cy;

    if (s.type === 'end') {
      buf.writeS16LE(-32765); buf.writeS16LE(-32765); break;
    }
    if (s.type === 'colorChange' || s.type === 'trim') {
      buf.writeS16LE(-32767); buf.writeS16LE(-32767); continue;
    }
    if (s.type === 'jump') {
      buf.writeS16LE(-32768); buf.writeS16LE(dy);
    } else {
      buf.writeS16LE(dx); buf.writeS16LE(dy);
    }
    cx = x; cy = y;
  }

  return buf.toUint8Array();
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXP ENCODER (Melco)
// ═══════════════════════════════════════════════════════════════════════════

function encodeEXP(stitches) {
  const records = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    const x = Math.round(s.x * 10);
    const y = Math.round(s.y * 10);
    const dx = x - cx;
    const dy = y - cy;
    cx = x; cy = y;

    if (s.type === 'end') { records.push(0x80, 0x16); break; }
    if (s.type === 'colorChange' || s.type === 'trim') { records.push(0x80, 0x01); continue; }

    const isJump = s.type === 'jump';
    let cmd;
    if (dx >= 0) cmd = Math.min(dx, 127);
    else cmd = 256 + Math.max(dx, -128);
    if (isJump) cmd |= 0x80;

    let dyByte;
    if (dy >= 0) dyByte = Math.min(dy, 127);
    else dyByte = 256 + Math.max(dy, -128);

    records.push(cmd & 0xFF, dyByte & 0xFF);
  }

  return new Uint8Array(records);
}

// ═══════════════════════════════════════════════════════════════════════════
//  DYNAMIC BUFFER
// ═══════════════════════════════════════════════════════════════════════════

class DynBuf {
  constructor() { this._buf = []; this.pos = 0; }
  writeU8(v) { this._buf.push(v & 0xFF); this.pos++; }
  writeU16LE(v) { this.writeU8(v & 0xFF); this.writeU8((v >> 8) & 0xFF); }
  writeU16BE(v) { this.writeU8((v >> 8) & 0xFF); this.writeU8(v & 0xFF); }
  writeU32LE(v) { this.writeU16LE(v & 0xFFFF); this.writeU16LE((v >>> 16) & 0xFFFF); }
  writeU32BE(v) { this.writeU8((v>>>24)&0xFF); this.writeU8((v>>>16)&0xFF); this.writeU8((v>>>8)&0xFF); this.writeU8(v&0xFF); }
  writeS16LE(v) { const u = v < 0 ? v + 65536 : v; this.writeU16LE(u); }
  writeS16BE(v) { const u = v < 0 ? v + 65536 : v; this.writeU16BE(u); }
  writeFloat32LE(v) { const buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, v, true); for (const b of new Uint8Array(buf)) this.writeU8(b); }
  writeStr(s) { for (let i = 0; i < s.length; i++) this.writeU8(s.charCodeAt(i)); }
  writeBytes(arr) { for (const b of arr) this.writeU8(b); }
  patchU32LE(offset, v) {
    this._buf[offset] = v & 0xFF;
    this._buf[offset+1] = (v >> 8) & 0xFF;
    this._buf[offset+2] = (v >> 16) & 0xFF;
    this._buf[offset+3] = (v >>> 24) & 0xFF;
  }
  toUint8Array() { return new Uint8Array(this._buf); }
}