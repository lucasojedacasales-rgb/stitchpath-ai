/**
 * ExportRepairPanel.jsx — Reparación técnica pre-export (v2 transaccional)
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra: errores detectados, tabla de fases (Aceptada/Revertida), comparativa
 * antes/después, veredicto (repairAccepted / REPAIR_REJECTED) y descarga del
 * informe EXPORT_REPAIR_REPORT_V2.md. View toggles Final Look / Exportable.
 *
 * NO cambia el Final Look visual. El toggle solo afecta la previsualización.
 */
import { useState, useMemo, useCallback } from 'react';
import { Wrench, Download, AlertTriangle, CheckCircle2, XCircle, ShieldCheck, Eye, GitCompare, FileText, RotateCcw, Sparkles } from 'lucide-react';
import { repairFinalLookCommandsForExport } from '@/lib/exportRepair/repairFinalLookCommandsForExport';
import { detectExportErrors } from '@/lib/exportRepair/exportErrorDetector';

export default function ExportRepairPanel({ finalCommands, finalObjects, regions, config, machineSettings, darkStroke, onRepairComplete, onViewChange }) {
  const [view, setView] = useState('final');
  const [repair, setRepair] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const beforeDetection = useMemo(
    () => detectExportErrors(finalCommands || [], finalObjects || [], regions || [], config || {}, machineSettings || {}),
    [finalCommands, finalObjects, regions, config, machineSettings]
  );

  const handleRepair = useCallback(() => {
    if (!finalCommands || finalCommands.length === 0) { setError('No hay comandos finales para reparar.'); return; }
    setRunning(true); setError(null);
    setTimeout(() => {
      try {
        const res = repairFinalLookCommandsForExport({
          finalLookCommands: finalCommands, objects: finalObjects, regions, config, machineSettings, darkStroke,
        });
        setRepair(res);
        if (onRepairComplete) onRepairComplete(res);
        if (res.repairAccepted && onViewChange) onViewChange('exportable', res.repairedCommands);
      } catch (e) {
        setError(e.message || 'Error durante la reparación');
      } finally { setRunning(false); }
    }, 0);
  }, [finalCommands, finalObjects, regions, config, machineSettings, darkStroke, onRepairComplete, onViewChange]);

  const handleDownload = useCallback(() => {
    if (!repair?.repairReport?.report) return;
    const blob = new Blob([repair.repairReport.report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'EXPORT_REPAIR_REPORT_V5.md'; a.click();
    URL.revokeObjectURL(url);
  }, [repair]);

  const handleDownloadForensics = useCallback(() => {
    if (!repair?.repairReport?.visibleDiagForensics) return;
    const blob = new Blob([repair.repairReport.visibleDiagForensics], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'VISIBLE_DIAGONAL_FORENSICS.md'; a.click();
    URL.revokeObjectURL(url);
  }, [repair]);

  const handleDownloadPolish = useCallback(() => {
    if (!repair?.repairReport?.polish?.report) return;
    const blob = new Blob([repair.repairReport.polish.report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'EXPORT_POLISH_REPORT_V1.md'; a.click();
    URL.revokeObjectURL(url);
  }, [repair]);

  const handleView = (v) => {
    setView(v);
    if (onViewChange) onViewChange(v, repair?.repairAccepted ? repair.repairedCommands : null);
  };

  const comp = repair?.comparison;
  const repairAccepted = repair?.repairAccepted;
  const phaseLog = repair?.phaseLog || [];

  return (
    <div className="bg-[#161a23] border border-cyan-500/30 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Reparación técnica pre-export</h3>
          <span className="text-[10px] text-slate-500">{beforeDetection.errors.length} errores detectados</span>
        </div>
        <div className="flex items-center gap-1">
          <ViewBtn label="Final Look" icon={Eye} active={view === 'final'} onClick={() => handleView('final')} color="violet" />
          <ViewBtn label="Exportable" icon={ShieldCheck} active={view === 'exportable'} onClick={() => handleView('exportable')} color="emerald" />
          <ViewBtn label="Comparar" icon={GitCompare} active={view === 'compare'} onClick={() => handleView('compare')} color="cyan" />
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        Pipeline transaccional: cada fase mide antes/después y se revierte si empeora métricas críticas.
        Si el global no supera los criterios, se revierte todo (REPAIR_REJECTED) y se exportan los comandos originales.
      </p>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Errores detectados */}
      <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
        <div className="text-[11px] font-bold text-slate-200 mb-1.5">Errores técnicos detectados</div>
        {beforeDetection.errors.length === 0 ? (
          <div className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Sin errores técnicos.</div>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {beforeDetection.errors.map((e, i) => (
              <div key={i} className="text-[10px] flex items-center gap-2 bg-[#0a0c12] rounded px-2 py-1 border border-[#1e2130]">
                <span className={`px-1 rounded text-[9px] font-bold ${e.severity === 'blocking' ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/40 text-amber-300'}`}>{e.severity}</span>
                <span className="text-slate-400 font-mono">{e.type}</span>
                <span className="text-violet-300 font-bold">×{e.count}</span>
                <span className={`px-1 rounded text-[9px] ${e.reparable ? 'text-emerald-400' : 'text-red-400'}`}>{e.reparable ? 'reparable' : 'no reparable'}</span>
                <span className="text-slate-500 ml-auto truncate">{e.proposedAction}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleRepair}
        disabled={running || !finalCommands?.length}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
      >
        {running ? <><RotateCcw className="w-4 h-4 animate-spin" /> Reparando...</> : repair ? <><RotateCcw className="w-4 h-4" /> Volver a reparar</> : <><Wrench className="w-4 h-4" /> Reparar y validar</>}
      </button>

      {/* Tabla de fases transaccional */}
      {phaseLog.length > 0 && (
        <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
          <div className="text-[11px] font-bold text-slate-200 mb-1.5">Fases (transaccional)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-slate-500 border-b border-[#1e2130]">
                  <th className="text-left py-1 px-1">Fase</th>
                  <th className="text-center py-1 px-1">Estado</th>
                  <th className="text-center py-1 px-1">Antes</th>
                  <th className="text-center py-1 px-1">Después</th>
                </tr>
              </thead>
              <tbody>
                {phaseLog.map((p, i) => (
                  <tr key={i} className="border-b border-[#1e2130]">
                    <td className="py-1 px-1 text-slate-400 font-mono">{p.name}</td>
                    <td className={`py-1 px-1 text-center font-bold ${p.accepted ? 'text-emerald-400' : 'text-red-400'}`}>{p.accepted ? '✅' : '⛔'}</td>
                    <td className="py-1 px-1 text-center text-slate-300">{phaseTargetValue(p.before, p.name)}</td>
                    <td className="py-1 px-1 text-center text-slate-200">{phaseTargetValue(p.after, p.name)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comparativa */}
      {comp && (
        <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
          <div className="text-[11px] font-bold text-slate-200 mb-1.5">Comparativa antes / después</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500 border-b border-[#1e2130]">
                  <th className="text-left py-1 px-2">Métrica</th>
                  <th className="text-center py-1 px-2">Antes</th>
                  <th className="text-center py-1 px-2">Después</th>
                  <th className="text-center py-1 px-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                <CmpRow label="emptyBlocks" b={comp.emptyBlocks} />
                <CmpRow label="visibleDiagonalStitches" b={comp.visibleDiagonalStitches} />
                <CmpRow label="duplicateStitches" b={comp.duplicateStitches} />
                <CmpRow label="shortStitches" b={comp.shortStitches} />
                <CmpRow label="unsupportedLongStitches" b={comp.unsupportedLongStitches} />
                <CmpRow label="missingTieIn" b={comp.missingTieIn} />
                <CmpRow label="missingTieOff" b={comp.missingTieOff} />
                <CmpRow label="stitchCount" b={comp.stitchCount} />
                <CmpRow label="jumpCount" b={comp.jumpCount} />
                <CmpRow label="trimCount" b={comp.trimCount} />
                <CmpRow label="colorCount" b={comp.colorCount} />
                <CmpRow label="ce01Score" b={comp.ce01Score} dir="higher" />
                <CmpRow label="ce01Status" b={comp.ce01Status} fmt="str" />
                <CmpRow label="exportAllowed" b={comp.exportAllowed} fmt="bool" dir="higher" />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Veredicto */}
      {repair && (
        <div className={`rounded-lg p-2.5 border ${repairAccepted ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-red-900/20 border-red-500/40'}`}>
          <div className="flex items-center gap-2">
            {repairAccepted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={`text-sm font-bold ${repairAccepted ? 'text-emerald-400' : 'text-red-400'}`}>
              {repairAccepted ? 'Repair accepted — exportable' : 'REPAIR_REJECTED — usando comandos originales'}
            </span>
          </div>
          {repairAccepted ? (
            <p className="text-[10px] text-emerald-300 mt-1">Los comandos reparados superan los criterios. Se exportarán los repairedCommands.</p>
          ) : (
            <p className="text-[10px] text-red-300 mt-1">El pipeline no mejoró las métricas críticas. Se exportan los comandos originales (source).</p>
          )}
        </div>
      )}

      {/* Polish V1 (post-V5, solo warnings) */}
      {repair?.repairReport?.polish && (() => {
        const pl = repair.repairReport.polish;
        const pc = pl.polishComparison;
        const safeReached = pc?.ce01Status?.after === 'SAFE';
        return (
          <div className={`rounded-lg p-2.5 border ${pl.polishAccepted ? 'bg-cyan-900/10 border-cyan-500/30' : 'bg-amber-900/10 border-amber-500/30'}`}>
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${pl.polishAccepted ? 'text-cyan-400' : 'text-amber-400'}`} />
              <span className={`text-sm font-bold ${pl.polishAccepted ? 'text-cyan-400' : 'text-amber-400'}`}>
                Polish V1 {pl.polishAccepted ? 'aplicado' : 'revertido (base V5)'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Post-V5 · solo warnings · invariantes V5 protegidos. Invariantes se mantienen: visibleDiag={pc?.visibleDiagonalStitches?.after ?? 0}, emptyBlocks={pc?.emptyBlocks?.after ?? 0}.
            </p>
            <div className="grid grid-cols-2 gap-1 mt-1.5 text-[10px]">
              <PolishMini label="shortSt" b={pc?.shortStitches} />
              <PolishMini label="dups" b={pc?.duplicateStitches} />
              <PolishMini label="missingTieIn" b={pc?.missingTieIn} />
              <PolishMini label="missingTieOff" b={pc?.missingTieOff} />
              <PolishMini label="ce01Score" b={pc?.ce01Score} dir="higher" />
              <div className="flex items-center gap-1 bg-[#0d0f14] rounded px-1.5 py-1 border border-[#1e2130]">
                <span className="text-slate-500">ce01</span>
                <span className={`font-bold ${safeReached ? 'text-emerald-400' : 'text-amber-300'}`}>{pc?.ce01Status?.after ?? '—'}</span>
                {safeReached && <span className="text-emerald-400 ml-auto">SAFE ✅</span>}
              </div>
            </div>
            <button
              onClick={handleDownloadPolish}
              className="w-full flex items-center justify-center gap-2 py-1.5 mt-2 rounded-lg bg-[#0d0f14] border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-900/20 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> Descargar EXPORT_POLISH_REPORT_V1.md
            </button>
          </div>
        );
      })()}

      {/* Informe */}
      {repair && (
        <div className="space-y-2">
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#0d0f14] border border-[#2a2d3a] text-slate-300 text-xs font-bold hover:bg-[#1e2130] transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Descargar EXPORT_REPAIR_REPORT_V5.md
          </button>
          <button
            onClick={handleDownloadForensics}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#0d0f14] border border-violet-500/30 text-violet-300 text-xs font-bold hover:bg-violet-900/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Descargar VISIBLE_DIAGONAL_FORENSICS.md
          </button>
        </div>
      )}
    </div>
  );
}

function phaseTargetValue(metrics, name) {
  if (!metrics) return '—';
  switch (name) {
    case 'removeEmptyBlocks': return metrics.emptyBlocks;
    case 'removeEmptyBlocksFinal': return metrics.emptyBlocks;
    case 'repairVisibleDiagonalStitches': return metrics.visibleDiagonalStitches;
    case 'removeDuplicateStitches': return metrics.duplicateStitches;
    case 'mergeShortStitches': return metrics.shortStitches;
    case 'addTieInTieOff': return metrics.missingTieIn + metrics.missingTieOff;
    default: return '—';
  }
}

function CmpRow({ label, b, dir = 'lower', fmt }) {
  const before = b.before, after = b.after;
  const f = (v) => {
    if (fmt === 'str') return String(v ?? '—');
    if (fmt === 'bool') return v === true || v === 'true' ? '✓' : v === false || v === 'false' ? '✗' : String(v);
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
    return String(v ?? '—');
  };
  const delta = (typeof before === 'number' && typeof after === 'number') ? after - before : 0;
  const better = dir === 'lower' ? delta < 0 : delta > 0;
  const worse = dir === 'lower' ? delta > 0 : delta < 0;
  const color = fmt ? 'text-slate-300' : (better ? 'text-emerald-400' : worse ? 'text-red-400' : 'text-slate-400');
  return (
    <tr className="border-b border-[#1e2130]">
      <td className="py-1 px-2 text-slate-400">{label}</td>
      <td className="py-1 px-2 text-center text-slate-300">{f(before)}</td>
      <td className="py-1 px-2 text-center text-slate-200 font-bold">{f(after)}</td>
      <td className={`py-1 px-2 text-center font-bold ${color}`}>
        {fmt ? '—' : (delta > 0 ? '+' : '') + (Number.isInteger(delta) ? delta : delta.toFixed(2))}
      </td>
    </tr>
  );
}

function PolishMini({ label, b, dir = 'lower' }) {
  const before = b?.before, after = b?.after;
  const f = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v ?? '—'));
  const delta = (typeof before === 'number' && typeof after === 'number') ? after - before : 0;
  const better = dir === 'lower' ? delta < 0 : delta > 0;
  const worse = dir === 'lower' ? delta > 0 : delta < 0;
  const color = better ? 'text-emerald-400' : worse ? 'text-red-400' : 'text-slate-400';
  return (
    <div className="flex items-center gap-1 bg-[#0d0f14] rounded px-1.5 py-1 border border-[#1e2130]">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{f(before)}</span>
      <span className="text-slate-600">→</span>
      <span className={`font-bold ${color}`}>{f(after)}</span>
    </div>
  );
}

function ViewBtn({ label, icon: Icon, active, onClick, color }) {
  const c = color === 'emerald' ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-300'
    : color === 'cyan' ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-300'
    : 'border-violet-500/50 bg-violet-900/20 text-violet-300';
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold transition-colors ${active ? c : 'border-[#2a2d3a] text-slate-500 hover:text-slate-300'}`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}