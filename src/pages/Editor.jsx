import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, Download, Zap, ChevronRight, ArrowLeft, ShieldCheck, RefreshCw, Sparkles } from 'lucide-react';
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
import MachineValidatorPanel from '@/components/editor/MachineValidatorPanel';
import StabilityOptimizerPanel from '@/components/editor/StabilityOptimizerPanel';
import TravelPathOptimizerPanel from '@/components/editor/TravelPathOptimizerPanel';
import TrimOptimizerPanel from '@/components/editor/TrimOptimizerPanel';
import ContourRefinePanel from '@/components/editor/ContourRefinePanel';
import SewingSimulator from '@/components/editor/SewingSimulator';
import MachineSimulator from '@/components/editor/MachineSimulator';
import SimulationReportPanel from '@/components/editor/SimulationReportPanel';
import FinalLookSimulator from '@/components/editor/FinalLookSimulator.jsx';
import DetailDiagnosticPanel from '@/components/editor/DetailDiagnosticPanel.jsx';
import AestheticPreservationPanel from '@/components/editor/AestheticPreservationPanel.jsx';
import PreprocessingPanel, { DEFAULT_PREPROCESS } from '@/components/editor/PreprocessingPanel';
import MaskToolbar from '@/components/editor/MaskToolbar';
import MaskCanvas from '@/components/editor/MaskCanvas';
import NeedlePathPanel from '@/components/editor/NeedlePathPanel';
import { runPipeline } from '@/lib/pipeline/runner';
import { enrichAllRegions } from '@/lib/regionBuilder.js';
import { getModeStrategy } from '@/lib/digitizeModes.js';
import { filterValidVisualRegions } from '@/lib/visualRegionGuard';
import { buildFinalCommands, DEFAULT_MACHINE } from '@/lib/exportPipeline';
import { calculateUnifiedCommandMetrics } from '@/lib/unifiedCommandMetrics';
import { simplifyGeometry } from '@/lib/industrialStitchProcessor';
import { buildStrictDarkStrokeContextFromOriginalImage } from '@/lib/rawDarkStrokeTest';
import RealImageDiagnosticPanel from '@/components/editor/RealImageDiagnosticPanel';
import FootContourExportDiagnostic from '@/components/editor/FootContourExportDiagnostic';
import ProfessionalQualityPanel from '@/components/editor/ProfessionalQualityPanel';
import ReferenceLearningPanel from '@/components/referenceLearning/ReferenceLearningPanel';
import { applyProfessionalPipeline } from '@/lib/professionalDigitizingMode';
import { autoApplyLearnedProfileForDesign } from '@/lib/referenceLearning/referenceLearningApplier';
import LearnedConfigDiffPanel from '@/components/editor/LearnedConfigDiffPanel';
import LearnedPresetValidationPanel from '@/components/referenceLearning/LearnedPresetValidationPanel';
import IntegratedPipelineReportButton from '@/components/referenceLearning/IntegratedPipelineReportButton';


// ═══ Decision Engine — SIEMPRE ACTIVADO ═══
import { useDecisionEngine } from '@/hooks/useDecisionEngine.js';
import { DecisionPanel } from '@/components/DecisionPanel.jsx';
const AI_ENABLED = true; // Cambiar a false para desactivar
// ═══════════════════════════════════════════

