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
      ...machineSettings,
    };

    // ── Flatten all points into a unified stitch list ─────────────────────────
    // Each stitch: { x, y, type: 'stitch'|'jump'|'colorChange'|'end', color }
    const stitches = flattenStitches(stitchPaths, ms);

    // ── Validation ────────────────────────────────────────────────────────────
    const warnings = validateStitches(stitches, ms);

    // ── Encode ────────────────────────────────────────────────────────────────
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
      fileBuffer = encodeVP3(stitches, ms, stitchPaths);
      mimeType = 'application/octet-stream';
      ext = 'vp3';
    } else {
      return Response.json({ error: `Unsupported format: ${format}` }, { status: 400 });
    }

    // ── Checksum (simple XOR) ─────────────────────────────────────────────────
    let checksum = 0;
    for (let i = 0; i < fileBuffer.length; i++) checksum ^= fileBuffer[i];

    // Return binary directly
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── FLATTEN ────────────────────────────────────────────────────────────────────

function flattenStitches(stitchPaths, ms) {
  const [offX, offY] = ms.designOffset || [0, 0];
  const all = [];
  let prevColor = null;

  for (const path of stitchPaths) {
    const pts = path.points || [];
    if (pts.length === 0) continue;

    if (prevColor !== null && path.color !== prevColor) {
      all.push({ x: all[all.length - 1]?.x || 0, y: all[all.length - 1]?.y || 0, type: 'colorChange', color: path.color });
    }
    prevColor = path.color;

    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0] + offX;
      const y = pts[i][1] + offY;
      // Check if we need to insert jump (gap > maxJumpLength from last stitch)
      if (i === 0 && all.length > 0) {
        const last = all[all.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist > ms.maxJumpLength) {
          // Break jump into sub-jumps
          const steps = Math.ceil(dist / ms.maxJumpLength);
          for (let s = 1; s < steps; s++) {
            all.push({ x: last.x + (x - last.x) * s / steps, y: last.y + (y - last.y) * s / steps, type: 'jump', color: path.color });
          }
          all.push({ x, y, type: 'jump', color: path.color });
          continue;
        }
      }

      // Break long stitches
      if (all.length > 0 && i > 0) {
        const last = all[all.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist > ms.maxStitchLength) {
          const steps = Math.ceil(dist / ms.maxStitchLength);
          for (let s = 1; s < steps; s++) {
            all.push({ x: last.x + (x - last.x) * s / steps, y: last.y + (y - last.y) * s / steps, type: 'stitch', color: path.color });
          }
        }
      }

      all.push({ x, y, type: i === 0 ? 'jump' : 'stitch', color: path.color });
    }
  }

  all.push({ x: all[all.length - 1]?.x || 0, y: all[all.length - 1]?.y || 0, type: 'end', color: null });
  return all;
}

// ── VALIDATION ────────────────────────────────────────────────────────────────

function validateStitches(stitches, ms) {
  const warnings = [];
  const [hw, hh] = ms.hoopSize;
  let outOfHoop = 0;

  for (const s of stitches) {
    if (Math.abs(s.x) > hw / 2 || Math.abs(s.y) > hh / 2) outOfHoop++;
  }
  if (outOfHoop > 0) warnings.push(`${outOfHoop} stitches outside hoop (${hw}x${hh}mm)`);

  // Check for isolated stitches (jumps with no following stitches before next jump)
  let jumpStreak = 0, isolated = 0;
  for (const s of stitches) {
    if (s.type === 'jump') { jumpStreak++; }
    else if (s.type === 'stitch') { if (jumpStreak > 3) isolated++; jumpStreak = 0; }
    else { jumpStreak = 0; }
  }
  if (isolated > 0) warnings.push(`${isolated} potentially isolated stitch islands detected`);

  return warnings;
}

// ── DST ENCODER ───────────────────────────────────────────────────────────────

