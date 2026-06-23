import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const projectId = url.searchParams.get('project_id');

    if (!projectId) {
      return Response.json({ error: 'project_id requerido' }, { status: 400 });
    }

    // Obtener proyecto con regiones
    const project = await base44.entities.Project.get(projectId);
    if (!project) {
      return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    // Validar pertenencia
    if (project.created_by_id !== user.id) {
      return Response.json({ error: 'No tienes acceso' }, { status: 403 });
    }

    const regions = project.regions || [];
    const w = project.width_mm || 100;
    const h = project.height_mm || 100;

    // Generar SVG
    const svg = generateSvgFromRegions(regions, w, h);

    return Response.json({
      success: true,
      svg,
      regions_count: regions.length,
      dimensions: { width_mm: w, height_mm: h }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateSvgFromRegions(regions, widthMm, heightMm) {
  // Convertir mm a pixels (96 DPI)
  const dpi = 96;
  const mmToPx = dpi / 25.4;
  const viewW = widthMm * mmToPx;
  const viewH = heightMm * mmToPx;

  let svgContent = `<svg viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}" xmlns="http://www.w3.org/2000/svg">`;

  // Fondo
  svgContent += `<rect width="${viewW}" height="${viewH}" fill="#ffffff"/>`;

  // Renderizar regiones
  for (const region of regions) {
    if (!region.path_points || region.path_points.length < 3) continue;

    const color = region.color || '#000000';
    const points = region.path_points;

    // Construir path SVG
    let pathData = `M ${points[0][0] * viewW} ${points[0][1] * viewH}`;
    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i][0] * viewW} ${points[i][1] * viewH}`;
    }
    pathData += ' Z';

    // Estilos según tipo de puntada
    const strokeWidth = region.stitch_type === 'running_stitch' ? 0.5 : 0.2;
    const opacity = region.stitch_type === 'fill' ? 0.7 : 0.5;

    svgContent += `<path d="${pathData}" fill="${color}" opacity="${opacity}" stroke="#333" stroke-width="${strokeWidth}"/>`;
  }

  svgContent += '</svg>';
  return svgContent;
}