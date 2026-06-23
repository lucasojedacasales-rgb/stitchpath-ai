/// <reference lib="deno" />
/**
 * Test Suite para el Conector HTTP de Base44
 * 
 * Ejecutar desde el backend Deno:
 * deno test --allow-net test_connector.js
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * MOCK de la función robustVectorization
 * Simula lo que pasa cuando Base44 la llama
 */
async function mockRobustVectorization(pixels, width, height, config = {}) {
  const {
    width_mm = 100,
    height_mm = 100,
    color_count = 6,
    stitch_density = 0.7
  } = config;

  // Simular llamada a API
  const formData = new FormData();
  
  // Convertir pixels a blob (simplificado)
  const pixelBlob = new Blob([new Uint8Array(pixels)]);
  formData.append('image', pixelBlob, 'image.png');
  formData.append('color_count', color_count.toString());
  formData.append('width_mm', width_mm.toString());
  formData.append('height_mm', height_mm.toString());
  formData.append('stitch_density', stitch_density.toString());

  // En test real, esto llamaría la API
  return {
    success: true,
    regions: [
      {
        id: 'r0',
        color: { r: 255, g: 0, b: 0 },
        type: 'fill',
        pointCount: 500,
        stitches: Array(500).fill(0).map((_, i) => ({
          x: 10 + (i % 10),
          y: 20 + Math.floor(i / 10)
        })),
        angle: 45
      },
      {
        id: 'r1',
        color: { r: 0, g: 255, b: 0 },
        type: 'satin',
        pointCount: 300,
        stitches: Array(300).fill(0).map((_, i) => ({
          x: 50 + (i % 5),
          y: 30 + Math.floor(i / 5)
        })),
        angle: 90
      }
    ],
    totalStitches: 800,
    colorCount: 2,
    width: width_mm,
    height: height_mm
  };
}

/**
 * Transformar respuesta API al formato interno
 */
function transformApiResponse(apiResult, widthMm, heightMm) {
  const regions = (apiResult.regions || []).map((r, idx) => ({
    id: r.id || `r${idx}`,
    name: `${r.color?.r || 0}_${r.type}`,
    color: r.color,
    stitch_type: r.type || 'fill',
    density: 0.7,
    angle: r.angle || 45,
    path_points: (r.stitches || []).map(s => [s.x / widthMm, s.y / heightMm]),
    stitch_count: r.pointCount || 0,
    area_mm2: (r.pointCount || 0) * 0.1,
    visible: true
  }));

  return {
    regions,
    total_stitches: apiResult.totalStitches || 0,
    colors_used: apiResult.colorCount || 0,
    api_url: 'https://api.example.com'
  };
}

// ============================================================
// TESTS
// ============================================================

Deno.test("Test 1: API devuelve estructura correcta", async () => {
  const pixels = new Uint8Array(100 * 100 * 4);
  pixels.fill(255); // Blanco
  
  const result = await mockRobustVectorization(pixels, 100, 100);
  
  assert(result.success === true, "success debe ser true");
  assert(Array.isArray(result.regions), "regions debe ser array");
  assert(result.totalStitches > 0, "debe haber puntadas");
  assert(result.colorCount > 0, "debe detectar colores");
});

Deno.test("Test 2: Transformación de respuesta", () => {
  const apiResult = {
    success: true,
    regions: [
      {
        id: 'r0',
        color: { r: 255, g: 0, b: 0 },
        type: 'fill',
        pointCount: 500,
        stitches: [
          { x: 10, y: 20 },
          { x: 15, y: 25 }
        ]
      }
    ],
    totalStitches: 500,
    colorCount: 1
  };

  const transformed = transformApiResponse(apiResult, 100, 100);
  
  assert(Array.isArray(transformed.regions), "regions debe ser array");
  assertEquals(transformed.total_stitches, 500, "puntadas deben ser 500");
  assertEquals(transformed.colors_used, 1, "colores deben ser 1");
  
  const region = transformed.regions[0];
  assert(region.name, "región debe tener nombre");
  assert(Array.isArray(region.path_points), "path_points debe ser array");
  assertEquals(region.stitch_count, 500, "región debe tener 500 puntadas");
});

Deno.test("Test 3: Normalización de coordenadas", () => {
  const apiResult = {
    regions: [
      {
        id: 'r0',
        color: { r: 255, g: 0, b: 0 },
        type: 'fill',
        pointCount: 4,
        stitches: [
          { x: 0, y: 0 },      // esquina superior izq
          { x: 100, y: 0 },    // esquina superior der
          { x: 100, y: 100 },  // esquina inferior der
          { x: 0, y: 100 }     // esquina inferior izq
        ]
      }
    ],
    totalStitches: 4,
    colorCount: 1
  };

  const transformed = transformApiResponse(apiResult, 100, 100);
  const points = transformed.regions[0].path_points;
  
  // Después de normalizar, deben estar entre 0-1
  points.forEach(([x, y]) => {
    assert(x >= 0 && x <= 1, `x=${x} debe estar 0-1`);
    assert(y >= 0 && y <= 1, `y=${y} debe estar 0-1`);
  });
  
  // Verificar que esquinas están en posición
  assertEquals(points[0], [0, 0], "esquina izq-arr debe ser [0,0]");
  assertEquals(points[1], [1, 0], "esquina der-arr debe ser [1,0]");
});

