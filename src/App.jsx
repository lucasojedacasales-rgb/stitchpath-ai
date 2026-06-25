// ============================================
// App.jsx - StitchPath AI con StitchFlow Engine
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import StitchPreview from './components/StitchPreview';
import RegionPanel from './components/RegionPanel';
import { useEmbroideryPresets } from './hooks/useEmbroideryPresets';

// Si Base44 genera un cliente automático, impórtalo así:
// import base44 from './api/base44Client';

function App() {
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [designData, setDesignData] = useState(null);
  const [activeTab, setActiveTab] = useState('preview'); // 'editor', 'mask', 'preview', 'panel'
  
  const { presets, applyPreset } = useEmbroideryPresets();

  // ==========================================
  // CARGAR DATOS DEL DISEÑO
  // ==========================================
  
  // Simulación de carga de datos - REEMPLAZA esto con tu llamada real a Base44
  useEffect(() => {
    // Ejemplo de cómo conectar con tu API de Base44:
    // const loadDesign = async () => {
    //   try {
    //     const result = await base44.hybridDigitize({ /* params */ });
    //     if (result.regions) {
    //       formatRegions(result.regions);
    //     }
    //   } catch (e) {
    //     console.error('Error cargando diseño:', e);
    //   }
    // };
    // loadDesign();

    // Por ahora, datos de ejemplo para que veas cómo se ve:
    loadExampleData();
  }, []);

  const loadExampleData = () => {
    // Datos de ejemplo - REEMPLAZA con tus datos reales
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
    
    setRegions(exampleRegions);
  };

  // ==========================================
  // FORMATEAR REGIONES (cuando vienen del backend)
  // ==========================================
  
  const formatRegions = (rawRegions) => {
    const formatted = rawRegions.map((r, index) => ({
      id: r.id || `region-${index}`,
      color: r.color || r.hex || '#ffffff',
      stitchType: r.stitchType || inferStitchType(r),
      polygon: r.polygon || r.points || r.contour,
      path: r.path,
      angle: r.angle || 0,
      density: r.density || 0.4,
      stitchWidth: r.stitchWidth || 0.7,
      stitchLength: r.stitchLength || 2.5,
      underlay: r.underlay !== false,
      underlayDensity: r.underlayDensity || 0.8,
      underlayAngle: r.underlayAngle || 45,
      hidden: r.hidden || false
    }));
    
    setRegions(formatted);
  };

  const inferStitchType = (region) => {
    if (region.isContour || region.type === 'outline') return 'running_stitch';
    if (region.isFill || region.type === 'fill') return 'fill';
    if (region.width && region.width < 3) return 'satin';
    return 'fill';
  };

  // ==========================================
  // HANDLERS
  // ==========================================
  
  const handleSelectRegion = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  const handleToggleVisibility = useCallback((id) => {
    setRegions(prev => prev.map(r => 
      r.id === id ? { ...r, hidden: !r.hidden } : r
    ));
  }, []);

  const handleUpdateRegion = useCallback((id, updates) => {
    setRegions(prev => prev.map(r => 
      r.id === id ? { ...r, ...updates } : r
    ));
  }, []);

  const handleApplyPreset = useCallback((regionId, presetId) => {
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    const updated = applyPreset(presetId, region);
    handleUpdateRegion(regionId, updated);
  }, [regions, applyPreset, handleUpdateRegion]);

  // ==========================================
  // GENERAR PREVIEW CON BACKEND
  // ==========================================
  
  const generatePreview = async () => {
    setLoading(true);
    try {
      // Opción A: Usar StitchFlowEngine en frontend (ya está en StitchPreview)
      // No necesitas llamar al backend, el canvas ya renderiza todo
      
      // Opción B: Si quieres usar el backend para cálculos pesados:
      // const response = await base44.stitchFlowEngine({ regions });
      // if (response.regions) {
      //   setRegions(prev => prev.map(r => {
      //     const serverRegion = response.regions.find(sr => sr.id === r.id);
      //     if (serverRegion) {
      //       return { ...r, stitches: serverRegion.stitches, stitchCount: serverRegion.totalStitches };
      //     }
      //     return r;
      //   }));
      // }
      
      console.log('Preview generado con', regions.length, 'regiones');
    } catch (error) {
      console.error('Error generando preview:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // STATS
  // ==========================================
  
  const stats = {
    totalStitches: regions.reduce((sum, r) => sum + (r.stitchCount || 0), 0),
    colors: new Set(regions.map(r => r.color)).size,
    size: designData?.size || '100×100mm'
  };

  // ==========================================
  // RENDER
  // ==========================================
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f0f1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden'
    }}>
      {/* ===== HEADER ===== */}
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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Pipeline steps */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
            {[
              { label: 'Subir imagen', done: true },
              { label: 'Vectorizar', done: true },
              { label: 'Ajustar', done: true, active: true },
              { label: 'Simular', done: false },
              { label: 'Exportar', done: false }
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: step.done ? '#22c55e' : (step.active ? '#6366f1' : '#2a2a3e'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10
                }}>
                  {step.done ? '✓' : (i + 1)}
                </div>
                <span style={{ 
                  fontSize: 11, 
                  color: step.active ? '#6366f1' : (step.done ? '#22c55e' : '#6b7280'),
                  fontWeight: step.active ? 600 : 400
                }}>
                  {step.label}
                </span>
                {i < 4 && <span style={{ color: '#2a2a3e', marginLeft: 4 }}>→</span>}
              </div>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={generatePreview}
              disabled={loading || regions.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#4a4a5e' : '#6366f1',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {loading ? '⏳' : '⚡'} {loading ? 'Generando...' : 'Generar Preview'}
            </button>
            
            <button style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #6366f1',
              background: 'transparent',
              color: '#6366f1',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              📥 Exportar
            </button>
          </div>
        </div>
      </header>

      {/* ===== CONTENIDO PRINCIPAL ===== */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: 16,
        padding: 16,
        overflow: 'hidden'
      }}>
        {/* --- Panel izquierdo: Canvas --- */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '4px',
            background: '#1a1a2e',
            borderRadius: 8,
            width: 'fit-content'
          }}>
            {[
              { id: 'editor', label: 'Editor' },
              { id: 'mask', label: 'Máscara' },
              { id: 'preview', label: 'Vista Previa' },
              { id: 'panel', label: 'Panel' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeTab === tab.id ? '#6366f1' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#9ca3af',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Canvas container */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 16,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {regions.length > 0 ? (
              <StitchPreview
                regions={regions}
                selectedRegionId={selectedRegionId}
                onRegionSelect={handleSelectRegion}
                width={Math.min(700, window.innerWidth - 400)}
                height={Math.min(600, window.innerHeight - 200)}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🖼️</div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>No hay regiones cargadas</div>
                <div style={{ fontSize: 13 }}>Sube una imagen y digitalízala para comenzar</div>
              </div>
            )}
            
            {/* Badge de info */}
            {regions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: 24,
                left: 24,
                background: 'rgba(0,0,0,0.6)',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                color: '#9ca3af'
              }}>
                <div>🖱️ Click: seleccionar región</div>
                <div>🖱️ Drag: mover vista</div>
                <div>📜 Scroll: zoom</div>
              </div>
            )}
          </div>
        </div>

        {/* --- Panel derecho: Controles --- */}
        <div style={{ 
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flexShrink: 0
        }}>
          {/* Sliders de mezcla */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 16
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Imagen</span>
                <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>0%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue="0"
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Puntadas</span>
                <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>100%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue="100"
                style={{ width: '100%', accentColor: '#6366f1' }}
              />
            </div>
          </div>

          {/* Toggle Rellenos/Contornos */}
          <div style={{
            display: 'flex',
            gap: 8,
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 12
          }}>
            <button style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer'
            }}>
              ▦ Rellenos
            </button>
            <button style={{
              flex: 1,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #3a3a4e',
              background: 'transparent',
              color: '#9ca3af',
              fontSize: 12,
              cursor: 'pointer'
            }}>
              — Contornos
            </button>
          </div>

          {/* Panel de regiones */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
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
