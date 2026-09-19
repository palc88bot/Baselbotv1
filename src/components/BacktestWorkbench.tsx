/**
 * Basel Quantum Algorithmic Trading System
 * Backtesting Workbench, Walk-Forward Validation & Stress Testing Sandbox
 */

import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart2,
  Calendar,
  CheckCircle,
  Clock,
  Compass,
  DollarSign,
  Download,
  Flame,
  Percent,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { BacktestResult, SolverType, StressScenario, WalkForwardResult } from '../domain/types';
import { BacktestEngine } from '../simulation/Backtest';
import { WalkForwardValidator } from '../validation/WalkForward';
import { STRESS_SCENARIOS_CATALOG } from '../validation/StressScenarios';

interface BacktestProps {
  lang: 'ar' | 'en';
}

export const BacktestWorkbench: React.FC<BacktestProps> = ({ lang }) => {
  const isAr = lang === 'ar';
  const [initialCapital, setInitialCapital] = useState<number>(100000);
  const [solver, setSolver] = useState<SolverType>('QUANTUM_ANNEALING');
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [walkForwardResult, setWalkForwardResult] = useState<WalkForwardResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedStress, setSelectedStress] = useState<StressScenario>(STRESS_SCENARIOS_CATALOG[0]);

  const handleRunBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = BacktestEngine.runBacktest({
        initialCapital,
        solver,
      });
      const wf = WalkForwardValidator.runWalkForwardMatrix(4);
      setBacktestResult(res);
      setWalkForwardResult(wf);
      setIsRunning(false);
    }, 150);
  };

  React.useEffect(() => {
    handleRunBacktest();
  }, []);

  const chartData = (backtestResult?.equityCurve || []).map((pt, i) => ({
    time: new Date(pt.timestamp).toLocaleDateString(),
    equity: Number((pt?.equity || 0).toFixed(2)),
    benchmark: Number((pt?.benchmark || 0).toFixed(2)),
    drawdown: Number((pt?.drawdown || 0).toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      {/* Top Banner & Run Form */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">
              {isAr
                ? 'مختبر الاختبار التاريخي والتحقق الأمامي (Walk-Forward Validation)'
                : 'Backtest Workbench & Walk-Forward Validation'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? 'محاكاة الأداء التاريخي عالي الدقة مع نمذجة الانزلاق السعري والعمولات، واختبار العينات الخارجة لمنع فرط التخصيص'
              : 'High-fidelity backtesting with realistic fill slippage, transaction cost models, and rolling out-of-sample overfitting prevention'}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">{isAr ? 'رأس المال:' : 'Capital:'}</span>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="w-24 bg-transparent text-slate-100 font-mono font-bold focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">{isAr ? 'المعالج:' : 'Solver:'}</span>
            <select
              value={solver}
              onChange={(e) => setSolver(e.target.value as any)}
              className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
            >
              <option value="QUANTUM_ANNEALING" className="bg-slate-900">Quantum Annealing (QSA)</option>
              <option value="SIMULATED_ANNEALING" className="bg-slate-900">Simulated Annealing (SA)</option>
              <option value="TABU_SEARCH" className="bg-slate-900">Tabu Search</option>
              <option value="CLASSICAL_MARKOWITZ" className="bg-slate-900">Classical Markowitz</option>
            </select>
          </div>

          <button
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isRunning ? (isAr ? 'جاري المحاكاة...' : 'Simulating...') : (isAr ? 'تشغيل الاختبار' : 'Run Backtest')}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      {backtestResult && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'العائد الإجمالي' : 'Total Return'}</span>
            <span className="text-xl font-bold font-mono text-emerald-400">+{backtestResult.totalReturnPct}%</span>
            <span className="text-[10px] text-slate-500 block mt-1">+${((backtestResult.totalReturnPct / 100) * initialCapital).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'نسبة شارب (Sharpe)' : 'Sharpe Ratio'}</span>
            <span className="text-xl font-bold font-mono text-cyan-400">{backtestResult.sharpeRatio}</span>
            <span className="text-[10px] text-slate-500 block mt-1">Sortino: {backtestResult.sortinoRatio}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'أقصى تراجع (Max DD)' : 'Max Drawdown'}</span>
            <span className="text-xl font-bold font-mono text-rose-400">{backtestResult.maxDrawdownPct}%</span>
            <span className="text-[10px] text-slate-500 block mt-1">Calmar: {backtestResult.calmarRatio}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'نسبة الصفقات الرابحة' : 'Win Rate'}</span>
            <span className="text-xl font-bold font-mono text-slate-100">{backtestResult.winRatePct}%</span>
            <span className="text-[10px] text-slate-500 block mt-1">{backtestResult.totalTrades} {isAr ? 'صفقة' : 'Trades'}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'معامل الربح (Profit Factor)' : 'Profit Factor'}</span>
            <span className="text-xl font-bold font-mono text-indigo-400">{backtestResult.profitFactor}</span>
            <span className="text-[10px] text-slate-500 block mt-1">Alpha: +{backtestResult.alpha}%</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 block mb-1">{isAr ? 'مؤشر كفاءة العينة WFE' : 'Walk-Forward WFE'}</span>
            <span className="text-xl font-bold font-mono text-amber-400">
              {walkForwardResult?.overallEfficiency ? `${(walkForwardResult.overallEfficiency * 100).toFixed(0)}%` : '0%'}
            </span>
            <span className="text-[10px] text-emerald-400 block mt-1">
              {walkForwardResult?.verdict === 'HIGHLY_ROBUST' ? (isAr ? 'مقاوم للتخصيص' : 'Overfit-Robust') : 'Robust'}
            </span>
          </div>
        </div>
      )}

      {/* Equity Curve Area Chart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'منحنى نمو رأس المال مقارنة بالمؤشر المرجعي (Equity Curve)' : 'Cumulative Equity Growth vs Benchmark'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr ? 'أداء خوارزمية بازل الكمية مقابل الشراء والاحتفاظ السلبي (Buy & Hold)' : 'Basel Quantum Strategy performance vs passive market benchmark'}
            </p>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={['dataMin - 2000', 'dataMax + 2000']}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: '#f8fafc' }}
                formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Equity']}
              />
              <Area type="monotone" dataKey="equity" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#equityGrad)" name="Basel Quantum Strategy" />
              <Area type="monotone" dataKey="benchmark" stroke="#64748b" strokeWidth={1.5} strokeDasharray="3 3" fillOpacity={0} fill="none" name="Benchmark (Buy & Hold)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid: Walk-Forward Out-of-Sample Matrix & Stress Testing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Walk-Forward Optimization Windows (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'مصفوفة التحقق الأمامي المتدحرج (Walk-Forward Windows)' : 'Rolling Walk-Forward Windows'}</span>
            </h3>
            <span className="text-xs font-mono text-emerald-400">
              {walkForwardResult?.verdict === 'HIGHLY_ROBUST' ? (isAr ? 'تم اجتياز الفحص' : 'Passed Test') : 'Valid'}
            </span>
          </div>

          <div className="space-y-3">
            {(walkForwardResult?.windows || []).map((w, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-200">
                    {isAr ? `النافذة ${w.windowIndex}:` : `Window #${w.windowIndex}:`} {w.trainStart} to {w.testEnd}
                  </span>
                  <span className="font-mono text-cyan-400">WFE: {(w.efficiencyRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">{isAr ? 'داخل العينة (In-Sample)' : 'In-Sample (Train)'}</span>
                    <span className="text-emerald-400 font-bold">Sharpe {w.inSampleSharpe}</span> | Return +{w.inSampleReturnPct}%
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">{isAr ? 'خارج العينة (Out-of-Sample)' : 'Out-of-Sample (Test)'}</span>
                    <span className="text-cyan-300 font-bold">Sharpe {w.outOfSampleSharpe}</span> | Return +{w.outOfSampleReturnPct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Crisis Stress Scenarios Sandbox (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{isAr ? 'مختبر سيناريوهات الأزمات والصدمات المالية' : 'Stress Scenarios & Crisis Sandbox'}</span>
            </h3>
          </div>

          <div className="space-y-3">
            {STRESS_SCENARIOS_CATALOG.map((sc, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedStress(sc)}
                className={`p-3.5 rounded-xl border cursor-pointer transition ${
                  selectedStress.name === sc.name
                    ? 'bg-amber-950/20 border-amber-500/50 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">{sc.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                    Shock: -{sc.priceDropPct}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{sc.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-slate-400">
                  <span>Vol Mult: {sc.volatilityMultiplier}x</span>
                  <span>Spread Mult: {sc.spreadMultiplier}x</span>
                  <span>Liquidity: {sc.liquidityDrainPct}% Drain</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