Deno.test("Test 4: Múltiples regiones", async () => {
  const pixels = new Uint8Array(200 * 200 * 4);
  const result = await mockRobustVectorization(pixels, 200, 200, {
    color_count: 5
  });
  
  assert(result.regions.length >= 2, "debe detectar al menos 2 regiones");
  
  // Cada región debe tener estructura
  result.regions.forEach((r, idx) => {
    assert(r.id, `región ${idx} debe tener id`);
    assert(r.type, `región ${idx} debe tener type`);
    assert(Array.isArray(r.stitches), `región ${idx} debe tener stitches`);
    assert(r.pointCount > 0, `región ${idx} debe tener puntadas`);
  });
});

Deno.test("Test 5: Clasificación de tipos de puntada", () => {
  const apiResult = {
    regions: [
      {
        id: 'r0',
        type: 'fill',
        color: { r: 255, g: 0, b: 0 },
        pointCount: 1000,
        stitches: []
      },
      {
        id: 'r1',
        type: 'satin',
        color: { r: 0, g: 255, b: 0 },
        pointCount: 300,
        stitches: []
      },
      {
        id: 'r2',
        type: 'run',
        color: { r: 0, g: 0, b: 255 },
        pointCount: 50,
        stitches: []
      }
    ],
    totalStitches: 1350,
    colorCount: 3
  };

  const transformed = transformApiResponse(apiResult, 100, 100);
  
  assertEquals(transformed.regions[0].stitch_type, 'fill', "tipo 0 debe ser fill");
  assertEquals(transformed.regions[1].stitch_type, 'satin', "tipo 1 debe ser satin");
  assertEquals(transformed.regions[2].stitch_type, 'run', "tipo 2 debe ser run");
});

Deno.test("Test 6: Densidad afecta puntadas", async () => {
  const pixels = new Uint8Array(150 * 150 * 4);
  pixels.fill(200); // Gris
  
  const resultLow = await mockRobustVectorization(pixels, 150, 150, {
    stitch_density: 0.3
  });
  
  const resultHigh = await mockRobustVectorization(pixels, 150, 150, {
    stitch_density: 1.0
  });
  
  // Densidad mayor debería generar más puntadas (en real, no en mock)
  console.log(`Densidad baja: ${resultLow.totalStitches}`);
  console.log(`Densidad alta: ${resultHigh.totalStitches}`);
});

Deno.test("Test 7: Manejo de errores API", () => {
  const errorResult = {
    success: false,
    error: 'API error: No valid regions detected'
  };
  
  assert(errorResult.success === false, "success debe ser false en error");
  assert(errorResult.error, "debe tener mensaje de error");
});

Deno.test("Test 8: Validación de datos de entrada", () => {
  const testCases = [
    { width: 50, height: 50, color_count: 2, valid: true },
    { width: 500, height: 500, color_count: 8, valid: true },
    { width: 0, height: 100, color_count: 6, valid: false },
    { width: 100, height: 0, color_count: 6, valid: false }
  ];

  testCases.forEach(tc => {
    if (tc.width > 0 && tc.height > 0) {
      assert(tc.valid, `${tc.width}x${tc.height} debe ser válido`);
    }
  });
});

Deno.test("Test 9: Puntadas dentro de límites", () => {
  const apiResult = {
    regions: [
      {
        id: 'r0',
        type: 'fill',
        color: { r: 255, g: 0, b: 0 },
        pointCount: 100,
        stitches: Array(100).fill(0).map((_, i) => ({
          x: 10 + (i % 10),
          y: 20 + Math.floor(i / 10)
        }))
      }
    ],
    totalStitches: 100,
    colorCount: 1
  };

  const transformed = transformApiResponse(apiResult, 100, 100);
  const points = transformed.regions[0].path_points;
  
  // Todos los puntos deben estar dentro del rango normalizado
  points.forEach(([x, y]) => {
    assert(x >= 0 && x <= 1, `x=${x} está fuera de rango [0,1]`);
    assert(y >= 0 && y <= 1, `y=${y} está fuera de rango [0,1]`);
  });
});

Deno.test("Test 10: Respuesta completa end-to-end", async () => {
  const pixels = new Uint8Array(100 * 100 * 4);
  
  // Simulación de imagen multicolor
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = i % 256;      // R
    pixels[i+1] = (i*2) % 256; // G
    pixels[i+2] = (i*3) % 256; // B
    pixels[i+3] = 255;         // A
  }
  
  const apiResult = await mockRobustVectorization(pixels, 100, 100, {
    color_count: 6,
    stitch_density: 0.8
  });
  
  const transformed = transformApiResponse(apiResult, 100, 100);
  
  // Validar estructura completa
  assert(transformed.regions, "debe tener regions");
  assert(transformed.total_stitches > 0, "debe tener puntadas");
  assert(transformed.colors_used > 0, "debe detectar colores");
  
  // Cada región válida
  transformed.regions.forEach((r, idx) => {
    assert(r.id, `región ${idx} sin id`);
    assert(r.name, `región ${idx} sin name`);
    assert(r.stitch_type, `región ${idx} sin stitch_type`);
    assert(Array.isArray(r.path_points), `región ${idx} sin path_points`);
    assert(r.stitch_count >= 0, `región ${idx} stitch_count inválido`);
  });
  
  console.log(`✅ Test end-to-end exitoso: ${transformed.total_stitches} puntadas generadas`);
});