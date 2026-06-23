import { useState } from 'react';
import { X, Download, Clock, Layers, Palette, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const FORMATS = ['DST', 'PES', 'JEF', 'DSB'];

export default function ExportModal({ project, regions, onClose }) {
  const [format, setFormat] = useState('DST');
  const [machine, setMachine] = useState('');
  const [speed, setSpeed] = useState(800);
  const [cuts, setCuts] = useState(0);
  const [exporting, setExporting] = useState(false);

  const totalStitches = regions?.reduce((s, r) => s + (r.stitch_count || 0), 0) || 0;
  const colorsUsed = new Set(regions?.map(r => r.color)).size || 0;
  const estimatedMin = Math.ceil(totalStitches / (speed || 800));
  const widthMm = project?.config?.width_mm || 100;
  const heightMm = project?.config?.height_mm || 100;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('generateEmbroideryFile', {
        regions: regions || [],
        format,
        width_mm: widthMm,
        height_mm: heightMm,
        machine_name: machine || 'Generic',
        speed_rpm: speed,
        cuts,
        project_name: project?.name || 'design'
      });

      const { file_base64, file_name } = res.data;
      const byteStr = atob(file_base64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file_name; a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-[#161a23] border border-[#2a2d3a] rounded-xl w-96 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e2130]">
          <div>
            <h2 className="text-base font-bold text-white">Exportar diseño</h2>
            <p className="text-xs text-slate-500">{project?.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a2d3a] text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Layers, label: 'Puntadas', value: totalStitches.toLocaleString(), color: 'text-violet-400' },
              { icon: Palette, label: 'Colores', value: colorsUsed, color: 'text-cyan-400' },
              { icon: Clock, label: 'Est. (min)', value: estimatedMin, color: 'text-emerald-400' },
              { icon: FileText, label: 'Tamaño', value: `${widthMm}×${heightMm}`, color: 'text-amber-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-[#0d0f14] rounded-lg p-2.5 text-center border border-[#1e2130]">
                <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                <div className={`text-sm font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-slate-600">{label}</div>
              </div>
            ))}
          </div>

          {/* Format */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Formato de salida</label>
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`py-2 rounded-lg border text-xs font-bold transition-all ${
                    format === f ? 'bg-violet-900/30 border-violet-500 text-violet-300' : 'bg-[#0d0f14] border-[#2a2d3a] text-slate-500 hover:text-slate-300 hover:border-[#3a3d4a]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Machine metadata */}
          <div>
            <label className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 block">Metadatos de máquina</label>
            <div className="space-y-2">
              <input
                type="text" placeholder="Nombre de máquina (ej: Caydo CE01)"
                value={machine} onChange={e => setMachine(e.target.value)}
                className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-600 mb-1 block">Velocidad (RPM)</label>
                  <input type="number" min="400" max="1200" value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 mb-1 block">Cortes</label>
                  <input type="number" min="0" max="50" value={cuts} onChange={e => setCuts(Number(e.target.value))}
                    className="w-full bg-[#0d0f14] border border-[#2a2d3a] rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-violet-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#2a2d3a] text-slate-400 text-sm hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {exporting ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generando...</>
            ) : (
              <><Download className="w-4 h-4" /> Confirmar y exportar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}