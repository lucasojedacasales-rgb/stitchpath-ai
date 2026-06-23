import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Parsear FormData con imagen
    const formData = await req.formData();
    const file = formData.get('file');
    const format = formData.get('format') || 'dst';

    if (!file || !file.stream) {
      return Response.json({ error: 'file requerido' }, { status: 400 });
    }

    // Validar formato soportado
    if (!['dst', 'pes'].includes(format.toLowerCase())) {
      return Response.json({ error: 'Formato no soportado: dst o pes' }, { status: 400 });
    }

    // Subir imagen a Base44
    const uploadedImage = await base44.asServiceRole.integrations.Core.UploadFile({
      file: file
    });

    // Llamar al pipeline de vectorización existente
    const vectorizationRes = await base44.functions.invoke('hybridDigitize', {
      image_url: uploadedImage.file_url,
      mode: 'standard',
      width_mm: 100,
      height_mm: 100,
      color_count: 15
    });

    if (!vectorizationRes.data?.success) {
      return Response.json({ error: 'Vectorización falló' }, { status: 500 });
    }

    // Validar y filtrar regiones
    let regions = (vectorizationRes.data.data?.regions || []).filter(r => {
      if (!r.path_points || r.path_points.length < 3) return false;
      if (r.area_mm2 !== undefined && r.area_mm2 < 0.5) return false;
      return true;
    });

    if (regions.length === 0) {
      return Response.json({ error: 'No se generaron regiones válidas' }, { status: 400 });
    }
    const designRes = await base44.functions.invoke('generateEmbroideryFile', {
      regions,
      format: format.toLowerCase(),
      width_mm: 100,
      height_mm: 100
    });

    if (!designRes.data?.file_url) {
      return Response.json({ error: 'Generación de archivo falló' }, { status: 500 });
    }

    // Retornar URL del archivo descargable
    return Response.json({
      success: true,
      file_url: designRes.data.file_url,
      format: format.toLowerCase(),
      regions_count: regions.length,
      total_stitches: regions.reduce((s, r) => s + (r.stitch_count || 0), 0)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});