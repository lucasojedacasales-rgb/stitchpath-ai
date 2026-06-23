import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { stitchPaths, renderParams = {} } = await req.json();
    if (!stitchPaths || !Array.isArray(stitchPaths)) {
      return Response.json({ error: 'stitchPaths array required' }, { status: 400 });
    }

    const startMs = Date.now();

    const {
      width = 800,
      height = 800,
      fabricTexture = 'cotton',
      threadThickness = 0.3,
      lighting = 'studio',
      showBackside = false,
    } = renderParams;

    const W = Math.min(width, 1200);
    const H = Math.min(height, 1200);

    // ── Compute bounding box of all stitch points ─────────────────────────────
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const path of stitchPaths) {
      for (const [x, y] of path.points || []) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX)) { minX = -50; maxX = 50; minY = -50; maxY = 50; }
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const padding = 0.1;
    const scale = Math.min(W, H) * (1 - padding * 2) / Math.max(rangeX, rangeY);
    const offX = W / 2 - ((minX + maxX) / 2) * scale;
    const offY = H / 2 - ((minY + maxY) / 2) * scale;
    const toCanvas = ([x, y]) => [x * scale + offX, y * scale + offY];

    // ── Build SVG (rendered as PNG via sharp) ─────────────────────────────────
    // SVG supports all required visual effects natively without WebGL/canvas
    const threadPx = Math.max(0.5, threadThickness * scale * 0.01);

    // Fabric background color per texture
    const fabricColors = {
      cotton: '#f5f0e8',
      denim:  '#3a5276',
      satin:  '#e8e0d0',
      terry:  '#d4cfc8',
    };
    const fabricBg = fabricColors[fabricTexture] || '#f5f0e8';

    // Lighting parameters
    const lightingConfigs = {
      studio:   { ambient: 0.7, diffuse: 0.8, specular: 0.4, shadowBlur: 2 },
      flat:     { ambient: 1.0, diffuse: 0.2, specular: 0.0, shadowBlur: 0 },
      dramatic: { ambient: 0.3, diffuse: 1.2, specular: 0.9, shadowBlur: 4 },
    };
    const lc = lightingConfigs[lighting] || lightingConfigs.studio;

    // Pre-collect SVG paths per color group for layering
    const colorGroups = {};
    for (const path of stitchPaths) {
      const color = path.color || '#ffffff';
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(path);
    }

    // Build SVG defs: filters per texture + thread gradient
    const rng = lcg(42); // deterministic pseudo-random

    const svgDefs = buildDefs(fabricTexture, lc, threadPx, rng);

    // Build SVG stitch elements
    let stitchSvg = '';
    for (const path of stitchPaths) {
      const color = path.color || '#ffffff';
      const pts = path.points || [];
      if (pts.length < 2) continue;

      const isBackside = showBackside;
      const opacity = isBackside ? 0.4 : 1.0;

      // Build polyline segments with per-segment lighting gradient
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = toCanvas(pts[i]);
        const [x1, y1] = toCanvas(pts[i + 1]);
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 0.3) continue;

        // Fuzz: small random offset per stitch
        const fuzz = (rng() - 0.5) * threadPx * 0.3;
        const nx = -dy / len, ny = dx / len; // normal

        const fx0 = x0 + nx * fuzz, fy0 = y0 + ny * fuzz;
        const fx1 = x1 + nx * fuzz, fy1 = y1 + ny * fuzz;

        // Lighting: angle to "light source" at top-left (studio) or top (dramatic)
        const lightAngle = lighting === 'dramatic' ? Math.PI / 4 : Math.PI / 6;
        const cosA = Math.cos(lightAngle), sinA = Math.sin(lightAngle);
        const dotLight = (dx / len) * cosA + (dy / len) * sinA;
        const brightness = Math.max(0.4, Math.min(1.0, lc.ambient + lc.diffuse * Math.abs(dotLight)));

        // Specular highlight for satin fabric
        let specular = 0;
        if (fabricTexture === 'satin') {
          specular = Math.pow(Math.max(0, dotLight), 8) * lc.specular;
        }

        const threadColor = adjustBrightness(color, brightness + specular);
        const shadowColor = adjustBrightness(color, brightness * 0.4);

        // Shadow line (offset down-right slightly)
        if (lc.shadowBlur > 0) {
          stitchSvg += `<line x1="${(fx0 + 1).toFixed(1)}" y1="${(fy0 + 1).toFixed(1)}" x2="${(fx1 + 1).toFixed(1)}" y2="${(fy1 + 1).toFixed(1)}" stroke="${shadowColor}" stroke-width="${(threadPx * 1.4).toFixed(2)}" stroke-opacity="${(opacity * 0.3).toFixed(2)}" stroke-linecap="round"/>`;
        }

        // Main thread line
        const strokeW = fabricTexture === 'terry' ? threadPx * 1.4 : threadPx;
        stitchSvg += `<line x1="${fx0.toFixed(1)}" y1="${fy0.toFixed(1)}" x2="${fx1.toFixed(1)}" y2="${fy1.toFixed(1)}" stroke="${threadColor}" stroke-width="${strokeW.toFixed(2)}" stroke-opacity="${opacity.toFixed(2)}" stroke-linecap="round"`;

        // Texture-specific effects
        if (fabricTexture === 'satin') {
          stitchSvg += ` filter="url(#satin-gloss)"`;
        } else if (fabricTexture === 'terry') {
          stitchSvg += ` filter="url(#terry-blur)"`;
        }
        stitchSvg += '/>';

        // Center highlight (simulates thread roundness)
        const highlightColor = adjustBrightness(color, Math.min(1.0, brightness * 1.4 + specular));
        stitchSvg += `<line x1="${fx0.toFixed(1)}" y1="${fy0.toFixed(1)}" x2="${fx1.toFixed(1)}" y2="${fy1.toFixed(1)}" stroke="${highlightColor}" stroke-width="${(strokeW * 0.35).toFixed(2)}" stroke-opacity="${(opacity * 0.6).toFixed(2)}" stroke-linecap="round"/>`;
      }

      // Loose thread at end of color (color changes)
      if (path.jumps > 0 && pts.length > 2) {
        const lastPt = toCanvas(pts[pts.length - 1]);
        const prevPt = toCanvas(pts[pts.length - 2]);
        const dx = lastPt[0] - prevPt[0], dy = lastPt[1] - prevPt[1];
        const len = Math.hypot(dx, dy) || 1;
        const tailLen = threadPx * 6;
        const tx = lastPt[0] + (dx / len) * tailLen + (rng() - 0.5) * tailLen;
        const ty = lastPt[1] + (dy / len) * tailLen + (rng() - 0.5) * tailLen;
        stitchSvg += `<line x1="${lastPt[0].toFixed(1)}" y1="${lastPt[1].toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${color}" stroke-width="${(threadPx * 0.6).toFixed(2)}" stroke-opacity="0.5" stroke-linecap="round"/>`;
      }
    }

    // Cotton fabric puckering: subtle displacement filter around dense stitch areas
    const cottonEffect = fabricTexture === 'cotton' ? `filter="url(#cotton-pucker)"` : '';

    // Vignette overlay
    const vignette = `<radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="70%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#vignette)" pointer-events="none"/>`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${svgDefs}
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="70%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>
    </radialGradient>
  </defs>

  <!-- Fabric base -->
  <rect width="${W}" height="${H}" fill="${fabricBg}"/>
  <rect width="${W}" height="${H}" fill="url(#fabric-noise)" opacity="0.18"/>

  <!-- Stitches -->
  <g ${cottonEffect}>
    ${stitchSvg}
  </g>

  <!-- Vignette -->
  <rect width="${W}" height="${H}" fill="url(#vignette)" pointer-events="none"/>