function encodeDST(stitches, ms) {
  const header = new Uint8Array(512);
  const label = 'design';
  for (let i = 0; i < label.length; i++) header[i] = label.charCodeAt(i);

  const records = [];
  let cx = 0, cy = 0;
  const UNIT = 0.1; // mm per DST unit

  const encodeRecord = (dx, dy, flags) => {
    // Clamp to +/- 121 units
    dx = Math.max(-121, Math.min(121, Math.round(dx)));
    dy = Math.max(-121, Math.min(121, Math.round(dy)));

    let b0 = 0, b1 = 0, b2 = flags;
    // Y bits
    if (dy > 0) { if (dy & 1) b0 |= 0x02; if (dy & 2) b0 |= 0x01; if (dy & 4) b1 |= 0x80; if (dy & 8) b1 |= 0x40; if (dy & 16) b1 |= 0x20; if (dy & 32) b0 |= 0x80; if (dy & 64) b0 |= 0x40; if (dy & 128) b2 |= 0x80; if (dy & 256) b2 |= 0x40; }
    else if (dy < 0) { const d = -dy; if (d & 1) b0 |= 0x08; if (d & 2) b0 |= 0x04; if (d & 4) b1 |= 0x08; if (d & 8) b1 |= 0x04; if (d & 16) b1 |= 0x02; if (d & 32) b0 |= 0x20; if (d & 64) b0 |= 0x10; if (d & 128) b2 |= 0x80; if (d & 256) b2 |= 0x40; }
    // X bits
    if (dx > 0) { if (dx & 1) b1 |= 0x01; if (dx & 2) b1 |= 0x02; if (dx & 4) b1 |= 0x10; if (dx & 8) b0 |= 0x40; if (dx & 16) b0 |= 0x80; if (dx & 32) b1 |= 0x04; if (dx & 64) b0 |= 0x01; if (dx & 128) b2 |= 0x20; if (dx & 256) b2 |= 0x10; }
    else if (dx < 0) { const d = -dx; if (d & 1) b1 |= 0x04; if (d & 2) b1 |= 0x08; if (d & 4) b1 |= 0x40; if (d & 8) b0 |= 0x04; if (d & 16) b0 |= 0x08; if (d & 32) b1 |= 0x10; if (d & 64) b0 |= 0x02; if (d & 128) b2 |= 0x20; if (d & 256) b2 |= 0x10; }

    records.push(b0, b1, b2);
  };

  for (const s of stitches) {
    const tx = Math.round(s.x / UNIT);
    const ty = Math.round(s.y / UNIT);
    const dx = tx - cx, dy = ty - cy;

    if (s.type === 'end') { records.push(0xF3, 0xF3, 0xF3); break; }
    else if (s.type === 'colorChange') { encodeRecord(0, 0, 0xC3); }
    else if (s.type === 'jump') { encodeRecord(dx, dy, 0x83); }
    else { encodeRecord(dx, dy, 0x03); }

    cx = tx; cy = ty;
  }

  const buf = new Uint8Array(512 + records.length);
  buf.set(header, 0);
  buf.set(new Uint8Array(records), 512);
  return buf;
}

// ── PES ENCODER ───────────────────────────────────────────────────────────────

// Minimal Brother thread palette (index → [R,G,B, code])
const BROTHER_THREADS = [
  [0,0,0,'BLK'],[255,255,255,'WHT'],[255,0,0,'RED'],[0,255,0,'GRN'],
  [0,0,255,'BLU'],[255,255,0,'YEL'],[255,0,255,'MGT'],[0,255,255,'CYN'],
  [255,128,0,'ORG'],[128,0,128,'PUR'],[0,128,0,'DGRN'],[128,64,0,'BRN'],
  [255,192,203,'PNK'],[192,192,192,'SLV'],[128,128,128,'GRY'],
];

