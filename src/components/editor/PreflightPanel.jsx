import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Zap, RefreshCw, Clock, DollarSign, Palette, Maximize2 } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_DENSITY    = 2.0;   // pts/mm — needle break risk
const MAX_STITCH_MM  = 12.1;  // mm — machine limit
const MAX_JUMP_MM    = 12.1;  // mm — will become trim
const OVERLAP_THRESH = 0.10;  // 10% bounding-box overlap
const SPOOL_METERS   = 1000;  // metres per standard spool
const COST_PER_SPOOL = 5.0;   // USD
const STAB_COST_M2   = 4.0;   // USD per m²
const MACHINE_SPM    = 800;
const EFFICIENCY     = 0.70;
const COLOR_CHANGE_S = 30;

// ── Thread color names DB (small) ─────────────────────────────────────────────
const COLOR_NAMES = [
  { name: 'Negro',    hex: '#000000', code: 'BLK-001' },
  { name: 'Blanco',   hex: '#ffffff', code: 'WHT-002' },
  { name: 'Rojo',     hex: '#cc2222', code: 'RED-010' },
  { name: 'Azul',     hex: '#2244cc', code: 'BLU-020' },
  { name: 'Verde',    hex: '#22aa44', code: 'GRN-030' },
  { name: 'Amarillo', hex: '#eecc00', code: 'YLW-040' },
  { name: 'Naranja',  hex: '#ee8800', code: 'ORG-050' },
  { name: 'Rosa',     hex: '#ee88aa', code: 'PNK-060' },
  { name: 'Morado',   hex: '#8844cc', code: 'PRP-070' },
  { name: 'Marrón',   hex: '#884422', code: 'BRN-080' },
  { name: 'Gris',     hex: '#888888', code: 'GRY-090' },
  { name: 'Cian',     hex: '#00ccdd', code: 'CYN-100' },
  { name: 'Dorado',   hex: '#ccaa22', code: 'GLD-110' },
  { name: 'Beige',    hex: '#e8d8b0', code: 'BGE-120' },
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
    const d = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function bboxOf(pts) {
  if (!pts?.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function bboxArea(b) { return (b.maxX - b.minX) * (b.maxY - b.minY); }
function bboxOverlap(a, b) {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return ox * oy;
}

// ── Checks ────────────────────────────────────────────────────────────────────
function runChecks(regions, config) {
  const issues = [];
  const warnings = [];
  const infos = [];

  const visible = (regions || []).filter(r => r.visible !== false);

  // 1. Density
  const densityViolators = visible.filter(r => (r.density || 0) > MAX_DENSITY);
  if (densityViolators.length) {
    issues.push({
      id: 'density',
      label: `Densidad excesiva (${densityViolators.length} región${densityViolators.length > 1 ? 'es' : ''})`,
      detail: `Max ${MAX_DENSITY} pts/mm. Riesgo de rotura de aguja.`,
      regions: densityViolators.map(r => r.name || r.id),
      fix: 'Reducir densidad a ≤ 2.0'
    });
  }

  // 2. Long stitches (estimate from region perimeter / stitch_count ratio)
  const longStitch = visible.filter(r => {
    if (!r.perimeter_mm || !r.stitch_count) return false;
    const avgLen = r.perimeter_mm / Math.max(1, r.stitch_count / 10);
    return avgLen > MAX_STITCH_MM;
  });
  if (longStitch.length) {
    warnings.push({
      id: 'long_stitch',
      label: `Puntadas largas estimadas (${longStitch.length} región${longStitch.length > 1 ? 'es' : ''})`,
      detail: `Límite máquina: ${MAX_STITCH_MM}mm. Se dividirán automáticamente.`,
      regions: longStitch.map(r => r.name || r.id),
      fix: 'Auto-dividir puntadas largas'
    });
  }

  // 3. Color changes
  const colorOrder = visible.map(r => r.color);
  let colorChanges = 0;
  for (let i = 1; i < colorOrder.length; i++) {
    if (colorOrder[i] !== colorOrder[i-1]) colorChanges++;
  }
  const colorChangeTime = Math.round(colorChanges * COLOR_CHANGE_S / 60);
  if (colorChanges > 8) {
    warnings.push({
      id: 'color_changes',
      label: `${colorChanges} cambios de color`,
      detail: `Tiempo adicional estimado: ~${colorChangeTime} min. Considera reordenar por color.`,
      fix: 'Optimizar ruta por color'
    });
  } else {
    infos.push({ id: 'color_changes', label: `${colorChanges} cambios de color (+${colorChangeTime} min)` });
  }

  // 4. Overlapping same-color regions
  const bboxes = visible.map(r => ({ r, b: bboxOf(r.path_points) })).filter(x => x.b);
  const overlaps = [];
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i+1; j < bboxes.length; j++) {
      if (bboxes[i].r.color !== bboxes[j].r.color) continue;
      const area = bboxOverlap(bboxes[i].b, bboxes[j].b);
      const minA = Math.min(bboxArea(bboxes[i].b), bboxArea(bboxes[j].b));
      if (minA > 0 && area / minA > OVERLAP_THRESH) {
        overlaps.push([bboxes[i].r.name || bboxes[i].r.id, bboxes[j].r.name || bboxes[j].r.id]);
      }
    }
  }
  if (overlaps.length) {
    warnings.push({
      id: 'overlap',
      label: `${overlaps.length} superposición${overlaps.length > 1 ? 'es' : ''} mismo color`,
      detail: `Regiones que se solapan > 10%. Pueden crear bultos.`,
      regions: overlaps.map(p => `${p[0]} ↔ ${p[1]}`),
    });
  }

  // 5. Regions without underlay (large fills)
  const missingUnderlay = visible.filter(r => r.stitch_type === 'fill' && (r.area_mm2 || 0) > 100 && !r.underlay);
  if (missingUnderlay.length) {
    warnings.push({
      id: 'underlay',
      label: `Sin underlay en ${missingUnderlay.length} relleno${missingUnderlay.length > 1 ? 's' : ''} grande${missingUnderlay.length > 1 ? 's' : ''}`,
      detail: 'Fills > 100mm² sin underlay pueden quedar flojos en tela.',
      regions: missingUnderlay.map(r => r.name || r.id),
      fix: 'Añadir underlay automático'
    });
  }

  // 6. Hoop check
  const w = config?.width_mm || 100, h = config?.height_mm || 100;
  if (w > 300 || h > 300) {
    warnings.push({ id: 'hoop', label: `Diseño grande: ${w}×${h}mm`, detail: 'Puede requerir aro jumbo (>300mm).' });
  } else if (w > 200 || h > 200) {
    infos.push({ id: 'hoop', label: `Aro grande necesario (200–300mm)` });
  }

  // 7. Thread estimate
  const totalStitches = visible.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const metersNeeded = totalStitches * 2.5 / 1000;
  if (metersNeeded > SPOOL_METERS * 0.8) {
    warnings.push({
      id: 'thread',
      label: `Hilo insuficiente en 1 carrete (${metersNeeded.toFixed(0)}m estimados)`,
      detail: `1 carrete = ${SPOOL_METERS}m. Prepara ${Math.ceil(metersNeeded / SPOOL_METERS)} carrete${metersNeeded / SPOOL_METERS > 1 ? 's' : ''}.`,
    });
  } else {
    infos.push({ id: 'thread', label: `Hilo estimado: ${metersNeeded.toFixed(0)}m (< 1 carrete)` });
  }

  return { issues, warnings, infos };
}

// ── Cost & time report ────────────────────────────────────────────────────────
function buildReport(regions, config) {
  const visible = (regions || []).filter(r => r.visible !== false);
  const totalStitches = visible.reduce((s, r) => s + (r.stitch_count || 0), 0);

  const colorOrder = visible.map(r => r.color);
  let colorChanges = 0;
  for (let i = 1; i < colorOrder.length; i++) if (colorOrder[i] !== colorOrder[i-1]) colorChanges++;

  const stitchSecs = totalStitches / (MACHINE_SPM * EFFICIENCY);
  const changeSecs = colorChanges * COLOR_CHANGE_S;
  const totalMins = (stitchSecs + changeSecs) / 60;

  const metersNeeded = totalStitches * 2.5 / 1000 + colorChanges * 2;
  const threadCost = (metersNeeded / SPOOL_METERS) * COST_PER_SPOOL;

  const w = (config?.width_mm || 100) / 1000, h = (config?.height_mm || 100) / 1000;
  const stabCost = w * h * STAB_COST_M2;
  const totalCost = threadCost + stabCost;

  const uniqueColors = [...new Set(visible.map(r => r.color))];
  const threads = uniqueColors.map(hex => ({ hex, ...closestThread(hex) }));

  return { totalStitches, colorChanges, totalMins, threadCost, stabCost, totalCost, threads, metersNeeded };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function IssueRow({ item, severity }) {
  const [open, setOpen] = useState(false);
  const icon = severity === 'error'   ? <XCircle    className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
             : severity === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
             :                          <CheckCircle  className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />;
  const border = severity === 'error' ? 'border-red-500/20 bg-red-950/20'
               : severity === 'warning' ? 'border-amber-500/20 bg-amber-950/10'
               : 'border-[#1e2130] bg-[#0a0c12]';

  return (
    <div className={`rounded-lg border ${border} overflow-hidden`}>
      <button onClick={() => item.detail && setOpen(o => !o)} className="w-full flex items-start gap-2 px-3 py-2 text-left">
        {icon}
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-medium ${severity === 'error' ? 'text-red-300' : severity === 'warning' ? 'text-amber-300' : 'text-slate-400'}`}>
            {item.label}
          </span>
        </div>
        {item.fix && <span className="text-[10px] text-violet-400 flex-shrink-0 hover:underline">{item.fix}</span>}
      </button>
      {open && item.detail && (
        <div className="px-3 pb-2 text-[10px] text-slate-500 border-t border-[#1e2130] pt-1.5">
          {item.detail}
          {item.regions?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.regions.slice(0,5).map((r,i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-[#161a23] border border-[#2a2d3a] text-slate-500">{r}</span>
              ))}
              {item.regions.length > 5 && <span className="text-slate-600">+{item.regions.length - 5} más</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtMins(m) {
  if (m < 1) return `${Math.round(m*60)}s`;
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m/60)}h ${Math.round(m%60)}min`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PreflightPanel({ regions, config, onAutoFix, onOptimizeRoute }) {
  const { issues, warnings, infos } = useMemo(() => runChecks(regions, config), [regions, config]);
  const report = useMemo(() => buildReport(regions, config), [regions, config]);

  const canExport = issues.length === 0;
  const totalProblems = issues.length + warnings.length;

  const handleAutoFix = () => {
    // Apply underlay to large fills, reduce density violations
    const fixed = (regions || []).map(r => {
      let upd = { ...r };
      if ((r.density || 0) > MAX_DENSITY) upd.density = MAX_DENSITY;
      if (r.stitch_type === 'fill' && (r.area_mm2 || 0) > 100 && !r.underlay) upd.underlay = true;
      return upd;
    });
    onAutoFix?.(fixed);
  };

  const handleOptimize = () => {
    // Sort regions by color to minimize color changes
    const sorted = [...(regions || [])].sort((a, b) => {
      if (a.color < b.color) return -1;
      if (a.color > b.color) return 1;
      return (a.layer_order || 0) - (b.layer_order || 0);
    });
    onOptimizeRoute?.(sorted);
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
        canExport && totalProblems === 0 ? 'bg-emerald-950/30 border-emerald-500/30' :
        canExport ? 'bg-amber-950/20 border-amber-500/20' :
        'bg-red-950/20 border-red-500/20'
      }`}>
        {canExport && totalProblems === 0
          ? <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          : canExport
          ? <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
        <div>
          <div className={`text-sm font-bold ${canExport && totalProblems === 0 ? 'text-emerald-300' : canExport ? 'text-amber-300' : 'text-red-300'}`}>
            {canExport && totalProblems === 0 ? '¡Diseño listo para exportar!' :
             canExport ? `${warnings.length} advertencia${warnings.length > 1 ? 's' : ''} — puedes exportar` :
             `${issues.length} error${issues.length > 1 ? 'es' : ''} crítico${issues.length > 1 ? 's' : ''} — corrige antes de exportar`}
          </div>
          <div className="text-[11px] text-slate-500">{(regions || []).filter(r => r.visible !== false).length} regiones • {report.totalStitches.toLocaleString()} puntadas</div>
        </div>
      </div>

      {/* Issues */}
      {(issues.length > 0 || warnings.length > 0 || infos.length > 0) && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">Validaciones</div>
          {issues.map(i   => <IssueRow key={i.id} item={i} severity="error" />)}
          {warnings.map(w => <IssueRow key={w.id} item={w} severity="warning" />)}
          {infos.map(i   => <IssueRow key={i.id} item={i} severity="info" />)}
        </div>
      )}

      {/* Auto-fix + Optimize buttons */}
      {(issues.length > 0 || warnings.length > 0) && (
        <div className="flex gap-2">
          <button onClick={handleAutoFix}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold transition-colors">
            <Zap className="w-3.5 h-3.5" /> Auto-fix
          </button>
          <button onClick={handleOptimize}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 text-cyan-400 text-xs font-semibold transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Optimizar ruta
          </button>
        </div>
      )}

      {/* Report */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">Reporte</div>

        {/* Time + cost */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Tiempo bordado</span>
            </div>
            <div className="text-lg font-bold text-violet-300">{fmtMins(report.totalMins)}</div>
            <div className="text-[10px] text-slate-600">{report.colorChanges} cambios de color</div>
          </div>
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Costo materiales</span>
            </div>
            <div className="text-lg font-bold text-emerald-300">${report.totalCost.toFixed(2)}</div>
            <div className="text-[10px] text-slate-600">Hilo + estabilizador</div>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg px-3 py-2 space-y-1">
          {[
            ['Hilo', `${report.metersNeeded.toFixed(0)}m`, `$${report.threadCost.toFixed(2)}`],
            ['Estabilizador', `${((config?.width_mm||100)*(config?.height_mm||100)/1e6).toFixed(4)} m²`, `$${report.stabCost.toFixed(2)}`],
          ].map(([label, qty, cost]) => (
            <div key={label} className="flex items-center text-[10px]">
              <span className="text-slate-500 flex-1">{label}</span>
              <span className="text-slate-600 w-20 text-right">{qty}</span>
              <span className="text-slate-300 w-14 text-right font-medium">{cost}</span>
            </div>
          ))}
        </div>

        {/* Thread colors */}
        <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Hilos necesarios ({report.threads.length})</span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {report.threads.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white/10 flex-shrink-0" style={{ background: t.hex }} />
                <span className="text-[10px] text-slate-300 flex-1">{t.name}</span>
                <span className="text-[10px] text-slate-600 font-mono">{t.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hoop */}
        {(() => {
          const w = config?.width_mm || 100, h = config?.height_mm || 100;
          const hoop = w <= 100 && h <= 100 ? '100×100mm (Pequeño)' :
                       w <= 150 && h <= 150 ? '150×150mm (Estándar)' :
                       w <= 200 && h <= 200 ? '200×200mm (Mediano)' :
                       w <= 300 && h <= 300 ? '300×300mm (Grande)' : 'Aro jumbo requerido';
          const color = (w > 300 || h > 300) ? 'text-amber-400' : 'text-slate-300';
          return (
            <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg px-3 py-2 flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] text-slate-500">Aro sugerido:</span>
              <span className={`text-[10px] font-semibold ${color}`}>{hoop}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}