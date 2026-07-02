/**
 * clippedFillGenerator.js — Polygon-clipped scanline fill with island optimization
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates fill stitches INSIDE a polygon using scanline intersection,
 * grouped into connected "islands" and traversed serpentine (boustrophedon)
 * to minimize jumps and micro stitches.
 *
 * Algorithm:
 *   1. Rotate polygon so fill rows are horizontal
 *   2. Scanline top→bottom → intervals (inside spans) per row
 *   3. Merge tiny intervals within scanlines
 *   4. Group intervals into islands (connected components across rows)
 *   5. Order islands by nearest-neighbor
 *   6. Traverse each island serpentine: connect adjacent rows with stitches
 *      (jump only when connection exits polygon or is too long)
 *   7. Post-process: split long (>7.5mm), merge micro (<0.8mm)
 *   8. Validate: pointInPolygon safety check
 *
 * Returns: Array<[x_mm, y_mm, 'J'|'S']>  ('J'=jump, 'S'=stitch, default 'S')
 */

const MAX_STITCH_MM = 7.5;
const MIN_STITCH_MM = 0.8;
const CONNECT_THRESHOLD = 6.0; // mm — stitch connection if < this and inside
const TATAMI_PHASES = [0, 0.25, 0.5, 0.75];
const MAX_ROWS = 150; // cap scanlines to limit density

