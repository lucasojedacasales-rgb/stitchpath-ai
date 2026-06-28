import { useState, useMemo } from 'react';
import { Zap, TrendingDown, Scissors, Palette, Route, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { optimizeTravelPath, formatTime, formatThread } from '@/lib/travelOptimizer';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SavingCard({ icon: Icon, label, value, unit, color, sub }) {
  const colors = {
    violet: 'border-violet-500/30 bg-violet-900/10 text-violet-400',
    cyan:   'border-cyan-500/30   bg-cyan-900/10   text-cyan-400',
    amber:  'border-amber-500/30  bg-amber-900/10  text-amber-400',
    emerald:'border-emerald-500/30 bg-emerald-900/10 text-emerald-400',
    rose:   'border-rose-500/30   bg-rose-900/10   text-rose-400',
  };
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-black leading-none">{value}</span>
        <span className="text-sm font-bold mb-0.5">{unit}</span>
      </div>
      {sub && <span className="text-[10px] opacity-60">{sub}</span>}
    </div>
  );
}

function MetricRow({ label, before, after, unit }) {
  const saved = before - after;
  const pct   = before > 0 ? Math.round((saved / before) * 100) : 0;
  const improved = saved > 0;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#1a1d27] last:border-0">
      <span className="text-[11px] text-slate-400 w-28 shrink-0">{label}</span>
      <span className="text-[11px] text-slate-600 line-through w-14 text-right">{before}{unit}</span>
      <span className="text-[11px] font-bold text-white w-14 text-right">{after}{unit}</span>
      {improved
        ? <span className="text-[10px] font-bold text-emerald-400 ml-auto">↓ {pct}%</span>
        : <span className="text-[10px] text-slate-600 ml-auto">—</span>
      }
    </div>
  );
}

