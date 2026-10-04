/**
 * Basel AlgoCore Trading System
 * Master Command Navigation & Quantum Neural Core Header
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  ShieldCheck,
  Sparkles,
  Zap,
  Sliders,
  Bell,
  CheckCircle,
  XCircle,
  ChevronDown,
  Layers,
  Terminal,
} from 'lucide-react';
import { AssetSymbol } from '../domain/types';
import { RuntimeConfigState } from '../app/RuntimeConfig';

interface HeaderProps {
  isRunning: boolean;
  onToggleRun: () => void;
  killSwitchActive: boolean;
  killSwitchLevel: string;
  onEmergencyKill: (level?: any, reason?: string) => void;
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

export const Header: React.FC<HeaderProps> = React.memo(({
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
  activeSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'AVAX/USDT'],
  selectedSymbol,
  setSelectedSymbol,
  isConnected,
  isTelegramEnabled,
  onToggleTelegram,
  reduceMotion,
  onToggleReduceMotion,
}) => {
  const isAr = lang === 'ar';
  const [showKillModal, setShowKillModal] = useState(false);
  const [selectedKillLevel, setSelectedKillLevel] = useState<'SOFT_HALT' | 'HARD_HALT' | 'LIQUIDATION_STOP'>('HARD_HALT');

  const navTabs = [
    { id: 'dashboard', nameEn: 'LIVE DESK', nameAr: 'غرفة العمليات', icon: Activity },
    { id: 'quantum', nameEn: 'QUANTUM AI', nameAr: 'المحسن الكمي', icon: Cpu },
    { id: 'risk', nameEn: 'RISK SHIELD', nameAr: 'إدارة المخاطر', icon: ShieldCheck },
    { id: 'backtest', nameEn: 'LABS & SIM', nameAr: 'المختبر والباك تيست', icon: Layers },
    { id: 'telemetry', nameEn: 'TELEMETRY', nameAr: 'سجل التزامن', icon: Terminal },
  ];

  return (
    <header 
      dir={isAr ? 'rtl' : 'ltr'}
      className="border-b border-white/10 bg-[#040814]/90 backdrop-blur-xl sticky top-0 z-50 px-3 sm:px-6 py-3 gpu-accelerated shadow-2xl"
    >
      <div className="max-w-[1720px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-6">
        
        {/* Top Brand and Status Section */}
        <div className="w-full lg:w-auto flex items-center justify-between gap-4">
          
          {/* Neural Kinetic Logo */}
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-2xl blur opacity-70 group-hover:opacity-100 transition duration-500" />
              <div className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#090e1d] border border-cyan-500/40 text-cyan-400 font-black text-xl shadow-lg">
                <Zap className={`w-5 h-5 text-cyan-400 ${reduceMotion ? '' : 'group-hover:scale-110'} transition-transform`} />
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#040814] ${
                  isConnected ? 'bg-emerald-400' : 'bg-rose-500'
                }`} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black text-white tracking-tight font-sans">
                  {isAr ? 'بازل ألغوكور' : 'BASEL ALGOCORE'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest">
                  QUANTUM
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 tracking-wider">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                  <span>{isConnected ? (isAr ? 'العقل متصل' : 'BRAIN_SYNCED') : (isAr ? 'غير متصل' : 'DISCONNECTED')}</span>
                </div>
                <span className="text-slate-700">•</span>
                <button 
                  onClick={onToggleTelegram}
                  className={`flex items-center gap-1 hover:text-cyan-300 transition-colors ${
                    isTelegramEnabled ? 'text-blue-400' : 'text-slate-500'
                  }`}
                  title={isAr ? 'تنبيهات تليغرام' : 'Telegram Alerts'}
                >
                  <Send className="w-2.5 h-2.5" />
                  <span>{isTelegramEnabled ? (isAr ? 'تليغرام مفعّل' : 'TG_ON') : (isAr ? 'تليغرام معطل' : 'TG_OFF')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Bot Toggle for Mobile */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={onToggleRun}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all shadow-lg ${
                isRunning
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-600 text-white shadow-emerald-500/30'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isRunning ? (isAr ? 'إيقاف' : 'PAUSE') : (isAr ? 'تشغيل' : 'BOOT')}</span>
            </button>
          </div>
        </div>

        {/* Dynamic Navigation Bar */}
        <nav 
          aria-label={isAr ? 'التنقل بين الأقسام' : 'Primary Navigation'}
          className="w-full lg:w-auto flex items-center bg-[#070c18] p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar"
        >
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-[11px] font-black tracking-wider uppercase transition-all whitespace-nowrap ${
                  isActive
                    ? 'text-cyan-300 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-cyan-500/20 border border-cyan-500/40 rounded-xl"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span className="relative z-10">{isAr ? tab.nameAr : tab.nameEn}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Controls & Master Triggers */}
        <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-2 sm:gap-3">
          
          {/* Symbol Selector Dropdown */}
          <div className="flex items-center bg-[#070c18] px-3 py-1.5 rounded-xl border border-white/10 gap-2">
            <span className="text-[10px] font-black text-slate-500 uppercase">{isAr ? 'الزوج:' : 'PAIR:'}</span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value as AssetSymbol)}
              className="bg-transparent text-cyan-400 text-[11px] font-mono font-black focus:outline-none cursor-pointer uppercase tracking-wider border-none p-0"
            >
              {activeSymbols.map(sym => (
                <option key={sym} value={sym} className="bg-[#090e1d] text-slate-100">{sym}</option>
              ))}
            </select>
          </div>

          {/* Bilingual Switcher Button */}
          <button
            onClick={onToggleLang}
            className="px-3 py-1.5 rounded-xl bg-[#070c18] text-slate-300 border border-white/10 hover:border-cyan-500/30 hover:text-white transition-all font-mono font-black text-[10px] uppercase flex items-center gap-1.5"
            title={isAr ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic'}
          >
            <Globe className="w-3 h-3 text-cyan-400" />
            <span>{isAr ? 'EN' : 'عربي'}</span>
          </button>

          {/* Master Execution Button (Desktop) */}
          <button
            onClick={onToggleRun}
            className={`hidden lg:flex items-center gap-2.5 px-5 py-2 rounded-xl font-mono font-black text-[11px] tracking-wider uppercase transition-all shadow-xl ${
              isRunning
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30'
            }`}
          >
            {isRunning ? (
              <><Pause className="w-4 h-4 text-amber-400" /> <span>{isAr ? 'إيقاف مؤقت' : 'PAUSE_BOT'}</span></>
            ) : (
              <><Play className="w-4 h-4 text-white" /> <span>{isAr ? 'تشغيل البوت' : 'BOOT_ENGINE'}</span></>
            )}
          </button>

          {/* Emergency KillSwitch Trigger & Recovery */}
          {killSwitchActive ? (
            <button
              onClick={onResetKill}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-mono font-black text-[10px] tracking-wider uppercase shadow-lg shadow-rose-600/40 transition-all hover:bg-rose-500 animate-pulse"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط الطوارئ' : 'RESET_KILL'}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowKillModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 text-rose-400 border border-rose-500/30 transition-all flex items-center gap-1.5 group"
              title={isAr ? 'قاطع الطوارئ الآلي' : 'Emergency Halt'}
            >
              <AlertOctagon className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline font-mono font-bold text-[10px]">{isAr ? 'طوارئ' : 'HALT'}</span>
            </button>
          )}

        </div>
      </div>

      {/* Emergency Kill Modal */}
      <AnimatePresence>
        {showKillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0d1222] border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center gap-3 text-rose-400 mb-4">
                <AlertOctagon className="w-7 h-7" />
                <h3 className="text-lg font-black font-sans">{isAr ? 'تأكيد إيقاف الطوارئ' : 'Confirm Emergency Halt'}</h3>
              </div>

              <p className="text-xs text-slate-300 mb-4 leading-relaxed font-medium">
                {isAr 
                  ? 'سيقوم قاطع الدورة بتعليق تنفيذ جميع الصفقات الخوارزمية فوراً لحماية المحفظة من تقلبات السوق.'
                  : 'The circuit breaker will immediately suspend algorithmic trade execution across all markets.'}
              </p>

              <div className="space-y-2 mb-6">
                {(['SOFT_HALT', 'HARD_HALT', 'LIQUIDATION_STOP'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setSelectedKillLevel(lvl)}
                    className={`w-full p-3 rounded-xl text-xs font-mono font-bold flex items-center justify-between border transition-all ${
                      selectedKillLevel === lvl
                        ? 'bg-rose-500/20 border-rose-500 text-white'
                        : 'bg-slate-900/50 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span>{lvl}</span>
                    <span className="text-[10px] text-slate-400">
                      {lvl === 'SOFT_HALT' ? (isAr ? 'إلغاء الأوامر فقط' : 'Cancel orders only') :
                       lvl === 'HARD_HALT' ? (isAr ? 'وقف الصفقات بالكامل' : 'Halt all pipeline') :
                       (isAr ? 'إغلاق المراكز فوراً' : 'Liquidate all positions')}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowKillModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    onEmergencyKill(selectedKillLevel, 'Manual emergency halt by operator');
                    setShowKillModal(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-black text-xs shadow-lg shadow-rose-600/30 transition-all"
                >
                  {isAr ? 'تفعيل الإيقاف 🛑' : 'TRIGGER HALT 🛑'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
});
