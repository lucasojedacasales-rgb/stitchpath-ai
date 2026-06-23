# Cliente Python: Conectar desde Servidor Externo

Llama a Base44 desde cualquier servidor Python externo sin necesidad de estar en el dashboard.

## 📦 Instalación

```bash
pip install requests pillow numpy
```

## 🚀 Uso Básico

### Desde línea de comandos:

```bash
python client_externo.py --image foto.png
```

### Opciones avanzadas:

```bash
python client_externo.py \
  --image foto.png \
  --api-url https://mi-base44.app \
  --api-key tu-token-aqui \
  --colors 8 \
  --width 150 \
  --height 120 \
  --density 0.8 \
  --output mi_resultado.json
```

### Desde Python:

```python
from client_externo import Base44StitchClient

# Crear cliente
client = Base44StitchClient('https://api.base44.app')

# Vectorizar
result = client.vectorize(
    image_path='foto.png',
    color_count=6,
    width_mm=100,
    height_mm=100,
    stitch_density=0.7
)

# Procesar resultado
print(f"Puntadas generadas: {result['total_stitches']}")
for region in result['regions']:
    print(f"  {region['name']}: {region['stitch_count']} ptos")

# Guardar
client.save_result(result, 'output.json')
```

## 📊 Flujo

```
Servidor externo
    ↓
client_externo.py
    ↓ (POST JSON)
Base44.stitchGeneratorAPI
    ↓ (Deno backend)
Vectorización
    ↓ (JSON)
Servidor externo
    ↓
result.json
```

## 🔑 Autenticación

Si Base44 requiere autenticación:

```python
client = Base44StitchClient(
    api_url='https://api.base44.app',
    api_key='tu-bearer-token'
)
```

## 📥 Formato de Resultado

```json
{
  "success": true,
  "regions": [
    {
      "id": "r0",
      "name": "rojo_fill",
      "color": "#ff0000",
      "stitch_type": "fill",
      "stitch_count": 1234,
      "area_mm2": 50.5,
      "path_points": [[0.5, 0.5], [0.6, 0.5], ...],
      "visible": true
    }
  ],
  "total_stitches": 5432,
  "colors_used": 3
}
```

## 🔄 Integración con Flujo Existente

Si tienes un procesamiento local, puedes encadenarlo:

```python
from client_externo import Base44StitchClient
import subprocess

# 1. Preprocesar imagen localmente
subprocess.run(['convert', 'raw.png', '-resize', '800x800', 'resized.png'])

# 2. Vectorizar en Base44
client = Base44StitchClient('https://api.base44.app')
result = client.vectorize('resized.png')

# 3. Postprocesar resultado
for region in result['regions']:
    # Tu lógica aquí
    pass

# 4. Exportar
subprocess.run(['pyembroidery_convert', 'output.json', 'output.dst'])
```

## ⚙️ Configuración por Ambiente

**`.env`**
```
BASE44_API_URL=https://api.base44.app
BASE44_API_KEY=tu-token-aqui
```

**`client_config.py`**
```python
import os
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv('BASE44_API_URL', 'https://api.base44.app')
API_KEY = os.getenv('BASE44_API_KEY')

client = Base44StitchClient(API_URL, API_KEY)
```

## 🐛 Troubleshooting

| Error | Solución |
|-------|----------|
| ConnectionError | Verifica que la URL de Base44 sea correcta |
| 401 Unauthorized | Falta el token, revisa `--api-key` |
| 422 Unprocessable Entity | Imagen inválida o muy simple |
| Timeout | Imagen muy grande, redimensiona antes |

## 📝 Ejemplo Completo: Batch Processing

```python
from pathlib import Path
from client_externo import Base44StitchClient

client = Base44StitchClient('https://api.base44.app')

# Procesar todas las imágenes en directorio
for img_path in Path('images').glob('*.png'):
    print(f"\n▶ {img_path.name}")
    
    try:
        result = client.vectorize(
            str(img_path),
            color_count=6,
            width_mm=100,
            height_mm=100
        )
        
        # Guardar resultado
        output = img_path.stem + '.json'
        client.save_result(result, output)
        
        print(f"✅ {result['total_stitches']} puntadas generadas")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        continue
```

## 🎯 Casos de Uso

- **Batch processing**: Vectorizar cientos de imágenes
- **Integración CI/CD**: Generar puntadas automáticamente
- **API gateway**: Exponer Base44 como servicio propio
- **Local + Cloud**: Preprocesar localmente, vectorizar en Base44