"""
Motor de vectorización para bordado con IA
Arquitectura: Segmentación → Vectorización → Optimización → Exportación
"""

import numpy as np
import torch
import torch.nn as nn
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Optional
from enum import Enum
import cv2
from sklearn.cluster import KMeans
from scipy.spatial import Voronoi
from scipy.optimize import linear_sum_assignment
import svgwrite
import json

# ============================================================
# CONFIGURACIÓN Y TIPOS DE DATOS
# ============================================================

class StitchType(Enum):
    RUNNING = "running"      # Puntada recta/contorno
    SATIN = "satin"          # Puntada de satén (columna)
    TATAMI = "tatami"        # Relleno tipo tatami
    CROSS = "cross"          # Puntada cruzada
    ZIGZAG = "zigzag"        # Zigzag básico

@dataclass
class StitchPoint:
    x: float
    y: float
    is_jump: bool = False    # True si es un salto (trim)
    color_index: int = 0
    
@dataclass
class StitchBlock:
    points: List[StitchPoint]
    stitch_type: StitchType
    color_index: int
    density: float = 0.4       # mm entre puntadas
    angle: float = 0.0         # Ángulo de puntada en grados

@dataclass
class EmbroideryDesign:
    blocks: List[StitchBlock]
    colors: List[Tuple[int, int, int]]  # Paleta RGB
    width: float  # mm
    height: float # mm

# ============================================================
# 1. SEGMENTACIÓN CON SAM 2
# ============================================================

class SAM2Segmenter:
    """
    Wrapper para SAM 2 de Meta para segmentación de objetos de bordado.
    Requiere: pip install git+https://github.com/facebookresearch/segment-anything-2.git
    """
    
    def __init__(self, model_path: str = "sam2_hiera_large.pt"):
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        
        self.predictor = SAM2ImagePredictor(build_sam2(model_path))
        
    def segment(self, image: np.ndarray, prompt_points: Optional[List[Tuple[int, int]]] = None) -> np.ndarray:
        """
        Segmenta la imagen en objetos individuales.
        Retorna: máscara (H, W) con IDs de objeto
        """
        self.predictor.set_image(image)
        
        if prompt_points:
            # Segmentación con puntos guía
            point_coords = np.array(prompt_points)
            point_labels = np.ones(len(prompt_points))
            masks, scores, _ = self.predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                multimask_output=True
            )
            return masks[np.argmax(scores)]
        else:
            # Segmentación automática (todo)
            masks = self.predictor.generate()
            # Combinar máscaras en una sola imagen de segmentación
            seg_map = np.zeros(image.shape[:2], dtype=np.int32)
            for i, mask in enumerate(masks):
                seg_map[mask['segmentation']] = i + 1
            return seg_map

# ============================================================
# 2. CUANTIZACIÓN DE COLOR ESPECÍFICA PARA BORDADO
# ============================================================

