import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download, Layers, AlignJustify } from 'lucide-react';
import { generateTatamiFill } from '@/lib/tatamiFill';

// ── Contour detection helpers ─────────────────────────────────────────────────

// Near-black / very dark colors are outlines in embroidery — detect by luminance,
// not exact hex match. #090406 (the merged outline+background blob) has L≈6.
function isContourColor(hex) {
  const h = (hex || '').toLowerCase();
  if (!h.startsWith('#') || h.length < 7) return false;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 30;
}

// A thin outline: narrow mean width, or low area-to-perimeter² ratio (ring/line).
// Used to classify contours by GEOMETRY, not color — solid dark fills (Mickey's
// head, Yoshi's body) are NOT thin, so they stay as fill and render correctly.
function isThinOutline(region) {
  if (region.mean_width_mm > 0 && region.mean_width_mm < 2.5) return true;
  if (region.area_mm2 && region.perimeter_mm) {
    return (region.area_mm2 / (region.perimeter_mm * region.perimeter_mm)) < 0.05;
  }
  return false;
}

function isContourRegion(region) {
  if (!region) return false;
  if ((region.name || '').toLowerCase().includes('contour_')) return true;
  // Thin shapes (narrow width or low area-to-perimeter²) are outlines.
  return isThinOutline(region);
}

function getDrawSize(imageEl, W, H) {
  if (!imageEl) return { drawW: W * 0.75, drawH: H * 0.75 };
  const iw = imageEl.width, ih = imageEl.height;
  const s = Math.min(W * 0.75 / iw, H * 0.75 / ih);
  return { drawW: iw * s, drawH: ih * s };
}

// ── Tatami fill renderer ──────────────────────────────────────────────────────
// Draws each stitch as a 2px oriented line using the tatamiFill engine.
// stitchCache: Map<regionId, {stitches, drawW, drawH, angle, density}>

