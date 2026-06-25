// ============================================================
// RENDER STITCH PREVIEW - CON MEJORAS DE CONTORNO
// ============================================================

interface StitchPoint {
  x: number;
  y: number;
}

interface Region {
  id: string;
  color: string;
  type: 'fill' | 'satin' | 'run' | 'border';
  path_points: number[][];
  stitches: number[][];
  contour_stitches: number[][];
  is_external_border: boolean;
  stitch_count: number;
}

interface DesignData {
  regions: Region[];
  metadata: any;
}

// ============================================================
// CONFIGURACIÓN VISUAL
// ============================================================

const CONFIG = {
  // Fondo
  backgroundColor: '#1a1a2e',
  gridColor: '#2a2a4e',
  
  // Contornos
  externalBorder: {
    color: '#ffffff',
    width: 3,
    shadowColor: 'rgba(255,255,255,0.3)',
    shadowBlur: 4,
    style: 'solid'
  },
  internalBorder: {
    color: '#666666',
    width: 1,
    dash: [4, 4],
    style: 'dashed'
  },
  
  // Rellenos
  tatami: {
    strokeWidth: 0.8,
    opacity: 0.9
  },
  
  // Satin
  satin: {
    strokeWidth: 1.5,
    opacity: 1.0
  },
  
  // Zoom y pan
  minZoom: 0.1,
  maxZoom: 10,
  zoomStep: 0.1
};

// ============================================================
// CLASE PRINCIPAL DEL RENDERER
// ============================================================

class StitchCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private designData: DesignData | null = null;
  private zoom: number = 1;
  private panX: number = 0;
  private panY: number = 0;
  private showFill: boolean = true;
  private showContours: boolean = true;
  private showExternalBorder: boolean = true;
  private selectedRegion: string | null = null;
  
  // Cache de renderizado
  private fillCache: Map<string, ImageData> = new Map();
  private contourCache: Map<string, ImageData> = new Map();
  
  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.setupEventListeners();
    this.resize();
  }
  
  // ============================================================
  // SETUP Y EVENTOS
  // ============================================================
  
  private setupEventListeners() {
    // Zoom con rueda del mouse
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -CONFIG.zoomStep : CONFIG.zoomStep;
      this.zoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, this.zoom + delta));
      this.render();
    });
    
    // Pan con drag
    let isDragging = false;
    let lastX = 0, lastY = 0;
    
    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    
    this.canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.panX += e.clientX - lastX;
      this.panY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.render();
    });
    
    this.canvas.addEventListener('mouseup', () => isDragging = false);
    this.canvas.addEventListener('mouseleave', () => isDragging = false);
  }
  
  private resize() {
    const parent = this.canvas.parentElement!;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }
  
  // ============================================================
  // CARGA DE DATOS
  // ============================================================
  
  public loadDesign(data: DesignData) {
    this.designData = data;
    this.fillCache.clear();
    this.contourCache.clear();
    this.autoFit();
    this.render();
  }
  
  public setVisibility(showFill: boolean, showContours: boolean, showExternal: boolean = true) {
    this.showFill = showFill;
    this.showContours = showContours;
    this.showExternalBorder = showExternal;
    this.render();
  }
  
  public selectRegion(regionId: string | null) {
    this.selectedRegion = regionId;
    this.render();
  }
  
  // ============================================================
  // AJUSTE AUTOMÁTICO DE VISTA
  // ============================================================
  
  private autoFit() {
    if (!this.designData || this.designData.regions.length === 0) return;
    
    // Calcular bounding box de todo el diseño
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const region of this.designData.regions) {
      for (const pt of region.path_points) {
        minX = Math.min(minX, pt[0]);
        maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]);
        maxY = Math.max(maxY, pt[1]);
      }
    }
    
    const designW = maxX - minX;
    const designH = maxY - minY;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    
    // Calcular zoom para que el diseño ocupe el 90% del canvas
    const zoomX = (canvasW * 0.9) / designW;
    const zoomY = (canvasH * 0.9) / designH;
    this.zoom = Math.min(zoomX, zoomY);
    
    // Centrar
    this.panX = canvasW / 2 - (minX + designW / 2) * this.zoom;
    this.panY = canvasH / 2 - (minY + designH / 2) * this.zoom;
  }
  
  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  
  public render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Limpiar fondo
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, w, h);
    
    // Dibujar grid
    this.drawGrid();
    
    if (!this.designData) return;
    
    ctx.save();
    
    // Aplicar transformación de zoom y pan
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);
    
    // 1. Dibujar rellenos (Tatami) - capa inferior
    if (this.showFill) {
      this.drawFills();
    }
    
    // 2. Dibujar contornos - capa superior
    if (this.showContours) {
      this.drawContours();
    }
    
    // 3. Dibujar borde externo del diseño - capa más alta
    if (this.showExternalBorder) {
      this.drawExternalBorder();
    }
    
    // 4. Dibujar puntadas seleccionadas (highlight)
    if (this.selectedRegion) {
      this.drawSelectedRegion();
    }
    
    ctx.restore();
    
    // Dibujar UI overlay (zoom, info)
    this.drawOverlay();
  }
  
  // ============================================================
  // DIBUJAR GRID
  // ============================================================
  
  private drawGrid() {
    const ctx = this.ctx;
    const gridSize = 10 * this.zoom; // 10mm grid
    
    ctx.strokeStyle = CONFIG.gridColor;
    ctx.lineWidth = 0.5;
    
    const offsetX = this.panX % gridSize;
    const offsetY = this.panY % gridSize;
    
    for (let x = offsetX; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    
    for (let y = offsetY; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }
  
  // ============================================================
  // DIBUJAR RELLENOS (TATAMI)
  // ============================================================
  
  private drawFills() {
    const ctx = this.ctx;
    
    for (const region of this.designData!.regions) {
      if (region.type !== 'fill') continue;
      
      // Si hay cache, usarlo
      const cacheKey = `${region.id}_${this.zoom}`;
      // Nota: En producción implementar cache real con offscreen canvas
      
      ctx.strokeStyle = region.color;
      ctx.lineWidth = CONFIG.tatami.strokeWidth / this.zoom; // Mantener grosor constante en pantalla
      ctx.globalAlpha = CONFIG.tatami.opacity;
      
      // Dibujar puntadas Tatami como líneas cortas
      this.drawStitchLines(region.stitches, region.color);
      
      ctx.globalAlpha = 1.0;
    }
  }
  
  // ============================================================
  // DIBUJAR CONTORNOS
  // ============================================================
  
  private drawContours() {
    const ctx = this.ctx;
    
    for (const region of this.designData!.regions) {
      // Saltar el borde externo especial (se dibuja aparte)
      if (region.id === 'design_border') continue;
      
      const isExternal = region.is_external_border;
      const style = isExternal ? CONFIG.externalBorder : CONFIG.internalBorder;
      
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width / this.zoom;
      ctx.setLineDash(style.style === 'dashed' ? style.dash : []);
      
      // Sombra para bordes externos
      if (isExternal) {
        ctx.shadowColor = (style as any).shadowColor;
        ctx.shadowBlur = (style as any).shadowBlur;
      }
      
      // Dibujar contorno como path
      if (region.path_points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(region.path_points[0][0], region.path_points[0][1]);
        
        for (let i = 1; i < region.path_points.length; i++) {
          ctx.lineTo(region.path_points[i][0], region.path_points[i][1]);
        }
        
        ctx.closePath();
        ctx.stroke();
      }
      
      // Resetear sombra
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      
      // Dibujar puntadas de contorno (satin o run)
      if (region.contour_stitches && region.contour_stitches.length > 0) {
        this.drawContourStitches(region.contour_stitches, region.color, isExternal);
      }
    }
  }
  
  // ============================================================
  // DIBUJAR BORDE EXTERNO DEL DISEÑO
  // ============================================================
  
  private drawExternalBorder() {
    const borderRegion = this.designData!.regions.find(r => r.id === 'design_border');
    if (!borderRegion) return;
    
    const ctx = this.ctx;
    const style = CONFIG.externalBorder;
    
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width / this.zoom;
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    
    if (borderRegion.path_points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(borderRegion.path_points[0][0], borderRegion.path_points[0][1]);
      
      for (let i = 1; i < borderRegion.path_points.length; i++) {
        ctx.lineTo(borderRegion.path_points[i][0], borderRegion.path_points[i][1]);
      }
      
      ctx.closePath();
      ctx.stroke();
    }
    
    // Resetear
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  
  // ============================================================
  // DIBUJAR PUNTADAS DE CONTORNO (SATIN/RUN)
  // ============================================================
  
  private drawContourStitches(stitches: number[][], color: string, isExternal: boolean) {
    const ctx = this.ctx;
    
    if (stitches.length < 2) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = isExternal ? 1.2 / this.zoom : 0.6 / this.zoom;
    ctx.globalAlpha = 0.8;
    
    // Para Satin: dibujar zigzag
    // Para Run: dibujar línea suave
    ctx.beginPath();
    ctx.moveTo(stitches[0][0], stitches[0][1]);
    
    for (let i = 1; i < stitches.length; i++) {
      ctx.lineTo(stitches[i][0], stitches[i][1]);
    }
    
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }
  
  // ============================================================
  // DIBUJAR LÍNEAS DE PUNTADAS (TATAMI)
  // ============================================================
  
  private drawStitchLines(stitches: number[][], color: string) {
    const ctx = this.ctx;
    
    if (stitches.length < 2) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5 / this.zoom; // Muy fino para puntadas individuales
    
    // Agrupar puntadas consecutivas en líneas
    ctx.beginPath();
    
    for (let i = 0; i < stitches.length - 1; i++) {
      const p1 = stitches[i];
      const p2 = stitches[i + 1];
      
      // Si la distancia es muy grande, es un jump stitch (no dibujar línea)
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      
      if (dist < 5) { // 5mm threshold para jump stitches
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
      }
    }
    
    ctx.stroke();
  }
  
  // ============================================================
  // REGIÓN SELECCIONADA (HIGHLIGHT)
  // ============================================================
  
  private drawSelectedRegion() {
    const region = this.designData!.regions.find(r => r.id === this.selectedRegion);
    if (!region) return;
    
    const ctx = this.ctx;
    
    // Dibujar bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const pt of region.path_points) {
      minX = Math.min(minX, pt[0]);
      maxX = Math.max(maxX, pt[0]);
      minY = Math.min(minY, pt[1]);
      maxY = Math.max(maxY, pt[1]);
    }
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([5, 5]);
    
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.setLineDash([]);
  }
  
  // ============================================================
  // OVERLAY DE UI
  // ============================================================
  
  private drawOverlay() {
    const ctx = this.ctx;
    
    // Info de zoom
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, 10, 120, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText(`Zoom: ${(this.zoom * 100).toFixed(0)}%`, 20, 30);
    
    // Conteo de puntadas
    if (this.designData) {
      const totalStitches = this.designData.regions.reduce((sum, r) => sum + r.stitch_count, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, 45, 180, 30);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Puntadas: ${totalStitches.toLocaleString()}`, 20, 65);
    }
  }
}

// ============================================================
// EXPORT PARA USO EN REACT/VUE
// ============================================================

export function createStitchRenderer(canvasId: string): StitchCanvasRenderer {
  return new StitchCanvasRenderer(canvasId);
}

// Hook para React
export function useStitchRenderer(canvasId: string) {
  const rendererRef = React.useRef<StitchCanvasRenderer | null>(null);
  
  React.useEffect(() => {
    rendererRef.current = new StitchCanvasRenderer(canvasId);
    
    return () => {
      // Cleanup si es necesario
    };
  }, [canvasId]);
  
  return rendererRef;
}

// ============================================================
// INICIALIZACIÓN (si se usa standalone)
// ============================================================

// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.StitchCanvasRenderer = StitchCanvasRenderer;
}
