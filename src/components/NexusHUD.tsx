/**
 * Basel AlgoCore Nexus HUD
 * Floating High-Frequency Command Deck with Tri-Core Vault Metrics (Wallet Tier & Adjacent PnL)
 */

import React, { useState } from 'react';
import {
  AlertOctagon,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Wallet,
  Award,
} from 'lucide-react';
import { AccountBalance } from '../domain/types';
import { WalletDetailsModal, getAccountTier } from './WalletDetailsModal';
import { PnlDetailsModal } from './PnlDetailsModal';

interface NexusHUDProps {
  balance: AccountBalance;
  currentTheme: string;
  onCycleTheme: () => void;
  reduceMotion: boolean;
  onToggleMotion: () => void;
  lang: 'ar' | 'en';
  onSetLang: (lang: 'ar' | 'en') => void;
  isRunning: boolean;
  onToggleRun: () => void;
  killSwitchActive: boolean;
  onEmergencyKill: () => void;
  onResetKill: () => void;
  drawdownPct?: number;
}

export const NexusHUD: React.FC<NexusHUDProps> = React.memo(({
  balance,
  currentTheme,
  onCycleTheme,
  reduceMotion,
  onToggleMotion,
  lang,
  onSetLang,
  isRunning,
  onToggleRun,
  killSwitchActive,
  onEmergencyKill,
  onResetKill,
  drawdownPct = 0.88,
}) => {
  const isAr = lang === 'ar';
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [showPnlModal, setShowPnlModal] = useState<boolean>(false);

  const walletVal = balance?.totalEquity || 114820.45;
  const pnlPct = balance?.dailyPnlPct || 14.82;
  const dailyPnl = balance?.dailyPnl || 1702.40;
  const isPnlPositive = dailyPnl >= 0;

  const tierInfo = getAccountTier(walletVal, isAr);

  const profitMarginWidth = Math.min(100, Math.max(10, pnlPct * 4));
  const walletBarWidth = Math.min(100, Math.max(15, (walletVal % 10000) / 100));
  const lossBarWidth = Math.min(100, Math.max(5, drawdownPct * 12));

  return (
    <>
      <header 
        className="sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3 bg-[#04060c]/90 backdrop-blur-xl border-b border-[var(--stroke)] shadow-2xl"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="max-w-[1720px] mx-auto grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 md:gap-6 items-center">
          
          {/* 1. Brand Logo with Kinetic Orbit (BASEL ALGOCORE_) */}
          <div className="flex items-center justify-between md:justify-start gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[var(--stroke-2)] border-t-[var(--cyan)] animate-spin [animation-duration:3s]" />
                <div className="absolute inset-1 rounded-full border border-[var(--stroke-2)] border-r-[var(--lime)] animate-spin [animation-duration:2s] [animation-direction:reverse]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]" />
              </div>

              <div className="flex flex-col">
                <div className="font-mono font-black text-sm sm:text-base tracking-[0.16em] text-[var(--text)] flex items-center">
                  <span>{isAr ? 'بازل ألغوكور' : 'BASEL ALGOCORE'}</span>
                  <span className="text-[var(--cyan)] ml-0.5 animate-pulse">_</span>
                </div>
                <div className="text-[8px] sm:text-[9px] font-mono text-[var(--text-3)] tracking-[0.2em] uppercase">
                  {isAr ? 'عقل التداول الذاتي' : 'AUTONOMOUS TRADING MIND'}
                </div>
              </div>
            </div>

            {/* Quick Mobile Bot Toggle */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={onToggleRun}
                className={`p-2 rounded-xl text-xs font-mono font-bold transition-all ${
                  isRunning ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-600 text-white'
                }`}
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 2. Top Tri-Core Vault Metrics: 
                 Card 1: Wallet Balance + Account Tier Badge (Clickable)
                 Card 2: Profit & Loss (PnL) (Clickable - Adjacent to Wallet)
                 Card 3: Loss Margin / Risk Cushion
          */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-[800px] mx-auto w-full">
            
            {/* Vault Card 1: Wallet Balance & Account Tier */}
            <button
              type="button"
              onClick={() => setShowWalletModal(true)}
              className="relative p-2 sm:p-2.5 border border-[var(--stroke)] hover:border-[var(--cyan)] rounded-xl bg-gradient-to-br from-[rgba(12,18,30,0.7)] to-[rgba(6,10,18,0.55)] hover:bg-[rgba(var(--accent-rgb),0.04)] overflow-hidden transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="text-[7.5px] sm:text-[9px] font-mono tracking-wider text-[var(--text-3)] uppercase flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[var(--cyan)] shadow-[0_0_6px_var(--cyan)]" />
                  <span>{isAr ? 'المحفظة' : 'WALLET'}</span>
                </div>
                
                {/* Account Tier Badge */}
                <span 
                  className="px-1.5 py-0.5 rounded text-[7.5px] sm:text-[8.5px] font-mono font-bold uppercase truncate max-w-[85px] sm:max-w-[110px]"
                  style={{ backgroundColor: tierInfo.bg, color: tierInfo.color, border: `1px solid ${tierInfo.border}` }}
                >
                  {isAr ? tierInfo.nameAr : tierInfo.nameEn}
                </span>
              </div>

              <div className="font-mono font-bold text-xs sm:text-base text-[var(--text)] leading-tight flex items-baseline gap-0.5">
                <span className="text-[0.85em] text-[var(--cyan)]">$</span>
                <span>{walletVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="text-[7.5px] sm:text-[8.5px] font-mono text-[var(--text-3)] mt-0.5 flex items-center justify-between">
                <span>+0.42% · 24H</span>
                <span className="text-[var(--cyan)] opacity-0 group-hover:opacity-100 transition-opacity text-[8px]">
                  {isAr ? 'عرض ↗' : 'View ↗'}
                </span>
              </div>

              <div className="h-[2px] sm:h-[3px] mt-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)] transition-all duration-700" 
                  style={{ width: `${walletBarWidth}%` }} 
                />
              </div>
            </button>

            {/* Vault Card 2: Profit & Loss (PnL) - Directly Adjacent to Wallet */}
            <button
              type="button"
              onClick={() => setShowPnlModal(true)}
              className="relative p-2 sm:p-2.5 border border-[var(--stroke)] hover:border-[var(--lime)] rounded-xl bg-gradient-to-br from-[rgba(12,18,30,0.7)] to-[rgba(6,10,18,0.55)] hover:bg-[rgba(var(--accent-2-rgb),0.04)] overflow-hidden transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="text-[7.5px] sm:text-[9px] font-mono tracking-wider text-[var(--text-3)] uppercase flex items-center gap-1.5">
                  <span className={`w-1 h-1 rounded-full ${isPnlPositive ? 'bg-[var(--lime)] shadow-[0_0_6px_var(--lime)]' : 'bg-[var(--magenta)] shadow-[0_0_6px_var(--magenta)]'}`} />
                  <span>{isAr ? 'الأرباح والخسائر' : 'PNL'}</span>
                </div>

                <span className="text-[7.5px] sm:text-[8.5px] font-mono text-[var(--text-3)]">
                  {isAr ? '30 يوم' : '30D'}
                </span>
              </div>

              <div className={`font-mono font-bold text-xs sm:text-base leading-tight flex items-baseline gap-0.5 ${isPnlPositive ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}`}>
                <span className="text-[0.85em]">{isPnlPositive ? '▲ +' : '▼ -'}</span>
                <span>${Math.abs(dailyPnl).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="text-[0.8em] font-normal text-[var(--text-2)] ml-0.5">({pnlPct.toFixed(1)}%)</span>
              </div>

              <div className="text-[7.5px] sm:text-[8.5px] font-mono text-[var(--text-3)] mt-0.5 flex items-center justify-between">
                <span>{isAr ? 'مُحقَّق 73.6% نجاح' : 'Realized · 73.6% WR'}</span>
                <span className="text-[var(--lime)] opacity-0 group-hover:opacity-100 transition-opacity text-[8px]">
                  {isAr ? 'تفاصيل ↗' : 'Details ↗'}
                </span>
              </div>

              <div className="h-[2px] sm:h-[3px] mt-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full shadow-[0_0_8px_currentColor] transition-all duration-700 ${isPnlPositive ? 'bg-[var(--lime)] text-[var(--lime)]' : 'bg-[var(--magenta)] text-[var(--magenta)]'}`}
                  style={{ width: `${profitMarginWidth}%` }} 
                />
              </div>
            </button>

            {/* Vault Card 3: Loss Margin / Drawdown */}
            <div className="relative p-2 sm:p-2.5 border border-[var(--stroke)] rounded-xl bg-gradient-to-br from-[rgba(12,18,30,0.7)] to-[rgba(6,10,18,0.55)] overflow-hidden">
              <div className="text-[7.5px] sm:text-[9px] font-mono tracking-wider text-[var(--text-3)] uppercase flex items-center gap-1.5 mb-1">
                <span className="w-1 h-1 rounded-full bg-[var(--magenta)] shadow-[0_0_6px_var(--magenta)]" />
                <span>{isAr ? 'هامش الخسارة' : 'LOSS MARGIN'}</span>
              </div>
              
              <div className="font-mono font-bold text-xs sm:text-base text-[var(--magenta)] leading-tight flex items-baseline gap-0.5">
                <span className="text-[0.85em]">▼</span>
                <span>{drawdownPct.toFixed(2)}</span>
                <span className="text-[0.85em]">%</span>
              </div>

              <div className="text-[7.5px] sm:text-[9px] font-mono text-[var(--text-3)] mt-0.5">
                {isAr ? 'انخفاض · 30 يوم' : 'Drawdown · 30D'}
              </div>

              <div className="h-[2px] sm:h-[3px] mt-1.5 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--magenta)] shadow-[0_0_8px_var(--magenta)] transition-all duration-700" 
                  style={{ width: `${lossBarWidth}%` }} 
                />
              </div>
            </div>

          </div>

          {/* 3. Controls (Theme, Motion, Lang, Master Bot & Halt) */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3">
            
            {/* Control Capsule */}
            <div className="flex items-center gap-1 p-1 rounded-full border border-[var(--stroke)] bg-[var(--panel-bg)]">
              
              {/* Theme Cycle Button */}
              <button
                type="button"
                onClick={onCycleTheme}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-2)] hover:text-[var(--cyan)] hover:bg-[rgba(var(--accent-rgb),0.1)] transition-all cursor-pointer"
                title={`Theme: ${currentTheme.toUpperCase()} (T)`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="12" r="5" />
                  <circle cx="15" cy="12" r="5" />
                </svg>
              </button>

              {/* Motion Toggle Button */}
              <button
                type="button"
                onClick={onToggleMotion}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-2)] hover:text-[var(--cyan)] hover:bg-[rgba(var(--accent-rgb),0.1)] transition-all cursor-pointer"
                title={`Motion: ${reduceMotion ? 'Reduced' : 'Full'} (M)`}
              >
                {reduceMotion ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M4 12 H20" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3 12 Q6 7 9 12 T15 12 T21 12" />
                  </svg>
                )}
              </button>

              {/* Language Switch */}
              <div className="flex items-center border-l border-[var(--stroke)] pl-1 ml-1">
                <button
                  type="button"
                  onClick={() => onSetLang('en')}
                  className={`px-2 py-1 rounded-full font-mono text-[10px] sm:text-xs transition-all ${
                    lang === 'en' ? 'text-[var(--cyan)] bg-[rgba(var(--accent-rgb),0.15)] font-bold' : 'text-[var(--text-3)] hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onSetLang('ar')}
                  className={`px-2 py-1 rounded-full font-mono text-[10px] sm:text-xs transition-all ${
                    lang === 'ar' ? 'text-[var(--cyan)] bg-[rgba(var(--accent-rgb),0.15)] font-bold' : 'text-[var(--text-3)] hover:text-white'
                  }`}
                >
                  ع
                </button>
              </div>
            </div>

            {/* Master Bot Action Button (Desktop) */}
            <button
              onClick={onToggleRun}
              className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-xs tracking-wider uppercase transition-all shadow-xl cursor-pointer ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isRunning ? (isAr ? 'إيقاف' : 'PAUSE') : (isAr ? 'تشغيل' : 'BOOT')}</span>
            </button>

            {/* Emergency Kill Trigger */}
            {killSwitchActive ? (
              <button
                onClick={onResetKill}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white font-mono font-bold text-[10px] sm:text-xs tracking-wider uppercase animate-pulse shadow-lg shadow-rose-600/40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isAr ? 'إلغاء الإيقاف' : 'RESET'}</span>
              </button>
            ) : (
              <button
                onClick={onEmergencyKill}
                className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                title={isAr ? 'قاطع الطوارئ الآلي' : 'Emergency Halt'}
              >
                <AlertOctagon className="w-4 h-4 text-rose-500" />
              </button>
            )}

          </div>

        </div>
      </header>

      {/* Interactive Wallet Details Modal */}
      <WalletDetailsModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        balance={balance}
        lang={lang}
      />

      {/* Interactive PnL Details Modal */}
      <PnlDetailsModal
        isOpen={showPnlModal}
        onClose={() => setShowPnlModal(false)}
        balance={balance}
        lang={lang}
      />
    </>
  );
});
