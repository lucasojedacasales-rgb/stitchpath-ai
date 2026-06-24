import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { regions, stitchParams = {}, sequencingMode = 'layerOrder' } = await req.json();
    if (!regions || !Array.isArray(regions)) return Response.json({ error: 'regions array required' }, { status: 400 });

    const sp = {
      fillDensity: 1.0,        // maps to 0.4mm row spacing
      fillAngle: 45,
      satinWidth: 3.0,
      runningStitchLength: 2.5,
      pullCompensation: 0.15,
      underlay: true,
      underlayDensity: 0.5,
      underlayAngle: -45,
      ...stitchParams,
    };

    // ── Classify and generate stitch paths per region ────────────────────────
    const stitchPaths = [];

    for (const region of regions) {
      const poly = region.polygon;
      if (!poly || poly.length < 3) continue;

      const area = region.area || 0;
      const compactness = region.compactness || 0;

      // Determine stitch type from geometry if not pre-assigned
      let type = region.stitch_type;
      if (!type) {
        if (area > 300 || compactness < 15) type = 'fill';
        else if (area >= 50 || compactness >= 15) type = 'satin';
        else type = 'running_stitch';
      }

      let points = [];
      let jumps = 0;

      if (type === 'fill') {
        // Use dominant angle from polygon PCA, or fall back to sp.fillAngle
        const polyAngleDeg = region.angle !== undefined ? region.angle : dominantAngleDeg(poly);
        const perpAngle = polyAngleDeg + 90;

        // Optional underlay first (perpendicular, sparser)
        if (sp.underlay) {
          const underlayPts = generateFillLines(poly, perpAngle, sp.underlayDensity, sp.pullCompensation);
          points.push(...underlayPts.points);
          jumps += underlayPts.jumps;
          if (underlayPts.points.length > 0) jumps++;
        }
        const fillResult = generateFillLines(poly, polyAngleDeg, sp.fillDensity, sp.pullCompensation);
        points.push(...fillResult.points);
        jumps += fillResult.jumps;

      } else if (type === 'satin') {
        const satinResult = generateSatinStitches(poly, sp.satinWidth, sp.pullCompensation);
        points = satinResult.points;
        jumps = satinResult.jumps;

      } else {
        // running_stitch
        const isInner = region.isEdgeRegion === false && area < 50;
        const offset = isInner ? -0.3 : 0.5;
        const runResult = generateRunningStitch(poly, sp.runningStitchLength, offset);
        points = runResult.points;
        jumps = runResult.jumps;
      }

      const stitchCount = points.length;
      // ~800 stitches/min machine speed, 1 stitch ≈ avg 2mm thread
      const estimatedTimeSec = parseFloat(((stitchCount / 800) * 60).toFixed(1));

      stitchPaths.push({
        regionId: region.id,
        type,
        color: region.color,
        layerOrder: region.layer_order || region.layerOrder || 999,
        points,
        stitchCount,
        jumps,
        estimatedTimeSec,
      });
    }

    // ── Sequencing ────────────────────────────────────────────────────────────
    const sequenced = sequencePaths(stitchPaths, sequencingMode);

    // ── Total stats ───────────────────────────────────────────────────────────
    const totalStitches = sequenced.reduce((s, p) => s + p.stitchCount, 0);
    const totalJumps    = sequenced.reduce((s, p) => s + p.jumps, 0);
    const totalColors   = new Set(sequenced.map(p => p.color)).size;
    const estimatedTimeMin = parseFloat((sequenced.reduce((s, p) => s + p.estimatedTimeSec, 0) / 60).toFixed(1));
    // avg stitch length ~2mm → total thread in meters
    const threadLengthMeters = parseFloat(((totalStitches * 2) / 1000).toFixed(1));

    // Strip internal sequencing fields
    const outputPaths = sequenced.map(({ layerOrder, ...rest }) => rest);

    return Response.json({
      stitchPaths: outputPaths,
      totalStats: {
        totalStitches,
        totalJumps,
        totalColors,
        estimatedTimeMin,
        threadLengthMeters,
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── TATAMI FILL ───────────────────────────────────────────────────────────────
// Dense tatami fill with serpentine rows, cyclic 25% offset, and row connection.

function generateFillLines(poly, angleDeg, density, pullComp) {
  const expanded = expandPolygon(poly, pullComp);
  const angle = angleDeg * Math.PI / 180;

  // 0.4mm row spacing at density=1.0 (denser than before)
  const rowSpacing = Math.max(0.2, 0.4 / Math.max(0.2, density));
  // Stitch pitch along each row — same as row spacing for uniform tatami density
  const stitchPitch = rowSpacing;
  // Cyclic tatami offsets: 0%, 25%, 50%, 75%
  const OFFSETS = [0, 0.25, 0.5, 0.75];
  // Max allowed stitch length before inserting extra point
  const MAX_STITCH = 2.5;

  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const cosR = Math.cos(angle), sinR = Math.sin(angle);

  // Rotate polygon into fill-angle space
  const rotated = expanded.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const minY = Math.min(...rotated.map(p => p[1]));
  const maxY = Math.max(...rotated.map(p => p[1]));

  const allPoints = [];
  let jumps = 0;
  let rowIdx = 0;

  for (let y = minY + rowSpacing / 2; y <= maxY; y += rowSpacing) {
    const xs = scanLineIntersect(rotated, y);
    if (xs.length < 2) { rowIdx++; continue; }
    xs.sort((a, b) => a - b);

    const cycleOffset = OFFSETS[rowIdx % 4] * stitchPitch;
    const forward = rowIdx % 2 === 0;

    const rowPoints = [];

    for (let i = 0; i < xs.length - 1; i += 2) {
      const xL = xs[i], xR = xs[i + 1];
      const segLen = xR - xL;
      if (segLen < 0.1) continue;

      // Always include polygon entry point
      rowPoints.push(forward ? [xL, y] : [xR, y]);

      // Generate interior stitches with cyclic offset
      const firstX = xL + ((cycleOffset % stitchPitch + stitchPitch) % stitchPitch);
      for (let x = firstX; x < xR - 0.05; x += stitchPitch) {
        if (x > xL + 0.05) {
          rowPoints.push([x, y]);
        }
      }

      // Always include exit point
      const exitPt = forward ? [xR, y] : [xL, y];
      const lastAdded = rowPoints[rowPoints.length - 1];
      if (Math.hypot(exitPt[0] - lastAdded[0]) > 0.05) {
        rowPoints.push(exitPt);
      }
    }

    if (rowPoints.length === 0) { rowIdx++; continue; }

    // Apply serpentine: if backward row, reverse the point order
    const orderedPts = forward ? rowPoints : rowPoints.slice().reverse();

    // Check if we need a jump to reach this row
    if (allPoints.length > 0) {
      const last = allPoints[allPoints.length - 1];
      const first = orderedPts[0];
      const jumpDist = Math.hypot(first[0] - last[0], first[1] - last[1]);
      if (jumpDist > 5.0) jumps++;
    }

    // Subdivide any segment longer than MAX_STITCH
    for (let j = 0; j < orderedPts.length; j++) {
      if (j > 0) {
        const prev = orderedPts[j - 1];
        const curr = orderedPts[j];
        const segLen = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
        if (segLen > MAX_STITCH) {
          const steps = Math.ceil(segLen / MAX_STITCH);
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            allPoints.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1])]);
          }
        }
      }
      allPoints.push(orderedPts[j]);
    }

    rowIdx++;
  }

  // Rotate all points back to world space
  const finalPoints = allPoints.map(([x, y]) => [
    parseFloat((x * cosR - y * sinR).toFixed(3)),
    parseFloat((x * sinR + y * cosR).toFixed(3)),
  ]);

  return { points: finalPoints, jumps };
}

