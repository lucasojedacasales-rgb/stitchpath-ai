import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Download, Zap, ChevronRight, ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StepPipeline from '@/components/editor/StepPipeline';
import AIProgressIndicator from '@/components/editor/AIProgressIndicator';
import StitchCanvas from '@/components/editor/StitchCanvas';
import ConfigPanel from '@/components/editor/ConfigPanel';
import RegionsPanel from '@/components/editor/RegionsPanel';
import ExportModal from '@/components/editor/ExportModal';
import PreprocessingPanel, { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import MaskToolbar from '@/components/editor/MaskToolbar';
import MaskCanvas from '@/components/editor/MaskCanvas';
import { extractImagePixels } from '@/lib/imagePixelExtractor';

const DEFAULT_CONFIG = {
  fabric_type: 'Algodón',
  width_mm: 100,
  height_mm: 100,
  color_count: 6,
  mode: 'hybrid',
  tension_comp: 0.5
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

  // Mask tool state
  const maskCanvasRef = useRef(null);
  const [maskTool, setMaskTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(20);
  const [brushMode, setBrushMode] = useState('erase');
  const [wandTolerance, setWandTolerance] = useState(15);
  const [showMaskOverlay, setShowMaskOverlay] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [maskedPixelCount, setMaskedPixelCount] = useState(0);
  const [applyingMask, setApplyingMask] = useState(false);

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
    if (!imageUrl || processing) return;
    setProcessing(true);
    setProcessingElapsed(0);
    timerRef.current = setInterval(() => setProcessingElapsed(s => s + 1), 1000);
    setStep(2);

    const retryWithBackoff = async (fn, maxAttempts = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`, err);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      throw lastError;
    };

    try {
      // Extract pixels
      let pixelData;
      try {
        pixelData = await extractImagePixels(imageUrl);
        console.log('[EDITOR] Pixels extracted:', pixelData.width, 'x', pixelData.height);
      } catch (err) {
        throw new Error('No se pudo cargar la imagen');
      }

      if (!pixelData.pixels || pixelData.pixels.length < 4) {
        throw new Error('Datos de imagen inválidos');
      }

      // Invocar motor ULTIMATE para vectorización
      let res;
      try {
        res = await retryWithBackoff(async () => {
          console.log('[EDITOR] Invoking ultimateVectorization...');
          return await base44.functions.invoke('ultimateVectorization', {
            pixels: pixelData.pixels,
            width: pixelData.width,
            height: pixelData.height,
            width_mm: config.width_mm,
            height_mm: config.height_mm,
            color_count: config.color_count || 6,
            stitch_density: 0.8
          });
        });
      } catch (err) {
        console.error('Motor failed:', err);
        throw new Error('Error motor: ' + (err.message || String(err)));
      }

      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Motor failed');
      }

      // Convertir bloques a regiones para visualización
      const motorData = res.data;
      const blocks = Array.isArray(motorData.blocks) ? motorData.blocks : [];
      const newRegions = blocks.map((block, idx) => {
        const stitches = block.stitches || [];
        // path_points must be [[normX, normY], ...] in 0-1 range for StitchCanvas
        // The motor returns path_points as [[x/w, y/h], ...] already normalized
        // But if they're objects {x,y} in mm, convert them
        let path_points = block.path_points;
        if (!Array.isArray(path_points) || path_points.length === 0) {
          // Build from stitches in mm → normalize by design dimensions
          const wMm = config.width_mm || 100;
          const hMm = config.height_mm || 100;
          path_points = stitches.map(s => [
            (s.x || 0) / wMm,
            (s.y || 0) / hMm
          ]);
        } else if (path_points.length > 0 && !Array.isArray(path_points[0])) {
          // path_points are objects {x,y} — convert to arrays
          const wMm = config.width_mm || 100;
          const hMm = config.height_mm || 100;
          path_points = path_points.map(p => [(p.x || 0) / wMm, (p.y || 0) / hMm]);
        }

        return {
          id: block.id || `block_${idx}`,
          color: block.color || '#000000',
          stitch_type: block.stitch_type || block.type || 'fill',
          stitches,
          path_points,
          pointCount: block.pointCount || stitches.length,
          stitch_count: block.stitch_count || stitches.length,
          visible: true
        };
      });

      const totalCalculatedStitches = motorData.stitches || blocks.reduce((s, b) => s + (b.stitches?.length || 0), 0);

      console.log('[EDITOR] Motor output:', newRegions.length, 'regions,', totalCalculatedStitches, 'stitches');

      setRegions(newRegions);
      setStep(3);
      await base44.entities.Project.update(id, {
        regions: newRegions,
        step: 3,
        status: 'ready',
        total_stitches: totalCalculatedStitches,
        color_count: new Set((newRegions || []).map(r => r.color)).size
      });

      // Save version
      await base44.entities.VersionHistory.create({
        project_id: id,
        label: `Vectorización ${config.mode}`,
        description: `${newRegions?.length || 0} regiones, ${totalCalculatedStitches} puntadas`,
        snapshot: { regions: newRegions, config },
        step: 3
      });
    } catch (e) {
      console.error('Processing error:', e);
      alert('Error: ' + (e.message || 'Algo salió mal'));
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
      maskCanvasRef.current.clearMask();
      setMaskedPixelCount(0);
      setActiveTab('editor');
    } finally {
      setApplyingMask(false);
    }
  };

  const handleRegionClick = (regionId) => {
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
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link to="/" className="p-1.5 rounded-lg hover:bg-[#1e2130] text-slate-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-4 bg-[#2a2d3a]" />

          <ProjectNameInput name={project?.name || 'Sin título'} onSave={handleRename} />

          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs text-slate-400">{config.mode || 'hybrid'}</span>

          <div className="flex-1 flex justify-center">
            <StepPipeline currentStep={step} />
          </div>

          <AIProgressIndicator active={processing} elapsed={processingElapsed} />

          <div className="flex items-center gap-1.5">
            <NavButton onClick={() => setShowExport(true)} icon={Download} label="Exportar" accent />
            <NavButton onClick={startProcessing} icon={Zap} label="Procesar" disabled={!imageUrl || processing} />
            <NavButton onClick={() => saveProject()} icon={Save} label={saving ? '...' : 'Guardar'} />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[#1a1d27]">
          <div className="flex items-center gap-1">
            {[['editor', 'Editor'], ['mask', '✂ Máscara']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === id ? 'text-violet-300 bg-violet-900/20 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-600">Puntadas <span className="text-violet-400 font-bold">{totalStitches.toLocaleString()}</span></span>
            <span className="text-slate-600">Colores <span className="text-cyan-400 font-bold">{colorsUsed}</span></span>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto">
          <ConfigPanel
            config={config}
            onChange={setConfig}
            regions={regions}
            selectedRegionIds={selectedRegionId ? [selectedRegionId] : []}
            onRegionsUpdate={handleRegionsUpdate}
          />
          <PreprocessingPanel settings={preprocessSettings} onChange={setPreprocessSettings} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab !== 'mask' && <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1a1d27] bg-[#0a0c12]">
            <SliderControl label="Imagen" value={imageOpacity} onChange={setImageOpacity} color="text-amber-400" />
            <SliderControl label="Puntadas" value={stitchOpacity} onChange={setStitchOpacity} color="text-violet-400" />
            <div className="w-px h-5 bg-[#2a2d3a]" />
            <button
              onClick={() => setShowFill(!showFill)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${showFill ? 'bg-violet-900/30 border border-violet-500 text-violet-300' : 'bg-[#1e2130] border border-[#2a2d3a] text-slate-500'}`}
            >
              Relleno
            </button>
            <button
              onClick={() => setShowContour(!showContour)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${showContour ? 'bg-cyan-900/30 border border-cyan-500 text-cyan-300' : 'bg-[#1e2130] border border-[#2a2d3a] text-slate-500'}`}
            >
              Contorno
            </button>
          </div>}

          {!imageUrl ? (
            <UploadZone onUpload={handleImageUpload} fileInputRef={fileInputRef} uploading={uploadingImage} />
          ) : activeTab === 'mask' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <MaskToolbar
                activeTool={maskTool}
                onToolChange={setMaskTool}
                brushSize={brushSize}
                onBrushSizeChange={setBrushSize}
                brushMode={brushMode}
                onBrushModeChange={setBrushMode}
                wandTolerance={wandTolerance}
                onWandToleranceChange={setWandTolerance}
                showMaskOverlay={showMaskOverlay}
                onToggleMaskOverlay={() => setShowMaskOverlay(v => !v)}
                showOriginal={showOriginal}
                onToggleOriginal={() => setShowOriginal(v => !v)}
                onInvertMask={() => maskCanvasRef.current?.invertMask()}
                onClearMask={() => { maskCanvasRef.current?.clearMask(); setMaskedPixelCount(0); }}
                onApplyMask={handleApplyMask}
                maskedPixelCount={maskedPixelCount}
              />
              <div className="flex-1 overflow-hidden relative">
                {applyingMask && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-slate-300">Aplicando máscara...</span>
                    </div>
                  </div>
                )}
                <MaskCanvas
                  ref={maskCanvasRef}
                  imageUrl={imageUrl}
                  activeTool={maskTool}
                  brushSize={brushSize}
                  brushMode={brushMode}
                  wandTolerance={wandTolerance}
                  showMaskOverlay={showMaskOverlay}
                  showOriginal={showOriginal}
                  onMaskChange={setMaskedPixelCount}
                />
              </div>
            </div>
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

          {imageUrl && regions.length === 0 && !processing && (
            <div className="border-t border-[#1a1d27] p-3 flex items-center gap-3 bg-[#0a0c12]">
              <div className="flex-1 text-xs text-slate-500">Imagen cargada. Inicia la vectorización.</div>
              <button
                onClick={startProcessing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                <Zap className="w-3.5 h-3.5" /> Vectorizar
              </button>
            </div>
          )}
        </div>

        <div className="w-64 flex-shrink-0 border-l border-[#1e2130] overflow-hidden">
          <RegionsPanel
            regions={regions}
            selectedId={selectedRegionId}
            onSelect={setSelectedRegionId}
            onUpdate={handleRegionsUpdate}
          />
        </div>
      </div>

      {showExport && <ExportModal project={project} regions={regions} onClose={() => setShowExport(false)} />}
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
  return <button onClick={() => setEditing(true)} className="text-sm font-semibold text-slate-200 hover:text-white truncate max-w-[160px]">{name}</button>;
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

function UploadZone({ onUpload, fileInputRef, uploading }) {
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload({ target: { files: [file] } });
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
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={onUpload} />
      <div className="text-center">
        {uploading ? (
          <div className="w-10 h-10 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        ) : (
          <div className="text-5xl mb-3">🧵</div>
        )}
        <h3 className="text-base font-semibold text-white mb-1">{uploading ? 'Subiendo...' : 'Sube tu imagen'}</h3>
        <p className="text-sm text-slate-500">PNG o JPG • Arrastra o haz click</p>
      </div>
    </div>
  );
}