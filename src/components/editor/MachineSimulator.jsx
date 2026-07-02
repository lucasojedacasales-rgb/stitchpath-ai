import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw, Zap, Scissors,
  Palette, Flag, AlertTriangle, MapPin, Navigation, Gauge, Layers,
  Flame, Grid2x2, ShieldCheck, ShieldAlert, Bug, Eye, Activity,
  EyeOff, Route,
} from 'lucide-react';
import { buildStitchObjects, flattenToCommands, DEFAULT_MACHINE } from '@/lib/exportPipeline';
import { analyzeSimulation } from '@/lib/simulationMetrics';
import {
  buildSimulationBlocks,
  renderSimulationOverlay,
  DEFAULT_SIMULATION_SETTINGS,
} from '@/lib/stitchSimulation';

const TYPE_META = {
  stitch:      { label: 'Puntada',  color: '#a78bfa', icon: Zap },
  jump:        { label: 'Salto',    color: '#64748b', icon: SkipForward },
  trim:        { label: 'Corte',    color: '#fbbf24', icon: Scissors },
  colorChange: { label: 'C.color',  color: '#22d3ee', icon: Palette },
  end:         { label: 'Fin',      color: '#34d399', icon: Flag },
};

/**
 * MachineSimulator — professional embroidery simulation with clean visual layers.
 *
 * Uses buildSimulationBlocks + renderSimulationOverlay for region-clipped,
 * realistic thread rendering. Supports normal mode (clean) and debug mode
 * (jumps, path, warnings, block indices).
 */