function drawFillStitches(ctx, pts, region, drawW, drawH, zoom, alpha, stitchCache) {
  const color = region.color || '#ffffff';
  const angleDeg = region.angle || 0;
  const densityMm = region.tatami_density || region.density_mm || 0.4;

  // Cache key: recompute only if drawSize or region params change
  const cacheKey = region.id;
  let cached = stitchCache.get(cacheKey);
  if (!cached || cached.drawW !== drawW || cached.drawH !== drawH || cached.angleDeg !== angleDeg || cached.densityMm !== densityMm) {
    // Convert normalized path_points → canvas px
    const polygon = pts.map(p => [(p[0] - 0.5) * drawW, (p[1] - 0.5) * drawH]);
    // pxPerMm: drawW spans 100mm by default
    const pxPerMm = drawW / 100;
    const { stitches, totalStitches } = generateTatamiFill(polygon, densityMm, 2.5, angleDeg, pxPerMm);
    cached = { stitches, totalStitches, drawW, drawH, angleDeg, densityMm };
    stitchCache.set(cacheKey, cached);
    // Surface real stitch count back onto the region object for the panel
    region._computed_stitches = totalStitches;
  }

  const { stitches } = cached;
  if (!stitches.length) return;

  // Row spacing in design px — line width equals it so adjacent rows abut and the
  // fill reads as solid instead of a sparse wireframe of separate parallel lines.
  const pxPerMm = drawW / 100;
  const rowSpacingPx = Math.max(1.5, densityMm * pxPerMm);

  ctx.globalAlpha = alpha * 0.92;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, rowSpacingPx / zoom);
  ctx.lineCap = 'round';

  ctx.beginPath();
  for (const [x0, y0, x1, y1] of stitches) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StitchCanvas({
  imageUrl, regions, selectedRegionId, onRegionClick,
  imageOpacity, stitchOpacity, showFill, showContour
}) {
  const imgCanvasRef     = useRef(null);
  const stitchCanvasRef  = useRef(null);
  const overlayCanvasRef = useRef(null);
  const containerRef     = useRef(null);

  const [zoom, setZoom]               = useState(1);
  const [offset, setOffset]           = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]   = useState(false);
  const [dragStart, setDragStart]     = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [tooltip, setTooltip]         = useState(null);
  // Toggle: 'fill' = show full tatami fills | 'outline' = contours only
  const [viewMode, setViewMode]       = useState('fill');
  const imageRef     = useRef(null);
  // Cache: Map<regionId, {stitches, drawW, drawH, angleDeg, densityMm}>
  const stitchCache  = useRef(new Map());

  useEffect(() => {
    const obs = new ResizeObserver(() => resizeAll());
    if (containerRef.current) obs.observe(containerRef.current);
    resizeAll();
    return () => obs.disconnect();
  }, []);

  function resizeAll() {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;
    for (const ref of [imgCanvasRef, stitchCanvasRef, overlayCanvasRef]) {
      if (ref.current) { ref.current.width = W; ref.current.height = H; }
    }
    drawImageLayer();
    drawStitchLayer();
    drawOverlayLayer();
  }

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; drawImageLayer(); drawStitchLayer(); drawOverlayLayer(); };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => { drawImageLayer(); }, [zoom, offset, imageOpacity]);
  useEffect(() => { drawStitchLayer(); }, [regions, zoom, offset, stitchOpacity, showFill, showContour, viewMode]);
  useEffect(() => { drawOverlayLayer(); }, [selectedRegionId, hoveredRegion, zoom, offset, regions]);

  // ── LAYER 1: Image ──────────────────────────────────────────────────────────
  const drawImageLayer = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    // Dark grey background so any thread color is visible
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, W, H);

    if (!imageRef.current || imageOpacity <= 0) return;

    const { drawW, drawH } = getDrawSize(imageRef.current, W, H);
    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);
    ctx.globalAlpha = imageOpacity / 100;
    ctx.imageSmoothingEnabled = zoom < 4;
    ctx.drawImage(imageRef.current, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [zoom, offset, imageOpacity]);

  // ── LAYER 2: Stitches ───────────────────────────────────────────────────────
  const drawStitchLayer = useCallback(() => {
    const canvas = stitchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (!regions || regions.length === 0 || stitchOpacity <= 0) return;

    const { drawW, drawH } = getDrawSize(imageRef.current, W, H);

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);

    const outlineOnly = viewMode === 'outline';
    const alpha = stitchOpacity / 100;

    // Painter's algorithm: sort by area descending so the largest region (background)
    // is painted first and smaller detail regions are painted on top.
    // Without this, a large background region drawn later covers everything (black blob).
    // Fallback: compute area from path_points bbox if area_mm2 is missing (un-enriched regions).
    const sortKey = (r) => {
      if (r.area_mm2 && r.area_mm2 > 0) return r.area_mm2;
      if (r.path_points && r.path_points.length >= 3) {
        const xs = r.path_points.map(p => p[0]);
        const ys = r.path_points.map(p => p[1]);
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      }
      return 0;
    };
    const sortedRegions = [...regions]
      .filter(r => r.path_points && r.path_points.length >= 3)
      .sort((a, b) => sortKey(b) - sortKey(a));

    for (const region of sortedRegions) {
      if (!region.visible) continue;
      const pts = region.path_points;
      if (!pts || pts.length < 3) continue;

      // Stale stored regions: a solid dark fill may have been reclassified to
      // running_stitch by an older regionBuilder. Restore it to fill so it
      // renders as a solid area instead of empty dashes (missing details).
      // Trust the engine's stitch_type — the Adaptive Engine / regionBuilder already
      // reclassifies thin dark outlines to running_stitch at enrichment time, so the
      // renderer must NOT override an explicit fill/satin into a dashed outline
      // (that was turning every fill into a faint dashed skeleton).
      const isStaleDarkFill = region.stitch_type === 'running_stitch' &&
        isContourColor(region.color) && !isThinOutline(region);
      const effectiveType = isStaleDarkFill ? 'fill' : (region.stitch_type || 'fill');

      if (effectiveType === 'fill' && !showFill) continue;
      if ((effectiveType === 'running_stitch' || effectiveType === 'satin') && !showContour) continue;

      const color = region.color || '#ffffff';

      // Clip to region polygon
      ctx.save();
      ctx.beginPath();
      ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
      }
      ctx.closePath();
      ctx.clip();

      if (effectiveType === 'fill') {
        if (outlineOnly) {
          // Outline-only mode: just draw filled polygon silhouette
          ctx.globalAlpha = alpha * 0.35;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        } else {
          // Full fill: tatami engine — real stitches, cached per region
          drawFillStitches(ctx, pts, region, drawW, drawH, zoom, alpha, stitchCache.current);
        }
      } else if (effectiveType === 'satin') {
        drawSatinLines(ctx, pts, region, drawW, drawH, zoom, color, alpha);
      } else {
        drawRunningStitch(ctx, pts, region, drawW, drawH, zoom, color, alpha);
      }

      ctx.restore();
    }

    ctx.restore();
    drawZoomBadge(ctx, W, H, zoom);
  }, [regions, zoom, offset, stitchOpacity, showFill, showContour, viewMode]);

  // ── LAYER 3: Selection / hover overlay ─────────────────────────────────────
  const drawOverlayLayer = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (!regions) return;

    const { drawW, drawH } = getDrawSize(imageRef.current, W, H);
    const toX = p => (p[0] - 0.5) * drawW;
    const toY = p => (p[1] - 0.5) * drawH;

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);

    for (const region of regions) {
      const isSelected = region.id === selectedRegionId;
      const isHovered  = region.id === hoveredRegion;
      if (!isSelected && !isHovered) continue;
      const pts = region.path_points;
      if (!pts || pts.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(toX(pts[0]), toY(pts[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i]), toY(pts[i]));
      ctx.closePath();

      ctx.fillStyle = isSelected ? 'rgba(124,58,237,0.12)' : 'rgba(6,182,212,0.08)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#7c3aed' : '#06b6d4';
      ctx.lineWidth = (isSelected ? 2.5 : 1.8) / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [regions, selectedRegionId, hoveredRegion, zoom, offset]);

  // ── Stitch helpers ──────────────────────────────────────────────────────────

  function drawSatinLines(ctx, pts, region, drawW, drawH, zoom, color, alpha) {
    const angle = ((region.angle || 45) * Math.PI) / 180;
    const density = region.density || 0.8;
    const spacing = Math.max(1.5, 6 / density) / zoom;

    ctx.globalAlpha = alpha * 0.85;
    const xs = pts.map(p => (p[0] - 0.5) * drawW);
    const ys = pts.map(p => (p[1] - 0.5) * drawH);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const diagLen = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + spacing * 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.9 / zoom;
    ctx.lineCap = 'round';
    for (let y = -diagLen; y < diagLen; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(-diagLen, y);
      ctx.lineTo(diagLen, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRunningStitch(ctx, pts, region, drawW, drawH, zoom, color, alpha) {
    if (pts.length < 2) return;
    const dashLen = Math.max(1.5, 3.0 / zoom);
    const gapLen  = Math.max(1.0, 2.0 / zoom);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 / zoom;
    ctx.lineCap = 'round';
    ctx.setLineDash([dashLen, gapLen]);
    ctx.beginPath();
    ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
    for (let i = 1; i < pts.length; i++) ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawZoomBadge(ctx, W, H, zoom) {
    const text = `${Math.round(zoom * 100)}%`;
    ctx.save();
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 16, bh = 22, bx = W - bw - 12, by = 12;
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = zoom > 3 ? '#06b6d4' : '#94a3b8';
    ctx.fillText(text, bx + 8, by + 15);
    ctx.restore();
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  const getDrawDims = () => {
    const canvas = imgCanvasRef.current;
    if (!canvas) return { drawW: 600, drawH: 450 };
    return getDrawSize(imageRef.current, canvas.width, canvas.height);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const step = e.ctrlKey ? 0.05 : 0.15;
    const delta = e.deltaY < 0 ? 1 + step : 1 - step;
    setZoom(z => Math.max(0.1, Math.min(32, z * delta)));
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (isDragging && dragStart) {
      setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    updateTooltip(e);
  };

  const handleMouseUp = () => { setIsDragging(false); setDragStart(null); };

  const updateTooltip = (e) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !regions) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const { drawW, drawH } = getDrawDims();
    const nx = ((mx - offset.x - W / 2) / zoom) / drawW + 0.5;
    const ny = ((my - offset.y - H / 2) / zoom) / drawH + 0.5;

    let found = null;
    for (const region of regions) {
      if (!region.visible || !region.path_points) continue;
      const pts = region.path_points;
      const minX = Math.min(...pts.map(p => p[0]));
      const maxX = Math.max(...pts.map(p => p[0]));
      const minY = Math.min(...pts.map(p => p[1]));
      const maxY = Math.max(...pts.map(p => p[1]));
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) { found = region; break; }
    }
    setHoveredRegion(found?.id || null);
    setTooltip(found ? { region: found, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
  };

  const handleClick = () => { if (hoveredRegion && onRegionClick) onRegionClick(hoveredRegion); };
  const handleDblClick = () => { if (hoveredRegion && onRegionClick) onRegionClick(hoveredRegion, true); };

  const fitToScreen = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const zoomIn  = () => setZoom(z => Math.min(32, z * 1.25));
  const zoomOut = () => setZoom(z => Math.max(0.1, z / 1.25));

  const downloadPNG = () => {
    const src = imgCanvasRef.current;
    if (!src) return;
    const tmp = document.createElement('canvas');
    tmp.width = src.width; tmp.height = src.height;
    const ctx = tmp.getContext('2d');
    [imgCanvasRef, stitchCanvasRef, overlayCanvasRef].forEach(ref => {
      if (ref.current) ctx.drawImage(ref.current, 0, 0);
    });
    const a = document.createElement('a');
    a.download = 'stitch-preview.png';
    a.href = tmp.toDataURL('image/png');
    a.click();
  };

  const canvasEvents = {
    onWheel: handleWheel,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp,
    onClick: handleClick,
    onDoubleClick: handleDblClick,
  };

  const cursor = isDragging ? 'grabbing' : hoveredRegion ? 'pointer' : 'grab';

  return (
    <div className="relative flex flex-col w-full h-full bg-[#2a2a2a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130]">
        <div className="flex items-center gap-1">
          <CanvasButton onClick={zoomIn}      title="Zoom In"><ZoomIn  className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={zoomOut}     title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={fitToScreen} title="Fit"><Maximize2   className="w-3.5 h-3.5" /></CanvasButton>

          {/* View mode toggle */}
          <div className="flex items-center ml-2 rounded-lg border border-[#2a2d3a] overflow-hidden">
            <button
              onClick={() => setViewMode('fill')}
              title="Mostrar rellenos Tatami"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'fill'
                  ? 'bg-violet-600/30 text-violet-300 border-r border-violet-500/30'
                  : 'bg-[#161a23] text-slate-500 hover:text-slate-300 border-r border-[#2a2d3a]'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Rellenos</span>
            </button>
            <button
              onClick={() => setViewMode('outline')}
              title="Mostrar solo contornos"
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'outline'
                  ? 'bg-cyan-600/20 text-cyan-300'
                  : 'bg-[#161a23] text-slate-500 hover:text-slate-300'
              }`}
            >
              <AlignJustify className="w-3 h-3" />
              <span>Contornos</span>
            </button>
          </div>
        </div>

        <CanvasButton onClick={downloadPNG} title="Descargar PNG" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10">
          <Download className="w-3.5 h-3.5" />
          <span className="text-xs ml-1">PNG</span>
        </CanvasButton>
      </div>

      {/* Layered canvas stack */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden stitch-canvas-grid">
        <canvas ref={imgCanvasRef}     className="absolute inset-0 w-full h-full" />
        <canvas ref={stitchCanvasRef}  className="absolute inset-0 w-full h-full" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor }}
          {...canvasEvents}
        />

        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs shadow-xl"
            style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
          >
            <div className="font-semibold text-white">{tooltip.region.name}</div>
            <div className="text-slate-400 flex items-center gap-2 mt-0.5">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                tooltip.region.stitch_type === 'fill' ? 'badge-fill' :
                tooltip.region.stitch_type === 'satin' ? 'badge-satin' : 'badge-run'
              }`}>{tooltip.region.stitch_type}</span>
              <span>{(tooltip.region._computed_stitches || tooltip.region.stitch_count || 0).toLocaleString()} ptos</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CanvasButton({ onClick, children, title, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center px-2 py-1.5 rounded border border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:text-white hover:bg-[#1e2130] transition-colors text-xs ${className}`}
    >
      {children}
    </button>
  );
}