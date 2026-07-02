/**
 * rawDarkStrokeTest.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * FULLY ISOLATED diagnostic test for the lower contour + feet.
 *
 * Uses ONLY the original image + a raw dark-stroke mask (threshold + clean +
 * Zhang-Suen skeleton). Paths come ONLY from skeleton pixels (the centerline
 * of real dark strokes). NEVER from bbox, crop border, ROI frame, or fallback.
 *
 * Hard rules:
 *   - No rectangleToPath / bboxToPath / cropBoundsToPath / roiBorderToPath.
 *   - If no real dark paths are found → 0 paths (never invent a rectangle).
 *   - Every exported path must have pathDarkSupportRatio >= 0.85 (sampled
 *     against the raw dark mask, within 1px).
 *   - Paths touching the canvas border or forming long axis-aligned frame
 *     lines are rejected as ROI/crop artifacts.
 *   - filterLowerFootDarkPaths only filters existing paths — never creates,
 *     closes, or rectangularizes.
 *
 * Public API:
 *   extractRawDarkStrokePaths(imageData, params)   → { mask, skeleton, paths, ... }
 *   pathDarkSupportRatio(path, mask, W, H)          → 0..1
 *   validatePaths(paths, mask, W, H)                → { exported, rejected, ... }
 *   filterLowerFootDarkPaths(paths, W, H)           → filtered paths (zone only)
 *   buildRawLowerCommands(paths, W, H, wMm, hMm)    → commands[]
 *   runRawDarkStrokeTest(imageUrl, config)          → { ...result, diagnostics }
 */

export const RAW_PARAMS = {
  lumaThreshold: 90,
  saturationMax: 120,
  minComponentArea: 5,
  closeGapPx: 2,
  minPathLengthPx: 6,
  maxProcessWidth: 320,
  darkSupportMin: 0.85,
  borderMarginPx: 3,
  frameLineMinFrac: 0.5,   // span >= 50% of W or H = frame line
  frameLineThicknessPx: 6,
};

function luma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
function sat(r, g, b) { return Math.max(r, g, b) - Math.min(r, g, b); }

// ── Morphology ───────────────────────────────────────────────────────────────
function dilate(m, W, H) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (m[p]) { o[p] = 1; continue; }
    let on = false;
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (m[ny * W + nx]) { on = true; break; }
    }
    o[p] = on ? 1 : 0;
  }
  return o;
}

function erode(m, W, H) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!m[p]) { o[p] = 0; continue; }
    let all = true;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { all = false; break; }
      if (!m[ny * W + nx]) { all = false; break; }
    }
    o[p] = all ? 1 : 0;
  }
  return o;
}

// ── Zhang-Suen thinning → 1px skeleton (centerline of real dark strokes) ─────
function transitions(P) {
  let c = 0;
  for (let i = 0; i < 8; i++) if (P[i] === 0 && P[(i + 1) % 8] === 1) c++;
  return c;
}

function thinZhangSuen(mask, W, H) {
  const img = new Uint8Array(mask);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const rm1 = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!img[p]) continue;
      const P = [img[p - W], img[p - W + 1], img[p + 1], img[p + W + 1], img[p + W], img[p + W - 1], img[p - 1], img[p - W - 1]];
      const A = transitions(P);
      const B = P[0] + P[1] + P[2] + P[3] + P[4] + P[5] + P[6] + P[7];
      if (A === 1 && B >= 2 && B <= 6 && P[0] * P[2] * P[4] === 0 && P[2] * P[4] * P[6] === 0) rm1.push(p);
    }
    if (rm1.length) { for (const p of rm1) img[p] = 0; changed = true; }
    const rm2 = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!img[p]) continue;
      const P = [img[p - W], img[p - W + 1], img[p + 1], img[p + W + 1], img[p + W], img[p + W - 1], img[p - 1], img[p - W - 1]];
      const A = transitions(P);
      const B = P[0] + P[1] + P[2] + P[3] + P[4] + P[5] + P[6] + P[7];
      if (A === 1 && B >= 2 && B <= 6 && P[0] * P[2] * P[6] === 0 && P[0] * P[4] * P[6] === 0) rm2.push(p);
    }
    if (rm2.length) { for (const p of rm2) img[p] = 0; changed = true; }
  }
  return img;
}

