import { useState, useMemo } from 'react';
import { Eye, EyeOff, Edit2, Check, Layers, Focus, ChevronDown, ChevronRight, Search } from 'lucide-react';
import RegionEditModal from './RegionEditModal';
import RegionInspector from './RegionInspector.jsx';

// ── Color naming ──────────────────────────────────────────────────────────────

const COLOR_NAMES = [
  { name: 'negro',    r: 0,   g: 0,   b: 0   },
  { name: 'blanco',   r: 255, g: 255, b: 255 },
  { name: 'rojo',     r: 220, g: 30,  b: 30  },
  { name: 'verde',    r: 30,  g: 160, b: 30  },
  { name: 'azul',     r: 30,  g: 80,  b: 220 },
  { name: 'amarillo', r: 240, g: 220, b: 20  },
  { name: 'naranja',  r: 240, g: 130, b: 20  },
  { name: 'rosa',     r: 240, g: 150, b: 180 },
  { name: 'morado',   r: 140, g: 60,  b: 200 },
  { name: 'marron',   r: 140, g: 80,  b: 40  },
  { name: 'gris',     r: 130, g: 130, b: 130 },
  { name: 'cian',     r: 0,   g: 200, b: 220 },
  { name: 'beige',    r: 230, g: 210, b: 170 },
  { name: 'dorado',   r: 220, g: 180, b: 40  },
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

function getColorName(hex) {
  if (!hex || hex.length < 4) return 'color';
  const { r, g, b } = hexToRgb(hex);
  let best = COLOR_NAMES[0], bestD = Infinity;
  for (const c of COLOR_NAMES) {
    const d = (r-c.r)**2 + (g-c.g)**2 + (b-c.b)**2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

function getRelativePosition(region, allRegions) {
  const cx = region.centroid?.[0] ?? 0.5;
  const cy = region.centroid?.[1] ?? 0.5;
  const v = cy < 0.33 ? 'sup' : cy > 0.66 ? 'inf' : 'cen';
  const h = cx < 0.33 ? 'izq' : cx > 0.66 ? 'der' : '';
  return h ? `${v}_${h}` : v;
}

function isContourRegion(region) {
  if ((region.name || '').toLowerCase().includes('contour_')) return true;
  const hex = (region.color || '').toLowerCase();
  if (hex === '#000000' || hex === '#1a1a1a') return true;
  if (region.area_mm2 && region.perimeter_mm) {
    if (region.area_mm2 / (region.perimeter_mm * region.perimeter_mm) < 0.05) return true;
  }
  return Array.isArray(region.neighbors) && region.neighbors.length >= 3;
}

function isEyeRegion(region, allRegions) {
  if (!region.area_mm2 || region.area_mm2 > 60) return false;
  const colorName = getColorName(region.color);
  if (colorName !== 'blanco' && colorName !== 'negro') return false;
  // Check if a dark neighbor exists nearby
  if (!Array.isArray(region.neighbors)) return false;
  const neighborRegions = region.neighbors.map(nid => allRegions.find(r => r.id === nid)).filter(Boolean);
  return neighborRegions.some(n => {
    const nc = getColorName(n.color);
    return colorName === 'blanco' ? nc === 'negro' : nc === 'blanco';
  });
}

function generateRegionName(region, allRegions) {
  const typeAbbr = { fill: 'fill', satin: 'sat', running_stitch: 'run' }[region.stitch_type] || 'fill';
  const colorName = getColorName(region.color);
  const pos = getRelativePosition(region, allRegions);

  if (isEyeRegion(region, allRegions)) return `ojo_${pos}_${colorName}_${typeAbbr}`;
  if (isContourRegion(region)) return `borde_${colorName}_${typeAbbr}`;
  return `${pos}_${colorName}_${typeAbbr}`;
}

// ── Stitch mini SVG preview ───────────────────────────────────────────────────

function StitchPreview({ type, color, angle = 45, density = 0.7 }) {
  const size = 16;
  const c = color || '#888';

  if (type === 'running_stitch') {
    // Dashed line
    return (
      <svg width={size} height={size} className="flex-shrink-0 rounded" style={{ background: '#1a1a2e' }}>
        <line x1="1" y1="8" x2="15" y2="8" stroke={c} strokeWidth="1.5" strokeDasharray="3,2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === 'satin') {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const spacing = Math.max(2, 4 / density);
    const lines = [];
    for (let i = 0; i < size; i += spacing) {
      const ox = i - size/2, oy = 0;
      const x1 = size/2 + ox - cos*10, y1 = size/2 + oy - sin*10;
      const x2 = size/2 + ox + cos*10, y2 = size/2 + oy + sin*10;
      lines.push(<line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke={c} strokeWidth="1" strokeLinecap="round" />);
    }
    return (
      <svg width={size} height={size} className="flex-shrink-0 rounded" style={{ background: '#1a1a2e' }} viewBox={`0 0 ${size} ${size}`}>
        <clipPath id="cp"><rect width={size} height={size} /></clipPath>
        <g clipPath="url(#cp)">{lines}</g>
      </svg>
    );
  }

  // Fill (tatami) — cross-hatch
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const spacing = Math.max(2.5, 5 / density);
  const lines = [];
  for (let i = -size; i < size*2; i += spacing) {
    const x1 = size/2 + i * cos - sin * size;
    const y1 = size/2 + i * sin + cos * size;
    const x2 = size/2 + i * cos + sin * size;
    const y2 = size/2 + i * sin - cos * size;
    lines.push(<line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke={c} strokeWidth="0.8" />);
  }
  return (
    <svg width={size} height={size} className="flex-shrink-0 rounded" style={{ background: '#1a1a2e' }} viewBox={`0 0 ${size} ${size}`}>
      <clipPath id="cfill"><rect width={size} height={size} /></clipPath>
      <g clipPath="url(#cfill)">{lines}</g>
    </svg>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function StitchBadge({ type }) {
  const map = { fill: ['badge-fill', 'fill'], satin: ['badge-satin', 'sat'], running_stitch: ['badge-run', 'run'] };
  const [cls, label] = map[type] || ['badge-run', 'run'];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>;
}

// ── Format ────────────────────────────────────────────────────────────────────

function fmtPts(n) { return (n || 0).toLocaleString('es-ES'); }

// ── Region item ───────────────────────────────────────────────────────────────

function RegionItem({ region, allRegions, isSelected, isBatch, isChecked, onSelect, onToggleCheck, onToggleVisible, onEdit, onIsolate }) {
  const [hovered, setHovered] = useState(false);
  const smartName = useMemo(() => generateRegionName(region, allRegions), [region, allRegions]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => isBatch ? onToggleCheck(region.id) : onSelect(region.id)}
      onDoubleClick={() => !isBatch && onEdit(region.id)}
      className={`relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b border-[#1a1d27]
        ${isSelected && !isBatch ? 'bg-violet-900/20 border-l-2 border-l-violet-500' : 'hover:bg-[#161a23]'}
        ${isChecked ? 'bg-cyan-900/10' : ''}`}
    >
      {/* Batch checkbox */}
      {isBatch && (
        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-violet-600 border-violet-600' : 'border-[#3a3d4a]'}`}>
          {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
      )}

      {/* Color dot */}
      <div className="w-3 h-3 rounded-full flex-shrink-0 border border-white/10" style={{ background: region.color }} />

      {/* Stitch preview */}
      <StitchPreview type={region.stitch_type} color={region.color} angle={region.angle} density={region.density} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[11px] text-slate-200 truncate font-medium">{smartName}</span>
          <StitchBadge type={region.stitch_type} />
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {fmtPts(region.stitch_count)} pts • {region.density || 0}d • {region.angle || 0}°
        </div>
      </div>

      {/* Inline actions — visible on hover or always visible for eye */}
      <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${hovered || !region.visible ? 'opacity-100' : 'opacity-0'}`}>
        <ActionBtn onClick={e => { e.stopPropagation(); onToggleVisible(region.id); }} title={region.visible ? 'Ocultar' : 'Mostrar'}>
          {region.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </ActionBtn>
        {hovered && (
          <>
            <ActionBtn onClick={e => { e.stopPropagation(); onEdit(region.id); }} title="Editar" accent="cyan">
              <Edit2 className="w-3 h-3" />
            </ActionBtn>
            <ActionBtn onClick={e => { e.stopPropagation(); onIsolate(region.id); }} title="Aislar">
              <Focus className="w-3 h-3" />
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, children, title, accent }) {
  const color = accent === 'cyan' ? 'hover:text-cyan-400' : 'hover:text-white';
  return (
    <button onClick={onClick} title={title} className={`p-1 rounded hover:bg-[#2a2d3a] text-slate-500 ${color} transition-colors`}>
      {children}
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const FILTER_OPTS = ['Todas', 'Fill', 'Satin', 'Run'];

function RegionInspectorPanel({ region, allRegions }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-violet-500/20 bg-[#0a0c12]">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#161a23] transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full border border-white/10 flex-shrink-0" style={{ background: region.color }} />
          <span className="text-[11px] font-semibold text-violet-300 truncate max-w-[140px]">{region.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-slate-600">Inspector</span>
          {open ? <ChevronDown className="w-3 h-3 text-slate-600" /> : <ChevronRight className="w-3 h-3 text-slate-600" />}
        </div>
      </button>
      {open && <RegionInspector region={region} allRegions={allRegions} />}
    </div>
  );
}

export default function RegionsPanel({ regions, selectedId, onSelect, onUpdate }) {
  const [filter, setFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [batchTech, setBatchTech] = useState('fill');
  const [batchDensity, setBatchDensity] = useState(0.8);
  const [batchAngle, setBatchAngle] = useState(45);
  const [addContours, setAddContours] = useState(false);
  const [groupByColor, setGroupByColor] = useState(false);
  const [isolatedId, setIsolatedId] = useState(null);

  const allRegions = regions || [];

  const filtered = useMemo(() => allRegions.filter(r => {
    if (isolatedId && r.id !== isolatedId) return false;
    if (filter === 'Fill')  return r.stitch_type === 'fill';
    if (filter === 'Satin') return r.stitch_type === 'satin';
    if (filter === 'Run')   return r.stitch_type === 'running_stitch';
    if (search) {
      const q = search.toLowerCase();
      const name = (r.name || generateRegionName(r, allRegions)).toLowerCase();
      return name.includes(q) || (r.color || '').toLowerCase().includes(q);
    }
    return true;
  }), [allRegions, filter, isolatedId, search]);

  // Group by closest color name
  const groups = useMemo(() => {
    if (!groupByColor) return null;
    const map = {};
    for (const r of filtered) {
      const key = getColorName(r.color);
      if (!map[key]) map[key] = { colorName: key, color: r.color, regions: [] };
      map[key].regions.push(r);
    }
    return Object.values(map);
  }, [filtered, groupByColor]);

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleVisible = (id) => onUpdate(allRegions.map(r => r.id === id ? { ...r, visible: !r.visible } : r));
  const handleIsolate = (id) => setIsolatedId(prev => prev === id ? null : id);

  const applyBatch = () => {
    const ids = new Set(selected);
    let updated = allRegions.map(r => ids.has(r.id) ? { ...r, stitch_type: batchTech, density: batchDensity, angle: batchAngle } : r);
    if (addContours) {
      const contours = selected.filter(id => {
        const r = allRegions.find(x => x.id === id);
        return r?.stitch_type === 'fill';
      }).map(id => {
        const r = allRegions.find(x => x.id === id);
        return { id: `auto_contour_${id}`, name: `contour_${r.color?.replace('#','') || '000000'}`, color: '#000000', stitch_type: 'running_stitch', density: 0.3, angle: 0, layer_order: 4, pull_compensation: 0.1, underlay: false, is_auto_contour: true, visible: true, path_points: r.path_points, stitch_count: 80, area_mm2: r.area_mm2 };
      });
      updated = [...updated, ...contours];
    }
    onUpdate(updated);
    setSelected([]);
  };

  const editingRegion = allRegions.find(r => r.id === editingId);

  const totalStitches = filtered.reduce((s, r) => s + (r.stitch_count || 0), 0);

  // Render a flat list or grouped list
  const renderRegion = (region) => (
    <RegionItem
      key={region.id}
      region={region}
      allRegions={allRegions}
      isSelected={selectedId === region.id}
      isBatch={batchMode}
      isChecked={selected.includes(region.id)}
      onSelect={onSelect}
      onToggleCheck={toggleSelect}
      onToggleVisible={toggleVisible}
      onEdit={setEditingId}
      onIsolate={handleIsolate}
    />
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0f14]">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#1e2130]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-bold text-white">
              Regiones <span className="text-violet-400">({allRegions.length})</span>
            </span>
            {isolatedId && (
              <button onClick={() => setIsolatedId(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-500/30 text-amber-400 hover:bg-amber-900/50">
                ✕ Aislar
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setGroupByColor(g => !g)}
              title="Agrupar por color"
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${groupByColor ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-300' : 'border-[#2a2d3a] text-slate-500 hover:text-slate-300'}`}
            >
              Color
            </button>
            <button
              onClick={() => { setBatchMode(!batchMode); setSelected([]); }}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${batchMode ? 'border-violet-500 bg-violet-900/30 text-violet-300' : 'border-[#2a2d3a] text-slate-500 hover:text-slate-300'}`}
            >
              Batch
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar región..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#161a23] border border-[#2a2d3a] rounded pl-6 pr-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>

        {/* Summary */}
        <div className="text-[10px] text-slate-600 mb-1.5">
          {fmtPts(totalStitches)} puntadas{search ? ` · "${search}"` : ''}
        </div>

        {/* Filters */}
        <div className="flex gap-1">
          {FILTER_OPTS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 text-[10px] py-1 rounded transition-colors ${filter === f ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40' : 'text-slate-500 hover:text-slate-400'}`}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Batch shortcuts */}
      {batchMode && (
        <div className="px-3 py-2 border-b border-[#1e2130] bg-[#0a0c12]">
          <div className="text-[10px] text-slate-500 mb-1.5">Selección • <span className="text-violet-400">{selected.length}/{filtered.length}</span></div>
          <div className="flex flex-wrap gap-1">
            {[['Todos', () => setSelected(filtered.map(r => r.id))], ['Ninguno', () => setSelected([])], ['Pequeños', () => setSelected(filtered.filter(r => (r.area_mm2||0) < 50).map(r => r.id))], ['Satin', () => setSelected(filtered.filter(r => r.stitch_type==='satin').map(r => r.id))], ['Fill', () => setSelected(filtered.filter(r => r.stitch_type==='fill').map(r => r.id))]].map(([label, fn]) => (
              <button key={label} onClick={fn} className="text-[10px] px-2 py-0.5 rounded bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white hover:border-violet-500/50 transition-colors">{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Region list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-slate-600 text-xs py-12">No hay regiones</div>
        )}

        {groupByColor && groups ? (
          groups.map(group => (
            <div key={group.colorName}>
              {/* Sticky group header */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#0d0f14] border-b border-[#1e2130]">
                <div className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ background: group.color }} />
                <span className="text-[10px] font-bold text-slate-300 capitalize">{group.colorName}</span>
                <span className="text-[10px] text-slate-600 ml-auto">
                  {group.regions.length} reg • {fmtPts(group.regions.reduce((s,r) => s+(r.stitch_count||0), 0))} pts
                </span>
              </div>
              {group.regions.map(renderRegion)}
            </div>
          ))
        ) : (
          filtered.map(renderRegion)
        )}
      </div>

      {/* Batch apply panel */}
      {batchMode && selected.length > 0 && (
        <div className="border-t border-violet-500/20 bg-violet-950/20 p-3 space-y-2.5">
          <div className="text-[11px] font-bold text-violet-300 uppercase tracking-wider">APLICAR A {selected.length} región(es)</div>
          <select value={batchTech} onChange={e => setBatchTech(e.target.value)}
            className="w-full bg-[#161a23] border border-[#2a2d3a] rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500">
            <option value="fill">Fill</option>
            <option value="satin">Satin</option>
            <option value="running_stitch">Running Stitch</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Densidad</label>
              <input type="number" min="0.3" max="2.0" step="0.1" value={batchDensity} onChange={e => setBatchDensity(Number(e.target.value))}
                className="w-full bg-[#161a23] border border-[#2a2d3a] rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Ángulo (°)</label>
              <input type="number" min="0" max="180" value={batchAngle} onChange={e => setBatchAngle(Number(e.target.value))}
                className="w-full bg-[#161a23] border border-[#2a2d3a] rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAddContours(!addContours)} className={`w-4 h-4 rounded border flex items-center justify-center ${addContours ? 'bg-violet-600 border-violet-600' : 'border-[#3a3d4a]'}`}>
              {addContours && <Check className="w-2.5 h-2.5 text-white" />}
            </button>
            <span className="text-[11px] text-slate-400">Añadir contornos automáticos</span>
          </div>
          <button onClick={applyBatch} className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors">
            Aplicar a {selected.length} región(es)
          </button>
        </div>
      )}

      {/* Region Inspector — expanded when a region is selected */}
      {selectedId && !batchMode && (() => {
        const sel = allRegions.find(r => r.id === selectedId);
        return sel ? (
          <RegionInspectorPanel region={sel} allRegions={allRegions} />
        ) : null;
      })()}

      {/* Edit modal */}
      {editingId && editingRegion && (
        <RegionEditModal
          region={editingRegion}
          onSave={updated => { onUpdate(allRegions.map(r => r.id === editingId ? updated : r)); setEditingId(null); }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}