/**
 * Basel AlgoCore Bot Actions Toolbar
 * Quick Dispatch Controls for Quantum Optimization, Auto-Hedging, Market Screener & Emergency Exit
 */

import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Search,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ExecutionMode } from '../domain/types';

interface BotActionsToolbarProps {
  onTriggerRebalance: () => void;
  onToggleHedging: () => void;
  isHedgingActive: boolean;
  onEmergencyCloseAll: () => void;
  onTriggerScreener: () => void;
  executionMode: ExecutionMode;
  onChangeMode: (mode: ExecutionMode) => void;
  lang: 'ar' | 'en';
}

export const BotActionsToolbar: React.FC<BotActionsToolbarProps> = React.memo(({
  onTriggerRebalance,
  onToggleHedging,
  isHedgingActive,
  onEmergencyCloseAll,
  onTriggerScreener,
  executionMode,
  onChangeMode,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [rebalanceLoading, setRebalanceLoading] = useState<boolean>(false);
  const [screenerLoading, setScreenerLoading] = useState<boolean>(false);
  const [showConfirmClose, setShowConfirmClose] = useState<boolean>(false);

  const handleRebalance = async () => {
    setRebalanceLoading(true);
    await onTriggerRebalance();
    setTimeout(() => setRebalanceLoading(false), 1200);
  };

  const handleScreener = async () => {
    setScreenerLoading(true);
    await onTriggerScreener();
    setTimeout(() => setScreenerLoading(false), 1000);
  };

  return (
    <div 
      className="p-2 sm:p-2.5 rounded-2xl border border-[var(--stroke)] bg-gradient-to-r from-[rgba(8,12,22,0.85)] via-[rgba(6,10,18,0.92)] to-[rgba(8,12,22,0.85)] backdrop-blur-xl shadow-xl flex flex-wrap items-center justify-between gap-2 sm:gap-3"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Group 1: Core Automated Task Triggers */}
      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
        
        {/* QUBO Quantum Rebalance Trigger */}
        <button
          type="button"
          onClick={handleRebalance}
          disabled={rebalanceLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[10px] sm:text-xs font-bold text-[var(--cyan)] bg-[rgba(var(--accent-rgb),0.08)] hover:bg-[rgba(var(--accent-rgb),0.18)] border border-[var(--stroke-2)] transition-all cursor-pointer disabled:opacity-50"
          title={isAr ? 'تشغيل إعادة التوازن الكمي التوافقي' : 'Trigger Quantum QUBO Rebalance'}
        >
          <Zap className={`w-3.5 h-3.5 text-[var(--cyan)] ${rebalanceLoading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'إعادة التوازن الكمي' : 'QUBO Rebalance'}</span>
        </button>

        {/* Delta-Neutral Auto Hedging Toggle */}
        <button
          type="button"
          onClick={onToggleHedging}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[10px] sm:text-xs font-bold transition-all border cursor-pointer ${
            isHedgingActive
              ? 'text-[var(--lime)] bg-[rgba(var(--accent-2-rgb),0.12)] border-[rgba(var(--accent-2-rgb),0.3)] shadow-[0_0_10px_rgba(var(--accent-2-rgb),0.15)]'
              : 'text-[var(--text-3)] hover:text-[var(--text)] bg-white/[0.02] border-[var(--stroke)]'
          }`}
          title={isAr ? 'تبديل نظام التحوط التلقائي ضد هبوط السوق' : 'Toggle Delta-Neutral Auto Hedging'}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{isAr ? (isHedgingActive ? 'التحوط الآلي: نشط' : 'التحوط الآلي: متوقف') : (isHedgingActive ? 'Hedging: ACTIVE' : 'Hedging: OFF')}</span>
        </button>

        {/* Asset Screener Trigger */}
        <button
          type="button"
          onClick={handleScreener}
          disabled={screenerLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[10px] sm:text-xs font-bold text-[var(--text-2)] hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-[var(--stroke)] transition-all cursor-pointer disabled:opacity-50"
          title={isAr ? 'فحص ومسح 284 زوجاً لرصد فرص التباين والتقلب' : 'Scan 284 market pairs for volatility & arbitrage'}
        >
          <Search className={`w-3.5 h-3.5 text-[var(--text-3)] ${screenerLoading ? 'animate-bounce' : ''}`} />
          <span>{isAr ? 'ماسح الأسواق' : 'Screener'}</span>
        </button>

      </div>

      {/* Group 2: Mode & Emergency Exit */}
      <div className="flex items-center gap-2">
        
        {/* Execution Mode Selector */}
        <div className="flex items-center p-0.5 rounded-xl bg-black/50 border border-[var(--stroke)] font-mono text-[9px] sm:text-[10px]">
          {(['TESTNET', 'LIVE'] as ExecutionMode[]).map((mode) => {
            const isCurrent = executionMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeMode(mode)}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? mode === 'LIVE'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : mode === 'TESTNET'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-[var(--text-3)] hover:text-white'
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>

        {/* Panic Close All Positions */}
        {showConfirmClose ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onEmergencyCloseAll();
                setShowConfirmClose(false);
              }}
              className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-mono text-[10px] font-bold uppercase transition-all shadow-lg animate-pulse cursor-pointer"
            >
              {isAr ? 'تأكيد الإغلاق!' : 'CONFIRM CLOSE!'}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmClose(false)}
              className="px-2 py-1 rounded-xl bg-white/10 text-[var(--text-3)] hover:text-white font-mono text-[10px] cursor-pointer"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowConfirmClose(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-mono text-[10px] sm:text-xs font-bold text-rose-400 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 transition-all cursor-pointer"
            title={isAr ? 'إغلاق وتصفية كافة الصفقات المفتوحة فورياً' : 'Close and liquidate all open positions instantly'}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span>{isAr ? 'إغلاق الكل' : 'Close All'}</span>
          </button>
        )}

      </div>
    </div>
  );
});
