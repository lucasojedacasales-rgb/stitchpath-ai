import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useFinalLookSegments } from './finalLook/useFinalLookSegments';
import { pickHighContrastBackground } from './finalLook/finalLookBackgrounds';
import { luminance } from './finalLook/finalLookColors';
import FinalLookCanvas from './finalLook/FinalLookCanvas';
import FinalLookToolbar from './finalLook/FinalLookToolbar';
import FinalLookInfoCard from './finalLook/FinalLookInfoCard';

const DEFAULT_LAYERS = {
  fills: true, contours: true, details: true, discarded: true,
  direction: false, startEnd: false, jumps: false, trims: false, isolate: false,
};

/**
 * FinalLookSimulator — previsualización técnica del bordado final.
 * SOLO LECTURA: dibuja los comandos generados por el motor; nunca los modifica.
 */
export default function FinalLookSimulator({ regions, config, machineSettings, detailReport, finalCommands, finalObjects, imageUrl, originalImageUrl }) {
  const widthMm = config?.width_mm || 100;
  const heightMm = config?.height_mm || 100;

  const data = useFinalLookSegments({
    commands: finalCommands || [], objects: finalObjects || [], regions: regions || [],
    detailReport, widthMm, heightMm,
  });

  const [view, setView] = useState('final');
  const [mode, setMode] = useState('technical');
  const [background, setBackground] = useState('neutral');
  const [threadMm, setThreadMm] = useState(0.5);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [magnifier, setMagnifier] = useState(false);
  const [magnifierZoom, setMagnifierZoom] = useState(4);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [compare, setCompare] = useState(false);
  const fitRef = useRef(1);

  useEffect(() => {
    console.log('[command-sync] finalLook source: finalEmbroideryCommands (read-only)');
  }, []);

  const avgLum = useMemo(() => {
    const seen = new Map();
    for (const s of data.segments) if (!seen.has(s.color)) seen.set(s.color, luminance(s.color));
    if (!seen.size) return 0.5;
    return [...seen.values()].reduce((a, b) => a + b, 0) / seen.size;
  }, [data.segments]);

  const toggleLayer = useCallback((key) => setLayers(l => ({ ...l, [key]: !l[key] })), []);
  const zoomBy = useCallback((f) => setZoom(z => Math.max(0.2, Math.min(60, z * f))), []);
  const fit = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const zoomAt = useCallback((point, size, factor = 2) => {
    setZoom((z) => {
      const next = Math.max(0.2, Math.min(60, z * factor));
      const k = next / z;
      setPan((p) => ({
        x: (point.x - size.w / 2) * (1 - k) + p.x * k,
        y: (point.y - size.h / 2) * (1 - k) + p.y * k,
      }));
      return next;
    });
  }, []);

  const selectedStats = selectedRegionId ? data.regionStats.get(selectedRegionId) : null;

  const canvasProps = {
    data, regions, widthMm, heightMm, mode, background, threadMm,
    layers, showDirection: layers.direction, showJumps: layers.jumps,
    showTrims: layers.trims, showStartEnd: layers.startEnd,
    highlightDiscarded: layers.discarded, isolate: layers.isolate,
    selectedRegionId, onSelectRegion: setSelectedRegionId,
    zoom, pan, onPanChange: setPan, onZoomAt: zoomAt,
    magnifier, magnifierZoom,
    originalImageUrl: originalImageUrl || imageUrl,
    onFitScale: (f) => { fitRef.current = f; },
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0b0d12]">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-[#1e2130] bg-[#10131a] px-4 py-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <h2 className="text-sm font-bold text-slate-100">Final Look</h2>
        <span className="text-[10px] text-slate-500">Inspección visual · solo lectura</span>
        <span className="ml-auto text-[10px] text-slate-600">{data.segments.length.toLocaleString('es-ES')} puntadas dibujadas</span>
      </header>

      <FinalLookToolbar
        view={view} onView={setView}
        mode={mode} onMode={setMode}
        background={background} onBackground={setBackground}
        onHighContrast={() => setBackground(pickHighContrastBackground(avgLum))}
        zoom={zoom} onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(1 / 1.25)}
        onFit={fit} onHundred={fit}
        onReal={() => { setZoom(3.7795 / (fitRef.current || 1)); setPan({ x: 0, y: 0 }); }}
        magnifier={magnifier} onMagnifier={() => setMagnifier(v => !v)}
        magnifierZoom={magnifierZoom} onMagnifierZoom={setMagnifierZoom}
        layers={layers} onLayer={toggleLayer}
        threadMm={threadMm} onThread={setThreadMm}
        compare={compare} onCompare={() => setCompare(v => !v)}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        <div className="flex h-full gap-2">
          {compare && (
            <div className="relative hidden h-full flex-1 overflow-hidden rounded-xl border border-[#242936] sm:block">
              <FinalLookCanvas {...canvasProps} view="original" magnifier={false} />
              <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-slate-300">Antes · original</span>
            </div>
          )}
          <div className="relative h-full flex-1 overflow-hidden rounded-xl border border-[#242936]">
            <FinalLookCanvas {...canvasProps} view={view} />
            {compare && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-violet-300">Después · {view}</span>}
            <FinalLookInfoCard stats={selectedStats} onClose={() => setSelectedRegionId(null)} />
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[#1e2130] bg-[#0d0f14] px-3 py-1.5 text-[10px] text-slate-400">
        <Legend swatch="bg-slate-300" label="Relleno" />
        <Legend swatch="bg-cyan-400" label="Satén / contorno" />
        <Legend swatch="bg-violet-400" label="Detalle" />
        <Legend swatch="bg-red-500" label="Descartado" />
        <Legend swatch="bg-amber-400" label="Salto" />
        <Legend swatch="bg-emerald-500" label="Inicio" />
        <Legend swatch="bg-blue-500" label="Fin" />
        <span className="text-slate-600">Clic: seleccionar · Arrastrar: mover · Doble clic / rueda: zoom</span>
      </div>
    </div>
  );
}

function Legend({ swatch, label }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} />{label}</span>;
}