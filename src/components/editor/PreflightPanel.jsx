import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle, XCircle, Zap, RefreshCw,
  Clock, DollarSign, Palette, Maximize2, Info, Shield
} from 'lucide-react';
import { runQualityEngine, autoFixRegions } from '@/lib/qualityEngine';

// ── Constants ─────────────────────────────────────────────────────────────────
const MACHINE_SPM    = 800;
const EFFICIENCY     = 0.70;
const COLOR_CHANGE_S = 30;
const SPOOL_METERS   = 1000;
const COST_PER_SPOOL = 5.0;
const STAB_COST_M2   = 4.0;

// ── Thread color DB ───────────────────────────────────────────────────────────
const COLOR_NAMES = [
  { name: 'Negro', hex: '#000000', code: 'BLK-001' }, { name: 'Blanco', hex: '#ffffff', code: 'WHT-002' },
  { name: 'Rojo', hex: '#cc2222', code: 'RED-010' },  { name: 'Azul', hex: '#2244cc', code: 'BLU-020' },
  { name: 'Verde', hex: '#22aa44', code: 'GRN-030' }, { name: 'Amarillo', hex: '#eecc00', code: 'YLW-040' },
  { name: 'Naranja', hex: '#ee8800', code: 'ORG-050' },{ name: 'Rosa', hex: '#ee88aa', code: 'PNK-060' },
  { name: 'Morado', hex: '#8844cc', code: 'PRP-070' }, { name: 'Marrón', hex: '#884422', code: 'BRN-080' },
  { name: 'Gris', hex: '#888888', code: 'GRY-090' },  { name: 'Cian', hex: '#00ccdd', code: 'CYN-100' },
  { name: 'Dorado', hex: '#ccaa22', code: 'GLD-110' }, { name: 'Beige', hex: '#e8d8b0', code: 'BGE-120' },
];
function hexToRgb(hex) {
  const h = (hex || '000000').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function closestThread(hex) {
  const [r,g,b] = hexToRgb(hex);
  let best = COLOR_NAMES[0], bestD = Infinity;
  for (const c of COLOR_NAMES) {
    const [cr,cg,cb] = hexToRgb(c.hex);
    const d = (r-cr)**2+(g-cg)**2+(b-cb)**2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
function buildReport(regions, config) {
  const visible = (regions || []).filter(r => r.visible !== false);
  const total = visible.reduce((s,r) => s+(r.stitch_count||0), 0);
  let cc = 0;
  for (let i=1;i<visible.length;i++) if (visible[i].color!==visible[i-1].color) cc++;
  const stitchSecs = total/(MACHINE_SPM*EFFICIENCY);
  const changeSecs = cc*COLOR_CHANGE_S;
  const totalMins  = (stitchSecs+changeSecs)/60;
  const metersNeeded = total*2.5/1000+cc*2;
  const threadCost = (metersNeeded/SPOOL_METERS)*COST_PER_SPOOL;
  const w=(config?.width_mm||100)/1000, h=(config?.height_mm||100)/1000;
  const stabCost = w*h*STAB_COST_M2;
  const uniqueColors = [...new Set(visible.map(r=>r.color))];
  const threads = uniqueColors.map(hex=>({hex,...closestThread(hex)}));
  return { totalStitches:total, colorChanges:cc, totalMins, threadCost, stabCost, totalCost:threadCost+stabCost, threads, metersNeeded };
}
function fmtMins(m) {
  if (m<1) return `${Math.round(m*60)}s`;
  if (m<60) return `${Math.round(m)} min`;
  return `${Math.floor(m/60)}h ${Math.round(m%60)}min`;
}

// ── Quality Score Ring ────────────────────────────────────────────────────────
function QualityRing({ score, grade }) {
  const radius = 36, circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;
  const colorMap = {
    emerald: { stroke: '#10b981', text: 'text-emerald-400', bg: 'bg-emerald-950/30 border-emerald-500/30' },
    cyan:    { stroke: '#06b6d4', text: 'text-cyan-400',    bg: 'bg-cyan-950/30 border-cyan-500/30' },
    amber:   { stroke: '#f59e0b', text: 'text-amber-400',   bg: 'bg-amber-950/30 border-amber-500/30' },
    orange:  { stroke: '#f97316', text: 'text-orange-400',  bg: 'bg-orange-950/30 border-orange-500/30' },
    red:     { stroke: '#ef4444', text: 'text-red-400',     bg: 'bg-red-950/20 border-red-500/30' },
  };
  const c = colorMap[grade.color] || colorMap.amber;
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 ${c.bg}`}>
      <div className="relative w-[88px] h-[88px] flex-shrink-0">
        <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
          <circle cx="44" cy="44" r={radius} fill="none" stroke="#1e2130" strokeWidth="8" />
          <circle cx="44" cy="44" r={radius} fill="none" stroke={c.stroke} strokeWidth="8"
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-black ${c.text}`}>{score}</span>
          <span className={`text-[10px] font-bold ${c.text}`}>{grade.letter}</span>
        </div>
      </div>
      <div>
        <div className={`text-base font-bold ${c.text}`}>Quality Score</div>
        <div className={`text-sm font-semibold ${c.text} opacity-80`}>{grade.label}</div>
        <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Puntuación de calidad<br />antes de exportar
        </div>
      </div>
    </div>
  );
}

// ── Check Row ─────────────────────────────────────────────────────────────────
function CheckRow({ check }) {
  const [open, setOpen] = useState(false);
  const cfg = {
    error:   { icon: <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />, border: 'border-red-500/20 bg-red-950/20', text: 'text-red-300' },
    warning: { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />, border: 'border-amber-500/20 bg-amber-950/10', text: 'text-amber-300' },
    info:    { icon: <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />, border: 'border-blue-500/10 bg-blue-950/10', text: 'text-blue-300' },
  }[check.severity] || {};

  return (
    <div className={`rounded-lg border ${cfg.border} overflow-hidden`}>
      <button onClick={() => check.detail && setOpen(o => !o)} className="w-full flex items-start gap-2 px-3 py-2 text-left">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-medium ${cfg.text}`}>{check.label}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {check.autoFixable && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/30 border border-violet-500/30 text-violet-400">auto-fix</span>}
          {check.penalty > 0 && <span className="text-[9px] text-slate-600 font-mono">-{check.penalty}pts</span>}
        </div>
      </button>
      {open && check.detail && (
        <div className="px-3 pb-2.5 border-t border-[#1e2130] pt-2 space-y-1.5">
          <p className="text-[10px] text-slate-400">{check.detail}</p>
          {check.fix && <p className="text-[10px] text-violet-400">→ {check.fix}</p>}
          {check.regions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {check.regions.slice(0,4).map((r,i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-[#161a23] border border-[#2a2d3a] text-[9px] text-slate-500">{r}</span>
              ))}
              {check.regions.length > 4 && <span className="text-[10px] text-slate-600">+{check.regions.length-4}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PreflightPanel({ regions, config, onAutoFix, onOptimizeRoute }) {
  const [localRegions, setLocalRegions] = useState(null);
  const activeRegions = localRegions || regions;

  const quality = useMemo(() => runQualityEngine(activeRegions, config), [activeRegions, config]);
  const report  = useMemo(() => buildReport(activeRegions, config), [activeRegions, config]);

  const hasErrors = quality.summary.errorCount > 0;
  const hasIssues = quality.summary.errorCount + quality.summary.warningCount > 0;

  const errors   = quality.checks.filter(c => c.severity === 'error');
  const warnings = quality.checks.filter(c => c.severity === 'warning');
  const infos    = quality.checks.filter(c => c.severity === 'info');

  const handleAutoFix = () => {
    const fixed = autoFixRegions(activeRegions);
    setLocalRegions(fixed);
    onAutoFix?.(fixed);
  };

  const handleOptimize = () => {
    const sorted = [...activeRegions].sort((a,b) => {
      if (a.color < b.color) return -1;
      if (a.color > b.color) return 1;
      return (a.layer_order||0) - (b.layer_order||0);
    });
    setLocalRegions(sorted);
    onOptimizeRoute?.(sorted);
  };

  return (
    <div className="space-y-4">

      {/* Quality Score Ring */}
      <QualityRing score={quality.qualityScore} grade={quality.grade} />

      {/* Summary stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Puntadas', value: (quality.summary.totalStitches||0).toLocaleString(), color: 'text-violet-400' },
          { label: 'Colores',  value: quality.summary.uniqueColors||0,                      color: 'text-cyan-400' },
          { label: 'Saltos',   value: `~${quality.summary.estimatedJumps||0}`,              color: 'text-amber-400' },
          { label: 'Cortes',   value: `~${quality.summary.estimatedCuts||0}`,               color: 'text-rose-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-2 text-center">
            <div className={`text-sm font-bold ${color}`}>{value}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Auto-fix + Optimize */}
      {(quality.autoFixCount > 0 || hasIssues) && (
        <div className="flex gap-2">
          {quality.autoFixCount > 0 && (
            <button onClick={handleAutoFix}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-colors">
              <Zap className="w-3.5 h-3.5" /> Auto-fix ({quality.autoFixCount})
            </button>
          )}
          <button onClick={handleOptimize}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 text-cyan-400 text-xs font-semibold transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Optimizar ruta
          </button>
        </div>
      )}

      {/* Checks */}
      {quality.checks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">
            Validaciones ({quality.checks.length})
          </div>
          {errors.map((c,i)   => <CheckRow key={c.code+i} check={c} />)}
          {warnings.map((c,i) => <CheckRow key={c.code+i} check={c} />)}
          {infos.map((c,i)    => <CheckRow key={c.code+i} check={c} />)}
        </div>
      )}

      {/* Recommendations */}
      {quality.recommendations.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">Recomendaciones</div>
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg divide-y divide-[#1a1d27]">
            {quality.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2">
                <Shield className="w-3 h-3 text-violet-400 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-400">{rec.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Production report */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">Reporte de producción</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Tiempo</span>
            </div>
            <div className="text-lg font-bold text-violet-300">{fmtMins(report.totalMins)}</div>
            <div className="text-[10px] text-slate-600">{report.colorChanges} cambios de hilo</div>
          </div>
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Materiales</span>
            </div>
            <div className="text-lg font-bold text-emerald-300">${report.totalCost.toFixed(2)}</div>
            <div className="text-[10px] text-slate-600">Hilo + estabilizador</div>
          </div>
        </div>

        {/* Thread colors */}
        <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Hilos ({report.threads.length})</span>
            <span className="text-[10px] text-slate-600 ml-auto">{report.metersNeeded.toFixed(0)}m · {Math.ceil(report.metersNeeded/SPOOL_METERS)} carrete{Math.ceil(report.metersNeeded/SPOOL_METERS)>1?'s':''}</span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {report.threads.map((t,i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white/10 flex-shrink-0" style={{background:t.hex}} />
                <span className="text-[10px] text-slate-300 flex-1">{t.name}</span>
                <span className="text-[10px] text-slate-600 font-mono">{t.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hoop */}
        {(() => {
          const w=config?.width_mm||100, h=config?.height_mm||100;
          const hoop = w<=100&&h<=100 ? '100×100mm (Mini)' : w<=150&&h<=150 ? '150×150mm (Estándar)' : w<=200&&h<=200 ? '200×200mm (Mediano)' : w<=300&&h<=300 ? '300×300mm (Grande)' : 'Aro jumbo requerido';
          const col  = (w>300||h>300) ? 'text-amber-400' : 'text-slate-300';
          return (
            <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg px-3 py-2 flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] text-slate-500">Aro sugerido:</span>
              <span className={`text-[10px] font-semibold ${col}`}>{hoop}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}