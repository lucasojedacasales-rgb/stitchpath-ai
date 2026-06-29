import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Zap, RefreshCw, Clock, DollarSign, Palette, Maximize2, ChevronDown, ChevronRight, Scissors, Layers, Activity } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_DENSITY      = 2.0;   // pts/mm — needle break risk
const MIN_DENSITY      = 0.25;  // pts/mm — too loose
const MAX_STITCH_MM    = 12.1;  // mm — machine limit
const OVERLAP_THRESH   = 0.10;  // 10% bounding-box overlap
const SPOOL_METERS     = 1000;  // metres per standard spool
const COST_PER_SPOOL   = 5.0;   // USD
const STAB_COST_M2     = 4.0;   // USD per m²
const MACHINE_SPM      = 800;
const EFFICIENCY       = 0.70;
const COLOR_CHANGE_S   = 30;
const MIN_AREA_MM2     = 3;     // below this: likely lost detail
const SATIN_MAX_MM     = 8;     // max satin width before fill is better
const MIN_STITCHES     = 10;    // region too sparse
const MAX_JUMP_MM      = 15;    // long jump → trim command

// ── Thread color names DB ─────────────────────────────────────────────────────
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

// ── Score helpers ─────────────────────────────────────────────────────────────
function computeReadinessScore(issues, warnings, infos, regions) {
  if (!regions?.length) return 0;
  let score = 100;
  score -= issues.length * 20;
  score -= warnings.length * 8;
  score -= infos.filter(i => i.demerit).length * 2;
  return Math.max(0, Math.min(100, score));
}

