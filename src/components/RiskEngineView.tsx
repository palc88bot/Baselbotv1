/**
 * Basel AlgoCore Trading System
 * Continuous Risk Engine & Multi-Tier KillSwitch Control Station
 */

import React, { useState } from 'react';
import {
  Clock,
  Gauge,
  Lock,
  Percent,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { AccountBalance, KillSwitchLevel, Position, RiskLimits, RiskMetrics } from '../domain/types';

interface RiskEngineViewProps {
  metrics: RiskMetrics;
  limits: RiskLimits;
  balance: AccountBalance;
  positions: Position[];
  onUpdateLimits: (limits: Partial<RiskLimits>) => void;
  onTriggerKillSwitch: (level: KillSwitchLevel, reason: string) => void;
  onResetKillSwitch: () => void;
  killSwitchHistory: any[];
  lang: 'ar' | 'en';
  reduceMotion: boolean;
}

export const RiskEngineView: React.FC<RiskEngineViewProps> = ({
  metrics,
  limits,
  onUpdateLimits,
  onTriggerKillSwitch,
  onResetKillSwitch,
  killSwitchHistory,
  lang,
  reduceMotion,
}) => {
  const isAr = lang === 'ar';
  const [maxDDEdit, setMaxDDEdit] = useState<number>(limits.maxDrawdownPct);
  const [maxDailyLossEdit, setMaxDailyLossEdit] = useState<number>(limits.maxDailyLossPct);
  const [maxLeverageEdit, setMaxLeverageEdit] = useState<number>(limits.maxPortfolioLeverage);

  const handleSaveLimits = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateLimits({
      maxDrawdownPct: Number(maxDDEdit),
      maxDailyLossPct: Number(maxDailyLossEdit),
      maxPortfolioLeverage: Number(maxLeverageEdit),
    });
  };

  const ddProgress = Math.min(100, (metrics.currentDrawdownPct / Math.max(0.1, limits.maxDrawdownPct)) * 100);

  return (
    <div className={`space-y-4 ${reduceMotion ? '' : 'animate-in fade-in duration-500'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Immersive KillSwitch Banner */}
      <div
        className={`relative overflow-hidden border-2 rounded-[2rem] p-8 shadow-2xl transition-all duration-500 ${
          metrics.killSwitchActive
            ? 'bg-rose-950/20 border-rose-500 shadow-rose-500/20'
            : 'bg-[#0a0f1d]/80 backdrop-blur-xl border-cyan-500/20 shadow-cyan-500/10'
        }`}
      >
        {/* Background Scanline for Banner */}
        <div className="absolute inset-0 quantum-scanline opacity-10 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div
              className={`p-5 rounded-3xl ${
                metrics.killSwitchActive 
                  ? 'bg-rose-600 text-white shadow-[0_0_30px_rgba(244,63,94,0.5)]' 
                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
              }`}
            >
              {metrics.killSwitchActive ? <ShieldAlert className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-black text-slate-100 tracking-tight uppercase">
                  {isAr ? 'قاطع الدورة الكمي' : 'QUANTUM_CIRCUIT_BREAKER'}
                </h2>
                <div className={`px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                  metrics.killSwitchActive ? 'bg-rose-500 text-white border-rose-400' : 'bg-cyan-950/50 text-cyan-400 border-cyan-800'
                }`}>
                  {metrics.killSwitchLevel}
                </div>
              </div>
              <p className="text-sm font-medium text-slate-400">
                {metrics.killSwitchActive
                  ? `${isAr ? 'تم تفعيل الحظر بسبب:' : 'CRITICAL_HALT_REASON:'} ${metrics.killSwitchReason}`
                  : isAr
                  ? 'الأنظمة تعمل بكفاءة كاملة - المعايير ضمن النطاق الكمي'
                  : 'SYSTEMS_OPERATIONAL - RISK_VECTORS_WITHIN_NOMINAL_TOLERANCE'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            {metrics.killSwitchActive ? (
              <button
                onClick={onResetKillSwitch}
                className="group flex items-center gap-3 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs tracking-[0.2em] shadow-xl shadow-emerald-900/30 transition-all uppercase"
              >
                <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                <span>{isAr ? 'إعادة تشغيل المحرك' : 'REBOOT_CORE_ENGINE'}</span>
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => onTriggerKillSwitch('SOFT_HALT', 'OPERATOR_SOFT_HALT')}
                  className="px-6 py-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-black tracking-widest uppercase transition-all"
                >
                  {isAr ? 'إيقاف مرن' : 'SOFT_HALT'}
                </button>
                <button
                  onClick={() => onTriggerKillSwitch('HARD_HALT', 'OPERATOR_HARD_HALT')}
                  className="px-6 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black tracking-widest uppercase shadow-lg shadow-rose-900/30 transition-all"
                >
                  {isAr ? 'إيقاف كلي' : 'HARD_HALT'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bento Risk Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Drawdown */}
        <div className="bg-[#0a0f1d]/80 border border-white/5 p-6 rounded-3xl shadow-xl group">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'التراجع' : 'DRAWDOWN_MTD'}</h4>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-mono font-black text-slate-100 mb-4">{metrics.currentDrawdownPct.toFixed(2)}%</div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>{isAr ? 'سقف الحدود' : 'POLICY_LIMIT'}</span>
              <span className="text-rose-400">{limits.maxDrawdownPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${ddProgress > 80 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-cyan-500'}`}
                style={{ width: `${ddProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 2: VaR */}
        <div className="bg-[#0a0f1d]/80 border border-white/5 p-6 rounded-3xl shadow-xl">
           <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'المخاطرة المتوقعة' : 'VAR_95_QUANTILE'}</h4>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-mono font-black text-cyan-400 mb-1">${metrics.var95.toLocaleString()}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-3 border-t border-white/5 mt-3 flex justify-between">
            <span>CVaR (SHORTFALL):</span>
            <span className="text-slate-300">${metrics.cvar95.toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 3: Leverage */}
        <div className="bg-[#0a0f1d]/80 border border-white/5 p-6 rounded-3xl shadow-xl">
           <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'الرافعة الفعلية' : 'ACTIVE_LEVERAGE'}</h4>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-mono font-black text-slate-100 mb-1">{metrics.currentLeverage.toFixed(2)}x</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-3 border-t border-white/5 mt-3 flex justify-between">
            <span>{isAr ? 'الحد الأقصى:' : 'MAX_ALLOWABLE:'}</span>
            <span className="text-slate-300">{limits.maxPortfolioLeverage.toFixed(1)}x</span>
          </div>
        </div>

        {/* Metric 4: Ratios */}
        <div className="bg-[#0a0f1d]/80 border border-white/5 p-6 rounded-3xl shadow-xl">
           <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'أداء المخاطر' : 'SHARPE_EFFICIENCY'}</h4>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-mono font-black text-emerald-400 mb-1">{metrics.sharpeRatio.toFixed(2)}</div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-3 border-t border-white/5 mt-3 flex justify-between">
            <span>{isAr ? 'سورتينو:' : 'SORTINO:'}</span>
            <span className="text-slate-300">{metrics.sortinoRatio.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Audit & Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Audit Log (8 cols) */}
        <div className="lg:col-span-8 bg-[#0a0f1d]/80 border border-white/5 rounded-[2rem] p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-slate-100 tracking-[0.2em] uppercase flex items-center gap-3">
              <Clock className="w-4 h-4 text-rose-500" />
              {isAr ? 'سجل تدقيق الأمان الفوري' : 'REALTIME_SAFETY_AUDIT_LOG'}
            </h3>
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{killSwitchHistory.length} ENTRIES_LOGGED</div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar">
            {killSwitchHistory.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/20 border border-dashed border-white/5 rounded-3xl">
                 <ShieldCheck className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                 <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">
                   {isAr ? 'لا يوجد انتهاكات مسجلة' : 'NO_SECURITY_VIOLATIONS_DETECTED'}
                 </p>
              </div>
            ) : (
              killSwitchHistory.map((evt, idx) => (
                <div key={idx} className="group flex items-center justify-between p-4 bg-slate-900/50 border border-white/5 rounded-2xl hover:bg-slate-900 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-[10px] font-mono text-slate-600 group-hover:text-cyan-500 transition-colors">{new Date(evt.timestamp).toLocaleTimeString()}</div>
                    <div>
                      <div className="text-xs font-black text-slate-200 flex items-center gap-2">
                         <span className="text-rose-500">{evt.fromLevel}</span>
                         <span className="text-slate-600">→</span>
                         <span className="text-emerald-500 font-black">{evt.toLevel}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{evt.reason}</div>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-slate-800 rounded text-[9px] font-black text-slate-400 tracking-tighter uppercase">{evt.triggeredBy}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Policy Tuning (4 cols) */}
        <div className="lg:col-span-4 bg-gradient-to-br from-[#0a0f1d] to-[#0f172a] border border-cyan-500/20 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
           <h3 className="text-xs font-black text-slate-100 tracking-[0.2em] uppercase mb-8 flex items-center gap-3">
              <Lock className="w-4 h-4 text-cyan-400" />
              {isAr ? 'تعديل سياسة المخاطر' : 'RISK_POLICY_TUNING'}
           </h3>

           <form onSubmit={handleSaveLimits} className="space-y-6">
              {[
                { label: isAr ? 'أقصى تراجع مسموح' : 'MAX_DRAWDOWN_LIMIT (%)', val: maxDDEdit, set: setMaxDDEdit, step: 0.5 },
                { label: isAr ? 'حد الخسارة اليومي' : 'DAILY_LOSS_CAP (%)', val: maxDailyLossEdit, set: setMaxDailyLossEdit, step: 0.1 },
                { label: isAr ? 'سقف الرافعة' : 'MAX_LEVERAGE_CAP (x)', val: maxLeverageEdit, set: setMaxLeverageEdit, step: 0.5 },
              ].map((field, i) => (
                <div key={i}>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{field.label}</label>
                   <input
                    type="number"
                    step={field.step}
                    value={field.val}
                    onChange={(e) => field.set(Number(e.target.value))}
                    className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-3 text-sm font-mono text-slate-100 outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              ))}
              <button
                type="submit"
                className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs tracking-[0.2em] shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all uppercase mt-4"
              >
                {isAr ? 'تطبيق السياسات الجديدة' : 'COMMIT_NEW_POLICIES'}
              </button>
           </form>
        </div>
      </div>
    </div>
  );
};