function ColorSequenceRow({ group, index }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-slate-600 w-4 text-right">{index + 1}</span>
      <div className="w-3 h-3 rounded-full border border-white/10 shrink-0" style={{ background: group.color }} />
      <span className="text-[10px] text-slate-400 flex-1 truncate">{group.color}</span>
      <span className="text-[10px] text-slate-600">{group.count} reg.</span>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function TravelOptimizerPanel({ regions, onApplyOrder }) {
  const [result, setResult]     = useState(null);
  const [running, setRunning]   = useState(false);
  const [applied, setApplied]   = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const validCount = useMemo(
    () => regions.filter(r => r.path_points?.length >= 3 && r.visible !== false).length,
    [regions]
  );

  const run = () => {
    setRunning(true);
    setApplied(false);
    // Small timeout so UI can render the spinner before blocking JS
    setTimeout(() => {
      const res = optimizeTravelPath(regions);
      setResult(res);
      setRunning(false);
    }, 50);
  };

  const applyOrder = () => {
    if (!result) return;
    onApplyOrder(result.optimizedSequence);
    setApplied(true);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0f14] overflow-y-auto">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e2130]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Route className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h2 className="text-sm font-bold text-white">Travel Optimizer</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 border border-violet-500/30 text-violet-400 font-bold">MOTOR</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Reordena las regiones para minimizar saltos, cortes y cambios de hilo usando TSP greedy + agrupación por color.
        </p>
      </div>

      {/* Run */}
      <div className="px-4 py-3 border-b border-[#1e2130]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-slate-500">{validCount} regiones analizables</span>
        </div>
        <button
          onClick={run}
          disabled={running || validCount === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
        >
          {running
            ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Optimizando...</>
            : <><Zap className="w-3.5 h-3.5" /> Ejecutar optimización</>
          }
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="flex-1 px-4 py-3 space-y-4">

          {/* Overall saving badge */}
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <div className="text-5xl font-black text-emerald-400 leading-none">{result.overallSaving}%</div>
              <div className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">Ahorro conseguido</div>
            </div>
          </div>

          {/* Saving cards grid */}
          <div className="grid grid-cols-2 gap-2">
            <SavingCard
              icon={TrendingDown}
              label="Tiempo"
              value={`↓${result.savings.time}%`}
              unit=""
              color="violet"
              sub={`${formatTime(result.before.totalTimeSec)} → ${formatTime(result.after.totalTimeSec)}`}
            />
            <SavingCard
              icon={Scissors}
              label="Cortes"
              value={`↓${result.savings.cuts}%`}
              unit=""
              color="rose"
              sub={`${result.before.cuts} → ${result.after.cuts} cortes`}
            />
            <SavingCard
              icon={Route}
              label="Saltos"
              value={`↓${result.savings.jumps}%`}
              unit=""
              color="cyan"
              sub={`${result.before.jumps} → ${result.after.jumps} saltos`}
            />
            <SavingCard
              icon={Palette}
              label="Cambios hilo"
              value={`↓${result.savings.colorChanges}%`}
              unit=""
              color="amber"
              sub={`${result.before.colorChanges} → ${result.after.colorChanges} cambios`}
            />
          </div>

          {/* Thread saving */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-900/10 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-base">🧵</span>
              <div>
                <div className="text-[11px] font-semibold text-emerald-300">Hilo ahorrado</div>
                <div className="text-[10px] text-slate-500">{formatThread(result.before.threadMm)} → {formatThread(result.after.threadMm)}</div>
              </div>
            </div>
            <span className="text-lg font-black text-emerald-400">↓{result.savings.thread}%</span>
          </div>

          {/* Jump distance saved */}
          {result.savings.jumpDistMm > 0 && (
            <div className="text-[11px] text-center text-slate-500">
              Recorrido de cabezal reducido en{' '}
              <span className="text-white font-semibold">{Math.round(result.savings.jumpDistMm)} mm</span>
            </div>
          )}

          {/* Detailed comparison toggle */}
          <button
            onClick={() => setShowDetail(d => !d)}
            className="w-full flex items-center justify-between py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors border-t border-[#1a1d27]"
          >
            <span>Comparativa detallada</span>
            {showDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {showDetail && (
            <div className="rounded-lg border border-[#1e2130] bg-[#0a0c12] px-3 py-1">
              <MetricRow label="Saltos totales"   before={result.before.jumps}        after={result.after.jumps}        unit="" />
              <MetricRow label="Cortes de hilo"   before={result.before.cuts}         after={result.after.cuts}         unit="" />
              <MetricRow label="Cambios de color" before={result.before.colorChanges} after={result.after.colorChanges} unit="" />
              <MetricRow label="Distancia saltos" before={result.before.jumpDistanceMm} after={result.after.jumpDistanceMm} unit=" mm" />
              <MetricRow label="Tiempo total"     before={result.before.totalTimeSec} after={result.after.totalTimeSec} unit="s" />
              <MetricRow label="Hilo utilizado"   before={Math.round(result.before.threadMm / 10)} after={Math.round(result.after.threadMm / 10)} unit=" cm" />
            </div>
          )}

          {/* Color sequence toggle */}
          <button
            onClick={() => setShowColors(d => !d)}
            className="w-full flex items-center justify-between py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors border-t border-[#1a1d27]"
          >
            <span>Secuencia de color optimizada</span>
            {showColors ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {showColors && (
            <div className="rounded-lg border border-[#1e2130] bg-[#0a0c12] px-3 py-2 max-h-40 overflow-y-auto">
              {result.colorGroups.map((g, i) => (
                <ColorSequenceRow key={g.color + i} group={g} index={i} />
              ))}
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={applyOrder}
            disabled={applied}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors ${
              applied
                ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 cursor-default'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {applied
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Orden aplicado</>
              : <><Route className="w-3.5 h-3.5" /> Aplicar orden optimizado</>
            }
          </button>
        </div>
      )}

      {/* Empty state */}
      {!result && !running && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-10">
          <div className="w-12 h-12 rounded-full bg-violet-900/20 border border-violet-500/20 flex items-center justify-center">
            <Route className="w-6 h-6 text-violet-500 opacity-60" />
          </div>
          <p className="text-xs text-slate-600">
            Analiza el recorrido actual y calcula la secuencia óptima para reducir tiempo de máquina y consumo de hilo.
          </p>
        </div>
      )}
    </div>
  );
}