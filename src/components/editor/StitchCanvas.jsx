import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download, Layers, GitBranch } from 'lucide-react';

export default function StitchCanvas({ imageUrl, regions, selectedRegionId, onRegionClick, imageOpacity, stitchOpacity, showFill, showContour }) {
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const imageRef = useRef(null);
  const animFrameRef = useRef(null);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; drawCanvas(); };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => { drawCanvas(); }, [regions, zoom, offset, imageOpacity, stitchOpacity, showFill, showContour, selectedRegionId, hoveredRegion]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Grid
    drawGrid(ctx, W, H, zoom, offset);

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);

    // Draw image
    if (imageRef.current && imageOpacity > 0) {
      ctx.globalAlpha = imageOpacity / 100;
      ctx.imageSmoothingEnabled = zoom < 4;
      const iw = imageRef.current.width, ih = imageRef.current.height;
      const scale = Math.min(W * 0.7 / iw, H * 0.7 / ih);
      ctx.drawImage(imageRef.current, -iw * scale / 2, -ih * scale / 2, iw * scale, ih * scale);
      ctx.globalAlpha = 1;
    }

    // Draw stitch regions
    if (regions && stitchOpacity > 0) {
      ctx.globalAlpha = stitchOpacity / 100;
      const drawW = W * 0.7, drawH = H * 0.7;

      for (const region of regions) {
        if (!region.visible) continue;
        if (region.stitch_type === 'fill' && !showFill) continue;
        if ((region.stitch_type === 'running_stitch' || region.stitch_type === 'satin') && !showContour) continue;

        const pts = region.path_points;
        if (!pts || pts.length < 2) continue;

        const isSelected = region.id === selectedRegionId;
        const isHovered = region.id === hoveredRegion;
        const color = region.color || '#ffffff';

        ctx.strokeStyle = color;
        ctx.fillStyle = color + '33';
        ctx.lineWidth = (isSelected ? 2.5 : 1.5) / zoom;

        // Draw region outline
        ctx.beginPath();
        ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
        }
        ctx.closePath();
        if (region.stitch_type === 'fill') ctx.fill();
        ctx.stroke();

        // Draw stitch lines inside
        if (region.stitch_type === 'fill' || region.stitch_type === 'satin') {
          drawStitchLines(ctx, pts, region, drawW, drawH, zoom);
        }

        // Selection highlight
        if (isSelected || isHovered) {
          ctx.strokeStyle = isSelected ? '#7c3aed' : '#06b6d4';
          ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
          ctx.beginPath();
          ctx.moveTo((pts[0][0] - 0.5) * drawW, (pts[0][1] - 0.5) * drawH);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo((pts[i][0] - 0.5) * drawW, (pts[i][1] - 0.5) * drawH);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Zoom badge
    drawZoomBadge(ctx, W, H, zoom);
  }, [regions, zoom, offset, imageOpacity, stitchOpacity, showFill, showContour, selectedRegionId, hoveredRegion]);

  function drawGrid(ctx, W, H, zoom, offset) {
    if (zoom < 3) return;
    const gridSize = zoom >= 6 ? 10 : 20;
    ctx.save();
    ctx.strokeStyle = zoom >= 6 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    
    const ox = (offset.x + W / 2) % (gridSize * zoom);
    const oy = (offset.y + H / 2) % (gridSize * zoom);
    
    for (let x = ox - gridSize * zoom; x < W + gridSize * zoom; x += gridSize * zoom) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy - gridSize * zoom; y < H + gridSize * zoom; y += gridSize * zoom) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    
    // Accent lines every 10mm
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      const accentSize = gridSize * 10;
      const aox = (offset.x + W / 2) % (accentSize * zoom);
      const aoy = (offset.y + H / 2) % (accentSize * zoom);
      for (let x = aox - accentSize * zoom; x < W + accentSize * zoom; x += accentSize * zoom) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = aoy - accentSize * zoom; y < H + accentSize * zoom; y += accentSize * zoom) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStitchLines(ctx, pts, region, drawW, drawH, zoom) {
    const angle = ((region.angle || 45) * Math.PI) / 180;
    const density = region.density || 0.8;
    const spacing = Math.max(2, 8 / density) / zoom;
    
    const minX = Math.min(...pts.map(p => (p[0] - 0.5) * drawW));
    const maxX = Math.max(...pts.map(p => (p[0] - 0.5) * drawW));
    const minY = Math.min(...pts.map(p => (p[1] - 0.5) * drawH));
    const maxY = Math.max(...pts.map(p => (p[1] - 0.5) * drawH));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = region.color || '#ffffff';
    ctx.lineWidth = 0.8 / zoom;
    ctx.globalAlpha *= 0.6;

    const diagLen = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    for (let y = -diagLen; y < diagLen; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(-diagLen, y);
      ctx.lineTo(diagLen, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZoomBadge(ctx, W, H, zoom) {
    const pct = Math.round(zoom * 100);
    const text = `${pct}%`;
    ctx.save();
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 16, bh = 22;
    const bx = W - bw - 12, by = 12;
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = zoom > 3 ? '#06b6d4' : '#94a3b8';
    ctx.fillText(text, bx + 8, by + 15);
    ctx.restore();
  }

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
    const canvas = canvasRef.current;
    if (!canvas || !regions) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const nx = ((mx - offset.x - W / 2) / zoom) / (W * 0.7) + 0.5;
    const ny = ((my - offset.y - H / 2) / zoom) / (H * 0.7) + 0.5;

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

  const handleClick = (e) => {
    if (hoveredRegion && onRegionClick) onRegionClick(hoveredRegion);
  };

  const handleDblClick = (e) => {
    if (hoveredRegion && onRegionClick) onRegionClick(hoveredRegion, true);
  };

  const fitToScreen = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const zoomIn = () => setZoom(z => Math.min(32, z * 1.25));
  const zoomOut = () => setZoom(z => Math.max(0.1, z / 1.25));

  const downloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = 'stitch-preview.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-[#1a1a2e]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130]">
        <div className="flex items-center gap-1">
          <CanvasButton onClick={zoomIn} title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={zoomOut} title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></CanvasButton>
          <CanvasButton onClick={fitToScreen} title="Fit"><Maximize2 className="w-3.5 h-3.5" /></CanvasButton>
        </div>
        <CanvasButton onClick={downloadPNG} title="Descargar PNG" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10">
          <Download className="w-3.5 h-3.5" />
          <span className="text-xs ml-1">PNG</span>
        </CanvasButton>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden stitch-canvas-grid">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{ cursor: isDragging ? 'grabbing' : hoveredRegion ? 'pointer' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
          onDoubleClick={handleDblClick}
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