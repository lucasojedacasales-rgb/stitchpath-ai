// ============================================
// App.jsx - StitchPath AI con StitchFlow Engine
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import StitchPreview from './components/StitchPreview';
import RegionPanel from './components/RegionPanel';
import StitchFlowEngine from './engine/StitchFlowEngine';

function App() {
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');

  // Cargar datos de ejemplo al inicio
  useEffect(() => {
    loadExampleData();
  }, []);

  const loadExampleData = () => {
    const engine = new StitchFlowEngine();
    
    const exampleRegions = [
      {
        id: 'region-1',
        color: '#01a401',
        stitchType: 'fill',
        polygon: [
          {x: 100, y: 100}, {x: 200, y: 80}, {x: 250, y: 150}, 
          {x: 220, y: 220}, {x: 120, y: 200}
        ],
        angle: 45,
        density: 0.4,
        stitchWidth: 0.7,
        underlay: true,
        hidden: false
      },
      {
        id: 'region-2',
        color: '#02a100',
        stitchType: 'fill',
        polygon: [
          {x: 150, y: 150}, {x: 280, y: 140}, {x: 300, y: 250}, 
          {x: 200, y: 280}, {x: 140, y: 220}
        ],
        angle: -30,
        density: 0.5,
        stitchWidth: 0.7,
        underlay: true,
        hidden: false
      },
      {
        id: 'region-3',
        color: '#069f05',
        stitchType: 'satin',
        path: [
          {x: 180, y: 180}, {x: 220, y: 190}, {x: 260, y: 210}, 
          {x: 280, y: 240}
        ],
        angle: 0,
        density: 0.3,
        stitchWidth: 0.5,
        underlay: true,
        hidden: false
      },
      {
        id: 'region-4',
        color: '#0e0d0c',
        stitchType: 'running_stitch',
        path: [
          {x: 80, y: 80}, {x: 320, y: 80}, {x: 320, y: 320}, 
          {x: 80, y: 320}, {x: 80, y: 80}
        ],
        angle: 0,
        density: 1.0,
        stitchWidth: 0.4,
        underlay: false,
        hidden: false
      }
    ];
    
    const regionsWithCount = exampleRegions.map(r => {
      const stitches = engine.processRegion(r);
      return { 
        ...r, 
        stitchCount: stitches.totalStitches
      };
    });
    
    setRegions(regionsWithCount);
  };

  const handleSelectRegion = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  const handleToggleVisibility = useCallback((id) => {
    setRegions(prev => prev.map(r => 
      r.id === id ? { ...r, hidden: !r.hidden } : r
    ));
  }, []);

  const stats = {
    totalStitches: regions.reduce((sum, r) => sum + (r.stitchCount || 0), 0),
    colors: new Set(regions.map(r => r.color)).size,
    size: '100×100mm'
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f0f1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid #2a2a3e',
        background: '#1a1a2e',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🪡</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>StitchPath AI</h1>
            <div style={{ fontSize: 11, color: '#6b7280' }}>StitchFlow Engine v2.0</div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer'
          }}>
            ⚡ Generar Preview
          </button>
          <button style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #6366f1',
            background: 'transparent',
            color: '#6366f1',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer'
          }}>
            📥 Exportar
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: 16,
        padding: 16,
        overflow: 'hidden'
      }}>
        {/* Canvas */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0
        }}>
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '4px',
            background: '#1a1a2e',
            borderRadius: 8,
            width: 'fit-content'
          }}>
            {['Editor', 'Máscara', 'Vista Previa', 'Panel'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === tab ? '#6366f1' : 'transparent',
                  color: activeTab === tab ? '#fff' : '#9ca3af',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 16,
            position: 'relative'
          }}>
            {regions.length > 0 ? (
              <StitchPreview
                regions={regions}
                selectedRegionId={selectedRegionId}
                onRegionSelect={handleSelectRegion}
                width={700}
                height={550}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 64 }}>🖼️</div>
                <div>Cargando...</div>
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho */}
        <div style={{ 
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flexShrink: 0
        }}>
          <div style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 16
          }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Imagen</span>
                <span style={{ fontSize: 12, color: '#6366f1' }}>0%</span>
              </div>
              <input type="range" min="0" max="100" defaultValue="0" style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Puntadas</span>
                <span style={{ fontSize: 12, color: '#6366f1' }}>100%</span>
              </div>
              <input type="range" min="0" max="100" defaultValue="100" style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <RegionPanel
              regions={regions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={handleSelectRegion}
              onToggleVisibility={handleToggleVisibility}
              stats={stats}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