// ── Checks ────────────────────────────────────────────────────────────────────
function runChecks(regions, config) {
  const issues   = [];
  const warnings = [];
  const infos    = [];

  const visible = (regions || []).filter(r => r.visible !== false);
  if (!visible.length) {
    issues.push({ id: 'no_regions', label: 'No hay regiones visibles', detail: 'Procesa la imagen primero para generar regiones de bordado.' });
    return { issues, warnings, infos };
  }

  // 1. Density too high
  const densityHigh = visible.filter(r => (r.density || 0) > MAX_DENSITY);
  if (densityHigh.length) {
    issues.push({
      id: 'density_high',
      label: `Densidad excesiva (${densityHigh.length} región${densityHigh.length > 1 ? 'es' : ''})`,
      detail: `Máximo recomendado: ${MAX_DENSITY} pts/mm. Riesgo de rotura de aguja y distorsión del tejido.`,
      regions: densityHigh.map(r => r.name || r.id),
      fix: 'Reducir a ≤ 2.0 pts/mm',
      fixId: 'density_high',
    });
  }

  // 2. Density too low
  const densityLow = visible.filter(r => (r.density || 0) > 0 && (r.density || 0) < MIN_DENSITY && r.stitch_type === 'fill');
  if (densityLow.length) {
    warnings.push({
      id: 'density_low',
      label: `Densidad muy baja (${densityLow.length} fill${densityLow.length > 1 ? 's' : ''})`,
      detail: `Mínimo recomendado: ${MIN_DENSITY} pts/mm. Rellenos quedarán sueltos o transparentes.`,
      regions: densityLow.map(r => r.name || r.id),
      fix: 'Ajustar a ≥ 0.25 pts/mm',
      fixId: 'density_low',
    });
  }

  // 3. Too-small regions (likely detail loss)
  const tinyRegions = visible.filter(r => (r.area_mm2 || 0) < MIN_AREA_MM2);
  if (tinyRegions.length) {
    warnings.push({
      id: 'tiny',
      label: `${tinyRegions.length} región${tinyRegions.length > 1 ? 'es' : ''} muy pequeña${tinyRegions.length > 1 ? 's' : ''} (<${MIN_AREA_MM2}mm²)`,
      detail: 'El detalle puede perderse en máquina. Considera eliminar o fusionar con regiones adyacentes.',
      regions: tinyRegions.map(r => r.name || r.id),
    });
  }

  // 4. Satin too wide
  const satinWide = visible.filter(r => r.stitch_type === 'satin' && (r.max_width_mm || 0) > SATIN_MAX_MM);
  if (satinWide.length) {
    warnings.push({
      id: 'satin_wide',
      label: `Satin muy ancho (${satinWide.length} región${satinWide.length > 1 ? 'es' : ''})`,
      detail: `Puntada satin >8mm causa holgura y tensión irregular. Recomendado: tatami/fill.`,
      regions: satinWide.map(r => `${r.name || r.id} (${(r.max_width_mm||0).toFixed(1)}mm)`),
      fix: 'Convertir a fill',
      fixId: 'satin_wide',
    });
  }

  // 5. Too few stitches per region
  const sparseRegions = visible.filter(r => (r.stitch_count || 0) > 0 && (r.stitch_count || 0) < MIN_STITCHES);
  if (sparseRegions.length) {
    warnings.push({
      id: 'sparse',
      label: `${sparseRegions.length} región${sparseRegions.length > 1 ? 'es' : ''} con <${MIN_STITCHES} puntadas`,
      detail: 'Regiones con muy pocas puntadas no se registrarán bien en máquina.',
      regions: sparseRegions.map(r => r.name || r.id),
    });
  }

  // 6. Color changes
  const colorOrder = visible.map(r => r.color);
  let colorChanges = 0;
  for (let i = 1; i < colorOrder.length; i++) if (colorOrder[i] !== colorOrder[i-1]) colorChanges++;
  const colorChangeTime = Math.round(colorChanges * COLOR_CHANGE_S / 60);
  if (colorChanges > 10) {
    warnings.push({
      id: 'color_changes',
      label: `${colorChanges} cambios de color (+ ~${colorChangeTime} min)`,
      detail: 'Considera reordenar regiones por color para minimizar cambios y tiempo de producción.',
      fix: 'Optimizar por color',
      fixId: 'color_changes',
    });
  } else {
    infos.push({ id: 'color_changes', label: `${colorChanges} cambios de color (+${colorChangeTime} min)` });
  }

  // 7. Overlapping same-color regions
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
      label: `${overlaps.length} superposición${overlaps.length > 1 ? 'es' : ''} del mismo color`,
      detail: 'Regiones del mismo color que se solapan >10% pueden crear bultos y exceso de hilo.',
      regions: overlaps.map(p => `${p[0]} ↔ ${p[1]}`),
    });
  }

  // 8. Missing underlay on large fills
  const missingUnderlay = visible.filter(r => r.stitch_type === 'fill' && (r.area_mm2 || 0) > 100 && !r.underlay);
  if (missingUnderlay.length) {
    warnings.push({
      id: 'underlay',
      label: `Sin underlay: ${missingUnderlay.length} relleno${missingUnderlay.length > 1 ? 's' : ''} grande${missingUnderlay.length > 1 ? 's' : ''}`,
      detail: 'Fills >100mm² sin underlay quedan flojos, especialmente en telas elásticas.',
      regions: missingUnderlay.map(r => r.name || r.id),
      fix: 'Añadir underlay',
      fixId: 'underlay',
    });
  }

  // 9. Regions with quality issues from EIE
  const eieIssues = visible.filter(r => r.quality_issues?.length > 0);
  if (eieIssues.length) {
    const totalIssues = eieIssues.reduce((s, r) => s + r.quality_issues.length, 0);
    infos.push({
      id: 'eie_quality',
      label: `EIE detectó ${totalIssues} problema${totalIssues > 1 ? 's' : ''} en ${eieIssues.length} región${eieIssues.length > 1 ? 'es' : ''}`,
      detail: eieIssues.slice(0,3).flatMap(r => r.quality_issues).join(' • '),
      regions: eieIssues.map(r => r.name || r.id),
      demerit: true,
    });
  }

  // 10. Hoop check
  const w = config?.width_mm || 100, h = config?.height_mm || 100;
  if (w > 300 || h > 300) {
    warnings.push({ id: 'hoop', label: `Diseño grande: ${w}×${h}mm`, detail: 'Requiere aro jumbo (>300mm). Confirma compatibilidad con tu máquina.' });
  } else if (w > 200 || h > 200) {
    infos.push({ id: 'hoop', label: `Aro grande necesario (200–300mm)` });
  }

  // 11. Thread estimate
  const totalStitches = visible.reduce((s, r) => s + (r.stitch_count || 0), 0);
  const metersNeeded = totalStitches * 2.5 / 1000;
  if (metersNeeded > SPOOL_METERS * 0.8) {
    warnings.push({
      id: 'thread',
      label: `Hilo: ${metersNeeded.toFixed(0)}m — prepara ${Math.ceil(metersNeeded / SPOOL_METERS)} carrete${metersNeeded / SPOOL_METERS > 1 ? 's' : ''}`,
      detail: `1 carrete estándar = ${SPOOL_METERS}m.`,
    });
  } else {
    infos.push({ id: 'thread', label: `Hilo estimado: ${metersNeeded.toFixed(0)}m (< 1 carrete)` });
  }

  // 12. Low-confidence regions
  const lowConf = visible.filter(r => r.adaptive && r.stitch_confidence != null && r.stitch_confidence < 0.55);
  if (lowConf.length) {
    infos.push({
      id: 'low_conf',
      label: `${lowConf.length} región${lowConf.length > 1 ? 'es' : ''} con baja confianza EIE (<55%)`,
      detail: 'La decisión de tipo de puntada es incierta. Revisa manualmente o aplica el EIE de nuevo.',
      regions: lowConf.map(r => `${r.name || r.id} (${Math.round((r.stitch_confidence||0)*100)}%)`),
      demerit: true,
    });
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
  const totalMins  = (stitchSecs + changeSecs) / 60;

  const metersNeeded = totalStitches * 2.5 / 1000 + colorChanges * 2;
  const threadCost   = (metersNeeded / SPOOL_METERS) * COST_PER_SPOOL;

  const w = (config?.width_mm || 100) / 1000, h = (config?.height_mm || 100) / 1000;
  const stabCost  = w * h * STAB_COST_M2;
  const totalCost = threadCost + stabCost;

  const uniqueColors = [...new Set(visible.map(r => r.color))];
  const threads = uniqueColors.map(hex => ({ hex, ...closestThread(hex) }));

  // Per-type stitch breakdown
  const byType = visible.reduce((acc, r) => {
    const t = r.stitch_type || 'fill';
    acc[t] = (acc[t] || 0) + (r.stitch_count || 0);
    return acc;
  }, {});

  return { totalStitches, colorChanges, totalMins, threadCost, stabCost, totalCost, threads, metersNeeded, byType };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function IssueRow({ item, severity }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(item.detail || item.regions?.length);
  const icon = severity === 'error'   ? <XCircle       className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
             : severity === 'warning' ? <AlertTriangle  className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
             :                          <CheckCircle    className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />;
  const border = severity === 'error'   ? 'border-red-500/20 bg-red-950/20'
               : severity === 'warning' ? 'border-amber-500/20 bg-amber-950/10'
               : 'border-[#1e2130] bg-[#0a0c12]';

  return (
    <div className={`rounded-lg border ${border} overflow-hidden`}>
      <button
        onClick={() => hasDetail && setOpen(o => !o)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left"
      >
        {icon}
        <span className={`flex-1 text-[11px] font-medium ${severity === 'error' ? 'text-red-300' : severity === 'warning' ? 'text-amber-300' : 'text-slate-400'}`}>
          {item.label}
        </span>
        {hasDetail && (open
          ? <ChevronDown className="w-3 h-3 text-slate-600 flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && hasDetail && (
        <div className="px-3 pb-2.5 text-[10px] text-slate-500 border-t border-[#1e2130] pt-2 space-y-1.5">
          {item.detail && <p>{item.detail}</p>}
          {item.regions?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.regions.slice(0, 5).map((r, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-[#161a23] border border-[#2a2d3a] text-slate-400">{r}</span>
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

function ReadinessGauge({ score }) {
  const color = score >= 85 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  const pct   = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#1e2130" strokeWidth="7" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${2 * Math.PI * 26 * pct / 100} ${2 * Math.PI * 26 * (1 - pct / 100)}`}
            strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>{pct}</span>
      </div>
      <span className="text-[9px] text-slate-500 uppercase tracking-wider">Readiness</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PreflightPanel({ regions, config, onAutoFix, onOptimizeRoute }) {
  const { issues, warnings, infos } = useMemo(() => runChecks(regions, config), [regions, config]);
  const report  = useMemo(() => buildReport(regions, config), [regions, config]);
  const score   = useMemo(() => computeReadinessScore(issues, warnings, infos, regions), [issues, warnings, infos, regions]);

  const canExport     = issues.length === 0;
  const totalProblems = issues.length + warnings.length;

  const handleAutoFix = () => {
    const fixed = (regions || []).map(r => {
      const upd = { ...r };
      if ((r.density || 0) > MAX_DENSITY) upd.density = MAX_DENSITY;
      if ((r.density || 0) > 0 && r.density < MIN_DENSITY && r.stitch_type === 'fill') upd.density = MIN_DENSITY;
      if (r.stitch_type === 'fill' && (r.area_mm2 || 0) > 100 && !r.underlay) upd.underlay = true;
      if (r.stitch_type === 'satin' && (r.max_width_mm || 0) > SATIN_MAX_MM) upd.stitch_type = 'fill';
      return upd;
    });
    onAutoFix?.(fixed);
  };

  const handleOptimize = () => {
    const sorted = [...(regions || [])].sort((a, b) => {
      if (a.color < b.color) return -1;
      if (a.color > b.color) return 1;
      return (a.layer_order || 0) - (b.layer_order || 0);
    });
    onOptimizeRoute?.(sorted);
  };

  const visible = (regions || []).filter(r => r.visible !== false);

  return (
    <div className="space-y-4">

      {/* Status banner + gauge */}
      <div className={`flex items-center gap-4 rounded-lg px-4 py-3 border ${
        canExport && totalProblems === 0 ? 'bg-emerald-950/30 border-emerald-500/30' :
        canExport ? 'bg-amber-950/20 border-amber-500/20' :
        'bg-red-950/20 border-red-500/20'
      }`}>
        <ReadinessGauge score={score} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold ${canExport && totalProblems === 0 ? 'text-emerald-300' : canExport ? 'text-amber-300' : 'text-red-300'}`}>
            {canExport && totalProblems === 0 ? '¡Listo para exportar!' :
             canExport ? `${warnings.length} advertencia${warnings.length > 1 ? 's' : ''} — puedes exportar` :
             `${issues.length} error${issues.length > 1 ? 'es' : ''} crítico${issues.length > 1 ? 's' : ''} — corrige primero`}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {visible.length} regiones · {report.totalStitches.toLocaleString()} puntadas · {fmtMins(report.totalMins)}
          </div>
          {/* Stitch type breakdown */}
          {visible.length > 0 && (
            <div className="flex gap-2 mt-1.5">
              {Object.entries(report.byType).map(([type, count]) => (
                <span key={type} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  type === 'fill' ? 'bg-violet-900/30 text-violet-400 border border-violet-500/20' :
                  type === 'satin' ? 'bg-cyan-900/20 text-cyan-400 border border-cyan-500/20' :
                  'bg-slate-800/50 text-slate-400 border border-slate-600/20'
                }`}>
                  {type === 'fill' ? 'Tatami' : type === 'satin' ? 'Satin' : 'Running'}: {count.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Issues list */}
      {(issues.length > 0 || warnings.length > 0 || infos.length > 0) && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">
            Validaciones ({issues.length + warnings.length + infos.length})
          </div>
          {issues.map(i   => <IssueRow key={i.id} item={i} severity="error" />)}
          {warnings.map(w => <IssueRow key={w.id} item={w} severity="warning" />)}
          {infos.map(i   => <IssueRow key={i.id} item={i} severity="info" />)}
        </div>
      )}

      {/* Action buttons */}
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
        <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold px-1">Reporte de producción</div>

        {/* Time + cost */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Tiempo</span>
            </div>
            <div className="text-lg font-bold text-violet-300">{fmtMins(report.totalMins)}</div>
            <div className="text-[10px] text-slate-600">{report.colorChanges} cambios color</div>
          </div>
          <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Materiales</span>
            </div>
            <div className="text-lg font-bold text-emerald-300">${report.totalCost.toFixed(2)}</div>
            <div className="text-[10px] text-slate-600">Hilo + estabilizador</div>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-[#0a0c12] border border-[#1e2130] rounded-lg px-3 py-2 space-y-1">
          {[
            ['Hilo', `${report.metersNeeded.toFixed(0)}m`, `$${report.threadCost.toFixed(2)}`],
            ['Estabilizador', `${((config?.width_mm||100)*(config?.height_mm||100)/1e6).toFixed(4)}m²`, `$${report.stabCost.toFixed(2)}`],
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
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Hilos ({report.threads.length})</span>
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
          const hoop  = w <= 100 && h <= 100 ? '100×100mm (Pequeño)' :
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