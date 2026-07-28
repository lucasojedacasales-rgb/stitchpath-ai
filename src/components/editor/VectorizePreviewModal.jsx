import { useState, useRef, useEffect, useCallback } from 'react';
import { X, RefreshCw, Check, Info } from 'lucide-react';
import { traceContoursProf } from '@/lib/contourEngine';

/**
 * Vista previa de la separación por colores con parámetros ajustables.
 * Usa el MISMO motor de contornos que el pipeline real (traceContoursProf),
 * así la vista previa refleja fielmente el resultado. Las regiones actuales
 * NO se tocan hasta pulsar «Aplicar vectorización».
 */

const SLIDERS = [
  { key: 'colorCount',        label: 'Número de colores',       min: 2,   max: 16,  step: 1,    tip: 'Colores aproximados de la paleta final.' },
  { key: 'colorMergeDeltaE',  label: 'Tolerancia de similitud', min: 0,   max: 30,  step: 1,    tip: 'ΔE perceptual (Lab): tonos más cercanos que esto se fusionan (antialiasing, sombras).' },
  { key: 'noisePasses',       label: 'Eliminación de ruido',    min: 0,   max: 3,   step: 1,    tip: 'Pasadas de filtro de mayoría — limpia píxeles sueltos del antialiasing.' },
  { key: 'minAreaPx',         label: 'Tamaño mínimo (px²)',     min: 10,  max: 500, step: 10,   tip: 'Regiones más pequeñas que esto se descartan como ruido.' },
  { key: 'chaikinPasses',     label: 'Suavizado de bordes',     min: 0,   max: 5,   step: 1,    tip: 'Pasadas de suavizado Chaikin sobre cada contorno.' },
  { key: 'gapCloseThreshold', label: 'Unión de regiones cercanas', min: 0, max: 40, step: 1,   tip: 'Distancia (px) para cerrar huecos entre contornos del mismo color.' },
  { key: 'minAreaFactor',     label: 'Conservar detalles',      min: 0.25, max: 3, step: 0.25, tip: 'Menor valor = conserva más zonas pequeñas importantes (ojos, nariz).' },
];

