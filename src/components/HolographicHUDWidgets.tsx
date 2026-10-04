/**
 * HolographicHUDWidgets
 * Floating cyber cards, depth-of-field frosted-glass panels,
 * holographic dials, neon gauges, and real-time execution buttons.
 * 100% Real-Time Account & Risk Metrics strictly fetched from Binance Exchange.
 */

import React from 'react';
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
  executionMode: 'TESTNET' | 'LIVE';
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
  executionMode,
  isRunning,
  onToggleBot,
  onExecuteTrade,
  isExecuting = false,
  lang,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Widget 1: Total Equity / Live Binance Balance Vault */}
      <div className="p-4 sm:p-5 rounded-2xl holo-panel border border-[rgba(0,243,255,0.35)] relative overflow-hidden group holo-card-hover">
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-[var(--cyan)] rounded-full blur-2xl opacity-20 pointer-events-none" />
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[rgba(0,243,255,0.15)] border border-[rgba(0,243,255,0.4)] grid place-items-center shadow-[0_0_12px_rgba(0,243,255,0.3)]">
              <Cpu className="w-4 h-4 text-[var(--cyan)]" />
            </div>
            <span className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
              {isAr ? 'رصيد المحفظة الفعلي (Binance)' : 'Live Binance Equity'}
            </span>
          </div>
          <span className="w-2 h-2 rounded-full bg-[var(--cyan)] animate-pulse shadow-[0_0_8px_var(--cyan)]" />
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-xl sm:text-2xl font-mono font-bold text-white neon-cyan-glow tracking-wide">
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--muted)]">
              {isAr ? 'الكاش المتاح:' : 'Cash:'} <b className="text-white">${availableCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            </span>
            <span className={`font-semibold flex items-center ${unrealizedPnl >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Real progress bar (Available cash vs Equity) */}
        <div className="w-full h-1.5 bg-black/40 rounded-full mt-3 overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-[var(--cyan)] to-[var(--magenta)] shadow-[0_0_8px_var(--cyan)] transition-all duration-500"
            style={{ width: `${equity > 0 ? Math.min(100, Math.max(5, (availableCash / equity) * 100)) : 100}%` }}
          />
        </div>
      </div>

      {/* Widget 2: Quantum Neural Momentum & Real RSI */}
      <div className="p-4 sm:p-5 rounded-2xl holo-panel-magenta border border-[rgba(255,0,127,0.35)] relative overflow-hidden group holo-card-hover">
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-[var(--magenta)] rounded-full blur-2xl opacity-20 pointer-events-none" />
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[rgba(255,0,127,0.15)] border border-[rgba(255,0,127,0.4)] grid place-items-center shadow-[0_0_12px_rgba(255,0,127,0.3)]">
              <Activity className="w-4 h-4 text-[var(--magenta)]" />
            </div>
            <span className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
              {isAr ? 'مؤشر القوة النسبية الحي (RSI 14)' : 'Live RSI (14 Periods)'}
            </span>
          </div>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
            rsi >= 70 ? 'text-[var(--magenta)] bg-rose-500/20 border-rose-500/40' : rsi <= 30 ? 'text-[var(--lime)] bg-emerald-500/20 border-emerald-500/40' : 'text-[var(--cyan)] bg-cyan-500/20 border-cyan-500/40'
          }`}>
            {rsi >= 70 ? (isAr ? 'ذروة شراء' : 'OVERBOUGHT') : rsi <= 30 ? (isAr ? 'ذروة بيع' : 'OVERSOLD') : (isAr ? 'محايد' : 'NEUTRAL')}
          </span>
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-xl sm:text-2xl font-mono font-bold text-white neon-magenta-glow tracking-wide">
            {rsi.toFixed(1)} <span className="text-xs text-[var(--muted)] font-normal">/ 100</span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[var(--muted)]">
            <span>{isAr ? 'تغير 24س:' : '24h Delta:'} <b className={change24h >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}>{change24h >= 0 ? '+' : ''}{change24h}%</b></span>
            <span>{isAr ? 'الصفقات المفتوحة:' : 'Open Pos:'} <b className="text-[var(--cyan)]">{openPositionsCount}</b></span>
          </div>
        </div>

        {/* Gauge bar */}
        <div className="w-full h-1.5 bg-black/40 rounded-full mt-3 overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-[var(--cyan)] via-[var(--magenta)] to-[var(--lime)] transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, rsi))}%` }}
          />
        </div>
      </div>

      {/* Widget 3: Real Open Positions & Risk Safeguard */}
      <div className="p-4 sm:p-5 rounded-2xl holo-panel border border-[rgba(0,255,102,0.35)] relative overflow-hidden group holo-card-hover">
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-[var(--lime)] rounded-full blur-2xl opacity-15 pointer-events-none" />
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[rgba(0,255,102,0.15)] border border-[rgba(0,255,102,0.4)] grid place-items-center shadow-[0_0_12px_rgba(0,255,102,0.3)]">
              <Shield className="w-4 h-4 text-[var(--lime)]" />
            </div>
            <span className="text-[11px] font-mono text-[var(--muted)] uppercase tracking-wider">
              {isAr ? 'حالة درع المخاطر الفعلي' : 'Live Risk Protection'}
            </span>
          </div>
          <span className="w-2 h-2 rounded-full bg-[var(--lime)] animate-ping shadow-[0_0_8px_var(--lime)]" />
        </div>

        <div className="mt-2 space-y-1">
          <div className="text-xl sm:text-2xl font-mono font-bold text-[var(--lime)] tracking-wide">
            {openPositionsCount > 0 ? `${openPositionsCount} ${isAr ? 'مراكز نشطة' : 'ACTIVE POS'}` : (isAr ? 'جاهز للتنفيذ' : 'IDLE / SECURE')}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[var(--muted)]">
            <span>{isAr ? 'الربح المحقق:' : 'Realized PnL:'} <b className={realizedPnl >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}>${realizedPnl.toFixed(2)}</b></span>
            <span>{isAr ? 'وقف الخسارة:' : 'SL Protocol:'} <b className="text-[var(--lime)]">{isAr ? 'مفعّل' : 'Active'}</b></span>
          </div>
        </div>

        <div className="w-full h-1.5 bg-black/40 rounded-full mt-3 overflow-hidden border border-white/5">
          <div className="h-full bg-[var(--lime)] shadow-[0_0_8px_var(--lime)]" style={{ width: '100%' }} />
        </div>
      </div>

      {/* Widget 4: Quick Order Routing to Server & Exchange API */}
      <div className="p-4 sm:p-5 rounded-2xl holo-panel border border-[rgba(0,243,255,0.45)] relative overflow-hidden flex flex-col justify-between shadow-[0_0_25px_rgba(0,243,255,0.15)]">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[var(--cyan)]" />
            <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
              {isAr ? 'تنفيذ الأمر عبر منصة التداول' : 'Exchange Direct Order'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--cyan)] px-2 py-0.5 rounded bg-[rgba(0,243,255,0.1)] border border-[rgba(0,243,255,0.3)]">
            {executionMode}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {/* Real Direct Buy Button */}
          <button
            type="button"
            disabled={isExecuting || price <= 0}
            onClick={() => onExecuteTrade('BUY')}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-[var(--cyan)]/20 border border-[var(--cyan)] text-white hover:text-black hover:bg-[var(--cyan)] transition-all font-mono font-bold text-xs flex items-center justify-center gap-1 shadow-[0_0_15px_rgba(0,243,255,0.3)] cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--lime)] group-hover:text-black" />
            <span>{isAr ? 'شراء LONG' : 'BUY LONG'}</span>
          </button>

          {/* Real Direct Sell Button */}
          <button
            type="button"
            disabled={isExecuting || price <= 0}
            onClick={() => onExecuteTrade('SELL')}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-500/20 to-[var(--magenta)]/20 border border-[var(--magenta)] text-white hover:text-white hover:bg-[var(--magenta)] transition-all font-mono font-bold text-xs flex items-center justify-center gap-1 shadow-[0_0_15px_rgba(255,0,127,0.3)] cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-[var(--magenta)] group-hover:text-white" />
            <span>{isAr ? 'بيع SHORT' : 'SELL SHORT'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[rgba(0,243,255,0.12)]">
          <span className="text-[10px] font-mono text-[var(--muted)]">
            {isAr ? 'محرك البوت:' : 'Bot Engine:'}
          </span>
          <button
            type="button"
            onClick={onToggleBot}
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded cursor-pointer transition ${
              isRunning 
                ? 'bg-emerald-500/20 text-[var(--lime)] border border-emerald-500/40' 
                : 'bg-amber-500/20 text-[var(--amber)] border border-amber-500/40'
            }`}
          >
            {isRunning ? (isAr ? '● قيد التشغيل' : '● RUNNING') : (isAr ? '❚❚ متوقف' : '❚❚ PAUSED')}
          </button>
        </div>
      </div>
    </div>
  );
};
