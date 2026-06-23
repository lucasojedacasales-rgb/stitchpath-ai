import { useState } from 'react';
import { Eye, EyeOff, Edit2, ChevronDown, ChevronUp, X, Check, Layers } from 'lucide-react';
import RegionEditModal from './RegionEditModal';

function StitchBadge({ type }) {
  const map = { fill: ['badge-fill', 'fill'], satin: ['badge-satin', 'sat'], running_stitch: ['badge-run', 'run'] };
  const [cls, label] = map[type] || ['badge-run', 'run'];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>;
}

const FILTER_OPTS = ['Todas', 'Fill', 'Satin', 'Run'];

export default function RegionsPanel({ regions, selectedId, onSelect, onUpdate }) {
  const [filter, setFilter] = useState('Todas');
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [batchTech, setBatchTech] = useState('fill');
  const [batchDensity, setBatchDensity] = useState(0.8);
  const [batchAngle, setBatchAngle] = useState(45);
  const [addContours, setAddContours] = useState(false);

  const filtered = (regions || []).filter(r => {
    if (filter === 'Todas') return true;
    if (filter === 'Fill') return r.stitch_type === 'fill';
    if (filter === 'Satin') return r.stitch_type === 'satin';
    if (filter === 'Run') return r.stitch_type === 'running_stitch';
    return true;
  });

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const selectAll = () => setSelected(filtered.map(r => r.id));
  const selectNone = () => setSelected([]);
  const selectSmall = () => setSelected(filtered.filter(r => (r.area_mm2 || 0) < 50).map(r => r.id));
  const selectSatin = () => setSelected(filtered.filter(r => r.stitch_type === 'satin').map(r => r.id));
  const selectTatami = () => setSelected(filtered.filter(r => r.stitch_type === 'fill').map(r => r.id));

  const applyBatch = () => {
    const ids = new Set(selected);
    const updated = regions.map(r => {
      if (!ids.has(r.id)) return r;
      const upd = { ...r, stitch_type: batchTech, density: batchDensity, angle: batchAngle };
      return upd;
    });
    let final = updated;
    if (addContours) {
      const contours = selected.filter(id => {
        const r = regions.find(x => x.id === id);
        return r && r.stitch_type === 'fill';
      }).map((id, i) => {
        const r = regions.find(x => x.id === id);
        return {
          id: `auto_contour_${id}`,
          name: `contour_${r.color?.replace('#', '') || '000000'}`,
          color: '#000000',
          stitch_type: 'running_stitch',
          density: 0.3,
          angle: 0,
          layer_order: 4,
          pull_compensation: 0.1,
          underlay: false,
          is_auto_contour: true,
          visible: true,
          path_points: r.path_points,
          stitch_count: 80,
          area_mm2: r.area_mm2
        };
      });
      final = [...updated, ...contours];
    }
    onUpdate(final);
    setSelected([]);
  };

  const editingRegion = regions?.find(r => r.id === editingId);

  return (
    <div className="flex flex-col h-full bg-[#0d0f14]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e2130]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-bold text-white">Regiones <span className="text-violet-400">({(regions || []).length})</span></span>
          </div>
          <button
            onClick={() => { setBatchMode(!batchMode); setSelected([]); }}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${batchMode ? 'border-violet-500 bg-violet-900/30 text-violet-300' : 'border-[#2a2d3a] text-slate-500 hover:text-slate-300'}`}
          >
            {batchMode ? 'Cancelar' : 'Batch'}
          </button>
        </div>
        {/* Filters */}
        <div className="flex gap-1">
          {FILTER_OPTS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 text-[10px] py-1 rounded transition-colors ${filter === f ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40' : 'text-slate-500 hover:text-slate-400'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Batch selection shortcuts */}
      {batchMode && (
        <div className="px-4 py-2 border-b border-[#1e2130] bg-[#0a0c12]">
          <div className="text-[10px] text-slate-500 mb-1.5">Selección rápida • <span className="text-violet-400">{selected.length}/{filtered.length}</span></div>
          <div className="flex flex-wrap gap-1">
            {[['Todos', selectAll], ['Ninguno', selectNone], ['Pequeños', selectSmall], ['Satin', selectSatin], ['Tatami', selectTatami]].map(([label, fn]) => (
              <button key={label} onClick={fn} className="text-[10px] px-2 py-0.5 rounded bg-[#161a23] border border-[#2a2d3a] text-slate-400 hover:text-white hover:border-violet-500/50 transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Region list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-slate-600 text-xs py-12">No hay regiones</div>
        )}
        {filtered.map(region => (
          <div
            key={region.id}
            onClick={() => batchMode ? toggleSelect(region.id) : onSelect(region.id)}
            className={`flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors border-b border-[#1a1d27] hover:bg-[#161a23]
              ${selectedId === region.id && !batchMode ? 'bg-violet-900/15 border-l-2 border-l-violet-500' : ''}
              ${selected.includes(region.id) ? 'bg-cyan-900/10' : ''}`}
          >
            {batchMode && (
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(region.id) ? 'bg-violet-600 border-violet-600' : 'border-[#3a3d4a]'}`}>
                {selected.includes(region.id) && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
            )}
            <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white/10" style={{ background: region.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-300 truncate">{region.name}</span>
                <StitchBadge type={region.stitch_type} />
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {region.stitch_count || 0} ptos • {region.density || 0}d/{region.angle || 0}°
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={e => { e.stopPropagation(); onUpdate(regions.map(r => r.id === region.id ? { ...r, visible: !r.visible } : r)); }}
                className="p-1 rounded hover:bg-[#2a2d3a] text-slate-500 hover:text-white transition-colors"
              >
                {region.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingId(region.id); }}
                className="p-1 rounded hover:bg-[#2a2d3a] text-slate-500 hover:text-cyan-400 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Batch apply panel */}
      {batchMode && selected.length > 0 && (
        <div className="border-t border-violet-500/20 bg-violet-950/20 p-4 space-y-3">
          <div className="text-[11px] font-bold text-violet-300 uppercase tracking-wider">APLICAR A {selected.length} región(es)</div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Técnica</label>
            <select
              value={batchTech}
              onChange={e => setBatchTech(e.target.value)}
              className="w-full bg-[#161a23] border border-[#2a2d3a] rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
            >
              <option value="fill">Fill (Relleno)</option>
              <option value="satin">Satin</option>
              <option value="running_stitch">Running Stitch</option>
            </select>
          </div>
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
            <span className="text-[11px] text-slate-400">Añadir contornos negros automáticos</span>
          </div>
          <button
            onClick={applyBatch}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
          >
            Aplicar a {selected.length} región(es)
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingId && editingRegion && (
        <RegionEditModal
          region={editingRegion}
          onSave={updated => { onUpdate(regions.map(r => r.id === editingId ? updated : r)); setEditingId(null); }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}