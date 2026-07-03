/**
 * LearnedPresetValidationPanel.jsx — StitchPath AI
 * Panel que VALIDA de verdad el preset aprendido: aplica el preset, regenera
 * finalCommands antes/después, ejecuta el Quality Gate y muestra el veredicto.
 * Permite descargar REFERENCE_LEARNING_VALIDATED_REPORT.md.
 */
import { useState, useCallback } from 'react';
import { FlaskConical, Download, AlertTriangle, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { validateLearnedPresetEffectiveness } from '@/lib/referenceLearning/learnedPresetValidator';

export default function LearnedPresetValidationPanel({ regions, config, darkStroke, machineSettings, designName, onApplyConfig }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = useCallback(() => {
    if (!regions || regions.length === 0) {
      setError('No hay regiones generadas. Digitaliza una imagen primero.');
      return;
    }
    setRunning(true);
    setError(null);
    // La validación es síncrona y pesada (rebuild + gate). Ceder al event loop.
    setTimeout(() => {
      try {
        const res = validateLearnedPresetEffectiveness({
          regions, baseConfig: config, darkStroke, machineSettings, designName,
        });
        if (res.error) { setError(res.error); setResult(null); }
        else {
          setResult(res);
          // Aplicar el config patch al Editor (activa Professional Mode + learned* + override)
          if (res.configPatch && typeof onApplyConfig === 'function') onApplyConfig(res.configPatch);
        }
      } catch (e) {
        setError(e.message || 'Error durante la validación');
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [regions, config, darkStroke, machineSettings, designName, onApplyConfig]);

  const handleDownload = useCallback(() => {
    if (!result?.report) return;
    const blob = new Blob([result.report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REFERENCE_LEARNING_VALIDATED_REPORT.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="bg-[#161a23] border border-violet-500/30 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Validar preset aprendido</h3>
          <span className="text-[10px] text-slate-500">regenera · mide · compara</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running || !regions?.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {running ? 'Validando...' : 'Validar preset'}
          </button>
          {result && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-900/30 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Informe validado
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {result && (
        <LearnedValidationResult result={result} />
      )}

      {!result && !error && (
        <p className="text-[11px] text-slate-500">
          Aplica el preset aprendido al diseño actual, regenera finalCommands antes/después, ejecuta el Quality Gate
          y mide <span className="text-slate-300">stitchCount, visibleDiagonalStitches, maxVisibleStitchMm, professionalScore</span> y más.
          Incluye <span className="text-cyan-300">CARTOON_OUTLINE_PROFESSIONAL_OVERRIDE</span> si el diseño es cartoon con contorno negro.
        </p>
      )}
    </div>
  );
}

function LearnedValidationResult({ result }) {
  const { selection, cartoon, before, after, verdict, notEffective, integrity, basePreset, finalPreset } = result;
  const vColor = verdict.verdict === 'IMPROVED' ? 'text-emerald-400' : verdict.verdict === 'WORSENED' ? 'text-red-400' : 'text-amber-400';
  const vIcon = verdict.verdict === 'IMPROVED' ? CheckCircle2 : verdict.verdict === 'WORSENED' ? XCircle : AlertTriangle;
  const VIcon = vIcon;

  return (
    <div className="space-y-3">
      {/* Perfil + override */}
      <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
        <div className="text-[11px] text-slate-400">
          Perfil: <span className="text-cyan-300 font-bold">{selection?.selectedProfile?.label || selection?.selectedProfileId}</span>
          {' '}· {(result.selection?.confidence ? (result.selection.confidence * 100).toFixed(0) : 0)}%
        </div>
        {cartoon?.applies ? (
          <div className="mt-1 text-[10px] text-violet-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> CARTOON_OUTLINE_PROFESSIONAL_OVERRIDE aplicado
            <span className="text-slate-500">(contourAfterFill {String(basePreset.contourAfterFill)}→{String(finalPreset.contourAfterFill)}, satin {String(basePreset.useSatinForOuterContours)}→{String(finalPreset.useSatinForOuterContours)})</span>
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-slate-600">Override cartoon: no aplica</div>
        )}
      </div>

      {/* Veredicto */}
      <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
        <div className="flex items-center gap-2 mb-1">
          <VIcon className={`w-4 h-4 ${vColor}`} />
          <span className={`text-sm font-bold ${vColor}`}>{verdict.verdict}</span>
          <span className="text-[10px] text-slate-500">net={verdict.net}</span>
          {notEffective && <span className="ml-auto text-[10px] text-red-400 font-bold">LEARNED_PRESET_NOT_EFFECTIVE</span>}
        </div>
        {verdict.changes?.length > 0 && (
          <div className="space-y-0.5 max-h-28 overflow-y-auto">
            {verdict.changes.slice(0, 12).map((c, i) => (
              <div key={i} className="text-[10px] text-slate-400 font-mono">{c}</div>
            ))}
          </div>
        )}
      </div>

      {/* Métricas antes/después */}
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
            <MetricRow label="stitchCount" b={before.stitchCount} a={after.stitchCount} dir="lower" />
            <MetricRow label="jumpCount" b={before.jumpCount} a={after.jumpCount} dir="lower" />
            <MetricRow label="trimCount" b={before.trimCount} a={after.trimCount} dir="lower" />
            <MetricRow label="colorCount" b={before.colorCount} a={after.colorCount} dir="lower" />
            <MetricRow label="visibleDiagonalStitches" b={before.visibleDiagonalStitches} a={after.visibleDiagonalStitches} dir="lower" />
            <MetricRow label="maxVisibleStitchMm" b={before.maxVisibleStitchMm} a={after.maxVisibleStitchMm} dir="lower" fmt={2} />
            <MetricRow label="unsupportedTravelStitches" b={before.unsupportedTravelStitches} a={after.unsupportedTravelStitches} dir="lower" />
            <MetricRow label="unsupportedLongStitches" b={before.unsupportedLongStitches} a={after.unsupportedLongStitches} dir="lower" />
            <MetricRow label="shortStitchCount" b={before.shortStitchCount} a={after.shortStitchCount} dir="lower" />
            <MetricRow label="duplicateStitches" b={before.duplicateStitches} a={after.duplicateStitches} dir="lower" />
            <MetricRow label="satinContourCount" b={before.satinContourCount} a={after.satinContourCount} dir="higher" />
            <MetricRow label="runningContourCount" b={before.runningContourCount} a={after.runningContourCount} dir="higher" />
            <MetricRow label="fillBlockCount" b={before.fillBlockCount} a={after.fillBlockCount} dir="higher" />
            <MetricRow label="underlayCount" b={before.underlayCount} a={after.underlayCount} dir="higher" />
            <MetricRow label="professionalScore" b={before.professionalScore} a={after.professionalScore} dir="higher" />
          </tbody>
        </table>
      </div>

      {/* Integridad */}
      <div className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2.5">
        <div className="text-[10px] font-bold text-slate-300 mb-1">Integridad</div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <IntegrityRow label="finalLook=export" ok={!integrity.finalLookExportMismatch} />
          <IntegrityRow label="contour both feet" ok={!integrity.contourMissingOnOneFoot} />
          <IntegrityRow label="fill after contour" ok={!integrity.fillAfterContour} />
          <IntegrityRow label="CE01 status" value={integrity.ce01Status} ok={integrity.ce01Status !== 'INVALID'} warn={integrity.ce01Status === 'RISKY'} />
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, b, a, dir, fmt }) {
  const f = (v) => typeof v === 'number' ? (fmt ? v.toFixed(fmt) : v) : '—';
  const delta = (typeof b === 'number' && typeof a === 'number') ? a - b : 0;
  const better = dir === 'lower' ? delta < 0 : delta > 0;
  const worse = dir === 'lower' ? delta > 0 : delta < 0;
  const color = better ? 'text-emerald-400' : worse ? 'text-red-400' : 'text-slate-400';
  return (
    <tr className="border-b border-[#1e2130]">
      <td className="py-1 px-2 text-slate-400">{label}</td>
      <td className="py-1 px-2 text-center text-slate-300">{f(b)}</td>
      <td className="py-1 px-2 text-center text-slate-200 font-bold">{f(a)}</td>
      <td className={`py-1 px-2 text-center font-bold ${color}`}>{delta > 0 ? '+' : ''}{fmt ? delta.toFixed(fmt) : delta}</td>
    </tr>
  );
}

function IntegrityRow({ label, value, ok, warn }) {
  const color = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold ${color}`}>{value != null ? value : ok ? '✓' : '✗'}</span>
    </div>
  );
}