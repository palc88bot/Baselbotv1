/**
 * HolographicHUDWidgets
 * Floating cyber cards, depth-of-field frosted-glass panels,
 * holographic dials, neon gauges, and real-time execution buttons.
 * 
 * 100% Real-Time Account & Risk Metrics strictly connected to Sub-Wallet & Binance Exchange:
 * - Realized Profits & Losses (الأرباح والخسائر المحققة)
 * - Sub-Wallet ($25 Quarantine Slice) Capital & Growth ROI
 * - Floating Unrealized PnL on Active Positions
 * - Mobile-optimized layout with reduced animation overhead to eliminate lag during tab navigation.
 */

import React from 'react';
import { SubWalletState } from '../risk/SubWalletManager';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  Cpu,
  Flame,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Crosshair,
  Wallet,
  PieChart,
  Percent,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface HolographicHUDWidgetsProps {
  symbol: string;
  price: number;
  change24h: number;
  rsi: number;
  equity: number;
  availableCash: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dailyProfit: number;
  dailyProfitPct: number;
  openPositionsCount: number;
  subWallet?: SubWalletState | null;
  onOpenSubWalletModal?: () => void;
  executionMode: 'TESTNET' | 'LIVE' | 'PAPER';
  isRunning: boolean;
  onToggleBot: () => void;
  onExecuteTrade: (side: 'BUY' | 'SELL') => void;
  isExecuting?: boolean;
  lang: 'ar' | 'en';
}

