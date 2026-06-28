/**
 * semanticSegmenter.js — Semantic Object Segmenter
 * ──────────────────────────────────────────────────────────────────────────
 * Goes beyond color separation to detect real objects in an image.
 *
 * Pipeline:
 *  1. Multi-scale Sobel edge map + gradient direction
 *  2. K-means++ color quantization (more clusters than colors needed)
 *  3. Connected-component labelling per color-cluster
 *  4. Semantic merging: spatially adjacent blobs with similar hue → one object
 *  5. Per-region geometry: area, perimeter, compactness, curvature, orientation
 *  6. Image-type detection (drawing / logo / anime / photo)
 *  7. Object classification: background, outline, fill_area, detail, highlight
 *  8. Stitch type recommendation based on geometry + object class
 *  9. Priority assignment (fill base → fills → details → outlines)
 *
 * Returns SemanticContourSet compatible with the existing ContourSet interface
 * so it can be consumed by vectorEngineStage unchanged.
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} imageUrl
 * @param {object} config    - { color_count, width_mm, height_mm, mode }
 * @returns {Promise<SemanticContourSet>}
 */
export async function semanticSegment(imageUrl, config = {}) {
  const {
    color_count = 8,
    width_mm    = 100,
    height_mm   = 100,
    mode        = 'hybrid',
  } = config;

  const analysisSize = mode === 'ultra' ? 1024 : mode === 'precision' ? 800 : 640;
  const img = await loadImage(imageUrl);

  const scale = Math.min(analysisSize / img.width, analysisSize / img.height);
  const W = Math.round(img.width  * scale);
  const H = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx2d = canvas.getContext('2d');
  ctx2d.drawImage(img, 0, 0, W, H);
  const imageData = ctx2d.getImageData(0, 0, W, H);
  const pixels = imageData.data;

  // ── 1. Gradient map ──────────────────────────────────────────────────────
  const { mag: gradMag, dir: gradDir } = computeGradients(pixels, W, H);

  // ── 2. Detect image type ─────────────────────────────────────────────────
  const imageType = detectImageType(pixels, W, H, gradMag);

  // ── 3. Color quantization — balance: not too many clusters, not too few ─────────────
  const kClusters = Math.min(color_count * 1.5, 20);
  const palette   = kMeansPlusPlus(pixels, W, H, kClusters);

  // ── 4. Label map ────────────────────────────────────────────────────────
  const labels = buildLabelMap(pixels, W, H, palette);

  // ── 5. Blobs per cluster ─────────────────────────────────────────────────
  const minPx = Math.max(8, Math.floor(W * H * 0.00012));
  const rawBlobs = [];
  for (let ci = 0; ci < palette.length; ci++) {
    const blobs = findBlobs(labels, W, H, ci, minPx);
    for (const b of blobs) {
      b.colorIdx  = ci;
      b.rgb       = palette[ci];
      b.hex       = rgbToHex(palette[ci]);
      rawBlobs.push(b);
    }
  }

  // ── 6. Semantic merge: same hue + spatial proximity → one object ─────────
  const mergedObjects = semanticMerge(rawBlobs, palette, W, H, imageType);

  // ── 7. Trace contours + compute geometry per object ──────────────────────
  const regions = [];
  for (const obj of mergedObjects) {
    const contour = traceMergedContour(obj.blobs, W, H);
    if (contour.length < 4) continue;

    const pts = normalizePoints(contour, W, H);
    ensureClosed(pts);

    const geo   = computeGeometry(pts, obj, W, H, gradMag);
    const cls   = classifyObject(geo, obj, imageType, W, H);
    const stitch = recommendStitch(geo, cls, imageType);
    const prio  = computePriority(cls, geo);

    regions.push({
      // Identity
      id:            `sem_${regions.length + 1}`,
      hex:           obj.dominantHex,
      rgb:           obj.dominantRgb,
      // Coverage
      coverage:      obj.pixelCount / (W * H),
      pixelCount:    obj.pixelCount,
      area_px:       obj.pixelCount,
      // Geometry
      area_norm:     geo.areaNorm,
      perimeter_norm:geo.perimNorm,
      compacidad:    geo.compactness,
      inertia_ratio: geo.inertiaRatio,
      bbox_aspect:   geo.bboxAspect,
      fill_angle:    geo.orientation,
      centroid:      geo.centroid,
      curvature:     geo.meanCurvature,
      complexity:    geo.complexityScore,
      convexity:     geo.convexity,
      path_points:   pts,
      bbox:          obj.bbox,
      // Semantic
      semantic_object:        cls.objectType,
      semantic_class:         cls.objectClass,
      object_confidence:      cls.confidence,
      recommended_stitch_type:stitch.type,
      recommended_density:    stitch.density,
      recommended_angle:      stitch.angle,
      // Production
      priority:      prio,
      layer_order:   prio,
      image_type:    imageType,
    });
  }

  // Sort: large fills first, then details, then outlines
  regions.sort((a, b) => b.priority - a.priority || b.pixelCount - a.pixelCount);

  return {
    regions,
    imageWidth:  img.width,
    imageHeight: img.height,
    analysisW:   W,
    analysisH:   H,
    imageType,
    semantic: true,
  };
}

