import { useRef, useEffect, useCallback, useState } from 'react';
import { drawBackground } from './finalLookBackgrounds';
import { drawSegmentBatch, drawMarkers, drawVectorPreview } from './finalLookRender';

/**
 * Lienzo de la pestaña Final: fondo + hilo + superposición (selección, lupa).
 * Solo lectura: dibuja los comandos ya generados, nunca los modifica.
 */
export default function FinalLookCanvas({
  data, regions, widthMm, heightMm, view, mode, background, threadMm,
  layers, showDirection, showJumps, showTrims, showStartEnd, highlightDiscarded,
  isolate, selectedRegionId, onSelectRegion, zoom, pan, onPanChange, onZoomAt,
  magnifier, magnifierZoom, originalImageUrl, onFitScale,
}) {
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const stitchRef = useRef(null);
  const overlayRef = useRef(null);
  const imgRef = useRef(null);
  const projRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(null);
  const cursorRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const [imgReady, setImgReady] = useState(0);

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 620 });
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!originalImageUrl) { imgRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgRef.current = img; setImgReady(v => v + 1); };
    img.src = originalImageUrl;
  }, [originalImageUrl]);

  // Proyección mm → px (con zoom y pan)
  const buildProjection = useCallback(() => {
    const { w, h } = size;
    const pad = 24;
    const b = data.bounds;
    const mmW = Math.max(1, b.maxX - b.minX);
    const mmH = Math.max(1, b.maxY - b.minY);
    const fit = Math.min((w - pad * 2) / mmW, (h - pad * 2) / mmH);
    const scale = fit * zoom;
    const cxMm = (b.minX + b.maxX) / 2;
    const cyMm = (b.minY + b.maxY) / 2;
    const toPx = (x, y) => [w / 2 + pan.x + (x - cxMm) * scale, h / 2 + pan.y + (y - cyMm) * scale];
    const toMm = (px, py) => [(px - w / 2 - pan.x) / scale + cxMm, (py - h / 2 - pan.y) / scale + cyMm];
    return { scale, fit, toPx, toMm };
  }, [size, data.bounds, zoom, pan]);

  const setupCanvas = useCallback((canvas) => {
    if (!canvas) return null;
    const { w, h } = size;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }, [size, dpr]);

  const segmentVisible = useCallback((s) => {
    if (isolate && selectedRegionId && s.regionId !== selectedRegionId) return false;
    if (s.kind === 'fill' || s.kind === 'satin') return layers.fills;
    if (s.kind === 'contour') return layers.contours;
    if (s.kind === 'detail') return layers.details;
    return true;
  }, [layers, isolate, selectedRegionId]);

  // ── Capa 1: fondo (+ imagen original / vectorizado) ─────────────────────
  useEffect(() => {
    const ctx = setupCanvas(bgRef.current);
    if (!ctx) return;
    const proj = buildProjection();
    projRef.current = proj;
    if (onFitScale) onFitScale(proj.fit);
    drawBackground(ctx, size.w, size.h, background, proj.scale);

    const [hx1, hy1] = proj.toPx(-widthMm / 2, -heightMm / 2);
    const [hx2, hy2] = proj.toPx(widthMm / 2, heightMm / 2);

    if (view === 'original' && imgRef.current) {
      ctx.save();
      ctx.imageSmoothingEnabled = proj.scale < 12;
      ctx.drawImage(imgRef.current, hx1, hy1, hx2 - hx1, hy2 - hy1);
      ctx.restore();
    } else if (view === 'vector') {
      drawVectorPreview(ctx, regions, proj.toPx, widthMm, heightMm, isolate ? selectedRegionId : null);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(hx1, hy1, hx2 - hx1, hy2 - hy1);
    ctx.restore();
  }, [setupCanvas, buildProjection, background, size, view, widthMm, heightMm, regions, isolate, selectedRegionId, imgReady]);

  // ── Capa 2: hilo (por lotes con requestAnimationFrame) ──────────────────
  useEffect(() => {
    const ctx = setupCanvas(stitchRef.current);
    if (!ctx) return;
    if (view === 'original' || view === 'vector') return;
    const proj = buildProjection();
    const segs = data.segments;
    const effectiveMode = view === 'stitch' ? 'technical' : mode;
    const thread = view === 'stitch' ? Math.min(threadMm, 0.55) : threadMm;
    const lod = segs.length > 45000 && zoom < 2;
    const t0 = performance.now();

    const opts = {
      toPx: proj.toPx, scale: proj.scale, mode: effectiveMode, threadMm: thread,
      selectedRegionId, showDirection: showDirection && view !== 'stitch',
      dimOthers: !!selectedRegionId && !isolate, highlightDiscarded, lod,
      filter: segmentVisible,
    };

    let i = 0;
    let cancelled = false;
    const chunk = segs.length > 12000 ? 3000 : segs.length;
    const step = () => {
      if (cancelled) return;
      const end = Math.min(segs.length, i + chunk);
      drawSegmentBatch(ctx, segs, i, end, opts);
      i = end;
      if (i < segs.length) rafRef.current = requestAnimationFrame(step);
      else {
        drawMarkers(ctx, data, { toPx: proj.toPx, showJumps, showTrims, showStartEnd });
        console.log('[PERF] finalLookRenderMs', Math.round(performance.now() - t0), 'segments', segs.length);
      }
    };
    step();
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [setupCanvas, buildProjection, data, view, mode, threadMm, zoom, selectedRegionId, isolate,
      showDirection, showJumps, showTrims, showStartEnd, highlightDiscarded, segmentVisible, size]);

  // ── Capa 3: superposición (selección + lupa) ────────────────────────────
  const drawOverlay = useCallback(() => {
    const ctx = setupCanvas(overlayRef.current);
    if (!ctx) return;
    const proj = projRef.current || buildProjection();

    if (selectedRegionId && !isolate) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const s of data.segments) {
        if (s.regionId !== selectedRegionId) continue;
        minX = Math.min(minX, s.x0, s.x1); maxX = Math.max(maxX, s.x0, s.x1);
        minY = Math.min(minY, s.y0, s.y1); maxY = Math.max(maxY, s.y0, s.y1);
      }
      if (minX < Infinity) {
        const [a, b] = proj.toPx(minX, minY);
        const [c, d] = proj.toPx(maxX, maxY);
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(a - 4, b - 4, c - a + 8, d - b + 8);
        ctx.setLineDash([]);
      }
    }

    const cur = cursorRef.current;
    if (magnifier && cur) {
      const R = 92;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(10,12,18,0.92)';
      ctx.fill();
      const m = magnifierZoom;
      const lensProj = {
        toPx: (x, y) => {
          const [px, py] = proj.toPx(x, y);
          return [cur.x + (px - cur.x) * m, cur.y + (py - cur.y) * m];
        },
      };
      const mmPerPx = 1 / proj.scale;
      const rMm = (R / m) * mmPerPx * 1.3;
      const [cmx, cmy] = proj.toMm(cur.x, cur.y);
      const sub = [];
      for (const s of data.segments) {
        if (Math.abs(s.x0 - cmx) > rMm || Math.abs(s.y0 - cmy) > rMm) continue;
        if (!segmentVisible(s)) continue;
        sub.push(s);
        if (sub.length > 6000) break;
      }
      drawSegmentBatch(ctx, sub, 0, sub.length, {
        toPx: lensProj.toPx, scale: proj.scale * m, mode, threadMm,
        selectedRegionId, showDirection, dimOthers: false, highlightDiscarded, lod: false,
      });
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, R, 0, Math.PI * 2);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(8,11,16,0.9)';
      ctx.fillRect(cur.x - 22, cur.y + R + 4, 44, 16);
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${m}×`, cur.x, cur.y + R + 16);
      ctx.textAlign = 'left';
    }
  }, [setupCanvas, buildProjection, data, selectedRegionId, isolate, magnifier, magnifierZoom, mode, threadMm, showDirection, highlightDiscarded, segmentVisible]);

  useEffect(() => { drawOverlay(); }, [drawOverlay, size, zoom, pan]);

  // ── Interacción ─────────────────────────────────────────────────────────
  const pointer = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (p) => {
    const proj = projRef.current;
    if (!proj) return null;
    const [mx, my] = proj.toMm(p.x, p.y);
    const tol = 8 / proj.scale;
    let best = null, bestD = tol;
    for (const s of data.segments) {
      if (!segmentVisible(s)) continue;
      const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
      const d = Math.hypot(cx - mx, cy - my);
      if (d < bestD) { bestD = d; best = s.regionId; }
    }
    return best;
  };

  const overlayRaf = useRef(null);
  const handleMove = (e) => {
    const p = pointer(e);
    if (dragRef.current) {
      onPanChange({ x: dragRef.current.px + (e.clientX - dragRef.current.sx), y: dragRef.current.py + (e.clientY - dragRef.current.sy) });
      return;
    }
    if (!magnifier) return;
    cursorRef.current = p;
    if (overlayRaf.current) return;
    overlayRaf.current = requestAnimationFrame(() => { overlayRaf.current = null; drawOverlay(); });
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas ref={bgRef} className="absolute inset-0" />
      <canvas ref={stitchRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0"
        style={{ cursor: dragRef.current ? 'grabbing' : magnifier ? 'crosshair' : 'grab', touchAction: 'none' }}
        onMouseDown={(e) => { dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false }; }}
        onMouseMove={(e) => { if (dragRef.current) dragRef.current.moved = true; handleMove(e); }}
        onMouseUp={(e) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag && Math.abs(e.clientX - drag.sx) < 4 && Math.abs(e.clientY - drag.sy) < 4) {
            onSelectRegion(hitTest(pointer(e)));
          }
        }}
        onMouseLeave={() => { dragRef.current = null; cursorRef.current = null; if (magnifier) drawOverlay(); }}
        onDoubleClick={(e) => {
          const p = pointer(e);
          onZoomAt(p, size);
        }}
        onWheel={(e) => {
          e.preventDefault();
          const p = pointer(e);
          onZoomAt(p, size, e.deltaY < 0 ? 1.18 : 1 / 1.18);
        }}
      />
    </div>
  );
}