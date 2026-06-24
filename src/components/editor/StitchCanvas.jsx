import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';

/**
 * StitchCanvas — renders region.stitches [{x,y}] in mm on an HTML5 Canvas.
 * Two canvas layers: image (bottom) + stitches (top, pointer-events:none).
 * Correct bounding-box centering: uses full minX/minY/maxX/maxY.
 */
export default function StitchCanvas({
  imageUrl, regions, selectedRegionId, onRegionClick,
  imageOpacity, stitchOpacity, showFill, showContour
}) {
  const containerRef    = useRef(null);
  const imgCanvasRef    = useRef(null);
  const stitchCanvasRef = useRef(null);
  const imageRef        = useRef(null);
  const sizeRef         = useRef({ w: 0, h: 0 }); // actual pixel size after DPR

  const [zoom, setZoom]         = useState(1);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState(null);
  const [tick, setTick]         = useState(0); // force redraw

  const redraw = useCallback(() => setTick(n => n + 1), []);

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const syncSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const W = Math.floor(rect.width);
    const H = Math.floor(rect.height);
    if (W < 1 || H < 1) return;
    sizeRef.current = { w: W, h: H };
    for (const ref of [imgCanvasRef, stitchCanvasRef]) {
      if (ref.current) {
        ref.current.width  = W;
        ref.current.height = H;
      }
    }
  }, []);

  useEffect(() => {
    syncSize();
    redraw(); // force initial draw after size is known
    const obs = new ResizeObserver(() => { syncSize(); redraw(); });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [syncSize, redraw]);

  // Redraw whenever regions change (new vectorization result)
  useEffect(() => {
    syncSize();
    redraw();
  }, [regions]);

  // ── Load image ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) { imageRef.current = null; redraw(); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; redraw(); };
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => { imageRef.current = img2; redraw(); };
      img2.src = imageUrl;
    };
    img.src = imageUrl;
  }, [imageUrl, redraw]);

  // ── Geometry helpers ──────────────────────────────────────────────────────
  function getDesignBounds(regs) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of (regs || [])) {
      for (const s of (r.stitches || [])) {
        if (s.x < minX) minX = s.x;
        if (s.y < minY) minY = s.y;
        if (s.x > maxX) maxX = s.x;
        if (s.y > maxY) maxY = s.y;
      }
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, w: 100, h: 100 };
    return { minX, minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
  }

  function getTransform(W, H, bounds) {
    const scale = Math.min((W * 0.88) / bounds.w, (H * 0.88) / bounds.h);
    const ox = W / 2 - (bounds.minX + bounds.w / 2) * scale;
    const oy = H / 2 - (bounds.minY + bounds.h / 2) * scale;
    return { scale, ox, oy };
  }

  function toCanvas(sx, sy, t, z, off, W, H) {
    const px = t.ox + sx * t.scale;
    const py = t.oy + sy * t.scale;
    const cx = W / 2, cy = H / 2;
    return {
      x: cx + (px - cx + off.x) * z,
      y: cy + (py - cy + off.y) * z,
    };
  }

  // ── Draw image layer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = imgCanvasRef.current;
    if (!canvas || canvas.width < 1 || canvas.height < 1) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);

    const img = imageRef.current;
    if (!img || imageOpacity <= 0) return;

    const aspect = img.naturalWidth / img.naturalHeight || 1;
    const fitW = Math.min(W * 0.85, H * 0.85 * aspect);
    const fitH = fitW / aspect;
    const cx = W / 2, cy = H / 2;

    ctx.save();
    ctx.globalAlpha = imageOpacity / 100;
    ctx.drawImage(
      img,
      cx + (-fitW / 2 + offset.x) * zoom,
      cy + (-fitH / 2 + offset.y) * zoom,
      fitW * zoom,
      fitH * zoom
    );
    ctx.restore();
  }, [tick, imageOpacity, zoom, offset]);

  // ── Draw stitch layer ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = stitchCanvasRef.current;
    if (!canvas || canvas.width < 1 || canvas.height < 1) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!regions || regions.length === 0 || stitchOpacity <= 0) {
      drawZoomBadge(ctx, W, H, zoom);
      return;
    }

    const bounds = getDesignBounds(regions);
    const t = getTransform(W, H, bounds);
    const alpha = stitchOpacity / 100;

    for (const region of regions) {
      if (!region.visible) continue;
      const stitches = region.stitches || [];
      if (stitches.length < 2) continue;

      const type = region.stitch_type || region.type || 'fill';
      const isFill = type === 'fill';
      const isContour = type === 'running_stitch' || type === 'run' || type === 'satin';
      if (isFill && !showFill) continue;
      if (isContour && !showContour) continue;

      const color = region.color || '#ffffff';
      const isSelected = region.id === selectedRegionId;
      const pts = stitches.map(s => toCanvas(s.x, s.y, t, zoom, offset, W, H));

      ctx.save();
      ctx.globalAlpha = alpha * (isSelected ? 1.0 : 0.85);
      ctx.strokeStyle = color;
      ctx.fillStyle   = color;
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      if (type === 'running_stitch' || type === 'run') {
        ctx.lineWidth = Math.max(0.8, 1.2 * zoom);
        ctx.setLineDash([Math.max(2, 4 * zoom), Math.max(1, 2 * zoom)]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.setLineDash([]);

      } else if (type === 'satin') {
        ctx.lineWidth = Math.max(0.8, 1.5 * zoom);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

      } else {
        // fill — dot per stitch point
        const r = Math.max(0.5, 0.8 * zoom);
        for (const pt of pts) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Selection highlight
      if (isSelected) {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          Math.min(...xs) - 4, Math.min(...ys) - 4,
          Math.max(...xs) - Math.min(...xs) + 8,
          Math.max(...ys) - Math.min(...ys) + 8
        );
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    drawZoomBadge(ctx, W, H, zoom);
  }, [tick, regions, selectedRegionId, stitchOpacity, showFill, showContour, zoom, offset]);

  function drawZoomBadge(ctx, W, H, z) {
    const text = `${Math.round(z * 100)}%`;
    ctx.save();
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 16, bh = 22, bx = W - bw - 12, by = 12;
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(text, bx + 8, by + 15);
    ctx.restore();
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(32, z * (e.deltaY < 0 ? 1.15 : 0.87))));
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
    const canvas = stitchCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const bounds = getDesignBounds(regions);
    const t = getTransform(W, H, bounds);

    for (const region of regions) {
      if (!(region.stitches || []).length) continue;
      const pts = region.stitches.map(s => toCanvas(s.x, s.y, t, zoom, offset, W, H));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      if (mx >= Math.min(...xs) && mx <= Math.max(...xs) &&
          my >= Math.min(...ys) && my <= Math.max(...ys)) {
        onRegionClick(region.id);
        return;
      }
    }
  };

  const fitToScreen = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div className="relative flex flex-col w-full h-full bg-[#0d0f14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130] flex-shrink-0">
        <div className="flex items-center gap-1">
          <Btn onClick={() => setZoom(z => Math.min(32, z * 1.25))} title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => setZoom(z => Math.max(0.1, z / 1.25))} title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={fitToScreen} title="Ajustar"><Maximize2 className="w-3.5 h-3.5" /></Btn>
        </div>
        <Btn onClick={() => {
          const src = imgCanvasRef.current;
          if (!src) return;
          const tmp = document.createElement('canvas');
          tmp.width = src.width; tmp.height = src.height;
          const ctx = tmp.getContext('2d');
          [imgCanvasRef, stitchCanvasRef].forEach(r => r.current && ctx.drawImage(r.current, 0, 0));
          const a = document.createElement('a');
          a.download = 'stitch-preview.png';
          a.href = tmp.toDataURL('image/png');
          a.click();
        }} title="PNG" className="text-cyan-400 border-cyan-500/30">
          <Download className="w-3.5 h-3.5" /><span className="text-xs ml-1">PNG</span>
        </Btn>
      </div>

      {/* Canvas area — must be position:relative + overflow:visible for full render */}
      <div
        ref={containerRef}
        className="relative flex-1 stitch-canvas-grid"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', overflow: 'hidden' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      >
        <canvas ref={imgCanvasRef}    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        <canvas ref={stitchCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function Btn({ onClick, children, title, className = '' }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center px-2 py-1.5 rounded border border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:text-white hover:bg-[#1e2130] transition-colors text-xs ${className}`}>
      {children}
    </button>
  );
}