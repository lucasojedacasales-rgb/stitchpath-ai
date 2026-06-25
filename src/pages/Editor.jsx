// ============================================
// Editor.jsx - Página principal del editor de bordado
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import StitchPreview from '../components/StitchPreview';
import RegionPanel from '../components/RegionPanel';
import { useEmbroideryPresets } from '../hooks/useEmbroideryPresets';

const Editor = () => {
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [designData, setDesignData] = useState(null);
  
  const { presets, applyPreset } = useEmbroideryPresets();

  // Cargar datos del diseño actual (de tu motor híbrido)
  useEffect(() => {
    // Esto se conecta con tu API de Base44
    loadDesignData();
  }, []);

  const loadDesignData = async () => {
    try {
      // Si tienes un endpoint específico, cámbialo aquí
      const response = await fetch('/api/hybridDigitize/status');
      const data = await response.json();
      
      if (data.regions) {
        // Transformar datos del motor híbrido al formato de StitchFlow
        const formattedRegions = data.regions.map((r, index) => ({
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
          hidden: false,
          // Metadatos para el panel
          stitchCount: r.stitchCount || 0,
          bounds: r.bounds
        }));
        
        setRegions(formattedRegions);
        setDesignData(data);
      }
    } catch (error) {
      console.error('Error cargando diseño:', error);
    }
  };

  // Inferir tipo de puntada basado en la región
  const inferStitchType = (region) => {
    if (region.isContour || region.type === 'outline') return 'running_stitch';
    if (region.isFill || region.type === 'fill') return 'fill';
    if (region.width && region.width < 3) return 'satin';
    return 'fill';
  };

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

  const stats = {
    totalStitches: regions.reduce((sum, r) => sum + (r.stitchCount || 0), 0),
    colors: new Set(regions.map(r => r.color)).size,
    size: designData?.size || '100×100mm'
  };

  // Generar preview llamando al backend
  const generatePreview = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/renderStitchPreview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions })
      });
      const data = await response.json();
      
      if (data.regions) {
        // Actualizar con datos del servidor (puntadas calculadas)
        setRegions(prev => prev.map(r => {
          const serverRegion = data.regions.find(sr => sr.id === r.id);
          if (serverRegion) {
            return { ...r, stitches: serverRegion.stitches, stitchCount: serverRegion.totalStitches };
          }
          return r;
        }));
      }
    } catch (error) {
      console.error('Error generando preview:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="editor-page" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f0f1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid #2a2a3e',
        background: '#1a1a2e'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🪡</span>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>StitchPath AI</h1>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            onClick={generatePreview}
            disabled={loading}
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
            {loading ? '⏳ Generando...' : '⚡ Generar Preview'}
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
        {/* Canvas de preview */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Tabs del editor */}
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
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: tab === 'Vista Previa' ? '#6366f1' : 'transparent',
                  color: tab === 'Vista Previa' ? '#fff' : '#9ca3af',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 16
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
                <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                <div>Carga una imagen para comenzar</div>
              </div>
            )}
          </div>
        </div>

        {/* Panel lateral */}
        <div style={{ 
          width: 340,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Sliders de mezcla (como tenías antes) */}
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
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue="0"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>Puntadas</span>
                <span style={{ fontSize: 12, color: '#6366f1' }}>100%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                defaultValue="100"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Panel de regiones */}
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
};

export default Editor;
