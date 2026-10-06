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
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            {isAr ? 'أصول التداول المباشرة (Binance WebSocket)' : 'Live Binance Streams'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-cyan-400">
          {markets.length} {isAr ? 'أزواج نشطة' : 'Active Pairs'}
        </span>
      </div>

      {/* Mobile Horizontal Snap-Scroll + Desktop/Tablet Grid */}
      <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3 overflow-x-auto pb-2 md:pb-0 scrollbar-none snap-x snap-mandatory touch-pan-x -mx-1 px-1">
        {markets.map((asset) => {
          const isSelected = asset.symbol === selectedSymbol;
          const isUp = asset.change24h >= 0;

          return (
            <button
              key={asset.symbol}
              type="button"
              onClick={() => onSelectSymbol(asset)}
              className={`min-w-[155px] sm:min-w-[170px] md:min-w-0 p-3 rounded-xl border text-left rtl:text-right transition-all cursor-pointer relative overflow-hidden group snap-start shrink-0 md:shrink ${
                isSelected
                  ? 'bg-slate-900/90 border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/30'
                  : 'bg-slate-950/60 border-white/5 hover:border-cyan-500/30 hover:bg-slate-900/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 to-emerald-400" />
              )}

              <div className="flex items-center justify-between pb-1">
                <span className="font-mono text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                  {asset.symbol}
                </span>
                <span
                  className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded tabular-nums ${
                    isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                  }`}
                >
                  {isUp ? '+' : ''}{asset.change24h}%
                </span>
              </div>

              <div className="font-mono font-bold text-xs sm:text-sm text-cyan-400 tracking-wide mt-1 tabular-nums">
                ${asset.price > 0 ? (asset.price >= 1000 ? asset.price.toLocaleString(undefined, { maximumFractionDigits: 1 }) : asset.price.toFixed(5)) : '...'}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5 pt-1.5 border-t border-white/5">
                <span>RSI: <b className="text-slate-200 tabular-nums">{asset.rsi}</b></span>
                <span className="text-slate-400 truncate max-w-[65px]">{asset.volume.replace(' USDT', '')}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