class EmbroideryColorQuantizer:
    """
    Reduce colores considerando:
    - Máximo de colores por máquina (típicamente 15 para comercial)
    - Similitud perceptual (CIEDE2000)
    - Colores de hilos estándar (Isacord, Madeira, etc.)
    """
    
    # Paleta Isacord 40 estándar (40 colores base)
    STANDARD_THREADS = np.array([
        [0, 0, 0],        # Negro
        [255, 255, 255],  # Blanco
        [255, 0, 0],      # Rojo
        [0, 255, 0],      # Verde
        [0, 0, 255],      # Azul
        [255, 255, 0],    # Amarillo
        [255, 0, 255],    # Magenta
        [0, 255, 255],    # Cyan
        [128, 0, 0],      # Marrón oscuro
        [255, 165, 0],    # Naranja
        [128, 128, 128],  # Gris
        [255, 192, 203],  # Rosa
        [75, 0, 130],     # Índigo
        [173, 216, 230],  # Azul claro
        [144, 238, 144],  # Verde claro
    ])
    
    def __init__(self, max_colors: int = 15, use_standard_palette: bool = True):
        self.max_colors = max_colors
        self.use_standard = use_standard_palette
        
    def quantize(self, image: np.ndarray, mask: Optional[np.ndarray] = None) -> Tuple[np.ndarray, List[Tuple[int, int, int]]]:
        """
        Cuantiza colores de la imagen.
        Retorna: (imagen cuantizada, paleta)
        """
        pixels = image.reshape(-1, 3)
        
        if mask is not None:
            mask_flat = mask.flatten() > 0
            pixels = pixels[mask_flat]
        
        if self.use_standard:
            # Usar paleta estándar + K-means para colores restantes
            n_standard = min(len(self.STANDARD_THREADS), self.max_colors // 2)
            n_custom = self.max_colors - n_standard
            
            # K-means para encontrar colores dominantes
            kmeans = KMeans(n_clusters=min(n_custom, len(pixels)), random_state=42, n_init=10)
            kmeans.fit(pixels.astype(np.float32))
            
            # Combinar paleta estándar + personalizada
            palette = np.vstack([
                self.STANDARD_THREADS[:n_standard],
                kmeans.cluster_centers_.astype(np.uint8)
            ])
        else:
            # K-means puro
            kmeans = KMeans(n_clusters=self.max_colors, random_state=42, n_init=10)
            kmeans.fit(pixels.astype(np.float32))
            palette = kmeans.cluster_centers_.astype(np.uint8)
        
        # Asignar cada píxel al color más cercano
        dist = np.linalg.norm(pixels[:, None] - palette[None, :], axis=2)
        labels = np.argmin(dist, axis=1)
        
        quantized = palette[labels]
        
        if mask is not None:
            result = image.copy()
            result[mask > 0] = quantized
        else:
            result = quantized.reshape(image.shape)
            
        return result, [tuple(c) for c in palette]

# ============================================================
# 3. VECTORIZACIÓN NEURONAL: Im2Vec Adaptado
# ============================================================

class SVGCommandDecoder(nn.Module):
    """
    Decodificador LSTM que genera comandos SVG secuencialmente.
    Cada comando: [tipo, x1, y1, x2, y2, x3, y3] (cúbica) o [tipo, x1, y1] (línea)
    """
    
    COMMAND_TYPES = {
        0: 'M',   # Move
        1: 'L',   # Line
        2: 'C',   # Cubic Bezier
        3: 'Z',   # Close path
    }
    
    def __init__(self, hidden_dim=512, num_commands=100):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_commands = num_commands
        
        # Encoder CNN para la imagen de entrada
        self.encoder = nn.Sequential(
            nn.Conv2d(3, 64, 3, 2, 1),   # 128x128
            nn.ReLU(),
            nn.Conv2d(64, 128, 3, 2, 1),  # 64x64
            nn.ReLU(),
            nn.Conv2d(128, 256, 3, 2, 1), # 32x32
            nn.ReLU(),
            nn.Conv2d(256, 512, 3, 2, 1), # 16x16
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten()
        )
        
        # LSTM Decoder
        self.lstm = nn.LSTM(512 + 7, hidden_dim, 2, batch_first=True)
        self.output_proj = nn.Linear(hidden_dim, 7)  # 7 parámetros por comando
        
        # Embedding para tipo de comando
        self.type_embed = nn.Embedding(4, 16)
        
    def forward(self, image, max_len=50):
        batch_size = image.size(0)
        
        # Encode imagen
        img_feat = self.encoder(image)  # (B, 512)
        
        # Inicializar LSTM
        hidden = (torch.zeros(2, batch_size, self.hidden_dim).to(image.device),
                  torch.zeros(2, batch_size, self.hidden_dim).to(image.device))
        
        commands = []
        input_token = torch.zeros(batch_size, 1, 512 + 7).to(image.device)
        
        for _ in range(max_len):
            # Concatenar feature de imagen + comando anterior
            lstm_input = torch.cat([img_feat.unsqueeze(1), input_token[:, -1:, :7]], dim=-1)
            
            out, hidden = self.lstm(lstm_input, hidden)
            pred = self.output_proj(out.squeeze(1))
            
            # Separar tipo y parámetros
            cmd_type = torch.argmax(pred[:, :4], dim=1)
            params = pred[:, 4:]
            
            commands.append((cmd_type, params))
            
            # Preparar siguiente input
            type_emb = self.type_embed(cmd_type)
            input_token = torch.cat([type_emb, params], dim=-1).unsqueeze(1)
            
            # Stop si es 'Z' (close path)
            if (cmd_type == 3).all():
                break
                
        return commands

class VectorizationEngine:
    """
    Motor principal de vectorización que combina técnicas clásicas y neuronales.
    """
    
    def __init__(self, use_neural=True, device='cuda'):
        self.use_neural = use_neural
        self.device = device
        
        if use_neural:
            self.decoder = SVGCommandDecoder().to(device)
            # Cargar pesos pre-entrenados o inicializar
            # self.decoder.load_state_dict(torch.load('vectorizer.pth'))
            
    def vectorize_region(self, region_mask: np.ndarray, image: np.ndarray) -> List[dict]:
        """
        Vectoriza una región de color plano a curvas de Bézier.
        Retorna: Lista de paths SVG
        """
        # Extraer contorno
        contours, _ = cv2.findContours(
            region_mask.astype(np.uint8), 
            cv2.RETR_EXTERNAL, 
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        paths = []
        for contour in contours:
            if len(contour) < 3:
                continue
                
            # Simplificación con Douglas-Peucker
            epsilon = 0.01 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            if self.use_neural and len(approx) > 4:
                # Mejorar con red neuronal
                path = self._neural_refinement(approx, image)
            else:
                # Vectorización clásica
                path = self._classic_vectorize(approx)
                
            paths.append(path)
            
        return paths
    
    def _classic_vectorize(self, contour: np.ndarray) -> dict:
        """Convierte contorno a curvas de Bézier cúbicas."""
        points = contour.reshape(-1, 2).astype(np.float32)
        
        # Detectar esquinas (puntos de alta curvatura)
        corners = self._detect_corners(points)
        
        # Segmentar en tramos entre esquinas
        segments = []
        for i in range(len(corners)):
            start = corners[i]
            end = corners[(i + 1) % len(corners)]
            
            # Extraer puntos del segmento
            if start < end:
                segment = points[start:end+1]
            else:
                segment = np.vstack([points[start:], points[:end+1]])
            
            # Ajustar Bézier cúbica
            bezier = self._fit_cubic_bezier(segment)
            segments.append(bezier)
        
        return {
            'type': 'path',
            'segments': segments,
            'closed': True
        }
    
    def _detect_corners(self, points: np.ndarray, angle_threshold: float = 45.0) -> List[int]:
        """Detecta esquinas usando producto cruzado."""
        corners = [0]  # Siempre incluir primer punto
        n = len(points)
        
        for i in range(1, n):
            prev = points[i - 1]
            curr = points[i]
            next_p = points[(i + 1) % n]
            
            # Vectores
            v1 = prev - curr
            v2 = next_p - curr
            
            # Ángulo
            cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
            angle = np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))
            
            if angle < angle_threshold:
                corners.append(i)
        
        # Asegurar cierre
        if corners[-1] != n - 1:
            corners.append(n - 1)
            
        return corners
    
    def _fit_cubic_bezier(self, points: np.ndarray) -> dict:
        """Ajusta una curva de Bézier cúbica a un conjunto de puntos."""
        n = len(points)
        if n < 2:
            return None
        
        # Usar mínimos cuadrados para encontrar control points
        # Simplificación: usar puntos 1/3 y 2/3 como control points
        p0 = points[0]
        p3 = points[-1]
        p1 = points[n // 3]
        p2 = points[2 * n // 3]
        
        return {
            'type': 'cubic',
            'p0': tuple(p0),
            'p1': tuple(p1),
            'p2': tuple(p2),
            'p3': tuple(p3)
        }
    
    def _neural_refinement(self, contour: np.ndarray, image: np.ndarray) -> dict:
        """Refina contorno usando el decodificador neuronal."""
        # Preparar input: crop de la región + máscara
        # Implementación simplificada - en producción usar el decoder completo
        return self._classic_vectorize(contour)

# ============================================================
# 4. CONVERSIÓN A PUNTADAS (STITCH GENERATION)
# ============================================================

class StitchGenerator:
    """
    Convierte paths vectoriales a puntadas específicas de bordado.
    """
    
    def __init__(self, stitch_length_mm: float = 0.4, max_jump_mm: float = 7.0):
        self.stitch_length = stitch_length_mm
        self.max_jump = max_jump_mm
        
    def generate_satin(self, path: dict, width_mm: float = 2.0) -> List[StitchPoint]:
        """
        Genera puntadas de satén para una columna.
        """
        points = []
        segments = path['segments']
        
        for seg in segments:
            if seg['type'] != 'cubic':
                continue
                
            p0, p1, p2, p3 = map(np.array, [seg['p0'], seg['p1'], seg['p2'], seg['p3']])
            
            # Calcular normales para ancho de columna
            t_values = np.linspace(0, 1, 100)
            for t in t_values:
                # Punto en curva
                point = (1-t)**3 * p0 + 3*(1-t)**2*t * p1 + 3*(1-t)*t**2 * p2 + t**3 * p3
                
                # Derivada (tangente)
                tangent = 3*(1-t)**2 * (p1 - p0) + 6*(1-t)*t * (p2 - p1) + 3*t**2 * (p3 - p2)
                tangent = tangent / (np.linalg.norm(tangent) + 1e-6)
                
                # Normal perpendicular
                normal = np.array([-tangent[1], tangent[0]])
                
                # Puntadas zigzag a lo ancho
                for side in [-1, 1]:
                    stitch_point = point + side * width_mm/2 * normal
                    points.append(StitchPoint(stitch_point[0], stitch_point[1]))
        
        return points
    
    def generate_tatami(self, path: dict, angle: float = 45.0, spacing: float = 0.5) -> List[StitchPoint]:
        """
        Genera relleno tipo tatami (mat) con líneas paralelas.
        """
        # Extraer bounding box del path
        # Generar líneas paralelas con ángulo específico
        # Conectar con zigzag o running stitch
        
        # Implementación simplificada
        points = []
        # ... (algoritmo de scanline con ángulo)
        return points
    
    def generate_running(self, path: dict) -> List[StitchPoint]:
        """
        Genera puntada recta/contorno a lo largo del path.
        """
        points = []
        segments = path['segments']
        
        for seg in segments:
            if seg['type'] == 'cubic':
                p0, p1, p2, p3 = map(np.array, [seg['p0'], seg['p1'], seg['p2'], seg['p3']])
                
                # Subdividir curva en puntadas de longitud fija
                length = self._bezier_length(p0, p1, p2, p3)
                num_stitches = max(2, int(length / self.stitch_length))
                
                for i in range(num_stitches + 1):
                    t = i / num_stitches
                    point = (1-t)**3 * p0 + 3*(1-t)**2*t * p1 + 3*(1-t)*t**2 * p2 + t**3 * p3
                    points.append(StitchPoint(point[0], point[1]))
        
        return points
    
    def _bezier_length(self, p0, p1, p2, p3, num_samples=100):
        """Calcula longitud aproximada de curva de Bézier."""
        t = np.linspace(0, 1, num_samples)
        points = np.array([
            (1-ti)**3 * p0 + 3*(1-ti)**2*ti * p1 + 3*(1-ti)*ti**2 * p2 + ti**3 * p3
            for ti in t
        ])
        return np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1))

