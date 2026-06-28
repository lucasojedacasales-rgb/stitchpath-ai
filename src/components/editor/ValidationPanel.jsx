import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export default function ValidationPanel({ validationReport }) {
  if (!validationReport) {
    return <div className="p-4 text-xs text-slate-500">Ejecuta el pipeline para ver validación...</div>;
  }

  const { metrics, validation, colorSet, structureIssues, readyForProduction } = validationReport;

  return (
    <div className="p-3 space-y-3">
      {/* Summary Badge */}
      <div className={`p-2 rounded text-xs font-bold flex items-center gap-2 ${
        readyForProduction 
          ? 'bg-emerald-900/30 border border-emerald-500/50 text-emerald-300'
          : 'bg-amber-900/30 border border-amber-500/50 text-amber-300'
      }`}>
        {readyForProduction ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
        {readyForProduction ? 'LISTO PARA PRODUCCIÓN' : 'PROBLEMAS DETECTADOS'}
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Métricas</div>
        {validation.map((v) => (
          <div key={v.key} className={`text-xs py-1 px-2 rounded flex items-center justify-between ${
            v.ok ? 'bg-emerald-900/20 border border-emerald-500/30' : 'bg-red-900/20 border border-red-500/30'
          }`}>
            <span className="flex items-center gap-1.5">
              {v.ok ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
              <span className="text-slate-300">{v.label}</span>
            </span>
            <span className="font-mono text-xs">{v.value} {v.range}</span>
          </div>
        ))}
      </div>

      {/* Colors */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Colores ({colorSet?.length || 0})</div>
        <div className="flex flex-wrap gap-1">
          {colorSet?.map((color) => (
            <div
              key={color}
              className="w-6 h-6 rounded border border-slate-400 hover:ring-2 ring-violet-500 cursor-pointer"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Issues */}
      {structureIssues?.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-wide">⚠️ Problemas</div>
          <ul className="text-xs text-red-300 space-y-0.5">
            {structureIssues.slice(0, 3).map((issue, i) => (
              <li key={i} className="line-clamp-1">• {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-[9px] text-slate-600 border-t border-slate-700 pt-2">
        {new Date(validationReport.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}