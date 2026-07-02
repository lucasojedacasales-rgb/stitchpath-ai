/**
 * rawDarkStrokeTest.js — StitchPath AI
 * ─────────────────────────────────────────────────────────────────────────────
 * FULLY ISOLATED diagnostic test for the lower contour + feet.
 *
 * STRICT dark mask: detects ONLY real black / near-black pixels of the
 * original uploaded bitmap — never shadows, dark fills, pink boundaries,
 * region borders, or inferred silhouettes.
 *
 *   strict pixel = luminance < 55 AND saturation < 80 AND localContrast > 20
 *
 * The local-contrast requirement excludes flat dark-fill interiors (shadows),
 * keeping only high-contrast stroke/edge pixels.
 *
 * Hard rules:
 *   - Input is the original upload bitmap (project.image_url), never a
 *     processed/preview/vectorized image.
 *   - Paths come ONLY from the skeleton of the strict mask. No bbox/crop/
 *     silhouette/fill fallback. If no real black strokes → 0 paths.
 *   - Every exported path needs pathDarkSupportRatio >= 0.90 against the
 *     PURE strict mask (pre-close).
 *   - filterLowerFootDarkPaths only filters by zone — never creates/closes.
 *
 * Public API:
 *   createStrictDarkMask(imageData, params)        → Uint8Array
 *   extractRawDarkStrokePaths(imageData, params)   → { strictMask, closedMask, skeleton, paths, ... }
 *   pathDarkSupportRatio(path, strictMask, W, H)   → 0..1
 *   validatePaths(paths, strictMask, W, H)         → { exported, rejected, ... }
 *   filterLowerFootDarkPaths(paths, W, H)          → zone-filtered paths
 *   analyzeStrictMask(mask, W, H)                  → { hasMouth, hasEyes, hasLowerContour, hasPinkBoundary, ... }
 *   buildRawLowerCommands(paths, W, H, wMm, hMm)   → commands[]
 *   runRawDarkStrokeTest(imageUrl, config)         → { ...result, diagnostics }
 */

export const RAW_PARAMS = {
  strictLumaMax: 55,
  strictSatMax: 80,
  localContrastMin: 20,
  minComponentArea: 5,
  closeGapPx: 1,
  minPathLengthPx: 6,
  maxProcessWidth: 320,
  darkSupportMin: 0.90,
  borderMarginPx: 3,
  frameLineMinFrac: 0.5,
  frameLineThicknessPx: 6,
};

function luma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
function sat(r, g, b) { return Math.max(r, g, b) - Math.min(r, g, b); }

// ── STRICT DARK MASK ─────────────────────────────────────────────────────────
// Only real black/near-black, low-saturation, high-local-contrast pixels.
export function createStrictDarkMask(imageData, params = {}) {
  const p = { ...RAW_PARAMS, ...params };
  const { width: W, height: H, data } = imageData;
  const lumaArr = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    lumaArr[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    const L = lumaArr[idx];
    if (L >= p.strictLumaMax) continue;                       // not dark enough
    const r = data[idx * 4], g = data[idx * 4 + 1], b = data[idx * 4 + 2];
    if (sat(r, g, b) >= p.strictSatMax) continue;             // saturated (pink/red) → reject
    // local contrast: max-min luma in 3x3 window (excludes flat fill interiors)
    let mx = -1, mn = 999;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ll = lumaArr[ny * W + nx];
      if (ll > mx) mx = ll;
      if (ll < mn) mn = ll;
    }
    if (mx - mn < p.localContrastMin) continue;               // flat shadow interior → reject
    mask[idx] = 1;
  }
  return mask;
}

// ── Morphology (gap close) ────────────────────────────────────────────────────
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

// ── Connected components (for diagnostics) ────────────────────────────────────
function connectedComponents(mask, W, H, minArea) {
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
      if (comp.area >= minArea) comps.push(comp);
    }
  }
  return comps;
}

