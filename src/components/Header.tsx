/**
 * Basel Quantum Algorithmic Trading System
 * Header Navigation & Bot Master Control Center
 */

import React from 'react';
import {
  Activity,
  AlertOctagon,
  Cpu,
  Globe,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { AssetSymbol, SolverType } from '../domain/types';
import { RuntimeConfigState } from '../app/RuntimeConfig';

interface HeaderProps {
  isRunning: boolean;
  onToggleRun: () => void;
  killSwitchActive: boolean;
  killSwitchLevel: string;
  onEmergencyKill: () => void;
  onResetKill: () => void;
  config: RuntimeConfigState;
  onConfigChange: (newConfig: Partial<RuntimeConfigState>) => void;
  lang: 'ar' | 'en';
  onToggleLang: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeSymbols: AssetSymbol[];
  selectedSymbol: AssetSymbol;
  setSelectedSymbol: (sym: AssetSymbol) => void;
  isConnected: boolean;
  isTelegramEnabled: boolean;
  onToggleTelegram: () => void;
  reduceMotion: boolean;
  onToggleReduceMotion: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isRunning,
  onToggleRun,
  killSwitchActive,
  killSwitchLevel,
  onEmergencyKill,
  onResetKill,
  config,
  onConfigChange,
  lang,
  onToggleLang,
  activeTab,
  setActiveTab,
  activeSymbols,
  selectedSymbol,
  setSelectedSymbol,
  isConnected,
  isTelegramEnabled,
  onToggleTelegram,
  reduceMotion,
  onToggleReduceMotion,
}) => {
  const isAr = lang === 'ar';

  return (
    <header className="border-b border-white/5 bg-[#0a0f1d]/90 backdrop-blur-xl sticky top-0 z-50 px-4 md:px-6 py-3 md:py-4">
      <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
        {/* Top Row for Mobile (Brand + Master Control) */}
        <div className="w-full md:w-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 text-white font-black text-xl md:text-2xl tracking-wider transition-transform hover:scale-110 active:scale-95 cursor-pointer">
                <Zap className="w-5 h-5 md:w-6 md:h-6" />
                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-emerald-500 border-4 border-[#0a0f1d] ${reduceMotion ? '' : 'animate-pulse'}`} />
              </div>
            </div>
            <div>
              <h1 className="text-base md:text-xl font-black text-slate-100 tracking-tight flex items-center gap-2 md:gap-3">
                <span className="truncate max-w-[150px] md:max-w-none font-sans tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Basel AlgoCore</span>
                <span className="hidden xs:inline-block px-2 py-0.5 rounded-lg text-[8px] md:text-[9px] font-black font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-[0.1em] md:tracking-[0.2em]">
                  Pro
                </span>
              </h1>
              <div className="flex items-center gap-2 md:gap-3 text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className="hidden sm:inline">{isConnected ? (isAr ? 'المخ متصل' : 'BRAIN_SYNCED') : (isAr ? 'فشل الاتصال' : 'BRAIN_OFFLINE')}</span>
                </div>
                <span className="text-slate-700 hidden sm:inline">/</span>
                <div className="flex items-center gap-1.5">
                  <Send className={`w-2.5 h-2.5 md:w-3 md:h-3 ${isTelegramEnabled ? 'text-blue-400' : 'text-slate-600'}`} />
                  <span className="hidden sm:inline">{isTelegramEnabled ? 'TG_ENABLED' : 'TG_DISABLED'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Master Execution Button for Mobile */}
          <button
            onClick={onToggleRun}
            className={`md:hidden flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[9px] tracking-[0.1em] uppercase transition-all shadow-xl ${
              isRunning
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-600 text-white shadow-emerald-500/20'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? (isAr ? 'إيقاف' : 'PAUSE') : (isAr ? 'بدء' : 'BOOT')}
          </button>
        </div>

        {/* Dynamic Navigation - Scrollable on Mobile */}
        <div className="w-full md:w-auto flex items-center bg-slate-900/50 p-1 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'dashboard', nameEn: 'OPS', nameAr: 'العمليات' },
            { id: 'quantum', nameEn: 'QUANTUM', nameAr: 'الكم' },
            { id: 'risk', nameEn: 'RISK', nameAr: 'المخاطر' },
            { id: 'backtest', nameEn: 'LABS', nameAr: 'المختبر' },
            { id: 'telemetry', nameEn: 'SYNC', nameAr: 'التزامن' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black tracking-widest uppercase transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {isAr ? tab.nameAr : tab.nameEn}
            </button>
          ))}
        </div>

        {/* Global Controls Section - Wrap on mobile */}
        <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-2 md:gap-3">
          <div className="flex items-center gap-2">
            {/* Symbol Selector Pill */}
            <div className="flex items-center bg-slate-900/50 px-3 py-2 rounded-2xl border border-white/5 gap-2">
              <span className="hidden xs:inline text-[9px] font-black text-slate-600 uppercase tracking-widest">{isAr ? 'الزوج:' : 'PAIR'}</span>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value as AssetSymbol)}
                className="bg-transparent text-cyan-400 text-[9px] md:text-[10px] font-black focus:outline-none cursor-pointer uppercase tracking-widest outline-none border-none p-0"
              >
                {activeSymbols.map(sym => (
                  <option key={sym} value={sym} className="bg-slate-900">{sym}</option>
                ))}
              </select>
            </div>

            {/* Language & Utilities */}
            <button
                onClick={onToggleLang}
                className="p-2.5 md:p-3 rounded-2xl bg-slate-900/50 text-slate-400 border border-white/5 hover:text-slate-100 transition-all font-black text-[9px]"
             >
                {lang === 'ar' ? 'EN' : 'AR'}
             </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Master Execution Button for Desktop */}
            <button
              onClick={onToggleRun}
              className={`hidden md:flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] tracking-[0.2em] uppercase transition-all shadow-xl ${
                isRunning
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
              }`}
            >
              {isRunning ? (
                <><Pause className="w-4 h-4" /> {isAr ? 'إيقاف مؤقت' : 'PAUSE'}</>
              ) : (
                <><Play className="w-4 h-4" /> {isAr ? 'تشغيل' : 'BOOT'}</>
              )}
            </button>

            {/* System Critical KillSwitch */}
            {killSwitchActive ? (
              <button
                onClick={onResetKill}
                className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-2xl bg-rose-600 text-white font-black text-[9px] md:text-[10px] tracking-[0.1em] md:tracking-[0.2em] uppercase shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-500"
              >
                <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{isAr ? 'إعادة الضبط' : 'RECOVERY'}</span>
                <span className="sm:hidden">{isAr ? 'ضبط' : 'REC'}</span>
              </button>
            ) : (
              <button
                onClick={onEmergencyKill}
                className="p-2.5 md:p-3 rounded-2xl bg-rose-950/20 hover:bg-rose-950/40 text-rose-500 border border-rose-900/30 transition-all group"
                title="EMERGENCY_HALT"
              >
                <AlertOctagon className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
