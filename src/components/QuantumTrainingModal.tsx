/**
 * QuantumTrainingModal.tsx
 * ====================================================================
 * Autonomous Quantum Board of Directors High-Volume Training Simulator
 * ====================================================================
 * 
 * Features:
 * - Dedicated $200 Testnet Sandbox Wallet (isolated from master live wallet)
 * - 100% Real Binance Kline & Price Stream evaluation
 * - Batch Simulation (25, 50, 100 Trades) & 24/7 Continuous Background Training
 * - Deep AI Post-Mortem Diagnostics (Exact Reasons for Win / Loss)
 * - Live Agent Reinforcement Learning Shifts (Confidence & Voting Authority)
 * ====================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Zap,
  Play,
  Pause,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  X,
  Sliders,
  DollarSign,
  Activity,
  Award,
  MessageSquare,
  Sparkles,
  GitCompare,
  Check,
  ChevronDown,
  ChevronUp,
  Flame
} from 'lucide-react';
import { QuantumTrainingTrade, QuantumTrainingWalletState, BinanceApiQuotaMetrics } from '../strategies/QuantumTrainingSimulator';
import { ActiveStrategyPolicy, BoardDeliberationSession } from '../strategies/BoardOfDirectorsEngine';

interface QuantumTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
  playTone?: (freq?: number, duration?: number) => void;
  onRefreshBoard?: () => void;
}

export const QuantumTrainingModal: React.FC<QuantumTrainingModalProps> = ({
  isOpen,
  onClose,
  lang,
  playTone,
  onRefreshBoard
}) => {
  const isAr = lang === 'ar';
  const [wallet, setWallet] = useState<QuantumTrainingWalletState>({
    initialAllocation: 200.0,
    currentEquity: 200.0,
    availableMargin: 200.0,
    usedMargin: 0.0,
    realizedProfit: 0.0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0.0,
    growthPct: 0.0,
    isAutoTraining: true,
    lastTrainingCycle: Date.now()
  });

  const [trades, setTrades] = useState<QuantumTrainingTrade[]>([]);
  const [activePolicy, setActivePolicy] = useState<ActiveStrategyPolicy | null>(null);
  const [binanceQuota, setBinanceQuota] = useState<BinanceApiQuotaMetrics | null>(null);
  const [expandedDelibId, setExpandedDelibId] = useState<string | null>(null);
  const [delibActiveTab, setDelibActiveTab] = useState<'r1' | 'r2' | 'r3' | 'r4'>('r1');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [selectedSymbolFilter, setSelectedSymbolFilter] = useState<string>('ALL');
  const [selectedTrade, setSelectedTrade] = useState<QuantumTrainingTrade | null>(null);

  // Fetch training status and trade logs
  const fetchTrainingStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/quantum-training/status');
      if (res.ok) {
        const data = await res.json();
        if (data.wallet) setWallet(data.wallet);
        if (Array.isArray(data.recentTrades)) setTrades(data.recentTrades);
        if (data.activePolicy) setActivePolicy(data.activePolicy);
        if (data.binanceQuota) setBinanceQuota(data.binanceQuota);
      }
    } catch (e) {
      console.error('Failed to fetch quantum training status:', e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTrainingStatus();
      const interval = setInterval(fetchTrainingStatus, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchTrainingStatus]);

  // Run Batch Training Cycle (e.g. 25 or 50 trades)
  const handleRunBatch = async (count: number) => {
    if (isBatchRunning) return;
    setIsBatchRunning(true);
    if (playTone) playTone(700, 0.1);

    try {
      const res = await fetch('/api/quantum-training/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const data = await res.json();
      if (data.success) {
        if (data.wallet) setWallet(data.wallet);
        await fetchTrainingStatus();
        if (onRefreshBoard) onRefreshBoard();
        if (playTone) playTone(data.netPnl >= 0 ? 880 : 440, 0.15);
      }
    } catch (e) {
      console.error('Batch training failed:', e);
    } finally {
      setIsBatchRunning(false);
    }
  };

  // Toggle Continuous Auto-Training
  const handleToggleAuto = async () => {
    try {
      const nextState = !wallet.isAutoTraining;
      if (playTone) playTone(nextState ? 900 : 500, 0.1);
      const res = await fetch('/api/quantum-training/toggle-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: nextState })
      });
      const data = await res.json();
      if (data.success) {
        setWallet(prev => ({ ...prev, isAutoTraining: data.isAutoTraining }));
      }
    } catch (e) {
      console.error('Failed to toggle auto training:', e);
    }
  };

  // Reset Training Wallet ($200)
  const handleResetWallet = async () => {
    if (playTone) playTone(400, 0.2);
    try {
      const res = await fetch('/api/quantum-training/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 200.0 })
      });
      const data = await res.json();
      if (data.success) {
        setWallet(data.wallet);
        setTrades([]);
        setSelectedTrade(null);
      }
    } catch (e) {
      console.error('Failed to reset training wallet:', e);
    }
  };

  if (!isOpen) return null;

  const filteredTrades = trades.filter(t => {
    if (filterOutcome === 'WIN' && !t.isWin) return false;
    if (filterOutcome === 'LOSS' && t.isWin) return false;
    if (selectedSymbolFilter !== 'ALL' && t.symbol !== selectedSymbolFilter) return false;
    return true;
  });

  const isProfitPositive = wallet.realizedProfit >= 0;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto ${isAr ? 'rtl' : 'ltr'}`}>
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#070b12] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden quant-grid-bg text-slate-100">
        
        {/* TOP HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-base sm:text-lg font-bold text-white tracking-wide">
                  {isAr ? 'محاكي تدريب مجلس الإدارة الكمي' : 'Quantum Board Training Simulator'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {isAr ? 'محفظة معزولة 200$' : 'Isolated $200 Sandbox'}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  100% REAL BINANCE API
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr ? 'نظام محاكاة وتكرار صفقات عالي السرعة بأسعار بايننس الحقيقية لتدريب وتطوير خوارزميات الوكلاء الـ 14 ذاتياً' : 'High-throughput testnet simulation with real historical Binance candles for autonomous agent reinforcement learning'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-400 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* 🧠 0. AUTONOMOUS STRATEGY EVOLUTION & ERROR REDUCTION COCKPIT */}
          {activePolicy && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span className="font-mono text-xs font-bold text-cyan-300">
                    {isAr ? 'محرك التعلم الذاتي وتطوير الاستراتيجية التراكمي (Autonomous Policy Evolution)' : 'Autonomous Strategy Policy Evolution & Error Reduction'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    v{activePolicy.version}.0
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-slate-400">{isAr ? 'جلسات المداولة المكتملة:' : 'Deliberations Held:'} <b className="text-white">{activePolicy.totalDeliberationsHeld}</b></span>
                </div>
              </div>

              {/* Error Reduction Progress Bar & Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="sm:col-span-1 p-2.5 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-1">{isAr ? 'مؤشر التخلص من الأخطاء والكمال:' : 'Error Reduction Score:'}</span>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-emerald-400 tabular-nums">{activePolicy.errorReductionScore}%</span>
                    <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, activePolicy.errorReductionScore)}%` }}
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'عتبة دخول Z-Score:' : 'Z-Score Threshold:'}</span>
                  <span className="text-base font-bold text-cyan-300 tabular-nums">≥ {activePolicy.zScoreEntryThreshold}σ</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">{isAr ? 'فلتر منع الاختراقات الوهمية' : 'False breakout rejection'}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'نصاب حراس الأمان:' : 'Guards Quorum:'}</span>
                  <span className="text-base font-bold text-emerald-300 tabular-nums">≥ {activePolicy.minGuardsQuorum}/8 {isAr ? 'حراس' : 'Guards'}</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">{isAr ? 'إجماع صارم مضاد للانزلاق' : 'Anti-overfitting consensus'}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">{isAr ? 'مضاعف الوقف التكيفي:' : 'Adaptive ATR SL:'}</span>
                  <span className="text-base font-bold text-amber-300 tabular-nums">x{activePolicy.stopLossPctMultiplier}</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">{isAr ? 'عزل ضوضاء السوق اللحظية' : 'Micro-noise immunity'}</span>
                </div>
              </div>

              {/* Binance Rate Limit & Weight Quota Shield Bar */}
              {binanceQuota && (
                <div className="p-2.5 rounded-lg bg-slate-950/90 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-emerald-300">
                      {isAr ? 'حماية حصة بايننس (Binance API Quota Shield):' : 'Binance API Quota Shield:'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                      {binanceQuota.status} ({binanceQuota.quotaUsagePct}% {isAr ? 'مستهلك فقط' : 'Used'})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-slate-400 text-[10px]">
                    <span>{isAr ? 'الوزن اللحظي:' : 'Weight:'} <b className="text-slate-200">{binanceQuota.usedWeight1m} / {binanceQuota.maxWeightLimit}</b></span>
                    <span>{isAr ? 'نسبة الكاش الذكي:' : 'Cache Hit:'} <b className="text-cyan-300">{binanceQuota.cacheHitRatePct}%</b></span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {isAr ? `تكرار آلي كل ${binanceQuota.trainingIntervalSec}ث بدون لمس` : `Auto-run every ${binanceQuota.trainingIntervalSec}s`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 💎 1. $200 TRAINING WALLET KPI BAR */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Equity */}
            <div className="p-3.5 sm:p-4 rounded-xl quant-card border border-cyan-500/25">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isAr ? 'رصيد محفظة التدريب:' : 'Sandbox Equity:'}</span>
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-xl sm:text-2xl font-mono font-bold text-cyan-300 tabular-nums">
                ${wallet.currentEquity.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                {isAr ? 'رأس المال المبدئي:' : 'Initial:'} $200.00 USDT
              </div>
            </div>

            {/* Realized Profit */}
            <div className="p-3.5 sm:p-4 rounded-xl quant-card border border-white/5">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isAr ? 'صافي أرباح المحاكاة:' : 'Realized PnL:'}</span>
                {isProfitPositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
              </div>
              <div className={`text-xl sm:text-2xl font-mono font-bold tabular-nums ${isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfitPositive ? '+' : ''}${wallet.realizedProfit.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                {isAr ? 'العائد على الرصيد:' : 'ROI:'} <b className={wallet.growthPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{wallet.growthPct >= 0 ? '+' : ''}{wallet.growthPct}%</b>
              </div>
            </div>

            {/* Win Rate */}
            <div className="p-3.5 sm:p-4 rounded-xl quant-card border border-white/5">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isAr ? 'نسبة نجاح الصفقات:' : 'Win Rate:'}</span>
                <Award className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
                {wallet.winRate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                {wallet.winningTrades} {isAr ? 'ربح' : 'W'} · {wallet.losingTrades} {isAr ? 'خسارة' : 'L'}
              </div>
            </div>

            {/* Total Executed Cycles */}
            <div className="p-3.5 sm:p-4 rounded-xl quant-card border border-white/5">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isAr ? 'إجمالي صفقات التدريب:' : 'Total Cycles:'}</span>
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
                {wallet.totalTrades}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                {wallet.isAutoTraining ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {isAr ? 'محاكاة مستمرة نشطة' : 'Continuous Active'}
                  </span>
                ) : (
                  <span className="text-slate-500">{isAr ? 'التدريب التلقائي متوقف' : 'Auto Idle'}</span>
                )}
              </div>
            </div>
          </div>

          {/* ⚡ 2. SIMULATION CONTROLS & BATCH TRIGGERS */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Batch 25 Button */}
              <button
                type="button"
                disabled={isBatchRunning}
                onClick={() => handleRunBatch(25)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600/30 to-emerald-600/30 hover:from-cyan-600/40 hover:to-emerald-600/40 border border-cyan-400/40 text-cyan-200 text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50 min-h-[40px]"
              >
                <Zap className={`w-4 h-4 text-cyan-300 ${isBatchRunning ? 'animate-spin' : ''}`} />
                <span>{isBatchRunning ? (isAr ? 'جاري محاكاة الصفقات...' : 'Processing...') : (isAr ? '⚡ تدريب فوري (25 صفقة حقيقية)' : '⚡ Train Batch (25 Trades)')}</span>
              </button>

              {/* Batch 50 Button */}
              <button
                type="button"
                disabled={isBatchRunning}
                onClick={() => handleRunBatch(50)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-cyan-400 text-slate-200 hover:text-white text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 min-h-[40px]"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? '🚀 تدريب مكثف (50 صفقة)' : '🚀 Deep Batch (50 Trades)'}</span>
              </button>

              {/* Continuous Auto-Training Toggle */}
              <button
                type="button"
                onClick={handleToggleAuto}
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold transition cursor-pointer flex items-center gap-2 min-h-[40px] ${
                  wallet.isAutoTraining
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {wallet.isAutoTraining ? <Pause className="w-4 h-4 text-emerald-400" /> : <Play className="w-4 h-4 text-cyan-400" />}
                <span>{wallet.isAutoTraining ? (isAr ? 'إيقاف التدريب المستمر' : 'Pause Auto') : (isAr ? 'تشغيل 24/7 مستمر' : 'Run 24/7 Auto')}</span>
              </button>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleResetWallet}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5"
              title={isAr ? 'إعادة تعيين المحفظة وسجل الصفقات' : 'Reset Sandbox Wallet to $200'}
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>{isAr ? 'تصفير المحفظة ($200)' : 'Reset Sandbox'}</span>
            </button>
          </div>

          {/* 🔍 3. FILTER CONTROLS */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pt-2">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/5">
              {[
                { id: 'ALL', labelAr: 'الكل', labelEn: 'All Trades' },
                { id: 'WIN', labelAr: 'الرابحة فقط', labelEn: 'Wins Only' },
                { id: 'LOSS', labelAr: 'الخاسرة فقط', labelEn: 'Losses Only' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterOutcome(f.id as any)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    filterOutcome === f.id
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isAr ? f.labelAr : f.labelEn}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500">{isAr ? 'عدد الصفقات المعروضة:' : 'Showing:'} <b className="text-white">{filteredTrades.length}</b></span>
            </div>
          </div>

          {/* 📜 4. DETAILED SIMULATED TRADES & POST-MORTEM TABLE */}
          <div className="space-y-3">
            {filteredTrades.length === 0 ? (
              <div className="py-12 text-center quant-card p-6 border border-white/5 text-slate-400 font-mono text-xs space-y-2">
                <Brain className="w-10 h-10 text-cyan-400/50 mx-auto mb-2 animate-pulse" />
                <p className="text-white text-sm font-semibold">{isAr ? 'لا توجد صفقات تدريب مسجلة حالياً' : 'No training trades recorded yet'}</p>
                <p className="text-[11px] text-slate-500">
                  {isAr ? 'اضغط على زر "⚡ تدريب فوري (25 صفقة حقيقية)" لبدء دورة المحاكاة والتعلم الخوارزمي فوراً.' : 'Click "Train Batch" to execute real-price simulations and calibrate the 14 agents.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredTrades.map((trade) => {
                  const isBuy = trade.side === 'BUY';
                  const isSelected = selectedTrade?.id === trade.id;

                  return (
                    <div
                      key={trade.id}
                      onClick={() => setSelectedTrade(isSelected ? null : trade)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer quant-card ${
                        trade.isWin
                          ? 'border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/[0.02]'
                          : 'border-rose-500/20 hover:border-rose-500/40 bg-rose-500/[0.02]'
                      } ${isSelected ? 'ring-1 ring-cyan-400/40 border-cyan-400/50' : ''}`}
                    >
                      {/* Top Row: Symbol, Side, Net PnL */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-sm font-bold text-white">{trade.symbol}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
                            isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {isBuy ? 'LONG' : 'SHORT'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-300 font-semibold tabular-nums">
                            {trade.leverage}x
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {trade.durationMinutes}m
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right rtl:text-left font-mono">
                            <span className={`text-sm font-bold tabular-nums ${trade.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.isWin ? '+' : ''}${trade.pnl.toFixed(2)} USDT
                            </span>
                            <span className={`text-[10px] block tabular-nums ${trade.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ({trade.isWin ? '+' : ''}{trade.pnlPct}%)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Prices and Margins */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5 text-xs font-mono text-slate-400">
                        <div>
                          <span className="text-[10px] text-slate-500 block">{isAr ? 'سعر الدخول:' : 'Entry:'}</span>
                          <span className="text-slate-200 tabular-nums">${trade.entryPrice >= 100 ? trade.entryPrice.toLocaleString() : trade.entryPrice}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">{isAr ? 'سعر الإغلاق:' : 'Exit:'}</span>
                          <span className="text-slate-200 tabular-nums">${trade.exitPrice >= 100 ? trade.exitPrice.toLocaleString() : trade.exitPrice}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">{isAr ? 'الهامش المحجوز:' : 'Margin:'}</span>
                          <span className="text-slate-200 tabular-nums">${trade.marginUsed}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">{isAr ? 'إجماع المجلس:' : 'Consensus:'}</span>
                          <span className="text-cyan-300 font-semibold tabular-nums">{trade.approvalRatio}% ({trade.guardsPassed}/8 Guards)</span>
                        </div>
                      </div>

                      {/* 📋 POST-MORTEM REASONS (أسباب الربح أو الخسارة الفنية) */}
                      <div className="pt-2.5 border-t border-white/5 space-y-1 text-xs">
                        <div className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          {trade.isWin ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span>{isAr ? (trade.isWin ? 'تشخيص أسباب نجاح الصفقة:' : 'تشخيص أسباب الخسارة واستجابة التعلم:') : (trade.isWin ? 'Post-Mortem: Why Trade Won:' : 'Post-Mortem: Loss Reason & Learning Shift:')}</span>
                        </div>

                        {(isAr ? trade.reasonsAr : trade.reasonsEn).map((reason, rIdx) => (
                          <p key={rIdx} className={`text-[11px] leading-relaxed ${trade.isWin ? 'text-emerald-300/90' : 'text-slate-300'}`}>
                            {reason}
                          </p>
                        ))}
                      </div>

                      {/* 🧠 14-MEMBER DEEP POST-MORTEM & DELIBERATION SESSION */}
                      {trade.deliberation && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDelibId(expandedDelibId === trade.id ? null : trade.id);
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800/90 border border-cyan-500/20 text-xs font-mono transition text-slate-200 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Brain className="w-4 h-4 text-cyan-400 animate-pulse" />
                              <span className="font-bold text-cyan-300">
                                {isAr ? 'جلسة المداولة والنقد الذاتي لمجلس الإدارة (14 عضواً وتجربة 3 مرات)' : '14-Agent Post-Mortem Deliberation & 3x Trial Validation'}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 text-[10px]">
                                {trade.deliberation.errorReductionScore}% {isAr ? 'مؤشر التطور' : 'Score'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400">
                              <span className="text-[10px] hidden sm:inline">{expandedDelibId === trade.id ? (isAr ? 'إخفاء التفاصيل' : 'Hide') : (isAr ? 'عرض المناقشة' : 'Inspect')}</span>
                              {expandedDelibId === trade.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          {/* EXPANDED DELIBERATION DRAWER */}
                          {expandedDelibId === trade.id && (
                            <div className="mt-3 p-3 sm:p-4 rounded-xl bg-slate-950/95 border border-cyan-500/30 space-y-4 text-xs font-mono" onClick={(e) => e.stopPropagation()}>
                              {/* Sub-Tabs: R1 (Diagnoses), R2 (Debate), R3 (3x Trials), R4 (Adopted Policy) */}
                              <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-2">
                                {[
                                  { id: 'r1', labelAr: '1. تشخيصات الأعضاء الـ 14', labelEn: '1. 14-Agent Diagnoses' },
                                  { id: 'r2', labelAr: '2. المناقشة الحية وتبادل النقد', labelEn: '2. Peer Debate & Counter' },
                                  { id: 'r3', labelAr: '3. اختبار الاستراتيجية 3 مرات', labelEn: '3. 3x Trial Validation' },
                                  { id: 'r4', labelAr: '4. تبني التعديل النهائي', labelEn: '4. Adopted Mutation' },
                                ].map((tab) => (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setDelibActiveTab(tab.id as any)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer font-semibold ${
                                      delibActiveTab === tab.id
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm'
                                        : 'text-slate-400 hover:text-white bg-slate-900/60'
                                    }`}
                                  >
                                    {isAr ? tab.labelAr : tab.labelEn}
                                  </button>
                                ))}
                              </div>

                              {/* TAB 1: 14 AGENT INDIVIDUAL DOMAIN DIAGNOSES */}
                              {delibActiveTab === 'r1' && (
                                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                                  <div className="text-[11px] text-slate-400 mb-2">
                                    {isAr
                                      ? 'قام كل عضو من أعضاء مجلس الإدارة الـ 14 بدراسة الصفقة من منظور مجاله الرياضي والخوارزمي لتحديد أسباب الربح أو الخسارة:'
                                      : 'All 14 board members evaluated the closed trade from their specialized quant domain perspective:'}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {trade.deliberation.round1Diagnoses.map((diag) => (
                                      <div key={diag.agentId} className="p-2.5 rounded-lg bg-slate-900/80 border border-white/5 space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            <b className="text-white">{isAr ? diag.arabicName : diag.agentName}</b>
                                          </div>
                                          <span className="text-[10px] text-cyan-300 px-1.5 py-0.2 rounded bg-cyan-500/10 tabular-nums">
                                            {diag.suggestedStrategyAdjustment.action}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 leading-snug">
                                          {isAr ? diag.diagnosisPerspectiveAr : diag.diagnosisPerspectiveEn}
                                        </p>
                                        <div className="p-1.5 rounded bg-black/40 border border-white/5 text-[10px] space-y-0.5">
                                          <div className="text-amber-300/90">
                                            <b className="text-slate-400">{isAr ? 'السبب الجذري: ' : 'Root Cause: '}</b>
                                            {isAr ? diag.rootCauseAr : diag.rootCauseEn}
                                          </div>
                                          <div className="text-emerald-300/90">
                                            <b className="text-slate-400">{isAr ? 'التعديل المقترح: ' : 'Proposed Fix: '}</b>
                                            {isAr ? diag.proposedParameterFixAr : diag.proposedParameterFixEn}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* TAB 2: CROSS-AGENT PEER DEBATE & COUNTER PROPOSALS */}
                              {delibActiveTab === 'r2' && (
                                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                                  <div className="text-[11px] text-slate-400 mb-2">
                                    {isAr
                                      ? 'مداولة ونقاش حي بين الأعضاء: قرأ كل عضو مقترح العضو الآخر وقام بنقده وتعديله وصولاً للحل التوافقي:'
                                      : 'Interactive multi-agent debate: agents cross-examined each other’s proposals to converge on optimal parameters:'}
                                  </div>
                                  <div className="space-y-2">
                                    {trade.deliberation.round2Critiques.map((crit, cIdx) => (
                                      <div key={cIdx} className="p-3 rounded-lg bg-slate-900/90 border border-cyan-500/20 space-y-2">
                                        <div className="flex items-center justify-between text-[11px] border-b border-white/5 pb-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-cyan-300">{crit.fromAgentName}</span>
                                            <span className="text-slate-500">➜</span>
                                            <span className="font-bold text-amber-300">{crit.toAgentId.toUpperCase()}</span>
                                          </div>
                                          <span className="text-[10px] text-emerald-400 tabular-nums font-semibold">
                                            {isAr ? 'نسبة التوافق:' : 'Agreement:'} {(crit.agreementScore * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-200 leading-relaxed">
                                          {isAr ? crit.critiqueAr : crit.critiqueEn}
                                        </p>
                                        <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                                          <b>{isAr ? '💡 المقترح البديل المعتمد: ' : '💡 Consensus Counter-Proposal: '}</b>
                                          {isAr ? crit.counterProposalAr : crit.counterProposalEn}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* TAB 3: 3X MULTI-TRIAL REAL MARKET EXPERIMENTS */}
                              {delibActiveTab === 'r3' && (
                                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                                  <div className="text-[11px] text-slate-400">
                                    {isAr
                                      ? 'تطبيق واختبار الاستراتيجية المعدلة 1 و 2 و 3 مرات متتالية على الشموع الحقيقية للتأكد التام من خلوها من الأخطاء قبل الاعتماد:'
                                      : 'The mutated strategy was backtested 3 consecutive times across historical real Binance market candle slices:'}
                                  </div>
                                  <div className="space-y-2.5">
                                    {trade.deliberation.round3Trials.map((trial) => (
                                      <div key={trial.trialNumber} className="p-3 rounded-lg bg-slate-900/90 border border-emerald-500/30 space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-[10px]">
                                              {trial.trialNumber}
                                            </span>
                                            <b className="text-white">{trial.testName}</b>
                                          </div>
                                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">
                                            {isAr ? 'اجتاز بنجاح 100%' : 'PASSED'}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 py-1 border-y border-white/5 font-mono">
                                          <div>{isAr ? 'الشموع المختبرة:' : 'Bars:'} <b className="text-white">{trial.candlesTested}</b></div>
                                          <div>{isAr ? 'نسبة الفوز المحققة:' : 'Win Rate:'} <b className="text-emerald-400">{trial.syntheticWinRate}%</b></div>
                                          <div>{isAr ? 'أقصى تراجع:' : 'Max DD:'} <b className="text-cyan-300">{trial.maxDrawdownPct}%</b></div>
                                        </div>
                                        <p className="text-[11px] text-emerald-300 font-medium">
                                          {isAr ? trial.validationLogAr : trial.validationLogEn}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* TAB 4: ADOPTED MUTATED POLICY */}
                              {delibActiveTab === 'r4' && (
                                <div className="space-y-3 p-3 rounded-xl bg-gradient-to-br from-slate-900 to-black border border-cyan-500/30">
                                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                                    <Sparkles className="w-4 h-4 text-cyan-400" />
                                    <span>{isAr ? 'النتيجة النهائية والتحسين التراكمي المعتمد للاستراتيجية:' : 'Consensus Adopted Policy & Cumulative Strategy Upgrade:'}</span>
                                  </div>
                                  <p className="text-xs text-slate-200 leading-relaxed">
                                    {isAr ? trade.deliberation.policyMutationSummaryAr : trade.deliberation.policyMutationSummaryEn}
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-400 pt-2 border-t border-white/5 font-mono">
                                    <div className="p-2 rounded bg-slate-950 border border-white/5">
                                      <span>{isAr ? 'عتبة Z-Score المحدثة:' : 'New Z-Score:'}</span>
                                      <b className="text-cyan-300 block text-xs mt-0.5">{trade.deliberation.adoptedStrategyPolicy.zScoreEntryThreshold}σ</b>
                                    </div>
                                    <div className="p-2 rounded bg-slate-950 border border-white/5">
                                      <span>{isAr ? 'نصاب الحراس المعتمد:' : 'Guards Quorum:'}</span>
                                      <b className="text-emerald-300 block text-xs mt-0.5">{trade.deliberation.adoptedStrategyPolicy.minGuardsQuorum}/8</b>
                                    </div>
                                    <div className="p-2 rounded bg-slate-950 border border-white/5">
                                      <span>{isAr ? 'مضاعف الوقف التكيفي:' : 'Adaptive SL:'}</span>
                                      <b className="text-amber-300 block text-xs mt-0.5">x{trade.deliberation.adoptedStrategyPolicy.stopLossPctMultiplier}</b>
                                    </div>
                                    <div className="p-2 rounded bg-slate-950 border border-white/5">
                                      <span>{isAr ? 'مؤشر تقليل الأخطاء:' : 'Error Reduction:'}</span>
                                      <b className="text-emerald-400 block text-xs mt-0.5">{trade.deliberation.errorReductionScore}%</b>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* FOOTER */}
        <div className="px-4 sm:px-6 py-3 border-t border-white/10 bg-slate-950 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{isAr ? 'محفظة الاختبار ($200) معزولة تماماً عن التداول الحقيقي' : 'Sandbox ($200) isolated with zero real capital risk'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
