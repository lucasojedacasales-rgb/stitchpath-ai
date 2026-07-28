import React, { useState, useRef } from 'react';
import {
  GripVertical, Eye, EyeOff, Lock, Unlock, Focus, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine, Trash2, Pencil,
} from 'lucide-react';
import RegionThumbnail from './RegionThumbnail';

const TYPE_BADGE = {
  fill: ['badge-fill', 'fill'],
  satin: ['badge-satin', 'sat'],
  running_stitch: ['badge-run', 'run'],
};

function IconBtn({ onClick, label, active, danger, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-30 disabled:cursor-not-allowed
        ${danger ? 'text-slate-500 hover:text-red-400 hover:bg-red-900/20'
          : active ? 'text-violet-300 bg-violet-900/30'
          : 'text-slate-500 hover:text-white hover:bg-[#2a2d3a]'}`}
    >
      {children}
    </button>
  );
}

export default React.memo(function SequenceItem({
  region, number, isSelected, isIsolated, isFirst, isLast, canDelete,
  dndEnabled, dragHandleProps,
  onSelect, onToggleVisible, onToggleLock, onIsolate, onMove, onRename, onChangeColor, onDelete,
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const colorTimer = useRef(null);

  const locked = region.locked === true;
  const hidden = region.visible === false;
  const [badgeCls, badgeTxt] = TYPE_BADGE[region.stitch_type] || ['badge-run', region.type || 'run'];

  const commitName = () => {
    const v = nameDraft.trim();
    if (v && v !== region.name) onRename(region.id, v);
    setEditingName(false);
  };

  return (
    <div className={`border-b border-[#1a1d27] ${isSelected ? 'bg-violet-900/20 border-l-2 border-l-violet-500' : 'hover:bg-[#161a23]'} ${hidden ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer" onClick={() => onSelect(region.id)}>
        {dndEnabled ? (
          <span
            {...(dragHandleProps || {})}
            aria-label={`Arrastrar región ${number}`}
            title={locked ? 'Región bloqueada' : 'Arrastrar para reordenar'}
            onClick={e => e.stopPropagation()}
            className={`flex-shrink-0 text-slate-600 hover:text-slate-300 ${locked ? 'opacity-30 cursor-not-allowed' : 'cursor-grab'}`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        ) : <span className="w-3.5 flex-shrink-0" />}

        <span className="w-6 text-center text-[10px] font-bold text-violet-300 bg-violet-900/20 rounded flex-shrink-0 py-0.5">{number}</span>

        <RegionThumbnail region={region} size={28} />

        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
              aria-label="Nombre de la región"
              className="w-full bg-[#1e2130] border border-violet-500/50 rounded px-1 py-0.5 text-[11px] text-white focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] text-slate-200 font-medium truncate">{region.name || region.id}</span>
              <span className={`px-1 rounded text-[9px] font-bold flex-shrink-0 ${badgeCls}`}>{badgeTxt}</span>
              {locked && <Lock className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
            <span className="inline-block w-2 h-2 rounded-full border border-white/20 flex-shrink-0" style={{ background: region.color }} />
            <span className="font-mono uppercase">{region.color}</span>
            <span>·</span>
            <span>{region.path_points?.length || 0} pts</span>
          </div>
        </div>

        <div className="flex items-center flex-shrink-0" onClick={e => e.stopPropagation()}>
          <IconBtn onClick={() => onToggleVisible(region.id)} label={hidden ? 'Mostrar región' : 'Ocultar región'}>
            {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </IconBtn>
          <IconBtn onClick={() => onIsolate(isIsolated ? null : region.id)} label={isIsolated ? 'Salir de aislamiento' : 'Aislar región'} active={isIsolated}>
            <Focus className="w-3 h-3" />
          </IconBtn>
          <IconBtn onClick={() => { setExpanded(v => !v); setConfirmDelete(false); }} label={expanded ? 'Cerrar acciones' : 'Más acciones'} active={expanded}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </IconBtn>
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2 flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
          <IconBtn onClick={() => onMove(region.id, 'top')} label="Enviar al principio" disabled={isFirst || locked}><ArrowUpToLine className="w-3 h-3" /></IconBtn>
          <IconBtn onClick={() => onMove(region.id, 'up')} label="Subir una posición" disabled={isFirst || locked}><ArrowUp className="w-3 h-3" /></IconBtn>
          <IconBtn onClick={() => onMove(region.id, 'down')} label="Bajar una posición" disabled={isLast || locked}><ArrowDown className="w-3 h-3" /></IconBtn>
          <IconBtn onClick={() => onMove(region.id, 'bottom')} label="Enviar al final" disabled={isLast || locked}><ArrowDownToLine className="w-3 h-3" /></IconBtn>
          <span className="w-px h-4 bg-[#2a2d3a] mx-0.5" />
          <IconBtn onClick={() => onToggleLock(region.id)} label={locked ? 'Desbloquear región' : 'Bloquear región'} active={locked}>
            {locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          </IconBtn>
          <IconBtn onClick={() => { setNameDraft(region.name || ''); setEditingName(true); }} label="Editar nombre" disabled={locked}><Pencil className="w-3 h-3" /></IconBtn>
          <label
            className={`relative p-1 rounded text-slate-500 hover:bg-[#2a2d3a] ${locked ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}`}
            title="Cambiar color"
          >
            <span className="block w-3 h-3 rounded-sm border border-white/30" style={{ background: region.color }} />
            <input
              type="color"
              defaultValue={region.color}
              disabled={locked}
              aria-label="Cambiar color de la región"
              onChange={e => {
                const v = e.target.value;
                clearTimeout(colorTimer.current);
                colorTimer.current = setTimeout(() => { if (v !== region.color) onChangeColor(region.id, v); }, 500);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
          <span className="flex-1" />
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-[10px]">
              <span className="text-red-300 font-bold">¿Eliminar?</span>
              <button onClick={() => onDelete(region.id)} aria-label="Confirmar eliminación" className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">Sí</button>
              <button onClick={() => setConfirmDelete(false)} aria-label="Cancelar eliminación" className="px-1.5 py-0.5 rounded bg-[#2a2d3a] text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">No</button>
            </span>
          ) : (
            <IconBtn onClick={() => setConfirmDelete(true)} label="Eliminar región" danger disabled={locked || !canDelete}><Trash2 className="w-3 h-3" /></IconBtn>
          )}
        </div>
      )}
    </div>
  );
});