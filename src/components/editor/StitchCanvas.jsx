import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';

/**
 * StitchCanvas - renderiza puntadas directamente desde region.stitches [{x,y}] en mm
 * No depende de path_points para dibujar — dibuja las puntadas como puntos/líneas reales.
 */
export default function StitchCanvas({
  imageUrl, regions, selectedRegionId, onRegionClick,
  imageOpacity, stitchOpacity, showFill, showContour
}) {
  const imgCanvasRef    = useRef(null);
  const stitchCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const containerRef    = useRef(null);
  const imageRef        = useRef(null);

  const [zoom, setZoom]       = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);

  // ── Resize ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver(resizeAll);
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
    drawAll();
  }

  function drawAll() {
    drawImageLayer();
    drawStitchLayer();
  }

  // ── Load image ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; drawAll(); };
    img.onerror = () => {
      // Try without crossOrigin
      const img2 = new Image();
      img2.onload = () => { imageRef.current = img2; drawAll(); };
      img2.src = imageUrl;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => { drawImageLayer(); }, [zoom, offset, imageOpacity]);
  useEffect(() => { drawStitchLayer(); }, [regions, zoom, offset, stitchOpacity, showFill, showContour, selectedRegionId, hoveredRegion]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function getDesignBounds(regions) {
    // Find max mm extent across all regions
    let maxX = 0, maxY = 0;
    for (const r of regions) {
      if (!r.stitches || r.stitches.length === 0) continue;
      for (const s of r.stitches) {
        if (s.x > maxX) maxX = s.x;
        if (s.y > maxY) maxY = s.y;
      }
    }
    return { maxX: maxX || 100, maxY: maxY || 100 };
  }

  function getTransform(W, H, maxX, maxY) {
    // Fit design into 80% of canvas, centered
    const scaleX = (W * 0.8) / maxX;
    const scaleY = (H * 0.8) / maxY;
    const scale = Math.min(scaleX, scaleY);
    const originX = W / 2 - (maxX * scale) / 2;
    const originY = H / 2 - (maxY * scale) / 2;
    return { scale, originX, originY };
  }

  function mmToCanvas(x, y, transform, zoom, offset, W, H) {
    const { scale, originX, originY } = transform;
    const px = originX + x * scale;
    const py = originY + y * scale;
    // Apply zoom/pan around center
    const cx = W / 2, cy = H / 2;
    return {
      x: cx + (px - cx + offset.x) * zoom,
      y: cy + (py - cy + offset.y) * zoom
    };
  }

  // ── LAYER 1: Image ───────────────────────────────────────────────────────────
  const drawImageLayer = useCallback(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);

    if (!imageRef.current || imageOpacity <= 0) return;

    const img = imageRef.current;
    const aspect = img.naturalWidth / img.naturalHeight || 1;
    const fitW = Math.min(W * 0.85, H * 0.85 * aspect);
    const fitH = fitW / aspect;

    const cx = W / 2, cy = H / 2;
    const ix = cx + (-fitW / 2 + offset.x) * zoom;
    const iy = cy + (-fitH / 2 + offset.y) * zoom;
    const iw = fitW * zoom;
    const ih = fitH * zoom;

    ctx.save();
    ctx.globalAlpha = imageOpacity / 100;
    ctx.drawImage(img, ix, iy, iw, ih);
    ctx.restore();
  }, [zoom, offset, imageOpacity]);

  // ── LAYER 2: Stitches ────────────────────────────────────────────────────────
  const drawStitchLayer = useCallback(() => {
    const canvas = stitchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    if (!regions || regions.length === 0 || stitchOpacity <= 0) return;

    const { maxX, maxY } = getDesignBounds(regions);
    const transform = getTransform(W, H, maxX, maxY);

    const alpha = stitchOpacity / 100;

    for (const region of regions) {
      if (!region.visible) continue;
      const stitches = region.stitches;
      if (!stitches || stitches.length < 2) continue;

      const type = region.stitch_type || 'fill';
      if (type === 'fill' && !showFill) continue;
      if ((type === 'running_stitch' || type === 'satin') && !showContour) continue;

      const color = region.color || '#ffffff';
      const isSelected = region.id === selectedRegionId;
      const isHovered  = region.id === hoveredRegion;

      // Convert stitches to canvas coords
      const pts = stitches.map(s =>
        mmToCanvas(s.x, s.y, transform, zoom, offset, W, H)
      );

      ctx.save();
      ctx.globalAlpha = alpha * (isSelected ? 1.0 : isHovered ? 0.9 : 0.8);
      ctx.strokeStyle = color;
      ctx.fillStyle   = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (type === 'running_stitch') {
        // Dashed line connecting all stitch points
        const dashLen = Math.max(2, 4 * zoom);
        const gapLen  = Math.max(1, 2 * zoom);
        ctx.lineWidth = Math.max(0.8, 1.2 * zoom);
        ctx.setLineDash([dashLen, gapLen]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.setLineDash([]);

      } else if (type === 'satin') {
        // Solid line — satin columns
        ctx.lineWidth = Math.max(0.8, 1.5 * zoom);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

      } else {
        // Fill (tatami) — draw each stitch as a short segment
        ctx.lineWidth = Math.max(0.6, 1.0 * zoom);
        const segLen = Math.max(1.5, 3 * zoom);
        for (const pt of pts) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, Math.max(0.4, 0.7 * zoom), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Selection/hover highlight border
      if (isSelected || isHovered) {
        // Draw a bounding box highlight
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        const bx = Math.min(...xs) - 4, by = Math.min(...ys) - 4;
        const bw = Math.max(...xs) - bx + 8, bh = Math.max(...ys) - by + 8;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = isSelected ? '#7c3aed' : '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    // Zoom badge
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

  }, [regions, zoom, offset, stitchOpacity, showFill, showContour, selectedRegionId, hoveredRegion]);

  // ── Interaction ──────────────────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 0.87;
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
  };

  const handleMouseUp = () => { setIsDragging(false); setDragStart(null); };

  const handleClick = (e) => {
    if (!regions || !onRegionClick) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const { maxX, maxY } = getDesignBounds(regions);
    const transform = getTransform(W, H, maxX, maxY);

    // Find region whose stitches bbox contains the click
    for (const region of regions) {
      if (!region.stitches || region.stitches.length === 0) continue;
      const pts = region.stitches.map(s => mmToCanvas(s.x, s.y, transform, zoom, offset, W, H));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const bx = Math.min(...xs), by2 = Math.min(...ys);
      const bxe = Math.max(...xs), bye = Math.max(...ys);
      if (mx >= bx && mx <= bxe && my >= by2 && my <= bye) {
        setHoveredRegion(region.id);
        onRegionClick(region.id);
        return;
      }
    }
    setHoveredRegion(null);
  };

  const fitToScreen = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const zoomIn  = () => setZoom(z => Math.min(32, z * 1.25));
  const zoomOut = () => setZoom(z => Math.max(0.1, z / 1.25));

  const downloadPNG = () => {
    const src = imgCanvasRef.current;
    if (!src) return;
    const tmp = document.createElement('canvas');
    tmp.width = src.width; tmp.height = src.height;
    const ctx = tmp.getContext('2d');
    [imgCanvasRef, stitchCanvasRef].forEach(ref => {
      if (ref.current) ctx.drawImage(ref.current, 0, 0);
    });
    const a = document.createElement('a');
    a.download = 'stitch-preview.png';
    a.href = tmp.toDataURL('image/png');
    a.click();
  };

  const cursor = isDragging ? 'grabbing' : 'grab';

  return (
    <div className="relative flex flex-col w-full h-full bg-[#0d0f14]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130]">
        <div className="flex items-center gap-1">
          <CanvasBtn onClick={zoomIn}      title="Zoom In"><ZoomIn   className="w-3.5 h-3.5" /></CanvasBtn>
          <CanvasBtn onClick={zoomOut}     title="Zoom Out"><ZoomOut  className="w-3.5 h-3.5" /></CanvasBtn>
          <CanvasBtn onClick={fitToScreen} title="Ajustar"><Maximize2 className="w-3.5 h-3.5" /></CanvasBtn>
        </div>
        <CanvasBtn onClick={downloadPNG} title="Descargar PNG" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10">
          <Download className="w-3.5 h-3.5" />
          <span className="text-xs ml-1">PNG</span>
        </CanvasBtn>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden stitch-canvas-grid">
        <canvas ref={imgCanvasRef}     className="absolute inset-0 w-full h-full" />
        <canvas ref={stitchCanvasRef}  className="absolute inset-0 w-full h-full" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}

function CanvasBtn({ onClick, children, title, className = '' }) {
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