// ─── Gradient Computation ────────────────────────────────────────────────────

function computeGradients(pixels, W, H) {
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * pixels[i*4] + 0.587 * pixels[i*4+1] + 0.114 * pixels[i*4+2];
  }
  const mag = new Float32Array(W * H);
  const dir = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const gx =
        -gray[(y-1)*W+(x-1)] + gray[(y-1)*W+(x+1)]
        - 2*gray[y*W+(x-1)]  + 2*gray[y*W+(x+1)]
        - gray[(y+1)*W+(x-1)]+ gray[(y+1)*W+(x+1)];
      const gy =
        -gray[(y-1)*W+(x-1)] - 2*gray[(y-1)*W+x] - gray[(y-1)*W+(x+1)]
        + gray[(y+1)*W+(x-1)]+ 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)];
      const idx = y*W+x;
      mag[idx] = Math.sqrt(gx*gx + gy*gy);
      dir[idx] = Math.atan2(gy, gx);
    }
  }
  return { mag, dir };
}

// ─── Image Type Detection ────────────────────────────────────────────────────

/**
 * Classifies the image as: 'drawing' | 'logo' | 'anime' | 'photo'
 * using edge statistics, color saturation variance, and unique color count.
 */
function detectImageType(pixels, W, H, gradMag) {
  // Edge density
  let edgeSum = 0;
  for (let i = 0; i < W*H; i++) edgeSum += gradMag[i];
  const edgeDensity = edgeSum / (W * H * 255);

  // Saturation and unique hue count
  let satSum = 0, satHigh = 0;
  const hueMap = new Set();
  const sampleStep = 8;
  let count = 0;
  for (let i = 0; i < W*H; i += sampleStep) {
    const r = pixels[i*4], g = pixels[i*4+1], b = pixels[i*4+2], a = pixels[i*4+3];
    if (a < 128) continue;
    const [h, s] = rgbToHsv(r, g, b);
    satSum += s;
    if (s > 0.5) satHigh++;
    hueMap.add(Math.round(h / 15) * 15); // bucket to 15-degree bins
    count++;
  }
  const avgSat     = count > 0 ? satSum / count : 0;
  const satHighPct = count > 0 ? satHigh / count : 0;
  const uniqueHues = hueMap.size;

  if (uniqueHues <= 6 && edgeDensity > 0.15 && avgSat < 0.3) return 'drawing';
  if (uniqueHues <= 10 && avgSat > 0.5 && satHighPct > 0.4) return 'logo';
  if (uniqueHues <= 16 && avgSat > 0.35 && edgeDensity < 0.12) return 'anime';
  return 'photo';
}

// ─── K-Means++ ────────────────────────────────────────────────────────────────

function kMeansPlusPlus(pixels, W, H, k) {
  const samples = [];
  for (let i = 0; i < W*H; i += 4) {
    if (pixels[i*4+3] < 128) continue;
    samples.push([pixels[i*4], pixels[i*4+1], pixels[i*4+2]]);
  }
  if (samples.length === 0) return [];
  k = Math.min(k, samples.length);

  const centroids = [samples[Math.floor(Math.random() * samples.length)]];
  while (centroids.length < k) {
    const dists = samples.map(s => Math.min(...centroids.map(c => distSq3(s, c))));
    const total = dists.reduce((a, b) => a+b, 0);
    if (total === 0) { centroids.push(samples[centroids.length % samples.length]); continue; }
    let r = Math.random() * total, pushed = false;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push([...samples[i]]); pushed = true; break; }
    }
    if (!pushed) centroids.push([...samples[samples.length-1]]);
  }

  for (let iter = 0; iter < 15; iter++) {
    const sums = centroids.map(() => [0,0,0,0]);
    for (const s of samples) {
      const ci = nearestIdx(s, centroids);
      sums[ci][0]+=s[0]; sums[ci][1]+=s[1]; sums[ci][2]+=s[2]; sums[ci][3]++;
    }
    for (let ci = 0; ci < centroids.length; ci++) {
      const cnt = sums[ci][3];
      if (cnt > 0) centroids[ci] = [sums[ci][0]/cnt, sums[ci][1]/cnt, sums[ci][2]/cnt];
    }
  }
  return centroids;
}

