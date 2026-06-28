# Sistema de Aprendizaje de Bordado — Arquitectura

## 1. Visión General

Sistema que aprende de las modificaciones manuales del usuario para mejorar futuras recomendaciones automáticas. Diseñado para escalar a miles de diseños.

```
┌─────────────────┐
│   Usuario edita  │  (densidad, ángulo, tipo, underlay, recorrido)
│   una región    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  RegionEditModal captura cambios        │
│  (original recommendation vs user change)│
└────────┬────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  UserFeedback entity registra todo   │  (región, geom, recom original, cambio usuario)
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  learningEngine.js                   │  (análisis, patrones, mejora recomendaciones)
├──────────────────────────────────────┤
│ - extractPattern(feedback)           │
│ - computeGeometricSimilarity()       │
│ - analyzePatterns(patterns)          │
│ - improveRecommendation()            │
│ - serializeForTraining()             │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  trainLearningModel (backend fn)    │  (exporta CSV/JSONL para ML externo)
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  ML Externo (TensorFlow, sklearn)   │  (entrenar nuevos modelos)
└──────────────────────────────────────┘
```

## 2. Componentes Clave

### 2.1 Entity: `UserFeedback`

**Propósito**: Registro inmutable de qué cambió el usuario vs recomendación.

```json
{
  "project_id": "abc123",
  "region_id": "r42",
  "region_properties": {
    "area_mm2": 150.5,
    "avg_width_mm": 5.2,
    "convexity": 0.65,
    "curvature": 0.25,
    "complexity_score": 0.45,
    "inertia_ratio": 2.1,
    "color": "#ff5500"
  },
  "recommendation": {
    "stitch_type": "satin",
    "density": 0.5,
    "angle": 45,
    "pull_compensation": 0.12,
    "underlay": true,
    "confidence": 0.78
  },
  "user_change": {
    "stitch_type": "fill",      // Usuario cambió de satin a fill
    "density": 0.7               // Usuario aumentó densidad
  },
  "changed_fields": ["stitch_type", "density"],
  "fabric_type": "Algodón",
  "image_type": "photo",
  "is_positive_feedback": null,  // Se infiere después
  "processed_for_training": false
}
```

### 2.2 Module: `learningEngine.js`

**Propósito**: Análisis de patrones y mejora de recomendaciones.

#### Funciones clave:

```javascript
// Calcular similitud entre dos regiones
computeGeometricSimilarity(props1, props2) → 0-1

// Extraer patrón: "cuando area=X y convexity=Y, usuario cambió a Z"
extractPattern(feedback) → {input, output, deltas}

// Encontrar patrones similares en historial
improveRecommendationFromHistory(region, currentRec, patterns) 
  → {stitch_type, density, angle, ..., learning_confidence}

// Serializar para ML externo
serializeForTraining(feedbackList) → [{area_mm2, ..., stitch_type, ...}]
generateTrainingCSV(feedbackList) → CSV string
generateTrainingJSONL(feedbackList) → JSONL string (1 línea = 1 registro)
```

### 2.3 Hook: `useLearningFeedback.js`

**Propósito**: Interfaz limpia en React para registrar cambios.

```javascript
const { recordFeedback } = useLearningFeedback(projectId);

await recordFeedback({
  regionId: 'r42',
  regionProperties: { area_mm2: 150, ... },
  originalRecommendation: { stitch_type: 'satin', ... },
  userChange: { stitch_type: 'fill', ... },
  fabricType: 'Algodón',
  imageType: 'photo',
  reason: 'Fill covers better' // opcional
});
```

### 2.4 Backend Function: `trainLearningModel`

**Propósito**: Exponer feedback para herramientas externas.

**Acciones**:
- `export` → JSON con registros de entrenamiento
- `export_csv` → Descargable en Excel
- `export_jsonl` → Streaming para big data tools
- `analyze` → Detectar patrones automáticamente

```javascript
const result = await base44.functions.invoke('trainLearningModel', {
  action: 'export_csv',
  project_id: 'abc123',
  limit: 5000
});
// → descarga CSV para usar en sklearn, TensorFlow, etc.
```

### 2.5 Component: `LearningPanel.jsx`

**Propósito**: UI para ver feedback y exportar.

- Muestra count de feedback registrado
- Detecta patrones automáticamente
- Botones para exportar CSV/JSONL
- Indicador de confianza del aprendizaje

## 3. Flujo de Captura

### En `RegionEditModal`:

```javascript
// 1. Usuario abre editor y cambia región
setR({ ...region, stitch_type: 'fill', density: 0.7 })

// 2. Hace click en "Guardar"
async handleSave() {
  // 3. Detecta cambios vs región original
  const userChange = { stitch_type: 'fill', density: 0.7 }
  
  // 4. Registra feedback
  await recordFeedback({
    regionId: region.id,
    regionProperties: {...},
    originalRecommendation: {...},
    userChange,
    fabricType: 'Algodón'
  })
  
  // 5. Guarda región normalemente
  onSave(r)
}
```

**Clave**: Se registra feedback **siempre que el usuario edita**, sin interrumpir el flujo normal.

## 4. Flujo de Aprendizaje

### A. Análisis Local (en el navegador)