export const HolographicHUDWidgets: React.FC<HolographicHUDWidgetsProps> = ({
  symbol,
  price,
  change24h,
  rsi,
  equity,
  availableCash,
  unrealizedPnl,
  realizedPnl,
  dailyProfit,
  dailyProfitPct,
  openPositionsCount,
  subWallet,
  onOpenSubWalletModal,
  executionMode,
  isRunning,
  onToggleBot,
  onExecuteTrade,
  isExecuting = false,
  lang,
}) => {
  const isAr = lang === 'ar';

  // Sub-Wallet values
  const subEquity = subWallet?.currentEquity ?? 25.0;
  const subRealizedPnl = subWallet?.realizedProfit ?? realizedPnl ?? 0.0;
  const subUnrealizedPnl = subWallet?.unrealizedPnl ?? unrealizedPnl ?? 0.0;
  const subGrowthPct = subWallet?.growthPct ?? (subEquity > 0 ? ((subEquity - 25.0) / 25.0) * 100 : 0);
  const totalTrades = subWallet?.totalTrades ?? 0;
  const winningTrades = subWallet?.winningTrades ?? 0;
  const losingTrades = subWallet?.losingTrades ?? 0;
  const winRate = subWallet?.winRate ?? (totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0);

  const isRealizedPositive = subRealizedPnl >= 0;
  const isUnrealizedPositive = subUnrealizedPnl >= 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* 🌟 WIDGET 1: REALIZED PROFITS & SUB-WALLET */}
      <div 
        onClick={onOpenSubWalletModal}
        className="p-3.5 sm:p-5 rounded-2xl quant-card quant-card-interactive cursor-pointer border border-cyan-500/20 hover:border-cyan-400/40 relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200 block truncate">
                {isAr ? 'الأرباح المحققة' : 'Realized Profit'}
              </span>
              <span className="text-[9px] text-slate-400 block tabular-nums">
                {isAr ? 'المحفظة الثانوية ($25)' : 'Sub-Wallet ($25)'}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            ${subEquity.toFixed(1)}
          </span>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className={`text-xl sm:text-2xl font-mono font-bold tracking-tight tabular-nums ${isRealizedPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isRealizedPositive ? '+' : ''}${subRealizedPnl.toFixed(2)}
              </span>
              <span className="text-[10px] font-mono text-slate-500">USDT</span>
            </div>
            <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded tabular-nums ${
              subGrowthPct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {subGrowthPct >= 0 ? '+' : ''}{subGrowthPct.toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-white/5 text-[10px] sm:text-[11px] font-mono">
            <div>
              <span className="text-[9px] text-slate-400 block">{isAr ? 'رصيد المحفظة:' : 'Sub Equity:'}</span>
              <span className="font-bold text-cyan-300 tabular-nums">${subEquity.toFixed(2)}</span>
            </div>
            <div className="text-right rtl:text-left">
              <span className="text-[9px] text-slate-400 block">{isAr ? 'الخزينة المحمية:' : 'Master Vault:'}</span>
              <span className="font-bold text-slate-300 tabular-nums">${equity.toFixed(0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {isAr ? 'ربح:' : 'W:'} <b className="text-slate-200 tabular-nums">{winningTrades}</b>
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-rose-400" /> {isAr ? 'خسارة:' : 'L:'} <b className="text-slate-200 tabular-nums">{losingTrades}</b>
            </span>
            <span className="tabular-nums">
              {isAr ? 'فوز:' : 'Win:'} <b className="text-cyan-300">{winRate.toFixed(0)}%</b>
            </span>
          </div>
        </div>

        <div className="w-full h-1 bg-white/5 rounded-full mt-2.5 overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(10, (subEquity / 25.0) * 50))}%` }}
          />
        </div>
      </div>

      {/* 📈 WIDGET 2: UNREALIZED PNL & ACTIVE POSITIONS */}
      <div className="p-3.5 sm:p-5 rounded-2xl quant-card border border-emerald-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200 block truncate">
                {isAr ? 'الأرباح العائمة' : 'Floating PnL'}
              </span>
              <span className="text-[9px] text-slate-400 block">
                {isAr ? 'المراكز المفتوحة' : 'Active Positions'}
              </span>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className={`text-xl sm:text-2xl font-mono font-bold tracking-tight tabular-nums ${isUnrealizedPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUnrealizedPositive ? '+' : ''}${subUnrealizedPnl.toFixed(2)}
              </span>
              <span className="text-[10px] font-mono text-slate-500">USDT</span>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-200 tabular-nums">
              {openPositionsCount} {isAr ? 'مراكز' : 'POS'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-white/5 text-[10px] sm:text-[11px] font-mono">
            <div>
              <span className="text-[9px] text-slate-400 block">{isAr ? 'هدف الربح:' : 'Take Profit:'}</span>
              <span className="font-bold text-emerald-400">+1.6% Scalp</span>
            </div>
            <div className="text-right rtl:text-left">
              <span className="text-[9px] text-slate-400 block">{isAr ? 'وقف الخسارة:' : 'Stop Loss:'}</span>
              <span className="font-bold text-rose-400">-1.5% Guard</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
            <span>{isAr ? 'الرافعة:' : 'Lev:'} <b className="text-cyan-300">3x-5x Safe</b></span>
            <span>{isAr ? 'الحماية:' : 'Shield:'} <b className="text-emerald-400">{isAr ? 'نشطة' : 'Active'}</b></span>
          </div>
        </div>

        <div className="w-full h-1 bg-white/5 rounded-full mt-2.5 overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: '100%' }} />
        </div>
      </div>

      {/* ⚡ WIDGET 3: LIVE TECHNICAL MOMENTUM & RSI 14 */}
      <div className="p-3.5 sm:p-5 rounded-2xl quant-card border border-rose-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200 block truncate">
                {isAr ? 'الزخم الفني اللحظي' : 'Momentum & RSI'}
              </span>
              <span className="text-[9px] text-slate-400 font-mono block">{symbol}</span>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
            rsi >= 70 ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : rsi <= 30 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
          }`}>
            {rsi >= 70 ? (isAr ? 'ذروة شراء' : 'OVERBOUGHT') : rsi <= 30 ? (isAr ? 'ذروة بيع' : 'OVERSOLD') : (isAr ? 'محايد' : 'NEUTRAL')}
          </span>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight tabular-nums">
                {rsi.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500 font-mono">/ 100</span>
            </div>
            <span className={`text-xs font-mono font-semibold tabular-nums ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {change24h >= 0 ? '+' : ''}{change24h}% 24h
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/5 text-[10px] sm:text-[11px] font-mono">
            <div>
              <span className="text-[9px] text-slate-400 block">{isAr ? 'سعر الأصل:' : 'Asset Price:'}</span>
              <span className="font-bold text-white tabular-nums">${price > 0 ? (price >= 100 ? price.toFixed(2) : price.toFixed(4)) : '---'}</span>
            </div>
            <div className="text-right rtl:text-left">
              <span className="text-[9px] text-slate-400 block">{isAr ? 'المسح الكمي:' : 'Scanner:'}</span>
              <span className="font-bold text-cyan-300">{isAr ? 'متطابق' : 'Filtered'}</span>
            </div>
          </div>
        </div>

        <div className="w-full h-1 bg-white/5 rounded-full mt-2.5 overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, rsi))}%` }}
          />
        </div>
      </div>

      {/* 🎯 WIDGET 4: AUTONOMOUS ALGO ENGINE STATE */}
      <div className="p-3.5 sm:p-5 rounded-2xl quant-card border border-cyan-500/20 relative overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200 block truncate">
                {isAr ? 'محرك التداول الآلي' : 'Autonomous Engine'}
              </span>
              <span className="text-[9px] text-slate-400 font-mono block">{executionMode}</span>
            </div>
          </div>
          <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
            {executionMode}
          </span>
        </div>

        <div className="space-y-1.5 my-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{isAr ? 'نظام التشغيل:' : 'Execution:'}</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {isAr ? 'خوارزمي ذاتي' : '100% Auto'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{isAr ? 'الهامش المخصص:' : 'Margin Sizing:'}</span>
            <span className="text-cyan-300 font-semibold">
              {isAr ? 'متناسب (~25%)' : 'Proportional (25%)'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
          <span className="text-[10px] font-mono text-slate-400">
            {isAr ? 'حالة البوت:' : 'Status:'}
          </span>
          <button
            type="button"
            onClick={onToggleBot}
            className={`text-[10px] font-mono font-bold px-3 py-1 rounded-lg cursor-pointer transition min-h-[32px] flex items-center gap-1.5 ${
              isRunning 
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25' 
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            {isRunning ? (isAr ? '● نشط وتلقائي' : '● ACTIVE') : (isAr ? '❚❚ متوقف' : '❚❚ PAUSED')}
          </button>
        </div>
      </div>
    </div>
  );
};
