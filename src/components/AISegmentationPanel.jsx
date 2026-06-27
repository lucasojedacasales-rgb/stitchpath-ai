import React from 'react';
import { useAISegmentation } from '../hooks/useAISegmentation';

const STITCH_COLORS = {
  SATIN: 'bg-pink-500',
  TATAMI_FILL: 'bg-blue-500',
  RUNNING: 'bg-green-500',
  CONTOUR: 'bg-yellow-500',
  ZIGZAG: 'bg-purple-500',
  APPLIQUE: 'bg-orange-500'
};

const STITCH_ICONS = {
  SATIN: '✨',
  TATAMI_FILL: '▦',
  RUNNING: '━',
  CONTOUR: '○',
  ZIGZAG: '〰',
  APPLIQUE: '◈'
};

export default function AISegmentationPanel({ image, onAnalysisComplete }) {
  const { analyze, analyzing, result, error, reset } = useAISegmentation();

  const handleAnalyze = async () => {
    if (!image) return;
    const data = await analyze(image);
    if (data) onAnalysisComplete?.(data);
  };

  if (analyzing) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-700">
        <div className="flex items-center gap-3">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-gray-300">Analizando regiones con IA...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-red-700">
        <div className="text-red-400 mb-2">❌ Error: {error}</div>
        <button onClick={reset} className="mt-4 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Reintentar
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4">🧠 Segmentación IA</h3>
        <button
          onClick={handleAnalyze}
          disabled={!image}
          className="w-full py-3 bg-blue-600 rounded-lg font-semibold text-white hover:bg-blue-500 disabled:bg-gray-700"
        >
          {image ? 'Analizar Imagen con IA' : 'Sube una imagen primero'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-700 space-y-6">
      <h3 className="text-xl font-bold text-white">🧠 Análisis de Segmentación IA</h3>

      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Estrategia Global</h4>
        <div className="flex flex-wrap gap-2">
          {result.globalStrategy.primaryStitches.map(stitch => (
            <span key={stitch} className={`px-3 py-1 rounded-full text-xs font-medium text-white ${STITCH_COLORS[stitch]}`}>
              {STITCH_ICONS[stitch]} {stitch.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-3">
          Regiones Detectadas ({result.summary.totalRegions})
        </h4>
        <div className="space-y-3">
          {result.regions.map(region => (
            <div key={region.id} className="bg-gray-800 rounded-lg p-3 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg capitalize text-white font-medium">{region.label}</span>
                <span className={`px-2 py-0.5 rounded text-xs text-white ${STITCH_COLORS[region.stitch]}`}>
                  {STITCH_ICONS[region.stitch]} {region.stitch.replace('_', ' ')}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-2">
                Curvatura: {region.metrics.curvature} | Área: {region.metrics.area}px² | Conf: {(region.stitchConfidence * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 italic">{region.reason}</div>
            </div>
          ))}
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Advertencias</h4>
          {result.warnings.map((w, i) => (
            <div key={i} className="text-xs text-yellow-300 mb-1">
              <strong>{w.region}:</strong> {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-300">🎨 Colores estimados</h4>
        <div className="text-2xl font-bold text-white">{result.colorEstimate}</div>
      </div>

      <button onClick={reset} className="w-full py-2 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600">
        Analizar otra imagen
      </button>
    </div>
  );
}
