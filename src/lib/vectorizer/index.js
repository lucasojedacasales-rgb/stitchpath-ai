/**
 * lib/vectorizer/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid Vectorizer — pluggable engine selector.
 *
 * Architecture:
 *   VectorizerEngine interface → { name, supports(imageProfile), run(ctx) → ContourSet }
 *   HybridVectorizer           → selects engine per-call, evaluates quality, picks best
 *
 * Adding a new engine: create a file in lib/vectorizer/engines/ and register it below.
 *
 * Decision logic:
 *   1. If user forced an engine (config.vector_engine), use it directly.
 *   2. Otherwise, ask each compatible engine to score the image profile.
 *   3. Run top-1 (or top-2 if competitive scores), pick highest quality result.
 */

import { potraceEngine }  from './engines/potrace.js';
import { vtracerEngine }  from './engines/vtracer.js';
import { kmeansEngine }   from './engines/kmeans.js';

// ─── Engine Registry ──────────────────────────────────────────────────────────
// To add a new engine: import it and push to ENGINES.
// Each engine must implement: { name, score(imageProfile) → 0–1, run(url, opts) → ContourSet }

const ENGINES = [
  potraceEngine,   // best for binary / logo / high-contrast
  vtracerEngine,   // best for full-color / gradients / illustrations
  kmeansEngine,    // fallback: pure JS — always available, no WASM
];

// ─── Image Profile ────────────────────────────────────────────────────────────

/**
 * Derives a simple image profile from the analysis context.
 * Used by engines to decide compatibility/preference.
 *
 * @param {Object} analysis - ImageAnalysisResult from imageAnalysisStage
 * @param {string} imageType - detected semantic type
 * @returns {ImageProfile}
 */
export function buildImageProfile(analysis, imageType) {
  const colors     = analysis?.dominantColors?.length || 2;
  const complexity = analysis?.complexity || 'medium';
  const gradients  = analysis?.hasGradients || false;
  const details    = analysis?.hasFineDetails || false;
  const edgeGrid   = analysis?.edgeDensityMap || [];
  const avgEdge    = edgeGrid.flat().reduce((s, v) => s + v, 0) / Math.max(1, edgeGrid.flat().length);

  // Binary = few colors, high contrast, no gradients
  const isBinary = (colors <= 2 && !gradients && avgEdge > 0.3) ||
                   imageType === 'logo' ||
                   (imageType === 'drawing' && colors <= 3);

  const isColorRich = colors > 4 || gradients ||
                      imageType === 'photo' || imageType === 'anime';

  return {
    imageType:   imageType || 'unknown',
    colorCount:  colors,
    complexity,
    hasGradients: gradients,
    hasFineDetails: details,
    avgEdgeDensity: avgEdge,
    isBinary,
    isColorRich,
  };
}

// ─── Engine Selection ─────────────────────────────────────────────────────────

/**
 * Selects the best engine for the given profile.
 * If forceEngine is set, returns that engine directly.
 *
 * @param {ImageProfile} profile
 * @param {string} [forceEngine]  - 'potrace' | 'vtracer' | 'kmeans' | 'hybrid'
 * @returns {{ primary: Engine, secondary: Engine | null }}
 */
export function selectEngines(profile, forceEngine) {
  if (forceEngine && forceEngine !== 'hybrid') {
    const forced = ENGINES.find(e => e.name === forceEngine);
    if (forced) return { primary: forced, secondary: null };
  }

  // Score each engine
  const scored = ENGINES
    .map(e => ({ engine: e, score: e.score(profile) }))
    .sort((a, b) => b.score - a.score);

  const primary   = scored[0].engine;
  // Run secondary if scores are close (within 0.15) — pick best result
  const secondary = (scored[1] && (scored[0].score - scored[1].score) < 0.15)
    ? scored[1].engine
    : null;

  return { primary, secondary };
}

// ─── Quality Evaluation ───────────────────────────────────────────────────────

/**
 * Scores a ContourSet quality:
 *   - region count (more = better, up to ideal)
 *   - average path points per region (more detail)
 *   - coverage variance (uniform = good)
 *   - no tiny orphan regions
 *
 * @param {ContourSet} contourSet
 * @returns {number} 0–1
 */
export function scoreContourQuality(contourSet) {
  if (!contourSet?.regions?.length) return 0;

  const regions = contourSet.regions;
  const n       = regions.length;

  // Region count score — sweet spot is 5–60 (allows more detail without penalty)
  const countScore = n < 3 ? 0.3 : n < 5 ? 0.6 : n <= 60 ? 1.0 : n <= 100 ? 0.85 : 0.6;

  // Average path density
  const avgPoints = regions.reduce((s, r) => s + (r.path_points?.length || 0), 0) / n;
  const pointScore = avgPoints < 5 ? 0.3 : avgPoints < 12 ? 0.7 : 1.0;

  // Compactness quality — prefer regions with good compacidad
  const compacScore = regions.reduce((s, r) => s + Math.min(1, (r.compacidad || 0) * 2), 0) / n;

  // Penalize if all regions are tiny slivers (possible WASM artifact)
  const validFill = regions.filter(r => (r.coverage || 0) > 0.001).length / n;

  return (countScore * 0.35 + pointScore * 0.25 + compacScore * 0.25 + validFill * 0.15);
}

// ─── Main Hybrid Vectorizer ───────────────────────────────────────────────────

/**
 * Runs the hybrid vectorization pipeline.
 * Selects engine(s) automatically, evaluates quality, returns best ContourSet.
 *
 * @param {string}  imageUrl
 * @param {number}  colorCount
 * @param {Object}  opts         - contourTracer options (analysisSize, minPixelArea, etc.)
 * @param {Object}  [analysis]   - ImageAnalysisResult
 * @param {string}  [imageType]  - semantic image type
 * @param {string}  [forceEngine] - override: 'potrace' | 'vtracer' | 'kmeans' | 'hybrid'
 * @returns {Promise<{ contourSet: ContourSet, engineUsed: string, quality: number }>}
 */
export async function runHybridVectorizer(imageUrl, colorCount, opts, analysis, imageType, forceEngine) {
  const profile = buildImageProfile(analysis, imageType);
  const { primary, secondary } = selectEngines(profile, forceEngine);

  // Run primary (always)
  const [primaryResult, secondaryResult] = await Promise.all([
    primary.run(imageUrl, colorCount, opts).catch(err => {
      console.warn(`[Vectorizer] ${primary.name} failed:`, err.message);
      return null;
    }),
    secondary
      ? secondary.run(imageUrl, colorCount, opts).catch(err => {
          console.warn(`[Vectorizer] ${secondary.name} failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // If primary failed, fall through to secondary or built-in kmeans
  const candidates = [
    primaryResult  && { set: primaryResult,  engine: primary.name },
    secondaryResult && { set: secondaryResult, engine: secondary.name },
  ].filter(Boolean);

  if (candidates.length === 0) {
    // Last resort: kmeans (always works, pure JS)
    const fallback = await kmeansEngine.run(imageUrl, colorCount, opts);
    return { contourSet: fallback, engineUsed: 'kmeans_fallback', quality: scoreContourQuality(fallback) };
  }

  // Pick candidate with highest quality score
  const best = candidates
    .map(c => ({ ...c, quality: scoreContourQuality(c.set) }))
    .sort((a, b) => b.quality - a.quality)[0];

  return {
    contourSet: best.set,
    engineUsed: best.engine,
    quality:    best.quality,
  };
}