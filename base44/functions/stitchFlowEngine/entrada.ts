// ============================================
// STITCHFLOW ENGINE - Base44 Function
// Genera puntadas realistas para cada región
// ============================================

interface Point {
  x: number;
  y: number;
}

interface Stitch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'fill' | 'satin' | 'running' | 'underlay';
  color: string;
  width: number;
}

interface StitchResult {
  fill: Stitch[];
  underlay: Stitch[];
  totalStitches: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface RegionInput {
  id: string;
  color: string;
  stitchType: 'fill' | 'satin' | 'running_stitch';
  polygon?: Point[];
  path?: Point[];
  angle?: number;
  density?: number;
  stitchWidth?: number;
  stitchLength?: number;
  underlay?: boolean;
  underlayDensity?: number;
  underlayAngle?: number;
}

class StitchFlowEngine {
  private defaults = {
    stitchLength: 2.5,
    stitchWidth: 0.7,
    density: 0.4,
    angle: 0,
    underlay: true,
    underlayDensity: 0.8,
    underlayAngle: 45,
    pullCompensation: 0.1
  };

  generateFillStitch(polygon: Point[], options: Partial<typeof this.defaults> & { color: string }): StitchResult {
    const opts = { ...this.defaults, ...options };
    const { angle, density, underlay, underlayDensity } = opts;
    
    const bounds = this.getBounds(polygon);
    const rotated = this.rotatePolygon(polygon, -angle);
    const rotatedBounds = this.getBounds(rotated);
    
    const stitches: Stitch[] = [];
    const underlayStitches: Stitch[] = [];
    
    // Underlay
    if (underlay) {
      const uy1 = rotatedBounds.minY - 5;
      const uy2 = rotatedBounds.maxY + 5;
      const uStep = underlayDensity;
      
      for (let y = uy1; y <= uy2; y += uStep) {
        const intersections = this.getIntersections(rotated, y);
        for (let i = 0; i < intersections.length; i += 2) {
          if (intersections[i+1] !== undefined) {
            underlayStitches.push({
              x1: intersections[i], y1: y,
              x2: intersections[i+1], y2: y,
              type: 'underlay',
              color: opts.color,
              width: 0.3
            });
          }
        }
      }
    }
    
    // Fill principal (zigzag)
    const y1 = rotatedBounds.minY - 5;
    const y2 = rotatedBounds.maxY + 5;
    const step = density;
    let direction = 1;
    
    for (let y = y1; y <= y2; y += step) {
      const intersections = this.getIntersections(rotated, y);
      
      for (let i = 0; i < intersections.length; i += 2) {
        if (intersections[i+1] !== undefined) {
          const offset = (direction * opts.stitchWidth / 2);
          stitches.push({
            x1: intersections[i] + offset, y1: y,
            x2: intersections[i+1] - offset, y2: y,
            type: 'fill',
            color: opts.color,
            width: opts.stitchWidth
          });
        }
      }
      direction *= -1;
    }
    
    // Rotar de vuelta
    const finalStitches = stitches.map(s => {
      const p1 = this.rotatePoint(s.x1, s.y1, angle);
      const p2 = this.rotatePoint(s.x2, s.y2, angle);
      return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
    
    const finalUnderlay = underlayStitches.map(s => {
      const p1 = this.rotatePoint(s.x1, s.y1, angle);
      const p2 = this.rotatePoint(s.x2, s.y2, angle);
      return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    });
    
    return {
      fill: finalStitches,
      underlay: finalUnderlay,
      totalStitches: finalStitches.length + finalUnderlay.length,
      bounds
    };
  }

  generateSatinStitch(path: Point[], options: Partial<typeof this.defaults> & { color: string }): StitchResult {
    const opts = { ...this.defaults, ...options };
    const { stitchWidth } = opts;
    
    const stitches: Stitch[] = [];
    const underlayStitches: Stitch[] = [];
    
    if (path.length < 2) {
      return { fill: [], underlay: [], totalStitches: 0, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    }
    
    const leftOffset = this.offsetPath(path, stitchWidth / 2);
    const rightOffset = this.offsetPath(path, -stitchWidth / 2);
    const underlayLeft = this.offsetPath(path, stitchWidth / 4);
    const underlayRight = this.offsetPath(path, -stitchWidth / 4);
    
    for (let i = 0; i < path.length - 1; i++) {
      underlayStitches.push({
        x1: underlayLeft[i].x, y1: underlayLeft[i].y,
        x2: underlayRight[i].x, y2: underlayRight[i].y,
        type: 'underlay',
        color: opts.color,
        width: 0.3
      });
      
      stitches.push({
        x1: leftOffset[i].x, y1: leftOffset[i].y,
        x2: rightOffset[i].x, y2: rightOffset[i].y,
        type: 'satin',
        color: opts.color,
        width: stitchWidth
      });
    }
    
    return {
      fill: stitches,
      underlay: underlayStitches,
      totalStitches: stitches.length + underlayStitches.length,
      bounds: this.getBounds([...leftOffset, ...rightOffset])
    };
  }

  generateRunningStitch(path: Point[], options: Partial<typeof this.defaults> & { color: string }): StitchResult {
    const opts = { ...this.defaults, ...options };
    const { stitchLength } = opts;
    
    const stitches: Stitch[] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i+1];
      const dist = this.distance(p1, p2);
      const steps = Math.max(1, Math.ceil(dist / stitchLength));
      
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        stitches.push({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
          type: 'running',
          color: opts.color,
          width: opts.stitchWidth
        } as Stitch);
      }
    }
    
    return {
      fill: stitches,
      underlay: [],
      totalStitches: stitches.length,
      bounds: this.getBounds(path)
    };
  }

