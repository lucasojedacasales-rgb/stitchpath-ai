import { useState, useRef, useCallback } from 'react';
import { Zap, StopCircle, CheckCircle2, XCircle, AlertCircle, Award } from 'lucide-react';
import { evaluateCriteria, generateCalibrationAdjustments, postProcessRegions } from '@/lib/calibrationEngine';
import { runPipeline } from '@/lib/pipeline/runner';

const MAX_ITER = 20;

const CRITERIA_LABELS = {
  c1:  'Fondo no genera puntadas',
  c2:  'Contornos cerrados',
  c3:  'Sin sobre-segmentación',
  c4:  'Sin fusión agresiva',
  c5:  'Nombres semánticos',
  c6:  'Clasificación de puntada',
  c7:  'Ángulos coherentes',
  c8:  'Densidad razonable (6k-12k)',
  c9:  'Colores mapeados (≤8)',
  c10: 'Preview sin artefactos',
};

export default function CalibrationPanel({ imageUrl, config, onConfigChange, onRegionsUpdate }) {
  const [running,  setRunning]  = useState(false);
  const [log,      setLog]      = useState([]);
  const [current,  setCurrent]  = useState(null); // evaluación actual
  const stopRef = useRef(false);

  const appendLog = (entry) => setLog(prev => [...prev, entry]);

  const handleStart = useCallback(async () => {
    if (!imageUrl) return;
    setRunning(true);
    stopRef.current = false;
    setLog([]);
    setCurrent(null);

    let currentConfig = { ...config };
    let bestRegions   = [];
    let bestScore     = -1;
    let bestConfig    = { ...config };

    for (let iter = 1; iter <= MAX_ITER; iter++) {
      if (stopRef.current) break;

      // ── Paso 1: Ejecutar pipeline con config actual ────────────────────────
      appendLog({ type: 'running', iter, msg: `Ejecutando pipeline (iter ${iter})...`, config: { ...currentConfig } });

      let pipelineRegions = [];
      try {
        const ctx = await runPipeline(imageUrl, currentConfig, {});
        pipelineRegions = ctx.regions || [];
      } catch (e) {
        appendLog({ type: 'error', iter, msg: `Pipeline falló: ${e.message}` });
        break;
      }

      if (pipelineRegions.length === 0) {
        appendLog({ type: 'error', iter, msg: 'Pipeline no generó regiones' });
        break;
      }

      // ── Paso 2: Post-procesado (fondo + nombres semánticos) ───────────────
      const processed = postProcessRegions(pipelineRegions, currentConfig);
      onRegionsUpdate(processed);
      onConfigChange(currentConfig);
      await new Promise(r => setTimeout(r, 100));

      // ── Paso 3: Evaluación de los 10 criterios ────────────────────────────
      const evalResult = evaluateCriteria(processed, currentConfig);
      setCurrent(evalResult);

      // Construir reporte
      const report = {
        type:     'report',
        iter,
        score:    evalResult.score,
        passed:   evalResult.passed,
        regions:  processed.filter(r => !r.is_background).length,
        stitches: processed.filter(r => !r.is_background).reduce((s,r) => s+(r.stitch_count||0),0),
        colors:   new Set(processed.filter(r => !r.is_background).map(r => r.color)).size,
        criteria: evalResult.criteria,
        config:   { ...currentConfig },
      };

      // ── Paso 4: Guardar mejor resultado ───────────────────────────────────
      if (evalResult.score > bestScore) {
        bestScore   = evalResult.score;
        bestRegions = processed;
        bestConfig  = { ...currentConfig };
      }

      appendLog(report);

      // ── Paso 5: Criterio de parada ─────────────────────────────────────────
      if (evalResult.score >= 10 || evalResult.passed === 10) {
        appendLog({ type: 'success', iter, msg: `CALIBRACIÓN COMPLETADA: ${evalResult.score}/10` });
        break;
      }

      if (iter === MAX_ITER) {
        appendLog({ type: 'warning', iter, msg: `Máximo de iteraciones alcanzado. Mejor resultado: ${bestScore}/10` });
        break;
      }

      // ── Paso 6: Generar ajustes ─────────────────────────────────────────────
      const { newConfig, changes } = generateCalibrationAdjustments(evalResult, currentConfig, iter);
      appendLog({ type: 'adjust', iter, changes });
      currentConfig = newConfig;
    }

    // Restaurar mejor resultado
    if (bestRegions.length > 0) {
      onRegionsUpdate(bestRegions);
      onConfigChange(bestConfig);
    }

    setRunning(false);
  }, [imageUrl, config, onConfigChange, onRegionsUpdate]);

  const handleStop = () => { stopRef.current = true; };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0a0c12]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1e2130]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">Calibración Automática</p>
            <p className="text-[10px] text-slate-500">10 criterios · máx {MAX_ITER} iteraciones · objetivo 10/10</p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors">
                <StopCircle className="w-3.5 h-3.5" /> Detener
              </button>
            ) : (
              <button onClick={handleStart} disabled={!imageUrl} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40">
                <Zap className="w-3.5 h-3.5" /> {log.length > 0 ? 'Re-calibrar' : 'Iniciar'}
              </button>
            )}
          </div>
        </div>

        {/* Criterios actuales en tiempo real */}
        {current && (
          <div className="mt-3 grid grid-cols-2 gap-1">
            {Object.entries(current.criteria).map(([key, val]) => (
              <div key={key} className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded ${val.pass ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}`}>
                {val.pass
                  ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  : <XCircle className="w-3 h-3 flex-shrink-0" />}
                <span className="truncate">{CRITERIA_LABELS[key]}</span>
              </div>
            ))}
          </div>
        )}

        {current && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 bg-[#1e2130] rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${current.score >= 9 ? 'bg-emerald-400' : current.score >= 7 ? 'bg-cyan-400' : current.score >= 5 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${current.score * 10}%` }}
              />
            </div>
            <span className={`text-sm font-black ${current.score >= 9 ? 'text-emerald-400' : current.score >= 7 ? 'text-cyan-400' : current.score >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
              {current.score}<span className="text-slate-600 text-xs">/10</span>
            </span>
          </div>
        )}
      </div>

      {/* Log */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {log.length === 0 && !running && (
          <div className="text-center py-10 text-slate-600">
            <div className="text-3xl mb-2">🎯</div>
            <p className="text-xs">Carga una imagen y pulsa<br />Iniciar para comenzar la calibración</p>
          </div>
        )}

        {[...log].reverse().map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function LogEntry({ entry }) {
  const [expanded, setExpanded] = useState(entry.type === 'report' && entry.score < 10);

  if (entry.type === 'running') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-500 px-2 py-1.5 bg-[#0d0f14] rounded border border-[#1e2130]">
        <div className="w-3 h-3 border border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        {entry.msg}
      </div>
    );
  }

  if (entry.type === 'adjust') {
    return (
      <div className="px-2 py-1.5 bg-[#0d0f14] rounded border border-cyan-500/20">
        <p className="text-[10px] text-cyan-400 font-semibold mb-1">→ Ajustes iter {entry.iter}:</p>
        {entry.changes.map((c, i) => (
          <p key={i} className="text-[10px] text-slate-400 pl-2">• {c}</p>
        ))}
      </div>
    );
  }

  if (entry.type === 'success') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/20 border border-emerald-500/40 rounded text-emerald-400 text-xs font-bold">
        <Award className="w-4 h-4" />
        {entry.msg}
      </div>
    );
  }

  if (entry.type === 'warning') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-900/20 border border-amber-500/30 rounded text-amber-400 text-xs">
        <AlertCircle className="w-4 h-4" />
        {entry.msg}
      </div>
    );
  }

  if (entry.type === 'error') {
    return (
      <div className="px-3 py-2 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-xs">
        ✕ {entry.msg}
      </div>
    );
  }

  if (entry.type === 'report') {
    const scoreColor = entry.score >= 9 ? 'text-emerald-400' : entry.score >= 7 ? 'text-cyan-400' : entry.score >= 5 ? 'text-amber-400' : 'text-red-400';
    const borderColor = entry.score >= 9 ? 'border-emerald-500/30' : entry.score >= 7 ? 'border-cyan-500/30' : 'border-amber-500/20';

    return (
      <div className={`border rounded overflow-hidden ${borderColor} bg-[#0d0f14]`}>
        <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#12151f] transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white font-semibold">Iteración #{entry.iter}</span>
            <span className="text-[10px] text-slate-500">{entry.passed}/10 criterios</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">{entry.stitches?.toLocaleString()} pts</span>
            <span className={`text-sm font-black ${scoreColor}`}>{entry.score}<span className="text-slate-600 text-[10px]">/10</span></span>
          </div>
        </button>

        {expanded && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            {/* Stats */}
            <div className="flex gap-4 text-[10px] text-slate-500 border-t border-[#1e2130] pt-2">
              <span>Regiones: <span className="text-white">{entry.regions}</span></span>
              <span>Colores: <span className="text-white">{entry.colors}</span></span>
              <span>Puntadas: <span className="text-white">{entry.stitches?.toLocaleString()}</span></span>
            </div>

            {/* Criterios */}
            <div className="flex flex-col gap-1">
              {Object.entries(entry.criteria).map(([key, val]) => (
                <div key={key} className={`flex items-start gap-1.5 text-[10px] ${val.pass ? 'text-emerald-400' : 'text-red-300'}`}>
                  {val.pass
                    ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                  <div>
                    <span className="font-medium">{CRITERIA_LABELS[key]}</span>
                    <span className={`ml-1 ${val.pass ? 'text-emerald-500/70' : 'text-red-400/70'}`}>— {val.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}