function buildLabelMap(pixels, W, H, palette) {
  const labels = new Int32Array(W*H);
  for (let i = 0; i < W*H; i++) {
    if (pixels[i*4+3] < 128) { labels[i] = -1; continue; }
    labels[i] = nearestIdx([pixels[i*4], pixels[i*4+1], pixels[i*4+2]], palette);
  }
  return labels;
}

// ─── Blob Detection ───────────────────────────────────────────────────────────

function findBlobs(labels, W, H, colorIdx, minPixels) {
  const visited = new Uint8Array(W*H);
  const blobs = [];
  for (let start = 0; start < W*H; start++) {
    if (labels[start] !== colorIdx || visited[start]) continue;
    const stack = [start];
    const mask = new Uint8Array(W*H);
    let count = 0;
    let minX=W, maxX=0, minY=H, maxY=0;
    while (stack.length > 0) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (labels[idx] !== colorIdx) continue;
      mask[idx] = 1; count++;
      const x = idx % W, y = Math.floor(idx / W);
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
      if (x>0)     stack.push(idx-1);
      if (x<W-1)   stack.push(idx+1);
      if (y>0)     stack.push(idx-W);
      if (y<H-1)   stack.push(idx+W);
    }
    if (count >= minPixels) blobs.push({ mask, pixelCount:count, bbox:{minX,maxX,minY,maxY} });
  }
  return blobs;
}

// ─── Semantic Merge ───────────────────────────────────────────────────────────

/**
 * Merges blobs that:
 *  a) share similar hue (within hueTolerance)
 *  b) are spatially adjacent or overlapping in bounding boxes
 *
 * For logos/drawings: stricter merge (preserve distinct color areas)
 * For photos/anime:   looser merge (group flesh tones, sky, etc.)
 */
function semanticMerge(blobs, palette, W, H, imageType) {
  const hueTol   = imageType === 'photo' ? 35 : imageType === 'anime' ? 25 : 18;
  const bboxTol  = imageType === 'photo' ? 0.18 : 0.10; // fraction of image

  // Build union-find
  const parent = blobs.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function unite(i, j) { parent[find(i)] = find(j); }

  for (let i = 0; i < blobs.length; i++) {
    for (let j = i+1; j < blobs.length; j++) {
      const bi = blobs[i], bj = blobs[j];
      // Hue similarity
      const [hi] = rgbToHsv(...bi.rgb.map(Math.round));
      const [hj] = rgbToHsv(...bj.rgb.map(Math.round));
      const hueDiff = Math.min(Math.abs(hi-hj), 360-Math.abs(hi-hj));
      if (hueDiff > hueTol) continue;
      // Spatial proximity — bbox overlap or near-touch
      const overlapX = bi.bbox.maxX >= bj.bbox.minX - bboxTol*W && bj.bbox.maxX >= bi.bbox.minX - bboxTol*W;
      const overlapY = bi.bbox.maxY >= bj.bbox.minY - bboxTol*H && bj.bbox.maxY >= bi.bbox.minY - bboxTol*H;
      if (overlapX && overlapY) unite(i, j);
    }
  }

  // Group by root
  const groups = new Map();
  for (let i = 0; i < blobs.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(blobs[i]);
  }

  // Build merged object descriptors
  const objects = [];
  for (const [, groupBlobs] of groups) {
    const totalPx = groupBlobs.reduce((s, b) => s + b.pixelCount, 0);
    // Dominant color = largest blob's color
    const dominant = groupBlobs.reduce((a, b) => b.pixelCount > a.pixelCount ? b : a);

    // Merged bounding box
    const bbox = {
      minX: Math.min(...groupBlobs.map(b => b.bbox.minX)),
      maxX: Math.max(...groupBlobs.map(b => b.bbox.maxX)),
      minY: Math.min(...groupBlobs.map(b => b.bbox.minY)),
      maxY: Math.max(...groupBlobs.map(b => b.bbox.maxY)),
    };

    objects.push({
      blobs:       groupBlobs,
      pixelCount:  totalPx,
      dominantHex: dominant.hex,
      dominantRgb: dominant.rgb,
      bbox,
    });
  }

  return objects.filter(o => o.pixelCount >= 12);
}