function nearestThreadIdx(hex, palette) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = Math.hypot(r - palette[i][0], g - palette[i][1], b - palette[i][2]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function encodePES(stitches, ms, stitchPaths) {
  const colors = [...new Set(stitchPaths.map(p => p.color))];
  const colorIndices = colors.map(c => nearestThreadIdx(c, BROTHER_THREADS));

  // Build PEC stitch data (simplified)
  const pecStitches = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    const x = Math.round(s.x * 10), y = Math.round(s.y * 10); // 0.1mm units
    const dx = Math.max(-2047, Math.min(2047, x - cx));
    const dy = Math.max(-2047, Math.min(2047, y - cy));
    cx = x; cy = y;

    if (s.type === 'end') { pecStitches.push(0xFF, 0x00); break; }
    if (s.type === 'colorChange') { pecStitches.push(0xFE, 0xB0, colorIndices[0] || 0); continue; }

    const isJump = s.type === 'jump';
    // Encode delta in PEC format (12-bit signed per axis)
    const encX = dx < 0 ? (dx + 4096) : dx;
    const encY = dy < 0 ? (dy + 4096) : dy;
    if (isJump) {
      pecStitches.push(0x80, 0x04, (encX >> 4) & 0xFF, ((encX & 0xF) << 4) | ((encY >> 8) & 0xF), encY & 0xFF);
    } else {
      // Normal stitch: 2 bytes if fits in 7-bit signed
      if (dx >= -64 && dx <= 63 && dy >= -64 && dy <= 63) {
        pecStitches.push(dx < 0 ? dx + 128 : dx, dy < 0 ? dy + 128 : dy);
      } else {
        pecStitches.push(0x80, 0x04, (encX >> 4) & 0xFF, ((encX & 0xF) << 4) | ((encY >> 8) & 0xF), encY & 0xFF);
      }
    }
  }

  // Assemble PES file
  const buf = new DynBuf();
  // Magic + PEC offset placeholder
  buf.writeStr('#PES0001');
  const pecOffsetPos = buf.pos;
  buf.writeU32LE(0); // will patch

  // Minimal SEW section (empty)
  buf.writeU16LE(0); // hoop type 0 = 100x100
  buf.writeU16LE(0);
  buf.writeU16LE(colors.length);
  for (const ci of colorIndices) buf.writeU8(ci);

  // Align to PEC
  while (buf.pos % 8 !== 0) buf.writeU8(0);
  const pecStart = buf.pos;
  buf.patchU32LE(pecOffsetPos, pecStart);

  // PEC header
  buf.writeStr('LA:design         \r');
  buf.writeU8(0x20); // padding
  for (let i = 0; i < 13; i++) buf.writeU8(0x20);
  buf.writeU8(colors.length - 1);
  buf.writeU8(0x20);
  for (const ci of colorIndices) buf.writeU8(ci);
  // Pad color table to 463 bytes from PEC start
  while (buf.pos - pecStart < 512) buf.writeU8(0x20);

  // Stitch data
  for (const b of pecStitches) buf.writeU8(b);

  return buf.toUint8Array();
}

// ── JEF ENCODER ───────────────────────────────────────────────────────────────

const JANOME_THREADS = [
  [0,0,0,0],[255,255,255,1],[255,0,0,2],[0,200,0,3],
  [0,0,255,4],[255,255,0,5],[255,0,255,6],[0,255,255,7],
  [255,128,0,8],[128,0,128,9],[0,128,0,10],[128,64,0,11],
  [255,192,203,12],[192,192,192,13],[128,128,128,14],
];

function nearestJanomeThread(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  let best = 0, bestD = Infinity;
  for (const t of JANOME_THREADS) {
    const d = Math.hypot(r-t[0], g-t[1], b-t[2]);
    if (d < bestD) { bestD = d; best = t[3]; }
  }
  return best;
}

function encodeJEF(stitches, ms, stitchPaths) {
  const colors = [...new Set(stitchPaths.map(p => p.color))];
  const buf = new DynBuf();

  // JEF header
  const dataOffsetPos = buf.pos;
  buf.writeU32LE(0); // data offset (patch later)
  buf.writeU32LE(0); // date (unused)
  buf.writeU32LE(0); // time
  buf.writeU32LE(stitches.filter(s => s.type === 'stitch').length); // stitch count
  buf.writeU32LE(colors.length);
  buf.writeS16LE(Math.round(ms.hoopSize[0] * 10)); // hoop width in 0.1mm
  buf.writeS16LE(Math.round(ms.hoopSize[1] * 10));
  buf.writeS16LE(0); buf.writeS16LE(0); // unknown

  // Color table (colors × 4 bytes each)
  for (const c of colors) {
    const idx = nearestJanomeThread(c);
    buf.writeU32LE(idx);
  }

  // Pad to 256 bytes header
  while (buf.pos < 256) buf.writeU8(0);
  buf.patchU32LE(dataOffsetPos, buf.pos);

  // Stitch data: each stitch = 2 × S16LE (dx, dy in 0.1mm units)
  let cx = 0, cy = 0;
  for (const s of stitches) {
    const x = Math.round(s.x * 10), y = Math.round(s.y * 10);
    if (s.type === 'end') { buf.writeS16LE(0x8001); buf.writeS16LE(0x8001); break; }
    if (s.type === 'colorChange') { buf.writeS16LE(0x8002); buf.writeS16LE(0x8002); continue; }
    if (s.type === 'jump') { buf.writeS16LE(0x8000 | (x - cx)); buf.writeS16LE(y - cy); }
    else { buf.writeS16LE(x - cx); buf.writeS16LE(y - cy); }
    cx = x; cy = y;
  }

  return buf.toUint8Array();
}

