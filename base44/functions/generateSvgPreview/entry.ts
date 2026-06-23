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
  const dpi = 96;
  const mmToPx = dpi / 25.4;
  const viewW = widthMm * mmToPx;
  const viewH = heightMm * mmToPx;

  let svgContent = `<svg viewBox="0 0 ${viewW} ${viewH}" width="${viewW}" height="${viewH}" xmlns="http://www.w3.org/2000/svg">`;
  svgContent += `<defs><style>.stitch-fill{opacity:0.7}.stitch-satin{opacity:0.6}.stitch-run{opacity:0.5}</style></defs>`;
  svgContent += `<rect width="${viewW}" height="${viewH}" fill="#ffffff"/>`;

  for (const region of regions) {
    if (!region.path_points || region.path_points.length < 3) continue;

    const color = region.color || '#000000';
    const points = region.path_points;
    const type = region.stitch_type || 'fill';

    // Path del contorno
    let pathData = `M ${points[0][0] * viewW} ${points[0][1] * viewH}`;
    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i][0] * viewW} ${points[i][1] * viewH}`;
    }
    pathData += ' Z';

    // Estilos por tipo de puntada
    const styleMap = {
      'fill': { class: 'stitch-fill', strokeWidth: 0.2 },
      'satin': { class: 'stitch-satin', strokeWidth: 0.4, strokeDash: '2,1' },
      'running_stitch': { class: 'stitch-run', strokeWidth: 0.6, strokeDash: '1.5,1' }
    };
    const style = styleMap[type] || styleMap['fill'];

    svgContent += `<path d="${pathData}" fill="${color}" class="${style.class}" stroke="#333" stroke-width="${style.strokeWidth}"${style.strokeDash ? ` stroke-dasharray="${style.strokeDash}"` : ''}/>`;
  }

  svgContent += '</svg>';
  return svgContent;
}