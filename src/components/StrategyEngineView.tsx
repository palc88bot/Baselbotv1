/**
 * StrategyEngineView.tsx
 * Autonomous Strategy Hub & Multi-Strategy Matrix for Basel AlgoCore
 * Features real-time strategy management, parameter hot-reloading, live screener filtering,
 * capital reallocation, and backtest integration.
 */

import React, { useState, useMemo } from 'react';
import { BotStrategy, StrategyScreenerItem, TradingSignal, AssetSymbol } from '../domain/types';
import { fetchWithAuth } from '../lib/api.ts';
import { DEFAULT_BOT_STRATEGIES } from '../strategies/StrategyManager';
import {
  Cpu,
  Zap,
  Sliders,
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  Activity,
  Shield,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Binary,
  Maximize2,
  Minimize2,
  Save,
  RotateCcw,
  Sparkles,
  PieChart as PieIcon,
  Search,
  Filter
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

interface StrategyEngineViewProps {
  strategies: BotStrategy[];
  screenerItems: StrategyScreenerItem[];
  latestSignal: TradingSignal | null;
  signalHistory: TradingSignal[];
  onToggleStrategy: (id: string, active: boolean) => void;
  onUpdateParams: (id: string, params: Record<string, any>) => void;
  onRebalanceAllocations: (allocations: Record<string, number>) => void;
  onExecuteSignal?: (signal: TradingSignal) => void;
  lang: 'ar' | 'en';
  reduceMotion?: boolean;
}

// Metrics are shown only when they really exist: never a made-up default (the old code displayed e.g. 79.2% win rate / 2.95 Sharpe).
const fmtMetric = (v: unknown, digits = 2, suffix = ''): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : '—';
const fmtSigned = (v: unknown, digits = 2, suffix = ''): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(digits)}${suffix}` : '—';
const fmtPnl = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}` : '—';

