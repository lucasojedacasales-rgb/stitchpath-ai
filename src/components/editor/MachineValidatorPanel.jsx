import { useState, useMemo } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, AlertCircle,
  Info, ChevronDown, ChevronRight, Activity, Gauge, Scissors, Box, Link
} from 'lucide-react';
import { validateForMachine } from '@/lib/machineValidator';
import { runExportPipeline, DEFAULT_MACHINE } from '@/lib/exportPipeline';

const STATUS_CONFIG = {
  SAFE:   { icon: ShieldCheck, color: 'emerald', label: 'SAFE',   desc: 'Ejecutable sin problemas' },
  RISKY:  { icon: ShieldAlert, color: 'amber',   label: 'RISKY',  desc: 'Puede fallar o deformarse' },
  INVALID:{ icon: ShieldX,     color: 'red',     label: 'INVALID',desc: 'Romperá o será ignorado' },
};

const CATEGORY_ICONS = {
  GEOMETRY: Box,
  DENSITY: Gauge,
  JUMPS: Scissors,
  STRUCTURE: Activity,
  TRIM: Link,
};

const SEVERITY_STYLES = {
  CRITICAL: { bg: 'bg-red-950/20', border: 'border-red-500/30', text: 'text-red-400', label: 'CRÍTICO' },
  MAJOR:    { bg: 'bg-amber-950/20', border: 'border-amber-500/30', text: 'text-amber-400', label: 'MAYOR' },
  MINOR:    { bg: 'bg-slate-950/20', border: 'border-slate-500/20', text: 'text-slate-400', label: 'MENOR' },
  INFO:     { bg: 'bg-blue-950/20', border: 'border-blue-500/20', text: 'text-blue-400', label: 'INFO' },
};

export default function MachineValidatorPanel({ regions, config, machineSettings, commands: preCommands }) {
  const [expandedIssues, setExpandedIssues] = useState(true);

  const result = useMemo(() => {
    const ms = { ...DEFAULT_MACHINE, ...machineSettings };

    // Use pre-computed commands or run pipeline to get them
    let cmds = preCommands;
    if (!cmds) {
      const pipeline = runExportPipeline(regions, config, ms, 'DST');
      cmds = pipeline.commands;
    }

    return validateForMachine(regions, cmds, config, ms);
  }, [regions, config, machineSettings, preCommands]);

  const statusCfg = STATUS_CONFIG[result.status];
  const StatusIcon = statusCfg.icon;
  const colorClasses = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-950/20', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20', bar: 'bg-emerald-500' },
    amber:   { text: 'text-amber-400',   bg: 'bg-amber-950/20',   border: 'border-amber-500/30',   ring: 'ring-amber-500/20',   bar: 'bg-amber-500'   },
    red:     { text: 'text-red-400',     bg: 'bg-red-950/20',     border: 'border-red-500/30',     ring: 'ring-red-500/20',     bar: 'bg-red-500'     },
  };
  const c = colorClasses[statusCfg.color];

  // Group issues by category
  const byCategory = result.issues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* ── Status Banner ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center`}>
            <StatusIcon className={`w-5 h-5 ${c.text}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${c.text}`}>{statusCfg.label}</span>
              <span className="text-[10px] text-slate-500">· {statusCfg.desc}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {result.stats.criticalCount} críticos · {result.stats.majorCount} mayores · {result.stats.minorCount} menores
            </div>
          </div>
        </div>

        {/* Score gauge */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500 font-medium">SCORE DE EJECUTABILIDAD</span>
            <span className={`font-bold ${c.text}`}>{result.score}/100</span>
          </div>
          <div className="h-2 bg-[#0d0f14] rounded-full overflow-hidden">
            <div
              className={`h-full ${c.bar} rounded-full transition-all duration-500`}
              style={{ width: `${result.score}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-slate-600 px-0.5">
            <span>INVALID</span>
            <span>RISKY</span>
            <span>SAFE</span>
          </div>
        </div>

        {/* Recommendation */}
        <div className={`mt-3 pt-3 border-t ${c.border} text-[11px] text-slate-300 leading-relaxed`}>
          {result.recommendation}
        </div>
      </div>

      {/* ── Stats Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-1.5">
        {[
          { label: 'Objetos', value: result.stats.totalObjects },
          { label: 'Puntadas', value: result.stats.totalStitches?.toLocaleString() },
          { label: 'Saltos', value: result.stats.totalJumps },
          { label: 'Trims', value: result.stats.totalTrims },
          { label: 'Colores', value: result.stats.colorChanges + 1 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0d0f14] border border-[#1e2130] rounded-lg p-2 text-center">
            <div className="text-xs font-bold text-slate-300">{value}</div>
            <div className="text-[8px] text-slate-600 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Issues by Category ────────────────────────────────────────── */}
      {result.issues.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setExpandedIssues(!expandedIssues)}
            className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold hover:text-slate-400 transition-colors w-full"
          >
            {expandedIssues ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Issues detectados ({result.issues.length})
          </button>

          {expandedIssues && (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {Object.entries(byCategory).map(([category, catIssues]) => {
                const CatIcon = CATEGORY_ICONS[category] || AlertCircle;
                return (
                  <div key={category} className="space-y-1">
                    {/* Category header */}
                    <div className="flex items-center gap-1.5 px-1 pt-1">
                      <CatIcon className="w-3 h-3 text-slate-500" />
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{category}</span>
                      <span className="text-[9px] text-slate-600">({catIssues.length})</span>
                    </div>
                    {/* Issues */}
                    {catIssues.slice(0, 8).map((issue, i) => {
                      const style = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.MINOR;
                      return (
                        <div key={`${category}-${i}`} className={`rounded-lg border ${style.border} ${style.bg} px-2.5 py-2`}>
                          <div className="flex items-start gap-2">
                            {issue.severity === 'CRITICAL' ? (
                              <AlertTriangle className={`w-3 h-3 ${style.text} flex-shrink-0 mt-0.5`} />
                            ) : issue.severity === 'MAJOR' ? (
                              <AlertCircle className={`w-3 h-3 ${style.text} flex-shrink-0 mt-0.5`} />
                            ) : (
                              <Info className={`w-3 h-3 ${style.text} flex-shrink-0 mt-0.5`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${style.bg} ${style.text}`}>{issue.rule}</span>
                                <span className={`text-[8px] font-bold ${style.text}`}>{style.label}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 leading-snug">{issue.message}</p>
                              <p className="text-[9px] text-slate-500 mt-1 italic">→ {issue.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {catIssues.length > 8 && (
                      <div className="text-[9px] text-slate-600 italic px-2">+{catIssues.length - 8} issues más...</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── No issues ─────────────────────────────────────────────────── */}
      {result.issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-300 font-medium">Sin issues detectados</p>
          <p className="text-[10px] text-slate-500 mt-0.5">El diseño pasó todas las validaciones de máquina</p>
        </div>
      )}
    </div>
  );
}