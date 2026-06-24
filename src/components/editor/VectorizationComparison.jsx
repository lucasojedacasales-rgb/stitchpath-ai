import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react';

export default function VectorizationComparison({ results }) {
  const [activeTab, setActiveTab] = useState('scores');

  if (!results) return null;

  const { tests = {}, final_score = 0, wilcom_compatible, hatch_compatible } = results;

  const testData = Object.entries(tests)
    .filter(([_, t]) => t.score !== null && !isNaN(t.score))
    .map(([key, test]) => ({
      name: test.name.replace(' ', '\n'),
      score: test.score,
      key
    }));

  const benchmarkComparison = [
    { engine: 'Advanced (Tu Motor)', score: final_score },
    { engine: 'Wilcom (Estándar)', score: 90 },
    { engine: 'Hatch (Estándar)', score: 85 }
  ];

  return (
    <div className="bg-[#0d0f14] border border-[#2a2d3a] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-900/30 to-cyan-900/30 border-b border-[#2a2d3a] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {final_score >= 85 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              )}
              Calidad de Vectorización
            </h2>
            <p className="text-xs text-slate-500 mt-1">Análisis comparativo contra Wilcom y Hatch</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-violet-400">{final_score}</div>
            <div className="text-xs text-slate-500">/ 100</div>
          </div>
        </div>
      </div>

      {/* Compatibility Badges */}
      <div className="flex gap-2 px-6 py-3 border-b border-[#1a1d27] bg-[#0a0c12]">
        {wilcom_compatible && (
          <div className="px-3 py-1.5 rounded-lg bg-emerald-900/30 border border-emerald-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">WILCOM COMPATIBLE</span>
          </div>
        )}
        {hatch_compatible && (
          <div className="px-3 py-1.5 rounded-lg bg-cyan-900/30 border border-cyan-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-cyan-400">HATCH COMPATIBLE</span>
          </div>
        )}
        {final_score >= 90 && (
          <div className="px-3 py-1.5 rounded-lg bg-violet-900/30 border border-violet-500/30 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold text-violet-400">PROFESIONAL PRO</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1a1d27] px-4">
        {[
          { id: 'scores', label: 'Resultados' },
          { id: 'comparison', label: 'Comparación' },
          { id: 'details', label: 'Detalles' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-violet-400 border-violet-500'
                : 'text-slate-500 hover:text-slate-300 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'scores' && (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={testData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" domain={[0, 100]} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161a23',
                    border: '1px solid #2a2d3a',
                    borderRadius: '8px'
                  }}
                  cursor={{ fill: 'rgba(124, 58, 237, 0.1)' }}
                />
                <Bar dataKey="score" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 gap-3">
              {testData.map(({ key, name, score }) => (
                <div key={key} className="bg-[#161a23] border border-[#1e2130] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">{name.replace('\n', ' ')}</span>
                    <span className={`text-sm font-bold ${score >= 80 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      {score}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#0d0f14] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${score >= 80 ? 'bg-emerald-500' : score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'comparison' && (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={benchmarkComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
                <XAxis dataKey="engine" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" domain={[0, 100]} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161a23',
                    border: '1px solid #2a2d3a',
                    borderRadius: '8px'
                  }}
                />
                <Legend wrapperStyle={{ color: '#64748b' }} />
                <Bar dataKey="score" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {benchmarkComparison.map((item, idx) => {
                const isYours = idx === 0;
                const diff = isYours ? 0 : final_score - item.score;
                return (
                  <div key={idx} className="flex items-center justify-between p-2 bg-[#161a23] border border-[#1e2130] rounded-lg">
                    <span className={isYours ? 'text-violet-400 font-bold' : 'text-slate-400'}>{item.engine}</span>
                    <div className="flex items-center gap-2">
                      <span className={isYours ? 'text-violet-400 font-bold' : 'text-slate-400'}>{item.score}</span>
                      {!isYours && diff !== 0 && (
                        <span className={diff > 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-3">
            {testData.map(({ key, name }) => {
              const test = tests[key];
              return (
                <div key={key} className="bg-[#161a23] border border-[#1e2130] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-white">{test.name}</h4>
                    <span className={`text-sm font-bold ${test.score >= 80 ? 'text-emerald-400' : test.score >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      {test.score}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(test.details || {}).map(([detailKey, value]) => (
                      <div key={detailKey} className="bg-[#0d0f14] rounded p-2">
                        <div className="text-slate-500 capitalize">{detailKey.replace(/_/g, ' ')}</div>
                        <div className="text-slate-200 font-semibold">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}