# ============================================================
# 5. OPTIMIZACIÓN DE SECUENCIA (TSP + Clustering)
# ============================================================

class SequenceOptimizer:
    """
    Optimiza el orden de los bloques de puntadas para minimizar:
    - Saltos largos (jumps)
    - Cambios de color innecesarios
    - Trims
    """
    
    def __init__(self, max_jump_mm: float = 7.0):
        self.max_jump = max_jump_mm
        
    def optimize(self, blocks: List[StitchBlock]) -> List[StitchBlock]:
        """
        Reordena bloques para minimizar distancia total y saltos.
        """
        if len(blocks) <= 1:
            return blocks
        
        # Agrupar por color
        color_groups = {}
        for block in blocks:
            c = block.color_index
            if c not in color_groups:
                color_groups[c] = []
            color_groups[c].append(block)
        
        # Optimizar cada grupo de color (TSP)
        optimized = []
        for color_idx in sorted(color_groups.keys()):
            group = color_groups[color_idx]
            optimized_group = self._tsp_optimize(group)
            optimized.extend(optimized_group)
        
        # Insertar trims donde hay saltos largos
        return self._insert_trims(optimized)
    
    def _tsp_optimize(self, blocks: List[StitchBlock]) -> List[StitchBlock]:
        """Resuelve TSP para ordenar bloques del mismo color."""
        n = len(blocks)
        if n <= 2:
            return blocks
        
        # Matriz de distancias (entre último punto de uno y primero del siguiente)
        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                if i != j:
                    end_i = blocks[i].points[-1]
                    start_j = blocks[j].points[0]
                    dist_matrix[i][j] = np.sqrt((end_i.x - start_j.x)**2 + (end_i.y - start_j.y)**2)
        
        # Resolver asignación (simplificación de TSP)
        # Usar algoritmo greedy como aproximación
        visited = [False] * n
        order = [0]
        visited[0] = True
        
        for _ in range(n - 1):
            last = order[-1]
            # Encontrar no visitado más cercano
            min_dist = float('inf')
            next_idx = -1
            for i in range(n):
                if not visited[i] and dist_matrix[last][i] < min_dist:
                    min_dist = dist_matrix[last][i]
                    next_idx = i
            order.append(next_idx)
            visited[next_idx] = True
        
        return [blocks[i] for i in order]
    
    def _insert_trims(self, blocks: List[StitchBlock]) -> List[StitchBlock]:
        """Inserta puntos de jump/trim donde la distancia excede el máximo."""
        result = []
        
        for i, block in enumerate(blocks):
            if i > 0:
                prev_end = result[-1].points[-1]
                curr_start = block.points[0]
                dist = np.sqrt((prev_end.x - curr_start.x)**2 + (prev_end.y - curr_start.y)**2)
                
                if dist > self.max_jump:
                    # Insertar jump stitch
                    jump_point = StitchPoint(
                        curr_start.x, curr_start.y, 
                        is_jump=True, 
                        color_index=block.color_index
                    )
                    # Clonar bloque con punto de jump al inicio
                    new_points = [jump_point] + block.points
                    block = StitchBlock(
                        new_points, block.stitch_type, 
                        block.color_index, block.density, block.angle
                    )
            
            result.append(block)
        
        return result

