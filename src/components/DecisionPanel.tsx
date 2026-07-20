// src/base44/components/DecisionPanel.tsx
import React from 'react';
import { Zap, Settings, AlertTriangle, CheckCircle, Loader2, X } from 'lucide-react';
import type { DecisionResult, ProcessingStrategy } from '../entities/DecisionResult';

interface DecisionPanelProps {
  result: DecisionResult | null;
  status: 'idle' | 'analyzing' | 'vectorizing' | 'complete' | 'error';
  progress: number;
  error: string | null;
  isLoading: boolean;
  onProceed: () => void;
  onAdjustParams: () => void;
  onCancel: () => void;
  className?: string;
}

/**
 * DecisionPanel — Panel visual que muestra la decisión de la IA
 * Se integra en el paso 2 del editor (entre subir imagen y vectorizar)
 */
export const DecisionPanel: React.FC<DecisionPanelProps> = ({
  result,
  status,
  progress,
  error,
  isLoading,
  onProceed,
  onAdjustParams,
  onCancel,
  className = '',
}) => {
  // ─── Loading: Analizando ───
  if (status === 'analyzing') {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}>
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">🔍 Analizando imagen con IA...</p>
          <p className="text-xs text-slate-500 mt-1">Detectando tipo de contenido, colores y complejidad</p>
        </div>
        <div className="w-48 h-1.5 bg-[#1a1d27] rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Loading: Vectorizando ───
  if (status === 'vectorizing') {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}>
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">🧵 Generando puntadas...</p>
          <p className="text-xs text-slate-500 mt-1">Vectorizando regiones y clasificando stitches</p>
        </div>
        <div className="w-48 h-1.5 bg-[#1a1d27] rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div className={`flex flex-col items-center gap-3 py-8 ${className}`}>
        <AlertTriangle className="w-10 h-10 text-red-500" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-[#1a1d27] border border-[#2a2d3a] text-slate-400 hover:text-white text-xs transition-colors"
        >
          Volver
        </button>
      </div>
    );
  }

  // ─── No hay resultado ───
  if (!result) return null;

  // ─── Resultado completo ───
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-white">
            IA detectó: <span className="text-violet-400 capitalize">{result.contentType}</span>
          </h3>
          <p className="text-xs text-slate-500">
            Confianza: {Math.round(result.confidence * 100)}% • {result.dimensions.width}×{result.dimensions.height}px
          </p>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">Advertencias</span>
          </div>
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-red-300/80 pl-2 border-l-2 border-red-500/30">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Propiedades */}
      <div className="grid grid-cols-2 gap-2">
        <PropertyBadge
          label="Sombras"
          active={result.properties.hasShadows}
          icon="☁️"
        />
        <PropertyBadge
          label="Degradados"
          active={result.properties.hasGradients}
          icon="🌈"
        />
        <PropertyBadge
          label="Transparencia"
          active={result.properties.hasTransparency}
          icon="👻"
        />
        <PropertyBadge
          label="Detalles finos"
          active={result.properties.hasFineDetails}
          icon="🔬"
        />
        <PropertyBadge
          label="Alto contraste"
          active={result.properties.isHighContrast}
          icon="⚡"
        />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161a23] border border-[#2a2d3a]">
          <span className="text-sm">🎨</span>
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Colores</span>
            <span className="text-xs font-semibold text-white ml-2">{result.properties.colorCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161a23] border border-[#2a2d3a]">
          <span className="text-sm">📊</span>
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Complejidad</span>
            <span className="text-xs font-semibold text-white ml-2 capitalize">{result.properties.complexity}</span>
          </div>
        </div>
      </div>

      {/* Estrategia */}
      <div className="bg-[#161a23] border border-[#2a2d3a] rounded-lg p-3">
        <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          🎯 Estrategia recomendada
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <StrategyRow label="Modo" value={translateMode(result.strategy.vectorizationMode)} />
          <StrategyRow label="Stitch" value={translateStitch(result.strategy.stitchType)} />
          <StrategyRow label="Reducción color" value={translateReduction(result.strategy.colorReduction)} />
          <StrategyRow label="Detalles" value={translateDetail(result.strategy.detailPreservation)} />
        </div>
        <div className="mt-3 pt-3 border-t border-[#2a2d3a]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-violet-400 font-mono">{result.strategy.recommendedParams.maxColors}</span>
            <span>colores máx.</span>
            <span className="mx-1 text-slate-600">•</span>
            <span className="text-violet-400 font-mono">{result.strategy.recommendedParams.minRegionArea}</span>
            <span>mm² mín.</span>
          </div>
        </div>
      </div>

      {/* Colores estimados */}
      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5">
          {result.properties.dominantColors.slice(0, 6).map((color, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full border-2 border-[#0d0f14]"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {result.properties.dominantColors.length > 6 && (
            <div className="w-6 h-6 rounded-full border-2 border-[#0d0f14] bg-[#1a1d27] flex items-center justify-center text-[9px] text-slate-500 font-bold">
              +{result.properties.dominantColors.length - 6}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-500">
          ~<strong className="text-violet-400">{result.estimatedThreadColors}</strong> colores de hilo estimados
        </span>
      </div>

      {/* Pipeline */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {result.strategy.pipeline.map((step, i) => (
          <React.Fragment key={step}>
            <span className="px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-500/20 text-[10px] font-medium text-violet-300">
              {translateStep(step)}
            </span>
            {i < result.strategy.pipeline.length - 1 && (
              <span className="text-slate-600 text-xs">→</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[#1a1d27]">
        <button
          onClick={onProceed}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          <Zap className="w-4 h-4" />
          {isLoading ? 'Procesando...' : '✨ Vectorizar con estos parámetros'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onAdjustParams}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#161a23] border border-[#2a2d3a] hover:border-violet-500/50 text-slate-400 hover:text-white text-xs transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Ajustar parámetros
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-[#161a23] border border-[#2a2d3a] hover:border-red-500/30 text-slate-500 hover:text-red-400 text-xs transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-componentes ───

function PropertyBadge({ label, active, icon }: { label: string; active: boolean; icon: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
      active
        ? 'bg-violet-900/10 border-violet-500/30'
        : 'bg-[#161a23] border-[#2a2d3a] opacity-50'
    }`}>
      <span className="text-sm">{icon}</span>
      <span className="text-xs text-slate-400">{label}</span>
      {active && <span className="ml-auto text-[10px] font-bold text-violet-400">SÍ</span>}
    </div>
  );
}

function StrategyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

// ─── Traducciones ───

function translateMode(mode: string): string {
  const map: Record<string, string> = {
    posterize: 'Posterización',
    'edge-trace': 'Trazado de bordes',
    'color-quantize': 'Cuantización',
    skip: 'Sin pre-proceso',
  };
  return map[mode] || mode;
}

function translateStitch(type: string): string {
  const map: Record<string, string> = {
    fill: 'Relleno (Tatami)',
    satin: 'Satén',
    running: 'Pespunte',
    mixed: 'Mixto',
    auto: 'Automático',
  };
  return map[type] || type;
}

function translateReduction(r: string): string {
  const map: Record<string, string> = { none: 'Ninguna', light: 'Leve', aggressive: 'Agresiva' };
  return map[r] || r;
}

function translateDetail(d: string): string {
  const map: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
  return map[d] || d;
}

function translateStep(step: string): string {
  const map: Record<string, string> = {
    preprocess: 'Pre-procesar',
    vectorize: 'Vectorizar',
    'classify-stitches': 'Clasificar',
    generate: 'Generar',
    optimize: 'Optimizar',
  };
  return map[step] || step;
}

export default DecisionPanel;
