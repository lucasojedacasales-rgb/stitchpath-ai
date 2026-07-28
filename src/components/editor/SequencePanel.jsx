import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ListOrdered, Undo2, Redo2, Palette, X, Search, Eye, EyeOff, Sparkles, Filter } from 'lucide-react';
import SequenceItem from './sequence/SequenceItem';

const VIS_FILTERS = [
  ['all', 'Todas'],
  ['visible', 'Visibles'],
  ['hidden', 'Ocultas'],
  ['selected', 'Selección'],
];

function HeaderBtn({ onClick, label, disabled, active, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-30 disabled:cursor-not-allowed
        ${active ? 'text-violet-300 bg-violet-900/30' : 'text-slate-500 hover:text-white hover:bg-[#2a2d3a]'}`}
    >
      {children}
    </button>
  );
}

/**
 * Secuencia de regiones — panel lateral para ver, seleccionar y ordenar
 * todas las partes vectorizadas del diseño. El orden del array `regions`
 * del proyecto es el orden canónico; cada cambio escribe `sequence` y persiste.
 */
export default function SequencePanel({
  regions = [], selectedId, onSelect, onChange,
  canUndo, canRedo, onUndo, onRedo,
  isolatedId, onIsolate, onOpenVectorize, onClose,
}) {
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [visFilter, setVisFilter] = useState('all');
  const [groupByColor, setGroupByColor] = useState(false);
  const [optimizePreview, setOptimizePreview] = useState(null);
  const itemRefs = useRef(new Map());

  // Descartar la vista previa de optimización si las regiones reales cambian
  useEffect(() => { setOptimizePreview(null); }, [regions]);

  const list = optimizePreview || regions;
  const numberOf = useMemo(() => {
    const m = new Map();
    list.forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [list]);
  const colors = useMemo(() => [...new Set(regions.map(r => r.color).filter(Boolean))], [regions]);

  const filtered = useMemo(() => list.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!(`${r.name || ''} ${r.id}`.toLowerCase().includes(q))) return false;
    }
    if (colorFilter && r.color !== colorFilter) return false;
    if (visFilter === 'visible' && r.visible === false) return false;
    if (visFilter === 'hidden' && r.visible !== false) return false;
    if (visFilter === 'selected' && r.id !== selectedId) return false;
    return true;
  }), [list, search, colorFilter, visFilter, selectedId]);

  const dndEnabled = !search && !colorFilter && visFilter === 'all' && !groupByColor && !optimizePreview;

  // El orden del array es el canónico; sequence se escribe al persistir.
  const commit = useCallback((next) => {
    onChange(next.map((r, i) => ({ ...r, sequence: i + 1 })), true);
  }, [onChange]);

  // Sincronización lista ← canvas: scroll automático al elemento seleccionado
  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onDragEnd = useCallback((res) => {
    if (!res.destination || res.destination.index === res.source.index) return;
    const next = [...regions];
    const [moved] = next.splice(res.source.index, 1);
    next.splice(res.destination.index, 0, moved);
    commit(next);
  }, [regions, commit]);

  const move = useCallback((id, action) => {
    const idx = regions.findIndex(r => r.id === id);
    if (idx < 0) return;
    const next = [...regions];
    const [r] = next.splice(idx, 1);
    const target = action === 'top' ? 0
      : action === 'bottom' ? next.length
      : action === 'up' ? Math.max(0, idx - 1)
      : Math.min(next.length, idx + 1);
    next.splice(target, 0, r);
    commit(next);
  }, [regions, commit]);

  const patch = useCallback((id, changes) => {
    commit(regions.map(r => r.id === id ? { ...r, ...changes } : r));
  }, [regions, commit]);

  const toggleVisible = useCallback((id) => {
    const r = regions.find(x => x.id === id);
    if (r) patch(id, { visible: r.visible === false });
  }, [regions, patch]);

  const toggleLock = useCallback((id) => {
    const r = regions.find(x => x.id === id);
    if (r) patch(id, { locked: r.locked !== true });
  }, [regions, patch]);

  const rename = useCallback((id, name) => patch(id, { name }), [patch]);
  const changeColor = useCallback((id, hexColor) => patch(id, { color: hexColor, hex: hexColor }), [patch]);

  const remove = useCallback((id) => {
    if (regions.length <= 1) return;
    commit(regions.filter(r => r.id !== id));
    if (isolatedId === id) onIsolate?.(null);
    if (selectedId === id) onSelect?.(null);
  }, [regions, commit, isolatedId, selectedId, onIsolate, onSelect]);

  const toggleColorGroup = useCallback((color, show) => {
    commit(regions.map(r => r.color === color ? { ...r, visible: show } : r));
  }, [regions, commit]);

  // Optimizar secuencia por color — SOLO vista previa hasta confirmar
  const optimizeByColor = () => {
    const map = new Map();
    for (const r of regions) {
      if (!map.has(r.color)) map.set(r.color, []);
      map.get(r.color).push(r);
    }
    setOptimizePreview([...map.values()].flat());
  };
  const applyOptimize = () => { if (optimizePreview) commit(optimizePreview); };

  const groups = useMemo(() => {
    if (!groupByColor) return null;
    const map = new Map();
    for (const r of filtered) {
      if (!map.has(r.color)) map.set(r.color, []);
      map.get(r.color).push(r);
    }
    return [...map.entries()];
  }, [filtered, groupByColor]);

  const itemProps = (region) => ({
    region,
    number: numberOf.get(region.id) || 0,
    isSelected: selectedId === region.id,
    isIsolated: isolatedId === region.id,
    isFirst: numberOf.get(region.id) === 1,
    isLast: numberOf.get(region.id) === list.length,
    canDelete: regions.length > 1 && !optimizePreview,
    onSelect,
    onToggleVisible: toggleVisible,
    onToggleLock: toggleLock,
    onIsolate,
    onMove: move,
    onRename: rename,
    onChangeColor: changeColor,
    onDelete: remove,
  });

  const setRef = (id) => (el) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0f14]">
      {/* Cabecera */}
      <div className="px-3 py-2.5 border-b border-[#1e2130] space-y-2">
        <div className="flex items-center gap-1.5">
          <ListOrdered className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
          <span className="text-xs font-bold text-white truncate">
            Secuencia de regiones <span className="text-violet-400">({regions.length})</span>
          </span>
          <span className="flex-1" />
          <HeaderBtn onClick={onUndo} label="Deshacer" disabled={!canUndo}><Undo2 className="w-3.5 h-3.5" /></HeaderBtn>
          <HeaderBtn onClick={onRedo} label="Rehacer" disabled={!canRedo}><Redo2 className="w-3.5 h-3.5" /></HeaderBtn>
          {onClose && <HeaderBtn onClick={onClose} label="Cerrar panel"><X className="w-3.5 h-3.5" /></HeaderBtn>}
        </div>

        {onOpenVectorize && (
          <button
            onClick={onOpenVectorize}
            aria-label="Abrir separación de colores"
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-violet-500/40 bg-violet-900/20 text-violet-300 hover:bg-violet-900/40 text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            <Palette className="w-3.5 h-3.5" /> Separación de colores
          </button>
        )}

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o id..."
            aria-label="Buscar regiones"
            className="w-full bg-[#161a23] border border-[#2a2d3a] rounded pl-6 pr-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-1.5">
          <select
            value={colorFilter}
            onChange={e => setColorFilter(e.target.value)}
            aria-label="Filtrar por color"
            className="flex-1 min-w-0 bg-[#161a23] border border-[#2a2d3a] rounded px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="">Todos los colores</option>
            {colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={visFilter}
            onChange={e => setVisFilter(e.target.value)}
            aria-label="Filtrar por visibilidad"
            className="flex-1 min-w-0 bg-[#161a23] border border-[#2a2d3a] rounded px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-violet-500"
          >
            {VIS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setGroupByColor(g => !g)}
            aria-label="Agrupar visualmente por color"
            title="Agrupación visual — no cambia el orden real"
            className={`flex-1 text-[10px] py-1 rounded border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${groupByColor ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-300' : 'border-[#2a2d3a] text-slate-500 hover:text-slate-300'}`}
          >
            Agrupar color
          </button>
          <button
            onClick={optimizeByColor}
            disabled={!!optimizePreview || regions.length < 2}
            aria-label="Optimizar secuencia por color (con vista previa)"
            title="Propone un orden agrupado por color — requiere confirmación"
            className="flex-1 text-[10px] py-1 rounded border border-[#2a2d3a] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />Optimizar por color
          </button>
        </div>

        {(isolatedId || !dndEnabled) && !optimizePreview && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
            <Filter className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="flex-1">
              {isolatedId ? 'Región aislada en el lienzo.' : 'Con filtros o agrupación activos no se puede arrastrar.'}
            </span>
            {isolatedId && (
              <button onClick={() => onIsolate?.(null)} aria-label="Salir de aislamiento" className="px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-500/30 hover:bg-amber-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">Salir</button>
            )}
          </div>
        )}
      </div>

      {/* Banner de vista previa de optimización */}
      {optimizePreview && (
        <div className="px-3 py-2 border-b border-violet-500/30 bg-violet-950/30 flex items-center gap-2">
          <span className="flex-1 text-[10px] text-violet-300 font-bold">Vista previa del nuevo orden — no aplicada</span>
          <button onClick={applyOptimize} aria-label="Aplicar nuevo orden" className="text-[10px] px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">Aplicar</button>
          <button onClick={() => setOptimizePreview(null)} aria-label="Cancelar nuevo orden" className="text-[10px] px-2 py-1 rounded bg-[#2a2d3a] text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">Cancelar</button>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && (
          <div className="text-center text-slate-600 text-xs py-12">No hay regiones</div>
        )}

        {groupByColor && groups ? (
          groups.map(([color, items]) => (
            <div key={color}>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#0d0f14] border-b border-[#1e2130]">
                <span className="w-2.5 h-2.5 rounded-full border border-white/10 flex-shrink-0" style={{ background: color }} />
                <span className="text-[10px] font-bold text-slate-300 font-mono uppercase">{color}</span>
                <span className="text-[10px] text-slate-600">{items.length} reg</span>
                <span className="flex-1" />
                <button
                  onClick={() => setColorFilter(color)}
                  aria-label={`Seleccionar todas las regiones de color ${color}`}
                  title="Filtrar por este color"
                  className="text-[9px] px-1.5 py-0.5 rounded border border-[#2a2d3a] text-slate-500 hover:text-cyan-300 hover:border-cyan-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  Filtrar
                </button>
                <HeaderBtn
                  onClick={() => toggleColorGroup(color, items.some(r => r.visible === false))}
                  label={items.some(r => r.visible === false) ? 'Mostrar todo el grupo' : 'Ocultar todo el grupo'}
                >
                  {items.some(r => r.visible === false) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </HeaderBtn>
              </div>
              {items.map(region => (
                <div key={region.id} ref={setRef(region.id)}>
                  <SequenceItem {...itemProps(region)} dndEnabled={false} dragHandleProps={null} />
                </div>
              ))}
            </div>
          ))
        ) : dndEnabled ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="sequence-list">
              {(dropProvided) => (
                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                  {filtered.map((region, index) => (
                    <Draggable key={region.id} draggableId={String(region.id)} index={index} isDragDisabled={region.locked === true}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={(el) => { dragProvided.innerRef(el); setRef(region.id)(el); }}
                          {...dragProvided.draggableProps}
                          className={snapshot.isDragging ? 'bg-[#1a1e2d] shadow-2xl ring-1 ring-violet-500/50' : ''}
                        >
                          <SequenceItem {...itemProps(region)} dndEnabled dragHandleProps={dragProvided.dragHandleProps} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          filtered.map(region => (
            <div key={region.id} ref={setRef(region.id)}>
              <SequenceItem {...itemProps(region)} dndEnabled={false} dragHandleProps={null} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}