// ─── Merged Contour Tracing ───────────────────────────────────────────────────

/**
 * For a merged object (multiple blobs), build a combined mask and trace one contour.
 */
function traceMergedContour(blobs, W, H) {
  // Merge all blob masks
  const merged = new Uint8Array(W * H);
  for (const b of blobs) {
    for (let i = 0; i < W*H; i++) {
      if (b.mask[i]) merged[i] = 1;
    }
  }

  // Morphological dilation (1px) to close small gaps between merged blobs
  const dilated = new Uint8Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const idx = y*W+x;
      if (merged[idx] || merged[idx-1] || merged[idx+1] || merged[idx-W] || merged[idx+W]) {
        dilated[idx] = 1;
      }
    }
  }

  return mooreTrace(dilated, W, H);
}

// Moore neighbor tracing (same as contourTracer)
const MOORE_DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

function mooreTrace(mask, W, H) {
  let start = -1;
  for (let i = 0; i < W*H; i++) { if (mask[i]) { start = i; break; } }
  if (start === -1) return [];
  const contour = [];
  let cx = start%W, cy = Math.floor(start/W);
  const sx=cx, sy=cy;
  let dir = 0;
  for (let step = 0; step < Math.min(W*H, 40000); step++) {
    contour.push([cx, cy]);
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir+6+d)%8;
      const nx = cx+MOORE_DIRS[nd][0], ny = cy+MOORE_DIRS[nd][1];
      if (nx<0||nx>=W||ny<0||ny>=H) continue;
      if (mask[ny*W+nx]) { dir=nd; cx=nx; cy=ny; moved=true; break; }
    }
    if (!moved) break;
    if (step > 4 && cx===sx && cy===sy) break;
  }
  return contour;
}

// ─── Geometry Per Object ──────────────────────────────────────────────────────

function computeGeometry(pts, obj, W, H, gradMag) {
  const n = pts.length;
  if (n < 3) return {};

  // Area (Shoelace)
  let areaNorm = 0;
  for (let i = 0; i < n; i++) {
    const j = (i+1)%n;
    areaNorm += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1];
  }
  areaNorm = Math.abs(areaNorm) / 2;

  // Perimeter
  let perimNorm = 0;
  for (let i = 0; i < n-1; i++) perimNorm += Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]);

  // Compactness
  const compactness = perimNorm > 0 ? Math.min(1, (4*Math.PI*areaNorm) / (perimNorm*perimNorm)) : 0;

  // PCA: orientation + inertia ratio
  const cx = pts.reduce((s,p) => s+p[0], 0)/n;
  const cy = pts.reduce((s,p) => s+p[1], 0)/n;
  let sxx=0, sxy=0, syy=0;
  for (const [x,y] of pts) { const dx=x-cx, dy=y-cy; sxx+=dx*dx; sxy+=dx*dy; syy+=dy*dy; }
  const trace = sxx+syy;
  const det   = sxx*syy - sxy*sxy;
  const disc  = Math.sqrt(Math.max(0, (trace/2)**2 - det));
  const lam1  = trace/2+disc, lam2 = trace/2-disc;
  const inertiaRatio = lam2 > 1e-9 ? lam1/lam2 : 10;
  const orientation  = Math.round(((0.5*Math.atan2(2*sxy,sxx-syy)*180/Math.PI)+180)%180);

  // Mean curvature
  let totalCurv = 0;
  for (let i = 0; i < n; i++) {
    const a=pts[(i-1+n)%n], b=pts[i], c=pts[(i+1)%n];
    const v1=[b[0]-a[0],b[1]-a[1]], v2=[c[0]-b[0],c[1]-b[1]];
    const l1=Math.hypot(...v1), l2=Math.hypot(...v2);
    if (l1<1e-9||l2<1e-9) continue;
    const dot=(v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2);
    totalCurv += Math.acos(Math.max(-1,Math.min(1,dot)));
  }
  const meanCurvature = +(totalCurv/n).toFixed(4);

  // Convexity
  const hull = convexHull(pts);
  const hullArea = Math.abs((() => {
    let a=0; const hn=hull.length;
    for (let i=0;i<hn;i++){const j=(i+1)%hn; a+=hull[i][0]*hull[j][1]-hull[j][0]*hull[i][1];}
    return a;
  })()/2);
  const convexity = hullArea > 1e-9 ? Math.min(1, areaNorm/hullArea) : 1;

  // Complexity score
  const vertexScore = Math.min(1, n/200);
  const curvScore   = Math.min(1, meanCurvature/1.5);
  const convScore   = 1-convexity;
  const complexityScore = +(vertexScore*0.35 + curvScore*0.40 + convScore*0.25).toFixed(3);

  // Bbox aspect
  const bw = (obj.bbox.maxX - obj.bbox.minX)/W;
  const bh = (obj.bbox.maxY - obj.bbox.minY)/H;
  const bboxAspect = bh > 0 ? bw/bh : 1;

  // Average gradient magnitude inside bbox (texture indicator)
  let gradSum = 0, gradCount = 0;
  const x0=obj.bbox.minX, x1=obj.bbox.maxX, y0=obj.bbox.minY, y1=obj.bbox.maxY;
  for (let y=y0; y<=y1; y+=4) {
    for (let x=x0; x<=x1; x+=4) {
      gradSum += gradMag[y*W+x] || 0; gradCount++;
    }
  }
  const avgGradient = gradCount > 0 ? gradSum/gradCount : 0;

  return {
    areaNorm, perimNorm, compactness, inertiaRatio, orientation,
    meanCurvature, convexity, complexityScore, bboxAspect,
    avgGradient, centroid: [+cx.toFixed(5), +cy.toFixed(5)],
  };
}