# ============================================================
# 6. EXPORTADOR A FORMATOS DE BORDADO
# ============================================================

class DSTExporter:
    """
    Exporta a formato Tajima DST.
    Especificación: coordenadas de 3 bytes por puntada, máximo 12.1cm de salto.
    """
    
    # Códigos de comando DST
    STITCH = 0x00
    JUMP = 0x80
    STOP = 0xC0
    TRIM = 0x80  # Jump largo = trim
    
    def __init__(self):
        self.max_stitch = 121  # 12.1mm en unidades de 0.1mm
        
    def export(self, design: EmbroideryDesign, filename: str):
        """
        Exporta diseño a archivo DST.
        """
        with open(filename, 'wb') as f:
            # Header (512 bytes)
            header = self._create_header(design)
            f.write(header)
            
            # Puntadas
            for block in design.blocks:
                for point in block.points:
                    dx = int((point.x - (getattr(self, '_last_x', 0))) * 10)
                    dy = int((point.y - (getattr(self, '_last_y', 0))) * 10)
                    
                    # Limitar a máximo
                    dx = max(-self.max_stitch, min(self.max_stitch, dx))
                    dy = max(-self.max_stitch, min(self.max_stitch, dy))
                    
                    # Codificar
                    if point.is_jump:
                        f.write(self._encode_jump(dx, dy))
                    else:
                        f.write(self._encode_stitch(dx, dy))
                    
                    self._last_x = point.x
                    self._last_y = point.y
                
                # Stop/Color change al final de bloque
                f.write(self._encode_stop())
    
    def _create_header(self, design: EmbroideryDesign) -> bytes:
        """Crea header DST de 512 bytes."""
        header = bytearray(512)
        
        # Label (16 bytes)
        label = b"LA:Embroidery   "
        header[:len(label)] = label
        
        # ST (stitch count) - posición 16
        stitch_count = sum(len(b.points) for b in design.blocks)
        header[16:23] = f"ST:{stitch_count:7d}".encode()
        
        # CO (color count)
        color_count = len(design.colors)
        header[23:30] = f"CO:{color_count:3d}".encode()
        
        # +X, -X, +Y, -Y (bounding box)
        all_x = [p.x for b in design.blocks for p in b.points]
        all_y = [p.y for b in design.blocks for p in b.points]
        
        header[30:37] = f"+X:{max(all_x):5.1f}".encode()
        header[37:44] = f"-X:{min(all_x):5.1f}".encode()
        header[44:51] = f"+Y:{max(all_y):5.1f}".encode()
        header[51:58] = f"-Y:{min(all_y):5.1f}".encode()
        
        # AX, AY (centro)
        cx = (max(all_x) + min(all_x)) / 2
        cy = (max(all_y) + min(all_y)) / 2
        header[58:65] = f"AX:{cx:5.1f}".encode()
        header[65:72] = f"AY:{cy:5.1f}".encode()
        
        # MX, MY (offset)
        header[72:79] = f"MX:  0.0".encode()
        header[79:86] = f"MY:  0.0".encode()
        
        # PD (comments)
        header[86:512] = b" " * (512 - 86)
        
        return bytes(header)
    
    def _encode_stitch(self, dx: int, dy: int) -> bytes:
        """Codifica puntada normal (3 bytes)."""
        # DST usa codificación especial de 3 bytes
        b1 = 0x00
        b2 = 0x00
        b3 = 0x00
        
        # Codificar dx
        if dx > 0:
            b2 |= (dx & 0x0F)
            b1 |= ((dx >> 4) & 0x0F) << 4
        else:
            dx = -dx
            b2 |= (dx & 0x0F)
            b1 |= ((dx >> 4) & 0x0F) << 4
            b3 |= 0x04  # Signo negativo X
        
        # Codificar dy
        if dy > 0:
            b2 |= ((dy & 0x0F) << 4)
            b1 |= ((dy >> 4) & 0x0F)
        else:
            dy = -dy
            b2 |= ((dy & 0x0F) << 4)
            b1 |= ((dy >> 4) & 0x0F)
            b3 |= 0x08  # Signo negativo Y
        
        return bytes([b1, b2, b3])
    
    def _encode_jump(self, dx: int, dy: int) -> bytes:
        """Codifica salto/jump (3 bytes con bit de jump)."""
        data = self._encode_stitch(dx, dy)
        return bytes([data[0] | 0x80, data[1], data[2]])
    
    def _encode_stop(self) -> bytes:
        """Codifica stop/cambio de color."""
        return bytes([0x00, 0x00, 0xF3])

