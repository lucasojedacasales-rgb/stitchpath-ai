/**
 * AdaptiveEnginePanel.jsx — Visualización de Decisiones Adaptativas
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';

const TYPE_COLORS = {
  fill: 'text-violet-400 bg-violet-900/20 border-violet-700/40',
  satin: 'text-cyan-400 bg-cyan-900/20 border-cyan-700/40',
  running_stitch: 'text-slate-400 bg-slate-800/40 border-slate-700/40',
};

export default function AdaptiveEnginePanel({ regions }) {
  const [expandedId, setExpandedId] = useState(null);

  const adapted = regions.filter(r => r._adaptive);

  if (adapted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 p-4">
        <Zap className="w-6 h-6 opacity-40" />
        <p className="text-xs">Sin decisiones adaptativas</p>
      </div>
    );
  }

  const avgConf = +(
    adapted.reduce((s, r) => s + (r._adaptive?.overall_confidence || 0), 0) / adapted.length
  ).toFixed(0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-[#1e2130] bg-[#0a0c12]">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-3 h-3 text-yellow-400" />
          <span className="text-xs font-bold text-yellow-300">Motor Adaptativo</span>
          <span className="ml-auto text-[10px] text-slate-500">Confianza {avgConf}%</span>
        </div>
        <p className="text-[10px] text-slate-600">{adapted.length} regiones optimizadas</p>
      </div>

      {/* Regions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {adapted.map(r => (
          <RegionRow
            key={r.id}
            region={r}
            expanded={expandedId === r.id}
            onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RegionRow({ region, expanded, onToggle }) {
  const ad = region._adaptive || {};
  const metricsUsed = region._metrics_used || {};

  const typeClass = TYPE_COLORS[region.stitch_type] || TYPE_COLORS.fill;
  const confPct = Math.round(ad.overall_confidence * 100);
  const confColor =
    confPct >= 85 ? 'bg-emerald-500' : confPct >= 70 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="border border-[#1e2130] rounded overflow-hidden mb-1">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#161a23] transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-slate-600" />
                  : <ChevronRight className="w-3 h-3 text-slate-600" />}

        {/* Color swatch */}
        <div
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-white/10"
          style={{ background: region.color || '#888' }}
        />

        {/* Name */}
        <span className="flex-1 text-[10px] text-slate-300 truncate font-medium">
          {region.name || region.id}
        </span>

        {/* Type badge */}
        <span className={`text-[9px] font-bold border rounded px-1.5 py-0.5 flex-shrink-0 ${typeClass}`}>
          {region.stitch_type === 'fill' ? 'Fill' : region.stitch_type === 'satin' ? 'Satén' : 'Run'}
        </span>

        {/* Confidence bar */}
        <div className="w-16 h-1.5 bg-[#0a0c12] rounded flex-shrink-0 overflow-hidden">
          <div className={`h-full ${confColor}`} style={{ width: `${confPct}%` }} />
        </div>
        <span className="text-[9px] text-slate-500 w-6 text-right">{confPct}%</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#1e2130] px-3 py-2 bg-[#0a0c12] space-y-2 text-[10px]">
          {/* Reasoning */}
          {ad.stitch_type_reasoning && (
            <p className="text-slate-400 italic">
              Tipo: <span className="text-slate-300">{ad.stitch_type_reasoning}</span>
            </p>
          )}

          {/* Main parameters */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <Param label="Densidad" value={`${region.density} mm`} />
            <Param label="Largo puntada" value={`${region.stitch_length} mm`} />
            <Param label="Compensación" value={`${region.pull_compensation} mm`} />
            <Param label="Ángulo" value={`${region.angle}°`} />
            <Param label="Underlay" value={region.underlay ? region.underlay : 'ninguno'} />
            <Param label="Prioridad" value={`${region.priority}/5`} />
          </div>

          {/* Metrics used */}
          <div className="border-t border-[#1a1d27] pt-2 mt-2">
            <p className="text-slate-500 font-bold mb-1">Métricas utilizadas:</p>
            <div className="grid grid-cols-3 gap-2">
              {metricsUsed.area_mm2 != null && <MetricBadge label="área" val={`${metricsUsed.area_mm2.toFixed(0)}mm²`} />}
              {metricsUsed.avg_width_mm != null && <MetricBadge label="ancho" val={`${metricsUsed.avg_width_mm.toFixed(1)}mm`} />}
              {metricsUsed.convexity != null && <MetricBadge label="convex" val={metricsUsed.convexity.toFixed(2)} />}
              {metricsUsed.curvature != null && <MetricBadge label="curv" val={metricsUsed.curvature.toFixed(2)} />}
              {metricsUsed.complexity_score != null && <MetricBadge label="compl" val={metricsUsed.complexity_score.toFixed(2)} />}
              {metricsUsed.inertia_ratio != null && <MetricBadge label="inercia" val={metricsUsed.inertia_ratio.toFixed(1)} />}
            </div>
          </div>

          {/* Angle source */}
          {ad.angle_source && (
            <div className="border-t border-[#1a1d27] pt-2 mt-2 text-slate-400">
              <span className="text-slate-500">Ángulo: </span>
              {ad.angle_source === 'pca' && 'PCA geométrico (95% confianza)'}
              {ad.angle_source === 'vectorizer' && 'Vectorizador (88% confianza)'}
              {ad.angle_source === 'color_coherent' && 'Coherencia de color (70% confianza)'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Param({ label, value }) {
  return (
    <>
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </>
  );
}

function MetricBadge({ label, val }) {
  return (
    <span className="text-[9px] bg-[#161a23] border border-[#2a2d3a] rounded px-1 py-0.5 text-slate-400">
      {label} <span className="text-slate-300 font-bold">{val}</span>
    </span>
  );
}