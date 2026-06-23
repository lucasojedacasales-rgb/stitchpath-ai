import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { regions, format, width_mm, height_mm, machine_name, speed_rpm, cuts, project_name } = await req.json();

    if (!regions || !format) return Response.json({ error: 'regions and format required' }, { status: 400 });

    // Generate stitch data from regions
    const stitchData = generateStitchData(regions, width_mm || 100, height_mm || 100);

    let fileBuffer;
    let mimeType = 'application/octet-stream';
    let fileName = `${project_name || 'design'}.${format.toLowerCase()}`;

    switch (format.toUpperCase()) {
      case 'DST':
        fileBuffer = generateDST(stitchData, width_mm, height_mm, machine_name, speed_rpm);
        break;
      case 'PES':
        fileBuffer = generatePES(stitchData, width_mm, height_mm, machine_name, regions);
        break;
      case 'JEF':
        fileBuffer = generateJEF(stitchData, width_mm, height_mm, machine_name, regions);
        break;
      case 'DSB':
        fileBuffer = generateDSB(stitchData, width_mm, height_mm, machine_name);
        break;
      default:
        fileBuffer = generateDST(stitchData, width_mm, height_mm, machine_name, speed_rpm);
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    return Response.json({
      success: true,
      file_base64: base64,
      file_name: fileName,
      format: format.toUpperCase(),
      stitch_count: stitchData.length,
      metadata: {
        machine: machine_name || 'Generic',
        speed_rpm: speed_rpm || 800,
        cuts: cuts || 0
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateStitchData(regions, width_mm, height_mm) {
  const stitches = [];
  const scale = 10; // 10 units per mm (0.1mm resolution)

  for (const region of regions) {
    if (!region.visible) continue;
    const points = region.path_points || generateDefaultPoints(region);
    const color = hexToRgb(region.color || '#000000');
    
    stitches.push({ type: 'color_change', color });

    for (let i = 0; i < points.length; i++) {
      const [nx, ny] = points[i];
      const x = Math.round(nx * width_mm * scale);
      const y = Math.round(ny * height_mm * scale);
      stitches.push({ type: 'stitch', x, y });
    }

    if (region.stitch_type === 'fill') {
      const extra = generateFillStitches(points, region.density || 0.8, region.angle || 45, width_mm, height_mm, scale);
      stitches.push(...extra);
    }
  }

  stitches.push({ type: 'end' });
  return stitches;
}

function generateDefaultPoints(region) {
  const cx = 0.5, cy = 0.5, r = 0.3;
  return Array.from({ length: 12 }, (_, i) => [
    cx + r * Math.cos(i * Math.PI / 6),
    cy + r * Math.sin(i * Math.PI / 6)
  ]);
}

function generateFillStitches(points, density, angle, width_mm, height_mm, scale) {
  const stitches = [];
  const rad = (angle * Math.PI) / 180;
  const spacing = 1 / (density * 3);
  
  for (let t = 0; t < 1; t += spacing) {
    const x = Math.round((0.2 + t * 0.6) * width_mm * scale);
    const y = Math.round((0.3 + Math.sin(t * Math.PI) * 0.4) * height_mm * scale);
    stitches.push({ type: 'stitch', x, y });
  }
  return stitches;
}

function generateDST(stitches, width_mm, height_mm, machine, speed) {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  
  const headerStr = `LA:${machine || 'StitchFlow'}   \rST:${stitches.filter(s=>s.type==='stitch').length}   \rCO:${stitches.filter(s=>s.type==='color_change').length}   \r+X:${Math.round((width_mm||100)*10)}   \r-X:0   \r+Y:${Math.round((height_mm||100)*10)}   \r-Y:0   \rAX:+0   \rAY:+0   \rMX:+0   \rMY:+0   \rPD:******   \r\x1a`.padEnd(512, ' ');
  
  const headerBytes = enc.encode(headerStr.slice(0, 512));
  header.set(headerBytes.slice(0, 512));

  const dataBytes = [];
  let cx = 0, cy = 0;

  for (const s of stitches) {
    if (s.type === 'stitch') {
      const dx = Math.max(-121, Math.min(121, s.x - cx));
      const dy = Math.max(-121, Math.min(121, s.y - cy));
      cx = s.x; cy = s.y;
      const [b1, b2, b3] = encodeDSTStitch(dx, dy, 0);
      dataBytes.push(b1, b2, b3);
    } else if (s.type === 'color_change') {
      dataBytes.push(0xC3, 0xC3, 0xC3);
    } else if (s.type === 'end') {
      dataBytes.push(0xF3, 0xF3, 0xF3);
    }
  }

  const result = new Uint8Array(512 + dataBytes.length);
  result.set(header);
  result.set(new Uint8Array(dataBytes), 512);
  return result.buffer;
}

function encodeDSTStitch(dx, dy, flag) {
  let b1 = 0, b2 = 0, b3 = flag;
  
  if (dx > 40)  { b3 |= 0x04; dx -= 81; }
  if (dx > 0)   { b3 |= 0x01; }
  if (dx < -40) { b3 |= 0x08; dx += 81; }
  if (dx < 0)   { b3 |= 0x02; dx += 1; }
  
  if (dy > 40)  { b3 |= 0x20; dy -= 81; }
  if (dy > 0)   { b3 |= 0x10; }
  if (dy < -40) { b3 |= 0x40; dy += 81; }
  if (dy < 0)   { b3 |= 0x80; dy += 1; }

  b1 |= (Math.abs(dx) & 0x0F);
  b2 |= (Math.abs(dy) & 0x0F);
  
  return [b1, b2, b3];
}

function generatePES(stitches, width_mm, height_mm, machine, regions) {
  const header = `#PES0001`;
  const enc = new TextEncoder();
  const data = enc.encode(header);
  const padding = new Uint8Array(1000 - data.length);
  const result = new Uint8Array(1000);
  result.set(data);
  result.set(padding, data.length);
  return result.buffer;
}

function generateJEF(stitches, width_mm, height_mm, machine, regions) {
  const result = new Uint8Array(1000);
  const enc = new TextEncoder();
  const header = enc.encode('JEF\x00' + (machine || 'StitchFlow').padEnd(16, '\x00'));
  result.set(header.slice(0, Math.min(header.length, 1000)));
  return result.buffer;
}

function generateDSB(stitches, width_mm, height_mm, machine) {
  const result = new Uint8Array(512);
  const enc = new TextEncoder();
  const header = enc.encode('DSB' + (machine || 'StitchFlow'));
  result.set(header.slice(0, Math.min(header.length, 512)));
  return result.buffer;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}