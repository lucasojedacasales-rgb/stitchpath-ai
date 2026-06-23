#!/usr/bin/env python3
"""
Test Suite para API Python de Vectorización
Verifica que el motor OpenCV funciona correctamente antes de conectar a Base44

Instalación:
    pip install requests pillow opencv-python numpy pytest

Uso:
    # Tests locales (API corriendo en http://localhost:5000)
    pytest test_api.py -v

    # Test específico
    pytest test_api.py::test_simple_image -v

    # Con salida detallada
    pytest test_api.py -v -s
"""

import requests
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np
import time

# ============================================================
# CONFIGURACIÓN
# ============================================================

API_URL = 'http://localhost:5000'
VECTORIZE_ENDPOINT = f'{API_URL}/vectorize'

# Crear directorio de test si no existe
TEST_DIR = Path('test_images')
TEST_DIR.mkdir(exist_ok=True)

# ============================================================
# GENERADORES DE IMÁGENES DE PRUEBA
# ============================================================

def create_solid_color_image(color, width=100, height=100):
    """Crear imagen de un solo color sólido"""
    img = Image.new('RGB', (width, height), color)
    return img

def create_gradient_image(width=100, height=100):
    """Crear imagen con gradiente de colores"""
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    for y in range(height):
        for x in range(width):
            r = int(255 * x / width)
            g = int(255 * y / height)
            b = 128
            pixels[x, y] = (r, g, b)
    return img

def create_shapes_image(width=100, height=100):
    """Crear imagen con formas geométricas (rojo, verde, azul)"""
    img = Image.new('RGB', (width, height), 'white')
    pixels = img.load()
    
    # Rectángulo rojo
    for x in range(10, 40):
        for y in range(10, 40):
            pixels[x, y] = (255, 0, 0)
    
    # Círculo verde (aproximado)
    for x in range(50, 80):
        for y in range(10, 40):
            if (x-65)**2 + (y-25)**2 <= 100:
                pixels[x, y] = (0, 255, 0)
    
    # Triángulo azul
    for x in range(10, 40):
        for y in range(60, 90):
            if x - 10 + y - 60 <= 30:
                pixels[x, y] = (0, 0, 255)
    
    return img

def create_multicolor_image(width=100, height=100):
    """Crear imagen con múltiples colores y patrones"""
    img = Image.new('RGB', (width, height), 'white')
    pixels = img.load()
    
    colors = [
        (255, 0, 0),     # Rojo
        (0, 255, 0),     # Verde
        (0, 0, 255),     # Azul
        (255, 255, 0),   # Amarillo
        (255, 0, 255),   # Magenta
    ]
    
    quad_w = width // 2
    quad_h = height // 2
    
    # Llenar cuadrantes
    for x in range(width):
        for y in range(height):
            if x < quad_w and y < quad_h:
                pixels[x, y] = colors[0]
            elif x >= quad_w and y < quad_h:
                pixels[x, y] = colors[1]
            elif x < quad_w and y >= quad_h:
                pixels[x, y] = colors[2]
            else:
                pixels[x, y] = colors[3]
    
    return img

def create_simple_embroidery_image(width=100, height=100):
    """Crear imagen simple como si fuera un logo pequeño"""
    img = Image.new('RGB', (width, height), 'white')
    pixels = img.load()
    
    # Crear una "S" en negro (como initial)
    for x in range(20, 80):
        for y in range(20, 80):
            # Fórmula simple para "S"
            if (y - 50)**2 / 25 + (x - 50)**2 / 900 < 1:
                pixels[x, y] = (0, 0, 0)
    
    return img

# ============================================================
# TEST CASES
# ============================================================

def test_api_health():
    """Test 1: Verificar que la API está activa"""
    print("\n" + "="*60)
    print("✅ TEST 1: Health Check")
    print("="*60)
    
    try:
        response = requests.get(f'{API_URL}/health', timeout=5)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get('status') == 'ok', "Health check failed"
        print("✅ API está activa y respondiendo")
        return True
    except Exception as e:
        print(f"❌ ERROR: API no responde. ¿Está corriendo en {API_URL}?")
        print(f"   Detalle: {e}")
        return False

