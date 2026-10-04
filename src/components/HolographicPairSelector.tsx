/**
 * HolographicPairSelector
 * Futuristic horizontal and drawer pair selector with glowing neon cards,
 * volumetric lighting effects, and Binance live real-time price tickers.
 */

import React from 'react';
import { Sparkles, TrendingUp, TrendingDown, Radio } from 'lucide-react';

export interface HolographicAsset {
  symbol: string;
  binanceSymbol: string;
  nameEn: string;
  nameAr: string;
  price: number;
  change24h: number;
  volume: string;
  rsi: number;
  high24h: number;
  low24h: number;
  status: 'BULLISH' | 'BEARISH' | 'ACCUMULATION';
}

interface HolographicPairSelectorProps {
  markets: HolographicAsset[];
  selectedSymbol: string;
  onSelectSymbol: (asset: HolographicAsset) => void;
  lang: 'ar' | 'en';
}

export const HolographicPairSelector: React.FC<HolographicPairSelectorProps> = ({
  markets,
  selectedSymbol,
  onSelectSymbol,
  lang,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between pb-2 mb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[var(--cyan)] animate-pulse" />
          <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
            {isAr ? 'أصول التداول الحية المتاحة (Binance WebSocket)' : 'Live Hologram Target Pairs'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[var(--cyan)]">
          {markets.length} {isAr ? 'أزواج نشطة' : 'Active Streams'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {markets.map((asset) => {
          const isSelected = asset.symbol === selectedSymbol;
          const isUp = asset.change24h >= 0;

          return (
            <button
              key={asset.symbol}
              type="button"
              onClick={() => onSelectSymbol(asset)}
              className={`p-3 rounded-xl border text-left rtl:text-right transition-all cursor-pointer relative overflow-hidden group holo-card-hover ${
                isSelected
                  ? 'holo-panel neon-border-cyan shadow-[0_0_20px_rgba(0,243,255,0.35)]'
                  : 'bg-[rgba(6,12,24,0.5)] border-white/10 hover:border-[rgba(0,243,255,0.3)] hover:bg-[rgba(10,20,40,0.6)]'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--cyan)] to-[var(--magenta)] shadow-[0_0_8px_var(--cyan)]" />
              )}

              <div className="flex items-center justify-between pb-1">
                <span className="font-mono text-xs font-bold text-white group-hover:text-[var(--cyan)] transition-colors">
                  {asset.symbol}
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                    isUp ? 'text-[var(--lime)] bg-emerald-500/10' : 'text-[var(--magenta)] bg-rose-500/10'
                  }`}
                >
                  {isUp ? '+' : ''}{asset.change24h}%
                </span>
              </div>

              <div className="font-mono font-bold text-xs sm:text-sm text-[var(--cyan)] tracking-wide mt-1">
                ${asset.price > 0 ? (asset.price >= 1000 ? asset.price.toLocaleString(undefined, { maximumFractionDigits: 1 }) : asset.price.toFixed(5)) : '...'}
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono text-[var(--muted)] mt-1.5 pt-1.5 border-t border-white/5">
                <span>RSI: <b className="text-white">{asset.rsi}</b></span>
                <span className="text-[var(--magenta)]">{asset.volume.replace(' USDT', '')}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