class PESExporter:
    """
    Exporta a formato Brother PES.
    Más complejo que DST, requiere estructura de bloques + colores.
    """
    
    def __init__(self):
        pass  # Implementación completa requiere spec PES v1-6
    
    def export(self, design: EmbroideryDesign, filename: str):
        # Simplificación: usar pyembroidery si está disponible
        try:
            import pyembroidery
            # Convertir a formato pyembroidery
            pattern = pyembroidery.EmbPattern()
            # ... (mapeo de puntadas)
            pyembroidery.write_pes(pattern, filename)
        except ImportError:
            raise NotImplementedError("PES export requiere pyembroidery")

# ============================================================
# 7. PIPELINE COMPLETO
# ============================================================

class EmbroideryPipeline:
    """
    Pipeline completo: Imagen → DST/PES
    """
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        
        # Inicializar componentes
        self.segmenter = SAM2Segmenter() if self.config.get('use_sam', True) else None
        self.quantizer = EmbroideryColorQuantizer(
            max_colors=self.config.get('max_colors', 15)
        )
        self.vectorizer = VectorizationEngine(
            use_neural=self.config.get('use_neural', True)
        )
        self.stitch_gen = StitchGenerator(
            stitch_length_mm=self.config.get('stitch_length', 0.4)
        )
        self.optimizer = SequenceOptimizer(
            max_jump_mm=self.config.get('max_jump', 7.0)
        )
        
    def process(self, image_path: str, output_path: str, format: str = 'dst'):
        """
        Procesa imagen completa a archivo de bordado.
        """
        # 1. Cargar imagen
        image = cv2.imread(image_path)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # 2. Segmentar
        if self.segmenter:
            seg_mask = self.segmenter.segment(image)
        else:
            seg_mask = np.ones(image.shape[:2], dtype=np.int32)
        
        # 3. Cuantizar colores
        quantized, palette = self.quantizer.quantize(image, seg_mask)
        
        # 4. Procesar cada región
        blocks = []
        unique_colors = np.unique(seg_mask)
        
        for color_idx in unique_colors:
            if color_idx == 0:  # Fondo
                continue
            
            mask = (seg_mask == color_idx).astype(np.uint8)
            
            # Detectar tipo de puntada según forma
            stitch_type = self._detect_stitch_type(mask)
            
            # Vectorizar
            paths = self.vectorizer.vectorize_region(mask, image)
            
            # Generar puntadas
            for path in paths:
                if stitch_type == StitchType.SATIN:
                    points = self.stitch_gen.generate_satin(path, width_mm=2.0)
                elif stitch_type == StitchType.TATAMI:
                    points = self.stitch_gen.generate_tatami(path, angle=45.0)
                else:
                    points = self.stitch_gen.generate_running(path)
                
                block = StitchBlock(
                    points=points,
                    stitch_type=stitch_type,
                    color_index=int(color_idx) - 1,
                    density=0.4,
                    angle=0.0
                )
                blocks.append(block)
        
        # 5. Optimizar secuencia
        optimized_blocks = self.optimizer.optimize(blocks)
        
        # 6. Crear diseño
        design = EmbroideryDesign(
            blocks=optimized_blocks,
            colors=palette,
            width=image.shape[1] * 0.1,  # Asumir 0.1mm por px
            height=image.shape[0] * 0.1
        )
        
        # 7. Exportar
        if format.lower() == 'dst':
            exporter = DSTExporter()
        elif format.lower() == 'pes':
            exporter = PESExporter()
        else:
            raise ValueError(f"Formato no soportado: {format}")
        
        exporter.export(design, output_path)
        
        return design
    
    def _detect_stitch_type(self, mask: np.ndarray) -> StitchType:
        """
        Detecta tipo de puntada óptimo basado en geometría de la región.
        """
        # Calcular características de forma
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return StitchType.RUNNING
        
        contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        
        # Circularidad
        circularity = 4 * np.pi * area / (perimeter ** 2) if perimeter > 0 else 0
        
        # Bounding box
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = max(w, h) / (min(w, h) + 1e-6)
        
        # Decisión
        if area < 100:  # Pequeño
            return StitchType.RUNNING
        elif aspect_ratio > 3 and area < 5000:  # Columna larga
            return StitchType.SATIN
        elif circularity > 0.7:  # Circular
            return StitchType.TATAMI
        else:
            return StitchType.TATAMI

# ============================================================
# USO EJEMPLO
# ============================================================

