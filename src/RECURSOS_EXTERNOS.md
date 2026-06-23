# Recursos Externos - StitchFlow IA

Documentación de librerías y referencias externas integradas en el pipeline de vectorización y exportación.

---

## 1. **pyembroidery** 
**GitHub:** https://github.com/EmbroidePy/pyembroidery  
**Para qué sirve:** Leer/escribir archivos de bordado en múltiples formatos (DST, PES, JEF, EXP, VP3, etc.)

### Integración en StitchFlow:
- **Función backend:** `functions/pyembroideryExport`
- **Uso:** Exportación multi-formato desde `ExportModal`
- **Formatos soportados:** DST, PES, JEF, EXP, VP3, XXX
- **Configuración:** Requiere API endpoint REST en `PYEMBROIDERY_API_URL`

```javascript
// Ejemplo de uso en el código
const response = await base44.functions.invoke('pyembroideryExport', {
  regions,
  format: 'dst',
  width_mm: 100,
  height_mm: 100
});
```

---

## 2. **Ink/Stitch**
**Sitio:** https://inkstitch.org  
**Para qué sirve:** Referencia de algoritmos profesionales de generación de puntadas (Fill, Satin, Running Stitch)

### Integración en StitchFlow:
- **Módulo principal:** `lib/professionalStitchEngine.js`
- **Algoritmos implementados:**
  - `generateFill()` - Tatami fill con offsets de compensación
  - `generateSatin()` - Líneas paralelas para formas estrechas
  - `generateRunningStitch()` - Contorno simple
  - `generateUnderlay()` - Puntadas de base para estabilidad

- **Características:**
  - Pull compensation automática
  - Underlay foundation stitching
  - Scanline tatami con offset poligonal

```javascript
// Ejemplo: Generar relleno tipo Ink/Stitch
const stitches = generateFill(polygon, {
  density: 0.7,
  angle: 45,
  underlay: true,
  pullCompensation: 0.1
});
```

---

## 3. **PEmbroider**
**GitHub:** https://github.com/CreativeInquiry/PEmbroider  
**Para qué sirve:** Referencia Java de cómo generan fill/satin y manejo de clipping

### Integración en StitchFlow:
- **Módulo de clipping:** `lib/geometricPipeline.js`
- **Técnicas implementadas:**
  - Sutherland-Hodgman clipping para boundary enforcement
  - Polygon offsetting para safe insets
  - Miter corner handling para ángulos correctos
  - Point-in-polygon validation para verificación de bounds

```javascript
// Ejemplo: Pipeline geométrico (basado en PEmbroider)
const result = executeGeometricPipeline(regions, canvasWidth, canvasHeight, {
  safetyMargin: 0.5,
  pullCompensation: 0.1
});
```

---

## 4. **Potrace**
**Sitio:** http://potrace.sourceforge.net  
**Para qué sirve:** Conversión profesional de raster a vector (bitmap → outline)

### Integración en StitchFlow:
- **Función backend:** `functions/robustVectorization`
- **Procesos implementados:**
  - K-means cuantización para color reduction
  - Marching squares para contour detection
  - Ramer-Douglas-Peucker simplification (tolerancia 0.5mm)
  - Edge-based contour tracing

```javascript
// Pipeline completo (basado en Potrace + K-means):
1. extractImagePixels() → Pixels raw
2. kmeansQuantize() → Dominant colors
3. createBinaryMasks() → Separar por color
4. detectContours() → Marching squares
5. simplifyContour() → RDP simplification
```

---

## Integración por Componente

### Editor Pipeline
```
Editor → startProcessing()
  ↓
extractImagePixels() [HTML5 Canvas]
  ↓
robustVectorization() [Backend: Potrace + K-means]
  ↓
geometricPipeline() [PEmbroider: Clipping + Offset]
  ↓
generateFill/Satin/Run [Ink/Stitch: Puntadas profesionales]
  ↓
ExportModal → pyembroideryExport() [DST/PES/etc]
```

### Flujo Completo
1. **Usuario carga imagen** → Editor.jsx
2. **Extrae píxeles** → lib/imagePixelExtractor.js
3. **Vectoriza con Potrace+K-means** → functions/robustVectorization
4. **Aplica geometric pipeline (PEmbroider)** → lib/geometricPipeline.js
5. **Genera puntadas (Ink/Stitch)** → lib/professionalStitchEngine.js
6. **Exporta a máquina (pyembroidery)** → functions/pyembroideryExport

---

## Validación y Testing

### Validador de Bordado
```javascript
// lib/embroideryValidator.js
validateEmbroideryFile(stitches)
  → Verifica rango, saltos, recuento, colores
  
estimateEmbroideryTime(stitches, speedSpm)
  → Estima tiempo de ejecución
```

---

## Configuración Requerida

### Variables de Entorno (Backend)
```
PYEMBROIDERY_API_URL=http://localhost:5000
  (Servidor REST que ejecuta pyembroidery)
```

### Parámetros Principales
```javascript
{
  colorCount: 6,           // Del CSV: color_count
  widthMM: 100,            // Dimensión en mm
  heightMM: 100,
  stitchDensity: 0.7,      // 0.4=sparse, 1.0=dense
  pullCompensation: 0.1,   // Tensión (PEmbroider)
  angle: 45,               // Ángulo tatami (Ink/Stitch)
  safetyMargin: 0.5        // Clipping (Potrace)
}
```

---

## Notas de Implementación

### Potrace vs K-means
- **Potrace puro:** Excelente para binary images
- **K-means previo:** Necesario para imágenes color multi-región
- **Implementación:** K-means → máscaras binarias → Potrace por máscara

### Ink/Stitch vs PEmbroider
- **Ink/Stitch:** Algoritmos de puntadas (fill tatami, satin)
- **PEmbroider:** Geometric clipping y offsetting
- **Combinación:** Ambos necesarios para bordados de calidad

### Validación (pyembroidery)
- Máximo 500,000 puntadas
- Máximo 99 colores
- Rango típico: ±500mm en hoop
- Speed típica: 800 spm (stitches per minute)

---

## Testing Manual

```bash
# Verificar cada módulo:
1. test_backend_function('robustVectorization', {
     pixels: [...],
     width: 100,
     height: 100,
     color_count: 6
   })

2. test_backend_function('pyembroideryExport', {
     regions: [...],
     format: 'dst'
   })
```

---

## Referencias Completas

| Recurso | Enlace | Módulo |
|---------|--------|--------|
| pyembroidery | https://github.com/EmbroidePy/pyembroidery | `functions/pyembroideryExport` |
| Ink/Stitch | https://inkstitch.org | `lib/professionalStitchEngine.js` |
| PEmbroider | https://github.com/CreativeInquiry/PEmbroider | `lib/geometricPipeline.js` |
| Potrace | http://potrace.sourceforge.net | `functions/robustVectorization` |