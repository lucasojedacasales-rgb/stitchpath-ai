import { useState } from 'react';
import { ChevronDown, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { validatePolygon, closePolygon, repairGaps } from '@/lib/polygonValidator';

export default function ValidationPanel({ regions, onRegionsUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [validationReport, setValidationReport] = useState(null);
  const [isValidating, setIsValidating] = useState(false);

  const runValidation = () => {
    setIsValidating(true);
    
    const report = {
      timestamp: new Date().toISOString(),
      totalRegions: regions.length,
      validRegions: 0,
      regionsWithErrors: 0,
      regionsWithWarnings: 0,
      details: []
    };

    regions.forEach((region, idx) => {
      const validation = validatePolygon(region.path_points, region.name || `Region ${idx}`);
      
      if (validation.isValid) {
        report.validRegions++;
      } else {
        report.regionsWithErrors++;
      }
      
      if (validation.warnings.length > 0) {
        report.regionsWithWarnings++;
      }
      
      report.details.push({
        index: idx,
        ...validation,
        regionId: region.id,
        color: region.color
      });
    });

    setValidationReport(report);
    setExpanded(true);
    setIsValidating(false);
  };

  const recalculateRegion = (regionIdx) => {
    const region = regions[regionIdx];
    if (!region?.path_points) return;

    // Repair: close + fix gaps
    let repaired = closePolygon(region.path_points);
    repaired = repairGaps(repaired);

    const updated = [...regions];
    updated[regionIdx] = {
      ...region,
      path_points: repaired
    };
    
    onRegionsUpdate(updated);
    runValidation();
  };

  const recalculateAll = () => {
    const updated = regions.map(region => {
      if (!region?.path_points) return region;
      let repaired = closePolygon(region.path_points);
      repaired = repairGaps(repaired);
      return { ...region, path_points: repaired };
    });
    
    onRegionsUpdate(updated);
    runValidation();
  };

  const hasErrors = validationReport && validationReport.regionsWithErrors > 0;
  const statusColor = hasErrors ? 'text-red-400' : 'text-emerald-400';
  const statusBg = hasErrors ? 'bg-red-900/20' : 'bg-emerald-900/20';

  return (
    <div className="border-t border-[#2a2d3a] bg-[#0a0c12]">
      <button
        onClick={() => {
          if (!validationReport) runValidation();
          else setExpanded(!expanded);
        }}
        disabled={isValidating}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1d27] transition-colors disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
          <span className="text-xs font-bold text-slate-300">Validación de Polígonos</span>
          {validationReport && (
            <div className={`text-xs font-bold ${statusColor}`}>
              {validationReport.validRegions}/{validationReport.totalRegions} válidas
            </div>
          )}
        </div>
        {isValidating && <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
      </button>

      {expanded && validationReport && (
        <div className="px-4 pb-3 space-y-3 max-h-96 overflow-y-auto">
          {/* Summary */}
          <div className={`p-3 rounded-lg border ${statusBg} border-inherit`}>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Válidas</div>
                <div className="text-emerald-400 font-bold">{validationReport.validRegions}</div>
              </div>
              <div>
                <div className="text-slate-500">Con errores</div>
                <div className="text-red-400 font-bold">{validationReport.regionsWithErrors}</div>
              </div>
              <div>
                <div className="text-slate-500">Con avisos</div>
                <div className="text-yellow-400 font-bold">{validationReport.regionsWithWarnings}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => runValidation()}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold bg-[#1e2130] hover:bg-[#2a2d3a] text-slate-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Re-validar
            </button>
            <button
              onClick={recalculateAll}
              disabled={validationReport.regionsWithErrors === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-bold bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Reparar todo
            </button>
          </div>

          {/* Region details */}
          <div className="space-y-2 border-t border-[#2a2d3a] pt-3">
            {validationReport.details.map((detail, idx) => (
              <RegionValidationCard
                key={idx}
                detail={detail}
                onRecalculate={() => recalculateRegion(detail.index)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RegionValidationCard({ detail, onRecalculate }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !detail.isValid;
  const hasWarning = detail.warnings.length > 0;
  
  return (
    <div className={`rounded-lg border p-2 text-xs ${
      hasError ? 'bg-red-900/10 border-red-500/30' :
      hasWarning ? 'bg-yellow-900/10 border-yellow-500/30' :
      'bg-emerald-900/10 border-emerald-500/30'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-1.5 hover:bg-black/20 rounded transition-colors"
      >
        <div className="flex items-center gap-2">
          {hasError ? (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : hasWarning ? (
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          )}
          <div className="text-left">
            <div className="font-bold text-slate-300 truncate">{detail.regionName}</div>
            <div className="text-slate-500">
              {detail.metrics.pointCount} pts • {detail.metrics.area.toFixed(0)} px²
            </div>
          </div>
        </div>
        {expanded ? '▼' : '▶'}
      </button>

      {expanded && (
        <div className="px-1.5 pb-1.5 pt-1 space-y-1.5 border-t border-inherit">
          {/* Errors */}
          {detail.errors.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-red-400 font-bold">Errores:</div>
              {detail.errors.map((err, i) => (
                <div key={i} className="text-red-300 text-[10px] pl-2">• {err}</div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {detail.warnings.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-yellow-400 font-bold">Avisos:</div>
              {detail.warnings.map((warn, i) => (
                <div key={i} className="text-yellow-300 text-[10px] pl-2">• {warn}</div>
              ))}
            </div>
          )}

          {/* Metrics */}
          {detail.metrics && (
            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 border-t border-inherit">
              <div>Cerrado: {detail.metrics.isClosed ? '✓' : '✗'}</div>
              <div>Área: {detail.metrics.area.toFixed(1)}</div>
              <div>Perímetro: {detail.metrics.perimeter.toFixed(1)}</div>
              <div>Puntos: {detail.metrics.pointCount}</div>
            </div>
          )}

          {/* Action */}
          {!detail.isValid && (
            <button
              onClick={onRecalculate}
              className="w-full mt-1.5 px-2 py-1 rounded text-[10px] font-bold bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 transition-colors"
            >
              Reparar esta región
            </button>
          )}
        </div>
      )}
    </div>
  );
}