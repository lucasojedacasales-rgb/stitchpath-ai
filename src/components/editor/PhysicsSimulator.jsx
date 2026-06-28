/**
 * PhysicsSimulator.jsx — Photorealistic Embroidery Viewer
 * Renders: thread volume · relief · direction · tension · gloss
 *          fabric deformation · underlay · stitch overlap
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download, Sliders } from 'lucide-react';
import { generateTatamiFill } from '@/lib/tatamiFill';
import {
  drawFabricTexture,
  drawFabricDeformation,
  drawPhysicalStitch,
  drawUnderlayStitches,
  FABRIC_SIM_PARAMS,
} from '@/lib/physicsSimulator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isContourRegion(r) {
  if (!r) return false;
  const n = (r.name || '').toLowerCase();
  if (n.includes('contour') || n.includes('outline') || n.includes('border')) return true;
  const hex = (r.color || '').toLowerCase();
  return hex === '#000000' || hex === '#1a1a1a';
}

function getDrawSize(imageEl, W, H) {
  if (!imageEl) return { drawW: W * 0.80, drawH: H * 0.80 };
  const s = Math.min(W * 0.80 / imageEl.width, H * 0.80 / imageEl.height);
  return { drawW: imageEl.width * s, drawH: imageEl.height * s };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhysicsSimulator({ imageUrl, regions, config }) {
  const fabricCanvasRef = useRef(null);
  const stitchCanvasRef = useRef(null);
  const containerRef    = useRef(null);
  const imageRef        = useRef(null);
  const stitchCacheRef  = useRef(new Map());
  const rafRef          = useRef(null);

  const [zoom, setZoom]     = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart,  setDragStart]  = useState(null);
  const [showControls, setShowControls] = useState(false);

  const fabricType   = config?.fabric_type || 'Algodón';
  const fabricPreset = FABRIC_SIM_PARAMS[fabricType] || FABRIC_SIM_PARAMS['Algodón'];

  const [simParams, setSimParams] = useState({
    threadThicknessPx: 2.8,
    tension:           fabricPreset.tensionBase,
    glossiness:        fabricPreset.glossiness,
    lightAngleDeg:     fabricPreset.lightAngleDeg,
    showUnderlay:      true,
    showDeformation:   true,
    overlapShadow:     true,
  });

  // Sync with fabric preset
  useEffect(() => {
    const p = FABRIC_SIM_PARAMS[fabricType] || FABRIC_SIM_PARAMS['Algodón'];
    setSimParams(prev => ({ ...prev, tension: p.tensionBase, glossiness: p.glossiness, lightAngleDeg: p.lightAngleDeg }));
    stitchCacheRef.current.clear();
  }, [fabricType]);

  // Canvas resize
  useEffect(() => {
    const obs = new ResizeObserver(() => { resizeCanvases(); scheduleRender(); });
    if (containerRef.current) obs.observe(containerRef.current);
    resizeCanvases();
    return () => obs.disconnect();
  }, []);

  // Image load
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageRef.current = img; scheduleRender(); };
    img.src = imageUrl;
  }, [imageUrl]);

  // Re-render on any change
  useEffect(() => { scheduleRender(); }, [regions, zoom, offset, simParams]);

  function scheduleRender() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => { drawFabric(); drawStitches(); });
  }

  function resizeCanvases() {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth, H = el.clientHeight;
    for (const ref of [fabricCanvasRef, stitchCanvasRef]) {
      if (ref.current) { ref.current.width = W; ref.current.height = H; }
    }
  }

  // ── Layer 1: Fabric background ─────────────────────────────────────────────
  const drawFabric = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    drawFabricTexture(canvas.getContext('2d'), canvas.width, canvas.height, fabricType);
  }, [fabricType]);

  // ── Layer 2: Physical stitches ─────────────────────────────────────────────
  const drawStitches = useCallback(() => {
    const canvas = stitchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!regions || regions.length === 0) return;

    const { drawW, drawH } = getDrawSize(imageRef.current, W, H);
    const pxPerMm = drawW / (config?.width_mm || 100);

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);

    // Sort regions: fills first (background), then satin, then contours (top)
    const sorted = [...regions]
      .filter(r => r.path_points?.length >= 3 && r.visible !== false)
      .sort((a, b) => {
        const ra = isContourRegion(a) ? 5 : a.stitch_type === 'fill' ? 1 : a.stitch_type === 'satin' ? 3 : 4;
        const rb = isContourRegion(b) ? 5 : b.stitch_type === 'fill' ? 1 : b.stitch_type === 'satin' ? 3 : 4;
        if (ra !== rb) return ra - rb;
        return (a.layer_order || 0) - (b.layer_order || 0);
      });

    const fabricPresetNow = FABRIC_SIM_PARAMS[fabricType] || FABRIC_SIM_PARAMS['Algodón'];
    const threadMult = fabricPresetNow.threadMult || 1;
    const deformDepth = fabricPresetNow.deformDepth || 0.4;

    const baseParams = {
      ...simParams,
      threadThicknessPx: simParams.threadThicknessPx * threadMult,
      zoom,
    };

    for (let li = 0; li < sorted.length; li++) {
      const region = sorted[li];
      const pts    = region.path_points;
      const color  = region.color || '#ffffff';
      const type   = isContourRegion(region) ? 'running_stitch' : (region.stitch_type || 'fill');

      // Layer depth — accumulates realistically with stacking order
      const layerDepth = simParams.overlapShadow ? Math.min(li * 0.18, 2.0) : 0;
      const regionParams = { ...baseParams, layerDepth };

      // Convert polygon to canvas coords
      const polygon = pts.map(p => [(p[0] - 0.5) * drawW, (p[1] - 0.5) * drawH]);

      // ── Clip to region ──
      ctx.save();
      ctx.beginPath();
      polygon.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath();
      ctx.clip();

      // ── Fabric deformation (indent under stitches) ──
      if (simParams.showDeformation && type === 'fill' && (region.area_mm2 || 0) > 15) {
        drawFabricDeformation(ctx, polygon, color, deformDepth * 0.8);
      }

      if (type === 'fill') {
        const cacheKey = `${region.id}_${drawW.toFixed(0)}_${region.angle}_${region.density}`;
        let stitches = stitchCacheRef.current.get(cacheKey);
        if (!stitches) {
          const density = region.density || region.tatami_density || 0.4;
          const angle   = region.angle ?? 0;
          const result  = generateTatamiFill(polygon, density, 2.5, angle, pxPerMm);
          stitches = result.stitches || [];
          stitchCacheRef.current.set(cacheKey, stitches);
        }

        // Underlay (drawn first, partially visible through top layer)
        if (simParams.showUnderlay && region.underlay !== false) {
          // Rotate underlay 90° from top layer for maximum stability simulation
          const underlayAngle = (region.angle ?? 0) + 90;
          const underlayKey   = `${cacheKey}_ul`;
          let ulStitches = stitchCacheRef.current.get(underlayKey);
          if (!ulStitches) {
            const ulDensity = (region.density || 0.4) * 1.6;
            ulStitches = (generateTatamiFill(polygon, ulDensity, 2.5, underlayAngle, pxPerMm).stitches || []);
            stitchCacheRef.current.set(underlayKey, ulStitches);
          }
          drawUnderlayStitches(ctx, ulStitches, color, regionParams);
        }

        // Top fill stitches
        ctx.globalAlpha = 0.97;
        for (const [sx0, sy0, sx1, sy1] of stitches) {
          drawPhysicalStitch(ctx, sx0, sy0, sx1, sy1, color, regionParams);
        }
        ctx.globalAlpha = 1;

      } else if (type === 'satin') {
        const angle   = ((region.angle ?? 45) * Math.PI) / 180;
        const density = region.density || 0.5;
        const spacing = Math.max(baseParams.threadThicknessPx * 0.88, 5 / density) / zoom;
        const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const diag = Math.hypot(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)) + spacing * 3;

        // Underlay: center run
        if (simParams.showUnderlay && region.underlay !== false) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle + Math.PI / 2);
          const underlayParams2 = { ...regionParams, threadThicknessPx: regionParams.threadThicknessPx*0.5, glossiness:0.1, underlayMode:true };
          for (let y = -diag; y < diag; y += spacing * 2) {
            drawPhysicalStitch(ctx, -diag, y, diag, y, color, underlayParams2);
          }
          ctx.restore();
        }

        // Satin columns
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        for (let y = -diag; y < diag; y += spacing) {
          drawPhysicalStitch(ctx, -diag, y, diag, y, color, regionParams);
        }
        ctx.restore();

      } else {
        // Running stitch (contours, outlines)
        const dashPx = Math.max(2.5, 4 / zoom);
        const gapPx  = Math.max(1.5, 2.5 / zoom);
        let acc = 0, drawing = true;

        for (let i = 0; i < pts.length - 1; i++) {
          const [sx0, sy0] = [(pts[i][0]-0.5)*drawW,   (pts[i][1]-0.5)*drawH];
          const [sx1, sy1] = [(pts[i+1][0]-0.5)*drawW, (pts[i+1][1]-0.5)*drawH];
          const segLen = Math.hypot(sx1-sx0, sy1-sy0);
          if (segLen < 0.1) continue;
          let t = 0;
          while (t < 1) {
            const rem   = drawing ? dashPx - acc : gapPx - acc;
            const tEnd  = Math.min(t + rem / segLen, 1);
            if (drawing) {
              drawPhysicalStitch(
                ctx, sx0+(sx1-sx0)*t, sy0+(sy1-sy0)*t,
                sx0+(sx1-sx0)*tEnd, sy0+(sy1-sy0)*tEnd,
                color, regionParams
              );
            }
            acc += (tEnd - t) * segLen;
            if (acc >= (drawing ? dashPx : gapPx) - 0.01) { drawing = !drawing; acc = 0; }
            t = tEnd;
            if (tEnd >= 1) break;
          }
        }
      }

      ctx.restore(); // clip
    }

    ctx.restore(); // transform

    // HUD
    ctx.save();
    ctx.font = 'bold 11px Inter, sans-serif';
    const label = `${Math.round(zoom * 100)}%  ·  ${fabricType}  ·  ◉ Físico`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 16, bh = 22, bx = W - bw - 12, by = 12;
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(label, bx + 8, by + 15);
    ctx.restore();
  }, [regions, zoom, offset, simParams, fabricType, config]);

  // ── Interaction ──────────────────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.15, Math.min(25, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };
  const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); };
  const handleMouseMove = (e) => { if (isDragging && dragStart) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp   = () => { setIsDragging(false); setDragStart(null); };

  const fitToScreen = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const downloadPNG = () => {
    const W = fabricCanvasRef.current?.width || 800, H = fabricCanvasRef.current?.height || 600;
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    const ctx = tmp.getContext('2d');
    if (fabricCanvasRef.current) ctx.drawImage(fabricCanvasRef.current, 0, 0);
    if (stitchCanvasRef.current) ctx.drawImage(stitchCanvasRef.current, 0, 0);
    const a = document.createElement('a'); a.download = 'simulacion-fisica.png'; a.href = tmp.toDataURL('image/png', 0.95); a.click();
  };

  const set = (key, val) => { setSimParams(prev => ({ ...prev, [key]: val })); stitchCacheRef.current.clear(); };

  const resetParams = () => {
    const p = FABRIC_SIM_PARAMS[fabricType] || FABRIC_SIM_PARAMS['Algodón'];
    setSimParams(prev => ({ ...prev, tension: p.tensionBase, glossiness: p.glossiness, lightAngleDeg: p.lightAngleDeg }));
    stitchCacheRef.current.clear();
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0f14] border-b border-[#1e2130] flex-shrink-0">
        <div className="flex items-center gap-1">
          <ToolBtn onClick={() => setZoom(z => Math.min(25, z * 1.25))} title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></ToolBtn>
          <ToolBtn onClick={() => setZoom(z => Math.max(0.15, z / 1.25))} title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></ToolBtn>
          <ToolBtn onClick={fitToScreen} title="Ajustar"><Maximize2 className="w-3.5 h-3.5" /></ToolBtn>
          <div className="w-px h-4 bg-[#2a2d3a] mx-1" />
          <ToolBtn onClick={() => setShowControls(v => !v)} active={showControls}>
            <Sliders className="w-3.5 h-3.5" /><span className="ml-1 text-xs">Físico</span>
          </ToolBtn>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-amber-400 font-semibold bg-amber-900/20 border border-amber-500/20 px-2 py-0.5 rounded">
            ◉ Simulación física
          </span>
          <ToolBtn onClick={downloadPNG}><Download className="w-3.5 h-3.5" /><span className="ml-1 text-xs">PNG</span></ToolBtn>
        </div>
      </div>

      {/* Physics controls */}
      {showControls && (
        <div className="flex-shrink-0 bg-[#0a0c12] border-b border-[#1e2130] px-4 py-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            <SimSlider label="Grosor de hilo"     value={simParams.threadThicknessPx} min={1}   max={7}   step={0.1}  onChange={v => set('threadThicknessPx', v)} display={v => `${v.toFixed(1)}px`}      color="text-violet-400" />
            <SimSlider label="Tensión"            value={simParams.tension}           min={0}   max={1}   step={0.05} onChange={v => set('tension', v)}           display={v => v < 0.4 ? 'Flojo' : v < 0.7 ? 'Normal' : 'Tenso'} color="text-cyan-400" />
            <SimSlider label="Brillo / Finish"    value={simParams.glossiness}        min={0}   max={1}   step={0.05} onChange={v => set('glossiness', v)}        display={v => v < 0.25 ? 'Mate' : v < 0.55 ? 'Semi' : 'Rayón'} color="text-amber-400" />
            <SimSlider label="Ángulo de luz"      value={simParams.lightAngleDeg}     min={0}   max={360} step={5}    onChange={v => set('lightAngleDeg', v)}     display={v => `${v}°`}                  color="text-emerald-400" />
          </div>
          <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-[#1a1d27]">
            <Toggle label="Underlay"      active={simParams.showUnderlay}    onChange={v => set('showUnderlay',   v)} />
            <Toggle label="Deformación"   active={simParams.showDeformation} onChange={v => set('showDeformation', v)} />
            <Toggle label="Relieve capas" active={simParams.overlapShadow}   onChange={v => set('overlapShadow',  v)} />
            <button onClick={resetParams} className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ↺ Reset {fabricType}
            </button>
          </div>
        </div>
      )}

      {/* Canvas stack */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={fabricCanvasRef} className="absolute inset-0 w-full h-full" />
        <canvas ref={stitchCanvasRef} className="absolute inset-0 w-full h-full" />
        {(!regions || regions.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-600">Procesa una imagen para ver la simulación física</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ onClick, children, title, active }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center px-2 py-1.5 rounded border text-xs transition-colors ${
        active ? 'border-violet-500/50 bg-violet-900/20 text-violet-300'
               : 'border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:text-white hover:bg-[#1e2130]'
      }`}>
      {children}
    </button>
  );
}

function SimSlider({ label, value, min, max, step, onChange, display, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500 w-28 flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-violet-600 h-1" />
      <span className={`text-[11px] font-bold w-16 text-right ${color}`}>{display(value)}</span>
    </div>
  );
}

function Toggle({ label, active, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button onClick={() => onChange(!active)}
        className={`relative w-8 h-4 rounded-full transition-colors ${active ? 'bg-violet-600' : 'bg-[#2a2d3a]'}`}>
        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : ''}`} />
      </button>
      <span className="text-xs text-slate-400">{label}</span>
    </label>
  );
}