if __name__ == "__main__":
    # Configuración
    config = {
        'use_sam': True,
        'use_neural': True,
        'max_colors': 15,
        'stitch_length': 0.4,
        'max_jump': 7.0
    }
    
    # Crear pipeline
    pipeline = EmbroideryPipeline(config)
    
    # Procesar imagen
    # pipeline.process('input.png', 'output.dst', format='dst')
    
    print("Motor de bordado inicializado correctamente")
// ============================================================
// FUNCIONES HELPER
// ============================================================

function posterizeImage(rgba, W, H, levels) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < W * H * 4; i += 4) {
    if (rgba[i + 3] < 128) continue;
    rgba[i]     = Math.round(rgba[i]     / step) * step;
    rgba[i + 1] = Math.round(rgba[i + 1] / step) * step;
    rgba[i + 2] = Math.round(rgba[i + 2] / step) * step;
  }
}

function mergeColorsAggressive(labels, W, H, centroidsLab, centroidsRgb, mergeColorThreshold) {
  const k = centroidsLab.length;
  if (k <= 3) return;

  const colorCounts = new Array(k).fill(0);
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) colorCounts[labels[i]]++;
  }
  const totalPixels = colorCounts.reduce((a, b) => a + b, 0);
  const minAreaThreshold = totalPixels * 0.02;

  const forcedMerges = new Map();
  for (let i = 0; i < k; i++) {
    if (colorCounts[i] < minAreaThreshold) {
      let nearest = -1;
      let nearestDist = Infinity;
      for (let j = 0; j < k; j++) {
        if (i === j || colorCounts[j] < minAreaThreshold) continue;
        const dist = deltaE2000(centroidsLab[i], centroidsLab[j]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = j;
        }
      }
      if (nearest !== -1) forcedMerges.set(i, nearest);
    }
  }

  const merges = new Map();
  
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const dist = deltaE2000(centroidsLab[i], centroidsLab[j]);
      const effectiveThreshold = (colorCounts[i] + colorCounts[j] < minAreaThreshold * 2) 
        ? mergeColorThreshold * 1.5 
        : mergeColorThreshold * 0.7;
      
      if (dist < effectiveThreshold) {
        merges.set(j, i);
      }
    }
  }
  
  for (const [smallColor, targetColor] of forcedMerges) {
    merges.set(smallColor, targetColor);
  }
  
  if (merges.size === 0) return;

  const finalMerge = new Map();
  for (let i = 0; i < k; i++) {
    let current = i;
    while (merges.has(current)) {
      current = merges.get(current);
    }
    finalMerge.set(i, current);
  }

  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) labels[i] = finalMerge.get(labels[i]);
  }

  compactColorIndices(labels, W, H, centroidsLab, centroidsRgb);
}

function compactColorIndices(labels, W, H, centroidsLab, centroidsRgb) {
  const used = new Set();
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) used.add(labels[i]);
  }
  
  const remap = new Map();
  let next = 0;
  for (const c of [...used].sort((a, b) => a - b)) {
    remap.set(c, next++);
  }
  
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) labels[i] = remap.get(labels[i]);
  }

  const newLab = [];
  const newRgb = [];
  for (const [oldIdx, newIdx] of remap) {
    newLab[newIdx] = centroidsLab[oldIdx];
    newRgb[newIdx] = centroidsRgb[oldIdx];
  }
  
  centroidsLab.length = newLab.length;
  centroidsRgb.length = newRgb.length;
  for (let i = 0; i < newLab.length; i++) {
    centroidsLab[i] = newLab[i];
    centroidsRgb[i] = newRgb[i];
  }
}

