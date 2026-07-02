import { useState, useMemo, useRef, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Eye, EyeOff, Route, Scissors, Palette, Bug, Layers } from 'lucide-react';
import { countContourStitches, getLastContourAudit, getLastSegmentClassification } from '@/lib/contourExportBuilder';
import { classifyStitchSegments } from '@/lib/geometryAudit';
import { detectTravelContamination } from '@/lib/contourRefineValidator';

/**
 * ContourRefinePanel — shows contour metrics + debug view toggles.
 *
 * Props:
 *   commands — finalEmbroideryCommands (read-only)
 *   regions  — visual regions
 *   config   — { width_mm, height_mm }
 */
export default function ContourRefinePanel({ commands = [], regions = [], config = {} }) {
  const [viewMode, setViewMode] = useState('metrics'); // 'metrics' | 'contours_only' | 'contours_travel'
  const canvasRef = useRef(null);

  const report = useMemo(() => {
    const counts = countContourStitches(commands);
    const travelContam = detectTravelContamination(commands, 3.5);
    const hasMouth = regions.some(r => {
      const name = (r.name || '').toLowerCase();
      return name.includes('mouth') || name.includes('boca');
    });

    // Determine outer outline type
    let outerType = 'none';
    for (const c of commands) {
      if (c.type === 'stitch' && c.layerType === 'outer_outline') {
        outerType = (c.stitchType || '').toLowerCase().includes('satin') ? 'satin' : 'run';
        break;
      }
    }

    // Calculate outer outline total length
    let outerLen = 0;
    let prevX = 0, prevY = 0;
    for (const c of commands) {
      if (c.type === 'stitch' && c.layerType === 'outer_outline') {
        outerLen += Math.hypot((c.x || 0) - prevX, (c.y || 0) - prevY);
      }
      if (c.type === 'stitch' || c.type === 'jump') {
        prevX = c.x || 0; prevY = c.y || 0;
      }
    }

    // Determine outer outline order (fraction of total commands)
    const totalStitches = commands.filter(c => c.type === 'stitch').length;
    const orderPct = counts.outerOutlineOrder >= 0 && totalStitches > 0
      ? Math.round((counts.outerOutlineOrder / totalStitches) * 100)
      : -1;

    const audit = getLastContourAudit();
    const outerSegIds = new Set();
    for (const c of commands) {
      if (c.type === 'stitch' && (c.layerType || '').toLowerCase() === 'outer_outline') {
        outerSegIds.add(c.regionId);
      }
    }
    return {
      ...counts,
      outerType,
      outerLenMm: Math.round(outerLen),
      orderPct,
      travelContam,
      hasMouth,
      outerContourSegments: outerSegIds.size,
      internalShadingBoundariesDetected: audit?.internalBoundariesDetected || 0,
      invalidInternalOutlinesRemoved: audit?.removedCount || 0,
      visibleFootContourCoverage: audit?.footContourCoverage ?? 100,
      bodyShadowBoundaryOutlined: audit?.removedDetails?.some(d => d.parentGroup === 'body') ? 'NO' : 'YES',
    };
  }, [commands, regions]);

  // ── Debug canvas rendering ──
  useEffect(() => {
    if (viewMode === 'metrics') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = config.width_mm || 100;
    const h = config.height_mm || 100;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / w, ch / h) * 0.9;
    const offX = cw / 2;
    const offY = ch / 2;

    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, cw, ch);

    // Helper: mm → canvas px
    const toPx = (x, y) => [offX + x * scale, offY - y * scale];

    if (viewMode === 'contours_only') {
      // Show only contour stitches (outer, inner, mouth, detail)
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      let prev = null;
      for (const c of commands) {
        if (c.type !== 'stitch') { prev = null; continue; }
        const lt = (c.layerType || '').toLowerCase();
        const rid = (c.regionId || '').toLowerCase();
        const isContour = lt.includes('outline') || lt.includes('contour') ||
                          lt.includes('mouth') || lt.includes('detail') ||
                          rid.includes('outline') || rid.includes('contour') ||
                          rid.includes('mouth') || rid.includes('detail');
        if (!isContour) { prev = null; continue; }
        const [px, py] = toPx(c.x || 0, c.y || 0);
        if (prev) {
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        prev = [px, py];
      }
    } else if (viewMode === 'contours_travel') {
      // Contours = black solid, jumps = green dashed, trims = red dot
      let prev = null;
      for (const c of commands) {
        if (c.type === 'stitch') {
          const lt = (c.layerType || '').toLowerCase();
          const rid = (c.regionId || '').toLowerCase();
          const isContour = lt.includes('outline') || lt.includes('contour') ||
                            lt.includes('mouth') || lt.includes('detail') ||
                            rid.includes('outline') || rid.includes('contour');
          const [px, py] = toPx(c.x || 0, c.y || 0);
          if (isContour && prev) {
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
          prev = [px, py];
        } else if (c.type === 'jump') {
          const [px, py] = toPx(c.x || 0, c.y || 0);
          if (prev) {
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
          prev = [px, py];
        } else if (c.type === 'trim') {
          if (prev) {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(prev[0], prev[1], 3, 0, Math.PI * 2);
            ctx.fill();
          }
          prev = null;
        } else {
          prev = null;
        }
      }
      ctx.setLineDash([]);
    } else if (viewMode === 'discarded') {
      // Real contours (dark) + discarded internal boundaries (orange dashed)
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      let prev = null;
      for (const c of commands) {
        if (c.type !== 'stitch') { prev = null; continue; }
        const lt = (c.layerType || '').toLowerCase();
        const isContour = lt.includes('outline') || lt.includes('contour') || lt.includes('mouth') || lt.includes('detail');
        if (!isContour) { prev = null; continue; }
        const [px, py] = toPx(c.x || 0, c.y || 0);
        if (prev) {
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        prev = [px, py];
      }
      // Discarded internal boundaries in orange
      const audit = getLastContourAudit();
      if (audit && audit.removedDetails) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        for (const detail of audit.removedDetails) {
          const pts = detail.boundaryPoints || [];
          if (pts.length < 2) continue;
          ctx.beginPath();
          const mm0 = toPx((pts[0][0] - 0.5) * w, (pts[0][1] - 0.5) * h);
          ctx.moveTo(mm0[0], mm0[1]);
          for (let i = 1; i < pts.length; i++) {
            const mm = toPx((pts[i][0] - 0.5) * w, (pts[i][1] - 0.5) * h);
            ctx.lineTo(mm[0], mm[1]);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    } else if (viewMode === 'classification') {
      // Classify all segments by type: contour / detail / fill / travel / suspicious
      const segments = classifyStitchSegments(commands);
      for (const seg of segments) {
        const [sx, sy] = toPx(seg.start.x, seg.start.y);
        const [ex, ey] = toPx(seg.end.x, seg.end.y);
        ctx.lineWidth = seg.category === 'suspicious' ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        switch (seg.category) {
          case 'outer_silhouette': ctx.strokeStyle = '#22c55e'; break;
          case 'limb_contour': ctx.strokeStyle = '#06b6d4'; break;
          case 'facial_detail': ctx.strokeStyle = '#3b82f6'; break;
          case 'eye_detail': ctx.strokeStyle = '#eab308'; break;
          case 'fill': ctx.strokeStyle = '#a78bfa'; break;
          case 'fill_boundary': ctx.strokeStyle = '#f97316'; break;
          case 'travel': ctx.strokeStyle = '#64748b'; ctx.setLineDash([2, 2]); break;
          case 'artifact': ctx.strokeStyle = '#ef4444'; break;
          default: ctx.strokeStyle = '#94a3b8'; break;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [viewMode, commands, config]);

  const outerExists = report.outerOutlineStitches > 0;
  const mouthExists = report.mouthStitches > 0;

  return (
    <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-bold text-slate-300">Contour Refine Metrics</span>
      </div>

      {/* View mode toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('metrics')}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
            viewMode === 'metrics' ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#161a23] border-[#2a2d3a] text-slate-500'
          }`}
        >Métricas</button>
        <button
          onClick={() => setViewMode('contours_only')}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
            viewMode === 'contours_only' ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#161a23] border-[#2a2d3a] text-slate-500'
          }`}
        >Solo contornos</button>
        <button
          onClick={() => setViewMode('contours_travel')}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
            viewMode === 'contours_travel' ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#161a23] border-[#2a2d3a] text-slate-500'
          }`}
        >Contornos + viajes</button>
        <button
        onClick={() => setViewMode('discarded')}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
          viewMode === 'discarded' ? 'bg-orange-900/30 border-orange-500 text-orange-300' : 'bg-[#161a23] border-[#2a2d3a] text-slate-500'
        }`}
        >Fronteras descartadas</button>
        <button
        onClick={() => setViewMode('classification')}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
          viewMode === 'classification' ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#161a23] border-[#2a2d3a] text-slate-500'
        }`}
        >Clasificación</button>
        </div>

      {viewMode === 'metrics' ? (
        <>
          {/* Outer outline */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Palette className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-bold text-slate-400">Outer Outline</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Existe" value={outerExists ? 'YES' : 'NO'} color={outerExists ? 'text-emerald-400' : 'text-red-400'} />
              <Metric label="Tipo" value={report.outerType} color="text-violet-400" />
              <Metric label="Puntadas" value={report.outerOutlineStitches} color={report.outerOutlineStitches > 80 ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Long. mm" value={report.outerLenMm} color="text-cyan-400" />
              <Metric label="Orden" value={report.orderPct >= 0 ? `${report.orderPct}%` : '—'} color={report.orderPct >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
              <Metric label="Color" value={report.outerOutlineColor || '—'} color="text-slate-400" />
            </div>
          </div>

          {/* Inner outlines */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Eye className="w-3 h-3 text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-400">Inner Outlines</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Cantidad" value={report.innerContoursExported} color="text-cyan-400" />
              <Metric label="Puntadas" value={report.innerOutlineStitches} color="text-cyan-400" />
            </div>
          </div>

          {/* Mouth */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Scissors className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400">Mouth</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Existe" value={mouthExists ? 'YES' : 'NO'} color={mouthExists ? 'text-emerald-400' : (report.hasMouth ? 'text-red-400' : 'text-slate-500')} />
              <Metric label="Puntadas" value={report.mouthStitches} color="text-amber-400" />
            </div>
          </div>

          {/* Travel contamination */}
          <div className={`rounded-lg p-2.5 border ${report.travelContam > 0 ? 'bg-red-900/20 border-red-500/40' : 'bg-emerald-900/15 border-emerald-500/30'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Route className={`w-3 h-3 ${report.travelContam > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              <span className="text-[10px] font-bold text-slate-400">Travel Contamination</span>
            </div>
            <div className="text-sm font-bold mb-1">
              <span className={report.travelContam > 0 ? 'text-red-400' : 'text-emerald-400'}>{report.travelContam}</span>
              <span className="text-[10px] text-slate-500 ml-1">líneas</span>
            </div>
            {report.travelContam > 0 && (
              <div className="text-[10px] text-red-300 flex items-start gap-1">
                <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
                <span>Hay viajes convertidos en puntadas visibles.</span>
              </div>
            )}
          </div>

          {/* Group audit metrics */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bug className="w-3 h-3 text-orange-400" />
              <span className="text-[10px] font-bold text-slate-400">Group Audit</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Segmentos" value={report.outerContourSegments || 0} color="text-violet-400" />
              <Metric label="Fronteras int." value={report.internalShadingBoundariesDetected || 0} color="text-orange-400" />
              <Metric label="Eliminados" value={report.invalidInternalOutlinesRemoved || 0} color="text-emerald-400" />
              <Metric label="Pies cubiertos" value={(report.visibleFootContourCoverage ?? 100) + '%'} color={(report.visibleFootContourCoverage ?? 100) > 95 ? 'text-emerald-400' : 'text-red-400'} />
              <Metric label="Sombra body" value={report.bodyShadowBoundaryOutlined || '—'} color={report.bodyShadowBoundaryOutlined === 'NO' ? 'text-emerald-400' : 'text-red-400'} />
            </div>
          </div>

          {/* Segment classification summary */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-bold text-slate-400">Clasificación semántica</span>
            </div>
            {(() => {
              const sc = getLastSegmentClassification();
              if (!sc) return <div className="text-[10px] text-slate-600">Sin datos</div>;
              const counts = {};
              for (const c of sc.classified) {
                counts[c.category] = (counts[c.category] || 0) + 1;
              }
              const colors = {
                outer_silhouette: 'text-emerald-400',
                limb_contour: 'text-cyan-400',
                facial_detail: 'text-blue-400',
                eye_detail: 'text-yellow-400',
                fill_boundary: 'text-orange-400',
                artifact: 'text-red-400',
              };
              return (
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(counts).map(([cat, count]) => (
                    <Metric key={cat} label={cat} value={count} color={colors[cat] || 'text-slate-400'} />
                  ))}
                  <Metric label="Exportados" value={sc.exportableCount} color="text-emerald-400" />
                  <Metric label="Excluidos" value={sc.excludedCount} color="text-orange-400" />
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={400}
            height={300}
            className="w-full bg-[#0d0f14] border border-[#1e2130] rounded-lg"
          />
          {viewMode === 'contours_travel' && (
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#1a1a1a]"></span> Contorno</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t border-dashed border-[#22c55e]"></span> Jump</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-[#ef4444] rounded-full"></span> Trim</span>
            </div>
          )}
          {viewMode === 'contours_only' && (
            <div className="text-[10px] text-slate-500">Solo se muestran outer_outline, inner_outline, mouth y detail_run.</div>
          )}
          {viewMode === 'discarded' && (
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#1a1a1a]"></span> Contorno real</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t border-dashed border-[#f97316]"></span> Frontera descartada</span>
            </div>
          )}
          {viewMode === 'classification' && (
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#22c55e]"></span> Silueta</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#06b6d4]"></span> Extremidad</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#3b82f6]"></span> Detalle facial</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#eab308]"></span> Ojo</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#a78bfa]"></span> Relleno</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#f97316]"></span> Frontera relleno</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#64748b]"></span> Travel</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#ef4444]"></span> Artefacto</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div>
      <div className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-bold ${color}`}>{value}</div>
    </div>
  );
}