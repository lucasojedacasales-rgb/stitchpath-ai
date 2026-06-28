import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Eye, EyeOff } from 'lucide-react';

export default function NeedleTraceSimulator({ imageUrl, regions, sequence, config }) {
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showRegions, setShowRegions] = useState(true);
  const [showPath, setShowPath] = useState(true);
  const [showStitches, setShowStitches] = useState(false);
  const animationRef = useRef(null);

  const processedSequence = sequence?.length > 0 ? sequence : regions || [];
  const totalSteps = Math.max(processedSequence.length, 1);

  // Cargar imagen original
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / img.width, rect.height / img.height);
      
      canvas.width = rect.width;
      canvas.height = rect.height;

      drawSimulation(canvas, img, scale);
    };
    img.src = imageUrl;
  }, [imageUrl, regions, sequence, progress, showRegions, showPath, showStitches, config]);

  // Loop de animación
  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = Date.now();
    const tick = () => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      setProgress(prev => {
        const newProgress = prev + (delta / 1000) * (speed / 2);
        if (newProgress >= totalSteps) {
          setIsPlaying(false);
          return totalSteps - 1;
        }
        return newProgress;
      });

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, speed, totalSteps]);

  function drawSimulation(canvas, img, scale) {
    const ctx = canvas.getContext('2d');
    const w = img.width * scale;
    const h = img.height * scale;
    const offsetX = (canvas.width - w) / 2;
    const offsetY = (canvas.height - h) / 2;

    // Limpiar
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar imagen de fondo
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(img, offsetX, offsetY, w, h);
    ctx.restore();

    const screenCentroid = (r) => [
      offsetX + (r.centroid?.[0] || 0.5) * w,
      offsetY + (r.centroid?.[1] || 0.5) * h,
    ];

    const currentIndex = Math.floor(progress);
    const indexProgress = progress - currentIndex;

    // 1. Dibujar regiones completadas
    if (showRegions) {
      for (let i = 0; i < currentIndex && i < processedSequence.length; i++) {
        const region = processedSequence[i];
        drawRegion(ctx, region, w, h, offsetX, offsetY, 0.5);
      }

      // Región actual (semi-visible)
      if (currentIndex < processedSequence.length) {
        const region = processedSequence[currentIndex];
        drawRegion(ctx, region, w, h, offsetX, offsetY, 0.3 + 0.2 * indexProgress);
      }
    }

    // 2. Dibujar líneas de recorrido
    if (showPath && processedSequence.length > 0) {
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      let prevPos = [offsetX + w * 0.5, offsetY + h * 0.5]; // esquina media
      for (let i = 0; i <= Math.min(currentIndex, processedSequence.length - 1); i++) {
        const region = processedSequence[i];
        const pos = screenCentroid(region);

        ctx.beginPath();
        ctx.moveTo(prevPos[0], prevPos[1]);
        ctx.lineTo(pos[0], pos[1]);
        ctx.stroke();

        // Número de orden
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, pos[0], pos[1] - 20);

        prevPos = pos;
      }

      // Línea hasta región actual (en progreso)
      if (currentIndex < processedSequence.length) {
        const region = processedSequence[currentIndex];
        const pos = screenCentroid(region);

        ctx.strokeStyle = `rgba(168, 85, 247, ${0.8 * indexProgress})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(prevPos[0], prevPos[1]);
        ctx.lineTo(pos[0], pos[1]);
        ctx.stroke();

        // Punto animado
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(
          prevPos[0] + (pos[0] - prevPos[0]) * indexProgress,
          prevPos[1] + (pos[1] - prevPos[1]) * indexProgress,
          5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.setLineDash([]);
    }

    // 3. Información de región actual
    if (currentIndex < processedSequence.length) {
      const region = processedSequence[currentIndex];
      const pos = screenCentroid(region);

      // Tooltip
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.lineWidth = 1.5;
      const tooltipWidth = 220;
      const tooltipHeight = 70;
      const tx = Math.min(pos[0] + 20, canvas.width - tooltipWidth - 10);
      const ty = Math.max(pos[1] + 20, tooltipHeight + 10);

      ctx.beginPath();
      ctx.roundRect(tx, ty - tooltipHeight, tooltipWidth, tooltipHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(`Región ${currentIndex + 1}: ${region.name || 'sin nombre'}`, tx + 10, ty - 50);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter';
      ctx.fillText(`Color: ${region.color}`, tx + 10, ty - 35);
      ctx.fillText(`Tipo: ${region.stitch_type}`, tx + 10, ty - 22);
    }

    // Indicador de progreso
    drawProgressBar(ctx, progress, totalSteps, canvas.width, canvas.height);
  }

  function drawRegion(ctx, region, w, h, offsetX, offsetY, alpha) {
    if (!region.path_points || region.path_points.length < 3) return;

    ctx.fillStyle = region.color || '#888888';
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    for (const [px, py] of region.path_points) {
      const screenX = offsetX + px * w;
      const screenY = offsetY + py * h;
      if (region.path_points.indexOf([px, py]) === 0) {
        ctx.moveTo(screenX, screenY);
      } else {
        ctx.lineTo(screenX, screenY);
      }
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function drawProgressBar(ctx, prog, total, width, height) {
    const barHeight = 6;
    const barY = height - 20;
    const barWidth = width - 40;
    const barX = 20;

    // Fondo
    ctx.fillStyle = 'rgba(30, 33, 48, 0.8)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Progreso
    const fillWidth = (prog / total) * barWidth;
    const gradient = ctx.createLinearGradient(barX, 0, barX + fillWidth, 0);
    gradient.addColorStop(0, '#7c3aed');
    gradient.addColorStop(1, '#06b6d4');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, fillWidth, barHeight);

    // Borde
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Texto
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(`${currentIndex + 1}/${totalSteps}`, barX, barY - 8);
  }

  const currentIndex = Math.floor(progress);

  return (
    <div className="flex flex-col h-full bg-[#0a0c12]">
      {/* Canvas de simulación */}
      <div className="flex-1 flex items-center justify-center border-b border-[#1e2130] bg-[#0d0f14] overflow-hidden">
        {imageUrl ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full"
            style={{ maxHeight: '100%' }}
          />
        ) : (
          <div className="text-slate-500 text-sm">Carga una imagen para ver la simulación</div>
        )}
      </div>

      {/* Controles */}
      <div className="p-4 space-y-3 border-t border-[#1e2130] bg-[#0a0c12]">
        {/* Botones de control */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded hover:bg-[#1a1d27] transition-colors text-violet-400 hover:text-violet-300"
            title={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setProgress(0)}
            className="p-2 rounded hover:bg-[#1a1d27] transition-colors text-slate-400 hover:text-slate-300"
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-2">
            <input
              type="range"
              min="0"
              max={totalSteps - 1}
              value={progress}
              onChange={(e) => {
                setProgress(Number(e.target.value));
                setIsPlaying(false);
              }}
              className="flex-1 h-1 bg-[#1a1d27] rounded cursor-pointer accent-violet-500"
            />
            <span className="text-[10px] text-slate-500 min-w-fit">
              {currentIndex + 1}/{totalSteps}
            </span>
          </div>
        </div>

        {/* Slider de velocidad */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 w-12">Velocidad:</span>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="flex-1 h-1 bg-[#1a1d27] rounded cursor-pointer accent-cyan-500"
          />
          <span className="text-[10px] text-cyan-400 min-w-fit w-8">{speed.toFixed(2)}x</span>
        </div>

        {/* Toggles de visualización */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowRegions(!showRegions)}
            className={`px-2.5 py-1.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1.5 ${
              showRegions
                ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                : 'bg-slate-800/30 text-slate-400 border border-slate-500/20'
            }`}
          >
            {showRegions ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Regiones
          </button>

          <button
            onClick={() => setShowPath(!showPath)}
            className={`px-2.5 py-1.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1.5 ${
              showPath
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800/30 text-slate-400 border border-slate-500/20'
            }`}
          >
            {showPath ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Recorrido
          </button>

          <button
            onClick={() => setShowStitches(!showStitches)}
            className={`px-2.5 py-1.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1.5 ${
              showStitches
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800/30 text-slate-400 border border-slate-500/20'
            }`}
            disabled
            title="Próximamente"
          >
            {showStitches ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Puntadas
          </button>
        </div>

        {/* Información */}
        {processedSequence.length > 0 && currentIndex < processedSequence.length && (
          <div className="p-2 bg-[#161a23] border border-[#2a2d3a] rounded text-[10px] text-slate-300">
            <div>
              <strong>Región {currentIndex + 1}:</strong> {processedSequence[currentIndex].name || 'sin nombre'}
            </div>
            <div>
              Color: {processedSequence[currentIndex].color} · Tipo:{' '}
              {processedSequence[currentIndex].stitch_type}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}