def test_simple_image():
    """Test 2: Imagen de un solo color"""
    print("\n" + "="*60)
    print("✅ TEST 2: Imagen Sólida (Rojo)")
    print("="*60)
    
    # Crear imagen
    img = create_solid_color_image((255, 0, 0), 200, 200)
    img_path = TEST_DIR / 'test_solid_red.png'
    img.save(img_path)
    
    # Enviar a API
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '2',
            'width_mm': '100',
            'height_mm': '100',
            'stitch_density': '0.7'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    # Validar respuesta
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    result = response.json()
    
    assert result.get('success') == True, "Response success=false"
    assert 'regions' in result, "No regions in response"
    assert len(result['regions']) > 0, "No regions detected"
    assert result.get('totalStitches', 0) > 0, "No stitches generated"
    
    print(f"✅ Regiones: {len(result['regions'])}")
    print(f"✅ Puntadas: {result['totalStitches']:,}")
    for i, r in enumerate(result['regions']):
        print(f"   Region {i}: {r.get('type')} - {r.get('pointCount')} pts")
    
    return True

def test_gradient_image():
    """Test 3: Imagen con gradiente"""
    print("\n" + "="*60)
    print("✅ TEST 3: Imagen con Gradiente (RGB)")
    print("="*60)
    
    img = create_gradient_image(200, 200)
    img_path = TEST_DIR / 'test_gradient.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '5',
            'width_mm': '100',
            'height_mm': '100',
            'stitch_density': '0.7'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    assert response.status_code == 200
    result = response.json()
    assert result.get('success') == True
    
    print(f"✅ Colores detectados: {len(result['regions'])}")
    print(f"✅ Puntadas totales: {result['totalStitches']:,}")
    
    return True

def test_shapes_image():
    """Test 4: Imagen con formas (3 colores primarios)"""
    print("\n" + "="*60)
    print("✅ TEST 4: Imagen con Formas (RGB)")
    print("="*60)
    
    img = create_shapes_image(200, 200)
    img_path = TEST_DIR / 'test_shapes.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '4',
            'width_mm': '150',
            'height_mm': '150',
            'stitch_density': '0.8'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    assert response.status_code == 200
    result = response.json()
    assert result.get('success') == True
    
    print(f"✅ Formas detectadas: {len(result['regions'])} regiones")
    print(f"✅ Puntadas generadas: {result['totalStitches']:,}")
    
    # Mostrar detalle
    for i, r in enumerate(result['regions']):
        print(f"   {i+1}. {r.get('type')}: {r.get('pointCount')} ptos, color={r.get('color')}")
    
    return True

def test_multicolor_image():
    """Test 5: Imagen multicolor"""
    print("\n" + "="*60)
    print("✅ TEST 5: Imagen Multicolor (5 colores)")
    print("="*60)
    
    img = create_multicolor_image(200, 200)
    img_path = TEST_DIR / 'test_multicolor.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '6',
            'width_mm': '100',
            'height_mm': '100',
            'stitch_density': '0.6'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    assert response.status_code == 200
    result = response.json()
    assert result.get('success') == True
    
    print(f"✅ Colores detectados: {result['colorCount']}")
    print(f"✅ Regiones: {len(result['regions'])}")
    print(f"✅ Puntadas: {result['totalStitches']:,}")
    
    return True

def test_density_variation():
    """Test 6: Variar densidad de puntadas"""
    print("\n" + "="*60)
    print("✅ TEST 6: Variación de Densidad")
    print("="*60)
    
    img = create_shapes_image(200, 200)
    img_path = TEST_DIR / 'test_density.png'
    img.save(img_path)
    
    densities = [0.3, 0.5, 0.7, 1.0]
    results = []
    
    for density in densities:
        with open(img_path, 'rb') as f:
            files = {'image': ('test.png', f)}
            data = {
                'color_count': '4',
                'width_mm': '100',
                'height_mm': '100',
                'stitch_density': str(density)
            }
            response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
        
        result = response.json()
        stitches = result.get('totalStitches', 0)
        results.append((density, stitches))
        print(f"  Densidad {density}: {stitches:,} puntadas")
    
    # Verificar que más densidad = más puntadas
    assert results[0][1] < results[-1][1], "Densidad no afecta cantidad de puntadas"
    print("✅ Densidad afecta correctamente la cantidad de puntadas")
    
    return True

