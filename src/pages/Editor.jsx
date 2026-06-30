import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Download, Zap, ChevronRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StepPipeline from '@/components/editor/StepPipeline';
import AIProgressIndicator from '@/components/editor/AIProgressIndicator';
import StitchCanvas from '@/components/editor/StitchCanvas';
import ConfigPanel from '@/components/editor/ConfigPanel';
import RegionsPanel from '@/components/editor/RegionsPanel';
import SubpixelMetricsPanel from '@/components/editor/SubpixelMetricsPanel.jsx';
import QualityAnalysisPanel from '@/components/editor/QualityAnalysisPanel.jsx';
import StitchPlannerPanel from '@/components/editor/StitchPlannerPanel.jsx';
import IntelligencePanel from '@/components/editor/IntelligencePanel.jsx';
import TravelOptimizerPanel from '@/components/editor/TravelOptimizerPanel.jsx';
import EmbroideryPreview from '@/components/editor/EmbroideryPreview.jsx';
import ExportModal from '@/components/editor/ExportModal';
import PreprocessingPanel, { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import MaskToolbar from '@/components/editor/MaskToolbar';
import MaskCanvas from '@/components/editor/MaskCanvas';
import NeedlePathPanel from '@/components/editor/NeedlePathPanel';
import { runPipeline } from '@/lib/pipeline/runner';
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
  const [savedToast, setSavedToast] = useState(false);
  const [preprocessSettings, setPreprocessSettings] = useState(DEFAULT_PREPROCESS);
  const [preprocessedUrl, setPreprocessedUrl] = useState(null);
  const [pathMetrics, setPathMetrics] = useState(null);
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

  useEffect(() => {if (id) loadProject();}, [id]); // loadProject reads `id` from closure — safe to omit from deps

  // Cleanup: clear processing timer on unmount to prevent memory leak / stale setState
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);



  const loadProject = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.Project.get(id);
      setProject(p);
      setConfig(p.config || DEFAULT_CONFIG);
      setRegions(p.regions || []);
      setImageUrl(p.image_url || null);
      setStep(p.step || 1);
    } catch (e) {navigate('/');}
    finally {setLoading(false);}
  };

  // saveProject uses a ref snapshot to avoid stale closures without nesting setState calls.
  const regionsRef  = useRef(regions);
  const configRef   = useRef(config);
  const stepRef     = useRef(step);
  const imageUrlRef = useRef(imageUrl);
  useEffect(() => { regionsRef.current  = regions;  }, [regions]);
  useEffect(() => { configRef.current   = config;   }, [config]);
  useEffect(() => { stepRef.current     = step;     }, [step]);
  useEffect(() => { imageUrlRef.current = imageUrl; }, [imageUrl]);

  const saveProject = useCallback(async (overrides = {}) => {
    if (!project) return;
    setSaving(true);
    try {
      const currentRegions = regionsRef.current;
      const payload = {
        config:        configRef.current,
        regions:       currentRegions,
        image_url:     imageUrlRef.current,
        step:          stepRef.current,
        total_stitches: currentRegions.reduce((s, r) => s + (r.stitch_count || 0), 0),
        color_count:   new Set(currentRegions.map((r) => r.color)).size,
        ...overrides,
      };
      const updated = await base44.entities.Project.update(project.id, payload);
      setProject(updated);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally { setSaving(false); }
  }, [project]);

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
    } catch (err) {
      console.error('[handleImageUpload]', err);
    } finally {setUploadingImage(false);}
  };

  const startProcessing = async (aiStrategy) => {
    if (!imageUrl) return;
    setProcessing(true);
    setProcessingElapsed(0);
    timerRef.current = setInterval(() => setProcessingElapsed((s) => s + 1), 1000);
    setStep(2);

    try {
      const ctx = await runPipeline(imageUrl, config, {
        initialCtx: aiStrategy ? { aiStrategy } : {},
      });

      const enrichedRegions = ctx.regions || [];
      if (enrichedRegions.length === 0) throw new Error('No regions generated');

      const totalCalculatedStitches = enrichedRegions.reduce((s, r) => s + (r.stitch_count || 0), 0);

      if (ctx.enhanced?.enhancedUrl) setPreprocessedUrl(ctx.enhanced.enhancedUrl);

      setRegions(enrichedRegions);
      setPathMetrics(ctx.pathMetrics || null);
      setStep(3);
      setShowDecisionPanel(false);

      const label = aiStrategy ? 'Vectorización IA' : `Vectorización ${config.mode}`;
      const desc  = `${enrichedRegions.length} regiones generadas${aiStrategy ? ' (optimizado por IA)' : ''}`;

      await Promise.all([
        base44.entities.Project.update(id, {
          regions: enrichedRegions, step: 3, status: 'ready',
          total_stitches: totalCalculatedStitches,
          color_count: new Set(enrichedRegions.map((r) => r.color)).size,
        }),
        base44.entities.VersionHistory.create({
          project_id: id, label, description: desc,
          snapshot: { regions: enrichedRegions, config }, step: 3,
        }),
      ]);
    } catch (e) {
      console.error('[startProcessing]', e);
    } finally {
      setProcessing(false);
      clearInterval(timerRef.current);
    }
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

  const handleRegionClick = useCallback((regionId) => setSelectedRegionId(regionId), []);
  // Stable callback — regions update from child panels (RegionsPanel, TravelOptimizer, etc.)
  const handleRegionsUpdate = useCallback((updated) => setRegions(updated), []);
  const handleRename = useCallback(async (name) => {
    if (!id || !name.trim()) return;
    const updated = await base44.entities.Project.update(id, { name: name.trim() });
    setProject(updated);
  }, [id]);

  const totalStitches = useMemo(() => regions.reduce((s, r) => s + (r.stitch_count || 0), 0), [regions]);
  const colorsUsed = useMemo(() => new Set(regions.map((r) => r.color)).size, [regions]);

  // Keyboard shortcuts — defined after saveProject to avoid TDZ error
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
      if (e.key === 'Escape') {
        if (showExport) setShowExport(false);
        else if (selectedRegionId) setSelectedRegionId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveProject, showExport, selectedRegionId]);

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
          <div className="flex-1 flex justify-center"><StepPipeline currentStep={step} onStepClick={setStep} /></div>
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
              { id: 'preview', label: '✓ Vista Previa' },
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
        <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto space-y-4 p-4">
          <ConfigPanel config={config} onChange={setConfig} regions={regions} selectedRegionIds={selectedRegionId ? [selectedRegionId] : []} onRegionsUpdate={handleRegionsUpdate} />
          <QualityAnalysisPanel projectId={project?.id} onAnalysisComplete={(analysis) => console.log('Quality:', analysis)} />
          <PreprocessingPanel settings={preprocessSettings} onChange={setPreprocessSettings} />
          <NeedlePathPanel regions={regions} pathMetrics={pathMetrics} config={config} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab !== 'mask' && activeTab !== 'planner' && activeTab !== 'preview' && activeTab !== 'travel' && <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1a1d27] bg-[#0a0c12]">
            <SliderControl label="Imagen" value={imageOpacity} onChange={setImageOpacity} color="text-amber-400" />
            <SliderControl label="Puntadas" value={stitchOpacity} onChange={setStitchOpacity} color="text-violet-400" />
            <div className="flex items-center gap-2 ml-auto">
              <FilterToggle label="Rellenos" active={showFill} onChange={setShowFill} color="violet" />
              <FilterToggle label="Contornos" active={showContour} onChange={setShowContour} color="cyan" />
            </div>
          </div>}

          {activeTab === 'preview' ? (
            <div className="flex-1 overflow-hidden">
              <EmbroideryPreview
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
          activeTab === 'mask' ?
          <div className="flex-1 flex flex-col overflow-hidden">
              <MaskToolbar activeTool={maskTool} onToolChange={setMaskTool} brushSize={brushSize} onBrushSizeChange={setBrushSize} brushMode={brushMode} onBrushModeChange={setBrushMode} wandTolerance={wandTolerance} onWandToleranceChange={setWandTolerance} showMaskOverlay={showMaskOverlay} onToggleMaskOverlay={() => setShowMaskOverlay((v) => !v)} showOriginal={showOriginal} onToggleOriginal={() => setShowOriginal((v) => !v)} onInvertMask={() => maskCanvasRef.current?.invertMask()} onClearMask={() => {maskCanvasRef.current?.clearMask();setMaskedPixelCount(0);}} onApplyMask={handleApplyMask} maskedPixelCount={maskedPixelCount} />
              <div className="flex-1 overflow-hidden relative">
                {applyingMask && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-slate-300">Aplicando máscara...</span></div></div>}
                <MaskCanvas ref={maskCanvasRef} imageUrl={imageUrl} activeTool={maskTool} brushSize={brushSize} brushMode={brushMode} wandTolerance={wandTolerance} showMaskOverlay={showMaskOverlay} showOriginal={showOriginal} onMaskChange={setMaskedPixelCount} />
              </div>
            </div> :

          showDecisionPanel && AI_ENABLED ?
          <div className="flex-1 flex items-center justify-center overflow-auto">
            <div className="w-full max-w-md mx-4">
              <div className="bg-[#0d0f14] border border-[#1e2130] p-5 shadow-2xl rounded mx-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white">🧠 Análisis de IA</h3>
                  <button onClick={() => {setShowDecisionPanel(false);resetAI();}} className="p-1 rounded hover:bg-[#1a1d27] text-slate-500 hover:text-white transition-colors">✕</button>
                </div>
                <DecisionPanel
                  result={aiResult} status={aiStatus} progress={aiProgress}
                  error={aiError} isLoading={aiLoading}
                  onProceed={() => {if (aiResult) startProcessing(aiResult.strategy);}}
                  onAdjustParams={() => {setShowDecisionPanel(false);setActiveTab('panel');}}
                  onCancel={() => {setShowDecisionPanel(false);resetAI();}}
                />
              </div>
            </div>
          </div> :
          <div className="flex-1 overflow-hidden">
              <StitchCanvas imageUrl={imageUrl} regions={regions} selectedRegionId={selectedRegionId} onRegionClick={handleRegionClick} imageOpacity={imageOpacity} stitchOpacity={stitchOpacity} showFill={showFill} showContour={showContour} />
            </div>
          }

          {imageUrl && regions.length > 0 && pathMetrics?.metrics && !processing &&
          <div className="border-t border-[#1a1d27] p-2.5 flex items-center gap-4 bg-[#0a0c12] text-[11px]">
             <div className="flex-1 text-slate-400">
               Recorrido: <span className="text-cyan-400 font-bold">{pathMetrics.metrics.totalJumps} saltos</span>
               {' '}· <span className="text-amber-400 font-bold">{pathMetrics.metrics.totalDistance}mm</span>
               {' '}· <span className="text-violet-400 font-bold">{pathMetrics.metrics.colorChanges} cambios</span>
             </div>
             <div className="text-emerald-400 font-bold">{pathMetrics.machineTime.formatted}</div>
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
          {/* Right panel tab switcher */}
          {selectedRegionId ? (() => {
            const selRegion = regions.find(r => r.id === selectedRegionId);
            return (
              <RightPanelTabs
                region={selRegion}
                regions={regions}
                config={config}
                onUpdate={handleRegionsUpdate}
                onSelect={setSelectedRegionId}
              />
            );
          })() : (
            <div className="flex-1 overflow-hidden min-h-0">
              <RegionsPanel regions={regions} selectedId={selectedRegionId} onSelect={setSelectedRegionId} onUpdate={handleRegionsUpdate} config={config} />
            </div>
          )}
        </div>
      </div>

      {showExport && <ExportModal project={project} regions={regions} onClose={() => setShowExport(false)} />}

      {/* Saved toast */}
      {savedToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
        </div>
      )}
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

function RightPanelTabs({ region, regions, config, onUpdate, onSelect }) {
  const [tab, setTab] = useState('regions');
  const TABS = [
    { id: 'regions', label: 'Regiones' },
    { id: 'eie',     label: '🧠 EIE' },
    { id: 'sub',     label: 'Métricas' },
  ];
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-[#1e2130] flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${
              tab === t.id
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-600 hover:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'regions' && (
          <RegionsPanel regions={regions} selectedId={region?.id} onSelect={onSelect} onUpdate={onUpdate} config={config} />
        )}
        {tab === 'eie' && (
          <div className="p-3">
            <IntelligencePanel region={region} config={config} allRegions={regions} onUpdate={onUpdate} />
          </div>
        )}
        {tab === 'sub' && (
          <div className="p-3">
            <SubpixelMetricsPanel
              region={region}
              widthMm={config.width_mm}
              heightMm={config.height_mm}
            />
          </div>
        )}
      </div>
    </div>
  );
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