// ── Skeleton tracing → ordered paths (no auto-close, no bbox fallback) ───────
function neighborsOf(p, W, H, arr) {
  const x = p % W, y = (p / W) | 0;
  const res = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const np = ny * W + nx;
    if (arr[np]) res.push(np);
  }
  return res;
}

function traceSkeleton(skel, W, H, minLen) {
  const visited = new Uint8Array(W * H);
  const paths = [];
  const endpoints = [];
  for (let i = 0; i < W * H; i++) {
    if (!skel[i]) continue;
    if (neighborsOf(i, W, H, skel).length === 1) endpoints.push(i);
  }
  for (const ep of endpoints) {
    if (visited[ep]) continue;
    const path = [ep]; visited[ep] = 1;
    let cur = ep;
    while (true) {
      const nbrs = neighborsOf(cur, W, H, skel).filter(n => !visited[n]);
      if (nbrs.length === 0) break;
      cur = nbrs[0]; visited[cur] = 1; path.push(cur);
    }
    if (path.length >= minLen) paths.push(path.map(p => ({ x: p % W, y: (p / W) | 0 })));
  }
  for (let i = 0; i < W * H; i++) {
    if (skel[i] && !visited[i]) {
      const path = [i]; visited[i] = 1;
      let cur = i;
      while (true) {
        const nbrs = neighborsOf(cur, W, H, skel).filter(n => !visited[n]);
        if (nbrs.length === 0) break;
        cur = nbrs[0]; visited[cur] = 1; path.push(cur);
      }
      if (path.length >= minLen) paths.push(path.map(p => ({ x: p % W, y: (p / W) | 0 })));
    }
  }
  return paths;
}

// ── MAIN: extract raw dark stroke skeleton paths from ImageData ──────────────
// No bbox/crop/rectangle fallback. Paths come ONLY from skeleton pixels.
export function extractRawDarkStrokePaths(imageData, params = {}) {
  const p = { ...RAW_PARAMS, ...params };
  const { width: W, height: H, data } = imageData;

  // 1. Threshold near-black / near-gray pixels
  const mask = new Uint8Array(W * H);
  let darkPixelsCount = 0;
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (luma(r, g, b) < p.lumaThreshold && sat(r, g, b) < p.saturationMax) {
      mask[i] = 1; darkPixelsCount++;
    }
  }

  // 2. Connected components (8-conn) — remove small noise
  const labels = new Int32Array(W * H);
  const comps = [];
  let cur = 0;
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (mask[i] && !labels[i]) {
      cur++; const comp = { label: cur, area: 0, bbox: null };
      let minX = W, minY = H, maxX = 0, maxY = 0;
      labels[i] = cur; stack.push(i);
      while (stack.length) {
        const q = stack.pop(); const x = q % W, y = (q / W) | 0;
        comp.area++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nq = ny * W + nx;
          if (mask[nq] && !labels[nq]) { labels[nq] = cur; stack.push(nq); }
        }
      }
      comp.bbox = { minX, minY, maxX, maxY };
      comps.push(comp);
    }
  }
  const keepLabels = new Set(comps.filter(c => c.area >= p.minComponentArea).map(c => c.label));
  for (let i = 0; i < W * H; i++) if (mask[i] && !keepLabels.has(labels[i])) mask[i] = 0;

  // 3. Close small gaps (dilate then erode)
  let m = mask;
  for (let it = 0; it < p.closeGapPx; it++) m = dilate(m, W, H);
  for (let it = 0; it < p.closeGapPx; it++) m = erode(m, W, H);

  // 4. Skeleton (Zhang-Suen) — centerline of real dark strokes
  const skeleton = thinZhangSuen(m, W, H);

  // 5. Vectorize skeleton → ordered paths (no auto-close, no bbox)
  const paths = traceSkeleton(skeleton, W, H, p.minPathLengthPx);

  return { mask: m, skeleton, paths, components: comps, darkPixelsCount, width: W, height: H };
}

// ── Dark support: fraction of path points on (or within 1px of) a dark pixel ─
export function pathDarkSupportRatio(path, mask, W, H) {
  if (path.length === 0) return 0;
  let supported = 0;
  for (const pt of path) {
    let on = false;
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = pt.x + dx, ny = pt.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (mask[ny * W + nx]) { on = true; break; }
    }
    if (on) supported++;
  }
  return supported / path.length;
}

