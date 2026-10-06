/**
 * SubWalletModal.tsx
 * ====================================================================
 * Isolated $25 Sub-Wallet & Micro-Quant Quarantine Dashboard
 * ====================================================================
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Lock,
  RotateCcw,
  Zap,
  CheckCircle2,
  X,
} from 'lucide-react';
import { SubWalletState } from '../risk/SubWalletManager';

interface SubWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  subWallet?: SubWalletState | null;
  masterBalance: number;
  onResetSubWallet: () => Promise<void>;
  onRealignAllTrades?: () => Promise<void>;
  lang: 'ar' | 'en';
}

export const SubWalletModal: React.FC<SubWalletModalProps> = ({
  isOpen,
  onClose,
  subWallet,
  masterBalance,
  onResetSubWallet,
  onRealignAllTrades,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [isResetting, setIsResetting] = useState(false);
  const [isRealigning, setIsRealigning] = useState(false);
  const [isScalingUp, setIsScalingUp] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [realignSuccess, setRealignSuccess] = useState(false);
  const [scaleUpSuccess, setScaleUpSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentEquity = subWallet?.currentEquity ?? 25.0;
  const initialAllocation = subWallet?.initialAllocation ?? 25.0;
  const realizedProfit = subWallet?.realizedProfit ?? 0.0;
  const growthPct = subWallet?.growthPct ?? 0.0;
  const winRate = subWallet?.winRate ?? 0.0;
  const totalTrades = subWallet?.totalTrades ?? 0;
  const isDepleted = subWallet?.isDepleted ?? false;

  const handleScaleUp = async () => {
    try {
      setIsScalingUp(true);
      setScaleUpSuccess(null);
      const res = await fetch('/api/protected/positions/scale-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMargin: 6.0 })
      });
      const data = await res.json();
      if (data.success) {
        setScaleUpSuccess(isAr ? 'تم رفع ومضاعفة هامش الصفقات المفتوحة إلى ~6.0$ بنجاح!' : 'Positions scaled up to $6.0 margin successfully!');
        setTimeout(() => setScaleUpSuccess(null), 3500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScalingUp(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await onResetSubWallet();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsResetting(false);
    }
  };

  const handleRealign = async () => {
    if (!onRealignAllTrades) return;
    try {
      setIsRealigning(true);
      await onRealignAllTrades();
      setRealignSuccess(true);
      setTimeout(() => setRealignSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRealigning(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-[#090e1d] border border-cyan-500/30 rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Neon Grid Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between pb-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white tracking-tight">
                    {isAr ? 'المحفظة الثانوية المعزولة ($25)' : 'Isolated Sub-Wallet ($25)'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                    {isAr ? 'حماية رأس المال' : 'SAFE QUARANTINE'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAr
                    ? 'تخصيص 25$ فقط من محفظة Testnet مع تجميد باقي الرصيد المركزي'
                    : 'Quarantining $25 from Master Testnet with master funds locked'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dual Balance Visualizer */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
            {/* Master Wallet Card (Locked) */}
            <div className="p-5 rounded-2xl bg-[#070c18] border border-white/10 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isAr ? 'المحفظة الرئيسية (معلقة/محمية)' : 'Master Wallet (Locked)'}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {isAr ? 'معفي من التداول' : 'PROTECTED'}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-black text-slate-200">
                ${masterBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-medium">
                {isAr
                  ? '🔒 الرصيد الرئيسي محمي بنسبة 100% ولا يتم فتح صفقات تتجاوز المحفظة الثانوية.'
                  : '🔒 Master balance is 100% safeguarded against high exposure.'}
              </p>
            </div>

            {/* Sub-Wallet Card (Active Trading) */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 to-cyan-900/20 border border-cyan-500/40 relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between text-cyan-300 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>{isAr ? 'المحفظة الثانوية المتداولة' : 'Active Sub-Wallet'}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                  {growthPct >= 0 ? '+' : ''}{growthPct}% {isAr ? 'نمو' : 'ROI'}
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-mono font-black text-cyan-200">
                ${currentEquity.toFixed(2)}
                <span className="text-xs text-slate-400 font-sans ml-2 mr-2 font-normal">
                  / ${initialAllocation.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs font-mono">
                <span className="text-slate-400">{isAr ? 'الأرباح المحققة:' : 'Realized PnL:'}</span>
                <span className={`font-bold ${realizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realizedProfit >= 0 ? '+' : ''}${realizedProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Performance & Compound Matrix */}
          <div className="relative z-10 grid grid-cols-3 gap-3 my-4">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-center">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                {isAr ? 'معدل الفوز' : 'WIN RATE'}
              </span>
              <span className="text-lg font-mono font-black text-emerald-400 mt-1 block">
                {winRate.toFixed(1)}%
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-center">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                {isAr ? 'إجمالي الصفقات' : 'SUB-TRADES'}
              </span>
              <span className="text-lg font-mono font-black text-cyan-300 mt-1 block">
                {totalTrades}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-center">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                {isAr ? 'إعادة الاستثمار' : 'COMPOUNDING'}
              </span>
              <span className="text-lg font-mono font-black text-purple-400 mt-1 block">
                100% {isAr ? 'تلقائي' : 'AUTO'}
              </span>
            </div>
          </div>

          {/* ⚡ Scale Up / Proportional Margin Adjuster */}
          <div className="relative z-10 p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-black border border-cyan-500/30 my-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  {isAr ? 'ملاءمة ومضاعفة هامش الصفقات مع المحفظة' : 'Scale Up Positions to Proportional Margin'}
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold">
                {isAr ? 'الهامش المستهدف: 6.0$ لكل صفقة' : 'Target Margin: $6.00/Trade'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-gray-300">
              <div className="bg-black/50 p-2.5 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] text-gray-400 block">{isAr ? 'الهامش القديم (الأدنى):' : 'Old Minimum Margin:'}</span>
                <span className="font-bold text-amber-400">~$1.80 USDT</span>
                <span className="text-[10px] text-gray-500 block">{isAr ? '(أرباح الحركة 3.5% = ~0.15$)' : '(3.5% Move = ~$0.15)'}</span>
              </div>
              <div className="bg-black/50 p-2.5 rounded-lg border border-white/5 space-y-1">
                <span className="text-[10px] text-gray-400 block">{isAr ? 'الهامش الجديد المتناسب (25%):' : 'Proportional Margin (25%):'}</span>
                <span className="font-bold text-emerald-400">~$6.00 – $8.00 USDT</span>
                <span className="text-[10px] text-emerald-300 font-bold block">{isAr ? '(أرباح الحركة 3.5% = +0.85$ إلى +1.20$)' : '(3.5% Move = +$0.85 to +$1.20)'}</span>
              </div>
            </div>

            {scaleUpSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{scaleUpSuccess}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isScalingUp}
              onClick={handleScaleUp}
              className="w-full py-2.5 px-4 rounded-xl font-mono text-xs font-bold bg-gradient-to-r from-cyan-500/25 via-blue-600/30 to-cyan-500/25 hover:from-cyan-500/35 hover:to-blue-600/40 border border-cyan-400/50 text-cyan-200 transition cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,243,255,0.2)] disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-cyan-400 ${isScalingUp ? 'animate-spin' : ''}`} />
              <span>
                {isScalingUp
                  ? (isAr ? 'جاري تعزيز ومضاعفة الهامش على بايننس...' : 'Scaling up positions on Binance...')
                  : (isAr ? '⚡ مضاعفة ورفع هامش الصفقات الحالية إلى 6.0$ USDT فوراً' : 'Scale Up Active Positions Margin to $6.00 Now')}
              </span>
            </button>
          </div>

          {/* Operational Policy & Reset Trigger */}
          <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {isAr
                  ? 'يتم تنمية رأس المال من أرباح الصفقات حصرياً دون سحب أي سنت إضافي من المحفظة الرئيسية.'
                  : 'Capital compounds strictly from closed trading profits without dipping into master funds.'}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {onRealignAllTrades && (
                <button
                  type="button"
                  onClick={handleRealign}
                  disabled={isRealigning}
                  className="px-4 py-2.5 rounded-xl font-mono text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRealigning ? 'animate-spin' : ''}`} />
                  <span>
                    {realignSuccess
                      ? (isAr ? 'تمت التصفية والمطابقة' : 'Realigned!')
                      : (isAr ? 'تصفير ومطابقة الصفقات' : 'Liquidate & Realign')}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isDepleted
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 animate-bounce'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>
                  {resetSuccess
                    ? (isAr ? 'تمت إعادة الشحن ($25)' : 'Reset Successful ($25)')
                    : (isAr ? 'إعادة شحن 25$' : 'Reset $25')}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
