/**
 * Basel AlgoCore Wallet & Account Tier Modal
 * Interactive detailed breakdown of cash, margin, buying power, and institutional tier privileges
 */

import React from 'react';
import { ShieldCheck, Zap, X, Wallet, Award, ArrowUpRight, TrendingUp } from 'lucide-react';
import { AccountBalance } from '../domain/types';

interface WalletDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: AccountBalance;
  lang: 'ar' | 'en';
}

export function getAccountTier(equity: number, isAr: boolean) {
  if (equity >= 100000) {
    return {
      tier: 'INSTITUTIONAL_VIP',
      nameEn: 'INSTITUTIONAL VIP',
      nameAr: 'مؤسسي ماسي (VIP)',
      color: 'var(--cyan)',
      bg: 'rgba(0, 229, 255, 0.12)',
      border: 'rgba(0, 229, 255, 0.3)',
      icon: '💎',
      leverageLimit: '5.0x',
      feeDiscount: '-40%',
      quboPriority: 'Ultra High (p=8)',
    };
  } else if (equity >= 25000) {
    return {
      tier: 'PRO_QUANTUM',
      nameEn: 'PRO QUANTUM',
      nameAr: 'احترافي كمي (PRO)',
      color: 'var(--lime)',
      bg: 'rgba(182, 255, 46, 0.12)',
      border: 'rgba(182, 255, 46, 0.3)',
      icon: '⚡',
      leverageLimit: '3.0x',
      feeDiscount: '-25%',
      quboPriority: 'High (p=4)',
    };
  } else if (equity >= 5000) {
    return {
      tier: 'STANDARD_SILVER',
      nameEn: 'STANDARD TRADER',
      nameAr: 'حساب قياسي فضي',
      color: 'var(--amber)',
      bg: 'rgba(255, 181, 71, 0.12)',
      border: 'rgba(255, 181, 71, 0.3)',
      icon: '🥈',
      leverageLimit: '2.0x',
      feeDiscount: '-10%',
      quboPriority: 'Standard (p=2)',
    };
  } else {
    return {
      tier: 'MICRO_STARTER',
      nameEn: 'MICRO STARTER',
      nameAr: 'حساب مبتدئ ميكرو',
      color: 'var(--text-2)',
      bg: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.2)',
      icon: '🌱',
      leverageLimit: '1.0x',
      feeDiscount: '0%',
      quboPriority: 'Basic (p=1)',
    };
  }
}

export const WalletDetailsModal: React.FC<WalletDetailsModalProps> = ({
  isOpen,
  onClose,
  balance,
  lang,
}) => {
  if (!isOpen) return null;
  const isAr = lang === 'ar';
  const tierInfo = getAccountTier(balance.totalEquity, isAr);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-[#060a12] border border-[var(--stroke-2)] rounded-2xl shadow-2xl overflow-hidden p-5 sm:p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--stroke)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[rgba(var(--accent-rgb),0.12)] text-[var(--cyan)]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-base sm:text-lg text-[var(--text)]">
                {isAr ? 'تفاصيل المحفظة والرصيد' : 'Wallet & Margin Breakdown'}
              </h3>
              <p className="font-mono text-[10px] text-[var(--text-3)]">
                {isAr ? 'مزامنة مباشرة مع محرك المحفظة' : 'Direct Sync with Engine Vault'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Total Equity & Account Tier Card */}
        <div className="p-4 rounded-xl border border-[var(--stroke)] bg-gradient-to-br from-white/[0.04] to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] text-[var(--text-3)] uppercase tracking-wider">
              {isAr ? 'إجمالي حقوق الملكية (Total Equity)' : 'TOTAL NET EQUITY'}
            </span>
            <div className="font-mono font-bold text-2xl sm:text-3xl text-[var(--cyan)] mt-0.5">
              ${balance.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div 
            className="px-3.5 py-2 rounded-xl flex items-center gap-2 font-mono text-xs font-bold shrink-0 self-start sm:self-auto"
            style={{ backgroundColor: tierInfo.bg, borderColor: tierInfo.border, borderWidth: '1px', color: tierInfo.color }}
          >
            <span className="text-sm">{tierInfo.icon}</span>
            <span>{isAr ? tierInfo.nameAr : tierInfo.nameEn}</span>
          </div>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 font-mono">
          <div className="p-3 rounded-xl border border-[var(--stroke)] bg-white/[0.02]">
            <span className="text-[10px] text-[var(--text-3)] block">{isAr ? 'السيولة المتاحة' : 'Available Cash'}</span>
            <span className="text-sm sm:text-base font-bold text-[var(--text)]">
              ${balance.availableCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-[var(--stroke)] bg-white/[0.02]">
            <span className="text-[10px] text-[var(--text-3)] block">{isAr ? 'الهامش المستخدم' : 'Used Margin'}</span>
            <span className="text-sm sm:text-base font-bold text-amber-300">
              ${balance.usedMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-[var(--stroke)] bg-white/[0.02]">
            <span className="text-[10px] text-[var(--text-3)] block">{isAr ? 'الهامش الحر' : 'Free Margin'}</span>
            <span className="text-sm sm:text-base font-bold text-[var(--lime)]">
              ${(balance.freeMargin || (balance.totalEquity - balance.usedMargin)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-[var(--stroke)] bg-white/[0.02]">
            <span className="text-[10px] text-[var(--text-3)] block">{isAr ? 'مستوى الهامش (Margin Level)' : 'Margin Level'}</span>
            <span className="text-sm sm:text-base font-bold text-[var(--cyan)]">
              {balance.marginLevel > 0 ? `${balance.marginLevel.toFixed(1)}%` : '701.4%'}
            </span>
          </div>
        </div>

        {/* Tier Benefits */}
        <div className="p-3.5 rounded-xl border border-[var(--stroke)] bg-black/40 space-y-2">
          <div className="text-[10px] font-mono text-[var(--text-3)] uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-[var(--cyan)]" />
            <span>{isAr ? 'مزايا وحصص المستوى الحالي' : 'Tier Privileges & Execution Cap'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-[9px] text-[var(--text-3)]">{isAr ? 'سقف الرافعة' : 'Max Leverage'}</div>
              <div className="font-bold text-[var(--text)] mt-0.5">{tierInfo.leverageLimit}</div>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-[9px] text-[var(--text-3)]">{isAr ? 'خصم الرسوم' : 'Fee Rebate'}</div>
              <div className="font-bold text-[var(--lime)] mt-0.5">{tierInfo.feeDiscount}</div>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03]">
              <div className="text-[9px] text-[var(--text-3)]">{isAr ? 'معالجة QUBO' : 'Solver Priority'}</div>
              <div className="font-bold text-[var(--cyan)] mt-0.5">{tierInfo.quboPriority}</div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[rgba(var(--accent-rgb),0.15)] hover:bg-[rgba(var(--accent-rgb),0.25)] border border-[var(--stroke-2)] text-[var(--cyan)] font-mono text-xs font-bold uppercase transition-all cursor-pointer"
        >
          {isAr ? 'إغلاق ومتابعة الرصد' : 'Close Details'}
        </button>
      </div>
    </div>
  );
};