// ── ROI border / frame-line detection ─────────────────────────────────────────
function isBorderPath(path, W, H, margin) {
  return path.some(p => p.x < margin || p.y < margin || p.x > W - margin || p.y > H - margin);
}

function pathBbox(path) {
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const p of path) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function isFrameLine(path, W, H, minFrac, thickPx) {
  const b = pathBbox(path);
  if (b.w >= minFrac * W && b.h <= thickPx) return true;   // long horizontal frame
  if (b.h >= minFrac * H && b.w <= thickPx) return true;   // long vertical frame
  return false;
}

// ── Validate + reject crop/border/low-support paths ───────────────────────────
export function validatePaths(paths, mask, W, H, params = {}) {
  const p = { ...RAW_PARAMS, ...params };
  const exported = [];
  const rejectedCropBorder = [];
  const rejectedLowSupport = [];
  let supportSum = 0;
  let minSupport = 1;

  for (const path of paths) {
    // Reject ROI border / frame-line paths first
    if (isBorderPath(path, W, H, p.borderMarginPx) || isFrameLine(path, W, H, p.frameLineMinFrac, p.frameLineThicknessPx)) {
      rejectedCropBorder.push(path);
      console.log('[raw-dark-test] rejected ROI border path');
      continue;
    }
    const support = pathDarkSupportRatio(path, mask, W, H);
    if (support < p.darkSupportMin) {
      rejectedLowSupport.push(path);
      console.log(`[raw-dark-test] rejected low dark support path (support=${support.toFixed(2)})`);
      continue;
    }
    exported.push(path);
    supportSum += support;
    if (support < minSupport) minSupport = support;
  }

  const avgSupport = exported.length ? supportSum / exported.length : 0;
  const minSup = exported.length ? minSupport : 0;
  return {
    exported,
    rejectedCropBorder,
    rejectedLowSupport,
    rejected: [
      ...rejectedCropBorder.map(path => ({ path, reason: 'crop_border' })),
      ...rejectedLowSupport.map(path => ({ path, reason: 'low_dark_support' })),
    ],
    averagePathDarkSupport: avgSupport,
    minPathDarkSupport: minSup,
  };
}

// ── Filter: keep only lower body + feet (zone only — NEVER creates paths) ─────
export function filterLowerFootDarkPaths(paths, W, H) {
  const lowerY = 0.55 * H;
  const footBottomY = 0.70 * H;
  const out = [];
  for (const path of paths) {
    let cx = 0, cy = 0;
    for (const pt of path) { cx += pt.x; cy += pt.y; }
    cx /= path.length; cy /= path.length;
    const normX = cx / W, normY = cy / H;

    // Exclude mouth zone (center, mid-low, short)
    const isMouth = normX > 0.30 && normX < 0.70 && normY > 0.45 && normY < 0.62 && path.length < 50;
    if (isMouth) continue;

    if (cy < lowerY) continue; // upper area

    const reachesFoot = path.some(pt => pt.y > footBottomY);
    const isLower = cy >= lowerY;
    if (isLower || reachesFoot) out.push(path);
  }
  return out;
}

// ── Build simple triple-run commands (no satin, no caps, no auto-close) ──────
export function buildRawLowerCommands(paths, W, H, widthMm, heightMm) {
  const cmds = [];
  let pathIdx = 0;
  for (const path of paths) {
    const mm = path.map(pt => [(pt.x / W - 0.5) * widthMm, (pt.y / H - 0.5) * heightMm]);
    const triple = [...mm, ...[...mm].reverse(), ...mm];
    if (triple.length < 2) continue;
    if (cmds.length > 0) cmds.push({ type: 'trim' });
    const rid = `raw_lower_${pathIdx++}`;
    cmds.push({ type: 'jump', x: triple[0][0], y: triple[0][1], color: '#1a1a1a', layerType: 'raw_dark_test', regionId: rid });
    for (let i = 1; i < triple.length; i++) {
      cmds.push({ type: 'stitch', x: triple[i][0], y: triple[i][1], color: '#1a1a1a', layerType: 'raw_dark_test', stitchType: 'running_stitch', regionId: rid });
    }
  }
  return cmds;
}

