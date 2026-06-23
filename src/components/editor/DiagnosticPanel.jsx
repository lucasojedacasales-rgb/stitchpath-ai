import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function DiagnosticPanel({ imageUrl, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostic = async () => {
    if (!imageUrl) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosticVectorization', {
        image_url: imageUrl,
        width_mm: 100,
        height_mm: 100,
        color_count: 6
      });
      setReport(res.data?.report);
    } catch (e) {
      console.error('Diagnostic failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-[#0d0f14] border border-[#2a2d3a] rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 border-b border-[#2a2d3a] p-4 bg-[#0d0f14] flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Diagnóstico del Pipeline</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {!report ? (
            <div className="text-center py-8">
              <button
                onClick={runDiagnostic}
                disabled={loading}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold"
              >
                {loading ? 'Analizando...' : 'Ejecutar diagnóstico'}
              </button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className={`p-3 rounded-lg border ${
                report?.summary?.pipeline_status === 'success'
                  ? 'bg-emerald-900/20 border-emerald-500/30'
                  : 'bg-red-900/20 border-red-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {report?.summary?.pipeline_status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className="font-bold text-white">
                    {report?.summary?.passed}/{report?.summary?.total_steps} pasos exitosos
                  </span>
                </div>
                {report?.summary?.bottleneck && (
                  <div className="text-xs text-red-300">
                    Cuello de botella: <span className="font-mono">{report?.summary?.bottleneck}</span>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="space-y-2">
                {Object.entries(report.steps).map(([stepKey, step]) => (
                  <StepCard key={stepKey} name={stepKey} step={step} />
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t border-[#2a2d3a]">
                <button
                  onClick={() => setReport(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#1e2130] hover:bg-[#2a2d3a] text-xs text-slate-300 font-semibold"
                >
                  Limpiar
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs text-white font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({ name, step }) {
  const [expanded, setExpanded] = useState(step.status !== 'success');
  const isSuccess = step.status === 'success';

  return (
    <div className={`border rounded-lg overflow-hidden ${
      isSuccess ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-red-500/30 bg-red-900/10'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-xs font-mono text-slate-400">{name}</span>
          {isSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <span className="text-xs font-bold text-slate-300">{step.status}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 text-xs space-y-1 border-t border-inherit">
          {step.message && (
            <div className="text-slate-300">{step.message}</div>
          )}
          {step.error && (
            <div className="text-red-300">Error: {step.error}</div>
          )}
          {step.size_bytes !== undefined && (
            <div className="text-slate-400">Tamaño: {(step.size_bytes / 1024).toFixed(1)} KB</div>
          )}
          {step.colors_found !== undefined && (
            <div className="text-slate-400">Colores: {step.colors_found}</div>
          )}
          {step.regions_received !== undefined && (
            <div className="text-slate-400">Regiones de Claude: {step.regions_received}</div>
          )}
          {step.regions_after_validation !== undefined && (
            <div className="text-slate-400">Regiones válidas: {step.regions_after_validation}</div>
          )}
          {step.validation_steps?.length > 0 && (
            <div className="mt-2 space-y-1 pl-2 border-l border-slate-600">
              {step.validation_steps.map((vs, i) => (
                <div key={i} className="text-slate-500">
                  {vs.name}: {vs.passed || vs.closed || vs.regions_processed || '?'} ✓
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}