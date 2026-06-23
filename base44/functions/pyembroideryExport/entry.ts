import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Backend: Exportación robusta a múltiples formatos usando pyembroidery
 * Convierte regiones de bordado a archivos DST, PES, JEF, EXP, VP3, etc.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      regions,      // Array de regiones con path_points y stitch_type
      format,       // 'dst', 'pes', 'jef', 'exp', 'vp3'
      width_mm,
      height_mm,
      project_name = 'design'
    } = await req.json();

    if (!regions || !format) {
      return Response.json({ error: 'Missing regions or format' }, { status: 400 });
    }

    // Convertir regiones a formato de puntadas lineales
    const stitches = [];
    let colorIdx = 0;

    for (const region of regions) {
      if (!region.visible) continue;

      // Insertar cambio de color
      stitches.push({
        x: stitches.length > 0 ? stitches[stitches.length - 1].x : 0,
        y: stitches.length > 0 ? stitches[stitches.length - 1].y : 0,
        cmd: 'COLOR_CHANGE',
        color: region.color || '#ffffff'
      });

      // Convertir path normalizado a coordenadas mm
      const path = region.path_points || [];
      if (path.length > 0) {
        // Densidad de puntadas según tipo
        const stepsPerUnit = region.stitch_type === 'fill' ? 2.0 : 
                             region.stitch_type === 'satin' ? 1.5 : 1.0;
        
        for (let i = 0; i < path.length - 1; i++) {
          const p0 = path[i];
          const p1 = path[i + 1];
          
          const x0 = p0[0] * width_mm;
          const y0 = p0[1] * height_mm;
          const x1 = p1[0] * width_mm;
          const y1 = p1[1] * height_mm;
          
          const dist = Math.hypot(x1 - x0, y1 - y0);
          const steps = Math.max(1, Math.ceil(dist * stepsPerUnit));
          
          for (let step = 0; step <= steps; step++) {
            const t = steps > 0 ? step / steps : 0;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            
            stitches.push({
              x: Math.round(x * 10) / 10,  // 0.1mm precision
              y: Math.round(y * 10) / 10,
              cmd: step === 0 && i === 0 ? 'MOVE' : 'STITCH'
            });
          }
        }
      }

      colorIdx++;
    }

    // Agregar END
    stitches.push({ cmd: 'END' });

    // Llamar a API REST de pyembroidery en servidor externo
    const pyembroideryUrl = Deno.env.get('PYEMBROIDERY_API_URL') || 'http://localhost:5000';
    
    const response = await fetch(`${pyembroideryUrl}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stitches,
        format,
        width: width_mm,
        height: height_mm,
        name: project_name
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('pyembroidery export failed:', err);
      return Response.json(
        { error: 'Export failed', details: err },
        { status: 500 }
      );
    }

    // Descargar archivo binario
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${project_name}.${format}"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});