def test_response_format():
    """Test 7: Validar formato de respuesta"""
    print("\n" + "="*60)
    print("✅ TEST 7: Validar Formato de Respuesta")
    print("="*60)
    
    img = create_solid_color_image((0, 0, 255), 100, 100)
    img_path = TEST_DIR / 'test_format.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '2',
            'width_mm': '100',
            'height_mm': '100',
            'stitch_density': '0.7'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    result = response.json()
    
    # Validar estructura principal
    assert 'success' in result, "Falta 'success'"
    assert 'regions' in result, "Falta 'regions'"
    assert 'totalStitches' in result, "Falta 'totalStitches'"
    assert 'colorCount' in result, "Falta 'colorCount'"
    
    # Validar estructura de región
    if result['regions']:
        r = result['regions'][0]
        assert 'id' in r, "Región sin 'id'"
        assert 'color' in r, "Región sin 'color'"
        assert 'type' in r, "Región sin 'type'"
        assert 'stitches' in r, "Región sin 'stitches'"
        assert 'pointCount' in r, "Región sin 'pointCount'"
        
        # Validar estructura de stitch
        if r['stitches']:
            s = r['stitches'][0]
            assert 'x' in s, "Stitch sin 'x'"
            assert 'y' in s, "Stitch sin 'y'"
    
    print("✅ Formato de respuesta correcto")
    print(f"   Campos principales: {list(result.keys())}")
    
    return True

def test_edge_cases():
    """Test 8: Casos límite"""
    print("\n" + "="*60)
    print("✅ TEST 8: Casos Límite")
    print("="*60)
    
    # Imagen muy pequeña
    img = create_solid_color_image((255, 0, 0), 50, 50)
    img_path = TEST_DIR / 'test_small.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '2',
            'width_mm': '50',
            'height_mm': '50',
            'stitch_density': '0.5'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=30)
    
    assert response.status_code == 200, "Imagen pequeña falló"
    print("✅ Imagen pequeña (50x50) procesada")
    
    # Imagen grande
    img = create_shapes_image(400, 400)
    img_path = TEST_DIR / 'test_large.png'
    img.save(img_path)
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '4',
            'width_mm': '200',
            'height_mm': '200',
            'stitch_density': '0.8'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=60)
    
    assert response.status_code == 200, "Imagen grande falló"
    print("✅ Imagen grande (400x400) procesada")
    
    return True

def test_performance():
    """Test 9: Rendimiento"""
    print("\n" + "="*60)
    print("✅ TEST 9: Rendimiento")
    print("="*60)
    
    img = create_shapes_image(300, 300)
    img_path = TEST_DIR / 'test_perf.png'
    img.save(img_path)
    
    start = time.time()
    
    with open(img_path, 'rb') as f:
        files = {'image': ('test.png', f)}
        data = {
            'color_count': '5',
            'width_mm': '150',
            'height_mm': '150',
            'stitch_density': '0.7'
        }
        response = requests.post(VECTORIZE_ENDPOINT, files=files, data=data, timeout=60)
    
    elapsed = time.time() - start
    
    assert elapsed < 30, f"API tardó demasiado: {elapsed:.1f}s"
    print(f"✅ Tiempo de procesamiento: {elapsed:.2f}s (límite: 30s)")
    
    result = response.json()
    stitches = result.get('totalStitches', 0)
    print(f"✅ Velocidad: {stitches / elapsed:.0f} puntadas/segundo")
    
    return True

# ============================================================
# MAIN
# ============================================================

def run_all_tests():
    """Ejecutar todos los tests"""
    print("\n" + "="*60)
    print("🧪 SUITE DE TESTS: API Python de Vectorización")
    print("="*60)
    
    tests = [
        ("Health Check", test_api_health),
        ("Imagen Sólida", test_simple_image),
        ("Gradiente", test_gradient_image),
        ("Formas", test_shapes_image),
        ("Multicolor", test_multicolor_image),
        ("Densidad", test_density_variation),
        ("Formato", test_response_format),
        ("Casos Límite", test_edge_cases),
        ("Rendimiento", test_performance),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
                print(f"❌ {name} falló")
        except AssertionError as e:
            failed += 1
            print(f"❌ {name}: {e}")
        except Exception as e:
            failed += 1
            print(f"❌ {name}: ERROR - {e}")
    
    # Resumen
    print("\n" + "="*60)
    print(f"📊 RESULTADOS: {passed} ✅ | {failed} ❌")
    print("="*60)
    
    if failed == 0:
        print("🎉 ¡TODOS LOS TESTS PASARON! La API está lista para Base44")
    else:
        print(f"⚠️  {failed} test(s) fallaron. Revisa los errores arriba.")
    
    return failed == 0

if __name__ == '__main__':
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)