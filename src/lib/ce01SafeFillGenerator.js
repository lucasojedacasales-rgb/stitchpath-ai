/**
 * ce01SafeFillGenerator.js — Direct command generation for CE01-safe fill
 * ─────────────────────────────────────────────────────────────────────────────
 * Bypasses processObjectStitches entirely for fill objects in ce01SafeFillMode.
 * Generates stitch/jump commands directly with strict polygon clipping,
 * serpentine traversal, long-stitch splitting, micro-stitch merging, and
 * per-region validation with automatic spacing retry (0.7 → 0.8 → 0.9mm).
 *
 * Each command includes:
 *   { type, x, y, regionId, blockId, stitchType: "fill", source: "ce01_safe_fill", color }
 */

const MAX_STITCH_MM = 7.5;
const MIN_STITCH_MM = 0.8;
const CONNECT_THRESHOLD = 7.5; // mm — stitch if connection < this and inside
const TATAMI_PHASES = [0, 0.25, 0.5, 0.75];
const SPACING_RETRIES = [0.7, 0.8, 0.9];
const MIN_INTERVAL_MM = 1.5;
const MIN_ISLAND_AREA_MM2 = 1.5;
const NEEDLE_INSET_MM = 0.3;

// ═══════════════════════════════════════════════════════════════════════════
//  UNION-FIND
// ═══════════════════════════════════════════════════════════════════════════

