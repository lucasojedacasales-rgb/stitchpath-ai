import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Zap, Cpu, Settings, BookMarked, Brain } from 'lucide-react';
import WorkflowPresetPanel from './WorkflowPresetPanel';

const FABRIC_TYPES = ['Algodón', 'Poliéster', 'Mezcla', 'Denim', 'Lino', 'Seda', 'Lycra', 'Otro'];

const MODES = [
  { id: 'hybrid', name: 'Híbrido', desc: 'Pixel-perfect + Claude Sonnet', badge: 'Recomendado' },
  { id: 'ultra', name: 'Ultra-Detallada', desc: '1200px+ micro-detalles' },
  { id: 'standard', name: 'Estándar', desc: 'Rápido, balance calidad/velocidad' },
  { id: 'precision', name: 'Precisión', desc: 'Máximo detalle, más puntadas' },
  { id: 'potrace', name: 'Potrace', desc: 'Rápido, sin IA extra' },
  { 
    id: 'ai-segmentation', 
    name: '🧠 AI Segmentation', 
    desc: 'Regiones inteligentes: nariz→Satín, cuerpo→Tatami',
    badge: 'Beta'
  },
];

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#1e2130]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1e2130]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-[#2a2d3a]'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
}

// ── AI Segmentation Section (componente separado para evitar duplicados) ──
function AISegmentationSection({ config, onAnalyze }) {
  const [segments, setSegments] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const analyze = useCallback(async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      setError('No hay imagen para analizar. Carga una imagen primero.');
      return;
    }

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = imageData.data.some((pixel, i) => i % 4 === 3 && pixel > 0);
    
    if (!hasContent) {
      setError('El canvas está vacío. Carga una imagen primero.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setHasAnalyzed(true);

    try {
      const imageBase64 = canvas.toDataURL('image/png');
      
      const response = await fetch('/api/ai-segment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          concepts: ['nose', 'eye', 'body', 'mouth', 'head', 'ear', 'tail']
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Error desconocido');

      if (!result.regions?.length) throw new Error('No se detectaron regiones');

      if (isMounted.current) {
        setSegments(result.regions);
        console.log('✅ AI Segmentation:', result);
      }
    } catch (err) {
      if (isMounted.current) {
        console.error('❌ Error AI Segmentation:', err);
        setError(err.message);
        setSegments([]);
      }
    } finally {
      if (isMounted.current) setAnalyzing(false);
    }
  }, []);

  // Auto-analizar al montar si estamos en modo AI
  useEffect(() => {
    if (!hasAnalyzed && !analyzing) {
      analyze();
    }
  }, [hasAnalyzed, analyzing, analyze]);

  return (
    <Section title="Regiones IA Detectadas" icon={Brain} defaultOpen={true}>
      <div className="space-y-2">
        {analyzing ? (
          <div className="flex items-center gap-2 text-slate-400 py-4">
            <div className="animate-spin w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full" />
            <span className="text-xs">Analizando regiones con IA...</span>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
              <span>❌</span>
              <span className="font-semibold">Error en análisis</span>
            </div>
            <p className="text-[11px] text-red-300/80">{error}</p>
            <button
              onClick={analyze}
              className="mt-2 text-[11px] px-3 py-1.5 rounded bg-red-600/30 text-red-300 border border-red-500/30 hover:bg-red-600/50 transition-colors"
            >
              Reintentar análisis
            </button>
          </div>
        ) : segments.length > 0 ? (
          <>
            <div className="text-[10px] text-slate-500 mb-2">
              {segments.length} regiones detectadas
            </div>
            {segments.map((region) => (
              <div 
                key={region.id} 
                className="bg-[#161a23] border border-[#2a2d3a] rounded-lg p-2.5 hover:border-violet-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold capitalize text-white">{region.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      region.stitch === 'SATIN' ? 'bg-pink-600/30 text-pink-300 border border-pink-500/30' :
                      region.stitch === 'TATAMI_FILL' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' :
                      region.stitch === 'RUNNING' ? 'bg-green-600/30 text-green-300 border border-green-500/30' :
                      'bg-gray-600/30 text-gray-300 border border-gray-500/30'
                    }`}>
                      {region.stitch === 'SATIN' ? '✨' : 
                       region.stitch === 'TATAMI_FILL' ? '▦' : 
                       region.stitch === 'RUNNING' ? '━' : '○'} {region.stitch.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {(region.stitchConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1.5">
                  <div className="text-[10px] text-slate-500">
                    Curv: <span className="text-slate-300">{region.metrics?.curvature ?? 'N/A'}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Área: <span className="text-slate-300">{region.metrics?.area?.toLocaleString() ?? 'N/A'}px²</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Comp: <span className="text-slate-300">{region.metrics?.compactness ?? 'N/A'}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-600 mt-1 italic">
                  {region.reason}
                </div>
                {region.stitchParams && (
                  <div className="text-[10px] text-slate-600 mt-1 pt-1 border-t border-[#2a2d3a]">
                    Densidad: {region.stitchParams.density} · Longitud: {region.stitchParams.stitchLength}mm
                    {region.stitchParams.angle !== undefined && ` · Ángulo: ${region.stitchParams.angle}°`}
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <div className="bg-[#161a23] border border-[#2a2d3a] rounded-lg p-4 text-center">
            <p className="text-slate-500 text-xs mb-2">No hay regiones analizadas aún</p>
            <button
              onClick={analyze}
              className="text-[11px] px-3 py-1.5 rounded bg-violet-600/30 text-violet-300 border border-violet-500/30 hover:bg-violet-600/50 transition-colors"
            >
              <Brain className="w-3 h-3 inline mr-1" />
              Analizar imagen con IA
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

export default function ConfigPanel({ config, onChange, regions, selectedRegionIds, onRegionsUpdate }) {
  const cfg = config || {};
  const set = (key, val) => onChange({ ...cfg, [key]: val });

  const handleModeChange = useCallback((modeId) => {
    set('mode', modeId);
  }, [set]);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0d0f14]">

      {/* GENERAL */}
      <Section title="Configuración General" icon={Settings}>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 block">Tipo de tela</label>
            <select
              value={cfg.fabric_type || 'Algodón'}
              onChange={e => set('fabric_type', e.target.value)}
              className="w-full bg-[#161a23] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
            >
              {FABRIC_TYPES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 block">Ancho (mm)</label>
              <input
                type="number" min="10" max="500"
                value={cfg.width_mm || 100}
                onChange={e => set('width_mm', Number(e.target.value))}
                className="w-full bg-[#161a23] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 block">Alto (mm)</label>
              <input
                type="number" min="10" max="500"
                value={cfg.height_mm || 100}
                onChange={e => set('height_mm', Number(e.target.value))}
                className="w-full bg-[#161a23] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-slate-500 uppercase tracking-wider">Optimizador de colores</label>
              <span className="text-xs font-bold text-violet-400">{cfg.color_count || 6}</span>
            </div>
            <input
              type="range" min="2" max="12" step="1"
              value={cfg.color_count || 6}
              onChange={e => set('color_count', Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>2</span><span>12</span>
            </div>
          </div>
        </div>
      </Section>

      {/* MODOS */}
      <Section title="Modo de Digitalización" icon={Zap}>
        <div className="space-y-2">
          {MODES.map(mode => {
            const active = (cfg.mode || 'hybrid') === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  active
                    ? 'border-violet-500/60 bg-violet-900/20 text-white'
                    : 'border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:border-[#3a3d4a] hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{mode.name}</span>
                  {mode.badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300 border border-violet-500/30">{mode.badge}</span>}
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{mode.desc}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* TATAMI FILL */}
      <Section title="Relleno Tatami" icon={Cpu}>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Densidad</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'low',   label: 'Baja',  sub: '0.6mm · rápido',         value: 0.6 },
                { id: 'mid',   label: 'Media', sub: '0.4mm · balance',         value: 0.4, badge: 'Rec.' },
                { id: 'high',  label: 'Alta',  sub: '0.3mm · detalle',         value: 0.3 },
                { id: 'ultra', label: 'Ultra', sub: '0.25mm · <50mm',          value: 0.25 },
              ].map(opt => {
                const active = (cfg.tatami_density || 0.4) === opt.value;
                return (
                  <button
                    key={opt.id}
                    onClick={() => set('tatami_density', opt.value)}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-all ${
                      active
                        ? 'border-violet-500/60 bg-violet-900/20 text-white'
                        : 'border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:border-[#3a3d4a] hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold">{opt.label}</span>
                      {opt.badge && <span className="text-[9px] px-1 rounded bg-violet-600/30 text-violet-300 border border-violet-500/30">{opt.badge}</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{opt.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Ángulo de relleno</label>
            <div className="flex gap-1 flex-wrap">
              {[
                { label: 'Auto', value: null },
                { label: '0°',   value: 0 },
                { label: '45°',  value: 45 },
                { label: '90°',  value: 90 },
                { label: '135°', value: 135 },
              ].map(opt => {
                const current = cfg.fill_angle === undefined ? null : cfg.fill_angle;
                const active = current === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    onClick={() => set('fill_angle', opt.value)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                      active
                        ? 'border-cyan-500/60 bg-cyan-900/20 text-cyan-300'
                        : 'border-[#2a2d3a] bg-[#161a23] text-slate-400 hover:text-slate-300 hover:border-[#3a3d4a]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* MOTOR IA */}
      <Section title="Motor IA" icon={Cpu}>
        <div className="space-y-1">
          <Toggle label="Fondos completos (Claude Sonnet)" value={cfg.use_full_bg || false} onChange={v => set('use_full_bg', v)} />
          <Toggle label="IA Vision (análisis visual)" value={cfg.use_ia_vision || false} onChange={v => set('use_ia_vision', v)} />
        </div>
      </Section>

      {/* AI SEGMENTATION - COMPONENTE SEPARADO, SOLO UNA VEZ */}
      {cfg.mode === 'ai-segmentation' && <AISegmentationSection />}

      {/* AVANZADAS */}
      <Section title="Opciones Avanzadas" icon={Settings} defaultOpen={false}>
        <div className="space-y-1">
          <Toggle label="Remover fondo (auto-limpieza)" value={cfg.remove_bg || false} onChange={v => set('remove_bg', v)} />
          <Toggle label="Secuenciación AI-aware" value={cfg.ai_sequence || false} onChange={v => set('ai_sequence', v)} />
          <div className="py-1.5">
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 block">Compensación de tensión</label>
            <input
              type="number" min="0" max="2" step="0.1"
              value={cfg.tension_comp || 0.5}
              onChange={e => set('tension_comp', Number(e.target.value))}
              className="w-full bg-[#161a23] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      </Section>

      {/* PRESETS */}
      <Section title="Presets de workflow" icon={BookMarked} defaultOpen={false}>
        <WorkflowPresetPanel
          regions={regions || []}
          selectedRegionIds={selectedRegionIds || []}
          onRegionsUpdate={onRegionsUpdate}
        />
      </Section>
    </div>
  );
}
