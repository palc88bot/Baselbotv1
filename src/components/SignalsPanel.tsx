/**
 * Basel AlgoCore Signals Panel
 * High-Frequency Signals Stream with Mini Sparklines, Confidence Bars & Live Badges
 */

import React, { useEffect, useRef } from 'react';
import { TradingSignal } from '../domain/types';

interface SignalsPanelProps {
  signals: TradingSignal[];
  activeCount?: number;
  lang: 'ar' | 'en';
}

const SparklineCanvas: React.FC<{ action: string; prices?: number[] }> = ({ action, prices = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 50;
    const h = 22;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const priceList = prices.length >= 2 ? prices : [100, 102, 99, 104, 103, 107, 106, 110];
    const min = Math.min(...priceList);
    const max = Math.max(...priceList);
    const range = max - min || 1;

    const styles = getComputedStyle(document.documentElement);
    const col = action === 'BUY' ? styles.getPropertyValue('--lime').trim() || '#b6ff2e'
      : action === 'SELL' ? styles.getPropertyValue('--magenta').trim() || '#ff2e88'
      : styles.getPropertyValue('--amber').trim() || '#ffb547';

    ctx.beginPath();
    priceList.forEach((p, i) => {
      const x = (i / (priceList.length - 1)) * w;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [action, prices]);

  return <canvas ref={canvasRef} className="w-[50px] h-[22px] block opacity-90" aria-hidden="true" />;
};

export const SignalsPanel: React.FC<SignalsPanelProps> = React.memo(({
  signals = [],
  activeCount = 14,
  lang,
}) => {
  const isAr = lang === 'ar';

  const defaultSignals = [
    { symbol: 'BTC/USDT', action: 'BUY', price: 67241.80, conf: 92, digits: 2 },
    { symbol: 'ETH/USDT', action: 'SELL', price: 3412.55, conf: 78, digits: 2 },
    { symbol: 'SOL/USDT', action: 'BUY', price: 182.40, conf: 85, digits: 2 },
    { symbol: 'XRP/USDT', action: 'HOLD', price: 0.6271, conf: 61, digits: 4 },
    { symbol: 'ADA/USDT', action: 'BUY', price: 0.4820, conf: 74, digits: 4 },
    { symbol: 'AVAX/USDT', action: 'SELL', price: 38.92, conf: 69, digits: 2 },
  ];

  const displayList = signals.length > 0 ? signals.map(s => ({
    symbol: s.symbol,
    action: s.type.includes('BUY') ? 'BUY' : s.type.includes('SELL') ? 'SELL' : 'HOLD',
    price: 68000,
    conf: Math.round(((s as any).confidence || 0.85) * 100),
    digits: 2,
  })) : defaultSignals;

  return (
    <div 
      id="signalsPanel" 
      role="tabpanel"
      className="border border-[var(--stroke)] rounded-[var(--rad-lg)] bg-gradient-to-b from-[rgba(8,12,22,0.6)] to-[rgba(4,6,12,0.8)] overflow-hidden flex flex-col shadow-xl breathe-panel"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Head */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-[var(--stroke)] font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-[var(--cyan)] flex items-center justify-between">
        <span className="font-bold">{isAr ? 'الإشارات الخوارزمية' : 'SIGNALS'}</span>
        <span className="text-[var(--text-3)]">
          <b className="text-[var(--lime)] font-bold">{displayList.length || activeCount}</b> {isAr ? 'نشط' : 'ACTIVE'}
        </span>
      </div>

      {/* Signal List */}
      <div className="flex flex-col overflow-y-auto max-h-[380px] no-scrollbar divide-y divide-[rgba(120,190,255,0.06)]">
        {displayList.map((sig, idx) => (
          <div key={idx} className="p-3 grid grid-cols-[1fr_50px_auto] gap-2 items-center font-mono text-xs hover:bg-white/[0.02] transition-colors">
            <div>
              <div className="font-bold text-[var(--text)] tracking-wider">{sig.symbol}</div>
              <div className="text-[10px] text-[var(--text-2)]">${sig.price.toFixed(sig.digits)}</div>
            </div>

            <div>
              <SparklineCanvas action={sig.action} />
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className={`text-[8px] tracking-wider px-2 py-0.5 rounded font-bold uppercase ${
                sig.action === 'BUY'
                  ? 'text-[var(--lime)] bg-[rgba(var(--accent-2-rgb),0.08)] border border-[rgba(var(--accent-2-rgb),0.25)]'
                  : sig.action === 'SELL'
                  ? 'text-[var(--magenta)] bg-[rgba(255,46,136,0.08)] border border-[rgba(255,46,136,0.25)]'
                  : 'text-[var(--amber)] bg-[rgba(255,181,71,0.08)] border border-[rgba(255,181,71,0.25)]'
              }`}>
                {sig.action === 'BUY' ? (isAr ? 'شراء' : 'BUY') : sig.action === 'SELL' ? (isAr ? 'بيع' : 'SELL') : (isAr ? 'احتفاظ' : 'HOLD')}
              </span>
              
              <div className="flex items-center gap-1 text-[8px] text-[var(--text-3)]">
                <span>{isAr ? 'ثقة' : 'CONF'}</span>
                <div className="w-10 h-[2px] bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--cyan)]" style={{ width: `${sig.conf}%` }} />
                </div>
                <span>{sig.conf}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
