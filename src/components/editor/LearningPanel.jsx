/**
 * LearningPanel.jsx — Visualizar y exportar datos de aprendizaje
 * Muestra feedback registrado y permite exportar para entrenamiento externo.
 */

import { useState, useEffect } from 'react';
import { Download, BarChart3, TrendingUp, Database } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function LearningPanel({ projectId }) {
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadStats();
  }, [projectId]);

  const loadStats = async () => {
    try {
      setLoading(true);
      // Contar feedback registrado
      const feedback = await base44.entities.UserFeedback.filter({ project_id: projectId }, '-created_date', 1000);
      setFeedbackCount(feedback.length);

      // Análisis (hacer llamada a backend)
      if (feedback.length > 0) {
        const result = await base44.functions.invoke('trainLearningModel', {
          action: 'analyze',
          project_id: projectId,
          limit: 500,
        });
        setAnalysis(result);
      }
    } catch (e) {
      console.error('[LearningPanel]', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      setExporting(true);
      const result = await base44.functions.invoke('trainLearningModel', {
        action: format === 'csv' ? 'export_csv' : 'export_jsonl',
        project_id: projectId,
        limit: 5000,
      });

      // Descargar archivo
      const filename = `training_data_${projectId}.${format === 'csv' ? 'csv' : 'jsonl'}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
      link.download = filename;
      link.click();
    } catch (e) {
      console.error('[LearningPanel export]', e);
      alert(`Error exportando: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (feedbackCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center text-slate-500">
        <Database className="w-8 h-8 opacity-40" />
        <p className="text-sm">Sin feedback registrado</p>
        <p className="text-xs opacity-70">Los cambios que hagas en regiones se registrarán automáticamente</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1e2130] bg-[#0a0c12]">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-300">Sistema de Aprendizaje</span>
        </div>
        <p className="text-[11px] text-slate-500">
          {feedbackCount} cambio{feedbackCount !== 1 ? 's' : ''} registrado{feedbackCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Feedback" value={feedbackCount} icon="📊" />
          <Stat label="Regiones" value={analysis?.feedback_count || '—'} icon="🎯" />
        </div>

        {/* Reglas aprendidas */}
        {analysis?.analysis?.rules && analysis.analysis.rules.length > 0 && (
          <div className="border border-[#1e2130] rounded-lg p-3 bg-[#0a0c12]">
            <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
              Patrones detectados
            </h4>
            <div className="space-y-2">
              {analysis.analysis.rules.slice(0, 5).map((rule, i) => (
                <div key={i} className="text-[10px]">
                  <div className="font-semibold text-slate-300">
                    {rule.changes.join(' + ')}
                  </div>
                  <div className="text-slate-500 ml-2">
                    {rule.frequency}x frecuencia · {Math.round(rule.confidence * 100)}% confianza
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export buttons */}
        <div className="border border-[#1e2130] rounded-lg p-3 bg-[#0a0c12]">
          <h4 className="text-xs font-bold text-slate-300 mb-2">Exportar para entrenamiento</h4>
          <div className="space-y-2">
            <ExportButton
              label="CSV (Excel, pandas)"
              onClick={() => handleExport('csv')}
              loading={exporting}
            />
            <ExportButton
              label="JSONL (Streaming, ML pipelines)"
              onClick={() => handleExport('jsonl')}
              loading={exporting}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Usa estos archivos para entrenar modelos ML externos (TensorFlow, scikit-learn, LLMs fine-tuning)
          </p>
        </div>

        {/* Info */}
        <div className="border border-[#1e2130] rounded-lg p-3 bg-blue-900/10">
          <p className="text-[10px] text-blue-300 leading-relaxed">
            El sistema aprende de tus cambios manuales y mejora las recomendaciones automáticas. Cuantos más cambios registres, mejor será el aprendizaje.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="border border-[#1e2130] rounded-lg p-2 bg-[#0a0c12] text-center">
      <div className="text-base mb-1">{icon}</div>
      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-slate-300">{value}</div>
    </div>
  );
}

function ExportButton({ label, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#161a23] border border-[#2a2d3a] rounded hover:bg-[#1e2130] text-xs text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
    >
      <Download className="w-3 h-3" />
      {loading ? 'Exportando...' : label}
    </button>
  );
}