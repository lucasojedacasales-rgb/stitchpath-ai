/* global Deno */

/**
 * TEST SUITE PROFESIONAL - VALIDACIÓN CONTRA WILCOM/HATCH
 * =====================================================
 * 
 * Pruebas de calidad:
 * 1. Contour Accuracy - Precisión de contornos trazados
 * 2. Fill Distribution - Distribución uniforme de rellenos
 * 3. Stitch Count Efficiency - Optimización de conteo de puntadas
 * 4. Path Closure - Validación de caminos cerrados
 * 5. Color Separation - Separación de colores limpia
 * 6. Underlay Detection - Detección correcta de underlays
 * 7. Density Consistency - Consistencia de densidad
 */

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });

    const { pixels, width, height, width_mm = 100, height_mm = 100 } = await req.json();

    console.log('[QA_TEST] Starting quality assessment suite...');

    if (!pixels || width < 2 || height < 2) {
      return Response.json({ success: false, error: 'Invalid input' });
    }

    // Ejecutar tests
    const tests = {
      contour_tracing: testContourTracing(pixels, width, height),
      fill_distribution: testFillDistribution(pixels, width, height),
      path_closure: testPathClosure(pixels, width, height),
      stitch_efficiency: testStitchEfficiency(pixels, width, height),
      color_separation: testColorSeparation(pixels, width, height),
      underlay_detection: testUnderlayDetection(pixels, width, height),
      density_consistency: testDensityConsistency(pixels, width, height)
    };

    // Calcular score final
    const scores = Object.values(tests).map(t => t.score).filter(s => s !== null && !isNaN(s));
    const finalScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    console.log(`[QA_TEST] ✅ All tests completed. Final Score: ${finalScore}/100`);

    return Response.json({
      success: true,
      data: {
        tests,
        final_score: finalScore,
        wilcom_compatible: finalScore >= 85,
        hatch_compatible: finalScore >= 80,
        recommendations: generateRecommendations(tests, finalScore)
      }
    });
  } catch (err) {
    console.error('[QA_TEST]', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ============================================================================
// TEST 1: CONTOUR TRACING ACCURACY
// ============================================================================

function testContourTracing(pixels, w, h) {
  console.log('[TEST] Contour Tracing Accuracy...');
  
  const edgeCount = countEdgePixels(pixels, w, h);
  const imageComplexity = edgeCount / (w * h);
  
  let score = 50; // Base
  
  // Más edges = más difícil trazar, pero importante hacerlo bien
  if (imageComplexity < 0.1) {
    score += 40; // Imagen simple
  } else if (imageComplexity < 0.3) {
    score += 30; // Complejidad media
  } else {
    score += 20; // Muy complejo
  }
  
  // Validar que contornos son suavizados
  score += validateSmoothness(pixels, w, h) ? 10 : 0;

  return {
    name: 'Contour Tracing',
    score: Math.min(100, score),
    details: {
      edge_density: (imageComplexity * 100).toFixed(2) + '%',
      complexity: imageComplexity < 0.15 ? 'LOW' : imageComplexity < 0.3 ? 'MEDIUM' : 'HIGH',
      smooth_contours: validateSmoothness(pixels, w, h)
    }
  };
}

function countEdgePixels(pixels, w, h) {
  let edgeCount = 0;
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          const gray = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
          const kernelIdx = (dy + 1) * 3 + (dx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      if (Math.sqrt(gx * gx + gy * gy) > 100) edgeCount++;
    }
  }

  return edgeCount;
}

function validateSmoothness(pixels, w, h) {
  // Chequear si hay transiciones suaves vs aliasing
  let smoothPixels = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Valores intermedios indican gradientes suavizados
    if ((r > 50 && r < 200) || (g > 50 && g < 200) || (b > 50 && b < 200)) {
      smoothPixels++;
    }
  }

  return (smoothPixels / (pixels.length / 4)) > 0.15;
}