</svg>`;

    // ── Return SVG as base64 data URI (browsers render SVG natively) ─────────
    const base64 = btoa(unescape(encodeURIComponent(svg)));

    return Response.json({
      imageBase64: `data:image/svg+xml;base64,${base64}`,
      renderingTimeMs: Date.now() - startMs,
      dimensions: { width: W, height: H },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── SVG Defs builder ──────────────────────────────────────────────────────────

function buildDefs(fabricTexture, lc, threadPx, rng) {
  // Fabric noise texture via feTurbulence
  const noiseFreq = fabricTexture === 'denim' ? '0.04 0.02' :
                    fabricTexture === 'terry'  ? '0.08 0.08' : '0.06 0.06';

  let defs = `
  <filter id="fabric-noise-filter" x="0%" y="0%" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${noiseFreq}" numOctaves="4" seed="7" result="noise"/>
    <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
    <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply"/>
  </filter>
  <pattern id="fabric-noise" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
    <rect width="200" height="200" fill="white"/>
    <rect width="200" height="200" filter="url(#fabric-noise-filter)" fill="rgba(0,0,0,0.1)"/>
  </pattern>`;

  if (fabricTexture === 'satin') {
    defs += `
  <filter id="satin-gloss">
    <feGaussianBlur stdDeviation="0.3" result="blur"/>
    <feSpecularLighting in="blur" surfaceScale="2" specularConstant="0.8" specularExponent="20" result="specular" lighting-color="white">
      <fePointLight x="200" y="100" z="200"/>
    </feSpecularLighting>
    <feComposite in="SourceGraphic" in2="specular" operator="arithmetic" k1="0" k2="1" k3="0.4" k4="0"/>
  </filter>`;
  }

  if (fabricTexture === 'terry') {
    defs += `
  <filter id="terry-blur">
    <feTurbulence type="turbulence" baseFrequency="0.9" numOctaves="2" seed="3" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${threadPx * 0.8}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
  }

  if (fabricTexture === 'cotton') {
    defs += `
  <filter id="cotton-pucker">
    <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="12" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${threadPx * 0.5}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
  }

  if (lc.shadowBlur > 0) {
    defs += `
  <filter id="shadow-blur">
    <feGaussianBlur stdDeviation="${lc.shadowBlur}"/>
  </filter>`;
  }

  return defs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function adjustBrightness(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${clamp(r).toString(16).padStart(2,'0')}${clamp(g).toString(16).padStart(2,'0')}${clamp(b).toString(16).padStart(2,'0')}`;
}

// Simple LCG pseudo-random (deterministic, no Math.random for reproducibility)
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}