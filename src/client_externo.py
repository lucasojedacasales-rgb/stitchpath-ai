#!/usr/bin/env python3
"""
Cliente Python para conectarse a Base44 desde servidor externo
Envía imagen a stitchGeneratorAPI y recibe puntadas

Instalación:
    pip install requests pillow numpy

Uso:
    python client_externo.py --image foto.png --api-url https://api.base44.app
"""

import requests
import json
import base64
import argparse
from pathlib import Path
from PIL import Image
import numpy as np

class Base44StitchClient:
    def __init__(self, api_url, api_key=None):
        """
        Inicializar cliente
        
        Args:
            api_url: URL base de Base44 (ej: https://api.base44.app)
            api_key: Token de autenticación (opcional, si Base44 lo requiere)
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        
        if api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {api_key}'
            })
    
    def extract_pixels_from_image(self, image_path):
        """
        Cargar imagen y extraer pixels como array RGBA
        
        Args:
            image_path: Ruta a archivo PNG/JPG
            
        Returns:
            (pixels_list, width, height)
        """
        img = Image.open(image_path)
        
        # Convertir a RGBA si no lo está
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Extraer pixels como array 1D
        pixels = list(img.getdata())
        pixels_flat = []
        for p in pixels:
            if isinstance(p, (list, tuple)):
                pixels_flat.extend(p)
            else:
                # Escala de grises, replicar a RGB + alpha
                pixels_flat.extend([p, p, p, 255])
        
        width, height = img.size
        print(f"✅ Imagen cargada: {width}x{height}px, {len(pixels_flat)//4} píxeles")
        
        return pixels_flat, width, height
    
    def vectorize(self, image_path, color_count=6, width_mm=100, height_mm=100, 
                  stitch_density=0.7):
        """
        Enviar imagen a Base44 para vectorización
        
        Args:
            image_path: Ruta a archivo PNG/JPG
            color_count: Número de colores a detectar (default 6)
            width_mm: Ancho diseño en mm (default 100)
            height_mm: Alto diseño en mm (default 100)
            stitch_density: Densidad de puntadas 0-1 (default 0.7)
            
        Returns:
            dict con resultado
        """
        print(f"📤 Cargando imagen: {image_path}")
        
        # Extraer pixels
        pixels, width, height = self.extract_pixels_from_image(image_path)
        
        # Preparar payload
        payload = {
            'pixels': pixels,
            'width': width,
            'height': height,
            'color_count': color_count,
            'width_mm': width_mm,
            'height_mm': height_mm,
            'stitch_density': stitch_density
        }
        
        # Enviar a stitchGeneratorAPI de Base44
        endpoint = f'{self.api_url}/functions/stitchGeneratorAPI'
        
        print(f"🚀 Enviando a {endpoint}...")
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=60  # 60 segundos timeout
            )
            response.raise_for_status()
            
        except requests.exceptions.ConnectionError:
            raise Exception(f"❌ No se puede conectar a {self.api_url}\n"
                          "¿La URL es correcta? ¿Base44 está activo?")
        except requests.exceptions.Timeout:
            raise Exception("⏱️ Timeout: La vectorización tardó demasiado")
        except requests.exceptions.HTTPError as e:
            raise Exception(f"❌ Error HTTP {response.status_code}: {response.text}")
        
        result = response.json()
        
        if not result.get('data', {}).get('success'):
            error = result.get('data', {}).get('error', 'Unknown error')
            raise Exception(f"❌ Error en vectorización: {error}")
        
        return result['data']
    
    def save_result(self, result, output_path=None):
        """
        Guardar resultado en archivo JSON
        
        Args:
            result: Resultado de vectorize()
            output_path: Ruta de salida (default: result.json)
        """
        if output_path is None:
            output_path = 'result.json'
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Resultado guardado: {output_path}")
    
    def print_summary(self, result):
        """Mostrar resumen de resultados"""
        print("\n" + "="*60)
        print("✅ VECTORIZACIÓN EXITOSA")
        print("="*60)
        
        regions = result.get('regions', [])
        total_stitches = result.get('total_stitches', 0)
        colors = result.get('colors_used', 0)
        
        print(f"📍 Regiones detectadas: {len(regions)}")
        print(f"🧵 Puntadas totales: {total_stitches:,}")
        print(f"🎨 Colores utilizados: {colors}")
        
        print("\n📋 Detalle por región:")
        for i, region in enumerate(regions):
            print(f"\n  Region {i+1}: {region.get('name', region.get('id'))}")
            print(f"    Tipo: {region.get('stitch_type')}")
            print(f"    Color: {region.get('color')}")
            print(f"    Puntadas: {region.get('stitch_count', 0):,}")
            print(f"    Área: {region.get('area_mm2', 0):.2f}mm²")
        
        print("\n" + "="*60)


def main():
    parser = argparse.ArgumentParser(
        description='Cliente Python para vectorización en Base44'
    )
    parser.add_argument('--image', required=True, help='Ruta a archivo PNG/JPG')
    parser.add_argument('--api-url', default='https://api.base44.app', 
                      help='URL base de Base44 (default: https://api.base44.app)')
    parser.add_argument('--api-key', help='Token de autenticación (si es requerido)')
    parser.add_argument('--colors', type=int, default=6, help='Número de colores (default: 6)')
    parser.add_argument('--width', type=float, default=100, help='Ancho en mm (default: 100)')
    parser.add_argument('--height', type=float, default=100, help='Alto en mm (default: 100)')
    parser.add_argument('--density', type=float, default=0.7, help='Densidad 0-1 (default: 0.7)')
    parser.add_argument('--output', help='Archivo JSON de salida')
    
    args = parser.parse_args()
    
    # Validar imagen
    if not Path(args.image).exists():
        print(f"❌ Archivo no encontrado: {args.image}")
        return 1
    
    try:
        # Crear cliente y vectorizar
        client = Base44StitchClient(args.api_url, args.api_key)
        
        result = client.vectorize(
            image_path=args.image,
            color_count=args.colors,
            width_mm=args.width,
            height_mm=args.height,
            stitch_density=args.density
        )
        
        # Mostrar resultado
        client.print_summary(result)
        
        # Guardar JSON
        client.save_result(result, args.output)
        
        return 0
        
    except Exception as e:
        print(f"\n{e}")
        return 1


if __name__ == '__main__':
    exit(main())