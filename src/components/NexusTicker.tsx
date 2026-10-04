/**
 * Basel AlgoCore Live Market Ticker Ribbon
 * Seamless Continuous Rolling Feed with Polarity Color Coding
 */

import React from 'react';

interface NexusTickerProps {
  lang: 'ar' | 'en';
}

export const NexusTicker: React.FC<NexusTickerProps> = React.memo(({ lang }) => {
  const isAr = lang === 'ar';

  const tickerData = [
    { s: 'BTC', c: '+2.41%', d: 'up' },
    { s: 'ETH', c: '+1.18%', d: 'up' },
    { s: 'SOL', c: '-0.62%', d: 'dn' },
    { s: 'XRP', c: '+0.88%', d: 'up' },
    { s: 'ADA', c: '+3.12%', d: 'up' },
    { s: 'AVAX', c: '-1.04%', d: 'dn' },
    { s: 'DOGE', c: '+1.82%', d: 'up' },
    { s: 'LINK', c: '+0.44%', d: 'up' },
    { s: 'MATIC', c: '-0.28%', d: 'dn' },
    { s: 'DOT', c: '+1.55%', d: 'up' },
    { s: 'ATOM', c: '+0.96%', d: 'up' },
    { s: 'UNI', c: '-0.71%', d: 'dn' },
  ];

  return (
    <div 
      className="relative z-10 my-3 sm:my-4 border border-[var(--stroke)] rounded-full bg-[rgba(6,10,18,0.7)] overflow-hidden h-9 flex items-center shadow-lg"
      style={{
        maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)',
      }}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="font-mono text-[8px] sm:text-[9px] tracking-widest text-[var(--cyan)] px-3 sm:px-4 border-r border-[var(--stroke)] z-10 bg-[rgba(6,10,18,0.95)] h-full flex items-center shrink-0 font-bold">
        {isAr ? 'الأسواق' : 'MARKET'}
      </div>

      <div className="flex whitespace-nowrap animate-[tickerRoll_60s_linear_infinite] font-mono text-[10px] sm:text-[11px] shrink-0">
        {[...tickerData, ...tickerData, ...tickerData].map((t, idx) => (
          <span key={idx} className="px-4 tracking-wider inline-flex items-center gap-1.5 text-[var(--text-2)] border-r border-[rgba(120,190,255,0.05)]">
            <b className="text-[var(--text)] font-bold">{t.s}</b>
            <span className={t.d === 'up' ? 'text-[var(--lime)] font-bold' : 'text-[var(--magenta)] font-bold'}>
              {t.c}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
});
