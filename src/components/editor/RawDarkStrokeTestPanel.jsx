import { useState, useRef, useEffect } from 'react';
import { Bug, Download, Image as ImageIcon, ShieldAlert } from 'lucide-react';
import { runRawDarkStrokeTest } from '@/lib/rawDarkStrokeTest';
import { buildDSTFromCommands } from '@/lib/dstDirectExport';

/**
 * RawDarkStrokeTestPanel — FULLY ISOLATED diagnostic for lower contour + feet.
 *
 * Uses ONLY the original image + a raw dark-stroke mask. Does NOT receive
 * finalEmbroideryCommands, regions, darkStroke, or contourObjects.
 *
 * If a finalCommands prop is ever passed, the test is blocked with
 * "TEST INVALID: using finalEmbroideryCommands".
 */
export default function RawDarkStrokeTestPanel({ project, config, finalCommands }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  // Hard source declaration — must be exactly this for the isolated test.
  const sourceUsed = {
    originalImage: true,
    darkStrokeMask: true,
    finalEmbroideryCommands: false,
    regionBoundaries: false,
    cachedContours: false,
  };

  const invalid = finalCommands !== undefined && finalCommands !== null;
  const ok =
    sourceUsed.originalImage &&
    sourceUsed.darkStrokeMask &&
    !sourceUsed.finalEmbroideryCommands &&
    !sourceUsed.regionBoundaries &&
    !sourceUsed.cachedContours &&
    !invalid;

  const handleRun = async () => {
    if (!ok) { setError('TEST INVALID: using finalEmbroideryCommands'); return; }
    if (!project?.image_url) { setError('No hay imagen original en el proyecto.'); return; }
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await runRawDarkStrokeTest(project.image_url, config);
      setResult(res);
    } catch (e) {
      setError(`Test failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!result || result.commands.length === 0) return;
    try {
      const { blob } = buildDSTFromCommands(result.commands, { label: 'RAW_DARK_LOWER_FEET', ce01Strict: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'RAW_DARK_LOWER_FEET_TEST.dst'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`DST failed: ${e.message}`);
    }
  };

  // Overlay render: original image + cyan mask + yellow filtered paths
  useEffect(() => {
    if (!result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width: W, height: H, originalData, mask, filteredPaths } = result;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // 1. original image
    ctx.putImageData(originalData, 0, 0);
    // 2. cyan mask overlay (semi-transparent)
    const overlay = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      if (mask[i]) {
        overlay.data[i * 4] = 34;       // R
        overlay.data[i * 4 + 1] = 211;  // G
        overlay.data[i * 4 + 2] = 238;  // B
        overlay.data[i * 4 + 3] = 140;  // A
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(overlay, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    // 3. yellow filtered paths
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (const path of filteredPaths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
  }, [result]);

  const d = result?.diagnostics;

  return (
    <div className="bg-[#0d0f14] border border-cyan-500/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Bug className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold text-cyan-300">DEBUG RAW dark stroke lower/feet</span>
      </div>

      {/* Source declaration */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <SourceRow label="originalImage" ok={sourceUsed.originalImage} />
        <SourceRow label="darkStrokeMask" ok={sourceUsed.darkStrokeMask} />
        <SourceRow label="finalEmbroideryCommands" ok={!sourceUsed.finalEmbroideryCommands} bad />
        <SourceRow label="regionBoundaries" ok={!sourceUsed.regionBoundaries} bad />
        <SourceRow label="cachedContours" ok={!sourceUsed.cachedContours} bad />
      </div>

      {invalid && (
        <div className="text-[10px] text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> TEST INVALID: using finalEmbroideryCommands
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={running || !ok}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-900/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold hover:bg-cyan-900/40 transition-colors disabled:opacity-50"
      >
        {running ? <div className="w-3.5 h-3.5 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
        {running ? 'Procesando imagen...' : 'Ejecutar test aislado'}
      </button>

      {error && (
        <div className="text-[10px] text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">{error}</div>
      )}

      {result && (
        <>
          <canvas ref={canvasRef} className="w-full bg-[#0d0f14] border border-[#1e2130] rounded-lg" />
          <div className="flex items-center gap-3 text-[9px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#22d3ee]"></span> Máscara</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#eab308]"></span> Paths exportados</span>
          </div>

          {/* Diagnostics */}
          <div className="bg-[#161a23] rounded-lg p-2.5 border border-[#1e2130] grid grid-cols-2 gap-1.5 text-[10px]">
            <Diag label="dark pixels" value={d?.darkPixelsCount} />
            <Diag label="components" value={d?.componentsCount} />
            <Diag label="lower comps" value={d?.lowerComponentsCount} />
            <Diag label="paths" value={d?.pathsCount} />
            <Diag label="exported paths" value={d?.exportedPaths} color={d?.exportedPaths > 0 ? 'text-emerald-400' : 'text-red-400'} />
            <Diag label="longest path" value={d?.longestPath + 'px'} />
            <Diag label="open paths" value={d?.openPaths} />
            <Diag label="process dims" value={d?.processDims} />
            <Diag label="scale" value={d?.scale} />
            <Diag label="transform" value={d?.coordinateTransform} />
            <Diag label="used finalCmds" value="false" color="text-emerald-400" />
            <Diag label="used regions" value="false" color="text-emerald-400" />
          </div>

          <button
            onClick={handleDownload}
            disabled={result.commands.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-900/30 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar DST (solo paths inferiores/pies)
          </button>

          <div className="text-[9px] text-slate-600 leading-relaxed">
            Si el overlay coincide con la imagen pero el DST sale mal → fallo en conversión path→puntadas (D).
            Si el overlay NO coincide → fallo en máscara/vectorización (A/B).
          </div>
        </>
      )}
    </div>
  );
}

function SourceRow({ label, ok, bad }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <span className="text-slate-400">{label}</span>
      <span className={`ml-auto font-bold ${bad ? (ok ? 'text-emerald-400' : 'text-red-400') : (ok ? 'text-emerald-400' : 'text-red-400')}`}>
        {bad ? (ok ? 'false' : 'TRUE') : (ok ? 'true' : 'false')}
      </span>
    </div>
  );
}

function Diag({ label, value, color }) {
  return (
    <div>
      <div className="text-[8px] text-slate-600 uppercase tracking-wider">{label}</div>
      <div className={`text-[11px] font-bold ${color || 'text-slate-300'}`}>{value ?? '—'}</div>
    </div>
  );
}