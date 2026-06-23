# Guía Completa: Conectar API Python de Vectorización a Base44

## 📋 Resumen

StitchFlow usa una **API externa Python (OpenCV + K-means)** para vectorizar imágenes. Esta guía te ayuda a:
1. Desplegar la API en Railway/Render (gratis)
2. Conectarla a Base44 (ya hay un conector listo)
3. Testear el flujo end-to-end

---

## 🚀 PASO 1: Desplegar API Python

### Opción A: Railway (Recomendado)

1. **Crea repo en GitHub** con estos archivos:

**`stitchpath_api.py`** - Motor OpenCV
```python
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from PIL import Image

app = Flask(__name__)
CORS(app)

@app.route('/vectorize', methods=['POST'])
def vectorize():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    color_count = int(request.form.get('color_count', 6))
    width_mm = float(request.form.get('width_mm', 100))
    height_mm = float(request.form.get('height_mm', 100))
    stitch_density = float(request.form.get('stitch_density', 0.7))
    
    # Cargar imagen
    nparr = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    
    # K-means cuantización
    Z = img.reshape((-1, 3))
    Z = np.float32(Z)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(Z, color_count, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
    
    # Procesamiento básico de regiones
    regions = []
    quantized = labels.reshape(h, w)
    
    for color_idx in range(color_count):
        mask = np.uint8(quantized == color_idx) * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 50:
                continue
            
            # Simplificar contorno
            epsilon = 0.5 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            if len(approx) < 3:
                continue
            
            # Clasificar tipo
            if area < 500:
                stitch_type = 'satin'
            else:
                stitch_type = 'fill'
            
            # Crear puntadas (simplificado)
            stitches = []
            pts = approx.reshape(-1, 2)
            for pt in pts:
                stitches.append({
                    'x': float(pt[0] * width_mm / w),
                    'y': float(pt[1] * height_mm / h)
                })
            
            if len(stitches) > 2:
                color = centers[color_idx]
                regions.append({
                    'id': f'r{len(regions)}',
                    'color': {'r': int(color[0]), 'g': int(color[1]), 'b': int(color[2])},
                    'type': stitch_type,
                    'pointCount': len(stitches),
                    'stitches': stitches,
                    'angle': 45
                })
    
    return jsonify({
        'success': True,
        'regions': regions,
        'totalStitches': sum(r['pointCount'] for r in regions),
        'colorCount': len(centers),
        'width': width_mm,
        'height': height_mm
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

**`requirements.txt`**
```
flask==2.3.3
flask-cors==4.0.0
opencv-python==4.8.1.78
numpy==1.24.3
Pillow==10.0.0
```

**`Procfile`**
```
web: python stitchpath_api.py
```

2. **Sube a GitHub**
3. **Ve a https://railway.app** → New Project → Deploy from GitHub repo
4. Selecciona el repo, Railway detecta el `Procfile` automáticamente
5. Espera a que despliegue (3-5 minutos)
6. Copia la URL generada: `https://your-app.up.railway.app`

### Opción B: Render.com

Mismo proceso pero en https://render.com → New Web Service

---

## 🔗 PASO 2: Conectar a Base44

La función `stitchGeneratorAPI` ya creada conecta con la API. Solo configura la URL:

En `functions/stitchGeneratorAPI.js`, línea 1:

```javascript
const API_URL = 'https://your-api.up.railway.app/vectorize';
```

---

## ✅ PASO 3: Testear

### Test con curl (desde terminal):

```bash
# Asume que tienes una imagen test.png
curl -X POST https://your-api.up.railway.app/vectorize \
  -F "image=@test.png" \
  -F "color_count=6" \
  -F "width_mm=100" \
  -F "height_mm=100" \
  -F "stitch_density=0.7"
```

### Test desde Base44:

1. Abre el Editor
2. Sube una imagen
3. Haz clic en "Procesar"
4. Verifica que los logs muestren respuesta de la API

---

## 📊 Flujo de Datos

```
Base44 Frontend
    ↓ (imagen + params)
stitchGeneratorAPI (Deno backend)
    ↓ (POST FormData)
API Python en Railway
    ↓ (OpenCV process)
K-means + Contours + Stitches
    ↓ (JSON)
Base44 Backend
    ↓
Base44 Frontend (renderiza)
```

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| Error 404 en API | Verifica que la URL sea correcta y Railway esté activo |
| CORS error | La API ya tiene `CORS(app)`, debe funcionar |
| Image decode error | Asegúrate de enviar PNG/JPG válido |
| Timeout | La imagen es muy grande, redimensiona |
| No regions generated | Imagen muy simple, intenta con foto/degradado |

---

## 📝 Variables de Entorno (opcional)

Si Base44 soporta secrets, agrega:

```
VECTORIZER_API_URL=https://your-api.up.railway.app/vectorize
```

Luego en `stitchGeneratorAPI.js`:

```javascript
const API_URL = Deno.env.get('VECTORIZER_API_URL');
```

---

## 🎯 Alternativa: API Local (desarrollo)

Para testear sin desplegar:

```bash
cd /path/to/api
python stitchpath_api.py
# Ahora corre en http://localhost:5000/vectorize
```

En `stitchGeneratorAPI.js`:

```javascript
const API_URL = 'http://localhost:5000/vectorize';
```

(Solo funciona si Base44 y la API están en la misma máquina)

---

## 📚 Referencias

- **Flask**: https://flask.palletsprojects.com/
- **OpenCV**: https://opencv.org/
- **Railway**: https://railway.app/docs
- **CORS**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

---

**Status**: ✅ API Deno lista (`stitchGeneratorAPI`) | ⏳ API Python → necesita despliegue