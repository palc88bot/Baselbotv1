/**
 * Basel AlgoCore Navigation Rail
 * Kinetic Tab Navigator with Sliding Glow Indicator and Vertical Desktop Mode
 */

import React from 'react';

interface NexusRailProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  lang: 'ar' | 'en';
}

export const NexusRail: React.FC<NexusRailProps> = React.memo(({
  activeTab,
  onSelectTab,
  lang,
}) => {
  const isAr = lang === 'ar';

  const tabs = [
    { id: 'core', nameEn: 'CORE', nameAr: 'النواة' },
    { id: 'strategy', nameEn: 'STRATEGY', nameAr: 'الاستراتيجية' },
    { id: 'signals', nameEn: 'SIGNALS', nameAr: 'الإشارات' },
    { id: 'terminal', nameEn: 'TERMINAL', nameAr: 'المنصة' },
    { id: 'quantum', nameEn: 'QUANTUM', nameAr: 'المحسن الكمي' },
    { id: 'risk', nameEn: 'RISK', nameAr: 'المخاطر' },
    { id: 'backtest', nameEn: 'BACKTEST', nameAr: 'الاختبار' },
    { id: 'logs', nameEn: 'LOGS', nameAr: 'السجلات' },
  ];

  return (
    <aside 
      className="flex flex-row md:flex-col gap-1.5 relative w-full md:w-14 overflow-x-auto md:overflow-x-visible no-scrollbar shrink-0" 
      role="tablist" 
      aria-label="Primary Navigation"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {tabs.map((tab) => {
        const isSelected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectTab(tab.id)}
            className={`relative flex-1 md:flex-initial flex items-center justify-center p-2.5 md:py-3 md:px-1 rounded-xl font-mono text-[9px] sm:text-xs tracking-widest uppercase transition-all duration-300 cursor-pointer min-h-[38px] shrink-0 whitespace-nowrap ${
              isSelected
                ? 'text-[var(--cyan)] border border-[var(--stroke-2)] bg-[rgba(var(--accent-rgb),0.08)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.15)] font-bold'
                : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            {/* Active Glow Pill */}
            {isSelected && (
              <span className="absolute md:top-2 md:bottom-2 md:left-0 top-0 left-2 right-2 md:right-auto md:w-[2px] h-[2px] md:h-auto bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)] rounded-full" />
            )}

            <span className={`block md:[writing-mode:vertical-rl] ${isAr ? 'md:rotate-0' : 'md:rotate-180'} whitespace-nowrap`}>
              {isAr ? tab.nameAr : tab.nameEn}
            </span>
          </button>
        );
      })}
    </aside>
  );
});
