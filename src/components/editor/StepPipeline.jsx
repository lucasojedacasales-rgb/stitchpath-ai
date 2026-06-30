import { Check } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Subir',     desc: 'Carga tu diseño' },
  { id: 2, label: 'Vectorizar',desc: 'IA extrae objetos' },
  { id: 3, label: 'Ajustar',   desc: 'Modifica puntadas' },
  { id: 4, label: 'Simular',   desc: 'Previsualiza' },
  { id: 5, label: 'Exportar',  desc: 'DST, PES, JEF...' },
];

export default function StepPipeline({ currentStep, onStepClick }) {
  const progress = Math.round(((currentStep - 1) / (STEPS.length - 1)) * 100);
  return (
    <div className="flex items-center gap-0" role="navigation" aria-label="Progreso del pipeline">
      {STEPS.map((step, idx) => {
        const done   = currentStep > step.id;
        const active = currentStep === step.id;
        const clickable = done && onStepClick;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center group">
              {/* Step circle */}
              <div
                onClick={() => clickable && onStepClick(step.id)}
                title={step.desc}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done    ? 'bg-emerald-500 text-white' + (clickable ? ' cursor-pointer hover:bg-emerald-400 hover:scale-110' : '') :
                    active  ? 'bg-violet-600 text-white ring-2 ring-violet-400/40' :
                              'bg-[#1e2130] text-slate-500 border border-[#2a2d3a]'}`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="w-3 h-3" /> : step.id}
              </div>
              {/* Label */}
              <div className="hidden sm:flex flex-col items-center mt-1">
                <span className={`text-[10px] font-semibold whitespace-nowrap transition-colors
                  ${active ? 'text-violet-400' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {step.label}
                </span>
              </div>
            </div>

            {/* Connector — progress-aware */}
            {idx < STEPS.length - 1 && (
              <div className="relative w-8 h-px mx-1 bg-[#2a2d3a]">
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500/60 transition-all duration-500"
                  style={{ width: done ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        );
      })}
      {/* Compact progress for mobile */}
      <span className="sm:hidden ml-2 text-[10px] text-slate-500">{progress}%</span>
    </div>
  );
}