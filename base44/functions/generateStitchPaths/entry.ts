import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { regions, stitchParams = {}, sequencingMode = 'layerOrder' } = await req.json();
    if (!regions || !Array.isArray(regions)) return Response.json({ error: 'regions array required' }, { status: 400 });

    const sp = {
      fillDensity: 0.7,
      fillAngle: 45,
      satinWidth: 3.0,
      runningStitchLength: 2.5,
      pullCompensation: 0.15,
      underlay: true,
      underlayDensity: 0.4,
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
        // Optional underlay first
        if (sp.underlay) {
          const underlayPts = generateFillLines(poly, sp.underlayAngle, sp.underlayDensity, sp.pullCompensation);
          points.push(...underlayPts.points);
          jumps += underlayPts.jumps;
          if (underlayPts.points.length > 0) jumps++; // jump between underlay and fill
        }
        const fillResult = generateFillLines(poly, sp.fillAngle, sp.fillDensity, sp.pullCompensation);
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

// ── FILL ──────────────────────────────────────────────────────────────────────

function generateFillLines(poly, angleDeg, density, pullComp) {
  const expanded = expandPolygon(poly, pullComp);
  const angle = angleDeg * Math.PI / 180;
  const spacing = 1 / Math.max(0.1, density);

  // Rotate polygon to align fill direction with X axis
  const rotated = expanded.map(([x, y]) => [
    x * Math.cos(-angle) - y * Math.sin(-angle),
    x * Math.sin(-angle) + y * Math.cos(-angle),
  ]);

  const minY = Math.min(...rotated.map(p => p[1]));
  const maxY = Math.max(...rotated.map(p => p[1]));
  const minX = Math.min(...rotated.map(p => p[0]));
  const maxX = Math.max(...rotated.map(p => p[0]));

  const points = [];
  let jumps = 0;
  let lineIdx = 0;

  for (let y = minY + spacing / 2; y <= maxY; y += spacing) {
    const intersections = linePolyIntersectX(rotated, y, minX - 1, maxX + 1);
    if (intersections.length < 2) continue;
    intersections.sort((a, b) => a - b);

    // Pair intersections left→right or right→left (zig-zag)
    const forward = lineIdx % 2 === 0;
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x0 = intersections[i], x1 = intersections[i + 1];
      const pts = interpolateLine(forward ? x0 : x1, forward ? x1 : x0, y, spacing / 2);
      if (points.length > 0) {
        const last = points[points.length - 1];
        const dist = Math.hypot(pts[0][0] - last[0], pts[0][1] - last[1]);
        if (dist > spacing * 3) jumps++;
      }
      points.push(...pts);
    }
    lineIdx++;
  }

  // Rotate points back
  const finalPoints = points.map(([x, y]) => [
    parseFloat((x * Math.cos(angle) - y * Math.sin(angle)).toFixed(3)),
    parseFloat((x * Math.sin(angle) + y * Math.cos(angle)).toFixed(3)),
  ]);

  return { points: finalPoints, jumps };
}

function linePolyIntersectX(poly, y, minX, maxX) {
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

function interpolateLine(x0, x1, y, step) {
  const pts = [];
  const dir = x1 >= x0 ? 1 : -1;
  for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir * step) {
    pts.push([x, y]);
  }
  return pts;
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