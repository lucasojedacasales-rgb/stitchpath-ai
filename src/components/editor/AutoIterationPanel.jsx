import { useState, useRef, useCallback } from 'react';
import { Zap, StopCircle, History, ChevronDown, ChevronUp, TrendingUp, Award, AlertTriangle } from 'lucide-react';
import { evaluateQuality, adjustParameters, shouldStop, METRICS } from '@/lib/autoIterationEngine';

const MAX_ITERATIONS = 15;

export default function AutoIterationPanel({ regions, config, onConfigChange, onReprocess }) {
  const [running,  setRunning]  = useState(false);
  const [history,  setHistory]  = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const stopRef   = useRef(false);
  const histRef   = useRef([]);

  const handleStart = useCallback(async () => {
    if (regions.length === 0) return;
    setRunning(true);
    stopRef.current  = false;
    histRef.current  = [];
    setHistory([]);

    let currentConfig = { ...config };
    let currentRegions = regions;

    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
      if (stopRef.current) break;

      // 1. Evaluar regiones actuales
      const evalResult = evaluateQuality(currentRegions, currentConfig);

      const record = {
        iteration: iter,
        config:    { ...currentConfig },
        quality:   evalResult.quality,
        breakdown: evalResult.breakdown,
        weakest:   evalResult.weakest,
        scores:    evalResult.scores,
        changes:   [],
        status:    evalResult.quality >= 98 ? 'perfect' : evalResult.quality >= 85 ? 'excellent' : evalResult.quality >= 70 ? 'good' : 'needs_work',
      };

      histRef.current = [...histRef.current, record];
      setHistory([...histRef.current]);

      // 2. Comprobar si parar
      if (shouldStop(histRef.current, MAX_ITERATIONS)) break;
      if (stopRef.current) break;

      // 3. Ajustar parámetros
      const { newConfig, changes } = adjustParameters(evalResult.scores, evalResult.quality, currentConfig, iter);
      record.changes = changes;

      // 4. Aplicar config y reprocesar
      currentConfig = newConfig;
      onConfigChange(newConfig);
      await new Promise(r => setTimeout(r, 50)); // yield para React
      await onReprocess(newConfig);
      // Dar tiempo a que setRegions se propague — idealmente esperaríamos el resultado
      await new Promise(r => setTimeout(r, 300));

      // 5. Leer regiones actualizadas desde el DOM (las recibimos como prop actualizada)
      currentRegions = regions; // Nota: en el siguiente ciclo props ya se habrán actualizado
    }

    setRunning(false);
  }, [regions, config, onConfigChange, onReprocess]);

  const handleStop = () => { stopRef.current = true; };

  const best = history.reduce((b, h) => (!b || h.quality > b.quality) ? h : b, null);
  const latest = history[history.length - 1] || null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1e2130] p-3 bg-[#0a0c12]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs font-bold text-white">Optimización Iterativa</p>
            <p className="text-[10px] text-slate-500">26 métricas · calidad 0-100 · máx {MAX_ITERATIONS} iter.</p>
          </div>
          <div className="flex gap-1.5">
            {history.length > 0 && (
              <button
                onClick={() => setShowHist(v => !v)}
                className="p-1.5 rounded border border-[#2a2d3a] text-slate-500 hover:text-white transition-colors"
                title="Historial"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            )}
            {running ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors"
              >
                <StopCircle className="w-3.5 h-3.5" /> Detener
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={regions.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Zap className="w-3.5 h-3.5" />
                {history.length > 0 ? 'Reiniciar' : 'Optimizar'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {running && latest && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-500">Iteración {latest.iteration}/{MAX_ITERATIONS}</span>
              <span className="text-violet-300 font-bold">{latest.quality}/100</span>
            </div>
            <div className="w-full bg-[#1e2130] rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${qualityColor(latest.quality, 'bg')}`}
                style={{ width: `${latest.quality}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Best result summary */}
        {best && !running && (
          <BestCard iter={best} />
        )}

        {/* Quality chart (mini sparkline) */}
        {history.length > 1 && (
          <QualitySparkline history={history} />
        )}

        {/* Live evaluation */}
        {running && latest && (
          <MetricsBreakdown iter={latest} />
        )}

        {/* Weakest metrics */}
        {latest && latest.weakest?.length > 0 && (
          <WeakestMetrics metrics={latest.weakest} />
        )}

        {/* Iteration history */}
        {showHist && history.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Historial</p>
            {[...history].reverse().map(h => (
              <IterCard
                key={h.iteration}
                iter={h}
                expanded={expanded === h.iteration}
                onToggle={() => setExpanded(expanded === h.iteration ? null : h.iteration)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!running && history.length === 0 && (
          <div className="text-center py-8 text-slate-600">
            <div className="text-3xl mb-2">🎯</div>
            <p className="text-xs">Procesa una imagen y pulsa<br />Optimizar para iniciar</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BestCard({ iter }) {
  const isPerfect = iter.quality >= 98;
  const isExcellent = iter.quality >= 85;
  return (
    <div className={`rounded-lg p-3 border ${isPerfect ? 'border-emerald-500/40 bg-emerald-900/10' : isExcellent ? 'border-cyan-500/30 bg-cyan-900/10' : 'border-amber-500/30 bg-amber-900/10'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Award className={`w-4 h-4 ${isPerfect ? 'text-emerald-400' : isExcellent ? 'text-cyan-400' : 'text-amber-400'}`} />
          <span className={`text-xs font-bold ${isPerfect ? 'text-emerald-400' : isExcellent ? 'text-cyan-400' : 'text-amber-400'}`}>
            {isPerfect ? 'PERFECTO' : isExcellent ? 'EXCELENTE' : 'MEJOR RESULTADO'} — Iter {iter.iteration}
          </span>
        </div>
        <QualityBadge quality={iter.quality} large />
      </div>
      <GroupBreakdown breakdown={iter.breakdown} />
    </div>
  );
}

function QualitySparkline({ history }) {
  const max = 100, min = 0;
  const W = 240, H = 36;
  const pts = history.map((h, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - ((h.quality - min) / (max - min)) * H;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-2">
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Progresión</span>
        {history.length > 1 && (
          <span className={`font-bold ${history[history.length-1].quality > history[0].quality ? 'text-emerald-400' : 'text-red-400'}`}>
            {history[history.length-1].quality > history[0].quality ? '+' : ''}{history[history.length-1].quality - history[0].quality} pts
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round" />
        {history.map((h, i) => {
          const x = history.length > 1 ? (i / (history.length - 1)) * W : W / 2;
          const y = H - ((h.quality - min) / (max - min)) * H;
          return <circle key={i} cx={x} cy={y} r="2.5" fill={qualityColor(h.quality, 'hex')} />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
        {history.map(h => <span key={h.iteration}>{h.quality}</span>)}
      </div>
    </div>
  );
}

function MetricsBreakdown({ iter }) {
  return (
    <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-2.5">
      <p className="text-[10px] text-slate-500 font-semibold mb-2">Análisis por grupo</p>
      <GroupBreakdown breakdown={iter.breakdown} />
    </div>
  );
}

function GroupBreakdown({ breakdown }) {
  if (!breakdown) return null;
  return (
    <div className="flex flex-col gap-1">
      {Object.entries(breakdown).map(([group, score]) => (
        <div key={group} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-20 truncate">{group}</span>
          <div className="flex-1 bg-[#1e2130] rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${qualityColor(score, 'bg')}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono font-bold w-8 text-right ${qualityColor(score, 'text')}`}>{score}</span>
        </div>
      ))}
    </div>
  );
}

function WeakestMetrics({ metrics }) {
  return (
    <div className="bg-[#0a0c12] border border-amber-500/20 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        <p className="text-[10px] text-amber-400 font-semibold">Métricas más débiles</p>
      </div>
      {metrics.slice(0, 4).map(m => (
        <div key={m.id} className="flex items-start gap-2 mb-1.5">
          <span className={`text-[10px] font-mono font-bold w-8 flex-shrink-0 ${qualityColor(m.score, 'text')}`}>{m.score}</span>
          <div>
            <p className="text-[10px] text-slate-300 leading-tight">{m.name}</p>
            <p className="text-[10px] text-slate-600 leading-tight">{m.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function IterCard({ iter, expanded, onToggle }) {
  return (
    <div className="border border-[#1e2130] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#0a0c12] hover:bg-[#10131b] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${qualityColor(iter.quality, 'bg')}`} />
          <span className="text-[11px] text-white font-medium">Iter {iter.iteration}</span>
          {iter.changes?.length > 0 && (
            <span className="text-[10px] text-slate-500">{iter.changes.length} ajuste{iter.changes.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <QualityBadge quality={iter.quality} />
          {expanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-[#0d0f14] flex flex-col gap-2">
          <GroupBreakdown breakdown={iter.breakdown} />
          {iter.weakest?.length > 0 && (
            <WeakestMetrics metrics={iter.weakest} />
          )}
          {iter.changes?.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 font-semibold mb-1">Ajustes aplicados:</p>
              {iter.changes.map((c, i) => (
                <div key={i} className="text-[10px] text-cyan-400 flex gap-1">
                  <span>→</span><span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QualityBadge({ quality, large }) {
  const cls = large ? 'text-base font-black' : 'text-xs font-bold font-mono';
  return <span className={`${cls} ${qualityColor(quality, 'text')}`}>{quality}<span className="text-slate-600 text-[10px]">/100</span></span>;
}

function qualityColor(score, type) {
  if (score >= 90) return type === 'bg' ? 'bg-emerald-400' : type === 'text' ? 'text-emerald-400' : '#34d399';
  if (score >= 75) return type === 'bg' ? 'bg-cyan-400'    : type === 'text' ? 'text-cyan-400'    : '#22d3ee';
  if (score >= 55) return type === 'bg' ? 'bg-amber-400'   : type === 'text' ? 'text-amber-400'   : '#fbbf24';
  return              type === 'bg' ? 'bg-red-400'     : type === 'text' ? 'text-red-400'     : '#f87171';
}