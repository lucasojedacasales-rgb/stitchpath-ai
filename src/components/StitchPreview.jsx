import React, { useRef, useEffect, useState, useCallback } from 'react';
import StitchFlowEngine from '../engine/StitchFlowEngine';

const StitchPreview = ({ 
  regions = [], 
  width = 700, 
  height = 550,
  onRegionSelect,
  selectedRegionId
}) => {
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const engine = useRef(new StitchFlowEngine());
  const stitchCache = useRef(new Map());

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

  const getStitches = (region) => {
    const cacheKey = `${region.id}-${region.stitchType}-${region.angle}-${region.density}-${region.color}`;
    if (stitchCache.current.has(cacheKey)) {
      return stitchCache.current.get(cacheKey);
    }
    const result = engine.current.processRegion(region);
    stitchCache.current.set(cacheKey, result);
    return result;
  };

  const renderStitch = (ctx, stitch, color, scale = 1) => {
    const baseWidth = (stitch.width || 0.7) * scale;
    
    if (stitch.type === 'running') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(stitch.x, stitch.y, baseWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (stitch.type === 'underlay') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = baseWidth * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = darkenColor(color, 40);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = baseWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stitch.x1 + 0.5, stitch.y1 + 0.5);
      ctx.lineTo(stitch.x2 + 0.5, stitch.y2 + 0.5);
      ctx.stroke();
      
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = baseWidth;
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = lightenColor(color, 35);
      ctx.lineWidth = baseWidth * 0.3;
      ctx.beginPath();
      ctx.moveTo(stitch.x1, stitch.y1);
      ctx.lineTo(stitch.x2, stitch.y2);
      ctx.stroke();
      
      ctx.globalAlpha = 1;
    }
  };

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
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < width; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 20) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }
    
    ctx.save();
    
    // Calcular bounds y auto-escala
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
    
    if (!allBounds) {
      ctx.restore();
      return;
    }
    
    const designWidth = allBounds.maxX - allBounds.minX;
    const designHeight = allBounds.maxY - allBounds.minY;
    const padding = 50;
    const scaleX = (width - padding * 2) / (designWidth || 1);
    const scaleY = (height - padding * 2) / (designHeight || 1);
    const autoScale = Math.min(scaleX, scaleY, 3);
    
    const centerX = (allBounds.minX + allBounds.maxX) / 2;
    const centerY = (allBounds.minY + allBounds.maxY) / 2;
    
    // Aplicar transformaciones
    ctx.translate(width/2 + pan.x, height/2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-width/2, -height/2);
    ctx.translate(width/2, height/2);
    ctx.scale(autoScale, autoScale);
    ctx.translate(-centerX, -centerY);
    
    // Renderizar regiones
    const sortedRegions = [...regions].sort((a, b) => {
      if (a.id === selectedRegionId) return 1;
      if (b.id === selectedRegionId) return -1;
      return 0;
    });
    
    sortedRegions.forEach(region => {
      if (region.hidden) return;
      const isSelected = region.id === selectedRegionId;
      const stitches = getStitches(region);
      if (!stitches) return;
      
      if (stitches.underlay?.length > 0) {
        stitches.underlay.forEach(stitch => renderStitch(ctx, stitch, region.color, 1));
      }
      
      if (stitches.fill?.length > 0) {
        stitches.fill.forEach(stitch => {
          renderStitch(ctx, stitch, region.color, isSelected ? 1.2 : 1);
        });
      }
      
      if (isSelected && stitches.bounds) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 / (zoom * autoScale);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          stitches.bounds.minX - 6, 
          stitches.bounds.minY - 6,
          stitches.bounds.maxX - stitches.bounds.minX + 12,
          stitches.bounds.maxY - stitches.bounds.minY + 12
        );
        ctx.setLineDash([]);
      }
    });
    
    ctx.restore();
    
    // Info overlay
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 180, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Zoom: ${Math.round(zoom * 100)}%`, 20, 28);
    ctx.fillText(`Regiones: ${regions.length}`, 20, 43);
    const totalStitches = regions.reduce((sum, r) => sum + (getStitches(r)?.totalStitches || 0), 0);
    ctx.fillText(`Puntadas: ${totalStitches.toLocaleString()}`, 20, 58);
    
  }, [regions, zoom, pan, selectedRegionId]);

  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e) => {
    const { x, y } = getCanvasCoords(e);
    setIsDragging(true);
    setDragStart({ x: x - pan.x, y: y - pan.y });
  };

  const handleMouseMove = (e) => {
    const { x, y } = getCanvasCoords(e);
    if (isDragging) {
      setPan({ x: x - dragStart.x, y: y - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(10, z * delta)));
  };

  useEffect(() => { render(); }, [render]);
  useEffect(() => { stitchCache.current.clear(); }, [regions.length]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '12px',
          cursor: isDragging ? 'grabbing' : 'crosshair',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'block'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        background: 'rgba(0,0,0,0.7)',
        padding: '6px',
        borderRadius: '10px'
      }}>
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} style={btnStyle}>−</button>
        <span style={{ color: '#fff', padding: '4px 12px', fontSize: 13, minWidth: 50, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => Math.min(10, z * 1.25))} style={btnStyle}>+</button>
        <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} style={btnStyle}>⟲</button>
      </div>
    </div>
  );
};

const btnStyle = {
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  color: '#fff',
  width: 32,
  height: 32,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

export default StitchPreview;