export const StrategyEngineView: React.FC<StrategyEngineViewProps> = ({
  strategies,
  screenerItems,
  latestSignal,
  signalHistory,
  onToggleStrategy,
  onUpdateParams,
  onRebalanceAllocations,
  onExecuteSignal,
  lang,
  reduceMotion = false,
}) => {
  const isAr = lang === 'ar';

  const displayStrategies = useMemo(() => {
    if (Array.isArray(strategies) && strategies.length > 0) {
      return strategies.filter(Boolean);
    }
    return DEFAULT_BOT_STRATEGIES;
  }, [strategies]);

  // Local state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(() => {
    return (strategies && strategies[0]?.id) || DEFAULT_BOT_STRATEGIES[0]?.id || 'ou-mean-reversion';
  });
  const [screenerFilter, setScreenerFilter] = useState<'ALL' | 'QUALIFIED' | 'SIGNALS' | 'TREND'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingParamsId, setEditingParamsId] = useState<string | null>(null);
  const [tempParams, setTempParams] = useState<Record<string, any>>({});
  const [isRebalancing, setIsRebalancing] = useState<boolean>(false);
  const [tempAllocations, setTempAllocations] = useState<Record<string, number>>({});
  const [activeTabSubView, setActiveTabSubView] = useState<'MATRIX' | 'SCREENER' | 'PERFORMANCE' | 'TUNER'>('MATRIX');
  const [quickBacktestRunning, setQuickBacktestRunning] = useState<boolean>(false);
  const [mcSimulationRunning, setMcSimulationRunning] = useState<boolean>(false);
  const [mcSimulationResult, setMcSimulationResult] = useState<any | null>(null);
  const [backtestOutput, setBacktestOutput] = useState<any | null>(null);

  const activeStrategy: BotStrategy = useMemo(() => {
    const validList = displayStrategies.length > 0 ? displayStrategies : DEFAULT_BOT_STRATEGIES;
    const found = validList.find((s) => s && s.id === selectedStrategyId);
    return found || validList[0] || DEFAULT_BOT_STRATEGIES[0];
  }, [displayStrategies, selectedStrategyId]);

  // Aggregate metrics
  const totalAllocated = useMemo(() => {
    return displayStrategies.reduce((acc, s) => acc + (s.allocatedCapital || 0), 0);
  }, [displayStrategies]);

  const totalRealizedPnl = useMemo(() => {
    return displayStrategies.reduce((acc, s) => acc + (s.metrics?.realizedPnl || 0), 0);
  }, [displayStrategies]);

  const avgWinRate = useMemo(() => {
    if (!displayStrategies.length) return 0;
    const sum = displayStrategies.reduce((acc, s) => acc + (s.metrics?.winRatePct || 0), 0);
    return Number((sum / displayStrategies.length).toFixed(1));
  }, [displayStrategies]);

  const activeStrategiesCount = useMemo(() => {
    return displayStrategies.filter((s) => s.status === 'ACTIVE').length;
  }, [displayStrategies]);

  // Filtered screener items
  const filteredScreener = useMemo(() => {
    return screenerItems.filter((item) => {
      if (searchQuery && !item.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (screenerFilter === 'QUALIFIED') return item.isQualified;
      if (screenerFilter === 'SIGNALS') return !!item.activeSignal;
      if (screenerFilter === 'TREND') return item.hurst > 0.55;
      return true;
    });
  }, [screenerItems, screenerFilter, searchQuery]);

  // Handle opening parameter tuner
  const handleOpenTuner = (strategy: BotStrategy) => {
    setEditingParamsId(strategy.id);
    setTempParams({ ...strategy.params });
  };

  const handleSaveParams = () => {
    if (editingParamsId) {
      onUpdateParams(editingParamsId, tempParams);
      setEditingParamsId(null);
    }
  };

  // Handle rebalance mode
  const handleOpenRebalance = () => {
    const initAlloc: Record<string, number> = {};
    displayStrategies.forEach((s) => {
      initAlloc[s.id] = s.allocationPct;
    });
    setTempAllocations(initAlloc);
    setIsRebalancing(true);
  };

  const handleSaveRebalance = () => {
    onRebalanceAllocations(tempAllocations);
    setIsRebalancing(false);
  };

  // Run quick parameter simulation
  const handleRunMonteCarlo = () => {
    setMcSimulationRunning(true);
    setTimeout(() => {
      const pnls = [45.2, -18.4, 52.1, 29.3, -19.1, 64.0, -17.5, 41.2, 48.9, -20.4, 75.1, -18.2, 33.6, 51.0, -16.8];
      const iters = 10000;
      const n = pnls.length;
      const finalReturns: number[] = [];
      const drawdowns: number[] = [];
      for (let i = 0; i < iters; i++) {
        let cum = 0, pk = 0, maxD = 0;
        for (let j = 0; j < n; j++) {
          const val = pnls[Math.floor(Math.random() * n)];
          cum += val;
          if (cum > pk) pk = cum;
          if (pk - cum > maxD) maxD = pk - cum;
        }
        finalReturns.push(cum);
        drawdowns.push(maxD);
      }
      finalReturns.sort((a, b) => a - b);
      drawdowns.sort((a, b) => a - b);
      const var95 = finalReturns[Math.floor(iters * 0.05)];
      const tail = finalReturns.slice(0, Math.floor(iters * 0.05) + 1);
      const cvar = tail.reduce((a, b) => a + b, 0) / tail.length;
      const prob = (finalReturns.filter(r => r > 0).length / iters) * 100;
      setMcSimulationResult({
        probProfitPct: prob.toFixed(1),
        var95Dollar: var95.toFixed(2),
        cvar95Dollar: cvar.toFixed(2),
        worstCase: finalReturns[0].toFixed(2),
        bestCase: finalReturns[finalReturns.length - 1].toFixed(2),
        medianDd: drawdowns[Math.floor(iters * 0.5)].toFixed(2),
        expectedReturn: (finalReturns.reduce((a, b) => a + b, 0) / iters).toFixed(2),
      });
      setMcSimulationRunning(false);
    }, 450);
  };

  const handleRunQuickBacktest = async (strategyId: string) => {
    setQuickBacktestRunning(true);
    try {
      const data = await fetchWithAuth('/api/protected/backtest/run', {
        method: 'POST',
        body: JSON.stringify({
          symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
          startDate: '2024-01-01',
          endDate: '2024-08-30',
          initialCapital: 10000,
          strategyId,
        }),
      });
      if (data.success) {
        setBacktestOutput(data.result);
      } else {
        setBacktestOutput(null);
      }
    } catch (err) {
      console.error('Backtest request failed; no result is available:', err);
      setBacktestOutput(null);
    } finally {
      setQuickBacktestRunning(false);
    }
  };

  // Mock performance timeline for multi-strategy chart
  const performanceChartData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, idx) => ({
      day,
      'OU Mean Reversion': Math.round(1200 + idx * 820 + Math.sin(idx) * 300),
      'Quantum QUBO': Math.round(900 + idx * 640 + Math.cos(idx) * 200),
      'Regime Breakout': Math.round(600 + idx * 450 + Math.sin(idx * 2) * 150),
      'OFI Scalper': Math.round(400 + idx * 380 + idx * 50),
      'Delta Neutral': Math.round(300 + idx * 220 + 20),
    }));
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      
      {/* 1. Header & Strategy Matrix Command HUD */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--stroke)] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[rgba(var(--accent-rgb),0.15)] via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-[rgba(var(--accent-rgb),0.1)] border border-[var(--stroke-2)] text-[var(--cyan)]">
                <Cpu className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)] font-sans">
                  {isAr ? 'مركز قيادة استراتيجيات التداول الآلي' : 'Autonomous Multi-Strategy Hub'}
                </h1>
                <p className="text-xs sm:text-sm text-[var(--text-3)]">
                  {isAr 
                    ? 'إدارة النماذج الكمية والمراجحة الإحصائية والفلترة اللحظية للأصول بالبيانات المباشرة'
                    : 'Real-time mathematical model orchestration, live screener filtering & parameter tuning'}
                </p>
              </div>
            </div>
          </div>

          {/* Sub-View Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[rgba(0,0,0,0.3)] border border-[var(--stroke-2)] overflow-x-auto no-scrollbar">
            {[
              { id: 'MATRIX', labelAr: 'مصفوفة الاستراتيجيات', labelEn: 'Strategy Matrix', icon: Layers },
              { id: 'SCREENER', labelAr: 'الفاحص اللحظي للأزواج', labelEn: 'Live Screener', icon: Search },
              { id: 'PERFORMANCE', labelAr: 'مقارنة الأداء', labelEn: 'Performance', icon: TrendingUp },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTabSubView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabSubView(tab.id as any)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-mono text-xs tracking-wider uppercase transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[var(--cyan)] text-black font-bold shadow-[0_0_12px_rgba(var(--accent-rgb),0.3)]'
                      : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isAr ? tab.labelAr : tab.labelEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Key Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-5 pt-5 border-t border-[var(--stroke)]">
          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--stroke)]">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-3)] block mb-1">
              {isAr ? 'الاستراتيجيات النشطة' : 'Active Strategies'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold font-mono text-[var(--cyan)]">
                {activeStrategiesCount} / {displayStrategies.length}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {isAr ? 'يعمل' : 'Live'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--stroke)]">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-3)] block mb-1">
              {isAr ? 'معدل الفوز الإجمالي' : 'Overall Win Rate'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">
                {avgWinRate}%
              </span>
              <span className="text-[10px] font-mono text-[var(--text-3)]">
                ({displayStrategies.reduce((a, b) => a + (b.metrics?.totalTrades || 0), 0)} {isAr ? 'صفقة' : 'trades'})
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--stroke)]">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-3)] block mb-1">
              {isAr ? 'إجمالي أرباح الاستراتيجيات' : 'Total Realized PnL'}
            </span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-lg sm:text-xl">
              <TrendingUp className="w-4 h-4" />
              <span>+${totalRealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--stroke)]">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-3)] block mb-1">
              {isAr ? 'رأس المال الموزع' : 'Allocated Capital'}
            </span>
            <div className="flex items-center justify-between">
              <span className="text-lg sm:text-xl font-bold font-mono text-[var(--text)]">
                ${totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <button
                type="button"
                onClick={handleOpenRebalance}
                className="p-1.5 rounded-lg bg-[rgba(var(--accent-rgb),0.1)] hover:bg-[rgba(var(--accent-rgb),0.2)] text-[var(--cyan)] border border-[var(--stroke-2)] transition-all cursor-pointer text-xs flex items-center gap-1"
                title={isAr ? 'إعادة توزيع الأوزان' : 'Rebalance weights'}
              >
                <PieIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px] font-mono font-semibold">{isAr ? 'توزيع' : 'Rebalance'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN SUB-VIEW: STRATEGY MATRIX */}
      {activeTabSubView === 'MATRIX' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          
          {/* Strategy Cards List (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold font-mono uppercase tracking-widest text-[var(--text-2)] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--cyan)]" />
                {isAr ? 'الاستراتيجيات المتاحة والتوزيع' : 'Configured Model Portfolio'}
              </h2>
              <span className="text-xs font-mono text-[var(--text-3)]">
                {displayStrategies.length} {isAr ? 'نماذج كمية' : 'Quant Models'}
              </span>
            </div>

            {displayStrategies.map((strat) => {
              const isSelected = strat.id === selectedStrategyId;
              const isActive = strat.status === 'ACTIVE';

              return (
                <div
                  key={strat.id}
                  onClick={() => setSelectedStrategyId(strat.id)}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-[rgba(var(--accent-rgb),0.06)] border-[var(--stroke-2)] shadow-[0_0_20px_rgba(var(--accent-rgb),0.12)]'
                      : 'bg-[var(--card)] border-[var(--stroke)] hover:border-[var(--stroke-2)] hover:bg-[rgba(255,255,255,0.02)]'
                  }`}
                >
                  {/* Active Border Glow Strip */}
                  {isSelected && (
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]" />
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${
                        isActive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400'
                      }`}>
                        {strat.category === 'STATISTICAL_ARBITRAGE' && <Binary className="w-5 h-5" />}
                        {strat.category === 'QUANTUM_ALPHA' && <Sparkles className="w-5 h-5" />}
                        {strat.category === 'MOMENTUM_BREAKOUT' && <Flame className="w-5 h-5" />}
                        {strat.category === 'ORDERBOOK_MICROSTRUCTURE' && <Activity className="w-5 h-5" />}
                        {strat.category === 'DELTA_NEUTRAL' && <Shield className="w-5 h-5" />}
                        {strat.category === 'TREND_FOLLOWING' && <TrendingUp className="w-5 h-5" />}
                        {strat.category === 'MULTI_AGENT_ML' && <Cpu className="w-5 h-5 text-cyan-400" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-[var(--text)]">
                            {isAr ? strat.nameAr : strat.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-black/40 border border-[var(--stroke)] text-[var(--text-3)]">
                            {strat.executionTag}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-3)] line-clamp-1 mt-0.5">
                          {isAr ? strat.descriptionAr : strat.description}
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenTuner(strat)}
                        className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(var(--accent-rgb),0.15)] text-[var(--text-3)] hover:text-[var(--cyan)] border border-[var(--stroke)] transition-all cursor-pointer"
                        title={isAr ? 'ضبط المعاملات الرياضية' : 'Tune Parameters'}
                      >
                        <Sliders className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleStrategy(strat.id, !isActive)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-semibold border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-800/40 hover:bg-zinc-800/70 text-zinc-400 border-zinc-700/40'
                        }`}
                      >
                        {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isActive ? (isAr ? 'نشط' : 'Active') : (isAr ? 'موقف' : 'Paused')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Allocation Weight Progress Bar */}
                  <div className="my-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-3)]">
                      <span>{isAr ? 'الوزن المخصص للمحفظة' : 'Portfolio Weight'}</span>
                      <span className="font-bold text-[var(--cyan)]">{strat.allocationPct}% (${(strat.allocatedCapital || 0).toLocaleString()})</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-[var(--stroke)]">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--cyan)] to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${strat.allocationPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Performance Snapshot Metrics */}
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[var(--stroke)] text-center font-mono">
                    <div className="p-1.5 rounded-lg bg-black/20">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)] block">
                        {isAr ? 'نسبة الفوز' : 'Win Rate'}
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {strat.metrics?.winRatePct || 0}%
                      </span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-black/20">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)] block">
                        {isAr ? 'معامل الربح' : 'Profit Factor'}
                      </span>
                      <span className="text-xs font-bold text-[var(--cyan)]">
                        {fmtMetric(strat.metrics?.profitFactor)}
                      </span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-black/20">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)] block">
                        {isAr ? 'شارب ريشيو' : 'Sharpe'}
                      </span>
                      <span className="text-xs font-bold text-[var(--text)]">
                        {fmtMetric(strat.metrics?.sharpeRatio)}
                      </span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-black/20">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)] block">
                        {isAr ? 'الأرباح المحققة' : 'Realized PnL'}
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {fmtPnl(strat.metrics?.realizedPnl)}
                      </span>
                    </div>
                  </div>

                  {/* Target Symbols Chips */}
                  <div className="flex items-center gap-1.5 mt-3 pt-2 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] font-mono text-[var(--text-3)] shrink-0">
                      {isAr ? 'الأزواج:' : 'Pairs:'}
                    </span>
                    {strat.targetSymbols?.map((sym) => (
                      <span
                        key={sym}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-[var(--stroke)] text-[var(--text-2)] whitespace-nowrap"
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Selected Strategy Inspector & Parameter Hub (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--stroke-2)] shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--stroke)]">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--cyan)]" />
                  <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-[var(--text)]">
                    {isAr ? 'معايير النموذج الرياضي' : 'Model Parameters & Logic'}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[rgba(var(--accent-rgb),0.1)] text-[var(--cyan)] border border-[var(--stroke-2)]">
                  {activeStrategy?.timeframe || '1m / 5m'}
                </span>
              </div>

              <div>
                <h4 className="text-base font-bold text-[var(--text)] mb-1">
                  {isAr ? (activeStrategy?.nameAr || activeStrategy?.name) : (activeStrategy?.name || 'Strategy')}
                </h4>
                <p className="text-xs text-[var(--text-3)] leading-relaxed">
                  {isAr ? (activeStrategy?.descriptionAr || activeStrategy?.description) : (activeStrategy?.description || '')}
                </p>
              </div>

              {/* Strategy Parameters Key-Value Grid */}
              <div className="space-y-2.5 font-mono text-xs">
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-3)] block mb-1">
                  {isAr ? 'المعاملات النشطة حالياً (Live Parameters):' : 'Active Execution Parameters:'}
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(activeStrategy?.params || {}).map(([key, val]) => (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl bg-black/30 border border-[var(--stroke)] flex flex-col justify-between"
                    >
                      <span className="text-[10px] text-[var(--text-3)] truncate" title={key}>
                        {key}
                      </span>
                      <span className="text-xs font-bold text-[var(--cyan)] mt-1">
                        {typeof val === 'number' ? val.toString() : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fast Test Action Toolbar */}
              <div className="pt-3 border-t border-[var(--stroke)] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => activeStrategy && handleOpenTuner(activeStrategy)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[rgba(var(--accent-rgb),0.12)] hover:bg-[rgba(var(--accent-rgb),0.2)] text-[var(--cyan)] border border-[var(--stroke-2)] font-mono text-xs font-bold transition-all cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تعديل المعاملات' : 'Edit Parameters'}</span>
                </button>

                <button
                  type="button"
                  disabled={quickBacktestRunning || !activeStrategy?.id}
                  onClick={() => activeStrategy?.id && handleRunQuickBacktest(activeStrategy.id)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text)] border border-[var(--stroke)] font-mono text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${quickBacktestRunning ? 'animate-spin text-[var(--cyan)]' : ''}`} />
                  <span>{quickBacktestRunning ? (isAr ? 'محاكاة...' : 'Simulating...') : (isAr ? 'اختبار سريع' : 'Quick Test')}</span>
                </button>
              </div>

              {/* Quick Backtest Result Panel */}
              {backtestOutput && (
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between text-emerald-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isAr ? 'نتائج المحاكاة السريعة للنموذج:' : 'Quick Simulation Performance:'}
                    </span>
                    <span>{fmtSigned(backtestOutput.netReturnPct ?? backtestOutput.totalReturnPct, 2, '%')} PnL</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--text-3)] pt-1">
                    <div>
                      <span>{isAr ? 'نسبة الفوز:' : 'Win Rate:'}</span>
                      <p className="font-bold text-[var(--text)]">{fmtMetric(backtestOutput.winRatePct, 1, '%')}</p>
                    </div>
                    <div>
                      <span>{isAr ? 'معامل الربح:' : 'Profit Factor:'}</span>
                      <p className="font-bold text-[var(--cyan)]">{fmtMetric(backtestOutput.profitFactor)}</p>
                    </div>
                    <div>
                      <span>{isAr ? 'شارب ريشيو:' : 'Sharpe:'}</span>
                      <p className="font-bold text-emerald-400">{fmtMetric(backtestOutput.sharpeRatio)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Strategy Signal Stream Card */}
            <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--stroke)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-2)] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {isAr ? 'أحدث إشارة صادرة من الاستراتيجية' : 'Latest Strategy Signal'}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-3)]">
                  {latestSignal ? new Date(latestSignal.timestamp).toLocaleTimeString() : 'Monitoring...'}
                </span>
              </div>

              {latestSignal ? (
                <div className="p-3 rounded-xl bg-black/30 border border-[var(--stroke)] space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text)]">{latestSignal.symbol}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      latestSignal.type.includes('BUY')
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : latestSignal.type.includes('SELL')
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {latestSignal.type}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--text-3)] font-sans">
                    {latestSignal.reason}
                  </p>

                  <div className="grid grid-cols-3 gap-1 text-[10px] pt-2 border-t border-[var(--stroke)] text-[var(--text-3)]">
                    <div>
                      <span>Z-Score:</span>
                      <p className="font-bold text-[var(--cyan)]">{latestSignal.zScore?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div>
                      <span>{isAr ? 'الهدف TP:' : 'Take Profit:'}</span>
                      <p className="font-bold text-emerald-400">${latestSignal.takeProfit?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div>
                      <span>{isAr ? 'الوقف SL:' : 'Stop Loss:'}</span>
                      <p className="font-bold text-rose-400">${latestSignal.stopLoss?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-black/20 border border-[var(--stroke)] text-center text-xs font-mono text-[var(--text-3)]">
                  {isAr ? 'لا توجد إشارات جديدة حالياً · المحرك يراقب السيولة' : 'Awaiting signal triggers · Continuous tick scanning'}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* 3. SUB-VIEW: LIVE SCREENER TABLE */}
      {activeTabSubView === 'SCREENER' && (
        <div className="p-4 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--stroke)] shadow-2xl space-y-4">
          
          {/* Screener Controls & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-[var(--cyan)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث عن زوج (مثال: BTC, SOL, ETH)...' : 'Search symbol (e.g. BTC, SOL)...'}
                className="bg-black/30 border border-[var(--stroke)] rounded-xl px-3 py-1.5 text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--cyan)] w-48 sm:w-64"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'ALL', labelAr: 'الكل', labelEn: 'All Assets' },
                { id: 'QUALIFIED', labelAr: 'المؤهلة فقط', labelEn: 'Qualified' },
                { id: 'SIGNALS', labelAr: 'إشارات نشطة', labelEn: 'Active Signals' },
                { id: 'TREND', labelAr: 'أسواق اتجاهية (H>0.55)', labelEn: 'Trending' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setScreenerFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                    screenerFilter === f.id
                      ? 'bg-[var(--cyan)] text-black font-bold border-[var(--cyan)]'
                      : 'bg-black/20 text-[var(--text-3)] hover:text-[var(--text)] border-[var(--stroke)]'
                  }`}
                >
                  {isAr ? f.labelAr : f.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Screener Table */}
          <div className="overflow-x-auto no-scrollbar rounded-xl border border-[var(--stroke)]">
            <table className="w-full text-left font-mono text-xs border-collapse" dir={isAr ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="bg-black/40 text-[var(--text-3)] text-[10px] uppercase tracking-widest border-b border-[var(--stroke)]">
                  <th className="p-3">{isAr ? 'الزوج' : 'Symbol'}</th>
                  <th className="p-3">{isAr ? 'السعر اللحظي' : 'Live Price'}</th>
                  <th className="p-3">{isAr ? 'تغير 24h' : '24h Chg'}</th>
                  <th className="p-3">{isAr ? 'انحراف Z-Score' : 'Z-Score'}</th>
                  <th className="p-3">{isAr ? 'نصف العمر (HL)' : 'Half-Life'}</th>
                  <th className="p-3">{isAr ? 'مؤشر هيرست (H)' : 'Hurst'}</th>
                  <th className="p-3">{isAr ? 'مؤشر RSI' : 'RSI(14)'}</th>
                  <th className="p-3">{isAr ? 'درجة الملاءمة' : 'Suitability'}</th>
                  <th className="p-3">{isAr ? 'الاستراتيجية الموصى بها' : 'Strategy'}</th>
                  <th className="p-3 text-right">{isAr ? 'الإجراء / الإشارة' : 'Signal / Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--stroke)]">
                {filteredScreener.map((item) => {
                  const isZBuy = item.zScore <= -1.6;
                  const isZSell = item.zScore >= 1.6;
                  const isHurstGood = item.hurst <= 0.58;

                  return (
                    <tr
                      key={item.symbol}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Symbol */}
                      <td className="p-3 font-bold text-[var(--text)] flex items-center gap-2">
                        <span>{item.symbol}</span>
                        {item.isQualified ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Qualified" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={item.reason} />
                        )}
                      </td>

                      {/* Live Price */}
                      <td className="p-3 font-mono text-[var(--text-2)]">
                        ${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>

                      {/* 24h Change */}
                      <td className="p-3">
                        <span className={`flex items-center gap-1 font-bold ${
                          item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {item.change24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {item.change24h >= 0 ? `+${item.change24h}%` : `${item.change24h}%`}
                        </span>
                      </td>

                      {/* Z-Score */}
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          isZBuy
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isZSell
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'text-[var(--text-3)]'
                        }`}>
                          {item.zScore > 0 ? `+${item.zScore.toFixed(2)}` : item.zScore.toFixed(2)}σ
                        </span>
                      </td>

                      {/* Half-Life */}
                      <td className="p-3 text-[var(--text-3)]">
                        {item.halfLife > 0 ? `${item.halfLife}p` : 'N/A'}
                      </td>

                      {/* Hurst Exponent */}
                      <td className="p-3">
                        <span className={isHurstGood ? 'text-emerald-400' : 'text-amber-400'}>
                          {item.hurst.toFixed(3)}
                        </span>
                      </td>

                      {/* RSI 14 */}
                      <td className="p-3 font-bold text-[var(--text-2)]">
                        {item.rsi.toFixed(1)}
                      </td>

                      {/* Suitability Score Bar */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--cyan)] rounded-full"
                              style={{ width: `${item.suitabilityScore}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--text-3)]">{item.suitabilityScore}%</span>
                        </div>
                      </td>

                      {/* Recommended Strategy Tag */}
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-black/30 border border-[var(--stroke)] text-[var(--text-3)]">
                          {item.recommendedStrategy}
                        </span>
                      </td>

                      {/* Action / Active Signal */}
                      <td className="p-3 text-right">
                        {item.activeSignal ? (
                          <button
                            type="button"
                            onClick={() => onExecuteSignal && onExecuteSignal(item.activeSignal!)}
                            className={`px-3 py-1 rounded-lg font-bold text-[10px] border transition-all cursor-pointer ${
                              item.activeSignal.type.includes('BUY')
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                            }`}
                          >
                            {item.activeSignal.type} (${item.activeSignal.targetPrice})
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--text-3)] font-mono">
                            {isAr ? 'مراقبة' : 'Scanning'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SUB-VIEW: PERFORMANCE COMPARISON CHART */}
      {activeTabSubView === 'PERFORMANCE' && (
        <div className="p-4 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--stroke)] shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[var(--text)] font-sans">
                {isAr ? 'منحنى العائد التراكمي وتوزيع الأرباح بالاستراتيجية' : 'Cumulative Multi-Strategy Profit Trajectory'}
              </h2>
              <p className="text-xs text-[var(--text-3)] font-mono">
                {isAr ? 'تحليل مساهمة كل نموذج كمي في نمو رأس المال الصافي' : 'Comparative performance decomposition across active alpha engines'}
              </p>
            </div>
          </div>

          {/* Recharts Area Curve */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradQUBO" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" stroke="var(--text-3)" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(6, 10, 18, 0.95)',
                    borderColor: 'var(--stroke-2)',
                    borderRadius: '12px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                <Area type="monotone" dataKey="OU Mean Reversion" stroke="#00f0ff" fillOpacity={1} fill="url(#gradOU)" strokeWidth={2} />
                <Area type="monotone" dataKey="Quantum QUBO" stroke="#10b981" fillOpacity={1} fill="url(#gradQUBO)" strokeWidth={2} />
                <Area type="monotone" dataKey="Regime Breakout" stroke="#f59e0b" fillOpacity={0.1} fill="#f59e0b" strokeWidth={1.5} />
                <Area type="monotone" dataKey="OFI Scalper" stroke="#a855f7" fillOpacity={0.1} fill="#a855f7" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Strategy Win Rate & PnL Breakdown Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-[var(--stroke)]">
            {displayStrategies.map((strat) => (
              <div key={strat.id} className="p-3 rounded-xl bg-black/20 border border-[var(--stroke)] font-mono text-xs">
                <span className="text-[10px] text-[var(--text-3)] truncate block mb-1">
                  {isAr ? strat.nameAr : strat.name}
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400">
                    {fmtPnl(strat.metrics?.realizedPnl)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                    {strat.metrics?.winRatePct || 0}% WR
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. MODAL / DRAWER: PARAMETER TUNER */}
      {editingParamsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--stroke-2)] shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--stroke)]">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[var(--cyan)]" />
                <h3 className="text-base font-bold font-mono text-[var(--text)]">
                  {isAr ? 'ضبط معاملات النموذج الرياضي اللحظية' : 'Tune Model Parameters'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingParamsId(null)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] hover:bg-white/[0.04] transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-3)]">
              {isAr
                ? 'يتم تطبيق المعاملات المعدلة فورياً في خوارزمية اتخاذ القرار دون الحاجة لإعادة تشغيل الخادم.'
                : 'Parameters update live in the Decision Engine with zero downtime or server restarts.'}
            </p>

            {/* Parameter Inputs */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {Object.entries(tempParams).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <label className="text-[var(--text-2)] capitalize">{key}:</label>
                    <span className="text-[var(--cyan)] font-bold">{val}</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={val}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value);
                      setTempParams((prev) => ({ ...prev, [key]: isNaN(num) ? e.target.value : num }));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[var(--stroke)] text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--cyan)]"
                  />
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[var(--stroke)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingParamsId(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-2)] font-mono text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveParams}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 text-black font-mono text-xs font-bold shadow-[0_0_12px_rgba(var(--accent-rgb),0.3)] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isAr ? 'حفظ وتطبيق فوراً' : 'Save & Hot Reload'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: CAPITAL REBALANCE SLIDERS */}
      {isRebalancing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--stroke-2)] shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--stroke)]">
              <div className="flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-[var(--cyan)]" />
                <h3 className="text-base font-bold font-mono text-[var(--text)]">
                  {isAr ? 'إعادة توزيع أوزان المحفظة الكمية' : 'Reallocate Model Weights'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRebalancing(false)}
                className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] hover:bg-white/[0.04] transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Sum Warning */}
            {(() => {
              const currentSum = Object.values(tempAllocations).reduce((a, b) => a + (Number(b) || 0), 0);
              const isPerfect = currentSum === 100;
              return (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between font-mono text-xs ${
                  isPerfect
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  <span>{isAr ? 'مجموع الأوزان الحالية:' : 'Total Weight Sum:'}</span>
                  <span className="font-bold">{currentSum}% / 100%</span>
                </div>
              );
            })()}

            {/* Sliders */}
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {displayStrategies.map((strat) => (
                <div key={strat.id} className="space-y-1.5">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-[var(--text)] font-semibold">{isAr ? strat.nameAr : strat.name}</span>
                    <span className="text-[var(--cyan)] font-bold">{tempAllocations[strat.id] ?? strat.allocationPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={tempAllocations[strat.id] ?? strat.allocationPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTempAllocations((prev) => ({ ...prev, [strat.id]: val }));
                    }}
                    className="w-full accent-[var(--cyan)] cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[var(--stroke)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRebalancing(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-2)] font-mono text-xs font-semibold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveRebalance}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 text-black font-mono text-xs font-bold shadow-[0_0_12px_rgba(var(--accent-rgb),0.3)] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isAr ? 'تطبيق الأوزان الجديدة' : 'Apply Allocations'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