const DEFAULT_CONFIG = {
  fabric_type: 'Algodón', width_mm: 100, height_mm: 100, color_count: 6,
  mode: 'hybrid', remove_bg: false, tension_comp: 0.5,
  fill_angle: null, tatami_density: 0.4, vector_engine: 'hybrid',
  useVectorFusion: false,
  contourSafeMode: true,
  ce01SafeFillMode: true,
  ce01ProductionMode: true,
  // ── Rollback safety flags — experimental modules OFF by default ──
  // When false, the stable pipeline is used (contourSafeMode only, no
  // detail preservation / outline generation / centerline extraction).
  preserveAestheticDetails: false,
  generateOutlines: false,
  experimentalDetailPreservation: false,
  experimentalOutlineGenerator: false,
  experimentalFinalLookSimulator: false,
  experimentalAestheticPreservation: false,
  professionalMode: false,
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
  const [originalImageUrl, setOriginalImageUrl] = useState(null);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [imageOpacity, setImageOpacity] = useState(50);
  const [stitchOpacity, setStitchOpacity] = useState(100);
  const [showFill, setShowFill] = useState(true);
  const [showContour, setShowContour] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [editorUiMode, setEditorUiMode] = useState('simple');
  const [focusMode, setFocusMode] = useState(false);
  const [cleanConfigOpen, setCleanConfigOpen] = useState(false);
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [showProfessionalReports, setShowProfessionalReports] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [preprocessSettings, setPreprocessSettings] = useState(DEFAULT_PREPROCESS);
  const [preprocessedUrl, setPreprocessedUrl] = useState(null);
  const [pathMetrics, setPathMetrics] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const [detailReport, setDetailReport] = useState(null);
  const [classReport, setClassReport] = useState(null);
  const [centerlineReport, setCenterlineReport] = useState(null);
  const [outlineReport, setOutlineReport] = useState(null);
  const [darkStroke, setDarkStroke] = useState(null);
  const timerRef = useRef(null);

  // ── Dark stroke detection — "dark stroke first" contour system ──
  // Computes a mask of real dark lines from the original image so the contour
  // pipeline can reject color boundaries (e.g. between two pinks) that have no
  // actual drawn line, and preserve the mouth/eyes as independent dark details.
  // darkStroke must use the ORIGINAL uploaded bitmap, not the *_masked.png that
  // vectorization may use afterwards. Falls back to imageUrl if no original kept.
  useEffect(() => {
    const darkStrokeSourceUrl = originalImageUrl || imageUrl;
    if (!darkStrokeSourceUrl) { setDarkStroke(null); return; }
    let cancelled = false;
    buildStrictDarkStrokeContextFromOriginalImage(darkStrokeSourceUrl, config)
      .then(ctx => { if (!cancelled) setDarkStroke(ctx); })
      .catch(err => { console.warn('[dark-stroke] strict detection failed:', err); if (!cancelled) setDarkStroke(null); });
    return () => { cancelled = true; };
  }, [originalImageUrl, imageUrl]);

  // Config with dark stroke mask attached — flows through buildFinalCommands
  // to the contour export builder + segment classifier. Not persisted (mask is
  // a Uint8Array); saveProject uses the base configRef.
  const configWithDarkStroke = useMemo(() => ({ ...config, darkStroke }), [config, darkStroke]);

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

  // ═══ Command state separation ═══
  // finalEmbroideryCommands = accepted, real commands used by ALL main panels
  // candidateOptimizedCommands = temporary candidate (optimizer only)
  // discardedOptimizationReport = report of rejected candidate
  // optimizedCommandsOverride = applied optimization override (cleared on region change)
  const [candidateOptimizedCommands, setCandidateOptimizedCommands] = useState(null);
  const [discardedOptimizationReport, setDiscardedOptimizationReport] = useState(null);
  const [lastOptimizationAttempt, setLastOptimizationAttempt] = useState(null);
  const [optimizedCommandsOverride, setOptimizedCommandsOverride] = useState(null);
  // ── Auto-aplicación del aprendizaje del corpus al generar ──
  const [autoLearnedDiff, setAutoLearnedDiff] = useState(null);

  // Clear override + candidate when regions change
  useEffect(() => {
    setOptimizedCommandsOverride(null);
    setCandidateOptimizedCommands(null);
    setDiscardedOptimizationReport(null);
  }, [regions]);

  const editorMachineSettings = useMemo(() => ({
    ...DEFAULT_MACHINE,
    maxStitchLength: 12.1,
    maxJumpLength: 12.1,
    hoopSize: [config.width_mm || 100, config.height_mm || 100],
    designOffset: [0, 0],
    trimThreshold: 3.5,
  }), [config.width_mm, config.height_mm]);

  // Single source of truth — computed ONCE, shared with all panels
  const finalEmbroideryCommands = useMemo(() => {
    if (optimizedCommandsOverride) {
      const cmds = optimizedCommandsOverride;
      const meta = {
        source: 'optimized_override',
        stitchCount: cmds.filter(c => c.type === 'stitch').length,
        jumpCount: cmds.filter(c => c.type === 'jump').length,
        trimCount: cmds.filter(c => c.type === 'trim').length,
      };
      console.log('[commands-state] final commands metrics (override):', meta);
      return { commands: cmds, objects: [], meta };
    }
    // ── Auto-apply learned density / angle / pull-compensation (Professional Mode) ──
    // When the Reference Learning Engine mined these values from the corpus and
    // the user applied a learned preset, project them onto the generation regions
    // so the motor uses them automatically in every future generation. Gated by
    // professionalMode — absent keys / regression suite → behavior unchanged.
    let genRegions = regions;
    if (configWithDarkStroke.professionalMode) {
      const ld = configWithDarkStroke.learnedFillDensityMm;
      const la = configWithDarkStroke.learnedFillAngleDeg;
      const variation = configWithDarkStroke.learnedNeighborAngleVariationDeg;
      if (ld != null || la != null) {
        // Alternar el ángulo de relleno entre regiones fill vecinas usando la
        // variación aprendida del corpus (evita costuras paralelas acumuladas).
        let fillIdx = 0;
        genRegions = regions.map(r => {
          const isFill = r.stitch_type === 'fill' || !r.stitch_type;
          let angle = la != null ? la : (r.angle ?? 45);
          if (isFill && variation != null && la != null) {
            angle = la + (fillIdx % 2 === 1 ? variation : 0);
            fillIdx++;
          }
          return {
            ...r,
            density: ld != null ? ld : (r.density ?? 0.4),
            angle,
          };
        });
      }
    }
    const built = buildFinalCommands(genRegions, configWithDarkStroke, editorMachineSettings);
    const finalCmds = built.commands;
    // Professional mode post-processes the SAME command list used by Final Look
    // AND export, so both stay in sync (FASE 7).
    if (configWithDarkStroke.professionalMode) {
      const prof = applyProfessionalPipeline({
        commands: finalCmds, objects: built.objects, regions,
        config: configWithDarkStroke, darkStroke,
      });
      console.log('[professional] applied pipeline — score:', prof.report?.gate?.professionalScore);
      return {
        commands: prof.commands, objects: prof.objects, meta: built.meta,
        contourSegmentReport: built.contourSegmentReport,
        professionalReport: prof.report,
      };
    }
    console.log('[commands-state] final commands metrics:', {
      stitches: finalCmds.filter(c => c.type === 'stitch').length,
      jumps: finalCmds.filter(c => c.type === 'jump').length,
      trims: finalCmds.filter(c => c.type === 'trim').length,
    });
    return { commands: finalCmds, objects: built.objects, meta: built.meta, contourSegmentReport: built.contourSegmentReport };
  }, [regions, configWithDarkStroke, editorMachineSettings, optimizedCommandsOverride, darkStroke]);

  // ═══ Unified metrics — single source of truth for all panels ═══
  const unifiedMetrics = useMemo(() => {
    const m = calculateUnifiedCommandMetrics(
      finalEmbroideryCommands.commands, regions, editorMachineSettings
    );
    console.log('[command-sync] finalEmbroideryCommands length:', finalEmbroideryCommands.commands.length);
    console.log('[command-sync] simulation source: finalEmbroideryCommands');
    console.log('[command-sync] finalLook source: finalEmbroideryCommands');
    console.log('[command-sync] validation source: finalEmbroideryCommands');
    console.log('[command-sync] export source: finalEmbroideryCommands');
    console.log('[command-sync] simulation metrics:', { stitches: m.stitchCount, jumps: m.jumpCount, trims: m.trimCount });
    console.log('[command-sync] panels synced: YES');
    return m;
  }, [finalEmbroideryCommands, regions, editorMachineSettings]);

  // ── Command versioning — bumps whenever finalEmbroideryCommands changes ──
  const [commandVersion, setCommandVersion] = useState(() => Date.now());
  useEffect(() => {
    const v = Date.now();
    setCommandVersion(v);
    console.log('[metrics-sync] commandVersion:', v);
    console.log('[metrics-sync] bottom metrics:', { stitches: unifiedMetrics.stitchCount, jumps: unifiedMetrics.jumpCount, trims: unifiedMetrics.trimCount, colors: unifiedMetrics.colorCount });
  }, [finalEmbroideryCommands]);

  const handleOptimizationApplied = useCallback((commands) => {
    setOptimizedCommandsOverride(commands);
    setCandidateOptimizedCommands(null);
    setDiscardedOptimizationReport(null);
    setLastOptimizationAttempt({ applied: true, timestamp: Date.now() });
  }, []);

  const handleOptimizationDiscarded = useCallback((report) => {
    setCandidateOptimizedCommands(report.commands);
    setDiscardedOptimizationReport(report);
    setLastOptimizationAttempt({ applied: false, reason: report.reason, timestamp: Date.now() });
    // Do NOT update optimizedCommandsOverride or finalEmbroideryCommands
  }, []);
  // ═════════════════════════════

  useEffect(() => {if (id) loadProject();}, [id]); // loadProject reads `id` from closure — safe to omit from deps

  // Cleanup: clear processing timer on unmount to prevent memory leak / stale setState
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const loadProject = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.Project.get(id);
      setProject(p);
      setConfig({ ...DEFAULT_CONFIG, ...(p.config || {}) });
      setRegions(p.regions || []);
      setImageUrl(p.image_url || null);
      setOriginalImageUrl(p.image_url || null);
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
    } finally { setSaving(false); }
  }, [project]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    // Full state reset — no stale data from previous design must survive.
    setRegions([]);
    setSelectedRegionId(null);
    setPathMetrics(null);
    setProcessingError(null);
    setDetailReport(null);
    setClassReport(null);
    setCenterlineReport(null);
    setOutlineReport(null);
    setPreprocessedUrl(null);
    setShowExport(false);
    setActiveTab('editor');
    setShowDecisionPanel(false);
    resetAI();
    setOriginalImageUrl(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      setOriginalImageUrl(file_url);
      setStep(2);
      await base44.entities.Project.update(id, { image_url: file_url, step: 2, status: 'draft', regions: [], total_stitches: 0, color_count: 0 });

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
    setProcessingError(null);
    timerRef.current = setInterval(() => setProcessingElapsed((s) => s + 1), 1000);
    setStep(2);

    try {
      const ctx = await runPipeline(imageUrl, config, {
        initialCtx: aiStrategy ? { aiStrategy } : {},
      });

      const rawRegions = ctx.regions || [];
      const enrichedRegions = filterValidVisualRegions(rawRegions);
      if (enrichedRegions.length === 0) throw new Error('No valid regions generated after pipeline');

      const totalCalculatedStitches = enrichedRegions.reduce((s, r) => s + (r.stitch_count || 0), 0);

      if (ctx.enhanced?.enhancedUrl) setPreprocessedUrl(ctx.enhanced.enhancedUrl);

      setRegions(enrichedRegions);
      setPathMetrics(ctx.pathMetrics || null);
      setDetailReport(ctx.detailReport || null);
      setClassReport(ctx.classReport || null);
      setCenterlineReport(ctx.centerlineReport || null);
      setOutlineReport(ctx.outlineReport || null);
      setStep(3);
      setShowDecisionPanel(false);

      // ── Auto-aplicar reglas aprendidas del corpus al generar ──
      // Si el motor de aprendizaje extrajo perfiles profesionales, se selecciona
      // el mejor para este diseño y se aplica directamente al config (activa
      // Professional Mode + learned* keys). El diff se muestra en pantalla.
      const auto = autoApplyLearnedProfileForDesign(enrichedRegions);
      if (auto?.configPatch) {
        setConfig(c => ({ ...c, ...auto.configPatch }));
        setAutoLearnedDiff({
          diff: auto.diff,
          profileName: auto.selection?.selectedProfile?.archetype || auto.selection?.selectedProfileId,
          confidence: auto.selection?.confidence,
        });
        console.log('[auto-learn] perfil aplicado:', auto.selection?.selectedProfileId, 'confianza:', auto.selection?.confidence);
      } else {
        setAutoLearnedDiff(null);
      }

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
      setProcessingError(e.message || 'Error desconocido al digitalizar');
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
  // GUARD: Optimize/AutoFix/Repair may return regions with corrupted/empty path_points
  // or even command arrays. Only valid visual regions reach setRegions; if none are
  // valid, the previous state is kept so the canvas never goes blank.
  const handleRegionsUpdate = useCallback((updated) => {
    const incoming = Array.isArray(updated) ? updated : [];
    const valid = filterValidVisualRegions(incoming);
    console.log(`[canvas] visualRegions update: ${valid.length}/${incoming.length} valid`);
    if (valid.length === 0) {
      console.warn('[canvas] Rejected visual update: no valid visual regions — keeping previous state');
      return;
    }
    setRegions(valid);
  }, []);

  // ═══ Visual guard: validation/optimization must be read-only ═══
  // Backs up valid visual regions and restores them if any validation
  // or optimization process corrupts the visual state (e.g. replaces
  // fills/contours with command arrays or a single black outline).
  const lastValidRegionsRef = useRef([]);
  useEffect(() => {
    const valid = filterValidVisualRegions(regions);
    if (valid.length > 0) {
      lastValidRegionsRef.current = regions;
    } else if (lastValidRegionsRef.current.length > 0) {
      console.warn('[validate-fix] mutation detected: visual regions corrupted — restoring from backup');
      console.log('[validate-fix] validation is read-only: visual state restored');
      setRegions(lastValidRegionsRef.current);
    }
  }, [regions]);
  const handleRename = useCallback(async (name) => {
    if (!id || !name.trim()) return;
    const updated = await base44.entities.Project.update(id, { name: name.trim() });
    setProject(updated);
  }, [id]);

  const totalStitches = useMemo(() => regions.reduce((s, r) => s + (r.stitch_count || 0), 0), [regions]);
  const colorsUsed = useMemo(() => new Set(regions.map((r) => r.color)).size, [regions]);
  const isLabMode = editorUiMode === 'lab';
  const isCleanMode = editorUiMode === 'simple';
  const simpleTabs = [
    { id: 'editor',    label: 'Editor' },
    { id: 'mask',      label: '✂ Máscara' },
    { id: 'simulate',  label: '▶ Simular' },
    { id: 'finallook', label: '🎨 Final' },
  ];
  const labPrimaryTabs = [
    { id: 'editor',    label: 'Editor' },
    { id: 'simulate',  label: 'Simular' },
    { id: 'finallook', label: 'Final' },
  ];
  const labMoreTabs = [
    { id: 'mask',       label: 'Máscara' },
    { id: 'planner',    label: 'Planner' },
    { id: 'travel',     label: 'Travel' },
    { id: 'validate',   label: 'Validar' },
    { id: 'details',    label: 'Detalles' },
    { id: 'diagnostic', label: 'Diagnóstico' },
    { id: 'prof',       label: 'Profesional' },
    { id: 'learn',      label: 'Aprendizaje' },
  ];
  const visibleTabs = isLabMode ? labPrimaryTabs : simpleTabs;
  const activeInMore = labMoreTabs.some((tab) => tab.id === activeTab);
  useEffect(() => {
    if (!isLabMode && !simpleTabs.some((tab) => tab.id === activeTab)) setActiveTab('editor');
  }, [isLabMode, activeTab]);
  useEffect(() => {
    if (isCleanMode && (activeTab === 'finallook' || activeTab === 'simulate')) setCleanConfigOpen(false);
  }, [isCleanMode, activeTab]);

  const handleRegenerateCommands = useCallback(() => {
    console.log('[command-sync] regenerate: clearing override, rebuilding from regions');
    setOptimizedCommandsOverride(null);
    setCandidateOptimizedCommands(null);
    setDiscardedOptimizationReport(null);
  }, []);

  const handleSimplifyGeometry = useCallback(() => {
    setRegions(prev => prev.map(r => {
      if (!r.path_points || r.path_points.length < 4) return r;
      const simplified = simplifyGeometry(r.path_points, 0.008);
      if (!simplified || simplified.length < 3) return r;
      return { ...r, path_points: simplified };
    }));
  }, []);

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
          <div className="flex items-center gap-1 rounded-lg border border-[#2a2d3a] bg-[#11141c] p-1">
            <button
              onClick={() => setEditorUiMode('simple')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${editorUiMode === 'simple' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Vista limpia
            </button>
            <button
              onClick={() => setEditorUiMode('lab')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${editorUiMode === 'lab' ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Herramientas técnicas
            </button>
          </div>
          <button
            onClick={() => focusMode ? setFocusMode(false) : (setFocusMode(true), setActiveTab('finallook'))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${focusMode ? 'bg-emerald-600 text-white' : 'bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white hover:bg-[#1e2130]'}`}
          >
            {focusMode ? 'Salir de enfoque' : 'Modo enfoque'}
          </button>
          <AIProgressIndicator active={processing} elapsed={processingElapsed} />
          <div className="flex items-center gap-1.5">
            <NavButton onClick={() => setShowExport(true)} icon={Download} label="Exportar" accent />
            <NavButton onClick={() => startProcessing()} icon={Zap} label="Procesar" disabled={!imageUrl || processing} />
            <NavButton onClick={() => saveProject()} icon={Save} label={saving ? '...' : 'Guardar'} />
          </div>
        </div>
        {!focusMode && (
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-[#1a1d27]">
            <div className="flex items-center gap-1 relative">
              {visibleTabs.map(({ id, label }) =>
                <button key={id} onClick={() => { setActiveTab(id); setShowMoreTabs(false); }} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeTab === id ? 'text-violet-300 bg-violet-900/20 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                  {label}
                </button>
              )}
              {isLabMode && (
                <>
                  <button onClick={() => setShowExport(true)} className="px-3 py-1 rounded text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors">Exportar</button>
                  <button onClick={() => setShowMoreTabs((v) => !v)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${activeInMore ? 'text-violet-300 bg-violet-900/20 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300'}`}>Más...</button>
                  {showMoreTabs && (
                    <div className="absolute top-8 left-56 z-30 w-44 rounded-xl border border-[#2a2d3a] bg-[#11141c] p-2 shadow-2xl">
                      {labMoreTabs.map(({ id, label }) => (
                        <button key={id} onClick={() => { setActiveTab(id); setShowMoreTabs(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${activeTab === id ? 'bg-violet-900/30 text-violet-200' : 'text-slate-400 hover:bg-[#1e2130] hover:text-white'}`}>{label}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-slate-600">Puntadas <span className="text-violet-400 font-bold">{unifiedMetrics.stitchCount.toLocaleString()}</span></span>
              <span className="text-slate-600">Colores <span className="text-cyan-400 font-bold">{colorsUsed}</span></span>
              <span className="text-slate-600">Tamaño <span className="text-emerald-400 font-bold">{config.width_mm}×{config.height_mm}mm</span></span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {!focusMode && isCleanMode && (
          cleanConfigOpen ? (
            <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-300">Configuración</div>
                <button onClick={() => setCleanConfigOpen(false)} className="text-xs text-slate-500 hover:text-white">Cerrar</button>
              </div>
              <ConfigPanel config={config} onChange={setConfig} regions={regions} selectedRegionIds={selectedRegionId ? [selectedRegionId] : []} onRegionsUpdate={handleRegionsUpdate} />
            </div>
          ) : (
            <div className="w-12 flex-shrink-0 border-r border-[#1e2130] bg-[#0a0c12] p-2">
              <button onClick={() => setCleanConfigOpen(true)} className="h-full w-full rounded-lg border border-[#2a2d3a] text-[10px] font-bold text-slate-500 hover:text-white hover:bg-[#161a23] [writing-mode:vertical-rl] rotate-180">Configuración</button>
            </div>
          )
        )}
        {!focusMode && isLabMode && (
          <div className="w-64 flex-shrink-0 border-r border-[#1e2130] overflow-y-auto space-y-4 p-4">
            <ConfigPanel config={config} onChange={setConfig} regions={regions} selectedRegionIds={selectedRegionId ? [selectedRegionId] : []} onRegionsUpdate={handleRegionsUpdate} />
            <div className="space-y-4 border-t border-[#1e2130] pt-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Avanzado · Laboratorio</div>
              <AestheticPreservationPanel config={config} onChange={setConfig} />
              <QualityAnalysisPanel projectId={project?.id} onAnalysisComplete={(analysis) => console.log('Quality:', analysis)} />
              <PreprocessingPanel settings={preprocessSettings} onChange={setPreprocessSettings} />
              <NeedlePathPanel regions={regions} pathMetrics={pathMetrics} config={config} />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {isLabMode && !focusMode && activeTab !== 'mask' && activeTab !== 'planner' && activeTab !== 'travel' && activeTab !== 'simulate' && activeTab !== 'finallook' && activeTab !== 'details' && <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1a1d27] bg-[#0a0c12]">
            <SliderControl label="Imagen" value={imageOpacity} onChange={setImageOpacity} color="text-amber-400" />
            <SliderControl label="Puntadas" value={stitchOpacity} onChange={setStitchOpacity} color="text-violet-400" />
            <div className="flex items-center gap-2 ml-auto">
              <FilterToggle label="Rellenos" active={showFill} onChange={setShowFill} color="violet" />
              <FilterToggle label="Contornos" active={showContour} onChange={setShowContour} color="cyan" />
            </div>
          </div>}

          {activeTab === 'planner' ? (
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
          ) : activeTab === 'simulate' ? (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <MachineSimulator
                  regions={regions}
                  config={config}
                  machineSettings={{
                    maxStitchLength: 12.1,
                    maxJumpLength: 12.1,
                    hoopSize: [config.width_mm || 100, config.height_mm || 100],
                    designOffset: [0, 0],
                    trimThreshold: 3.5,
                  }}
                  onRegionsRepaired={handleRegionsUpdate}
                />
              </div>
              {isLabMode && !focusMode && (
                <div className="w-72 flex-shrink-0 border-l border-[#1e2130] overflow-y-auto p-3 bg-[#0a0c12]">
                  <SimulationReportPanel
                    regions={regions}
                    config={config}
                    machineSettings={editorMachineSettings}
                    finalCommands={finalEmbroideryCommands.commands}
                    finalObjects={finalEmbroideryCommands.objects}
                    onRegionsRepaired={handleRegionsUpdate}
                  />
                </div>
              )}
            </div>
          ) : activeTab === 'finallook' ? (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <FinalLookSimulator
                  regions={regions}
                  config={config}
                  machineSettings={editorMachineSettings}
                  detailReport={detailReport}
                  finalCommands={finalEmbroideryCommands.commands}
                  finalObjects={finalEmbroideryCommands.objects}
                />
              </div>
            </div>
          ) : activeTab === 'details' ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-md mx-auto space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-white">🔍 Diagnóstico de Detalles</span>
                </div>
                <DetailDiagnosticPanel
                  detailReport={detailReport}
                  classReport={classReport}
                  centerlineReport={centerlineReport}
                  outlineReport={outlineReport}
                />
              </div>
            </div>
          ) : activeTab === 'validate' ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-md mx-auto space-y-4">
                <TravelPathOptimizerPanel
                  regions={regions}
                  config={config}
                  machineSettings={editorMachineSettings}
                  finalCommands={finalEmbroideryCommands.commands}
                  onOptimizationApplied={handleOptimizationApplied}
                  onOptimizationDiscarded={handleOptimizationDiscarded}
                />
                <TrimOptimizerPanel
                  regions={regions}
                  config={config}
                  machineSettings={editorMachineSettings}
                  finalCommands={finalEmbroideryCommands.commands}
                  onOptimizationApplied={handleOptimizationApplied}
                  onOptimizationDiscarded={handleOptimizationDiscarded}
                />
                <StabilityOptimizerPanel
                  regions={regions}
                  config={config}
                  machineSettings={editorMachineSettings}
                  finalCommands={finalEmbroideryCommands.commands}
                  finalObjects={finalEmbroideryCommands.objects}
                  onOptimizationApplied={handleOptimizationApplied}
                  onOptimizationDiscarded={handleOptimizationDiscarded}
                />
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-bold text-white">Validación de Máquina Doméstica</h3>
                  <span className="text-[10px] text-slate-500">Caydo CE01</span>
                </div>
                <MachineValidatorPanel
                  regions={regions}
                  config={config}
                  machineSettings={editorMachineSettings}
                  commands={finalEmbroideryCommands.commands}
                  onSimplifyGeometry={handleSimplifyGeometry}
                />
                <ContourRefinePanel
                  commands={finalEmbroideryCommands.commands}
                  regions={regions}
                  config={config}
                />
              </div>
            </div>
          ) : activeTab === 'travel' ? (
            <div className="flex-1 overflow-hidden">
              <TravelOptimizerPanel
                regions={regions}
                onApplyOrder={(ordered) => setRegions(ordered)}
              />
            </div>
          ) : activeTab === 'diagnostic' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <RealImageDiagnosticPanel
                imageUrl={imageUrl}
                regions={regions}
                config={config}
                darkStroke={darkStroke}
                finalCommands={finalEmbroideryCommands.commands}
                finalObjects={finalEmbroideryCommands.objects}
                machineSettings={editorMachineSettings}
                originalImageUrl={originalImageUrl}
                darkStrokeSourceUrl={originalImageUrl || imageUrl}
                contourSegmentReport={finalEmbroideryCommands.contourSegmentReport}
              />
              <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-3">
                <div className="mb-2 text-xs font-bold text-amber-300">Diagnóstico de pies / contorno inferior</div>
                <div className="mb-3 text-[11px] text-slate-500">Solo lectura · diagnóstico técnico · no es una herramienta principal de usuario final.</div>
                <FootContourExportDiagnostic
                  regions={regions}
                  config={config}
                  darkStroke={darkStroke}
                  finalCommands={finalEmbroideryCommands.commands}
                  finalObjects={finalEmbroideryCommands.objects}
                  machineSettings={editorMachineSettings}
                />
              </div>
            </div>
          ) : activeTab === 'prof' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-[#1e2130] bg-[#11141c] p-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Calidad profesional</h2>
                  <p className="text-xs text-slate-500">Estado técnico del bordado final</p>
                </div>
                <button
                  onClick={() => setShowProfessionalReports((v) => !v)}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-900/15 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-900/25 transition-colors"
                >
                  {showProfessionalReports ? 'Ocultar informes técnicos' : 'Mostrar informes técnicos'}
                </button>
              </div>
              {autoLearnedDiff && (
                <LearnedConfigDiffPanel
                  diff={autoLearnedDiff.diff}
                  profileName={autoLearnedDiff.profileName}
                  confidence={autoLearnedDiff.confidence}
                  onDismiss={() => setAutoLearnedDiff(null)}
                />
              )}
              <ProfessionalQualityPanel
                commands={finalEmbroideryCommands.commands}
                objects={finalEmbroideryCommands.objects}
                regions={regions}
                exportCommands={finalEmbroideryCommands.commands}
                darkStroke={darkStroke}
                config={config}
                gate={finalEmbroideryCommands.professionalReport?.gate}
                onToggleMode={(v) => setConfig(c => ({ ...c, professionalMode: v }))}
              />
              <LearnedPresetValidationPanel
                regions={regions}
                config={config}
                darkStroke={darkStroke}
                machineSettings={editorMachineSettings}
                designName={project?.name}
                onApplyConfig={(patch) => setConfig(c => ({ ...c, ...patch }))}
                showDownloads={showProfessionalReports}
              />
              {showProfessionalReports && (
                <div className="rounded-xl border border-[#1e2130] bg-[#11141c] p-3 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Informes técnicos</h3>
                    <p className="text-[11px] text-slate-500">Descargas avanzadas del pipeline profesional.</p>
                  </div>
                  <IntegratedPipelineReportButton />
                </div>
              )}
            </div>
          ) : activeTab === 'learn' ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-4xl mx-auto">
                <ReferenceLearningPanel
                  embeddedProjectCommands={finalEmbroideryCommands.commands}
                  embeddedProjectRegions={regions}
                  embeddedProjectName={project?.name}
                  onApplyLearnedConfig={(patch) => setConfig(c => ({ ...c, ...patch }))}
                />
              </div>
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
                  onAdjustParams={() => {setShowDecisionPanel(false);setEditorUiMode('lab');setActiveTab('editor');}}
                  onCancel={() => {setShowDecisionPanel(false);resetAI();}}
                />
              </div>
            </div>
          </div> :
          <div className="flex-1 overflow-hidden">
              <StitchCanvas imageUrl={imageUrl} regions={regions} selectedRegionId={selectedRegionId} onRegionClick={handleRegionClick} imageOpacity={imageOpacity} stitchOpacity={stitchOpacity} showFill={showFill} showContour={showContour} />
            </div>
          }

          {autoLearnedDiff && !processing && activeTab !== 'prof' &&
          <div className="border-t border-violet-500/30 bg-violet-900/15 px-4 py-2 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <div className="flex-1 text-[11px]">
              <span className="text-violet-300 font-bold">Aprendizaje del corpus aplicado automáticamente:</span>
              <span className="text-slate-400"> perfil </span>
              <span className="text-violet-300 font-bold">{autoLearnedDiff.profileName || '—'}</span>
              {autoLearnedDiff.confidence != null && (
                <span className="text-cyan-400 ml-1">({(autoLearnedDiff.confidence * 100).toFixed(0)}%)</span>
              )}
              <span className="text-slate-400"> · {autoLearnedDiff.diff?.filter(d => d.changed).length || 0} parámetros ajustados</span>
            </div>
            <button onClick={() => { setEditorUiMode('lab'); setActiveTab('prof'); }} className="text-[10px] text-violet-300 hover:text-white font-bold transition-colors">Ver cambios →</button>
            <button onClick={() => setAutoLearnedDiff(null)} className="p-1 rounded hover:bg-violet-900/30 text-slate-500 hover:text-white transition-colors">✕</button>
          </div>
          }

          {isLabMode && !focusMode && imageUrl && regions.length > 0 && pathMetrics?.metrics && !processing &&
          <div className="border-t border-[#1a1d27] p-2.5 flex items-center gap-4 bg-[#0a0c12] text-[11px]">
             <div className="flex-1 text-slate-400">
               Recorrido: <span className="text-cyan-400 font-bold">{pathMetrics.metrics.totalJumps} saltos</span>
               {' '}· <span className="text-amber-400 font-bold">{pathMetrics.metrics.totalDistance}mm</span>
               {' '}· <span className="text-violet-400 font-bold">{pathMetrics.metrics.colorChanges} cambios</span>
             </div>
             <div className="text-emerald-400 font-bold">{pathMetrics.machineTime.formatted}</div>
           </div>
          }

          {isLabMode && !focusMode && imageUrl && regions.length > 0 && !processing &&
          <div className="border-t border-[#1a1d27] px-3 py-1.5 flex items-center gap-3 bg-[#0a0c12] text-[10px]">
             <span className="text-cyan-300 font-bold">Debug de sincronización de comandos</span>
             <span className="text-slate-700">·</span>
             <span className="text-slate-600">Command source:</span>
             <span className="text-emerald-400 font-mono font-bold">finalEmbroideryCommands</span>
             <span className="text-slate-700">·</span>
             <span className="text-slate-600">Panels synced:</span>
             <span className="text-emerald-400 font-bold">YES</span>
             <span className="text-slate-700">·</span>
             <span className="text-slate-600">Metrics source:</span>
             <span className="text-emerald-400 font-bold">unified</span>
             <span className="text-slate-700">·</span>
             <span className="text-slate-600">Cmd version:</span>
             <span className="text-slate-400 font-mono">{commandVersion}</span>
             <span className="text-slate-700">·</span>
             <span className="text-slate-600">{unifiedMetrics.stitchCount} stitches</span>
             <span className="text-slate-600">{unifiedMetrics.jumpCount} jumps</span>
             <span className="text-slate-600">{unifiedMetrics.trimCount} trims</span>
             <span className="text-slate-600">{unifiedMetrics.colorCount} colors</span>
             <button
               onClick={handleRegenerateCommands}
               className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-violet-500/30 bg-violet-900/15 text-violet-300 hover:bg-violet-900/30 transition-colors"
             >
               <RefreshCw className="w-2.5 h-2.5" /> Regenerar
             </button>
           </div>
          }

          {processingError && !processing && regions.length === 0 &&
          <div className="border-t border-red-500/30 p-3 flex items-center gap-3 bg-red-900/20">
             <div className="flex-1 text-xs text-red-300">
               <span className="font-bold">No se pudo digitalizar:</span> {processingError}
               <div className="text-[10px] text-red-400 mt-0.5">Revisa la consola para más detalle. Si la imagen es simple, prueba el modo «standard».</div>
             </div>
             <button onClick={() => AI_ENABLED ? setShowDecisionPanel(true) : startProcessing()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors">
                <Zap className="w-3.5 h-3.5" /> Reintentar
              </button>
           </div>
          }

          {imageUrl && regions.length === 0 && !processing && !showDecisionPanel && !processingError &&
          <div className="border-t border-[#1a1d27] p-3 flex items-center gap-3 bg-[#0a0c12]">
             <div className="flex-1 text-xs text-slate-500">Imagen cargada. La IA analizará el mejor enfoque.</div>
             <button onClick={() => AI_ENABLED ? setShowDecisionPanel(true) : startProcessing()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors">
                <Zap className="w-3.5 h-3.5" /> Analizar con IA
              </button>
           </div>
          }
        </div>

        {isLabMode && !focusMode && (
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
        )}
      </div>

      {showExport && <ExportModal project={project} config={configWithDarkStroke} regions={regions} darkStroke={darkStroke} finalCommands={finalEmbroideryCommands.commands} finalObjects={finalEmbroideryCommands.objects} commandVersion={commandVersion} onClose={() => setShowExport(false)} />}
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