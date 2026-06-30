import { useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp, Zap, StopCircle, History } from 'lucide-react';
import { evaluateResult, adjustConfig, CRITERIA } from '@/lib/autoIterationEngine';

const MAX_ITERATIONS = 10;
const PERFECT_SCORE  = 8;

export default function AutoIterationPanel({ regions, config, onConfigChange, onReprocess }) {
  const [running,    setRunning]    = useState(false);
  const [stopped,    setStopped]    = useState(false);
  const [history,    setHistory]    = useState([]);   // [{iteration, config, eval, changes}]
  const [expanded,   setExpanded]   = useState(null); // expanded iteration index
  const [showHist,   setShowHist]   = useState(false);
  const stopRef = { current: false };

  const handleStart = useCallback(async () => {
    if (regions.length === 0) return;
    setRunning(true);
    setStopped(false);
    setHistory([]);
    stopRef.current = false;

    let currentConfig = { ...config };
    let iterHistory   = [];

    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
      if (stopRef.current) { setStopped(true); break; }

      // Evaluate current regions with current config
      const evalResult = evaluateResult(regions, currentConfig);

      const record = {
        iteration: iter,
        config:    { ...currentConfig },
        eval:      evalResult,
        changes:   [],
      };

      if (evalResult.score >= PERFECT_SCORE) {
        record.status = 'perfect';
        iterHistory = [...iterHistory, record];
        setHistory([...iterHistory]);
        break;
      }

      // Adjust config for next pass
      const { newConfig, changes } = adjustConfig(evalResult.failures, currentConfig, iter);
      record.changes = changes;
      record.status  = evalResult.score >= 7 ? 'acceptable' : 'needs_work';

      iterHistory = [...iterHistory, record];
      setHistory([...iterHistory]);

      if (iter < MAX_ITERATIONS) {
        // Apply new config and trigger reprocess
        currentConfig = newConfig;
        onConfigChange(newConfig);
        await onReprocess(newConfig);
        // Small yield so React can re-render
        await new Promise(r => setTimeout(r, 200));
      } else {
        // Final iteration
        record.status = 'best_effort';
      }
    }

    setRunning(false);
  }, [regions, config, onConfigChange, onReprocess]);

  const handleStop = () => { stopRef.current = true; };

  const bestIter = history.reduce((best, h) =>
    (!best || h.eval.score > best.eval.score) ? h : best, null);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">Motor de Auto-Corrección</p>
          <p className="text-[10px] text-slate-500">Evalúa 8 criterios • máx {MAX_ITERATIONS} iteraciones</p>
        </div>
        <div className="flex gap-1.5">
          {history.length > 0 && (
            <button
              onClick={() => setShowHist(v => !v)}
              className="p-1.5 rounded-lg border border-[#2a2d3a] text-slate-400 hover:text-white text-xs transition-colors"
              title="Historial"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" /> Detener
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={regions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
            >
              <Zap className="w-3.5 h-3.5" />
              {history.length > 0 ? 'Reiniciar' : 'Iniciar'}
            </button>
          )}
        </div>
      </div>

      {/* Current eval (live) — show the latest iteration's eval */}
      {running && history.length > 0 && (
        <LiveEvalCard iter={history[history.length - 1]} />
      )}

      {/* Best result summary */}
      {!running && bestIter && (
        <BestResultCard iter={bestIter} />
      )}

      {/* History */}
      {showHist && history.length > 0 && (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {[...history].reverse().map((h, i) => (
            <IterationCard
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
        <p className="text-[11px] text-slate-600 text-center py-3">
          Procesa primero una imagen para iniciar la evaluación
        </p>
      )}
    </div>
  );
}

function LiveEvalCard({ iter }) {
  return (
    <div className="bg-[#0d0f14] border border-violet-500/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-violet-400 font-semibold">
          Iteración {iter.iteration} · Evaluando...
        </span>
        <span className="text-xs font-bold text-white">{iter.eval.score}/8</span>
      </div>
      <CriteriaGrid ev={iter.eval} />
    </div>
  );
}

function BestResultCard({ iter }) {
  const isPerfect = iter.eval.score === 8;
  const isAcceptable = iter.eval.score >= 7;
  return (
    <div className={`border rounded-lg p-3 ${
      isPerfect    ? 'border-emerald-500/40 bg-emerald-900/10' :
      isAcceptable ? 'border-cyan-500/30 bg-cyan-900/10' :
                     'border-amber-500/30 bg-amber-900/10'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-semibold ${
          isPerfect ? 'text-emerald-400' : isAcceptable ? 'text-cyan-400' : 'text-amber-400'
        }`}>
          {isPerfect ? '✅ PERFECTO' : isAcceptable ? '⚡ ACEPTABLE' : '🔄 MEJOR ESFUERZO'} — Iter {iter.iteration}
        </span>
        <ScoreBadge score={iter.eval.score} />
      </div>
      <CriteriaGrid ev={iter.eval} compact />
    </div>
  );
}

function IterationCard({ iter, expanded, onToggle }) {
  const { eval: ev, changes } = iter;
  return (
    <div className="border border-[#1e2130] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#0a0c12] hover:bg-[#10131b] transition-colors"
      >
        <div className="flex items-center gap-2">
          <StatusDot status={iter.status} />
          <span className="text-[11px] text-white font-medium">Iteración {iter.iteration}</span>
          {changes.length > 0 && (
            <span className="text-[10px] text-slate-500">{changes.length} ajuste{changes.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={ev.score} />
          {expanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-[#0d0f14] flex flex-col gap-2">
          <CriteriaGrid ev={ev} />
          {changes.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 font-medium mb-1">Ajustes aplicados:</p>
              {changes.map((c, i) => (
                <div key={i} className="text-[10px] text-amber-400 flex items-start gap-1">
                  <span className="mt-0.5">→</span><span>{c}</span>
                </div>
              ))}
            </div>
          )}
          {iter.eval.failures.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 font-medium mb-1">Criterios fallidos:</p>
              {iter.eval.failures.map(f => (
                <div key={f} className="text-[10px] text-red-400">
                  {CRITERIA[f]?.name}: {iter.eval[f]?.note}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CriteriaGrid({ ev, compact }) {
  return (
    <div className={`grid grid-cols-4 gap-1 ${compact ? '' : 'gap-y-1.5'}`}>
      {Object.keys(CRITERIA).map(k => (
        <div
          key={k}
          title={`${CRITERIA[k].name}: ${ev[k]?.note || ''}`}
          className={`flex items-center gap-1 ${compact ? '' : 'col-span-2'}`}
        >
          {ev[k]?.pass
            ? <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            : <XCircle    className="w-3 h-3 text-red-400    flex-shrink-0" />
          }
          {!compact && <span className="text-[10px] text-slate-400 truncate">{CRITERIA[k].name}</span>}
          {compact && <span className="text-[10px] text-slate-500">{k}</span>}
        </div>
      ))}
    </div>
  );
}

function ScoreBadge({ score }) {
  const color = score === 8 ? 'text-emerald-400' : score >= 6 ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-xs font-bold font-mono ${color}`}>{score}/8</span>;
}

function StatusDot({ status }) {
  const color =
    status === 'perfect'     ? 'bg-emerald-400' :
    status === 'acceptable'  ? 'bg-cyan-400'    :
    status === 'best_effort' ? 'bg-amber-400'   : 'bg-red-400';
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}