import { useState } from 'react';
import {
  Activity, Gauge, ShieldCheck, ShieldAlert, CheckCircle, XCircle,
  TrendingUp, Wrench, ChevronDown, ChevronRight, Layers, Route,
  Zap, Scissors, Grid2x2, Beaker, Play, AlertTriangle,
} from 'lucide-react';
import { runStabilityOptimizer } from '@/lib/stabilityOptimizer';

const PHASE_ICONS = {
  1: Activity, 2: Route, 3: Zap, 4: Grid2x2, 5: Layers,
  6: Beaker, 7: Scissors, 8: Play, 9: ShieldCheck,
};

const STATUS_STYLES = {
  SAFE:     { wrap: 'bg-emerald-900/20 border-emerald-500/40', text: 'text-emerald-400', icon: ShieldCheck },
  RISKY:    { wrap: 'bg-amber-900/20 border-amber-500/40',     text: 'text-amber-400',   icon: ShieldAlert },
  INVALID:  { wrap: 'bg-red-900/20 border-red-500/40',         text: 'text-red-400',     icon: ShieldAlert },
};

/**
 * StabilityOptimizerPanel — 9-phase stability optimization engine UI.
 * Shows indices, phase log, weighted score breakdown, and validation gate.
 */
export default function StabilityOptimizerPanel({ regions, config, machineSettings, onOptimized }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedPhase, setExpandedPhase] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 50));
    try {
      const res = runStabilityOptimizer(regions, config, machineSettings);
      setResult(res);
      if (onOptimized && res.regions) onOptimized(res.regions);
    } finally {
      setRunning(false);
    }
  };

  const statusKey = result
    ? (result.score >= 98 && result.canExport ? 'SAFE' : result.score >= 70 ? 'RISKY' : 'INVALID')
    : 'INVALID';
  const st = STATUS_STYLES[statusKey];

  return (
    <div className="space-y-4">
      {/* Header + run button */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-900/20 border border-violet-500/30 flex items-center justify-center">
          <Gauge className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Optimizador de Estabilidad</h3>
          <p className="text-[11px] text-slate-500">
            9 fases · objetivo ≥98/100 · nunca regenera el diseño, solo optimiza la costura.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !regions?.length}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold transition-colors"
        >
          {running
            ? <><Activity className="w-3.5 h-3.5 animate-spin" /> Optimizando...</>
            : <><Wrench className="w-3.5 h-3.5" /> Optimizar estabilidad</>}
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-3 bg-violet-900/10 border border-violet-500/20 rounded-lg p-3">
          <Activity className="w-4 h-4 text-violet-400 animate-spin" />
          <span className="text-xs text-violet-300">Ejecutando 9 fases de optimización...</span>
        </div>
      )}

      {result && !running && (
        <>
          {/* Stability score banner */}
          <div className={`${st.wrap} border rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <st.icon className={`w-5 h-5 ${st.text}`} />
              <span className={`text-sm font-bold ${st.text}`}>
                {statusKey === 'SAFE' ? 'Estabilidad SAFE — exportación permitida' : statusKey === 'RISKY' ? 'Estabilidad RISKY — revisar' : 'Estabilidad INVALID — bloqueado'}
              </span>
              <span className="text-3xl font-bold text-white ml-auto">{result.score}</span>
              <span className="text-xs text-slate-500">/100</span>
            </div>

            {/* Score breakdown */}
            <div className="space-y-1.5 mt-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Desglose de puntuación</div>
              {result.scoreBreakdown.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-400 w-32 truncate">{s.metric}</span>
                  <span className="text-slate-600 w-10">{s.weight}</span>
                  <div className="flex-1 h-1.5 bg-[#1e2130] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.score >= 90 ? 'bg-emerald-500' : s.score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                         style={{ width: `${s.score}%` }} />
                  </div>
                  <span className={`w-8 text-right font-bold ${s.score >= 90 ? 'text-emerald-400' : s.score >= 70 ? 'text-amber-400' : 'text-red-400'}`}>{s.score}</span>
                  <span className="w-10 text-right text-slate-500 font-mono">{s.contribution}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stability indices grid */}
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Índices de estabilidad</div>
            <div className="grid grid-cols-2 gap-2">
              <IndexCard label="Complejidad" value={result.indices.complexityIndex} />
              <IndexCard label="Densidad" value={result.indices.densityIndex} />
              <IndexCard label="Recorrido aguja" value={result.indices.needleTravelIndex} />
              <IndexCard label="Long. puntadas" value={result.indices.stitchLengthIndex} />
              <IndexCard label="Underlay" value={result.indices.underlayIndex} />
              <IndexCard label="Trims" value={result.indices.trimIndex} />
              <IndexCard label="Tensión hilo" value={result.indices.tensionIndex} />
              <IndexCard label="Eficiencia global" value={result.indices.globalEfficiency} />
            </div>
          </div>

          {/* Risk indices */}
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Riesgos (mayor = más seguro)</div>
            <div className="grid grid-cols-3 gap-2">
              <RiskCard label="Rotura hilo" value={result.indices.threadBreakRisk} />
              <RiskCard label="Fruncido" value={result.indices.puckeringRisk} />
              <RiskCard label="Desplaz. bastidor" value={result.indices.hoopDisplacementRisk} />
            </div>
          </div>

          {/* Phase log */}
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Fases de optimización</div>
            <div className="space-y-1.5">
              {result.phases.map((p) => {
                const Icon = PHASE_ICONS[p.phase] || Activity;
                const isExpanded = expandedPhase === p.phase;
                return (
                  <div key={p.phase} className="bg-[#0d0f14] border border-[#1e2130] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : p.phase)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#161a23] transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                      <Icon className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-[11px] font-bold text-slate-300">Fase {p.phase}: {p.name}</span>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 ml-auto" />
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-2.5 border-t border-[#1e2130] pt-2 space-y-1">
                        {p.changes.map((c, i) => (
                          <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1">
                            <span className="text-slate-600 shrink-0">•</span>
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation gate */}
          <div className="border-t border-[#1e2130] pt-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-white">Validación de exportación</span>
            </div>
            <div className="space-y-1">
              {result.validation.checks.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                  {c.passed
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  <span className={c.passed ? 'text-slate-300' : 'text-red-300'}>{c.label}</span>
                  <span className={`ml-auto font-mono ${c.passed ? 'text-emerald-400' : 'text-red-400'}`}>{c.value}</span>
                </div>
              ))}
            </div>
            <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border ${result.canExport ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-red-900/20 border-red-500/40'}`}>
              {result.canExport
                ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
                : <AlertTriangle className="w-4 h-4 text-red-400" />}
              <span className={`text-xs font-bold ${result.canExport ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.canExport ? 'Exportación PERMITIDA — diseño estable' : 'Exportación BLOQUEADA — diseño no cumple estabilidad'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function IndexCard({ label, value }) {
  const color = value >= 90 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-red-400';
  const bar = value >= 90 ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="bg-[#0d0f14] rounded-lg p-2.5 border border-[#1e2130]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </div>
      <div className="h-1 bg-[#1e2130] rounded-full overflow-hidden">
        <div className={`h-full ${bar} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function RiskCard({ label, value }) {
  const color = value >= 80 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="bg-[#0d0f14] rounded-lg p-2 text-center border border-[#1e2130]">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-slate-600">{label}</div>
    </div>
  );
}