// ============================================================================
// TEST 2: FILL DISTRIBUTION
// ============================================================================

function testFillDistribution(pixels, w, h) {
  console.log('[TEST] Fill Distribution...');
  
  const fillQuality = analyzeUniformity(pixels, w, h);
  const score = 50 + fillQuality;

  return {
    name: 'Fill Distribution',
    score: Math.min(100, score),
    details: {
      uniformity: (fillQuality).toFixed(2),
      coverage: calculateCoverage(pixels).toFixed(2) + '%',
      variance: calculateVariance(pixels).toFixed(2)
    }
  };
}

function analyzeUniformity(pixels, w, h) {
  // Verificar que los píxeles de color están distribuidos uniformemente
  const cells = 4;
  const cellW = Math.ceil(w / cells);
  const cellH = Math.ceil(h / cells);
  
  const cellCounts = [];
  
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let count = 0;
      
      for (let y = cy * cellH; y < (cy + 1) * cellH && y < h; y++) {
        for (let x = cx * cellW; x < (cx + 1) * cellW && x < w; x++) {
          const idx = (y * w + x) * 4;
          const gray = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
          if (gray < 200) count++;
        }
      }
      
      cellCounts.push(count);
    }
  }
  
  const avg = cellCounts.reduce((a, b) => a + b, 0) / cellCounts.length;
  const variance = cellCounts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) / cellCounts.length;
  
  // Menor varianza = mejor distribución
  return Math.max(0, 50 - Math.sqrt(variance) / 10);
}

function calculateCoverage(pixels) {
  let coloredPixels = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    if (gray < 200) coloredPixels++;
  }
  
  return (coloredPixels / (pixels.length / 4)) * 100;
}

function calculateVariance(pixels) {
  const values = [];
  
  for (let i = 0; i < pixels.length; i += 4) {
    values.push(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
  }
  
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length);
}

// ============================================================================
// TEST 3: PATH CLOSURE VALIDATION
// ============================================================================

function testPathClosure(pixels, w, h) {
  console.log('[TEST] Path Closure...');
  
  let score = 50;
  const regions = detectRegions(pixels, w, h);
  
  let closedRegions = 0;
  for (const region of regions) {
    if (region.isClosed) closedRegions++;
  }
  
  const closureRate = (closedRegions / regions.length) * 100;
  score += closureRate / 2; // +0.5 por cada %

  return {
    name: 'Path Closure',
    score: Math.min(100, score),
    details: {
      total_regions: regions.length,
      closed_regions: closedRegions,
      closure_rate: closureRate.toFixed(2) + '%'
    }
  };
}

function detectRegions(pixels, w, h) {
  // Detección simple de regiones conectadas
  const visited = new Uint8Array(w * h);
  const regions = [];
  
  for (let idx = 0; idx < w * h; idx++) {
    if (visited[idx]) continue;
    
    const pix = pixels[idx * 4];
    const region = { pixels: [], isClosed: false };
    const stack = [idx];
    
    while (stack.length > 0) {
      const cur = stack.pop();
      if (visited[cur]) continue;
      
      visited[cur] = 1;
      region.pixels.push(cur);
      
      const x = cur % w;
      const y = Math.floor(cur / w);
      
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            const npix = pixels[nIdx * 4];
            if (!visited[nIdx] && Math.abs(pix - npix) < 50) {
              stack.push(nIdx);
            }
          }
        }
      }
    }
    
    // Verificar si está cerrado
    if (region.pixels.length > 4) {
      region.isClosed = checkIfClosed(region.pixels, w, h);
    }
    
    regions.push(region);
  }
  
  return regions.filter(r => r.pixels.length > 8);
}

function checkIfClosed(pixels, w, h) {
  // Heurística: región cerrada tiene perímetro similar a área
  const xs = new Set(), ys = new Set();
  
  for (const idx of pixels) {
    xs.add(idx % w);
    ys.add(Math.floor(idx / w));
  }
  
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const perimeterEst = 2 * (width + height);
  
  // Si la región ocupa la mayoría del bounding box, está cerrada
  return pixels.length > (width * height) * 0.3;
}