// ── EXP ENCODER (Melco) ───────────────────────────────────────────────────────

function encodeEXP(stitches) {
  const records = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    const x = Math.round(s.x * 10), y = Math.round(s.y * 10);
    if (s.type === 'end') { records.push(0x80, 0x16); break; }
    if (s.type === 'colorChange') { records.push(0x80, 0x01); continue; }
    const dx = x - cx, dy = y - cy;
    cx = x; cy = y;
    const flags = s.type === 'jump' ? 0x04 : 0x00;
    records.push(flags | (dx & 0x7F), dy & 0xFF);
  }

  return new Uint8Array(records);
}

// ── VP3 ENCODER (Pfaff/Husqvarna) ────────────────────────────────────────────

function encodeVP3(stitches, ms, stitchPaths) {
  const buf = new DynBuf();
  const colors = [...new Set(stitchPaths.map(p => p.color))];

  // VP3 magic
  buf.writeStr('%VP3%');
  buf.writeU32BE(0); // version
  buf.writeU32BE(stitches.filter(s => s.type === 'stitch').length);
  buf.writeU16BE(colors.length);

  // Color blocks
  let cx = 0, cy = 0;
  let currentColor = null;
  let blockBuf = new DynBuf();

  const flushBlock = () => {
    if (blockBuf.pos > 0) {
      const rgb = currentColor ? [parseInt(currentColor.slice(1,3),16), parseInt(currentColor.slice(3,5),16), parseInt(currentColor.slice(5,7),16)] : [0,0,0];
      buf.writeU8(rgb[0]); buf.writeU8(rgb[1]); buf.writeU8(rgb[2]);
      buf.writeU32BE(blockBuf.pos);
      buf.writeBytes(blockBuf.toUint8Array());
      blockBuf = new DynBuf();
    }
  };

  for (const s of stitches) {
    if (s.type === 'colorChange' || s.type === 'end') {
      flushBlock();
      currentColor = s.color;
      if (s.type === 'end') break;
      continue;
    }
    if (currentColor === null) currentColor = s.color;

    const x = Math.round(s.x * 10), y = Math.round(s.y * 10);
    const dx = x - cx, dy = y - cy;
    cx = x; cy = y;

    // VP3: 2-byte delta, MSB = jump flag
    const flags = s.type === 'jump' ? 0x8000 : 0;
    blockBuf.writeS16BE(flags | (dx & 0x7FFF));
    blockBuf.writeS16BE(dy);
  }
  flushBlock();

  return buf.toUint8Array();
}

// ── Dynamic Buffer Helper ─────────────────────────────────────────────────────

class DynBuf {
  constructor() { this._buf = []; this.pos = 0; }
  writeU8(v) { this._buf.push(v & 0xFF); this.pos++; }
  writeU16LE(v) { this.writeU8(v & 0xFF); this.writeU8((v >> 8) & 0xFF); }
  writeU16BE(v) { this.writeU8((v >> 8) & 0xFF); this.writeU8(v & 0xFF); }
  writeU32LE(v) { this.writeU16LE(v & 0xFFFF); this.writeU16LE((v >>> 16) & 0xFFFF); }
  writeU32BE(v) { this.writeU8((v>>>24)&0xFF); this.writeU8((v>>>16)&0xFF); this.writeU8((v>>>8)&0xFF); this.writeU8(v&0xFF); }
  writeS16LE(v) { const u = v < 0 ? v + 65536 : v; this.writeU16LE(u); }
  writeS16BE(v) { const u = v < 0 ? v + 65536 : v; this.writeU16BE(u); }
  writeStr(s) { for (let i = 0; i < s.length; i++) this.writeU8(s.charCodeAt(i)); }
  writeBytes(arr) { for (const b of arr) this.writeU8(b); this.pos += arr.length - arr.length; } // pos already tracked
  patchU32LE(offset, v) {
    this._buf[offset]   = v & 0xFF;
    this._buf[offset+1] = (v >> 8) & 0xFF;
    this._buf[offset+2] = (v >> 16) & 0xFF;
    this._buf[offset+3] = (v >> 24) & 0xFF;
  }
  toUint8Array() { return new Uint8Array(this._buf); }
}