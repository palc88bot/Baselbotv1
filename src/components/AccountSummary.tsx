/**
 * Basel AlgoCore Trading System
 * Master Vault & Autonomous Neural Risk Header
 * Prominent High-Impact Tri-Core: Portfolio | Profit Margin | Loss Margin & Risk Buffer
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  DollarSign,
  PieChart,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Gauge,
  Lock,
  Radio,
} from 'lucide-react';
import { AccountBalance, RiskMetrics, RiskLimits, SystemHealth } from '../domain/types';

interface AccountSummaryProps {
  balance: AccountBalance;
  riskMetrics?: RiskMetrics;
  riskLimits?: RiskLimits;
  health?: SystemHealth;
  regime?: any;
  riskDecision?: any;
  isRunning?: boolean;
  onToggleRun?: () => void;
  lang: 'ar' | 'en';
  reduceMotion?: boolean;
}

export const AccountSummary: React.FC<AccountSummaryProps> = React.memo(({
  balance,
  riskMetrics,
  riskLimits,
  health,
  regime,
  riskDecision,
  isRunning = true,
  onToggleRun,
  lang,
  reduceMotion = false,
}) => {
  const isAr = lang === 'ar';

  const totalEquity = balance?.totalEquity || 0;
  const availableCash = balance?.availableCash || 0;
  const unrealizedPnl = balance?.unrealizedPnl || 0;
  const realizedPnl = balance?.realizedPnl || 0;
  const dailyPnl = balance?.dailyPnl || 0;
  const dailyPnlPct = balance?.dailyPnlPct || (totalEquity > 0 ? (dailyPnl / totalEquity) * 100 : 0);
  const usedMargin = balance?.usedMargin || 0;
  const marginLevel = balance?.marginLevel || (usedMargin > 0 ? totalEquity / usedMargin : 99.9);
  
  const currentDrawdown = riskMetrics?.currentDrawdownPct ?? 0.45;
  const maxDrawdownLimit = riskLimits?.maxDrawdownPct ?? 5.0;
  const drawdownRatio = Math.min(100, (currentDrawdown / Math.max(0.1, maxDrawdownLimit)) * 100);

  const isProfit = unrealizedPnl >= 0;
  const isDailyProfit = dailyPnl >= 0;

  const latency = health?.pipelineLatency?.totalPipelineMs || 1.8;
  const throughput = health?.messagesPerSecond || 45;

  return (
    <section 
      dir={isAr ? 'rtl' : 'ltr'}
      className="mb-8 relative w-full"
      aria-label={isAr ? 'ملخص المحفظة وهوامش الربح والخسارة' : 'Portfolio & Risk Telemetry'}
    >
      {/* Dynamic Ambient Glow Behind Top Bar */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/10 via-emerald-500/10 to-indigo-500/10 rounded-[2.5rem] blur-xl opacity-60 pointer-events-none" />

      <div className="relative bg-[#070b16]/95 border border-white/10 backdrop-blur-2xl rounded-[2.2rem] p-4 sm:p-6 lg:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        
        {/* Upper Autonomous Status Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-rose-500'} ${reduceMotion ? '' : 'animate-ping opacity-75'}`} />
              <div className={`absolute w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider uppercase">
              <span className="text-slate-400">{isAr ? 'المعالج الكمي المستقل:' : 'AUTONOMOUS_BRAIN:'}</span>
              <span className={isRunning ? 'text-emerald-400' : 'text-rose-400'}>
                {isRunning ? (isAr ? 'يعمل بالكامل' : 'ONLINE_ACTIVE') : (isAr ? 'متوقف مؤقتاً' : 'PAUSED')}
              </span>
            </div>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>{latency.toFixed(1)}ms</span>
              <span className="text-slate-600">•</span>
              <span>{throughput} {isAr ? 'رسالة/ث' : 'msg/s'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Regime Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-[10px] font-mono">
              <span className="text-slate-500">{isAr ? 'النمط:' : 'REGIME:'}</span>
              <span className="text-cyan-400 font-bold uppercase">{regime?.marketRegime || 'MEAN_REVERTING'}</span>
            </div>

            {/* Risk Action Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 text-[10px] font-mono">
              <span className="text-slate-500">{isAr ? 'إجراء المخاطر:' : 'RISK_ACT:'}</span>
              <span className="text-purple-400 font-bold uppercase">{riskDecision?.action || 'NORMAL'}</span>
            </div>
          </div>
        </div>

        {/* The 3 Core Prominent Hubs: Portfolio | Profit Margin | Loss Margin */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          
          {/* ============================================================ */}
          {/* 1. المحفظة وإجمالي الرصيد (PORTFOLIO CORE & LIQUIDITY) */}
          {/* ============================================================ */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c1326] to-[#080d1c] border border-cyan-500/20 p-5 lg:p-6 shadow-xl transition-all duration-300 hover:border-cyan-500/40 group">
            {/* Ambient Corner Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-cyan-500/20 transition-all" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.15em]">
                    {isAr ? 'المحفظة وإجمالي الرصيد' : 'PORTFOLIO_EQUITY'}
                  </h3>
                  <span className="text-[9px] font-mono text-cyan-400/80 uppercase tracking-widest">
                    {balance?.currency || 'USDT'} {isAr ? 'حساب فيوتشرز' : 'FUTURES_CORE'}
                  </span>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 font-bold">
                100% {isAr ? 'سيولة' : 'LIQ'}
              </div>
            </div>

            {/* Total Balance Amount */}
            <div className="my-3">
              <div className="text-[26px] sm:text-[30px] lg:text-[34px] font-black font-mono tracking-tight text-white flex items-baseline gap-2">
                <span className="text-cyan-400 text-xl font-sans">$</span>
                <span>{totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Sub-metrics: Available Cash & Free Margin */}
            <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-white/5 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'النقد المتاح' : 'AVAIL_CASH'}</span>
                <span className="text-slate-200 font-bold text-sm">
                  ${availableCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className={isAr ? 'text-left' : 'text-right'}>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'الهامش الحر' : 'FREE_MARGIN'}</span>
                <span className="text-cyan-300 font-bold text-sm">
                  ${(balance?.freeMargin || availableCash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 2. هامش الربح والأرباح الحية (PROFIT MARGIN & LIVE PNL) */}
          {/* ============================================================ */}
          <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c1926] to-[#08121c] border p-5 lg:p-6 shadow-xl transition-all duration-300 group ${
            isProfit ? 'border-emerald-500/30 hover:border-emerald-500/50' : 'border-rose-500/30 hover:border-rose-500/50'
          }`}>
            {/* Ambient Corner Accent */}
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-all ${
              isProfit ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20' : 'bg-rose-500/10 group-hover:bg-rose-500/20'
            }`} />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-2xl border ${
                  isProfit 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
                }`}>
                  {isProfit ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.15em]">
                    {isAr ? 'هامش الربح والأداء اللحظي' : 'PROFIT_MARGIN_PNL'}
                  </h3>
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                    {isAr ? 'الصفقات المفتوحة والمحققة' : 'REALIZED & FLOATING'}
                  </span>
                </div>
              </div>

              <div className={`px-2.5 py-1 rounded-xl border text-[10px] font-mono font-bold flex items-center gap-1 ${
                isDailyProfit 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                {isDailyProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isDailyProfit ? '+' : ''}{dailyPnlPct.toFixed(2)}% {isAr ? 'اليوم' : '24H'}
              </div>
            </div>

            {/* Unrealized Floating PnL */}
            <div className="my-3">
              <div className={`text-[26px] sm:text-[30px] lg:text-[34px] font-black font-mono tracking-tight flex items-baseline gap-1.5 ${
                isProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                <span>{isProfit ? '+' : ''}${unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-xs font-sans font-bold text-slate-400">
                  ({totalEquity > 0 ? ((unrealizedPnl / totalEquity) * 100).toFixed(2) : '0.00'}%)
                </span>
              </div>
            </div>

            {/* Sub-metrics: Realized PnL & Daily Profit */}
            <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-white/5 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'الربح المحقق' : 'REALIZED_PNL'}</span>
                <span className={`font-bold text-sm ${realizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className={isAr ? 'text-left' : 'text-right'}>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'أرباح 24 ساعة' : 'DAILY_GAIN'}</span>
                <span className={`font-bold text-sm ${dailyPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 3. هامش الخسارة وحدود المخاطر (LOSS MARGIN & RISK THRESHOLDS) */}
          {/* ============================================================ */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b0d1e] to-[#0f0917] border border-purple-500/20 p-5 lg:p-6 shadow-xl transition-all duration-300 hover:border-purple-500/40 group">
            {/* Ambient Corner Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-purple-500/20 transition-all" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.15em]">
                    {isAr ? 'هامش الخسارة وحماية المخاطر' : 'LOSS_MARGIN_RISK'}
                  </h3>
                  <span className="text-[9px] font-mono text-purple-300/80 uppercase tracking-widest">
                    {isAr ? 'الحد الأقصى للتراجع والهامش' : 'MAX_DRAWDOWN_BUFFER'}
                  </span>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-500/30 text-[10px] font-mono text-purple-300 font-bold">
                {marginLevel > 20 ? '>20x' : `${marginLevel.toFixed(1)}x`} {isAr ? 'أمان' : 'SAFE'}
              </div>
            </div>

            {/* Current Drawdown & Headroom Meter */}
            <div className="my-3">
              <div className="flex items-baseline justify-between">
                <div className="text-[26px] sm:text-[30px] lg:text-[34px] font-black font-mono tracking-tight text-purple-300">
                  {currentDrawdown.toFixed(2)}%
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {isAr ? 'الحد الأقصى:' : 'LIMIT:'} <span className="text-rose-400 font-bold">{maxDrawdownLimit.toFixed(1)}%</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950/80 h-2 rounded-full mt-2 overflow-hidden border border-white/10 relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${drawdownRatio}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    drawdownRatio > 70 
                      ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]' 
                      : drawdownRatio > 40 
                      ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' 
                      : 'bg-gradient-to-r from-purple-500 to-indigo-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                  }`}
                />
              </div>
            </div>

            {/* Sub-metrics: Used Margin & Loss Headroom */}
            <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-white/5 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'الهامش المستخدم' : 'USED_MARGIN'}</span>
                <span className="text-slate-200 font-bold text-sm">
                  ${usedMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className={isAr ? 'text-left' : 'text-right'}>
                <span className="text-[10px] text-slate-500 block uppercase">{isAr ? 'مساحة الأمان' : 'RISK_HEADROOM'}</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {(maxDrawdownLimit - currentDrawdown).toFixed(2)}% {isAr ? 'متاح' : 'AVAIL'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
});