function mergeSmallestRegions(regions, targetCount) {
  while (regions.length > targetCount) {
    let smallestIdx = 0;
    let smallestArea = Infinity;
    
    for (let i = 0; i < regions.length; i++) {
      const area = regions[i].pixelCount;
      if (area < smallestArea) {
        smallestArea = area;
        smallestIdx = i;
      }
    }

    const small = regions[smallestIdx];
    let nearestIdx = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < regions.length; i++) {
      if (i === smallestIdx) continue;
      if (regions[i].hex !== small.hex) continue;
      
      const dist = Math.hypot(
        regions[i].centroid[0] - small.centroid[0],
        regions[i].centroid[1] - small.centroid[1]
      );
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    if (nearestIdx === -1) {
      for (let i = 0; i < regions.length; i++) {
        if (i === smallestIdx) continue;
        const dist = Math.hypot(
          regions[i].centroid[0] - small.centroid[0],
          regions[i].centroid[1] - small.centroid[1]
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    if (nearestIdx === -1) break;

    const target = regions[nearestIdx];
    for (let m = 0; m < small.mask.length; m++) target.mask[m] = target.mask[m] || small.mask[m];
    target.pixels.push(...small.pixels);
    target.pixelCount += small.pixelCount;
    target.bbox.minX = Math.min(target.bbox.minX, small.bbox.minX);
    target.bbox.maxX = Math.max(target.bbox.maxX, small.bbox.maxX);
    target.bbox.minY = Math.min(target.bbox.minY, small.bbox.minY);
    target.bbox.maxY = Math.max(target.bbox.maxY, small.bbox.maxY);
    target.centroid = [
      (target.bbox.minX + target.bbox.maxX) / 2,
      (target.bbox.minY + target.bbox.maxY) / 2
    ];

    regions.splice(smallestIdx, 1);
  }

  return regions;
}

function floodFillRegions(labels, W, H, k, minPx, mmPerPx, rgba, centroids) {
  const regions = [];
  let nextId = 0;

  for (let ci = 0; ci < k; ci++) {
    const visited = new Uint8Array(W * H);

    for (let start = 0; start < W * H; start++) {
      if (labels[start] !== ci || visited[start]) continue;

      const stack = [start];
      const pixelList = [];
      let minX = W, maxX = 0, minY = H, maxY = 0, sx = 0, sy = 0;

      while (stack.length > 0) {
        const idx = stack.pop();
        if (visited[idx] || labels[idx] !== ci) continue;
        visited[idx] = 1;
        pixelList.push(idx);

        const x = idx % W, y = Math.floor(idx / W);
        sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;

        if (x > 0) stack.push(idx - 1);
        if (x < W - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - W);
        if (y < H - 1) stack.push(idx + W);
      }

      if (pixelList.length < minPx) continue;

      const mask = new Uint8Array(W * H);
      for (const px of pixelList) mask[px] = 1;

      regions.push({
        id: `region_${String(nextId + 1).padStart(3, '0')}`,
        colorIdx: ci,
        hex: rgbToHex(centroids[ci]),
        mask,
        pixels: pixelList,
        pixelCount: pixelList.length,
        centroid: [sx / pixelList.length, sy / pixelList.length],
        bbox: { minX, maxX, minY, maxY }
      });
      nextId++;
    }
  }

  return regions;
}

function smoothContour(contour, windowSize) {
  if (contour.length < windowSize * 2) return contour;
  const smoothed = [];
  const n = contour.length;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, wSum = 0;
    for (let j = -windowSize; j <= windowSize; j++) {
      const idx = (i + j + n) % n;
      const w = 1.0 / (1.0 + Math.abs(j));
      sx += contour[idx][0] * w;
      sy += contour[idx][1] * w;
      wSum += w;
    }
    smoothed.push([sx / wSum, sy / wSum]);
  }
  return smoothed;
}

function traceDesignContour(labels, W, H) {
  const visited = new Uint8Array(W * H);
  let start = -1;
  for (let i = 0; i < W * H; i++) {
    if (labels[i] !== -1) { start = i; break; }
  }
  if (start === -1) return [];

  const stack = [start];
  const designPixels = new Set();
  
  while (stack.length > 0) {
    const idx = stack.pop();
    if (visited[idx] || labels[idx] === -1) continue;
    visited[idx] = 1;
    designPixels.add(idx);

    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && !visited[n]) {
        stack.push(n);
      }
    }
  }

  const borderPixels = [];
  for (const idx of designPixels) {
    const x = idx % W, y = Math.floor(idx / W);
    const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
    let isBorder = false;
    for (const n of neighbors) {
      const nx = n % W, ny = Math.floor(n / W);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || labels[n] === -1) {
        isBorder = true;
        break;
      }
    }
    if (isBorder) borderPixels.push([x, y]);
  }

  if (borderPixels.length === 0) return [];
  return rdp(smoothContour(borderPixels, 2), 1.0);
}

function isRegionOnDesignBorder(region, designContour, W, H) {
  if (!designContour || designContour.length === 0) return false;
  const { bbox } = region;
  const margin = 5;
  return bbox.minX <= margin || bbox.maxX >= W - margin ||
         bbox.minY <= margin || bbox.maxY >= H - margin;
}

function traceContour(mask, W, H) {
  let start = -1;
  for (let i = 0; i < mask.length; i++) { if (mask[i]) { start = i; break; } }
  if (start === -1) return [];
  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const contour = [];
  let cx = start % W, cy = Math.floor(start / W);
  const sx = cx, sy = cy;
  let dir = 0;
  for (let step = 0; step < W * H; step++) {
    contour.push([cx, cy]);
    let moved = false;
    for (let d = 0; d < 8; d++) {
      const nd = (dir + 6 + d) % 8;
      const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (mask[ny * W + nx]) { dir = nd; cx = nx; cy = ny; moved = true; break; }
    }
    if (!moved) break;
    if (step > 3 && cx === sx && cy === sy) break;
  }
  return contour;
}

function rdp(pts, eps) {
  if (pts.length <= 2) return pts;
  const result = new Uint8Array(pts.length);
  result[0] = 1;
  result[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxD = 0, maxI = start;
    for (let i = start + 1; i < end; i++) {
      const d = ptSegDist(pts[i], pts[start], pts[end]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      result[maxI] = 1;
      stack.push([start, maxI]);
      stack.push([maxI, end]);
    }
  }
  return pts.filter((_, i) => result[i]);
}

function ptSegDist([px,py],[ax,ay],[bx,by]) {
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-ax,py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}

function closePolygon(polygon, threshold) {
  if (polygon.length < 3) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  const dist = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (dist > threshold) return [...polygon, [first[0], first[1]]];
  if (dist > 0.01) {
    const closed = [...polygon];
    closed[closed.length - 1] = [first[0], first[1]];
    return closed;
  }
  return polygon;
}

function contourPerimeterMm(pts, mmPerPx) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    p += Math.hypot(b[0]-a[0], b[1]-a[1]);
  }
  return p * mmPerPx;
}