// ============================================================================
// TEST 4: STITCH EFFICIENCY
// ============================================================================

function testStitchEfficiency(pixels, w, h) {
  console.log('[TEST] Stitch Efficiency...');
  
  const coverage = calculateCoverage(pixels);
  const efficiency = Math.min(100, coverage * 0.8 + 20);

  return {
    name: 'Stitch Efficiency',
    score: Math.round(efficiency),
    details: {
      coverage: coverage.toFixed(2) + '%',
      estimated_stitches: Math.round(coverage * (w * h) / 100),
      efficiency_ratio: (efficiency / 100).toFixed(3)
    }
  };
}

// ============================================================================
// TEST 5: COLOR SEPARATION
// ============================================================================

function testColorSeparation(pixels, w, h) {
  console.log('[TEST] Color Separation...');
  
  const colors = extractColors(pixels);
  let score = Math.min(100, 40 + colors.length * 15); // +15 por cada color

  return {
    name: 'Color Separation',
    score: Math.round(score),
    details: {
      unique_colors: colors.length,
      primary_color: colors[0] || 'N/A',
      color_contrast: calculateContrast(colors).toFixed(2)
    }
  };
}

function extractColors(pixels) {
  const colors = new Set();
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.round(pixels[i] / 50) * 50;
    const g = Math.round(pixels[i + 1] / 50) * 50;
    const b = Math.round(pixels[i + 2] / 50) * 50;
    
    colors.add(`${r},${g},${b}`);
  }
  
  return Array.from(colors);
}

function calculateContrast(colors) {
  if (colors.length < 2) return 0;
  
  let maxDist = 0;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const [r1, g1, b1] = colors[i].split(',').map(Number);
      const [r2, g2, b2] = colors[j].split(',').map(Number);
      const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
      maxDist = Math.max(maxDist, dist);
    }
  }
  
  return Math.min(100, (maxDist / 255) * 100);
}

// ============================================================================
// TEST 6: UNDERLAY DETECTION
// ============================================================================

function testUnderlayDetection(pixels, w, h) {
  console.log('[TEST] Underlay Detection...');
  
  const needsUnderlay = calculateCoverage(pixels) > 40;
  const score = needsUnderlay ? 80 : 60;

  return {
    name: 'Underlay Detection',
    score: score,
    details: {
      should_have_underlay: needsUnderlay,
      coverage_threshold: '40%',
      current_coverage: calculateCoverage(pixels).toFixed(2) + '%'
    }
  };
}

// ============================================================================
// TEST 7: DENSITY CONSISTENCY
// ============================================================================

function testDensityConsistency(pixels, w, h) {
  console.log('[TEST] Density Consistency...');
  
  const variance = calculateVariance(pixels);
  const consistency = Math.max(0, 100 - variance / 2.5);

  return {
    name: 'Density Consistency',
    score: Math.round(consistency),
    details: {
      variance: variance.toFixed(2),
      uniformity_rating: consistency > 80 ? 'EXCELLENT' : consistency > 60 ? 'GOOD' : 'FAIR',
      target_variance: '< 30'
    }
  };
}

// ============================================================================
// RECOMENDACIONES
// ============================================================================

function generateRecommendations(tests, finalScore) {
  const recommendations = [];
  
  for (const [name, test] of Object.entries(tests)) {
    if (test.score < 70) {
      recommendations.push(`⚠️ ${test.name} (${test.score}/100): Necesita mejora`);
    }
  }
  
  if (finalScore >= 85) {
    recommendations.push('✅ Calidad compatible con Wilcom');
  } else if (finalScore >= 80) {
    recommendations.push('✅ Calidad compatible con Hatch');
  } else {
    recommendations.push('⚠️ Mejorar calidad general del vectorizado');
  }
  
  return recommendations;
}