class UnionFind {
  constructor(n) { this.p = Array.from({length:n},(_,i)=>i); this.r = Array(n).fill(0); }
  find(x) { if (this.p[x]!==x) this.p[x]=this.find(this.p[x]); return this.p[x]; }
  union(a,b) { const ra=this.find(a),rb=this.find(b); if(ra===rb)return;
    if(this.r[ra]<this.r[rb]) this.p[ra]=rb; else if(this.r[ra]>this.r[rb]) this.p[rb]=ra;
    else { this.p[rb]=ra; this.r[ra]++; } }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════

export function generateCE01SafeFillCommands(obj, options = {}) {
  const { machineSettings = {}, designOffset = [0, 0] } = options;
  const [offX, offY] = designOffset;
  const polygonMm = obj.points;
  const angleDeg = obj.angle ?? 45;
  const regionId = obj.id || 'fill';
  const color = obj.color || '#000000';
  const blockId = regionId;

  const log = (m) => console.log(`[ce01-fill] ${m}`);
  log(`region: ${regionId}`);

  if (!polygonMm || polygonMm.length < 3) return [];

  // Try spacings in order until validation passes
  let bestCmds = [];
  let bestValidation = null;

  for (const spacing of SPACING_RETRIES) {
    const cmds = _generateAtSpacing(polygonMm, spacing, angleDeg, offX, offY, regionId, blockId, color, log);
    const v = _validate(cmds, polygonMm, offX, offY);
    log(`final validation (spacing=${spacing}): stitches=${v.stitches} jumps=${v.jumps} outside=${v.outside} long=${v.long} micro=${v.micro}`);

    if (v.outside === 0 && v.long === 0 && v.jumps <= 100) {
      return cmds;
    }
    if (!bestValidation || v.outside < bestValidation.outside || (v.outside === bestValidation.outside && v.jumps < bestValidation.jumps)) {
      bestCmds = cmds;
      bestValidation = v;
    }
  }

  return bestCmds;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERATE AT SPECIFIC SPACING
// ═══════════════════════════════════════════════════════════════════════════

function _generateAtSpacing(polygon, spacing, angleDeg, offX, offY, regionId, blockId, color, log) {
  log(`spacing used: ${spacing}mm`);

  // ── Rotation ──
  const rad = (angleDeg * Math.PI) / 180;
  const cF = Math.cos(-rad), sF = Math.sin(-rad);
  const cB = Math.cos(rad), sB = Math.sin(rad);
  const toF = (x, y) => [x * cF - y * sF, x * sF + y * cF];
  const toW = (x, y) => [x * cB - y * sB, x * sB + y * cB];

  const rp = polygon.map(([x, y]) => toF(x, y));
  const minY = Math.min(...rp.map(p => p[1]));
  const maxY = Math.max(...rp.map(p => p[1]));
  const minX = Math.min(...rp.map(p => p[0]));
  const maxX = Math.max(...rp.map(p => p[0]));
  if (maxY - minY < spacing || maxX - minX < spacing) return [];

  // ── 1. Scanlines ──
  const scanlines = [];
  let rowIdx = 0;
  for (let ry = minY + spacing * 0.5; ry < maxY; ry += spacing) {
    const xs = _edgeIntersections(rp, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < MIN_INTERVAL_MM) continue;
      intervals.push({ xL: xs[i], xR: xs[i + 1], y: ry, rowIdx });
    }
    if (intervals.length === 0) { rowIdx++; continue; }
    scanlines.push({ y: ry, rowIdx, intervals });
    rowIdx++;
  }
  log(`scanlines: ${scanlines.length}`);
  log(`intervals: ${scanlines.reduce((s, sl) => s + sl.intervals.length, 0)}`);

  // ── 2. Merge tiny intervals within scanlines ──
  for (const sl of scanlines) {
    if (sl.intervals.length < 2) continue;
    const merged = [sl.intervals[0]];
    for (let i = 1; i < sl.intervals.length; i++) {
      const prev = merged[merged.length - 1];
      const gap = sl.intervals[i].xL - prev.xR;
      if (gap < 1.5 && (sl.intervals[i].xR - sl.intervals[i].xL < MIN_INTERVAL_MM * 2 || prev.xR - prev.xL < MIN_INTERVAL_MM * 2)) {
        prev.xR = Math.max(prev.xR, sl.intervals[i].xR);
      } else {
        merged.push(sl.intervals[i]);
      }
    }
    sl.intervals = merged.filter(iv => iv.xR - iv.xL >= MIN_INTERVAL_MM);
  }

  // ── 3. Build islands ──
  let islands = _buildIslands(scanlines);
  log(`islands: ${islands.length}`);

  // Remove tiny islands
  islands = islands.filter(isl => {
    const w = isl.bbox.maxX - isl.bbox.minX;
    const h = isl.bbox.maxY - isl.bbox.minY;
    return w * h >= MIN_ISLAND_AREA_MM2;
  });
  if (islands.length === 0) return [];

  // ── 4. Order islands by nearest-neighbor ──
  _orderIslandsNN(islands);

  // ── 5. Traverse serpentine → commands ──
  const commands = [];
  let jumpCount = 0;

  const mkCmd = (type, wx, wy) => ({
    type, x: wx + offX, y: wy + offY,
    regionId, blockId, stitchType: 'fill', source: 'ce01_safe_fill', color,
  });

  for (let iIdx = 0; iIdx < islands.length; iIdx++) {
    const island = islands[iIdx];
    island.intervals.sort((a, b) => a.y - b.y);

    // Jump to island start
    if (commands.length > 0) {
      const first = island.intervals[0];
      const [wx, wy] = toW(first.xL + NEEDLE_INSET_MM, first.y);
      commands.push(mkCmd('jump', wx, wy));
      jumpCount++;
    }

    for (let rIdx = 0; rIdx < island.intervals.length; rIdx++) {
      const iv = island.intervals[rIdx];
      const forward = (rIdx % 2) === 0;
      const brickOff = TATAMI_PHASES[rIdx % 4] * 3.0; // stitchLen 3mm
      let needles = _placeNeedles(iv.xL, iv.xR, 3.0, brickOff, forward);
      if (needles.length < 1) continue;

      // Connect from previous row
      if (rIdx > 0 && commands.length > 0) {
        const prevCmd = commands[commands.length - 1];
        const prevX = prevCmd.x - offX, prevY = prevCmd.y - offY;
        const [nx, ny] = toW(needles[0], iv.y);
        const connDist = Math.hypot(nx - prevX, ny - prevY);

        if (connDist < MIN_STITCH_MM) {
          needles = needles.slice(1);
          if (needles.length === 0) continue;
        } else if (connDist > CONNECT_THRESHOLD || !_midpointInside(prevX, prevY, nx, ny, polygon)) {
          // Jump to start of this row
          commands.push(mkCmd('jump', nx, ny));
          jumpCount++;
        }
        // else: safe stitch connection — needles[0] will be a stitch
      }

      // Emit stitch commands
      for (let i = 0; i < needles.length; i++) {
        const [wx, wy] = toW(needles[i], iv.y);
        // Strict inside check — skip if outside
        if (!_pointInPolygon(wx, wy, polygon)) continue;
        commands.push(mkCmd('stitch', wx, wy));
      }
    }
  }

  log(`stitches generated: ${commands.filter(c => c.type === 'stitch').length}`);
  log(`jumps generated: ${jumpCount}`);

  // ── 6. Post-process: split long, merge micro ──
  const processed = _postProcess(commands, polygon, offX, offY, log);

  return processed;
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST-PROCESS (split long, merge micro, validate inside)
// ═══════════════════════════════════════════════════════════════════════════

function _postProcess(commands, polygon, offX, offY, log) {
  const out = [];
  let splitCount = 0, mergeCount = 0, rejectedCount = 0;
  let prevX = null, prevY = null;

  for (const cmd of commands) {
    const localX = cmd.x - offX, localY = cmd.y - offY;

    if (cmd.type === 'jump') {
      out.push(cmd);
      prevX = cmd.x; prevY = cmd.y;
      continue;
    }

    // Strict inside check
    if (!_pointInPolygon(localX, localY, polygon)) {
      rejectedCount++;
      continue; // drop outside stitches entirely
    }

    // Merge micro
    if (prevX !== null) {
      const d = Math.hypot(cmd.x - prevX, cmd.y - prevY);
      if (d < MIN_STITCH_MM && d > 0) { mergeCount++; continue; }
    }

    // Split long
    if (prevX !== null) {
      const d = Math.hypot(cmd.x - prevX, cmd.y - prevY);
      if (d > MAX_STITCH_MM) {
        const steps = Math.ceil(d / MAX_STITCH_MM);
        for (let s = 1; s < steps; s++) {
          const mx = prevX + (cmd.x - prevX) * s / steps;
          const my = prevY + (cmd.y - prevY) * s / steps;
          if (_pointInPolygon(mx - offX, my - offY, polygon)) {
            out.push({ ...cmd, x: mx, y: my });
          }
        }
        splitCount++;
      }
    }

    out.push(cmd);
    prevX = cmd.x; prevY = cmd.y;
  }

  log(`outside rejected: ${rejectedCount}`);
  log(`long split: ${splitCount}`);
  log(`micro merged: ${mergeCount}`);

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function _validate(commands, polygon, offX, offY) {
  let stitches = 0, jumps = 0, outside = 0, longS = 0, microS = 0;
  let prevX = null, prevY = null;
  for (const cmd of commands) {
    if (cmd.type === 'jump') { jumps++; prevX = cmd.x; prevY = cmd.y; continue; }
    stitches++;
    if (!_pointInPolygon(cmd.x - offX, cmd.y - offY, polygon)) outside++;
    if (prevX !== null) {
      const d = Math.hypot(cmd.x - prevX, cmd.y - prevY);
      if (d > 7.5) longS++;
      if (d > 0 && d < 0.8) microS++;
    }
    prevX = cmd.x; prevY = cmd.y;
  }
  return { stitches, jumps, outside, long: longS, micro: microS };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ISLAND BUILDING
// ═══════════════════════════════════════════════════════════════════════════

function _buildIslands(scanlines) {
  const all = [];
  const byRow = new Map();
  for (const sl of scanlines) {
    byRow.set(sl.rowIdx, sl.intervals);
    for (const iv of sl.intervals) { iv._idx = all.length; all.push(iv); }
  }
  const uf = new UnionFind(all.length);
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  for (let r = 0; r < rows.length - 1; r++) {
    const a = byRow.get(rows[r]), b = byRow.get(rows[r + 1]);
    for (const ia of a) for (const ib of b) {
      if (ia.xL < ib.xR + 1.0 && ib.xL < ia.xR + 1.0) uf.union(ia._idx, ib._idx);
    }
  }
  const map = new Map();
  for (let i = 0; i < all.length; i++) {
    const root = uf.find(i);
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(all[i]);
  }
  let id = 0;
  const islands = [];
  for (const [, intervals] of map) {
    let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
    for (const iv of intervals) {
      mnx=Math.min(mnx,iv.xL); mxx=Math.max(mxx,iv.xR);
      mny=Math.min(mny,iv.y); mxy=Math.max(mxy,iv.y);
    }
    islands.push({ islandId: id++, intervals, bbox: { minX:mnx, maxX:mxx, minY:mny, maxY:mxy } });
  }
  return islands;
}

function _orderIslandsNN(islands) {
  if (islands.length <= 1) return;
  const ordered = [islands[0]];
  const remaining = islands.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(remaining[i].bbox.minX - last.bbox.maxX, remaining[i].bbox.minY - last.bbox.maxY);
      if (d < bd) { bd = d; bi = i; }
    }
    ordered.push(remaining.splice(bi, 1)[0]);
  }
  islands.length = 0;
  islands.push(...ordered);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _midpointInside(x1, y1, x2, y2, poly) {
  return _pointInPolygon((x1 + x2) / 2, (y1 + y2) / 2, poly);
}

function _pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function _edgeIntersections(poly, ry) {
  const xs = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    if ((ay <= ry && by > ry) || (by <= ry && ay > ry)) {
      xs.push(ax + ((ry - ay) / (by - ay)) * (bx - ax));
    }
  }
  return xs;
}

function _placeNeedles(xL, xR, pitch, brickOff, forward) {
  const aL = xL + NEEDLE_INSET_MM;
  const aR = xR - NEEDLE_INSET_MM;
  if (aR - aL < MIN_STITCH_MM) return [];
  const phase = ((brickOff % pitch) + pitch) % pitch;
  const needles = [aL];
  let nx = aL + phase;
  if (nx <= aL + MIN_STITCH_MM) nx += pitch;
  while (nx < aR - MIN_STITCH_MM) { needles.push(nx); nx += pitch; }
  needles.push(aR);
  const out = [needles[0]];
  for (let i = 1; i < needles.length; i++) {
    if (needles[i] - out[out.length - 1] >= MIN_STITCH_MM) out.push(needles[i]);
  }
  return forward ? out : out.reverse();
}