function scanLineIntersect(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      xs.push(a[0] + t * (b[0] - a[0]));
    }
  }
  return xs;
}

// ── SATIN ─────────────────────────────────────────────────────────────────────

function generateSatinStitches(poly, satinWidth, pullComp) {
  const expanded = expandPolygon(poly, pullComp);
  const cx = expanded.reduce((s, p) => s + p[0], 0) / expanded.length;
  const cy = expanded.reduce((s, p) => s + p[1], 0) / expanded.length;

  // Approximate medial axis: sample along centroid-to-edge midpoints
  const points = [];
  let jumps = 0;

  // Compute bounding axis from dominant angle (use polygon PCA approximation)
  const angle = dominantAngle(expanded);
  const axisDir = [Math.cos(angle), Math.sin(angle)];
  const perpDir = [-Math.sin(angle), Math.cos(angle)];

  // Project vertices onto axis to find extent
  const projAxis = expanded.map(p => (p[0] - cx) * axisDir[0] + (p[1] - cy) * axisDir[1]);
  const tMin = Math.min(...projAxis), tMax = Math.max(...projAxis);

  const stitchSpacing = 0.25; // mm between satin columns
  let stitchIdx = 0;

  for (let t = tMin; t <= tMax; t += stitchSpacing) {
    const mx = cx + t * axisDir[0];
    const my = cy + t * axisDir[1];

    // Find intersections of perpendicular line through (mx,my) with polygon
    const intersections = linePolyIntersectPerp(expanded, mx, my, perpDir);
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a.t - b.t);

    const p0 = intersections[0], p1 = intersections[intersections.length - 1];
    const len = Math.abs(p1.t - p0.t);

    // Split long stitches at satinWidth
    const segments = Math.ceil(len / satinWidth);
    const step = (p1.t - p0.t) / segments;

    for (let s = 0; s < segments; s++) {
      const ta = p0.t + s * step;
      const tb = p0.t + (s + 1) * step;
      const forward = stitchIdx % 2 === 0;
      const startT = forward ? ta : tb;
      const endT   = forward ? tb : ta;
      points.push([
        parseFloat((mx + startT * perpDir[0]).toFixed(3)),
        parseFloat((my + startT * perpDir[1]).toFixed(3)),
      ]);
      points.push([
        parseFloat((mx + endT * perpDir[0]).toFixed(3)),
        parseFloat((my + endT * perpDir[1]).toFixed(3)),
      ]);
      stitchIdx++;
    }
  }

  return { points, jumps };
}

