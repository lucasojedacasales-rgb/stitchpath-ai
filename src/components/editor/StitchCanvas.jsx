import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { drawTatamiRegion } from '@/lib/tatamiEngine';

// ── Contour detection helpers ─────────────────────────────────────────────────

function isContourRegion(region) {
  if (!region) return false;
  if ((region.name || '').toLowerCase().includes('contour_')) return true;
  const hex = (region.color || '').toLowerCase();
  if (hex === '#000000' || hex === '#1a1a1a') return true;
  // Ring/line shape: area/perimeter ratio < 0.5
  if (region.area_mm2 && region.perimeter_mm) {
    const ratio = region.area_mm2 / (region.perimeter_mm * region.perimeter_mm);
    if (ratio < 0.05) return true; // very elongated or ring-shaped
  }
  // Adjacent to ≥3 different regions
  if (Array.isArray(region.neighbors) && region.neighbors.length >= 3) return true;
  return false;
}

function getDrawSize(imageEl, W, H) {
  if (!imageEl) return { drawW: W * 0.75, drawH: H * 0.75 };
  const iw = imageEl.width, ih = imageEl.height;
  const s = Math.min(W * 0.75 / iw, H * 0.75 / ih);
  return { drawW: iw * s, drawH: ih * s };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StitchCanvas({
  imageUrl, regions, selectedRegionId, onRegionClick,
  imageOpacity, stitchOpacity, showFill, showContour
}) {
  // Three canvas refs: image layer, stitch layer, overlay layer
  const imgCanvasRef    = useRef(null);
  const stitchCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const containerRef    = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const imageRef = useRef(null);

  // Resize canvases to container
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

  // Load image → redraw image layer
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; drawImageLayer(); drawStitchLayer(); drawOverlayLayer(); };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw on relevant state changes
  useEffect(() => { drawImageLayer(); }, [zoom, offset, imageOpacity]);
  useEffect(() => { drawStitchLayer(); }, [regions, zoom, offset, stitchOpacity, showFill, showContour]);
  useEffect(() => { drawOverlayLayer(); }, [selectedRegionId, hoveredRegion, zoom, offset, regions]);

  // ── LAYER 1: Image ──────────────────────────────────────────────────────────
  const drawImageLayer = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a2e';
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

  // ── LAYER 2: Stitches only — clipped per region ────────────────────────────
  const drawStitchLayer = useCallback(() => {
    const canvas = stitchCanvasRef.current;
    const imgCanvas = imgCanvasRef.current;
    if (!canvas || !imgCanvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (!regions || regions.length === 0 || stitchOpacity <= 0) return;

    const { drawW, drawH } = getDrawSize(imageRef.current, W, H);

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);

    // Filter out "phantom" regions that cover >90% of canvas
    const canvasArea = drawW * drawH;
    const validRegions = regions.filter(r => {
      if ((r.area_mm2 || 0) > canvasArea * 0.9) return false;
      return true;
    });

    for (const region of validRegions) {
      if (!region.visible) continue;

      const pts = region.path_points;
      if (!pts || pts.length < 3) continue;

      // Determine effective stitch type (contour detection override)
      const effectiveType = isContourRegion(region) ? 'running_stitch' : region.stitch_type;

      if (effectiveType === 'fill' && !showFill) continue;
      if ((effectiveType === 'running_stitch' || effectiveType === 'satin') && !showContour) continue;

      const color = region.color || '#ffffff';
      const alpha = stitchOpacity / 100;

      // Clip all stitches to region polygon
      ctx.save();
      ctx.beginPath();
      ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
      }
      ctx.closePath();
      ctx.clip();

      if (effectiveType === 'fill') {
        // Tatami fill — now fully clipped
        drawTatamiRegion(ctx, pts, region, drawW, drawH, zoom, selectedRegionId === region.id, hoveredRegion === region.id, stitchOpacity);

      } else if (effectiveType === 'satin') {
        // Satin: parallel lines (already clipped above)
        drawSatinLines(ctx, pts, region, drawW, drawH, zoom, color, alpha);

      } else {
        // Running stitch: dashed path along polygon boundary
        drawRunningStitch(ctx, pts, region, drawW, drawH, zoom, color, alpha);
      }

      ctx.restore();
    }

    ctx.restore();
    drawZoomBadge(ctx, W, H, zoom);
  }, [regions, zoom, offset, stitchOpacity, showFill, showContour]);

  // ── LAYER 3: Selection / hover overlay only ─────────────────────────────────
  const drawOverlayLayer = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const imgCanvas = imgCanvasRef.current;
    if (!canvas || !imgCanvas) return;
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

      // Semi-transparent fill tint
      ctx.fillStyle = isSelected ? 'rgba(124,58,237,0.12)' : 'rgba(6,182,212,0.08)';
      ctx.fill();

      // Dashed outline
      ctx.strokeStyle = isSelected ? '#7c3aed' : '#06b6d4';
      ctx.lineWidth = (isSelected ? 2.5 : 1.8) / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [regions, selectedRegionId, hoveredRegion, zoom, offset]);

  // ── Stitch drawing helpers ──────────────────────────────────────────────────

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

  // ── Badge (drawn on stitch layer) ──────────────────────────────────────────

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

  // ── Interaction ────────────────────────────────────────────────────────────

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
    // Composite all 3 layers into a temporary canvas for download
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
    <div className="relative flex flex-col w-full h-full bg-[#1a1a2e]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130]">
        <div className="flex items-center gap-1">
          <CanvasButton onClick={zoomIn}      title="Zoom In"><ZoomIn  className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={zoomOut}     title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={fitToScreen} title="Fit"><Maximize2   className="w-3.5 h-3.5" /></CanvasButton>
        </div>
        <CanvasButton onClick={downloadPNG} title="Descargar PNG" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10">
          <Download className="w-3.5 h-3.5" />
          <span className="text-xs ml-1">PNG</span>
        </CanvasButton>
      </div>

      {/* Layered canvas stack */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden stitch-canvas-grid">
        {/* Layer 1: image + grid background */}
        <canvas ref={imgCanvasRef}     className="absolute inset-0 w-full h-full" />
        {/* Layer 2: stitches only */}
        <canvas ref={stitchCanvasRef}  className="absolute inset-0 w-full h-full" />
        {/* Layer 3: hover/selection overlay — receives all pointer events */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor }}
          {...canvasEvents}
        />

        {/* Tooltip */}
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
              <span>{tooltip.region.stitch_count || 0} ptos</span>
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