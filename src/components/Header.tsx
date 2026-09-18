/**
 * Basel Quantum Algorithmic Trading System
 * Header Navigation & Bot Master Control Center
 */

import React from 'react';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Cpu,
  Flame,
  Globe,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
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
}) => {
  const isAr = lang === 'ar';

  return (
    <header className="border-b border-slate-800 bg-[#0d1322]/95 backdrop-blur sticky top-0 z-50">
      {/* Top Banner with Core Controls */}
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 shadow-lg shadow-cyan-500/20 text-white font-black text-xl tracking-wider">
            <span>Ψ</span>
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0d1322] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>{isAr ? 'منظومة بازل الكمية' : 'BASEL QUANTUM'}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v2.4.0 MERGED
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {isAr
                ? 'محرك التداول الخوارزمي المستوحى من فيزياء الكم و QUBO'
                : 'Integrated Quantum-Inspired & QUBO Algorithmic Trading Bot'}
            </p>
          </div>
        </div>

        {/* Global Pipeline Status & KillSwitch Controls */}
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          {/* Solver Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 hidden md:inline">{isAr ? 'المعالج:' : 'Solver:'}</span>
            <select
              value={config.activeSolver}
              onChange={(e) => onConfigChange({ activeSolver: e.target.value as SolverType })}
              className="bg-transparent text-cyan-300 font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <option value="QUANTUM_ANNEALING" className="bg-slate-900 text-slate-200">
                {isAr ? 'التلدين الكمي (QSA)' : 'Quantum Annealing (QSA)'}
              </option>
              <option value="QAOA_CIRCUIT" className="bg-slate-900 text-slate-200">
                {isAr ? 'دائرة QAOA التغيرية' : 'QAOA Circuit'}
              </option>
              <option value="SIMULATED_ANNEALING" className="bg-slate-900 text-slate-200">
                {isAr ? 'التلدين الحراري (SA)' : 'Simulated Annealing (SA)'}
              </option>
              <option value="TABU_SEARCH" className="bg-slate-900 text-slate-200">
                {isAr ? 'البحث المحظور (Tabu)' : 'Tabu Search'}
              </option>
              <option value="CLASSICAL_MARKOWITZ" className="bg-slate-900 text-slate-200">
                {isAr ? 'ماركويتز الكلاسيكي (QP)' : 'Classical Markowitz'}
              </option>
            </select>
          </div>

          {/* Execution Mode */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={config.executionMode}
              onChange={(e) => onConfigChange({ executionMode: e.target.value as any })}
              className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer text-xs"
            >
              <option value="LIVE_SIMULATION" className="bg-slate-900 text-slate-200">
                {isAr ? 'محاكاة حية (Microsecond Feed)' : 'Live Simulation'}
              </option>
              <option value="PAPER_TRADING" className="bg-slate-900 text-slate-200">
                {isAr ? 'تداول تجريبي (Paper)' : 'Paper Trading'}
              </option>
              <option value="TESTNET_EXCHANGE" className="bg-slate-900 text-slate-200">
                {isAr ? 'منصة تجريبية (Testnet Sandbox)' : 'Testnet Sandbox'}
              </option>
              <option value="STRESS_TEST" className="bg-slate-900 text-slate-200">
                {isAr ? 'اختبار ضغط وصدمات' : 'Stress Testing'}
              </option>
            </select>
          </div>

          {/* Master Bot Start/Pause Button */}
          <button
            onClick={onToggleRun}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium text-xs transition-all shadow-md ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-700/30'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>{isAr ? 'إيقاف مؤقت' : 'Pause Pipeline'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>{isAr ? 'إطلاق البوت' : 'Launch Bot'}</span>
              </>
            )}
          </button>

          {/* KillSwitch Emergency Controls */}
          {killSwitchActive ? (
            <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-600/80 px-3 py-1 rounded-lg">
              <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
              <span className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                {killSwitchLevel}
              </span>
              <button
                onClick={onResetKill}
                className="flex items-center gap-1 text-[11px] bg-rose-800 hover:bg-rose-700 text-white px-2 py-0.5 rounded transition font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isAr ? 'إعادة تشغيل' : 'Reset'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onEmergencyKill}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition text-xs font-semibold"
              title={isAr ? 'إيقاف طوارئ فوري لكافة التداولات' : 'Immediate Emergency Kill Switch'}
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>{isAr ? 'مفتاح الطوارئ' : 'Emergency Kill'}</span>
            </button>
          )}

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition"
          >
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold">{lang === 'ar' ? 'EN' : 'العربية'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs & Symbol Selector Bar */}
      <div className="border-t border-slate-800/80 bg-[#090e18] px-4 sm:px-6">
        <div className="max-w-[1680px] mx-auto flex flex-wrap items-center justify-between gap-3 py-1.5">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'dashboard', nameEn: 'Live Operations', nameAr: 'غرفة العمليات الحية' },
              { id: 'quantum', nameEn: 'Quantum QUBO & QAOA', nameAr: 'المعالج الكمومي و QUBO' },
              { id: 'risk', nameEn: 'Risk Engine & VaR', nameAr: 'محرك المخاطر والـ VaR' },
              { id: 'backtest', nameEn: 'Backtest & Validation', nameAr: 'الاختبار التاريخي والمصفوفة' },
              { id: 'telemetry', nameEn: 'Latency & Event Journal', nameAr: 'زمن الاستجابة وسجل التدقيق' },
              { id: 'code', nameEn: 'Merged Code & Tests', nameAr: 'الأكواد المدمجة والاختبارات' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {isAr ? tab.nameAr : tab.nameEn}
              </button>
            ))}
          </div>

          {/* Asset Tickers Quick Selection */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-[11px] text-slate-400 hidden lg:inline">{isAr ? 'الأصل النشط:' : 'Active Pair:'}</span>
            {activeSymbols.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition ${
                  selectedSymbol === sym
                    ? 'bg-slate-700 text-cyan-300 border border-cyan-500/50'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
