import { useState } from 'react';
import {
  Route, ShieldCheck, ShieldAlert, CheckCircle, XCircle,
  Zap, Scissors, Layers, Activity, ArrowRight, RefreshCw,
} from 'lucide-react';
import { optimizeCE01TravelPath } from '@/lib/ce01TravelPathOptimizer';

/**
 * TravelPathOptimizerPanel — reduces jumps and trims by reordering
 * sewing blocks and optimizing the travel path.
 *
 * Works ONLY on finalEmbroideryCommands (read-only input).
 * Transactional: applies only if jumps −20% AND trims −20%.
 * Never touches regions, vectors, colors, or visual types.
 */
export default function TravelPathOptimizerPanel({
  regions, config, machineSettings,
  finalCommands, onOptimizationApplied, onOptimizationDiscarded,
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    await new Promise(r => setTimeout(r, 50));
    try {
      const res = optimizeCE01TravelPath(finalCommands, regions, machineSettings);
      setResult(res);
      if (res.applied && onOptimizationApplied) {
        console.log('[travel-opt] applied — updating finalEmbroideryCommands');
        onOptimizationApplied(res.commands);
      } else if (!res.applied && onOptimizationDiscarded) {
        console.log('[travel-opt] discarded — finalEmbroideryCommands unchanged');
        onOptimizationDiscarded(res);
      }
    } finally {
      setRunning(false);
    }
  };

  const r = result?.report;

  return (
    <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold text-white">Travel Path Optimizer</span>
        <span className="text-[10px] text-slate-500 ml-auto">CE01</span>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Reordena bloques de costura (fills → detalles → contornos) y optimiza el travel path
        con nearest-neighbor. Reduce saltos y trims sin cambiar el diseño visual.
        Solo aplica si saltos −20% y trims −20%.
      </p>

      <button
        onClick={handleRun}
        disabled={running || !finalCommands || finalCommands.length === 0}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
      >
        {running ? (
          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Optimizando...</>
        ) : (
          <><Route className="w-3.5 h-3.5" /> Optimizar Travel Path</>
        )}
      </button>

      {result && r && (
        <div className="space-y-2.5">
          {/* Status banner */}
          <div className={`border rounded-lg p-2.5 ${
            r.applied
              ? 'bg-emerald-900/15 border-emerald-500/30'
              : 'bg-amber-900/15 border-amber-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {r.applied
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <ShieldAlert className="w-4 h-4 text-amber-400" />}
              <span className={`text-[11px] font-bold ${
                r.applied ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {r.applied ? 'Optimización aplicada' : 'Travel optimization discarded'}
              </span>
            </div>
            {!r.applied && r.discardedReason && (
              <p className="text-[10px] text-amber-300 mt-1">{r.discardedReason}</p>
            )}
          </div>

          {/* Before / After comparison */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#161a23] border border-[#1e2130] rounded-lg p-2.5">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Antes</div>
              <MetricRow icon={Zap} label="Saltos" value={r.jumpsBefore} color="text-red-400" />
              <MetricRow icon={Scissors} label="Trims" value={r.trimsBefore} color="text-amber-400" />
            </div>
            <div className="bg-[#161a23] border border-[#1e2130] rounded-lg p-2.5">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Después</div>
              <MetricRow icon={Zap} label="Saltos" value={r.jumpsAfter} color={
                r.jumpsAfter < r.jumpsBefore ? 'text-emerald-400' : 'text-red-400'
              } />
              <MetricRow icon={Scissors} label="Trims" value={r.trimsAfter} color={
                r.trimsAfter < r.trimsBefore ? 'text-emerald-400' : 'text-amber-400'
              } />
            </div>
          </div>

          {/* Reduction percentages */}
          {r.applied && (
            <div className="flex items-center gap-3 text-[10px] bg-cyan-900/10 border border-cyan-500/20 rounded-lg px-2.5 py-2">
              <ArrowRight className="w-3 h-3 text-cyan-400" />
              <span className="text-cyan-300">
                Saltos: −{Math.round((1 - r.jumpsAfter / Math.max(r.jumpsBefore, 1)) * 100)}%
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-cyan-300">
                Trims: −{Math.round((1 - r.trimsAfter / Math.max(r.trimsBefore, 1)) * 100)}%
              </span>
            </div>
          )}

          {/* Block breakdown */}
          <div className="bg-[#161a23] border border-[#1e2130] rounded-lg p-2.5">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Bloques</div>
            <div className="grid grid-cols-3 gap-1.5">
              <BlockStat icon={Layers} label="Fills" value={r.fills} color="text-violet-400" />
              <BlockStat icon={Activity} label="Detalles" value={r.details} color="text-cyan-400" />
              <BlockStat icon={Route} label="Contornos" value={r.outlines} color="text-amber-400" />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <span className="text-slate-600">Total: <span className="text-slate-400 font-bold">{r.blocksBuilt}</span></span>
              <span className={r.detailBlocksPreserved ? 'text-emerald-400' : 'text-red-400'}>
                {r.detailBlocksPreserved ? '✓' : '✗'} Detalles preservados
              </span>
              <span className={r.outlineBlocksPreserved ? 'text-emerald-400' : 'text-red-400'}>
                {r.outlineBlocksPreserved ? '✓' : '✗'} Contornos preservados
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-3 h-3 ${color} flex-shrink-0`} />
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${color} ml-auto`}>{value}</span>
    </div>
  );
}

function BlockStat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#0d0f14] rounded p-1.5 text-center border border-[#1e2130]">
      <Icon className={`w-3 h-3 ${color} mx-auto mb-0.5`} />
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[8px] text-slate-600">{label}</div>
    </div>
  );
}