function linePolyIntersectPerp(poly, mx, my, perpDir) {
  const results = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // Parametric intersection of segment a→b with line through (mx,my) in perpDir direction
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const denom = perpDir[0] * dy - perpDir[1] * dx;
    if (Math.abs(denom) < 1e-10) continue;
    const t_seg = ((mx - a[0]) * dy - (my - a[1]) * dx) / denom;
    const u_seg = ((mx - a[0]) * perpDir[1] - (my - a[1]) * perpDir[0]) / denom;
    if (u_seg >= 0 && u_seg <= 1) results.push({ t: t_seg });
  }
  return results;
}

function dominantAngle(poly) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [x, y] of poly) {
    const dx = x - cx, dy = y - cy;
    cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  return 0.5 * Math.atan2(2 * cxy, cxx - cyy);
}

// ── RUNNING STITCH ────────────────────────────────────────────────────────────

function generateRunningStitch(poly, stitchLength, offsetMm) {
  const offsetPoly = offsetMm !== 0 ? expandPolygon(poly, offsetMm) : poly;
  const points = [];
  let dist = 0;
  points.push([parseFloat(offsetPoly[0][0].toFixed(3)), parseFloat(offsetPoly[0][1].toFixed(3))]);

  for (let i = 0; i < offsetPoly.length; i++) {
    const a = offsetPoly[i], b = offsetPoly[(i + 1) % offsetPoly.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / segLen, dy = (b[1] - a[1]) / segLen;
    let d = stitchLength - dist;
    while (d < segLen) {
      points.push([
        parseFloat((a[0] + dx * d).toFixed(3)),
        parseFloat((a[1] + dy * d).toFixed(3)),
      ]);
      d += stitchLength;
    }
    dist = segLen - (d - stitchLength);
  }

  // Close path
  points.push([parseFloat(offsetPoly[0][0].toFixed(3)), parseFloat(offsetPoly[0][1].toFixed(3))]);
  return { points, jumps: 0 };
}

// ── SEQUENCING ────────────────────────────────────────────────────────────────

function sequencePaths(paths, mode) {
  if (mode === 'layerOrder') {
    return [...paths].sort((a, b) => (a.layerOrder || 999) - (b.layerOrder || 999));
  }

  if (mode === 'colorGroup') {
    const byColor = {};
    for (const p of paths) {
      if (!byColor[p.color]) byColor[p.color] = [];
      byColor[p.color].push(p);
    }
    // Within each color group, sort by layer order
    return Object.values(byColor)
      .map(group => group.sort((a, b) => (a.layerOrder || 999) - (b.layerOrder || 999)))
      .flat();
  }

  if (mode === 'minTravel') {
    // Greedy nearest-neighbor TSP approximation using centroid of first point
    const remaining = [...paths];
    const result = [];
    let current = remaining.splice(0, 1)[0];
    result.push(current);

    while (remaining.length > 0) {
      const lastPt = current.points[current.points.length - 1] || [0, 0];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const firstPt = remaining[i].points[0] || [0, 0];
        const d = Math.hypot(firstPt[0] - lastPt[0], firstPt[1] - lastPt[1]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      current = remaining.splice(bestIdx, 1)[0];
      result.push(current);
    }
    return result;
  }

  return paths;
}

// ── GEOMETRY HELPERS ──────────────────────────────────────────────────────────

function dominantAngleDeg(poly) {
  if (!poly || poly.length < 2) return 45;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [x, y] of poly) {
    const dx = x - cx, dy = y - cy;
    cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
  }
  return parseFloat((0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI).toFixed(1));
}

function expandPolygon(poly, amount) {
  if (!amount || amount === 0) return poly;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount];
  });
}