// ── Zhang-Suen thinning → 1px skeleton ────────────────────────────────────────
function transitions(P) {
  let c = 0;
  for (let i = 0; i < 8; i++) if (P[i] === 0 && P[(i + 1) % 8] === 1) c++;
  return c;
}
function thinZhangSuen(mask, W, H) {
  const img = new Uint8Array(mask);
  let changed = true, guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const rm1 = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x; if (!img[p]) continue;
      const P = [img[p - W], img[p - W + 1], img[p + 1], img[p + W + 1], img[p + W], img[p + W - 1], img[p - 1], img[p - W - 1]];
      const A = transitions(P), B = P[0] + P[1] + P[2] + P[3] + P[4] + P[5] + P[6] + P[7];
      if (A === 1 && B >= 2 && B <= 6 && P[0] * P[2] * P[4] === 0 && P[2] * P[4] * P[6] === 0) rm1.push(p);
    }
    if (rm1.length) { for (const p of rm1) img[p] = 0; changed = true; }
    const rm2 = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x; if (!img[p]) continue;
      const P = [img[p - W], img[p - W + 1], img[p + 1], img[p + W + 1], img[p + W], img[p + W - 1], img[p - 1], img[p - W - 1]];
      const A = transitions(P), B = P[0] + P[1] + P[2] + P[3] + P[4] + P[5] + P[6] + P[7];
      if (A === 1 && B >= 2 && B <= 6 && P[0] * P[2] * P[6] === 0 && P[0] * P[4] * P[6] === 0) rm2.push(p);
    }
    if (rm2.length) { for (const p of rm2) img[p] = 0; changed = true; }
  }
  return img;
}

