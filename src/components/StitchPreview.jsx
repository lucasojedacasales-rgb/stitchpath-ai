// ============================================
// StitchPreview.jsx - Vista Previa de Puntadas
// ============================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import StitchFlowEngine from '../engine/StitchFlowEngine';

const StitchPreview = ({ 
  regions = [], 
  width = 700, 
  height = 600,
  onRegionSelect,
  selectedRegionId,
  backgroundColor = '#1a1a2e',
  showGrid = true
}) => {
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredRegion, setHoveredRegion] = useState(null);
  
  const engine = useRef(new StitchFlowEngine());
  const stitchCache = useRef(new Map());

  // Helpers de color
  const lightenColor = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  };

  const darkenColor = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  };

  // Generar puntadas con cache
  const getStitches = (region) => {
    const cacheKey = `${region.id}-${region.stitchType}-${region.angle}-${region.density}-${region.color}`;
    if (stitchCache.current.has(cacheKey)) {
      return stitchCache.current.get(cacheKey);
    }
    
    const result = engine.current.processRegion(region);
    stitchCache.current.set(cacheKey, result);
    return result;
  };

  // Renderizar una puntada
  const renderStitch = (ctx, stitch, color, scale = 1, isSelected = false) => {
    const baseWidth = (stitch.width || 0.7) * scale;
    
    if (stitch.type === 'running') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(stitch.x, stitch.y, baseWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = lightenColor(color, 40);
      ctx.beginPath();
      ctx.arc(stitch.x - baseWidth/6, stitch.y - baseWidth/6, baseWidth/4, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (stitch.type === 'underlay') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = baseWidth * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      
    } else {
      // Sombra
      ctx.strokeStyle = darkenColor(color, 30);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = baseWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stitch.x1 + 0.5, stitch.y1 + 0.5);
      ctx.lineTo(stitch.x2 + 0.5, stitch.y2 + 0.5);
      ctx.stroke();
      
      // Hilo principal
      ctx.globalAlpha = isSelected ? 1 : 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = baseWidth;
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      
      // Brillo del hilo
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = lightenColor(color, 35);
      ctx.lineWidth = baseWidth * 0.25;
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      
      ctx.globalAlpha = 1;
    }
  };

  // Render principal
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < width; i += 20) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
      }
      for (let i = 0; i < height; i += 20) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
      }
    }
    
    ctx.save();
    ctx.translate(width/2 + pan.x, height/2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width/2, -height/2);
    
    // Calcular centro del diseño
    let allBounds = null;
    regions.forEach(r => {
      const stitches = getStitches(r);
      if (stitches?.bounds) {
        const b = stitches.bounds;
        if (!allBounds) allBounds = { ...b };
        else {
          allBounds.minX = Math.min(allBounds.minX, b.minX);
          allBounds.minY = Math.min(allBounds.minY, b.minY);
          allBounds.maxX = Math.max(allBounds.maxX, b.maxX);
          allBounds.maxY = Math.max(allBounds.maxY, b.maxY);
        }
      }
    });
    
    if (allBounds) {
      const centerX = (allBounds.minX + allBounds.maxX) / 2;
      const centerY = (allBounds.minY + allBounds.maxY) / 2;
      ctx.translate(width/2 - centerX, height/2 - centerY);
    }
    
    // Renderizar regiones (no seleccionadas primero)
    const sortedRegions = [...regions].sort((a, b) => {
      if (a.id === selectedRegionId) return 1;
      if (b.id === selectedRegionId) return -1;
      return 0;
    });
    
    sortedRegions.forEach(region => {
      if (region.hidden) return;
      
      const isSelected = region.id === selectedRegionId;
      const isHovered = region.id === hoveredRegion;
      const stitches = getStitches(region);
      
      if (!stitches) return;
      
      // Underlay primero
      if (stitches.underlay?.length > 0) {
        stitches.underlay.forEach(stitch => {
          renderStitch(ctx, stitch, region.color, isSelected ? 1.2 : 1);
        });
      }
      
      // Puntadas principales
      if (stitches.fill?.length > 0) {
        stitches.fill.forEach(stitch => {
          renderStitch(ctx, stitch, region.color, isSelected ? 1.3 : (isHovered ? 1.1 : 1), isSelected);
        });
      }
      
      // Highlight de región seleccionada
      if (isSelected && stitches.bounds) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([8 / zoom, 4 / zoom]);
        ctx.strokeRect(
          stitches.bounds.minX - 8, 
          stitches.bounds.minY - 8,
          stitches.bounds.maxX - stitches.bounds.minX + 16,
          stitches.bounds.maxY - stitches.bounds.minY + 16
        );
        ctx.setLineDash([]);
      }
    });
    
    ctx.restore();
    
    // Info overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, 10, 180, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Zoom: ${Math.round(zoom * 100)}%`, 20, 30);
    ctx.fillText(`Regiones: ${regions.length}`, 20, 45);
    const totalStitches = regions.reduce((sum, r) => sum + (getStitches(r)?.totalStitches || 0), 0);
    ctx.fillText(`Puntadas: ${totalStitches.toLocaleString()}`, 20, 60);
    
  }, [regions, zoom, pan, selectedRegionId, hoveredRegion]);

  // Event handlers
  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (window.devicePixelRatio || 1),
      y: (e.clientY - rect.top) * (window.devicePixelRatio || 1)
    };
  };

  const screenToWorld = (screenX, screenY) => {
    const centerX = width / 2;
    const centerY = height / 2;
    return {
      x: (screenX - centerX - pan.x) / zoom + centerX,
      y: (screenY - centerY - pan.y) / zoom + centerY
    };
  };

  const handleClick = (e) => {
    if (isDragging) return;
    
    const { x, y } = getCanvasCoords(e);
    const worldPos = screenToWorld(x, y);
    
    let clickedRegion = null;
    for (const region of regions) {
      const stitches = getStitches(region);
      if (!stitches?.bounds || region.hidden) continue;
      
      const b = stitches.bounds;
      if (worldPos.x >= b.minX && worldPos.x <= b.maxX &&
          worldPos.y >= b.minY && worldPos.y <= b.maxY) {
        clickedRegion = region;
        break;
      }
    }
    
    if (clickedRegion && onRegionSelect) {
      onRegionSelect(clickedRegion.id === selectedRegionId ? null : clickedRegion.id);
    } else if (onRegionSelect) {
      onRegionSelect(null);
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoords(e);
    
    if (isDragging) {
      setPan({
        x: x - dragStart.x,
        y: y - dragStart.y
      });
      return;
    }
    
    const worldPos = screenToWorld(x, y);
    let foundHover = null;
    
    for (const region of regions) {
      const stitches = getStitches(region);
      if (!stitches?.bounds || region.hidden) continue;
      const b = stitches.bounds;
      if (worldPos.x >= b.minX && worldPos.x <= b.maxX &&
          worldPos.y >= b.minY && worldPos.y <= b.maxY) {
        foundHover = region.id;
        break;
      }
    }
    
    setHoveredRegion(foundHover);
  };

  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoords(e);
    setIsDragging(true);
    setDragStart({ x: x - pan.x, y: y - pan.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.3, Math.min(8, z * delta)));
  };

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    stitchCache.current.clear();
  }, [regions.length]);

  const zoomButtonStyle = {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    width: 28,
    height: 28,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '12px',
          cursor: isDragging ? 'grabbing' : (hoveredRegion ? 'pointer' : 'crosshair'),
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Zoom controls */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        gap: 4,
        background: 'rgba(0,0,0,0.7)',
        padding: '4px',
        borderRadius: '8px'
      }}>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} style={zoomButtonStyle}>−</button>
        <span style={{ color: '#fff', padding: '4px 8px', fontSize: 12, minWidth: 50, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} style={zoomButtonStyle}>+</button>
        <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} style={zoomButtonStyle} title="Reset">⟲</button>
      </div>
      
      {/* Leyenda */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(0,0,0,0.6)',
        padding: '8px 12px',
        borderRadius: '8px',
        color: '#fff',
        fontSize: 11
      }}>
        <div>🖱️ Click: seleccionar región</div>
        <div>🖱️ Drag: mover vista</div>
        <div>📜 Scroll: zoom</div>
      </div>
    </div>
  );
};

export default StitchPreview;
