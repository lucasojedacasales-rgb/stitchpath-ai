import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export default function VectorizationDiagnostics({ diagnostics, onClose }) {
  const [expanded, setExpanded] = useState({});

  if (!diagnostics) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-[#0d0f14] border border-[#2a2d3a] rounded-lg p-6 w-96">
          <p className="text-slate-400">Sin diagnósticos disponibles</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-white text-sm">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const {
    regionsDetected = 0,
    regionsValid = 0,
    regionsRepaired = 0,
    stitchesOutOfBounds = 0,
    totalStitches = 0,
    jumps = 0,
    colorChanges = 0,
    avgDensity = 0,
    estimatedTime = 0,
    errors = [],
    warnings = []
  } = diagnostics;

  const toggleSection = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const statusColor = (current, total) => {
    const ratio = total > 0 ? current / total : 0;
    return ratio === 1 ? 'text-emerald-400' : ratio > 0.7 ? 'text-amber-400' : 'text-red-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#0d0f14] border border-[#2a2d3a] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0d0f14] border-b border-[#2a2d3a] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Diagnóstico de Vectorización</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* RESUMEN GENERAL */}
          <div className="bg-[#161a23] border border-[#2a2d3a] rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              RESUMEN GENERAL
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Regiones Detectadas:</span>
                <p className={`font-bold text-lg ${regionsDetected > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {regionsDetected}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Regiones Válidas:</span>
                <p className={`font-bold text-lg ${statusColor(regionsValid, regionsDetected)}`}>
                  {regionsValid}/{regionsDetected}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Puntadas Totales:</span>
                <p className="font-bold text-lg text-violet-400">{totalStitches.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-slate-500">Tiempo Estimado:</span>
                <p className="font-bold text-lg text-cyan-400">{estimatedTime}m</p>
              </div>
            </div>
          </div>

          {/* CALIDAD DE REPARACIÓN */}
          <Section
            title="Calidad de Reparación"
            expanded={expanded.repair}
            onToggle={() => toggleSection('repair')}
            icon={regionsRepaired > 0 ? AlertTriangle : CheckCircle}
            color={regionsRepaired > 0 ? 'text-amber-400' : 'text-emerald-400'}
          >
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Regiones Reparadas:</span>
                <span className={regionsRepaired > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>{regionsRepaired}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Puntadas Fuera de Límites:</span>
                <span className={stitchesOutOfBounds > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                  {stitchesOutOfBounds}
                </span>
              </div>
              <div className="mt-3 p-2 bg-[#0d0f14] rounded border-l-2 border-emerald-500">
                <p className="text-slate-300">
                  {stitchesOutOfBounds === 0
                    ? '✓ Todas las puntadas están dentro de los contornos'
                    : `⚠ ${stitchesOutOfBounds} puntadas detectadas fuera de límites`}
                </p>
              </div>
            </div>
          </Section>

          {/* OPTIMIZACIÓN */}
          <Section
            title="Optimización"
            expanded={expanded.opt}
            onToggle={() => toggleSection('opt')}
            icon={CheckCircle}
            color="text-cyan-400"
          >
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Saltos:</span>
                <span className="text-slate-300 font-bold">{jumps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cambios de Color:</span>
                <span className="text-slate-300 font-bold">{colorChanges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Densidad Media:</span>
                <span className="text-slate-300 font-bold">{(avgDensity * 100).toFixed(1)}%</span>
              </div>
            </div>
          </Section>

          {/* ERRORES */}
          {errors.length > 0 && (
            <Section
              title="Errores"
              expanded={expanded.errors}
              onToggle={() => toggleSection('errors')}
              icon={AlertCircle}
              color="text-red-400"
            >
              <div className="space-y-2">
                {errors.map((err, i) => (
                  <div key={i} className="p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-300">
                    {err}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ADVERTENCIAS */}
          {warnings.length > 0 && (
            <Section
              title="Advertencias"
              expanded={expanded.warnings}
              onToggle={() => toggleSection('warnings')}
              icon={AlertTriangle}
              color="text-amber-400"
            >
              <div className="space-y-2">
                {warnings.map((warn, i) => (
                  <div key={i} className="p-2 bg-amber-900/20 border border-amber-500/30 rounded text-xs text-amber-300">
                    {warn}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* RECOMENDACIONES */}
          <div className="bg-[#161a23] border border-[#2a2d3a] rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-2">Recomendaciones</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              {stitchesOutOfBounds > 0 && (
                <li>• Revisa las regiones con puntadas fuera de límites</li>
              )}
              {regionsRepaired > 0 && (
                <li>• Se realizaron reparaciones automáticas, verifica el resultado</li>
              )}
              {jumps > 10 && (
                <li>• Muchos saltos detectados, considera optimizar el orden de regiones</li>
              )}
              {estimatedTime > 120 && (
                <li>• Tiempo estimado alto, considera reducir densidad o simplificar el diseño</li>
              )}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#2a2d3a] px-6 py-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-white text-sm font-bold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, expanded, onToggle, icon: Icon, color, children }) {
  return (
    <div className="bg-[#161a23] border border-[#2a2d3a] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1e2130] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="font-bold text-white text-sm">{title}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      {expanded && <div className="px-4 py-3 border-t border-[#2a2d3a] bg-[#0d0f14]">{children}</div>}
    </div>
  );
}