// ═══════════════════════════════════════════════════════════════════════════
//  UNION-FIND (for island grouping)
// ═══════════════════════════════════════════════════════════════════════════

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
  }
  find(x) {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) { this.parent[ra] = rb; }
    else if (this.rank[ra] > this.rank[rb]) { this.parent[rb] = ra; }
    else { this.parent[rb] = ra; this.rank[ra]++; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════

export function generateClippedFillStitches(polygonMm, options = {}) {
  const {
    densityMm = 0.4,
    stitchLenMm = 3.0,
    angleDeg = 0,
    regionId = 'unknown',
  } = options;

  const log = (msg) => console.log(`[fill-opt] ${msg}`);
  log(`region: ${regionId}`);

  if (!polygonMm || polygonMm.length < 3) return [];

  // ── Rotation to fill-space ───────────────────────────────────────────────
  const rad = (angleDeg * Math.PI) / 180;
  const cF = Math.cos(-rad), sF = Math.sin(-rad);
  const cB = Math.cos(rad), sB = Math.sin(rad);
  const toF = (x, y) => [x * cF - y * sF, x * sF + y * cF];
  const toW = (x, y) => [x * cB - y * sB, x * sB + y * cB];

  const rp = polygonMm.map(([x, y]) => toF(x, y));
  const minY = Math.min(...rp.map(p => p[1]));
  const maxY = Math.max(...rp.map(p => p[1]));
  const minX = Math.min(...rp.map(p => p[0]));
  const maxX = Math.max(...rp.map(p => p[0]));
  if (maxY - minY < densityMm || maxX - minX < densityMm) return [];

  // ── Adaptive density: cap rows to limit stitch count ─────────────────────
  let effDensity = densityMm;
  const estRows = (maxY - minY) / effDensity;
  if (estRows > MAX_ROWS) {
    effDensity = (maxY - minY) / MAX_ROWS;
    log(`density before/after: ${densityMm.toFixed(2)}/${effDensity.toFixed(2)}mm (row cap ${MAX_ROWS})`);
  } else {
    log(`density before/after: ${densityMm.toFixed(2)}/${effDensity.toFixed(2)}mm`);
  }

  // ── 1. Generate scanlines with intervals ─────────────────────────────────
  const scanlines = [];
  let rowIdx = 0;
  for (let ry = minY + effDensity * 0.5; ry < maxY; ry += effDensity) {
    const xs = _edgeIntersections(rp, ry);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 0.5) continue;
      intervals.push({ xL: xs[i], xR: xs[i + 1], y: ry, rowIdx });
    }
    if (intervals.length === 0) { rowIdx++; continue; }
    scanlines.push({ y: ry, rowIdx, intervals });
    rowIdx++;
  }
  const totalRawIntervals = scanlines.reduce((s, sl) => s + sl.intervals.length, 0);
  log(`raw intervals: ${totalRawIntervals}`);

  // ── 2. Merge tiny intervals within scanlines ─────────────────────────────
  let mergedTiny = 0;
  for (const sl of scanlines) {
    const ivs = sl.intervals;
    if (ivs.length < 2) continue;
    const merged = [ivs[0]];
    for (let i = 1; i < ivs.length; i++) {
      const prev = merged[merged.length - 1];
      const gap = ivs[i].xL - prev.xR;
      if (gap < 1.2 && (ivs[i].xR - ivs[i].xL < 1.2 || prev.xR - prev.xL < 1.2)) {
        prev.xR = Math.max(prev.xR, ivs[i].xR);
        mergedTiny++;
      } else {
        merged.push(ivs[i]);
      }
    }
    sl.intervals = merged.filter(iv => iv.xR - iv.xL >= 0.5);
  }
  log(`merged tiny intervals: ${mergedTiny}`);

  // ── 3. Build islands (connected components across scanlines) ─────────────
  const islands = _buildIslands(scanlines);
  log(`islands built: ${islands.length}`);

  // ── 4. Order islands by nearest-neighbor ─────────────────────────────────
  _orderIslandsNN(islands);
  log(`serpentine order: ${islands.map(i => i.islandId).join(',')}`);

  // ── 5. Traverse islands serpentine ───────────────────────────────────────
  const rawPoints = [];
  let jumpCount = 0;

  for (let iIdx = 0; iIdx < islands.length; iIdx++) {
    const island = islands[iIdx];
    island.intervals.sort((a, b) => a.y - b.y);

    // Jump to island start (if not first island)
    if (rawPoints.length > 0) {
      const first = island.intervals[0];
      const [wx, wy] = toW(first.xL, first.y);
      rawPoints.push([wx, wy, 'J']);
      jumpCount++;
    }

    // Boustrophedon traversal within island
    for (let rIdx = 0; rIdx < island.intervals.length; rIdx++) {
      const iv = island.intervals[rIdx];
      const forward = (rIdx % 2) === 0;
      const brickOff = TATAMI_PHASES[rIdx % 4] * stitchLenMm;
      let needles = _placeNeedles(iv.xL, iv.xR, stitchLenMm, brickOff, forward);
      if (needles.length < 1) continue;

      // Connect from previous row end to this row start
      if (rIdx > 0 && rawPoints.length > 0) {
        const prevPt = rawPoints[rawPoints.length - 1];
        const [nx, ny] = toW(needles[0], iv.y);
        const connDist = Math.hypot(nx - prevPt[0], ny - prevPt[1]);

        // If connection is very short, skip first needle (merge micro stitch)
        if (connDist < MIN_STITCH_MM) {
          needles = needles.slice(1);
          if (needles.length === 0) continue;
        } else if (connDist > CONNECT_THRESHOLD || !_midpointInside(prevPt[0], prevPt[1], nx, ny, polygonMm)) {
          // Connection too long or exits polygon → jump
          rawPoints.push([nx, ny, 'J']);
          jumpCount++;
        }
        // else: short safe connection → natural stitch (no jump needed)
      }

      // Emit stitch points across this interval
      for (let i = 0; i < needles.length; i++) {
        const [wx, wy] = toW(needles[i], iv.y);
        rawPoints.push([wx, wy, 'S']);
      }
    }
  }

  // ── 6. Post-process: split long, merge micro, validate ───────────────────
  const result = _postProcess(rawPoints, polygonMm, regionId, log);
  log(`jumps before/after: ${jumpCount}/${result.filter(p => p[2] === 'J').length}`);

  // ── 7. Validation report ─────────────────────────────────────────────────
  let outsideCount = 0, longCount = 0, microCount = 0, stitchCount = 0;
  let prevX = null, prevY = null;
  for (const pt of result) {
    if (pt[2] === 'J') { prevX = pt[0]; prevY = pt[1]; continue; }
    stitchCount++;
    if (!_pointInPolygon(pt[0], pt[1], polygonMm)) outsideCount++;
    if (prevX !== null) {
      const d = Math.hypot(pt[0] - prevX, pt[1] - prevY);
      if (d > MAX_STITCH_MM) longCount++;
      if (d > 0 && d < MIN_STITCH_MM) microCount++;
    }
    prevX = pt[0]; prevY = pt[1];
  }
  log(`validation summary: stitches=${stitchCount} outside=${outsideCount} long=${longCount} micro=${microCount}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ISLAND BUILDING
// ═══════════════════════════════════════════════════════════════════════════

function _buildIslands(scanlines) {
  // Flatten all intervals with global indices
  const all = [];
  const byRow = new Map();
  for (const sl of scanlines) {
    byRow.set(sl.rowIdx, sl.intervals);
    for (const iv of sl.intervals) {
      iv._idx = all.length;
      all.push(iv);
    }
  }
  const uf = new UnionFind(all.length);

  // Compare intervals on adjacent scanlines only
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  for (let r = 0; r < rows.length - 1; r++) {
    const rowA = byRow.get(rows[r]);
    const rowB = byRow.get(rows[r + 1]);
    for (const a of rowA) {
      for (const b of rowB) {
        const tol = 1.0; // mm overlap tolerance
        if (a.xL < b.xR + tol && b.xL < a.xR + tol) {
          uf.union(a._idx, b._idx);
        }
      }
    }
  }

  // Group by root
  const map = new Map();
  for (let i = 0; i < all.length; i++) {
    const root = uf.find(i);
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(all[i]);
  }

  // Build island objects
  let id = 0;
  const islands = [];
  for (const [, intervals] of map) {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const iv of intervals) {
      if (iv.xL < mnx) mnx = iv.xL;
      if (iv.xR > mxx) mxx = iv.xR;
      if (iv.y < mny) mny = iv.y;
      if (iv.y > mxy) mxy = iv.y;
    }
    islands.push({
      islandId: id++,
      intervals,
      bbox: { minX: mnx, maxX: mxx, minY: mny, maxY: mxy },
    });
  }
  return islands;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ISLAND ORDERING (nearest-neighbor)
// ═══════════════════════════════════════════════════════════════════════════

function _orderIslandsNN(islands) {
  if (islands.length <= 1) return;
  const ordered = [islands[0]];
  const remaining = islands.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const isl = remaining[i];
      const dx = isl.bbox.minX - last.bbox.maxX;
      const dy = isl.bbox.minY - last.bbox.maxY;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  islands.length = 0;
  islands.push(...ordered);
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

function _postProcess(points, polygon, regionId, log) {
  const out = [];
  let splitCount = 0, mergeCount = 0, rejectedCount = 0;
  let prevX = null, prevY = null;

  for (const pt of points) {
    const [x, y, flag] = pt;
    const isJump = flag === 'J';

    if (isJump) {
      out.push([x, y, 'J']);
      prevX = x; prevY = y;
      continue;
    }

    // Validate inside polygon
    if (!_pointInPolygon(x, y, polygon)) {
      rejectedCount++;
      out.push([x, y, 'J']); // convert to jump — preserves travel
      prevX = x; prevY = y;
      continue;
    }

    // Merge micro-stitches
    if (prevX !== null) {
      const d = Math.hypot(x - prevX, y - prevY);
      if (d < MIN_STITCH_MM && d > 0) {
        mergeCount++;
        continue;
      }
    }

    // Split long stitches
    if (prevX !== null) {
      const d = Math.hypot(x - prevX, y - prevY);
      if (d > MAX_STITCH_MM) {
        const steps = Math.ceil(d / MAX_STITCH_MM);
        for (let s = 1; s < steps; s++) {
          const mx = prevX + (x - prevX) * s / steps;
          const my = prevY + (y - prevY) * s / steps;
          out.push([mx, my, 'S']);
        }
        splitCount++;
      }
    }

    out.push([x, y, 'S']);
    prevX = x; prevY = y;
  }

  log(`micro stitches before/after: -/${mergeCount} merged`);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _midpointInside(x1, y1, x2, y2, polygon) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return _pointInPolygon(mx, my, polygon);
}

function _pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
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
      const t = (ry - ay) / (by - ay);
      xs.push(ax + t * (bx - ax));
    }
  }
  return xs;
}

function _placeNeedles(xL, xR, pitch, brickOff, forward) {
  const phase = ((brickOff % pitch) + pitch) % pitch;
  const needles = [xL];
  let nx = xL + phase;
  if (nx <= xL + MIN_STITCH_MM) nx += pitch;
  while (nx < xR - MIN_STITCH_MM) {
    needles.push(nx);
    nx += pitch;
  }
  needles.push(xR);
  // Deduplicate with MIN_STITCH_MM tolerance
  const out = [needles[0]];
  for (let i = 1; i < needles.length; i++) {
    if (needles[i] - out[out.length - 1] >= MIN_STITCH_MM) out.push(needles[i]);
  }
  return forward ? out : out.reverse();
}