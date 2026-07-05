import { Download } from 'lucide-react';
import { INTEGRATED_PIPELINE_REPORT_MD } from '@/components/referenceLearning/integratedPipelineReportContent';

export default function IntegratedPipelineReportButton() {
  const handleDownload = () => {
    const blob = new Blob([INTEGRATED_PIPELINE_REPORT_MD], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REFERENCE_INTEGRATED_PIPELINE_AFTER_SATIN_V1.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="w-full flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-900/15 px-3 py-2 text-left text-xs text-sky-200 hover:bg-sky-900/25 transition-colors"
    >
      <span>
        <span className="block font-bold text-sky-300">Informe pipeline integrado</span>
        <span className="text-[10px] text-slate-400">REFERENCE_INTEGRATED_PIPELINE_AFTER_SATIN_V1.md</span>
      </span>
      <Download className="w-4 h-4 flex-shrink-0" />
    </button>
  );
}