export default function MachineSimulator({ regions, config, machineSettings, onRegionsRepaired, exportGate }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const ms = { ...DEFAULT_MACHINE, ...machineSettings };
  const w = config.width_mm || 100;
  const h = config.height_mm || 100;

  // ── Build command sequence + analysis + simulation blocks (memoized) ──────
  const { commands, analysis, simData } = useMemo(() => {
    const objs = buildStitchObjects(regions, config);
    const cmds = flattenToCommands(objs, ms);
    const sim = analyzeSimulation(cmds, objs, ms);
    const blocks = buildSimulationBlocks(cmds, regions, { width_mm: w, height_mm: h });
    return { commands: cmds, analysis: sim, simData: blocks };
  }, [regions, config, ms.maxStitchLength, ms.maxJumpLength, ms.trimThreshold, ms.designOffset, w, h]);

  // ── Projection bounds ─────────────────────────────────────────────────────
  const projection = useMemo(() => {
    if (commands.length === 0) return null;
    let minX = -w / 2, maxX = w / 2, minY = -h / 2, maxY = h / 2;
    for (const c of commands) {
      if (c.x === undefined || !Number.isFinite(c.x)) continue;
      if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
    }
    return { minX, maxX, minY, maxY };
  }, [commands, w, h]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [showHoop, setShowHoop] = useState(true);
  const [simSettings, setSimSettings] = useState(DEFAULT_SIMULATION_SETTINGS);
  const [renderReport, setRenderReport] = useState(null);

  useEffect(() => { setCurrentIndex(0); setIsPlaying(false); }, [commands]);

  // ── Playback loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const loop = (now) => {
      const dt = now - last; last = now;
      const advance = Math.max(1, Math.round(speed * (dt / 16)));
      setCurrentIndex((prev) => {
        const next = prev + advance;
        if (next >= commands.length - 1) { setIsPlaying(false); return commands.length - 1; }
        return next;
      });
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, speed, commands.length]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !projection || !simData) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;

    // Background
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, cw, ch);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < cw; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke(); }
    for (let gy = 0; gy < ch; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke(); }

    // Projection
    const { minX, maxX, minY, maxY } = projection;
    const dataW = maxX - minX, dataH = maxY - minY;
    const scale = Math.min((cw - 60) / dataW, (ch - 60) / dataH);
    const offX = (cw - dataW * scale) / 2 - minX * scale;
    const offY = (ch - dataH * scale) / 2 - minY * scale;
    const toX = (x) => offX + x * scale;
    const toY = (y) => offY + y * scale;

    // Hoop boundary
    if (showHoop) {
      ctx.strokeStyle = 'rgba(124,58,237,0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(toX(-w / 2), toY(-h / 2), w * scale, h * scale);
      ctx.setLineDash([]);
    }

    // ── Main simulation render ──────────────────────────────────────────────
    const heatMap = simSettings.showDensityHeatmap ? analysis.heatMap : null;
    const report = renderSimulationOverlay(
      ctx, simData, currentIndex, simSettings,
      { toX, toY, scale }, heatMap
    );
    setRenderReport(report);

    // ── Needle at current position ──────────────────────────────────────────
    const curCmd = commands[currentIndex];
    if (curCmd && curCmd.x !== undefined && Number.isFinite(curCmd.x)) {
      const nx = toX(curCmd.x), ny = toY(curCmd.y);

      // Glow
      const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, 14);
      grd.addColorStop(0, 'rgba(124,58,237,0.7)');
      grd.addColorStop(1, 'rgba(124,58,237,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(nx - 14, ny - 14, 28, 28);

      // Needle dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(nx, ny, 3.5, 0, Math.PI * 2); ctx.fill();

      // Crosshair
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nx - 9, ny); ctx.lineTo(nx + 9, ny);
      ctx.moveTo(nx, ny - 9); ctx.lineTo(nx, ny + 9);
      ctx.stroke();
    }
  }, [commands, currentIndex, projection, simData, simSettings, analysis, w, h, showHoop]);

  useEffect(() => { draw(); }, [draw]);

  // ── Current info ───────────────────────────────────────────────────────────
  const curPC = analysis.perCommand[currentIndex];
  const curCmd = commands[currentIndex];
  const curBlock = renderReport?.currentBlock;
  const progress = commands.length > 1 ? Math.round((currentIndex / (commands.length - 1)) * 100) : 0;

  // Live stats up to currentIndex
  const liveStats = useMemo(() => {
    let stitches = 0, jumps = 0, trims = 0, colorChanges = 0;
    for (let i = 0; i <= currentIndex && i < commands.length; i++) {
      const c = commands[i];
      if (c.type === 'stitch') stitches++;
      if (c.type === 'jump') jumps++;
      if (c.type === 'trim') trims++;
      if (c.type === 'colorChange') colorChanges++;
    }
    return { stitches, jumps, trims, colorChanges };
  }, [commands, currentIndex]);

  const handlePlay = () => { if (currentIndex >= commands.length - 1) setCurrentIndex(0); setIsPlaying(true); };
  const handleStepFwd = () => { setIsPlaying(false); setCurrentIndex((i) => Math.min(i + 1, commands.length - 1)); };
  const handleStepBack = () => { setIsPlaying(false); setCurrentIndex((i) => Math.max(i - 1, 0)); };
  const handleReset = () => { setIsPlaying(false); setCurrentIndex(0); };

  const toggleSetting = (key) => setSimSettings(s => ({ ...s, [key]: !s[key] }));
  const isDebugMode = simSettings.showDebugPath;

  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Zap className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400 font-medium">No hay caminos de costura</p>
        <p className="text-[11px] text-slate-600 mt-1">Procesa la imagen para generar regiones primero</p>
      </div>
    );
  }

  const typeMeta = TYPE_META[curCmd?.type] || { label: '—', color: '#64748b', icon: AlertTriangle };
  const TypeIcon = typeMeta.icon;
  const statusColor = analysis.status === 'SAFE' ? 'emerald' : analysis.status === 'RISKY' ? 'amber' : 'red';
  const visStats = simData.stats;

  return (
    <div className="flex flex-col h-full">
      {/* Canvas */}
      <div className="flex-1 relative bg-[#0a0c12] min-h-0">
        <canvas ref={canvasRef} width={800} height={500} className="w-full h-full" />

        {/* Current command badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d0f14] border border-[#2a2d3a]">
          <TypeIcon className="w-3.5 h-3.5" style={{ color: typeMeta.color }} />
          <span className="text-xs font-bold" style={{ color: typeMeta.color }}>{typeMeta.label}</span>
          <span className="text-[10px] text-slate-500 ml-1">#{currentIndex + 1}/{commands.length}</span>
          {curPC?.tiePhase && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-400 border border-cyan-500/30 font-bold">
              {curPC.tiePhase}
            </span>
          )}
        </div>

        {/* Needle info HUD — top right */}
        {curPC && curPC.x !== null && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 px-3 py-2 rounded-lg bg-[#0d0f14] border border-[#2a2d3a] min-w-[140px]">
            <div className="flex items-center gap-1.5 text-[10px]">
              <MapPin className="w-3 h-3 text-violet-400" />
              <span className="text-slate-400">Pos:</span>
              <span className="text-white font-mono">{curPC.x.toFixed(1)}, {curPC.y.toFixed(1)}mm</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <Navigation className="w-3 h-3 text-cyan-400" />
              <span className="text-slate-400">Dir:</span>
              <span className="text-white font-mono">{curPC.direction !== null ? `${curPC.direction}°` : '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <Activity className="w-3 h-3 text-amber-400" />
              <span className="text-slate-400">Long:</span>
              <span className="text-white font-mono">{curPC.length}mm</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <Gauge className="w-3 h-3 text-emerald-400" />
              <span className="text-slate-400">Vel:</span>
              <span className="text-white font-mono">{curPC.speedMmS}mm/s</span>
            </div>
            {curBlock && (
              <>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <Layers className="w-3 h-3 text-violet-400" />
                  <span className="text-slate-400">Bloque:</span>
                  <span className="text-white font-mono">B{curBlock.blockId}</span>
                  <span className={`px-1 rounded text-[8px] ${curBlock.isContour ? 'text-cyan-400 bg-cyan-900/20' : 'text-violet-400 bg-violet-900/20'}`}>
                    {curBlock.isContour ? 'contour' : 'fill'}
                  </span>
                </div>
                {curBlock.regionName && (
                  <div className="text-[9px] text-slate-500 truncate max-w-[130px]">{curBlock.regionName}</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Error markers for current command */}
        {curPC?.errors?.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-col gap-1 max-w-[260px]">
            {curPC.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/50 border border-red-500/40">
                <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-bold text-red-300">[{e.rule}] {e.severity}</div>
                  <div className="text-[9px] text-red-400/80">{e.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Status badge */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d0f14] border border-[#2a2d3a]">
          {analysis.status === 'SAFE'
            ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            : <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
          <span className="text-xs font-bold text-white">{analysis.qualityScore}/100</span>
        </div>

        {/* Simulation settings toggles — right side */}
        <div className="absolute top-1/2 -translate-y-1/2 right-3 flex flex-col gap-1">
          <SimToggle active={simSettings.realisticThreadPreview} onClick={() => toggleSetting('realisticThreadPreview')} icon={Eye} label="Hilo" />
          <SimToggle active={simSettings.showJumps} onClick={() => toggleSetting('showJumps')} icon={Route} label="Saltos" />
          <SimToggle active={simSettings.showTrims} onClick={() => toggleSetting('showTrims')} icon={Scissors} label="Trims" />
          <SimToggle active={simSettings.showWarnings} onClick={() => toggleSetting('showWarnings')} icon={AlertTriangle} label="Avisos" />
          <SimToggle active={simSettings.showDensityHeatmap} onClick={() => toggleSetting('showDensityHeatmap')} icon={Flame} label="Dens" />
          <SimToggle active={simSettings.showCurrentBlockOnly} onClick={() => toggleSetting('showCurrentBlockOnly')} icon={Layers} label="Bloque" />
          <SimToggle active={showHoop} onClick={() => setShowHoop(!showHoop)} icon={Grid2x2} label="Hoop" />
          <SimToggle active={isDebugMode} onClick={() => toggleSetting('showDebugPath')} icon={Bug} label="Debug" />
        </div>
      </div>

      {/* Live stats bar */}
      <div className="flex-shrink-0 grid grid-cols-6 gap-1 px-3 py-1.5 border-t border-[#1e2130] bg-[#0a0c12]">
        <LiveStat label="Puntadas" value={liveStats.stitches} color="text-violet-400" />
        <LiveStat label="Saltos" value={liveStats.jumps} color="text-slate-300" />
        <LiveStat label="Trims" value={liveStats.trims} color="text-amber-400" />
        <LiveStat label="C.color" value={liveStats.colorChanges} color="text-cyan-400" />
        <LiveStat label="Fuera región" value={visStats.stitchesOutsideRegion} color={visStats.stitchesOutsideRegion > 0 ? 'text-orange-400' : 'text-emerald-400'} />
        <LiveStat label="Duplicados" value={visStats.duplicateStitches} color={visStats.duplicateStitches > 0 ? 'text-orange-400' : 'text-emerald-400'} />
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-[#1e2130] bg-[#0a0c12]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">Progreso de costura</span>
          <span className="text-[10px] text-violet-400 font-bold">{progress}%</span>
        </div>
        <input
          type="range" min={0} max={commands.length - 1} value={currentIndex}
          onChange={(e) => { setIsPlaying(false); setCurrentIndex(Number(e.target.value)); }}
          className="w-full accent-violet-600"
        />
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-t border-[#1e2130] bg-[#0a0c12]">
        <button onClick={handleReset} className="p-2 rounded-lg border border-[#2a2d3a] text-slate-400 hover:text-white hover:border-[#3a3d4a] transition-colors" title="Reiniciar">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button onClick={handleStepBack} disabled={currentIndex === 0} className="p-2 rounded-lg border border-[#2a2d3a] text-slate-400 hover:text-white hover:border-[#3a3d4a] transition-colors disabled:opacity-30" title="Paso atrás">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={() => isPlaying ? setIsPlaying(false) : handlePlay()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors">
          {isPlaying ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Simular costura</>}
        </button>
        <button onClick={handleStepFwd} disabled={currentIndex >= commands.length - 1} className="p-2 rounded-lg border border-[#2a2d3a] text-slate-400 hover:text-white hover:border-[#3a3d4a] transition-colors disabled:opacity-30" title="Paso adelante">
          <SkipForward className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 ml-1">
          <span className="text-[10px] text-slate-600">Vel</span>
          {[1, 5, 15, 50].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${speed === s ? 'bg-violet-900/40 text-violet-300 border border-violet-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimToggle({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
        active ? 'bg-violet-900/30 border-violet-500/40 text-violet-300' : 'bg-[#0d0f14] border-[#2a2d3a] text-slate-500 hover:text-slate-300'
      }`}>
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function LiveStat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[8px] text-slate-600 uppercase tracking-wider truncate">{label}</div>
    </div>
  );
}