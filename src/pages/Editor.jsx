import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Save, Download, Zap, ChevronRight, ArrowLeft
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StepPipeline from '@/components/editor/StepPipeline';
import AIProgressIndicator from '@/components/editor/AIProgressIndicator';
import StitchCanvas from '@/components/editor/StitchCanvas';
import ConfigPanel from '@/components/editor/ConfigPanel';
import RegionsPanel from '@/components/editor/RegionsPanel';
import ExportModal from '@/components/editor/ExportModal';
import PreprocessingPanel, { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import { preprocessImage } from '@/lib/imagePreprocessor';
import { analyzeImage } from '@/lib/imageAnalyzer';

const DEFAULT_CONFIG = {
  fabric_type: 'Algodón', width_mm: 100, height_mm: 100, color_count: 6,
  mode: 'hybrid', use_full_bg: false, use_ia_vision: false,
  remove_bg: false, tension_comp: 0.5, ai_sequence: false
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

  useEffect(() => {
    if (id) loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.Project.get(id);
      setProject(p);
      setConfig(p.config || DEFAULT_CONFIG);
      setRegions(p.regions || []);
      setImageUrl(p.image_url || null);
      setStep(p.step || 1);
    } catch (e) {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const saveProject = async (overrides = {}) => {
    if (!project) return;
    setSaving(true);
    try {
      const updated = await base44.entities.Project.update(project.id, {
        config,
        regions,
        image_url: imageUrl,
        step,
        total_stitches: regions.reduce((s, r) => s + (r.stitch_count || 0), 0),
        color_count: new Set(regions.map(r => r.color)).size,
        ...overrides
      });
      setProject(updated);
    } finally {
      setSaving(false);
    }
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
    } finally {
      setUploadingImage(false);
    }
  };

  const startProcessing = async () => {
    if (!imageUrl) return;
    setProcessing(true);
    setProcessingElapsed(0);
    timerRef.current = setInterval(() => setProcessingElapsed(s => s + 1), 1000);
    setStep(2);
    try {
      // Pre-process image if enabled
      let finalImageUrl = imageUrl;
      if (preprocessSettings.enabled) {
        try {
          const processed = await preprocessImage(imageUrl, preprocessSettings);
          const { file_url } = await base44.integrations.Core.UploadFile({ file: processed.blob });
          finalImageUrl = file_url;
          setPreprocessedUrl(file_url);
        } catch (prepErr) {
          console.warn('Preprocessing failed, using original:', prepErr);
        }
      }

      // Analyze image for precise color/edge metadata
      let imageAnalysis = null;
      try {
        imageAnalysis = await analyzeImage(finalImageUrl, config.color_count || 8);
      } catch (e) {
        console.warn('Image analysis failed, continuing without metadata:', e);
      }

      const res = await base44.functions.invoke('hybridDigitize', {
        image_url: finalImageUrl,
        mode: config.mode,
        width_mm: config.width_mm,
        height_mm: config.height_mm,
        color_count: config.color_count,
        remove_bg: config.remove_bg,
        use_ia_vision: config.use_ia_vision,
        use_full_bg: config.use_full_bg,
        image_analysis: imageAnalysis,
      });

      if (res.data?.success) {
        const rawData = res.data.data?.response || res.data.data;
        const { regions: newRegions, total_stitches } = rawData;
        setRegions(newRegions || []);
        setStep(3);
        await base44.entities.Project.update(id, {
          regions: newRegions, step: 3, status: 'ready',
          total_stitches,
          color_count: new Set((newRegions || []).map(r => r.color)).size
        });
        // Save version
        await base44.entities.VersionHistory.create({
          project_id: id,
          label: `Vectorización ${config.mode}`,
          description: `${newRegions?.length || 0} regiones generadas`,
          snapshot: { regions: newRegions, config },
          step: 3
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
      clearInterval(timerRef.current);
    }
  };

  const handleRegionClick = (regionId, dblClick) => {
    setSelectedRegionId(regionId);
  };

  const handleRegionsUpdate = (updated) => {
    setRegions(updated);
  };

  const handleRename = async (name) => {
    if (!project || !name.trim()) return;
    const updated = await base44.entities.Project.update(id, { name: name.trim() });
    setProject(updated);
  };

  const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const colorsUsed = new Set(regions.map(r => r.color)).size;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0d0f14] flex flex-col overflow-hidden text-white">
      {/* TOP NAV */}
      <div className="flex-shrink-0 border-b border-[#1e2130] bg-[#0d0f14]">
        {/* Top row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link to="/" className="p-1.5 rounded-lg hover:bg-[#1e2130] text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-4 bg-[#2a2d3a]" />

          {/* Breadcrumb / project name */}
          <ProjectNameInput name={project?.name || 'Sin título'} onSave={handleRename} />

          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs text-slate-400">{config.mode || 'hybrid'}</span>

          {/* Pipeline */}
          <div className="flex-1 flex justify-center">
            <StepPipeline currentStep={step} />
          </div>

          {/* AI Progress */}
          <AIProgressIndicator active={processing} elapsed={processingElapsed} />

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            <NavButton onClick={() => setShowExport(true)} icon={Download} label="Exportar" accent />
            <NavButton onClick={startProcessing} icon={Zap} label="Procesar" disabled={!imageUrl || processing} />
            <NavButton onClick={() => saveProject()} icon={Save} label={saving ? '...' : 'Guardar'} />
          </div>
        </div>

        {/* Tabs + Metrics */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[#1a1d27]">
          <div className="flex items-center gap-1">
            {[['editor', 'Editor'], ['preview', 'Vista Previa'], ['panel', 'Panel']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === id ? 'text-violet-300 bg-violet-900/20 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-600">Puntadas <span className="text-violet-400 font-bold">{totalStitches.toLocaleString()}</span></span>
            <span className="text-slate-600">Colores <span className="text-cyan-400 font-bold">{colorsUsed}</span></span>
            <span className="text-slate-600">Tamaño <span className="text-emerald-400 font-bold">{config.width_mm}×{config.height_mm}mm</span></span>
          </div>
        </div>
      </div>

      {/* MAIN EDITOR LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL */}
        <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto">
          <ConfigPanel config={config} onChange={setConfig} />
          <PreprocessingPanel settings={preprocessSettings} onChange={setPreprocessSettings} />
        </div>

        {/* CENTER CANVAS */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Opacity sliders */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1a1d27] bg-[#0a0c12]">
            <SliderControl label="Imagen" value={imageOpacity} onChange={setImageOpacity} color="text-amber-400" />
            <SliderControl label="Puntadas" value={stitchOpacity} onChange={setStitchOpacity} color="text-violet-400" />
            <div className="flex items-center gap-2 ml-auto">
              <FilterToggle label="Rellenos" active={showFill} onChange={setShowFill} color="violet" />
              <FilterToggle label="Contornos" active={showContour} onChange={setShowContour} color="cyan" />
            </div>
          </div>

          {/* Upload zone or Canvas */}
          {!imageUrl ? (
            <UploadZone
              onUpload={handleImageUpload}
              fileInputRef={fileInputRef}
              uploading={uploadingImage}
            />
          ) : (
            <div className="flex-1 overflow-hidden">
              <StitchCanvas
                imageUrl={imageUrl}
                regions={regions}
                selectedRegionId={selectedRegionId}
                onRegionClick={handleRegionClick}
                imageOpacity={imageOpacity}
                stitchOpacity={stitchOpacity}
                showFill={showFill}
                showContour={showContour}
              />
            </div>
          )}

          {/* Process button when image uploaded but not processed */}
          {imageUrl && regions.length === 0 && !processing && (
            <div className="border-t border-[#1a1d27] p-3 flex items-center gap-3 bg-[#0a0c12]">
              <div className="flex-1 text-xs text-slate-500">Imagen cargada. Inicia la vectorización con IA.</div>
              <button
                onClick={startProcessing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                <Zap className="w-3.5 h-3.5" /> Vectorizar con IA
              </button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="w-64 flex-shrink-0 border-l border-[#1e2130] overflow-hidden">
          <RegionsPanel
            regions={regions}
            selectedId={selectedRegionId}
            onSelect={setSelectedRegionId}
            onUpdate={handleRegionsUpdate}
          />
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <ExportModal
          project={project}
          regions={regions}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function ProjectNameInput({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  useEffect(() => setVal(name), [name]);
  if (editing) return (
    <input
      autoFocus value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { onSave(val); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      className="bg-[#1e2130] border border-violet-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none w-40"
    />
  );
  return (
    <button onClick={() => setEditing(true)} className="text-sm font-semibold text-slate-200 hover:text-white truncate max-w-[160px]">{name}</button>
  );
}

function NavButton({ onClick, icon: Icon, label, accent, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        accent ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white hover:bg-[#1e2130]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function SliderControl({ label, value, onChange, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input
        type="range" min="0" max="100" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 accent-violet-600"
      />
      <span className={`text-[11px] font-bold w-8 text-right ${color}`}>{value}%</span>
    </div>
  );
}

function FilterToggle({ label, active, onChange, color }) {
  const accent = color === 'violet' ? 'border-violet-500/50 bg-violet-900/20 text-violet-300' : 'border-cyan-500/50 bg-cyan-900/20 text-cyan-300';
  return (
    <button
      onClick={() => onChange(!active)}
      className={`text-[10px] px-2 py-1 rounded border transition-colors font-medium ${active ? accent : 'border-[#2a2d3a] text-slate-600 hover:text-slate-400'}`}
    >
      {label}
    </button>
  );
}

function UploadZone({ onUpload, fileInputRef, uploading }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const mockEvent = { target: { files: [file] } };
      onUpload(mockEvent);
    }
  };

  return (
    <div
      className={`flex-1 flex items-center justify-center border-2 border-dashed transition-colors m-6 rounded-2xl cursor-pointer ${
        dragOver ? 'border-violet-500 bg-violet-900/10' : 'border-[#2a2d3a] hover:border-violet-500/50'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml"
        className="hidden" onChange={onUpload}
      />
      <div className="text-center">
        {uploading ? (
          <div className="w-10 h-10 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        ) : (
          <div className="text-5xl mb-3">🧵</div>
        )}
        <h3 className="text-base font-semibold text-white mb-1">
          {uploading ? 'Subiendo imagen...' : 'Sube tu imagen'}
        </h3>
        <p className="text-sm text-slate-500">PNG, JPG o SVG • Arrastra o haz click</p>
        {!uploading && (
          <div className="mt-4 px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs inline-block">
            Seleccionar archivo
          </div>
        )}
      </div>
    </div>
  );
}