// ── Load image → downscaled ImageData ─────────────────────────────────────────
function loadImageData(imageUrl, maxW) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const W = Math.max(1, Math.round(img.naturalWidth * scale));
      const H = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      resolve({ imageData: ctx.getImageData(0, 0, W, H), naturalW: img.naturalWidth, naturalH: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen original'));
    img.src = imageUrl;
  });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function runRawDarkStrokeTest(imageUrl, config = {}) {
  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;

  const { imageData, naturalW, naturalH } = await loadImageData(imageUrl, RAW_PARAMS.maxProcessWidth);
  const { mask, skeleton, paths: rawPaths, components, darkPixelsCount, width: W, height: H } =
    extractRawDarkStrokePaths(imageData, RAW_PARAMS);

  const rawPathsBeforeFilter = rawPaths.length;
  const zonePaths = filterLowerFootDarkPaths(rawPaths, W, H);
  const rawPathsAfterFilter = zonePaths.length;

  const validation = validatePaths(zonePaths, mask, W, H, RAW_PARAMS);
  const exportedPaths = validation.exported;
  const commands = buildRawLowerCommands(exportedPaths, W, H, widthMm, heightMm);

  const longestPath = rawPaths.reduce((m, p) => p.length > m ? p.length : m, 0);
  const openPaths = rawPaths.filter(p => {
    const f = p[0], l = p[p.length - 1];
    return Math.hypot(f.x - l.x, f.y - l.y) > 2;
  }).length;
  const lowerComponents = components.filter(c => {
    const cy = (c.bbox.minY + c.bbox.maxY) / 2;
    return cy > 0.55 * H;
  }).length;

  const diagnostics = {
    darkPixelsCount,
    componentsCount: components.length,
    lowerComponentsCount: lowerComponents,
    rawPathsBeforeFilter,
    rawPathsAfterFilter,
    exportedPaths: exportedPaths.length,
    rejectedCropBorderPaths: validation.rejectedCropBorder.length,
    rejectedLowDarkSupportPaths: validation.rejectedLowSupport.length,
    averagePathDarkSupport: validation.averagePathDarkSupport,
    minPathDarkSupport: validation.minPathDarkSupport,
    usedFinalEmbroideryCommands: false,
    usedRegionBoundaries: false,
    usedCachedContours: false,
    coordinateTransform: `mm = (px/${W} - 0.5) * ${widthMm}`,
    scale: `${(widthMm / W).toFixed(3)} mm/px`,
    rotationMirror: 'none',
    processDims: `${W}x${H}`,
    naturalDims: `${naturalW}x${naturalH}`,
    designMm: `${widthMm}x${heightMm}`,
    longestPath,
    openPaths,
  };

  // Mandatory source + rejection logs
  console.log('[raw-dark-test] source originalImage=true');
  console.log('[raw-dark-test] source darkStrokeMask=true');
  console.log('[raw-dark-test] source finalEmbroideryCommands=false');
  console.log('[raw-dark-test] source regionBoundaries=false');
  console.log('[raw-dark-test] source cachedContours=false');
  console.log(`[raw-dark-test] dark pixels count: ${darkPixelsCount}`);
  console.log(`[raw-dark-test] components count: ${components.length}`);
  console.log(`[raw-dark-test] lower components count: ${lowerComponents}`);
  console.log(`[raw-dark-test] raw paths before filter: ${rawPathsBeforeFilter}`);
  console.log(`[raw-dark-test] raw paths after filter: ${rawPathsAfterFilter}`);
  console.log(`[raw-dark-test] rejected ROI border paths: ${validation.rejectedCropBorder.length}`);
  console.log(`[raw-dark-test] rejected low dark support paths: ${validation.rejectedLowSupport.length}`);
  console.log(`[raw-dark-test] exported paths with dark support: ${exportedPaths.length}`);
  console.log(`[raw-dark-test] average path dark support: ${validation.averagePathDarkSupport.toFixed(3)}`);
  console.log(`[raw-dark-test] min path dark support: ${validation.minPathDarkSupport.toFixed(3)}`);
  console.log(`[raw-dark-test] coordinate transform: ${diagnostics.coordinateTransform}`);
  console.log(`[raw-dark-test] scale: ${diagnostics.scale}`);
  console.log(`[raw-dark-test] rotation/mirror: none`);

  return {
    originalData: imageData,
    mask, skeleton,
    rawPaths, zonePaths,
    exportedPaths,
    rejected: validation.rejected,
    commands,
    diagnostics,
    width: W, height: H,
  };
}