// ─── Object Classification ────────────────────────────────────────────────────

/**
 * Assigns semantic class + object type based on geometry, color, position, and image type.
 *
 * objectClass:
 *   'background' — large region, low complexity, low gradient
 *   'fill_area'  — medium region, moderate complexity
 *   'outline'    — thin elongated region (high inertia)
 *   'detail'     — small region, high curvature
 *   'highlight'  — very small, bright/white
 *
 * objectType: human-readable label (skin, hair, eye, sky, outline, background, etc.)
 */
function classifyObject(geo, obj, imageType, W, H) {
  if (!geo.areaNorm) return { objectClass: 'fill_area', objectType: 'region', confidence: 0.5 };

  const totalPxFraction = obj.pixelCount / (W * H);
  const [r, g, b] = obj.dominantRgb.map(Math.round);
  const [h, s, v] = rgbToHsv(r, g, b);
  const brightness = v;
  const isLight    = brightness > 0.85;
  const isDark     = brightness < 0.15;
  const isNeutral  = s < 0.15;

  let objectClass, objectType, confidence;

  // Background: largest area, low complexity
  if (totalPxFraction > 0.25 && geo.complexityScore < 0.3 && geo.compactness > 0.4) {
    objectClass = 'background';
    objectType  = isLight ? 'fondo_blanco' : isDark ? 'fondo_negro' : 'fondo';
    confidence  = 0.85;

  // Outline: thin + elongated
  } else if (geo.inertiaRatio > 4 || (geo.compactness < 0.2 && isDark)) {
    objectClass = 'outline';
    objectType  = isDark ? 'contorno_negro' : 'contorno';
    confidence  = 0.80;

  // Highlight: tiny + very bright
  } else if (totalPxFraction < 0.01 && isLight) {
    objectClass = 'highlight';
    objectType  = 'brillo';
    confidence  = 0.75;

  // Detail: small + high curvature
  } else if (totalPxFraction < 0.03 && (geo.meanCurvature > 0.5 || geo.complexityScore > 0.6)) {
    objectClass = 'detail';
    objectType  = guessDetailType(h, s, v, imageType);
    confidence  = 0.70;

  // Fill area
  } else {
    objectClass = 'fill_area';
    objectType  = guessFillType(h, s, v, imageType);
    confidence  = 0.65;
  }

  return { objectClass, objectType, confidence };
}

function guessDetailType(h, s, v, imageType) {
  if (v < 0.3) return 'pupila';
  if (v > 0.8 && s < 0.2) return 'reflejo_ojo';
  if (h > 20 && h < 40 && s > 0.4) return 'nariz';
  if (imageType === 'anime' && s > 0.5) return 'detalle_anime';
  return 'detalle';
}

