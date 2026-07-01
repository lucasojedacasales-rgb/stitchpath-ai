import { useState, useMemo } from 'react';
import { X, Download, Clock, Layers, Palette, FileText, ChevronRight, ShieldCheck, ShieldAlert, Bug, Wrench, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PreflightPanel from './PreflightPanel';
import ExportDebugPanel from './ExportDebugPanel';
import ExportFixWizard from './ExportFixWizard';
import ValidationPreview from './ValidationPreview';
import { runExportPipeline, encodeToFile } from '@/lib/exportPipeline';

const FORMATS = ['DST', 'PES', 'JEF', 'EXP'];

export default function ExportModal({ project, regions: initialRegions, onClose }) {
  const [step, setStep] = useState('preflight'); // 'preflight' | 'export'
  const [regions, setRegions] = useState(initialRegions || []);
  const [format, setFormat] = useState('DST');
  const [machine, setMachine] = useState('');
  const [speed, setSpeed] = useState(800);
  const [cuts, setCuts] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const [pipeline, setPipeline] = useState(null);
  const [fixAttempted, setFixAttempted] = useState(false);
  const [wizardResult, setWizardResult] = useState(null);

  const config = project?.config || {};
  const totalStitches = regions.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const colorsUsed = new Set(regions.map(r => r.color)).size;
  const estimatedMin = Math.ceil(totalStitches / (speed || 800));
  const widthMm  = config.width_mm  || 100;
  const heightMm = config.height_mm || 100;

  const machineSettings = {
    maxStitchLength: 12.1,
    maxJumpLength: 12.1,
    hoopSize: [widthMm, heightMm],
    designOffset: [0, 0],
    trimThreshold: 5.0,
  };

  // Run pipeline whenever regions/format change (memoized)
  const pipelineResult = useMemo(() => {
    return runExportPipeline(regions, config, machineSettings, format);
  }, [regions, format, widthMm, heightMm]);

  const handleExport = async () => {
    const commands = wizardResult?.commands || pipelineResult.commands;
    const objects = wizardResult?.objects || pipelineResult.objects;

    // GATE: block export if validation fails and no wizard result
    if (!pipelineResult.ready && !wizardResult) {
      setExportError('Exportación cancelada: el diseño no supera todas las validaciones. Usa el asistente de corrección.');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const blob = await encodeToFile(commands, objects, format, machineSettings, base44);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.name || 'design').replace(/[^a-zA-Z0-9_-]/g, '_')}.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      console.error(e);
      setExportError(e.message || 'Error al exportar el diseño');
    } finally {
      setExporting(false);
    }
  };

  const blockingErrors = pipelineResult.blockingErrors || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-[#161a23] border border-[#2a2d3a] rounded-xl shadow-2xl flex flex-col"
           style={{ width: step === 'preflight' ? 480 : step === 'wizard' ? 460 : (debugMode ? 640 : 400), maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2130] flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              {step === 'preflight'
                ? <ShieldCheck className="w-4 h-4 text-violet-400" />
                : step === 'wizard'
                  ? <Wrench className="w-4 h-4 text-cyan-400" />
                  : blockingErrors.length > 0 && !wizardResult
                    ? <ShieldAlert className="w-4 h-4 text-red-400" />
                    : <Download className="w-4 h-4 text-violet-400" />}
              <h2 className="text-sm font-bold text-white">
                {step === 'preflight' ? 'Pre-flight check' : step === 'wizard' ? 'Asistente de corrección' : 'Exportar diseño'}
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{project?.name}</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mr-4">
            {['preflight', 'wizard', 'export'].map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                  step === s ? 'bg-violet-600 border-violet-500 text-white' :
                  (step === 'wizard' && i === 0) || (step === 'export' && i <= 1) ? 'bg-emerald-900/40 border-emerald-500/40 text-emerald-400' :
                  'border-[#2a2d3a] text-slate-600'}`}>{i + 1}</div>
                {i < 2 && <ChevronRight className="w-3 h-3 text-slate-600" />}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a2d3a] text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 'preflight' ? (
            <div className="p-5">
              <PreflightPanel
                regions={regions}
                config={config}
                onAutoFix={setRegions}
                onOptimizeRoute={setRegions}
              />
            </div>
          ) : step === 'wizard' ? (
            <ExportFixWizard
              regions={regions}
              config={config}
              machineSettings={machineSettings}
              format={format}
              onComplete={(result) => {
                setWizardResult(result);
                setStep('export');
              }}
              onCancel={() => setStep('export')}
            />
          ) : (
            <div className="p-6 space-y-5">
              {/* Validation status banner */}
              {wizardResult && wizardResult.remainingErrors === 0 ? (
                <div className="bg-emerald-900/20 border border-emerald-500/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">Errores corregidos por el asistente</span>
                  </div>
                  <p className="text-[10px] text-emerald-300">
                    El asistente corrigió todos los errores bloqueantes. Puedes exportar con seguridad.
                  </p>
                </div>
              ) : blockingErrors.length > 0 ? (
                <div className="bg-red-900/20 border border-red-500/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400">Exportación BLOQUEADA</span>
                    <span className="text-[10px] text-red-300 ml-auto">{blockingErrors.length} errores</span>
                  </div>
                  {/* Auto-fix report — what was already repaired */}
                  {pipelineResult.stages.fixReport.applied.length > 0 && (
                    <div className="bg-emerald-900/15 border border-emerald-500/30 rounded px-2 py-1.5 mb-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Wrench className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400">
                          {pipelineResult.stages.fixReport.applied.length} errores auto-reparados
                        </span>
                      </div>
                      <div className="space-y-0.5 max-h-20 overflow-y-auto">
                        {pipelineResult.stages.fixReport.applied.slice(0, 6).map((f, i) => (
                          <div key={i} className="text-[9px] text-emerald-300 flex items-start gap-1">
                            <span className="font-bold text-emerald-400 shrink-0">[{f.rule}]</span>
                            <span>{f.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Remaining errors — require manual action */}
                  <div className="text-[10px] text-amber-400 mb-1.5 font-medium">
                    ⚠ {blockingErrors.length} error(es) requieren acción manual:
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {blockingErrors.slice(0, 8).map((e, i) => (
                      <div key={i} className="text-[10px] text-red-300 flex items-start gap-1">
                        <span className="font-bold text-red-400 shrink-0">[{e.rule}]</span>
                        <span>{e.message}</span>
                      </div>
                    ))}
                    {blockingErrors.length > 8 && (
                      <div className="text-[10px] text-red-400 italic">+{blockingErrors.length - 8} errores más... (ver Debug)</div>
                    )}
                  </div>
                  {/* Launch wizard button */}
                  <button
                    onClick={() => { setWizardResult(null); setStep('wizard'); }}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-600/30 transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Iniciar asistente de corrección
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-900/15 border border-emerald-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">Validación superada — 12 reglas OK</span>
                  </div>
                  {pipelineResult.stages.fixReport.applied.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Wrench className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-300">
                        {pipelineResult.stages.fixReport.applied.length} reparaciones automáticas aplicadas
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Visual preview — highlights problematic stitches in red */}
              <ValidationPreview
                commands={pipelineResult.commands}
                errors={blockingErrors}
                machineSettings={machineSettings}
                height={140}
              />

              {/* Debug toggle */}
              <button
                onClick={() => setDebugMode(!debugMode)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                  debugMode ? 'bg-violet-900/20 border-violet-500/40 text-violet-300' : 'bg-[#0d0f14] border-[#2a2d3a] text-slate-400 hover:text-slate-300'
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                Modo Debug: {debugMode ? 'ON' : 'OFF'}
                <ChevronRight className="w-3 h-3 ml-auto" />
              </button>

              {debugMode && (
                <ExportDebugPanel pipeline={pipelineResult} />
              )}

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: Layers,   label: 'Puntadas', value: totalStitches.toLocaleString(), color: 'text-violet-400' },
                  { icon: Palette,  label: 'Colores',  value: colorsUsed,                     color: 'text-cyan-400'   },
                  { icon: Clock,    label: 'Est. (min)',value: estimatedMin,                    color: 'text-emerald-400'},
                  { icon: FileText, label: 'Tamaño',   value: `${widthMm}×${heightMm}`,       color: 'text-amber-400'  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-[#0d0f14] rounded-lg p-2.5 text-center border border-[#1e2130]">
                    <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                    <div className={`text-sm font-bold ${color}`}>{value}</div>
                    <div className="text-[10px] text-slate-600">{label}</div>
                  </div>
                ))}
              </div>

              {/* Format */}
              <div>
                <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Formato de salida</label>
                <div className="grid grid-cols-4 gap-2">
                  {FORMATS.map(f => (
                    <button key={f} onClick={() => setFormat(f)}
                      className={`py-2 rounded-lg border text-xs font-bold transition-all ${
                        format === f ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#0d0f14] border-[#2a2d3a] text-slate-500 hover:text-slate-300 hover:border-[#3a3d4a]'
                      }`}>{f}</button>
                  ))}
                </div>
              </div>

              {/* Machine */}
              <div>
                <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Metadatos de máquina</label>
                <div className="space-y-2">
                  <input type="text" placeholder="Nombre de máquina (ej: Caydo CE01)"
                    value={machine} onChange={e => setMachine(e.target.value)}
                    className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-600 mb-1 block">Velocidad (RPM)</label>
                      <input type="number" min="400" max="1200" value={speed} onChange={e => setSpeed(Number(e.target.value))}
                        className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-600 mb-1 block">Cortes</label>
                      <input type="number" min="0" max="50" value={cuts} onChange={e => setCuts(Number(e.target.value))}
                        className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-[#1e2130] flex-shrink-0">
          {step === 'preflight' ? (
            <>
              <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-[#2a2d3a] text-slate-400 text-sm hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => setStep('export')}
                className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                Continuar
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : step === 'wizard' ? (
            <button onClick={() => setStep('export')} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3a] text-slate-400 text-sm hover:text-white transition-colors">
              ← Volver
            </button>
          ) : (
            <>
              <button onClick={() => setStep('preflight')} className="px-4 py-2.5 rounded-lg border border-[#2a2d3a] text-slate-400 text-sm hover:text-white transition-colors">
                ← Atrás
              </button>
              <div className="flex-1 space-y-2">
                {exportError && (
                  <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
                    {exportError}
                  </div>
                )}
                <button
                  onClick={handleExport}
                  disabled={exporting || (blockingErrors.length > 0 && !wizardResult)}
                  className={`w-full py-2.5 rounded-lg text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                    blockingErrors.length > 0 && !wizardResult
                      ? 'bg-red-900/40 border border-red-500/30 text-red-300 cursor-not-allowed'
                      : 'bg-violet-600 hover:bg-violet-500 disabled:opacity-50'
                  }`}
                >
                  {blockingErrors.length > 0 && !wizardResult ? (
                    <><ShieldAlert className="w-4 h-4" /> Exportación bloqueada</>
                  ) : exporting ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generando...</>
                  ) : wizardResult ? (
                    <><Download className="w-4 h-4" /> Exportar (corregido)</>
                  ) : (
                    <><Download className="w-4 h-4" /> Confirmar y exportar</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}