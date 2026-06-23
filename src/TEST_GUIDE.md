# 🧪 Guía Completa de Testing

Testing en 3 niveles: API local → API desplegada → Base44 integrado

---

## NIVEL 1️⃣: Testear API Python Localmente

### Requisitos
```bash
pip install flask flask-cors opencv-python numpy Pillow requests pytest
```

### Paso 1: Iniciar API
```bash
# Terminal 1
python stitchpath_api.py
# Debería mostrar: Running on http://127.0.0.1:5000
```

### Paso 2: Ejecutar Tests
```bash
# Terminal 2
python test_api.py

# O con pytest:
pytest test_api.py -v -s
```

### Resultados Esperados

```
============================================================
🧪 SUITE DE TESTS: API Python de Vectorización
============================================================

✅ TEST 1: Health Check
✅ API está activa y respondiendo

✅ TEST 2: Imagen Sólida (Rojo)
✅ Regiones: 1
✅ Puntadas: 150

✅ TEST 3: Imagen con Gradiente (RGB)
✅ Colores detectados: 5
✅ Puntadas totales: 5,432

...

📊 RESULTADOS: 9 ✅ | 0 ❌
============================================================
🎉 ¡TODOS LOS TESTS PASARON! La API está lista para Base44
```

### Qué prueba cada test

| Test | Propósito |
|------|-----------|
| Health Check | ¿API responde? |
| Imagen Sólida | ¿Detecta 1 color? |
| Gradiente | ¿Maneja transiciones suaves? |
| Formas | ¿Diferencia múltiples regiones? |
| Multicolor | ¿Detecta 5+ colores? |
| Densidad | ¿Afecta la densidad al resultado? |
| Formato | ¿Estructura JSON correcta? |
| Casos Límite | ¿Maneja imágenes pequeñas/grandes? |
| Rendimiento | ¿< 30 segundos? |

---

## NIVEL 2️⃣: Testear API Desplegada (Railway/Render)

### Después de desplegar en Railway:

```bash
# Test con curl
curl -X POST https://tu-api.up.railway.app/vectorize \
  -F "image=@test_images/test_shapes.png" \
  -F "color_count=4" \
  -F "width_mm=100" \
  -F "height_mm=100" \
  -F "stitch_density=0.7"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "regions": [
    {
      "id": "r0",
      "color": {"r": 255, "g": 0, "b": 0},
      "type": "fill",
      "pointCount": 234,
      "stitches": [
        {"x": 10.5, "y": 20.3},
        {"x": 11.2, "y": 20.8},
        ...
      ],
      "angle": 45
    }
  ],
  "totalStitches": 1234,
  "colorCount": 4,
  "width": 100,
  "height": 100
}
```

### Test con Python Client
```python
from client_externo import Base44StitchClient

client = Base44StitchClient('https://tu-api.up.railway.app')

result = client.vectorize(
    image_path='test_images/test_shapes.png',
    color_count=4,
    width_mm=100,
    height_mm=100
)

print(f"✅ {result['total_stitches']:,} puntadas generadas")
```

---

## NIVEL 3️⃣: Testear Conector Base44

### Paso 1: Configurar URL API en Base44

En `functions/robustVectorization`, edita la línea:

```javascript
const API_URL = 'https://tu-api.up.railway.app/vectorize';
```

### Paso 2: Testear desde Editor

1. Abre Base44 → Editor
2. Sube una imagen de prueba (usa `test_images/`)
3. Haz clic en "Procesar"
4. Verifica que se generen puntadas

### Paso 3: Validar Resultado

Debería ver:
- ✅ Regiones detectadas
- ✅ Puntadas renderizadas en canvas
- ✅ Números en la barra superior actualizarse

### Paso 4: Revisar Logs

Abre la consola del navegador (F12):

