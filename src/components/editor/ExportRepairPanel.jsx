/**
 * ExportRepairPanel.jsx — FASE 1-5 UI
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra: errores detectados (FASE 1), tabla antes/después (FASE 3), veredicto,
 * botón "Reparar y exportar" (FASE 5) y descarga EXPORT_REPAIR_REPORT.md (FASE 6).
 * También ofrece view toggles: Final Look / Exportable / Comparar.
 *
 * NO cambia el Final Look visual. El toggle solo afecta qué comandos previsualiza
 * el ValidationPreview del ExportModal.
 */
import { useState, useMemo, useCallback } from 'react';
import { Wrench, Download, AlertTriangle, CheckCircle2, XCircle, ShieldCheck, Eye, GitCompare, FileText } from 'lucide-react';
import { repairFinalLookCommandsForExport } from '@/lib/exportRepair/repairFinalLookCommandsForExport';
import { detectExportErrors } from '@/lib/exportRepair/exportErrorDetector';

export default function ExportRepairPanel({ finalCommands, finalObjects, regions, config, machineSettings, onViewChange }) {
  const [view, setView] = useState('final'); // 'final' | 'exportable' | 'compare'
  const [repair, setRepair] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  // Errores antes (siempre disponibles, sin reparar)
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
          finalLookCommands: finalCommands, objects: finalObjects, regions, config, machineSettings,
        });
        setRepair(res);
        if (res.exportAllowed && onViewChange) onViewChange('exportable', res.repairedCommands);
      } catch (e) {
        setError(e.message || 'Error durante la reparación');
      } finally { setRunning(false); }
    }, 0);
  }, [finalCommands, finalObjects, regions, config, machineSettings, onViewChange]);

  const handleDownload = useCallback(() => {
    if (!repair?.repairReport?.report) return;
    const blob = new Blob([repair.repairReport.report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'EXPORT_REPAIR_REPORT.md'; a.click();
    URL.revokeObjectURL(url);
  }, [repair]);

  const handleView = (v) => {
    setView(v);
    if (onViewChange) onViewChange(v, repair?.repairedCommands || null);
  };

  const comp = repair?.comparison;
  const exportAllowed = repair?.exportAllowed;

  return (
    <div className="bg-[#161a23] border border-cyan-500/30 rounded-xl p-3 space-y-3">
      {/* Header */}
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

      {/* View toggle help */}
      <p className="text-[10px] text-slate-500">
        Final Look mantiene el aspecto visual. Exportable usa los comandos reparados para la máquina.
        Comparar muestra ambos lado a lado. El toggle solo cambia la previsualización — el bordado real no se altera.
      </p>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* FASE 1 — Errores detectados */}
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

      {/* Botón reparar */}
      <button
        onClick={handleRepair}
        disabled={running || !finalCommands?.length}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
      >
        <Wrench className="w-4 h-4" />
        {running ? 'Reparando...' : repair ? 'Volver a reparar' : 'Reparar y validar'}
      </button>

      {/* FASE 3 — Tabla antes/después */}
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
                <CmpRow label="stitchCount" b={comp.stitchCount} />
                <CmpRow label="jumpCount" b={comp.jumpCount} />
                <CmpRow label="trimCount" b={comp.trimCount} />
                <CmpRow label="shortStitches" b={comp.shortStitches} />
                <CmpRow label="duplicateStitches" b={comp.duplicateStitches} />
                <CmpRow label="missingTieIn" b={comp.missingTieIn} />
                <CmpRow label="missingTieOff" b={comp.missingTieOff} />
                <CmpRow label="visibleDiagonalStitches" b={comp.visibleDiagonalStitches} />
                <CmpRow label="unsupportedLongStitches" b={comp.unsupportedLongStitches} />
                <CmpRow label="colorCount" b={comp.colorCount} />
                <CmpRow label="ce01Score" b={comp.ce01Score} dir="higher" />
                <CmpRow label="ce01Status" b={comp.ce01Status} fmt="str" />
                <CmpRow label="exportAllowed" b={comp.exportAllowed} fmt="bool" dir="higher" />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FASE 5 — Veredicto */}
      {repair && (
        <div className={`rounded-lg p-2.5 border ${exportAllowed ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-amber-900/20 border-amber-500/40'}`}>
          <div className="flex items-center gap-2">
            {exportAllowed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
            <span className={`text-sm font-bold ${exportAllowed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {exportAllowed ? 'Listo para exportar' : 'Reparable parcialmente'}
            </span>
          </div>
          {exportAllowed ? (
            <p className="text-[10px] text-emerald-300 mt-1">Los comandos reparados pasan validación CE01. Exporta con seguridad.</p>
          ) : repair.remainingBlockingIssues.length > 0 ? (
            <div className="mt-1">
              <p className="text-[10px] text-amber-300 mb-1">Quedan {repair.remainingBlockingIssues.length} error(es) no reparables:</p>
              {repair.remainingBlockingIssues.map((e, i) => (
                <div key={i} className="text-[10px] text-red-300 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> {e.type} ×{e.count}: {e.proposedAction}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* FASE 6 — Informe */}
      {repair && (
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#0d0f14] border border-[#2a2d3a] text-slate-300 text-xs font-bold hover:bg-[#1e2130] transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> Descargar EXPORT_REPAIR_REPORT.md
        </button>
      )}
    </div>
  );
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