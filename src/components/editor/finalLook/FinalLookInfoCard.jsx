import { X } from 'lucide-react';

const KIND_LABEL = { fill: 'Relleno', satin: 'Satén', contour: 'Contorno', detail: 'Detalle' };
const NA = 'No disponible';

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-200">{value}</span>
    </div>
  );
}

/** Ficha de la región seleccionada. Nunca inventa datos: muestra «No disponible». */
export default function FinalLookInfoCard({ stats, onClose }) {
  if (!stats) return null;
  const avgLen = stats.stitches > 1 ? stats.totalLen / (stats.stitches - 1) : null;
  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-56 rounded-xl border border-violet-500/40 bg-[#0b0e14]/95 p-3 shadow-2xl backdrop-blur-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 flex-shrink-0 rounded-full border border-white/20" style={{ background: stats.color }} />
          <span className="truncate text-[11px] font-bold text-white">{stats.name}</span>
        </div>
        <button onClick={onClose} aria-label="Cerrar ficha" className="rounded p-0.5 text-slate-500 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Row label="Color" value={stats.color || NA} />
      <Row label="Tipo de puntada" value={KIND_LABEL[stats.kind] || NA} />
      <Row label="Puntadas" value={stats.stitches ? stats.stitches.toLocaleString('es-ES') : NA} />
      <Row label="Orden" value={stats.order ?? NA} />
      <Row label="Ángulo" value={stats.angle != null ? `${stats.angle}°` : NA} />
      <Row label="Densidad" value={stats.density != null ? `${stats.density} mm` : NA} />
      <Row label="Longitud media" value={avgLen != null ? `${avgLen.toFixed(2)} mm` : NA} />
      <Row label="Longitud total" value={stats.totalLen ? `${stats.totalLen.toFixed(1)} mm` : NA} />
      <Row label="Área" value={stats.areaMm2 != null ? `${stats.areaMm2.toFixed(1)} mm²` : NA} />
    </div>
  );
}