import React from 'react';
import { motion } from 'motion/react';
import { Wallet, DollarSign, TrendingUp, ShieldCheck } from 'lucide-react';
import { AccountBalance } from '../domain/types';

interface AccountSummaryProps {
  balance: AccountBalance;
  lang: 'ar' | 'en';
}

export const AccountSummary: React.FC<AccountSummaryProps> = React.memo(({ balance, lang }) => {
  const isAr = lang === 'ar';

  const metrics = [
    {
      label: isAr ? 'إجمالي المحفظة' : 'TOTAL_EQUITY',
      value: `$${(balance?.totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: Wallet,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/5',
    },
    {
      label: isAr ? 'النقد المتاح' : 'AVAILABLE_CASH',
      value: `$${(balance?.availableCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-slate-100',
      bg: 'bg-slate-100/5',
    },
    {
      label: isAr ? 'الأرباح غير المحققة' : 'UNREALIZED_PNL',
      value: `${(balance?.unrealizedPnl || 0) >= 0 ? '+' : ''}${(balance?.unrealizedPnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: (balance?.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
      bg: (balance?.unrealizedPnl || 0) >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5',
    },
    {
      label: isAr ? 'مستوى الهامش' : 'MARGIN_LEVEL',
      value: `${(balance?.marginLevel || 0).toFixed(1)}x`,
      icon: ShieldCheck,
      color: 'text-purple-400',
      bg: 'bg-purple-500/5',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" dir={isAr ? 'rtl' : 'ltr'}>
      {metrics.map((m, i) => (
        <div
          key={i}
          className="bg-[#0a0f1d] border border-white/5 p-4 rounded-3xl flex items-center gap-3 group hover:border-white/10 transition-all shadow-lg gpu-accelerated"
        >
          <div className={`p-2.5 rounded-2xl ${m.bg} ${m.color} transition-transform group-hover:scale-105 shrink-0`}>
            <m.icon className="w-5 h-5" />
          </div>
          <div className={`min-w-0 overflow-hidden ${isAr ? 'text-right' : 'text-left'}`}>
            <p className="text-[clamp(8px,2vw,9px)] font-black text-slate-500 uppercase tracking-wider mb-0.5 truncate">{m.label}</p>
            <p className={`text-[clamp(14px,4vw,16px)] font-black font-mono tracking-tight ${m.color} truncate`}>{m.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
});
