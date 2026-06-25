// ============================================
// useEmbroideryPresets.js
// ============================================

import { useState, useCallback, useEffect } from 'react';

const DEFAULT_PRESETS = [
  {
    id: 'satin-fino',
    name: 'Satín Fino',
    icon: '✨',
    category: 'Contornos',
    description: 'Contornos delicados, letras pequeñas',
    config: {
      stitchType: 'satin',
      density: 0.3,
      stitchWidth: 0.5,
      underlay: true,
      underlayDensity: 0.6,
      pullCompensation: 0.05
    }
  },
  {
    id: 'relleno-denso',
    name: 'Relleno Denso',
    icon: '▦',
    category: 'Rellenos',
    description: 'Áreas grandes, cobertura total',
    config: {
      stitchType: 'fill',
      density: 0.35,
      stitchLength: 2.0,
      underlay: true,
      underlayDensity: 0.7,
      underlayAngle: 45
    }
  },
  {
    id: 'contorno-running',
    name: 'Contorno Running',
    icon: '—',
    category: 'Contornos',
    description: 'Líneas finas, detalles',
    config: {
      stitchType: 'running_stitch',
      stitchLength: 1.5,
      underlay: false
    }
  }
];

const STORAGE_KEY = 'stitchflow_presets';

export function useEmbroideryPresets() {
  const [presets, setPresets] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? [...DEFAULT_PRESETS, ...JSON.parse(saved)] : DEFAULT_PRESETS;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  const [activePreset, setActivePreset] = useState(null);

  useEffect(() => {
    const customPresets = presets.filter(p => p.isCustom);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets));
  }, [presets]);

  const applyPreset = useCallback((presetId, regionConfig = {}) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return regionConfig;
    
    setActivePreset(presetId);
    return { ...regionConfig, ...preset.config, presetId: preset.id };
  }, [presets]);

  const savePreset = useCallback((name, config, { icon = '🔧', description = '' } = {}) => {
    const newPreset = {
      id: `custom-${Date.now()}`,
      name,
      icon,
      description,
      config: { ...config },
      isCustom: true
    };
    setPresets(prev => [...prev, newPreset]);
    return newPreset;
  }, []);

  return {
    presets,
    activePreset,
    applyPreset,
    savePreset,
    deletePreset: (id) => setPresets(prev => prev.filter(p => p.id !== id)),
    defaultPresets: DEFAULT_PRESETS
  };
}

export default useEmbroideryPresets;