export default function VectorizePreviewModal({ imageUrl, config, onApply, onClose }) {
  const [params, setParams] = useState({
    colorCount: Math.max(2, Math.min(16, config?.color_count || 8)),
    colorMergeDeltaE: config?.vectorTuning?.colorMergeDeltaE ?? 12,
    noisePasses: config?.vectorTuning?.noisePasses ?? 1,
    minAreaPx: config?.vectorTuning?.minAreaPx ?? 60,
    chaikinPasses: config?.vectorTuning?.chaikinPasses ?? 3,
    gapCloseThreshold: config?.vectorTuning?.gapCloseThreshold ?? 12,
    minAreaFactor: config?.vectorTuning?.minAreaFactor ?? 1,
    detectDarkOutline: config?.vectorTuning?.detectDarkOutline ?? true,
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const canvasRef = useRef(null);
  const cancelledRef = useRef(false);

  const set = (key, value) => { setParams(p => ({ ...p, [key]: value })); setDirty(true); };

  const drawPreview = (res) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aspect = (res.imageHeight || 1) / (res.imageWidth || 1);
    const W = 560;
    const H = Math.round(W * aspect);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, W, H);
    const sorted = [...res.regions].sort((a, b) => (b.pixelCount || 0) - (a.pixelCount || 0));
    for (const r of sorted) {
      const pts = r.path_points;
      if (!pts || pts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
      ctx.closePath();
      ctx.fillStyle = r.hex || '#888';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  };

  const runPreview = useCallback(async (p = params) => {
    if (!imageUrl) return;
    setRunning(true);
    setError(null);
    try {
      const res = await traceContoursProf(imageUrl, p.colorCount, {
        colorMergeDeltaE: p.colorMergeDeltaE,
        noisePasses: p.noisePasses,
        minAreaPx: p.minAreaPx,
        chaikinPasses: p.chaikinPasses,
        gapCloseThreshold: p.gapCloseThreshold,
        minAreaFactor: p.minAreaFactor,
        detectDarkOutline: p.detectDarkOutline,
      });
      if (cancelledRef.current) return;
      drawPreview(res);
      setResult({
        count: res.regions.length,
        colors: new Set(res.regions.map(r => r.hex)).size,
      });
      setDirty(false);
    } catch (e) {
      if (!cancelledRef.current) setError(e.message || 'Error al calcular la vista previa');
    } finally {
      if (!cancelledRef.current) setRunning(false);
    }
  }, [imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelledRef.current = false;
    runPreview();
    return () => { cancelledRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="bg-[#0d0f14] border border-[#1e2130] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100dvh - 24px)' }}>
        {/* Cabecera */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#1e2130] flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">Separación de colores</h3>
            <p className="text-[11px] text-slate-500">Ajusta, previsualiza y confirma antes de sustituir la vectorización actual</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" title="Cerrar" className="p-1.5 rounded hover:bg-[#1e2130] text-slate-500 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-[1fr_250px] gap-4">
          {/* Comparación original / separación */}
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Original</div>
                <div className="rounded-lg border border-[#2a2d3a] bg-[#161a23] overflow-hidden flex items-center justify-center min-h-[140px]">
                  <img src={imageUrl} alt="Imagen original" className="max-w-full max-h-[280px] object-contain" />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Separación por colores</div>
                <div className="relative rounded-lg border border-[#2a2d3a] bg-[#161a23] overflow-hidden flex items-center justify-center min-h-[140px]">
                  <canvas ref={canvasRef} className="max-w-full max-h-[280px] w-auto h-auto" />
                  {running && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {result && !error && (
              <div className="text-[11px] text-slate-400">
                <span className="text-violet-300 font-bold">{result.count}</span> regiones detectadas ·{' '}
                <span className="text-cyan-300 font-bold">{result.colors}</span> colores
                {dirty && <span className="text-amber-400 ml-2">— parámetros cambiados, actualiza la vista previa</span>}
              </div>
            )}
            {error && (
              <div className="text-[11px] text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                No se pudo calcular la vista previa: {error}. La vectorización actual se conserva.
              </div>
            )}
          </div>

          {/* Controles */}
          <div className="space-y-3">
            {SLIDERS.map(({ key, label, min, max, step, tip }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[11px] text-slate-400 flex items-center gap-1" title={tip}>
                    {label}
                    <Info className="w-2.5 h-2.5 text-slate-600" aria-hidden="true" />
                  </label>
                  <span className="text-[11px] font-bold text-violet-300">{params[key]}</span>
                </div>
                <input
                  type="range"
                  min={min} max={max} step={step}
                  value={params[key]}
                  onChange={e => set(key, Number(e.target.value))}
                  aria-label={label}
                  title={tip}
                  className="w-full accent-violet-600"
                />
              </div>
            ))}
            <label className="flex items-center gap-2 cursor-pointer" title="Garantiza que las líneas negras/oscuras se detecten como regiones propias">
              <input
                type="checkbox"
                checked={params.detectDarkOutline}
                onChange={e => set('detectDarkOutline', e.target.checked)}
                aria-label="Detección de contornos oscuros"
                className="accent-violet-600"
              />
              <span className="text-[11px] text-slate-400">Detección de contornos oscuros</span>
            </label>
          </div>
        </div>

        {/* Pie */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-[#1e2130] flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="Cancelar sin cambios"
            className="px-4 py-2 rounded-lg bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            Cancelar
          </button>
          <button
            onClick={() => runPreview()}
            disabled={running}
            aria-label="Actualizar vista previa"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#161a23] border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/20 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} /> Actualizar vista previa
          </button>
          <button
            onClick={() => onApply(params)}
            disabled={running || !result || !!error}
            aria-label="Aplicar vectorización"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            <Check className="w-3.5 h-3.5" /> Aplicar vectorización
          </button>
        </div>
      </div>
    </div>
  );
}