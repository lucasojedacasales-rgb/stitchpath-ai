// base44/src/components/DecisionPanel.tsx
import React from 'react';
import { DecisionResult, ContentType } from '../../entities/DecisionResult';

interface DecisionPanelProps {
  decision: DecisionResult;
  onAcceptStrategy: () => void;
  onModifyStrategy: () => void;
}

const contentTypeLabels: Record<ContentType, { label: string; emoji: string; description: string }> = {
  logo: { label: 'Logo', emoji: '🎯', description: 'Diseño corporativo con bordes definidos' },
  text: { label: 'Texto', emoji: '📝', description: 'Tipografía y caracteres' },
  anime: { label: 'Anime/Vector', emoji: '✨', description: 'Arte con colores planos y líneas negras' },
  photo: { label: 'Fotografía', emoji: '📷', description: 'Imagen real con textura y degradados' },
  illustration: { label: 'Ilustración', emoji: '🎨', description: 'Arte digital intermedio' },
  mixed: { label: 'Contenido Mixto', emoji: '🔀', description: 'Combinación de elementos' }
};

const complexityColors = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-red-400'
};

export const DecisionPanel: React.FC<DecisionPanelProps> = ({ 
  decision, 
  onAcceptStrategy, 
  onModifyStrategy 
}) => {
  const contentInfo = contentTypeLabels[decision.contentType];
  const confidencePercent = Math.round(decision.confidence * 100);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-4xl">{contentInfo.emoji}</span>
        <div>
          <h2 className="text-xl font-bold text-white">
            Detectado: {contentInfo.label}
          </h2>
          <p className="text-gray-400 text-sm">{contentInfo.description}</p>
        </div>
        <div className="ml-auto">
          <div className={`text-sm font-mono ${confidencePercent > 70 ? 'text-green-400' : confidencePercent > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            Confianza: {confidencePercent}%
          </div>
        </div>
      </div>

      {/* Propiedades detectadas */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <PropertyCard 
          label="Colores únicos" 
          value={decision.properties.colorCount.toString()} 
          highlight={decision.properties.colorCount > 32}
        />
        <PropertyCard 
          label="Complejidad" 
          value={decision.properties.complexity.toUpperCase()} 
          className={complexityColors[decision.properties.complexity]}
        />
        <PropertyCard 
          label="Dimensiones" 
          value={`${decision.dimensions.width} × ${decision.dimensions.height}`} 
        />
        <PropertyCard 
          label="Hilos estimados" 
          value={decision.estimatedThreadColors.toString()} 
        />
      </div>

      {/* Características detectadas */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">
          Características detectadas
        </h3>
        <div className="flex flex-wrap gap-2">
          <FeatureBadge active={decision.properties.hasShadows} label="Sombras" />
          <FeatureBadge active={decision.properties.hasGradients} label="Degradados" />
          <FeatureBadge active={decision.properties.hasTransparency} label="Transparencia" />
          <FeatureBadge active={decision.properties.hasFineDetails} label="Detalles finos" />
          <FeatureBadge active={decision.properties.isHighContrast} label="Alto contraste" />
        </div>
      </div>

      {/* Estrategia recomendada */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
          Estrategia recomendada
        </h3>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <StrategyItem label="Modo" value={decision.strategy.vectorizationMode} />
          <StrategyItem label="Tipo de puntada" value={decision.strategy.stitchType} />
          <StrategyItem label="Reducción de color" value={decision.strategy.colorReduction} />
          <StrategyItem label="Preservación de detalle" value={decision.strategy.detailPreservation} />
        </div>

        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-1">Parámetros:</div>
          <code className="text-xs text-cyan-400 font-mono">
            maxColors={decision.strategy.recommendedParams.maxColors}, 
            minRegion={decision.strategy.recommendedParams.minRegionArea},
            merge={decision.strategy.recommendedParams.mergeThreshold},
            simplify={decision.strategy.recommendedParams.simplification}
          </code>
        </div>

        <div className="mt-3 flex gap-1">
          {decision.strategy.pipeline.map((step, i) => (
            <React.Fragment key={step}>
              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                {step}
              </span>
              {i < decision.strategy.pipeline.length - 1 && (
                <span className="text-gray-600">→</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {decision.warnings.length > 0 && (
        <div className="mb-6">
          {decision.warnings.map((warning, i) => (
            <div key={i} className="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-700/50 rounded px-3 py-2 mb-2">
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* Colores dominantes */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">
          Colores dominantes
        </h3>
        <div className="flex gap-2">
          {decision.properties.dominantColors.slice(0, 8).map((color, i) => (
            <div key={i} className="group relative">
              <div 
                className="w-8 h-8 rounded border border-gray-600"
                style={{ backgroundColor: color }}
              />
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition">
                {color}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <button
          onClick={onAcceptStrategy}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition"
        >
          ✅ Aplicar estrategia recomendada
        </button>
        <button
          onClick={onModifyStrategy}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition"
        >
          ⚙️ Modificar parámetros
        </button>
      </div>
    </div>
  );
};

// Subcomponentes
const PropertyCard: React.FC<{ label: string; value: string; highlight?: boolean; className?: string }> = ({ 
  label, value, highlight, className 
}) => (
  <div className="bg-gray-800 rounded p-3">
    <div className="text-xs text-gray-500 uppercase">{label}</div>
    <div className={`text-lg font-mono ${highlight ? 'text-red-400' : 'text-white'} ${className || ''}`}>
      {value}
    </div>
  </div>
);

const FeatureBadge: React.FC<{ active: boolean; label: string }> = ({ active, label }) => (
  <span className={`text-xs px-2 py-1 rounded border ${
    active 
      ? 'bg-green-900/30 text-green-400 border-green-700' 
      : 'bg-gray-800 text-gray-600 border-gray-700'
  }`}>
    {active ? '✓' : '✗'} {label}
  </span>
);

const StrategyItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-gray-500">{label}:</span>
    <span className="text-cyan-400 font-mono capitalize">{value}</span>
  </div>
);