```javascript
import { 
  extractPattern, 
  analyzePatterns, 
  improveRecommendationFromHistory 
} from '@/lib/learningEngine.js'

// Cargar feedback histórico
const history = await base44.entities.UserFeedback.filter(
  { project_id: projectId }
)

// Extraer patrones
const patterns = history.map(f => extractPattern(f))

// Mejorar recomendación actual
const improved = improveRecommendationFromHistory(
  region,           // región nueva
  currentRec,       // recomendación del sistema
  patterns,         // patrones históricos
  { fabric_type, image_type }
)
// improved.stitch_type = "fill" (basado en aprendizaje)
// improved.learning_confidence = 0.82
```

### B. Exportación para ML Externo

```python
# Python + pandas + scikit-learn
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# 1. Descargar CSV desde LearningPanel
df = pd.read_csv('training_data_abc123.csv')

# 2. Preparar features
X = df[['area_mm2', 'avg_width_mm', 'convexity', 'curvature', 'complexity_score', 'inertia_ratio']]
y = df['stitch_type']

# 3. Entrenar modelo
model = RandomForestClassifier(n_estimators=100)
model.fit(X, y)

# 4. Exportar modelo
import joblib
joblib.dump(model, 'stitch_type_model.pkl')

# 5. Servir con FastAPI/Flask
# POST /predict → { area_mm2: 150, ... } → { stitch_type: 'fill', confidence: 0.92 }
```

## 5. Escalabilidad a Miles de Diseños

### 5.1 Almacenamiento

- **Entity UserFeedback**: Sin límites (Base44 puede crecer)
- **Índices recomendados**: `project_id`, `created_date`, `processed_for_training`
- **Particionamiento**: Por `project_id` si necesita separar múltiples usuarios

### 5.2 Exportación para BigData

```javascript
// Exportar JSONL en chunks para herramientas que requieren streaming
const chunks = []
let skip = 0
while (true) {
  const batch = await trainLearningModel({ 
    action: 'export', 
    project_id, 
    limit: 1000, 
    skip 
  })
  if (batch.records.length === 0) break
  chunks.push(batch.records)
  skip += 1000
}
```

### 5.3 Integración con Plataformas ML

#### TensorFlow.js (en navegador)
```javascript
import * as tf from '@tensorflow/tfjs';

const model = await tf.loadLayersModel('file://stitch_model/model.json');
const pred = model.predict(tf.tensor2d([[area, width, convexity, ...]]))
```

#### Vertex AI (Google Cloud)
```python
from google.cloud import aiplatform

endpoint = aiplatform.Endpoint('projects/.../endpoints/...')
prediction = endpoint.predict(instances=[{
  'area_mm2': 150,
  'avg_width_mm': 5.2,
  ...
}])
```

#### HuggingFace (LLMs fine-tuning)
```python
from transformers import AutoModelForSequenceClassification, Trainer

# Fine-tune BERT-like model en clasificación de stitch_type
model = AutoModelForSequenceClassification.from_pretrained('bert-base-uncased', num_labels=3)
trainer = Trainer(model=model, args=training_args, train_dataset=dataset)
trainer.train()
```

## 6. Métricas de Confianza

### Learning Confidence (0-1)

```javascript
// En improveRecommendationFromHistory:
const avgSimilarity = 0.82  // promedio de patrones similares
const learningConfidence = avgSimilarity * 0.9  // factor de seguridad
// = 0.74
```

**Interpretación**:
- `0.9+`: Uso directo (casi certeza)
- `0.7-0.9`: Mezclar 70% IA + 30% recomendación original
- `0.5-0.7`: Mostrar como "sugerencia alternativa"
- `<0.5`: Mostrar en panel informativo, no aplicar

## 7. Datos Ejemplo de Entrenamiento

```json
{
  "area_mm2": 125.5,
  "avg_width_mm": 4.8,
  "convexity": 0.72,
  "curvature": 0.18,
  "complexity_score": 0.35,
  "inertia_ratio": 1.9,
  "fabric_type": "Algodón",
  "image_type": "photo",
  "stitch_type": "fill",
  "density": 0.65,
  "angle": 45,
  "pull_compensation": 0.15,
  "underlay": 1,
  "original_confidence": 0.68,
  "changed_fields": "stitch_type,density",
  "timestamp": "2026-06-28T14:30:00Z"
}
```

## 8. Próximos Pasos Recomendados

### Corto plazo (< 1 semana)
1. ✅ Registrar feedback automáticamente
2. ✅ Mostrar LearningPanel con stats
3. 🔄 Integrar `improveRecommendationFromHistory` en adaptiveEngine

### Mediano plazo (1-2 meses)
1. Exportar y entrenar modelos locales (sklearn)
2. Mostrar "sugerencias alternativas" basadas en aprendizaje
3. Dashboard de precisión de predicciones

### Largo plazo (trimestres)
1. Entrenar modelos grandes (LLMs) con retroalimentación
2. Fine-tuning de Claude/GPT específico para bordado
3. Sistema de A/B testing para validar mejoras
4. Marketplace de "estilos de usuario" (preferencias aprendidas)

## 9. Referencias

- **Notebook ejemplo**: `docs/learning_examples.ipynb` (TODO)
- **API docs**: `docs/api/trainLearningModel.md` (TODO)
- **Caso de uso**: Mejorar densidad para denim, ángulos para anime, etc.