  processRegion(region: RegionInput): StitchResult {
    const options = {
      color: region.color,
      angle: region.angle || 0,
      density: region.density || 0.4,
      stitchWidth: region.stitchWidth || 0.7,
      stitchLength: region.stitchLength || 2.5,
      underlay: region.underlay !== false,
      underlayDensity: region.underlayDensity || 0.8,
      underlayAngle: region.underlayAngle || 45
    };

    switch (region.stitchType) {
      case 'fill':
        return this.generateFillStitch(region.polygon || [], options);
      case 'satin':
        return this.generateSatinStitch(region.path || region.polygon || [], options);
      case 'running_stitch':
        return this.generateRunningStitch(region.path || region.polygon || [], options);
      default:
        return this.generateFillStitch(region.polygon || [], options);
    }
  }

  // Utilidades matemáticas
  private getBounds(points: Point[]) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };
  }

  private rotatePolygon(polygon: Point[], angleDeg: number): Point[] {
    return polygon.map(p => this.rotatePoint(p.x, p.y, angleDeg));
  }

  private rotatePoint(x: number, y: number, angleDeg: number): Point {
    const angle = angleDeg * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  private getIntersections(polygon: Point[], y: number): number[] {
    const intersections: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const p1 = polygon[i];
      const p2 = polygon[j];
      
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const t = (y - p1.y) / (p2.y - p1.y);
        intersections.push(p1.x + t * (p2.x - p1.x));
      }
    }
    return intersections.sort((a, b) => a - b);
  }

  private distance(p1: Point, p2: Point): number {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }

  private offsetPath(path: Point[], offset: number): Point[] {
    return path.map((p, i) => {
      const next = path[Math.min(i + 1, path.length - 1)];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      return { x: p.x + nx * offset, y: p.y + ny * offset };
    });
  }
}

// Export para Base44
export default async function (request: any) {
  const { regions } = request.body;
  
  if (!regions || !Array.isArray(regions)) {
    return { status: 400, body: { error: 'Se requieren regiones' } };
  }

  const engine = new StitchFlowEngine();
  
  const results = regions.map((region: RegionInput) => {
    try {
      const stitches = engine.processRegion(region);
      return {
        id: region.id,
        ...stitches,
        stitchType: region.stitchType
      };
    } catch (e) {
      return {
        id: region.id,
        error: (e as Error).message,
        fill: [],
        underlay: [],
        totalStitches: 0,
        bounds: null
      };
    }
  });

  return {
    status: 200,
    body: {
      regions: results,
      totalStitches: results.reduce((sum: number, r: any) => sum + (r.totalStitches || 0), 0),
      totalRegions: results.length
    }
  };
}
