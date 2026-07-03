import { useState, useEffect, useRef, useMemo } from 'react';
import { Eye, EyeOff, Layers, Scissors, Sparkles, RefreshCw } from 'lucide-react';
import { DEFAULT_MACHINE } from '@/lib/exportPipeline';

/**
 * FinalLookSimulator — Realistic final embroidery look with thread thickness,
 * layer overlap, and toggles for contours / preserved details / discarded highlights.
 *
 * Renders the ACTUAL stitch sequence (from buildFinalCommands pipeline) with
 * visual thread thickness to show how the final embroidery will look.
 */
export default function FinalLookSimulator({ regions, config, machineSettings, detailReport, finalCommands, finalObjects }) {
  const canvasRef = useRef(null);
  const [showOutlinesOnly, setShowOutlinesOnly] = useState(false);
  const [showPreservedDetails, setShowPreservedDetails] = useState(true);
  const [highlightDiscarded, setHighlightDiscarded] = useState(true);
  const [threadThickness, setThreadThickness] = useState(1.5); // mm visual thickness

  const ms = { ...DEFAULT_MACHINE, ...machineSettings };
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;

  // ── READ-ONLY: FinalLookSimulator NEVER generates its own commands ───────
  // It reads finalEmbroideryCommands from the Editor (single source of truth).
  // It cannot modify regions, commands, contours, sewing order, or metrics.
  const experimentalEnabled = config?.experimentalFinalLookSimulator === true;
  useEffect(() => {
    console.log('[command-sync] finalLook source: finalEmbroideryCommands (read-only)');
    console.log('[rollback-safe] experimentalFinalLookSimulator', experimentalEnabled ? 'ON' : 'OFF');
    console.log('[rollback-safe] FinalLookSimulator is read-only: no region/command mutation');
  }, [experimentalEnabled]);

  // Use finalCommands passed from Editor — NEVER build own commands
  const commands = finalCommands || [];
  const objects = finalObjects || [];

  // Compute projection bounds
  const projection = useMemo(() => {
    let minX = -w / 2, maxX = w / 2, minY = -h / 2, maxY = h / 2;
    for (const c of commands) {
      if (c.x === undefined || !Number.isFinite(c.x)) continue;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return { minX, maxX, minY, maxY };
  }, [commands, w, h]);

  // Build lookup for detail info
  const detailMap = useMemo(() => {
    const map = new Map();
    for (const d of detailReport?.details || []) {
      map.set(d.id, d);
    }
    return map;
  }, [detailReport]);

  // Render final look
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, width, height);

    if (commands.length === 0 || !projection) return;

    // Projection: mm → canvas pixels
    const padding = 20;
    const drawW = width - padding * 2;
    const drawH = height - padding * 2;
    const mmW = projection.maxX - projection.minX || w;
    const mmH = projection.maxY - projection.minY || h;
    const scale = Math.min(drawW / mmW, drawH / mmH);
    const toPx = (x, y) => [
      padding + (x - projection.minX) * scale + (drawW - mmW * scale) / 2,
      padding + (y - projection.minY) * scale + (drawH - mmH * scale) / 2,
    ];

    // Draw hoop boundary
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const [hx1, hy1] = toPx(-w / 2, -h / 2);
    const [hx2, hy2] = toPx(w / 2, h / 2);
    ctx.strokeRect(hx1, hy1, hx2 - hx1, hy2 - hy1);
    ctx.setLineDash([]);

    // Thread thickness in pixels
    const threadPx = Math.max(1, threadThickness * scale);

    // Group commands by region/color for layer rendering
    let currentColor = '#888888';
    let currentRegionId = null;
    let isCurrentOutline = false;
    let isCurrentDetail = false;

    // Render stitch by stitch with thread thickness
    for (let i = 0; i < commands.length; i++) {
      const c = commands[i];
      if (c.type === 'colorChange') {
        currentColor = c.color || currentColor;
        continue;
      }
      if (c.type === 'end' || c.type === 'trim') continue;

      if (c.type === 'jump') {
        // Don't draw jumps in final look
        continue;
      }

      if (c.type === 'stitch' && i > 0) {
        const prev = commands[i - 1];
        if (prev.type !== 'stitch' && prev.type !== 'jump') continue;

        const [px, py] = toPx(prev.x, prev.y);
        const [cx, cy] = toPx(c.x, c.y);
        const segLenMm = Math.hypot(c.x - prev.x, c.y - prev.y) / scale;

        // Check if this region is an outline or detail
        const regionId = c.regionId;
        const region = objects.find(o => o.id === regionId);
        const detail = detailMap.get(regionId);
        const isOutline = region?.stitch_type === 'running_stitch' || region?.stitch_type === 'contour';
        const isDetailRun = detail?.preserved && (detail?.class === 'detail_run' || detail?.class === 'decorative_detail');

        // Defensive: never draw a long contour/detail stitch — it's an artificial
        // bridge (real stitches are sub-divided ≤3.5mm). Travel must never render.
        if (segLenMm > 6 && (isOutline || isDetailRun)) continue;

        // Filter: show outlines only
        if (showOutlinesOnly && !isOutline && !isDetailRun) continue;
        // Filter: hide preserved details
        if (!showPreservedDetails && isDetailRun) continue;

        // Determine render color
        let renderColor = c.color || currentColor;
        let renderWidth = threadPx;

        if (isOutline) {
          renderWidth = threadPx * 1.3; // outlines slightly thicker
        } else if (isDetailRun) {
          renderWidth = threadPx * 1.2;
          renderColor = c.color || '#1a1a1a';
        } else if (isCurrentFillType(region, 'fill')) {
          renderWidth = threadPx * 0.9; // fills slightly thinner
        }

        // Highlight discarded details in red
        if (highlightDiscarded && detail && !detail.preserved && detail.score > 0) {
          renderColor = '#ef4444';
          renderWidth = threadPx * 1.5;
        }

        ctx.strokeStyle = renderColor;
        ctx.lineWidth = renderWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
    }

    console.log('[simulation-final-look] rendered commands:', commands.length);
  }, [commands, objects, projection, showOutlinesOnly, showPreservedDetails, highlightDiscarded, threadThickness, w, h]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2130] flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-bold text-violet-300">Final Look</span>
        </div>
        <div className="w-px h-4 bg-[#2a2d3a]" />
        <ToggleChip icon={Layers} label="Solo contornos" active={showOutlinesOnly} onClick={() => setShowOutlinesOnly(!showOutlinesOnly)} />
        <ToggleChip icon={Eye} label="Detalles" active={showPreservedDetails} onClick={() => setShowPreservedDetails(!showPreservedDetails)} />
        <ToggleChip icon={EyeOff} label="Descartados" active={highlightDiscarded} onClick={() => setHighlightDiscarded(!highlightDiscarded)} />
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-slate-600">Grosor hilo</span>
          <input type="range" min="0.5" max="3" step="0.1" value={threadThickness}
            onChange={e => setThreadThickness(Number(e.target.value))}
            className="w-16 accent-violet-600" />
          <span className="text-[10px] text-violet-400 font-bold w-8">{threadThickness.toFixed(1)}mm</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-[#0d0f14] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          className="w-full h-full"
        />
        {/* Legend */}
        <div className="absolute bottom-2 left-2 space-y-0.5 text-[9px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <div className="w-3 h-0.5 bg-violet-400 rounded" /> Relleno
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <div className="w-3 h-0.5 bg-cyan-400 rounded" /> Contorno
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <div className="w-3 h-0.5 bg-amber-400 rounded" /> Detalle
          </div>
          {highlightDiscarded && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <div className="w-3 h-0.5 bg-red-400 rounded" /> Descartado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isCurrentFillType(region, type) {
  return region?.stitch_type === type;
}

function ToggleChip({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
        active
          ? 'bg-violet-900/20 border-violet-500/40 text-violet-300'
          : 'border-[#2a2d3a] text-slate-600 hover:text-slate-400'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}