function generateSatinContour(polygon, width, mmPerPx) {
  const stitches = [];
  const baseHalfWidth = width / 2;
  let totalLength = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    totalLength += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  const density = Math.max(0.15, Math.min(0.4, totalLength / 200));
  const normals = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dy2);
    let nx = 0, ny = 0;
    if (len1 > 0.001) { nx += (-dy1 / len1); ny += (dx1 / len1); }
    if (len2 > 0.001) { nx += (-dy2 / len2); ny += (dx2 / len2); }
    const nLen = Math.hypot(nx, ny);
    if (nLen > 0.001) normals.push([nx / nLen, ny / nLen]);
    else normals.push([0, 1]);
  }
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % n];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.01) continue;
    const steps = Math.max(3, Math.floor(segLen / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const baseX = p1[0] + dx * t, baseY = p1[1] + dy * t;
      const n1 = normals[i], n2 = normals[(i + 1) % n];
      const nx = n1[0] * (1 - t) + n2[0] * t;
      const ny = n1[1] * (1 - t) + n2[1] * t;
      const nLen = Math.hypot(nx, ny);
      const nnx = nLen > 0 ? nx / nLen : 0;
      const nny = nLen > 0 ? ny / nLen : 1;
      const side = (j % 2 === 0) ? 1 : -1;
      stitches.push([
        baseX + nnx * baseHalfWidth * side,
        baseY + nny * baseHalfWidth * side
      ]);
    }
  }
  return stitches;
}

function generateRunContour(polygon, spacing, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / spacing));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

function generateTatamiFill(polygon, density = 0.4, stitchLength = 2.5, angleDeg = 45, areaMm2 = 0) {
  if (!polygon || polygon.length < 3) return [];
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  area = Math.abs(area) / 2;
  
  const adaptiveDensity = area > 200 
    ? density * 1.5
    : area > 50 
      ? density * 1.2
      : density;
  
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotate = (p) => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos];
  const unrotate = (p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
  const rotatedPolygon = polygon.map(rotate);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rotatedPolygon) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const stitches = [];
  const offsets = [0, 0.25, 0.5, 0.75];
  let rowIndex = 0;
  for (let y = minY; y <= maxY; y += adaptiveDensity) {
    const intersections = [];
    for (let i = 0; i < rotatedPolygon.length; i++) {
      const p1 = rotatedPolygon[i], p2 = rotatedPolygon[(i + 1) % rotatedPolygon.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y - p1[1]) / (p2[1] - p1[1]);
        intersections.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    intersections.sort((a, b) => a - b);
    const filtered = [];
    for (let i = 0; i < intersections.length; i++) {
      if (i === 0 || Math.abs(intersections[i] - intersections[i-1]) > 0.5) {
        filtered.push(intersections[i]);
      }
    }
    const offset = offsets[rowIndex % 4] * stitchLength;
    const reverse = (rowIndex % 2 === 1);
    for (let i = 0; i < filtered.length - 1; i += 2) {
      let xStart = filtered[i] + offset, xEnd = filtered[i + 1];
      if (xStart >= xEnd) continue;
      const segmentLength = xEnd - xStart;
      const numStitches = Math.max(1, Math.floor(segmentLength / stitchLength));
      if (segmentLength < stitchLength * 0.5) continue;
      if (reverse) {
        for (let j = numStitches; j >= 0; j--) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      } else {
        for (let j = 0; j <= numStitches; j++) {
          const x = Math.min(xStart + j * stitchLength, xEnd);
          stitches.push(unrotate([x, y]));
        }
      }
    }
    rowIndex++;
  }
  return stitches;
}

function generateSatinStitches(polygon, density = 0.3, mmPerPx) {
  const stitches = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.floor(len / density));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      stitches.push([p1[0] + dx * t, p1[1] + dy * t]);
    }
  }
  return stitches;
}

function gaussianBlur(gray, W, H) {
  const kernel = [1,4,6,4,1, 4,16,24,16,4, 6,24,36,24,6, 4,16,24,16,4, 1,4,6,4,1];
  const ksum = 256;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const ny = Math.max(0, Math.min(H-1, y+ky));
          const nx = Math.max(0, Math.min(W-1, x+kx));
          v += gray[ny*W+nx] * kernel[(ky+2)*5+(kx+2)];
        }
      }
      out[y*W+x] = v / ksum;
    }
  }
  return out;
}

function sobelGradientsSimple(gray, W, H) {
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const g = (r,c) => gray[r*W+c];
      const sx = -g(y-1,x-1) + g(y-1,x+1) - 2*g(y,x-1) + 2*g(y,x+1) - g(y+1,x-1) + g(y+1,x+1);
      const sy = -g(y-1,x-1) - 2*g(y-1,x) - g(y-1,x+1) + g(y+1,x-1) + 2*g(y+1,x) + g(y+1,x+1);
      mag[y*W+x] = Math.sqrt(sx*sx+sy*sy);
    }
  }
  return { mag };
}

function rgbToHex([r,g,b]) {
  return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

function computeOptimalFillAngle(mask, W, H) {
  const pixels = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) pixels.push({ x: i % W, y: Math.floor(i / W) });
  }
  if (pixels.length < 2) return 45;
  let cx = 0, cy = 0;
  for (const p of pixels) { cx += p.x; cy += p.y; }
  cx /= pixels.length; cy /= pixels.length;
  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (const p of pixels) {
    const dx = p.x - cx, dy = p.y - cy;
    mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  let fillAngle = (theta * 180 / Math.PI) + 90;
  fillAngle = fillAngle % 180;
  if (fillAngle < 0) fillAngle += 180;
  return Math.round(fillAngle / 15) * 15;
}

function rgbToLab(r, g, b) {
  let rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;
  let x = (rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375) / 0.95047;
  let y = (rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750) / 1.00000;
  let z = (rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041) / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
}

function distSqLab(a, b) {
  const dL = (a[0]-b[0]) * 1.5;
  const da = a[1]-b[1];
  const db = a[2]-b[2];
  return dL*dL + da*da + db*db;
}

function nearestIdxLab(lab, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distSqLab(lab, palette[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function deltaE2000(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL*dL + da*da + db*db);
}
