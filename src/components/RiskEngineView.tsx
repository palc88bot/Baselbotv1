/**
 * Basel Quantum Algorithmic Trading System
 * Continuous Risk Engine & Multi-Tier KillSwitch Control Station
 */

import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Clock,
  Gauge,
  Lock,
  Percent,
  RefreshCw,
  RotateCcw,
  Shield,
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
}

export const RiskEngineView: React.FC<RiskEngineViewProps> = ({
  metrics,
  limits,
  balance,
  positions,
  onUpdateLimits,
  onTriggerKillSwitch,
  onResetKillSwitch,
  killSwitchHistory,
  lang,
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
  const dailyLossProgress = Math.min(100, (metrics.dailyLossPct / Math.max(0.1, limits.maxDailyLossPct)) * 100);

  return (
    <div className="space-y-6">
      {/* Top Banner: KillSwitch Status */}
      <div
        className={`border rounded-2xl p-5 shadow-sm transition-all ${
          metrics.killSwitchActive
            ? 'bg-rose-950/40 border-rose-600/80 shadow-rose-950/50'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl ${
                metrics.killSwitchActive ? 'bg-rose-600 text-white animate-pulse' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {metrics.killSwitchActive ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  {isAr ? 'محطة إدارة المخاطر وقاطع الدورة (KillSwitch)' : 'Risk Management & Safety Circuit Breaker'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    metrics.killSwitchActive
                      ? 'bg-rose-500 text-white animate-bounce'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                  }`}
                >
                  {metrics.killSwitchLevel}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {metrics.killSwitchActive
                  ? `${isAr ? 'سبب التفعيل:' : 'Active Trigger Reason:'} ${metrics.killSwitchReason || 'Manual intervention'}`
                  : isAr
                  ? 'كافة معايير السلامة والمخاطر اللحظية ضمن الحدود الآمنة'
                  : 'All real-time VaR, drawdown, and leverage limits are operating within nominal parameters'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {metrics.killSwitchActive ? (
              <button
                onClick={onResetKillSwitch}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isAr ? 'إعادة ضبط واستئناف التداول' : 'Reset & Resume Trading'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTriggerKillSwitch('SOFT_HALT', 'Operator triggered Soft Halt')}
                  className="px-3 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 text-xs font-bold transition"
                >
                  {isAr ? 'إيقاف ناعم (Soft Halt)' : 'Soft Halt'}
                </button>
                <button
                  onClick={() => onTriggerKillSwitch('HARD_HALT', 'Operator triggered Hard Halt')}
                  className="px-3 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold transition"
                >
                  {isAr ? 'إيقاف صلب (Hard Halt)' : 'Hard Halt'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Risk Gauges & Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gauge 1: Max Drawdown */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>{isAr ? 'التراجع اللحظي (Drawdown)' : 'Current Drawdown'}</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {metrics.currentDrawdownPct.toFixed(2)}%
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>{isAr ? 'الحد الأقصى المسموح:' : 'Limit Cap:'}</span>
              <span className="font-mono font-bold text-rose-400">{limits.maxDrawdownPct}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  ddProgress > 80 ? 'bg-rose-500' : ddProgress > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${ddProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Gauge 2: 1-Day VaR (95%) & CVaR */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>{isAr ? 'القيمة المعرضة للخطر (VaR 95%)' : 'Value at Risk (VaR 95%)'}</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            ${metrics.var95.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800">
            <span>{isAr ? 'الخسارة المتوقعة CVaR:' : 'Expected Shortfall (CVaR):'}</span>
            <span className="font-mono font-bold text-amber-300">${metrics.cvar95.toLocaleString()}</span>
          </div>
        </div>

        {/* Gauge 3: Portfolio Leverage */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>{isAr ? 'رافعة المحفظة الفعلية' : 'Effective Leverage'}</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {metrics.currentLeverage.toFixed(2)}x
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800">
            <span>{isAr ? 'سقف الرافعة المسموح:' : 'Max Leverage Cap:'}</span>
            <span className="font-mono font-bold text-slate-200">{limits.maxPortfolioLeverage.toFixed(1)}x</span>
          </div>
        </div>

        {/* Gauge 4: Sharpe & Sortino */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>{isAr ? 'نسب شارب وسورتينو' : 'Sharpe & Sortino Ratios'}</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {metrics.sharpeRatio.toFixed(2)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800">
            <span>{isAr ? 'نسبة سورتينو (Sortino):' : 'Sortino (Downside):'}</span>
            <span className="font-mono font-bold text-emerald-300">{metrics.sortinoRatio.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Grid: Limits Tuning Form & KillSwitch Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Risk Limits Tuning (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-cyan-400" />
            <span>{isAr ? 'ضبط معايير حدود المخاطر الصارمة' : 'Quantitative Risk Policy Tuning'}</span>
          </h3>

          <form onSubmit={handleSaveLimits} className="space-y-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">
                {isAr ? 'الحد الأقصى للتراجع المسموح به (% Max DD):' : 'Max Allowed Drawdown (%):'}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="25"
                value={maxDDEdit}
                onChange={(e) => setMaxDDEdit(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">
                {isAr ? 'حد الخسارة اليومية (% Daily Loss Cap):' : 'Daily Loss Limit (%):'}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="15"
                value={maxDailyLossEdit}
                onChange={(e) => setMaxDailyLossEdit(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">
                {isAr ? 'سقف الرافعة المالية (Max Leverage):' : 'Max Portfolio Leverage (x):'}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={maxLeverageEdit}
                onChange={(e) => setMaxLeverageEdit(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition"
            >
              {isAr ? 'حفظ وتطبيق حدود المخاطر' : 'Save & Enforce Limits'}
            </button>
          </form>
        </div>

        {/* KillSwitch Transition Audit Log (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>{isAr ? 'سجل أحداث قاطع الدورة وأمان المحفظة' : 'Circuit Breaker Event Audit Log'}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">{killSwitchHistory.length} Events</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {killSwitchHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs italic">
                {isAr ? 'لم تحدث أي انتهاكات لحدود المخاطر' : 'No risk limit violations recorded. System running in NORMAL state.'}
              </div>
            ) : (
              killSwitchHistory.map((evt, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-bold text-rose-300">
                        {evt.fromLevel} → {evt.toLevel}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1">{evt.reason}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 uppercase">
                    {evt.triggeredBy}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