function guessFillType(h, s, v, imageType) {
  // Skin tones
  if (h > 5 && h < 35 && s > 0.2 && s < 0.7 && v > 0.5) return 'piel';
  // Hair
  if (v < 0.4 && (s < 0.2 || (h > 15 && h < 50))) return 'cabello';
  // Sky/blue
  if (h > 190 && h < 250 && s > 0.3) return 'cielo';
  // Grass/foliage
  if (h > 80 && h < 150 && s > 0.3) return 'vegetacion';
  // Red/clothing
  if ((h < 15 || h > 345) && s > 0.5) return 'ropa_roja';
  // Anime fill
  if (imageType === 'anime') return 'zona_anime';
  // Logo element
  if (imageType === 'logo') return 'elemento_logo';
  return 'relleno';
}

// ─── Stitch Type Recommendation ──────────────────────────────────────────────

/**
 * Recommends stitch type + density + angle based on:
 * - Object class (outline → satin, large fill → tatami, detail → satin/run)
 * - Geometry (elongation → satin, compact → fill)
 * - Image type (photo → fine fill, logo → satin outlines, anime → clean fill)
 */
function recommendStitch(geo, cls, imageType) {
  const { objectClass } = cls;
  const { areaNorm, inertiaRatio, compactness, complexityScore, orientation, convexity } = geo;

  // ── Outline ──
  if (objectClass === 'outline') {
    return { type: 'satin', density: 0.5, angle: orientation };
  }

  // ── Highlight ──
  if (objectClass === 'highlight') {
    return { type: 'running_stitch', density: 0.3, angle: 0 };
  }

  // ── Detail (small curved region) ──
  if (objectClass === 'detail') {
    if (inertiaRatio > 3) return { type: 'satin', density: 0.55, angle: orientation };
    return { type: 'satin', density: 0.5, angle: (orientation + 45) % 180 };
  }

  // ── Background ──
  if (objectClass === 'background') {
    return { type: 'fill', density: imageType === 'photo' ? 0.35 : 0.45, angle: 45 };
  }

  // ── Fill area ──
  // Thin + elongated → satin
  if (inertiaRatio > 4 || (compactness < 0.3 && areaNorm < 0.05)) {
    return { type: 'satin', density: 0.55, angle: orientation };
  }

  // Photo → finer fill
  if (imageType === 'photo') {
    return { type: 'fill', density: 0.35, angle: orientation };
  }

  // Logo → clean fill or satin depending on size
  if (imageType === 'logo') {
    return areaNorm > 0.04
      ? { type: 'fill',  density: 0.45, angle: orientation }
      : { type: 'satin', density: 0.5,  angle: orientation };
  }

  // Anime → clean flat fill
  if (imageType === 'anime') {
    return { type: 'fill', density: 0.42, angle: orientation };
  }

  // Drawing: use complexity to decide
  if (complexityScore > 0.65) return { type: 'satin', density: 0.55, angle: orientation };
  return { type: 'fill', density: 0.45, angle: orientation };
}

// ─── Priority ────────────────────────────────────────────────────────────────

function computePriority(cls, geo) {
  // Execution order: backgrounds first (5), fills (4/3), details (2), outlines last (1)
  if (cls.objectClass === 'background') return 5;
  if (cls.objectClass === 'fill_area') {
    return geo.areaNorm > 0.06 ? 4 : 3;
  }
  if (cls.objectClass === 'detail' || cls.objectClass === 'highlight') return 2;
  if (cls.objectClass === 'outline') return 1;
  return 2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePoints(pts, W, H) {
  return pts.map(([x,y]) => [parseFloat((x/W).toFixed(5)), parseFloat((y/H).toFixed(5))]);
}

function ensureClosed(pts) {
  if (pts.length < 2) return;
  if (pts[0][0] !== pts[pts.length-1][0] || pts[0][1] !== pts[pts.length-1][1]) {
    pts.push([...pts[0]]);
  }
}

function distSq3(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2; }

function nearestIdx(rgb, palette) {
  let best=0, bestD=Infinity;
  for (let i=0; i<palette.length; i++) { const d=distSq3(rgb,palette[i]); if(d<bestD){bestD=d;best=i;} }
  return best;
}

function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

/** Returns [hue 0-360, sat 0-1, val 0-1] */
function rgbToHsv(r, g, b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if (d > 0) {
    if (max===r) h = ((g-b)/d + (g<b?6:0))*60;
    else if (max===g) h = ((b-r)/d + 2)*60;
    else h = ((r-g)/d + 4)*60;
  }
  return [h, max > 0 ? d/max : 0, max];
}

function convexHull(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a,b) => a[0]-b[0]||a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[], upper=[];
  for (const p of sorted) { while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}