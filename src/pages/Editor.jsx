import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Download, Zap, ChevronRight, ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StepPipeline from '@/components/editor/StepPipeline';
import AIProgressIndicator from '@/components/editor/AIProgressIndicator';
import StitchCanvas from '@/components/editor/StitchCanvas';
import ConfigPanel from '@/components/editor/ConfigPanel';
import RegionsPanel from '@/components/editor/RegionsPanel';
import SubpixelMetricsPanel from '@/components/editor/SubpixelMetricsPanel.jsx';
import StitchPlannerPanel from '@/components/editor/StitchPlannerPanel.jsx';
import TravelOptimizerPanel from '@/components/editor/TravelOptimizerPanel.jsx';
import PhysicsSimulator from '@/components/editor/PhysicsSimulator.jsx';
import ExportModal from '@/components/editor/ExportModal';
import PreprocessingPanel, { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import MaskToolbar from '@/components/editor/MaskToolbar';
import MaskCanvas from '@/components/editor/MaskCanvas';
import { preprocessImage } from '@/lib/imagePreprocessor';
import { analyzeImage } from '@/lib/imageAnalyzer';
import { traceImageContours } from '@/lib/contourTracer';
import { enrichAllRegions } from '@/lib/regionBuilder.js';
import { getModeStrategy } from '@/lib/digitizeModes.js';

// ═══ Decision Engine — SIEMPRE ACTIVADO ═══
import { useDecisionEngine } from '@/hooks/useDecisionEngine.js';
import { DecisionPanel } from '@/components/DecisionPanel.jsx';
const AI_ENABLED = true; // Cambiar a false para desactivar
// ═══════════════════════════════════════════

const DEFAULT_CONFIG = {
  fabric_type: 'Algodón', width_mm: 100, height_mm: 100, color_count: 6,
  mode: 'hybrid', remove_bg: false, tension_comp: 0.5,
  fill_angle: null, tatami_density: 0.4, vector_engine: 'hybrid',
};

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [regions, setRegions] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [step, setStep] = useState(1);
  const [imageUrl, setImageUrl] = useState(null);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [imageOpacity, setImageOpacity] = useState(50);
  const [stitchOpacity, setStitchOpacity] = useState(100);
  const [showFill, setShowFill] = useState(true);
  const [showContour, setShowContour] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [preprocessSettings, setPreprocessSettings] = useState(DEFAULT_PREPROCESS);
  const [preprocessedUrl, setPreprocessedUrl] = useState(null);
  const timerRef = useRef(null);

  const maskCanvasRef = useRef(null);
  const [maskTool, setMaskTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(20);
  const [brushMode, setBrushMode] = useState('erase');
  const [wandTolerance, setWandTolerance] = useState(15);
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [maskedPixelCount, setMaskedPixelCount] = useState(0);
  const [applyingMask, setApplyingMask] = useState(false);

  // ═══ Decision Engine hook ═══
  const {
    status: aiStatus,
    result: aiResult,
    error: aiError,
    progress: aiProgress,
    isLoading: aiLoading,
    analyze,
    reset: resetAI
  } = useDecisionEngine();
  const [showDecisionPanel, setShowDecisionPanel] = useState(false);
  // ═════════════════════════════

  useEffect(() => {if (id) loadProject();}, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.Project.get(id);
      setProject(p);
      setConfig(p.config || DEFAULT_CONFIG);
      setRegions(p.regions || []);
      setImageUrl(p.image_url || null);
      setStep(p.step || 1);
    } catch (e) {navigate('/');} finally
    {setLoading(false);}
  };

  const saveProject = async (overrides = {}) => {
    if (!project) return;
    setSaving(true);
    try {
      const updated = await base44.entities.Project.update(project.id, {
        config, regions, image_url: imageUrl, step,
        total_stitches: regions.reduce((s, r) => s + (r.stitch_count || 0), 0),
        color_count: new Set(regions.map((r) => r.color)).size,
        ...overrides
      });
      setProject(updated);
    } finally {setSaving(false);}
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      setStep(2);
      await base44.entities.Project.update(id, { image_url: file_url, step: 2, status: 'draft' });

      if (AI_ENABLED) {
        setShowDecisionPanel(true);
        await analyze(file);
      }
    } finally {setUploadingImage(false);}
  };

  const startProcessing = async (aiStrategy) => {
    if (!imageUrl) return;
    setProcessing(true);
    setProcessingElapsed(0);
    timerRef.current = setInterval(() => setProcessingElapsed((s) => s + 1), 1000);
    setStep(2);

    // Resolve the active strategy: AI decision > selected mode > hybrid fallback
    const modeStrategy = getModeStrategy(config.mode || 'hybrid');
    const useAIStrategy = AI_ENABLED && aiStrategy;

    try {
      // --- PREPROCESSING: use mode's preset unless user has customized manually ---
      let finalImageUrl = imageUrl;
      const prepSettings = modeStrategy.preprocess;
      try {
        const processed = await preprocessImage(imageUrl, prepSettings);
        const { file_url } = await base44.integrations.Core.UploadFile({ file: processed.blob });
        finalImageUrl = file_url;
        setPreprocessedUrl(file_url);
      } catch (prepErr) { console.warn('Preprocessing failed:', prepErr); }

      // --- CLIENT-SIDE ANALYSIS: use mode's vectorizer params ---
      const colorCount = useAIStrategy
        ? aiStrategy.recommendedParams.maxColors
        : modeStrategy.vectorizer.color_count;

      let imageAnalysis = null, tracedContours = null;
      // Fast mode skips slow client analysis
      if (modeStrategy.id !== 'fast') {
        try {
          const [analysis, contours] = await Promise.all([
            analyzeImage(finalImageUrl, colorCount, modeStrategy.preprocess.outputSize || 512),
            traceImageContours(finalImageUrl, colorCount, modeStrategy.vectorizer.rdpEpsilon || 0.003),
          ]);
          imageAnalysis = analysis;
          tracedContours = contours;
        } catch (e) { console.warn('Client analysis failed:', e); }
      }

      // --- BACKEND: pass full mode strategy ---
      const backendParams = modeStrategy.backend;
      const res = await base44.functions.invoke('hybridDigitize', {
        image_url: finalImageUrl,
        mode: backendParams.mode,
        width_mm: config.width_mm,
        height_mm: config.height_mm,
        color_count: colorCount,
        remove_bg: config.remove_bg,
        use_ia_vision: useAIStrategy ? true : backendParams.use_ia_vision,
        use_full_bg: backendParams.use_full_bg,
        image_analysis: imageAnalysis,
        traced_contours: tracedContours,
        vector_engine: backendParams.vector_engine,
        tatami_density: useAIStrategy
          ? (aiStrategy.stitchType === 'satin' ? 0.6 : aiStrategy.stitchType === 'running' ? 0.2 : 0.4)
          : backendParams.tatami_density,
        fill_angle: config.fill_angle !== undefined ? config.fill_angle : null,
        max_regions: backendParams.max_regions,
        stitch_strategy: modeStrategy.stitchStrategy,
      });

      if (res.data?.success) {
        const rawData = res.data.data?.response || res.data.data;
        const { regions: rawRegions } = rawData;

        const filtered = (rawRegions || []).filter((r) => {
          // Umbral mínimo muy bajo para preservar detalles pequeños (ojos, nariz)
          if ((r.area_mm2 || 0) <= 0.3) return false;
          if (r.perimeter_mm !== undefined && r.perimeter_mm <= 0.5) return false;
          if (r.isEdgeRegion === true) return false;
          if (!r.path_points || r.path_points.length < 3) return false;
          return true;
        });

        const classifyStitchType = (region) => {
          const hex = (region.color || '').toLowerCase();
          const isDark = hex === '#000000' || hex === '#1a1a1a';
          const isContourName = (region.name || '').toLowerCase().includes('contour_');
          if (isDark || isContourName || region.isContour) return 'running_stitch';
          const area = region.area_mm2 || 0,perim = region.perimeter_mm || 1;
          const avgWidth = area / perim,compactness = perim * perim / Math.max(area, 1);
          if (area > 200 && avgWidth > 5.0) return 'fill';else
          if (area < 50 || avgWidth < 3.0 || compactness > 15) return 'satin';else
          return 'fill';
        };

        const calculateStitchCount = (region) => {
          const type = region.stitch_type,area = region.area_mm2 || 0,perim = region.perimeter_mm || 1,density = region.density || 0.7;
          if (type === 'fill') return Math.round(area * density * 2.5);else
          if (type === 'satin') {const width = Math.max(1, area / perim);return Math.round(perim / 2.5 * (width / Math.max(0.4, density)));} else
          return Math.round(perim / 1.5);
        };

        const COLOR_NAMES = { '#000000': 'negro', '#1a1a1a': 'negro', '#ffffff': 'blanco', '#ffff00': 'amarillo', '#ff0000': 'rojo', '#00ff00': 'verde', '#0000ff': 'azul', '#ff69b4': 'rosa', '#ffa500': 'naranja', '#800080': 'morado', '#ffc0cb': 'rosa', '#ee82ee': 'violeta' };
        const getColorName = (hex) => {if (!hex) return 'color';const h = hex.toLowerCase();if (COLOR_NAMES[h]) return COLOR_NAMES[h];const matches = Object.entries(COLOR_NAMES).map(([k, v]) => ({ name: v, dist: Math.sqrt(Math.pow(parseInt(k.slice(1, 3), 16) - parseInt(h.slice(1, 3), 16), 2) + Math.pow(parseInt(k.slice(3, 5), 16) - parseInt(h.slice(3, 5), 16), 2) + Math.pow(parseInt(k.slice(5, 7), 16) - parseInt(h.slice(5, 7), 16), 2)) })).sort((a, b) => a.dist - b.dist);return matches[0]?.name || 'color';};
        const getPosition = (region) => {const [cx, cy] = region.centroid || [0.5, 0.5];const v = cy < 0.33 ? 'sup' : cy > 0.66 ? 'inf' : 'cen';const h = cx < 0.33 ? 'izq' : cx > 0.66 ? 'der' : '';return h ? `${v}_${h}` : v;};
        const getStitchAbbr = (type) => type === 'fill' ? 'fill' : type === 'satin' ? 'sat' : 'run';

        const newRegions = filtered.map((r) => {
          const type = classifyStitchType(r);
          return { ...r, name: r.name || `${getPosition(r)}_${getColorName(r.color)}_${getStitchAbbr(type)}`, stitch_type: type, stitch_count: calculateStitchCount({ ...r, stitch_type: type }) };
        });

        // Enriquecer regiones con todos los campos avanzados del RegionBuilder
        const enrichedRegions = enrichAllRegions(newRegions, config.width_mm || 100, config.height_mm || 100);
        const totalCalculatedStitches = enrichedRegions.reduce((sum, r) => sum + (r.stitch_count || 0), 0);
        setRegions(enrichedRegions);setStep(3);
        setShowDecisionPanel(false);

        await base44.entities.Project.update(id, { regions: enrichedRegions, step: 3, status: 'ready', total_stitches: totalCalculatedStitches, color_count: new Set(newRegions.map((r) => r.color)).size });
        await base44.entities.VersionHistory.create({ project_id: id, label: `Vectorización ${useAIStrategy ? 'IA' : config.mode}`, description: `${newRegions.length || 0} regiones generadas${useAIStrategy ? ' (optimizado por IA)' : ''}`, snapshot: { regions: enrichedRegions, config }, step: 3 });
      }
    } catch (e) {console.error(e);} finally
    {setProcessing(false);clearInterval(timerRef.current);}
  };

  const handleApplyMask = async () => {
    if (!maskCanvasRef.current) return;
    setApplyingMask(true);
    try {
      const blob = await maskCanvasRef.current.getMaskedImageBlob();
      if (!blob) return;
      const file = new File([blob], 'masked.png', { type: 'image/png' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      await base44.entities.Project.update(id, { image_url: file_url });
      maskCanvasRef.current.clearMask();setMaskedPixelCount(0);setActiveTab('editor');
    } finally {setApplyingMask(false);}
  };

  const handleRegionClick = (regionId) => setSelectedRegionId(regionId);
  const handleRegionsUpdate = (updated) => setRegions(updated);
  const handleRename = async (name) => {if (!project || !name.trim()) return;const updated = await base44.entities.Project.update(id, { name: name.trim() });setProject(updated);};

  const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const colorsUsed = new Set(regions.map((r) => r.color)).size;

  if (loading) return <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="h-screen bg-[#0d0f14] flex flex-col overflow-hidden text-white">
      <div className="flex-shrink-0 border-b border-[#1e2130] bg-[#0d0f14]">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link to="/" className="p-1.5 rounded-lg hover:bg-[#1e2130] text-slate-500 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="w-px h-4 bg-[#2a2d3a]" />
          <ProjectNameInput name={project?.name || 'Sin título'} onSave={handleRename} />
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs text-slate-400">{config.mode || 'hybrid'}</span>
          <div className="flex-1 flex justify-center"><StepPipeline currentStep={step} /></div>
          <AIProgressIndicator active={processing} elapsed={processingElapsed} />
          <div className="flex items-center gap-1.5">
            <NavButton onClick={() => setShowExport(true)} icon={Download} label="Exportar" accent />
            <NavButton onClick={() => startProcessing()} icon={Zap} label="Procesar" disabled={!imageUrl || processing} />
            <NavButton onClick={() => saveProject()} icon={Save} label={saving ? '...' : 'Guardar'} />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[#1a1d27]">
          <div className="flex items-center gap-1">
            {[
              { id: 'editor',  label: 'Editor' },
              { id: 'sim',     label: '◉ Simulación' },
              { id: 'mask',    label: '✂ Máscara' },
              { id: 'planner', label: '✦ Planner' },
              { id: 'travel',  label: '⚡ Travel' },
              { id: 'panel',   label: 'Panel' },
            ].map(({ id, label }) =>
              <button key={id} onClick={() => setActiveTab(id)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === id ? 'text-violet-300 bg-violet-900/20 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                {label}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-600">Puntadas <span className="text-violet-400 font-bold">{totalStitches.toLocaleString()}</span></span>
            <span className="text-slate-600">Colores <span className="text-cyan-400 font-bold">{colorsUsed}</span></span>
            <span className="text-slate-600">Tamaño <span className="text-emerald-400 font-bold">{config.width_mm}×{config.height_mm}mm</span></span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto">
          <ConfigPanel config={config} onChange={setConfig} regions={regions} selectedRegionIds={selectedRegionId ? [selectedRegionId] : []} onRegionsUpdate={handleRegionsUpdate} />
          <PreprocessingPanel settings={preprocessSettings} onChange={setPreprocessSettings} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab !== 'mask' && activeTab !== 'planner' && activeTab !== 'sim' && activeTab !== 'travel' && <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1a1d27] bg-[#0a0c12]">
            <SliderControl label="Imagen" value={imageOpacity} onChange={setImageOpacity} color="text-amber-400" />
            <SliderControl label="Puntadas" value={stitchOpacity} onChange={setStitchOpacity} color="text-violet-400" />
            <div className="flex items-center gap-2 ml-auto">
              <FilterToggle label="Rellenos" active={showFill} onChange={setShowFill} color="violet" />
              <FilterToggle label="Contornos" active={showContour} onChange={setShowContour} color="cyan" />
            </div>
          </div>}

          {activeTab === 'sim' ? (
            <div className="flex-1 overflow-hidden">
              <PhysicsSimulator
                imageUrl={imageUrl}
                regions={regions}
                config={config}
              />
            </div>
          ) : activeTab === 'planner' ? (
            <div className="flex-1 overflow-hidden">
              <StitchPlannerPanel
                regions={regions}
                config={config}
                onApplyPlan={(updates) => {
                  const idMap = new Map(updates.map(u => [u.id, u]));
                  setRegions(prev => prev.map(r => {
                    const upd = idMap.get(r.id);
                    if (!upd) return r;
                    return { ...r, stitch_type: upd.stitch_type, angle: upd.angle, underlay: upd.underlay };
                  }));
                }}
              />
            </div>
          ) : activeTab === 'travel' ? (
            <div className="flex-1 overflow-hidden">
              <TravelOptimizerPanel
                regions={regions}
                onApplyOrder={(ordered) => setRegions(ordered)}
              />
            </div>
          ) : !imageUrl ?
          <UploadZone onUpload={handleImageUpload} fileInputRef={fileInputRef} uploading={uploadingImage} /> :
          showDecisionPanel && AI_ENABLED ?
          <div className="flex-1 flex items-center justify-center overflow-auto">
              <div className="w-full max-w-md mx-4">
                <div className="bg-[#0d0f14] border border-[#1e2130] p-5 shadow-2xl rounded mx-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">🧠 Análisis de IA</h3>
                    <button onClick={() => {setShowDecisionPanel(false);resetAI();}} className="p-1 rounded hover:bg-[#1a1d27] text-slate-500 hover:text-white transition-colors">✕</button>
                  </div>
                  <DecisionPanel
                  result={aiResult}
                  status={aiStatus}
                  progress={aiProgress}
                  error={aiError}
                  isLoading={aiLoading}
                  onProceed={() => {if (aiResult) startProcessing(aiResult.strategy);}}
                  onAdjustParams={() => {setShowDecisionPanel(false);setActiveTab('panel');}}
                  onCancel={() => {setShowDecisionPanel(false);resetAI();}} />
                
                </div>
              </div>
            </div> :
          activeTab === 'mask' ?
          <div className="flex-1 flex flex-col overflow-hidden">
              <MaskToolbar activeTool={maskTool} onToolChange={setMaskTool} brushSize={brushSize} onBrushSizeChange={setBrushSize} brushMode={brushMode} onBrushModeChange={setBrushMode} wandTolerance={wandTolerance} onWandToleranceChange={setWandTolerance} showMaskOverlay={showMaskOverlay} onToggleMaskOverlay={() => setShowMaskOverlay((v) => !v)} showOriginal={showOriginal} onToggleOriginal={() => setShowOriginal((v) => !v)} onInvertMask={() => maskCanvasRef.current?.invertMask()} onClearMask={() => {maskCanvasRef.current?.clearMask();setMaskedPixelCount(0);}} onApplyMask={handleApplyMask} maskedPixelCount={maskedPixelCount} />
              <div className="flex-1 overflow-hidden relative">
                {applyingMask && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-slate-300">Aplicando máscara...</span></div></div>}
                <MaskCanvas ref={maskCanvasRef} imageUrl={imageUrl} activeTool={maskTool} brushSize={brushSize} brushMode={brushMode} wandTolerance={wandTolerance} showMaskOverlay={showMaskOverlay} showOriginal={showOriginal} onMaskChange={setMaskedPixelCount} />
              </div>
            </div> :

          <div className="flex-1 overflow-hidden">
              <StitchCanvas imageUrl={imageUrl} regions={regions} selectedRegionId={selectedRegionId} onRegionClick={handleRegionClick} imageOpacity={imageOpacity} stitchOpacity={stitchOpacity} showFill={showFill} showContour={showContour} />
            </div>
          }

          {imageUrl && regions.length === 0 && !processing && !showDecisionPanel &&
          <div className="border-t border-[#1a1d27] p-3 flex items-center gap-3 bg-[#0a0c12]">
              <div className="flex-1 text-xs text-slate-500">Imagen cargada. La IA analizará el mejor enfoque.</div>
              <button onClick={() => AI_ENABLED ? setShowDecisionPanel(true) : startProcessing()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors">
                <Zap className="w-3.5 h-3.5" /> Analizar con IA
              </button>
            </div>
          }
        </div>

        <div className="w-64 flex-shrink-0 border-l border-[#1e2130] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden min-h-0">
            <RegionsPanel regions={regions} selectedId={selectedRegionId} onSelect={setSelectedRegionId} onUpdate={handleRegionsUpdate} />
          </div>
          {selectedRegionId && regions.find(r => r.id === selectedRegionId)?.stitch_type === 'fill' && (
            <div className="border-t border-[#1e2130] overflow-y-auto max-h-[45%] bg-[#0a0c12]">
              <div className="px-3 py-2 border-b border-[#1a1d27] flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Métricas sub-pixel</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/30 border border-violet-500/30 text-violet-400">β</span>
              </div>
              <div className="p-3">
                <SubpixelMetricsPanel
                  region={regions.find(r => r.id === selectedRegionId)}
                  widthMm={config.width_mm}
                  heightMm={config.height_mm}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {showExport && <ExportModal project={project} regions={regions} onClose={() => setShowExport(false)} />}
    </div>);

}

function ProjectNameInput({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  useEffect(() => setVal(name), [name]);
  if (editing) return <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => {onSave(val);setEditing(false);}} onKeyDown={(e) => {if (e.key === 'Enter') {onSave(val);setEditing(false);}if (e.key === 'Escape') setEditing(false);}} className="bg-[#1e2130] border border-violet-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none w-40" />;
  return <button onClick={() => setEditing(true)} className="text-sm font-semibold text-slate-200 hover:text-white truncate max-w-[160px]">{name}</button>;
}

function NavButton({ onClick, icon: Icon, label, accent, disabled }) {
  return <button onClick={onClick} disabled={disabled} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accent ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white hover:bg-[#1e2130]'}`}><Icon className="w-3.5 h-3.5" /> {label}</button>;
}

function SliderControl({ label, value, onChange, color }) {
  return <div className="flex items-center gap-2"><span className="text-[11px] text-slate-500">{label}</span><input type="range" min="0" max="100" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-violet-600" /><span className={`text-[11px] font-bold w-8 text-right ${color}`}>{value}%</span></div>;
}

function FilterToggle({ label, active, onChange, color }) {
  const accent = color === 'violet' ? 'border-violet-500/50 bg-violet-900/20 text-violet-300' : 'border-cyan-500/50 bg-cyan-900/20 text-cyan-300';
  return <button onClick={() => onChange(!active)} className={`text-[10px] px-2 py-1 rounded border transition-colors font-medium ${active ? accent : 'border-[#2a2d3a] text-slate-600 hover:text-slate-400'}`}>{label}</button>;
}

function UploadZone({ onUpload, fileInputRef, uploading }) {
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e) => {e.preventDefault();setDragOver(false);const file = e.dataTransfer.files?.[0];if (file) onUpload({ target: { files: [file] } });};
  return (
    <div className={`flex-1 flex items-center justify-center border-2 border-dashed transition-colors m-6 rounded-2xl cursor-pointer ${dragOver ? 'border-violet-500 bg-violet-900/10' : 'border-[#2a2d3a] hover:border-violet-500/50'}`} onDragOver={(e) => {e.preventDefault();setDragOver(true);}} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml" className="hidden" onChange={onUpload} />
      <div className="text-center">
        {uploading ? <div className="w-10 h-10 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" /> : <div className="text-5xl mb-3">🧵</div>}
        <h3 className="text-base font-semibold text-white mb-1">{uploading ? 'Subiendo imagen...' : 'Sube tu imagen'}</h3>
        <p className="text-sm text-slate-500">PNG, JPG o SVG • Arrastra o haz click</p>
        {!uploading && <div className="mt-4 px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs inline-block">Seleccionar archivo</div>}
      </div>
    </div>);

}