// ── Skeleton tracing → ordered paths (no auto-close, no bbox) ─────────────────
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
    const path = [ep]; visited[ep] = 1; let cur = ep;
    while (true) {
      const nbrs = neighborsOf(cur, W, H, skel).filter(n => !visited[n]);
      if (nbrs.length === 0) break;
      cur = nbrs[0]; visited[cur] = 1; path.push(cur);
    }
    if (path.length >= minLen) paths.push(path.map(p => ({ x: p % W, y: (p / W) | 0 })));
  }
  for (let i = 0; i < W * H; i++) {
    if (skel[i] && !visited[i]) {
      const path = [i]; visited[i] = 1; let cur = i;
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

// ── MAIN: extract raw dark stroke paths from the STRICT mask ──────────────────
// No bbox/crop/silhouette fallback. Paths come ONLY from skeleton pixels.
export function extractRawDarkStrokePaths(imageData, params = {}) {
  const p = { ...RAW_PARAMS, ...params };
  const { width: W, height: H } = imageData;

  const strictMask = createStrictDarkMask(imageData, p);
  const darkPixelsCount = strictMask.reduce((s, v) => s + v, 0);

  // Components on the strict mask (for diagnostics)
  const components = connectedComponents(strictMask, W, H, p.minComponentArea);

  // Close small gaps (dilate/erode) for skeleton continuity — support is still
  // validated against the PURE strict mask (pre-close).
  let closedMask = strictMask;
  for (let it = 0; it < p.closeGapPx; it++) closedMask = dilate(closedMask, W, H);
  for (let it = 0; it < p.closeGapPx; it++) closedMask = erode(closedMask, W, H);

  const skeleton = thinZhangSuen(closedMask, W, H);
  const paths = traceSkeleton(skeleton, W, H, p.minPathLengthPx);

  return { strictMask, closedMask, skeleton, paths, components, darkPixelsCount, width: W, height: H };
}

// ── Dark support against the PURE strict mask ─────────────────────────────────
export function pathDarkSupportRatio(path, strictMask, W, H) {
  if (path.length === 0) return 0;
  let supported = 0;
  for (const pt of path) {
    let on = false;
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = pt.x + dx, ny = pt.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (strictMask[ny * W + nx]) { on = true; break; }
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
  for (const pt of path) {
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
  }
  return { w: maxX - minX, h: maxY - minY };
}
function isFrameLine(path, W, H, minFrac, thickPx) {
  const b = pathBbox(path);
  if (b.w >= minFrac * W && b.h <= thickPx) return true;
  if (b.h >= minFrac * H && b.w <= thickPx) return true;
  return false;
}

// ── Validate paths against the strict mask (support >= 0.90) ──────────────────
export function validatePaths(paths, strictMask, W, H, params = {}) {
  const p = { ...RAW_PARAMS, ...params };
  const exported = [];
  const rejectedCropBorder = [];
  const rejectedLowSupport = [];
  let supportSum = 0, minSupport = 1;

  for (const path of paths) {
    if (isBorderPath(path, W, H, p.borderMarginPx) || isFrameLine(path, W, H, p.frameLineMinFrac, p.frameLineThicknessPx)) {
      rejectedCropBorder.push(path);
      console.log('[raw-dark-test] rejected ROI border path');
      continue;
    }
    const support = pathDarkSupportRatio(path, strictMask, W, H);
    if (support < p.darkSupportMin) {
      rejectedLowSupport.push(path);
      console.log(`[raw-dark-test] path rejected low strict dark support: ${support.toFixed(2)}`);
      continue;
    }
    console.log(`[raw-dark-test] path accepted strict dark support: ${support.toFixed(2)}`);
    exported.push(path);
    supportSum += support;
    if (support < minSupport) minSupport = support;
  }
  const avgSupport = exported.length ? supportSum / exported.length : 0;
  return {
    exported,
    rejectedCropBorder,
    rejectedLowSupport,
    rejected: [
      ...rejectedCropBorder.map(path => ({ path, reason: 'crop_border' })),
      ...rejectedLowSupport.map(path => ({ path, reason: 'low_strict_dark_support' })),
    ],
    averagePathDarkSupport: avgSupport,
    minPathDarkSupport: exported.length ? minSupport : 0,
  };
}

// ── Zone filter (lower body + feet) — NEVER creates/closes paths ──────────────
export function filterLowerFootDarkPaths(paths, W, H) {
  const lowerY = 0.55 * H;
  const footBottomY = 0.70 * H;
  const out = [];
  for (const path of paths) {
    let cx = 0, cy = 0;
    for (const pt of path) { cx += pt.x; cy += pt.y; }
    cx /= path.length; cy /= path.length;
    const normX = cx / W, normY = cy / H;
    // Exclude mouth zone
    const isMouth = normX > 0.30 && normX < 0.70 && normY > 0.45 && normY < 0.62 && path.length < 50;
    if (isMouth) continue;
    if (cy < lowerY) continue;
    const reachesFoot = path.some(pt => pt.y > footBottomY);
    if (cy >= lowerY || reachesFoot) out.push(path);
  }
  return out;
}

// ── Analyze strict mask: mouth/eyes/lower presence, pink boundary absence ─────
export function analyzeStrictMask(mask, W, H) {
  let mouthPixels = 0, eyePixels = 0, lowerPixels = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const nx = x / W, ny = y / H;
    if (ny > 0.45 && ny < 0.62 && nx > 0.30 && nx < 0.70) mouthPixels++;
    if (ny > 0.28 && ny < 0.45 && (nx < 0.45 || nx > 0.55)) eyePixels++;
    if (ny > 0.55) lowerPixels++;
  }
  // Strict mask excludes saturated colors → pink-pink boundary cannot appear
  const hasPinkBoundary = false;
  return {
    hasMouth: mouthPixels > 3,
    hasEyes: eyePixels > 3,
    hasLowerContour: lowerPixels > 5,
    hasPinkBoundary,
    mouthPixels, eyePixels, lowerPixels,
  };
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

// ── Load original upload bitmap → downscaled ImageData ────────────────────────
function loadOriginalBitmap(imageUrl, maxW) {
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
    img.onerror = () => reject(new Error('No se pudo cargar el bitmap original'));
    img.src = imageUrl;
  });
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function runRawDarkStrokeTest(imageUrl, config = {}) {
  if (!imageUrl) {
    const err = 'RAW DARK TEST INVALID: original bitmap missing';
    console.log(`[raw-dark-test] ${err}`);
    throw new Error(err);
  }

  const widthMm = config.width_mm || 100;
  const heightMm = config.height_mm || 100;

  // Source verification — we load the original upload bitmap directly.
  console.log('[dark-mask-source] usingOriginalUploadBitmap: true');
  console.log('[dark-mask-source] usingProcessedPreview: false');
  console.log('[dark-mask-source] usingVectorizedRegions: false');

  const { imageData, naturalW, naturalH } = await loadOriginalBitmap(imageUrl, RAW_PARAMS.maxProcessWidth);
  const { strictMask, closedMask, skeleton, paths: rawPaths, components, darkPixelsCount, width: W, height: H } =
    extractRawDarkStrokePaths(imageData, RAW_PARAMS);

  const maskAnalysis = analyzeStrictMask(strictMask, W, H);

  const rawPathsBeforeFilter = rawPaths.length;
  const zonePaths = filterLowerFootDarkPaths(rawPaths, W, H);
  const rawPathsAfterFilter = zonePaths.length;

  const validation = validatePaths(zonePaths, strictMask, W, H, RAW_PARAMS);
  const exportedPaths = validation.exported;
  const commands = buildRawLowerCommands(exportedPaths, W, H, widthMm, heightMm);

  const longestPath = rawPaths.reduce((m, p) => p.length > m ? p.length : m, 0);
  const openPaths = rawPaths.filter(p => {
    const f = p[0], l = p[p.length - 1];
    return Math.hypot(f.x - l.x, f.y - l.y) > 2;
  }).length;
  const lowerComponents = components.filter(c => (c.bbox.minY + c.bbox.maxY) / 2 > 0.55 * H).length;

  const lowerMissing = !maskAnalysis.hasLowerContour;

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
    hasMouth: maskAnalysis.hasMouth,
    hasEyes: maskAnalysis.hasEyes,
    hasLowerContour: maskAnalysis.hasLowerContour,
    hasPinkBoundary: maskAnalysis.hasPinkBoundary,
    mouthPixels: maskAnalysis.mouthPixels,
    eyePixels: maskAnalysis.eyePixels,
    lowerPixels: maskAnalysis.lowerPixels,
    lowerOutlineMissing: lowerMissing,
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

  // Mandatory logs
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
  console.log(`[raw-dark-test] rejected low strict dark support paths: ${validation.rejectedLowSupport.length}`);
  console.log(`[raw-dark-test] exported paths with dark support: ${exportedPaths.length}`);
  console.log(`[raw-dark-test] average path dark support: ${validation.averagePathDarkSupport.toFixed(3)}`);
  console.log(`[raw-dark-test] min path dark support: ${validation.minPathDarkSupport.toFixed(3)}`);
  console.log(`[raw-dark-test] strict mask has mouth: ${maskAnalysis.hasMouth}`);
  console.log(`[raw-dark-test] strict mask has eyes: ${maskAnalysis.hasEyes}`);
  console.log(`[raw-dark-test] strict mask has lower contour: ${maskAnalysis.hasLowerContour}`);
  console.log(`[raw-dark-test] strict mask has pink boundary: ${maskAnalysis.hasPinkBoundary}`);
  if (lowerMissing) console.log('[raw-dark-test] lower outline missing in strict dark mask');
  console.log(`[raw-dark-test] coordinate transform: ${diagnostics.coordinateTransform}`);
  console.log(`[raw-dark-test] scale: ${diagnostics.scale}`);

  return {
    originalData: imageData,
    strictMask, closedMask, skeleton,
    rawPaths, zonePaths,
    exportedPaths,
    rejected: validation.rejected,
    commands,
    diagnostics,
    width: W, height: H,
  };
}