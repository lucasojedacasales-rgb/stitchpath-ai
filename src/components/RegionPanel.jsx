// ============================================
// RegionPanel.jsx - Panel de Regiones
// ============================================

import React, { useState, useMemo } from 'react';

const STITCH_TYPE_CONFIG = {
  fill: { icon: '▦', label: 'Fill', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  satin: { icon: '✨', label: 'Satín', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  running_stitch: { icon: '—', label: 'Running', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  run: { icon: '—', label: 'Running', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
};

const RegionPanel = ({ 
  regions = [], 
  selectedRegionId, 
  onSelectRegion, 
  onToggleVisibility,
  stats = {}
}) => {
  const [filter, setFilter] = useState('all');

  const filteredRegions = useMemo(() => {
    if (filter === 'all') return regions;
    return regions.filter(r => {
      if (filter === 'run') return r.stitchType === 'running_stitch' || r.stitchType === 'run';
      return r.stitchType === filter;
    });
  }, [regions, filter]);

  const getStitchBadge = (type) => {
    const config = STITCH_TYPE_CONFIG[type] || STITCH_TYPE_CONFIG.fill;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: config.color,
        background: config.bg
      }}>
        {config.icon} {config.label}
      </span>
    );
  };

  const formatNumber = (n) => n?.toLocaleString() || '0';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#1e1e2e',
      borderRadius: 12,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🧵</span>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 600 }}>
            Regiones ({regions.length})
          </h3>
        </div>
        
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all', label: 'Todas', icon: '🔍' },
            { key: 'fill', label: 'Fill', icon: '▦' },
            { key: 'satin', label: 'Satín', icon: '✨' },
            { key: 'run', label: 'Run', icon: '—' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: filter === f.key ? '#6366f1' : 'transparent',
                color: filter === f.key ? '#fff' : '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        padding: '12px 16px',
        background: '#252538',
        gap: 8
      }}>
        <StatBox label="Puntadas" value={formatNumber(stats.totalStitches)} />
        <StatBox label="Colores" value={stats.colors || 0} />
        <StatBox label="Tamaño" value={stats.size || '—'} />
      </div>

      {/* Lista de regiones */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px'
      }}>
        {filteredRegions.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
            No hay regiones {filter !== 'all' ? `de tipo "${filter}"` : ''}
          </div>
        )}
        
        {filteredRegions.map(region => {
          const isSelected = region.id === selectedRegionId;
          
          return (
            <div
              key={region.id}
              onClick={() => onSelectRegion(isSelected ? null : region.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                marginBottom: 4,
                borderRadius: 8,
                background: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
                opacity: region.hidden ? 0.4 : 1
              }}
              onMouseEnter={e => e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.15)' : 'transparent'}
            >
              {/* Color swatch */}
              <div style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: region.color || '#ccc',
                border: '2px solid rgba(255,255,255,0.2)',
                flexShrink: 0
              }} />
              
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 2
                }}>
                  <span style={{
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'monospace'
                  }}>
                    {region.color || '—'}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>
                    · {region.stitchType || 'fill'}
                  </span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>
                  {formatNumber(region.stitchCount || 0)} pts
                  {' · '}
                  {region.density || 0.4}d
                  {' · '}
                  {region.angle || 0}°
                </div>
              </div>
              
              {/* Badges y acciones */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {getStitchBadge(region.stitchType)}
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility?.(region.id);
                  }}
                  style={iconButtonStyle}
                  title={region.hidden ? 'Mostrar' : 'Ocultar'}
                >
                  {region.hidden ? '👁‍🗨' : '👁'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a3e' }}>
        <button
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 8,
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          ✓ Confirmar y exportar
        </button>
      </div>
    </div>
  );
};

const StatBox = ({ label, value }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ color: '#9ca3af', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 2 }}>
      {value}
    </div>
  </div>
);

const iconButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: 4,
  fontSize: 14,
  lineHeight: 1
};

export default RegionPanel;
