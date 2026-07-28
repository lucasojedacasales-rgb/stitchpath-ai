import { ZoomIn, ZoomOut, Maximize2, Search, Ruler } from 'lucide-react';
import { BACKGROUNDS } from './finalLookBackgrounds';

function Chip({ active, onClick, children, title, accent = 'violet' }) {
  const on = accent === 'cyan'
    ? 'border-cyan-500/60 bg-cyan-900/25 text-cyan-200'
    : 'border-violet-500/60 bg-violet-900/25 text-violet-200';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${
        active ? on : 'border-[#2a2d3a] bg-[#11141c] text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

const VIEWS = [
  { id: 'original', label: 'Original' },
  { id: 'vector', label: 'Vectorizado' },
  { id: 'stitch', label: 'Puntadas' },
  { id: 'final', label: 'Final' },
];

export default function FinalLookToolbar({
  view, onView, mode, onMode, background, onBackground, onHighContrast,
  zoom, onZoomIn, onZoomOut, onFit, onReal, onHundred,
  magnifier, onMagnifier, magnifierZoom, onMagnifierZoom,
  layers, onLayer, threadMm, onThread, compare, onCompare,
}) {
  return (
    <div className="flex-shrink-0 space-y-2 border-b border-[#1e2130] bg-[#0d0f14] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 rounded-lg border border-[#2a2d3a] bg-[#11141c] p-0.5">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => onView(v.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${view === v.id ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[#2a2d3a] bg-[#11141c] p-0.5">
          <button onClick={() => onMode('technical')} title="Vista técnica — máxima lectura de puntada"
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${mode === 'technical' ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Técnica</button>
          <button onClick={() => onMode('realistic')} title="Vista realista — acabado textil aproximado"
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${mode === 'realistic' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Realista</button>
        </div>

        <Chip active={compare} onClick={onCompare} title="Comparar antes / después" accent="cyan">Comparar</Chip>

        <div className="ml-auto flex items-center gap-1">
          <Chip onClick={onZoomOut} title="Alejar"><ZoomOut className="h-3.5 w-3.5" /></Chip>
          <Chip onClick={onZoomIn} title="Acercar"><ZoomIn className="h-3.5 w-3.5" /></Chip>
          <Chip onClick={onFit} title="Ajustar a pantalla"><Maximize2 className="h-3.5 w-3.5" /></Chip>
          <Chip onClick={onHundred} title="Zoom 100%">100%</Chip>
          <Chip onClick={onReal} title="Tamaño real aproximado"><Ruler className="h-3.5 w-3.5" /></Chip>
          <span className="ml-1 rounded-md bg-[#11141c] px-2 py-1 text-[11px] font-bold text-cyan-300">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Capas</span>
          <Chip active={layers.fills} onClick={() => onLayer('fills')}>Rellenos</Chip>
          <Chip active={layers.contours} onClick={() => onLayer('contours')}>Contornos</Chip>
          <Chip active={layers.details} onClick={() => onLayer('details')}>Detalles</Chip>
          <Chip active={layers.discarded} onClick={() => onLayer('discarded')}>Descartados</Chip>
          <Chip active={layers.direction} onClick={() => onLayer('direction')}>Dirección</Chip>
          <Chip active={layers.startEnd} onClick={() => onLayer('startEnd')}>Inicio/fin</Chip>
          <Chip active={layers.jumps} onClick={() => onLayer('jumps')}>Saltos</Chip>
          <Chip active={layers.trims} onClick={() => onLayer('trims')}>Cortes</Chip>
          <Chip active={layers.isolate} onClick={() => onLayer('isolate')} accent="cyan">Aislar</Chip>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
            Hilo
            <input type="range" min="0.25" max="1.6" step="0.05" value={threadMm}
              onChange={(e) => onThread(Number(e.target.value))}
              className="w-20 accent-cyan-400" aria-label="Grosor visual del hilo" />
            <span className="w-9 font-bold text-cyan-300">{threadMm.toFixed(2)}</span>
          </label>

          <select value={background} onChange={(e) => onBackground(e.target.value)}
            aria-label="Fondo de inspección"
            className="rounded-lg border border-[#2a2d3a] bg-[#11141c] px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-violet-500">
            {BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <Chip onClick={onHighContrast} title="Elegir fondo con mejor contraste">Alto contraste</Chip>

          <Chip active={magnifier} onClick={onMagnifier} accent="cyan" title="Lupa de inspección">
            <span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" /> Lupa</span>
          </Chip>
          {magnifier && (
            <div className="flex items-center gap-1">
              {[2, 4, 8].map(m => (
                <Chip key={m} active={magnifierZoom === m} onClick={() => onMagnifierZoom(m)} accent="cyan">{m}×</Chip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}