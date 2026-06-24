/* global Deno */

/**
 * BENCHMARK EXHAUSTIVO - Compara todos los motores
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const { pixels, width, height } = await req.json();

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid input' });
    }

    console.log('[BENCHMARK] Analyzing vectorization quality...');

    const analysis = {
      contour_detection: analyzeContoursInPixels(pixels, width, height),
      fill_distribution: analyzeFillInPixels(pixels, width, height),
      color_separation: analyzeColorsInPixels(pixels),
      overall_quality: 0
    };

    // Calcular score final
    const scores = [
      analysis.contour_detection.score,
      analysis.fill_distribution.score,
      analysis.color_separation.score
    ];

    analysis.overall_quality = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Recomendaciones
    const recommendations = [];
    if (analysis.contour_detection.score < 70) {
      recommendations.push('⚠️ Contour detection needs improvement');
    }
    if (analysis.fill_distribution.score < 70) {
      recommendations.push('⚠️ Fill distribution is sparse - increase density');
    }
    if (analysis.color_separation.score < 70) {
      recommendations.push('⚠️ Poor color separation - more distinct colors needed');
    }
    if (analysis.overall_quality >= 80) {
      recommendations.push('✅ Quality is suitable for production');
    }

    console.log(`[BENCHMARK] ✅ Score: ${analysis.overall_quality}/100`);

    return Response.json({
      success: true,
      data: {
        analysis,
        recommendations,
        quality_level: analysis.overall_quality >= 85 ? 'EXCELLENT' : analysis.overall_quality >= 75 ? 'GOOD' : 'FAIR'
      }
    });
  } catch (err) {
    console.error('[BENCHMARK]', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// ANÁLISIS DE PÍXELES
// ============================================================================

function analyzeContoursInPixels(pixels, w, h) {
  let edgeCount = 0;
  let transitionCount = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const gray = r * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;

    // Detectar cambios abruptos (edges)
    if (i >= 4) {
      const prevGray = pixels[i - 4] * 0.299 + pixels[i - 3] * 0.587 + pixels[i - 2] * 0.114;
      if (Math.abs(gray - prevGray) > 50) {
        edgeCount++;
      }
    }

    // Detectar valores intermedios (transiciones suaves)
    if (gray > 50 && gray < 200) {
      transitionCount++;
    }
  }

  const edgeDensity = (edgeCount / (pixels.length / 4)) * 100;
  const smoothness = (transitionCount / (pixels.length / 4)) * 100;

  let score = 40;
  score += Math.min(40, edgeDensity / 2); // Más edges = mejor contorno
  score += Math.min(20, smoothness / 2); // Más transiciones = contornos suavizados

  return {
    score: Math.round(score),
    edge_density: edgeDensity.toFixed(2) + '%',
    smoothness: smoothness.toFixed(2) + '%',
    evaluation: score >= 70 ? 'GOOD' : score >= 50 ? 'FAIR' : 'POOR'
  };
}

function analyzeFillInPixels(pixels, w, h) {
  // Analizar distribución de densidad
  const cells = 4;
  const cellW = Math.ceil(w / cells);
  const cellH = Math.ceil(h / cells);

  const cellDensity = [];

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let coloredPixels = 0;

      for (let y = cy * cellH; y < (cy + 1) * cellH && y < h; y++) {
        for (let x = cx * cellW; x < (cx + 1) * cellW && x < w; x++) {
          const idx = (y * w + x) * 4;
          const gray = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
          if (gray < 200) coloredPixels++;
        }
      }

      cellDensity.push(coloredPixels);
    }
  }

  // Calcular uniformidad
  const avg = cellDensity.reduce((a, b) => a + b, 0) / cellDensity.length;
  const variance = cellDensity.reduce((s, d) => s + Math.pow(d - avg, 2), 0) / cellDensity.length;
  const stdDev = Math.sqrt(variance);
  const uniformity = Math.max(0, 100 - (stdDev / avg) * 100);

  let score = 40;
  score += Math.min(40, uniformity);
  score += (avg > 0 ? 20 : 0); // Tiene algo de relleno

  return {
    score: Math.round(Math.min(100, score)),
    uniformity: uniformity.toFixed(2) + '%',
    avg_density: avg.toFixed(2),
    variance: stdDev.toFixed(2),
    evaluation: score >= 70 ? 'UNIFORM' : score >= 50 ? 'MODERATE' : 'SPARSE'
  };
}

function analyzeColorsInPixels(pixels) {
  const colors = new Set();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.round(pixels[i] / 50) * 50;
    const g = Math.round(pixels[i + 1] / 50) * 50;
    const b = Math.round(pixels[i + 2] / 50) * 50;

    colors.add(`${r},${g},${b}`);
  }

  const colorCount = colors.size;
  const score = Math.min(100, 40 + colorCount * 15);

  return {
    score: Math.round(score),
    unique_colors: colorCount,
    separation_quality: colorCount >= 3 ? 'GOOD' : colorCount >= 2 ? 'MODERATE' : 'POOR'
  };
}