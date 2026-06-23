import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const SYSTEM_PRESETS = [
  { id: 'sys_satin', name: 'Satín fino', icon: '✨', notes: 'Ideal para letras y bordes suaves', stitch_type: 'satin', density: 0.4, angle: 45, pull_compensation: 0.3, underlay: true, is_system: true },
  { id: 'sys_fill', name: 'Relleno denso', icon: '▦', notes: 'Relleno sólido para áreas grandes', stitch_type: 'fill', density: 1.2, angle: 0, pull_compensation: 0.5, underlay: true, is_system: true },
  { id: 'sys_run', name: 'Contorno running', icon: '〰', notes: 'Contornos limpios y rápidos', stitch_type: 'running_stitch', density: 0.3, angle: 0, pull_compensation: 0.1, underlay: false, is_system: true },
];

export function useEmbroideryPresets() {
  const [userPresets, setUserPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const data = await base44.entities.Preset.filter({ is_system: false });
      setUserPresets(data);
    } catch (e) {
      console.error('Error loading presets:', e);
    } finally {
      setLoading(false);
    }
  };

  const allPresets = [...SYSTEM_PRESETS, ...userPresets];

  const createPreset = async ({ name, icon, notes, stitch_type, density, angle, pull_compensation, underlay }) => {
    const preset = await base44.entities.Preset.create({
      name, icon: icon || '⚙', notes, stitch_type, density, angle, pull_compensation, underlay, is_system: false
    });
    setUserPresets(prev => [...prev, preset]);
    return preset;
  };

  const deletePreset = async (id) => {
    await base44.entities.Preset.delete(id);
    setUserPresets(prev => prev.filter(p => p.id !== id));
  };

  const applyPreset = (preset, onApply) => {
    onApply({
      stitch_type: preset.stitch_type,
      density: preset.density,
      angle: preset.angle,
      pull_compensation: preset.pull_compensation,
      underlay: preset.underlay
    });
  };

  return { allPresets, userPresets, loading, createPreset, deletePreset, applyPreset, reload: loadPresets };
}