**Esperado:**
```javascript
[CONNECTOR] Enviando imagen a https://tu-api.up.railway.app/vectorize...
[CONNECTOR] Dims: 800x600px → 100x100mm, colors=6
[CONNECTOR] API response: {success: true, regions: [...]}
[CONNECTOR] SUCCESS: 3 regions, 1234 stitches
```

**No esperado (errores):**
```javascript
[CONNECTOR] Fetch error: Cannot reach API
[CONNECTOR] API error 503: Service Unavailable
```

---

## 📋 Casos de Test Recomendados

### Test A: Simple
```
Archivo: test_images/test_solid_red.png
Config:
  - Colores: 2
  - Tamaño: 100x100mm
  - Densidad: 0.7
Esperado: 1 región roja, 100-500 puntadas
```

### Test B: Normal
```
Archivo: test_images/test_shapes.png
Config:
  - Colores: 4
  - Tamaño: 150x150mm
  - Densidad: 0.8
Esperado: 3 regiones (rojo, verde, azul), 1000-5000 puntadas
```

### Test C: Complejo
```
Archivo: test_images/test_multicolor.png
Config:
  - Colores: 6
  - Tamaño: 100x100mm
  - Densidad: 0.8
Esperado: 4-5 regiones, 5000+ puntadas
```

### Test D: Gran formato
```
Archivo: test_images/test_large.png
Config:
  - Colores: 6
  - Tamaño: 200x200mm
  - Densidad: 0.9
Esperado: procesamiento < 30s, 10000+ puntadas
```

---

## 🔍 Debugging

### Si API no responde localmente:

```bash
# Verifica puerto 5000
lsof -i :5000

# Mata proceso si ocupa puerto
kill -9 <PID>

# Intenta puerto diferente
python stitchpath_api.py --port 5001
```

### Si Railway da 502 Bad Gateway:

```bash
# Revisa logs en Railway dashboard:
# Railway > Project > Deployments > [latest] > Logs

# Redeploy manualmente:
git push  # Si conectaste GitHub
# O re-deploy desde dashboard
```

### Si Base44 da 503:

```bash
# Verifica que API está activa:
curl https://tu-api.up.railway.app/health

# Si da error, revisa:
# 1. URL correcta en robustVectorization
# 2. API desplegada en Railway
# 3. CORS habilitado en API
```

### Si genera pocas puntadas:

```bash
# Intenta aumentar densidad:
stitch_density: 0.9  # en lugar de 0.7

# O aumentar colores detectados:
color_count: 8  # en lugar de 6
```

---

## ✅ Checklist Final

- [ ] API Python ejecutándose localmente
- [ ] `python test_api.py` pasa 9/9 tests
- [ ] API desplegada en Railway/Render
- [ ] `curl` a API remota funciona
- [ ] `client_externo.py` conecta a API
- [ ] URL API configurada en `robustVectorization`
- [ ] Conector HTTP de Base44 recibe respuesta
- [ ] Editor de Base44 renderiza puntadas
- [ ] Todos los botones funcionan (zoom, download, etc.)
- [ ] Puntadas se exportan a formato embroidery

---

## 📈 Indicadores de Éxito

### API Python
- [x] Health check responde en < 100ms
- [x] Imagen simple (100x100) procesa en < 5s
- [x] Imagen grande (400x400) procesa en < 20s
- [x] Detecta 2-6 colores correctamente
- [x] Genera 100+ puntadas por región

### Base44
- [x] Canvas renderiza sin flicker
- [x] Zoom funciona suavemente
- [x] Download PNG genera imagen válida
- [x] Exportar a DST/PES funciona
- [x] Historial de versiones se guarda

---

## 🚀 Próximos Pasos

1. ✅ Testear localmente (NIVEL 1)
2. ✅ Desplegar API (NIVEL 2)
3. ✅ Testear remota con client_externo.py
4. ✅ Conectar a Base44 (NIVEL 3)
5. ✅ Testear en Editor
6. → Agregar más test cases si es necesario
7. → Optimizar velocidad si es > 30s
8. → Pasar a producción