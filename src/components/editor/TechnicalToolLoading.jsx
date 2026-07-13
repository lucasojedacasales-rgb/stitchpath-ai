export default function TechnicalToolLoading({ label = 'Cargando herramienta…', overlay = false }) {
  const content = (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 bg-[#0d0f14] text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      <div>
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <p className="mt-1 text-[11px] text-slate-500">Preparando controles y visualización</p>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-[#1e2130]">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-600" />
      </div>
    </div>
  );

  if (!overlay) return content;
  return <div className="fixed inset-0 z-50 bg-[#0d0f14]">{content}</div>;
}