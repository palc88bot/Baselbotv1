/**
 * HolographicDataVizChart
 * Immersive 3D data visualization chart with neon cyan & magenta glowing gradient,
 * area volumetric fill, real-time depth perspective, and real orderbook flow.
 * 100% Real-Time Data (Calculated strictly from live Binance klines and orderbook depth).
 */

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export interface RealChartPoint {
  time: string;
  price: number;
  depthCyan: number;
  depthMagenta: number;
}

interface HolographicDataVizChartProps {
  symbol: string;
  currentPrice: number;
  chartData: RealChartPoint[];
  orderBook?: {
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
    imbalance?: number;
  } | null;
  lang: 'ar' | 'en';
}

export const HolographicDataVizChart: React.FC<HolographicDataVizChartProps> = ({
  symbol,
  currentPrice,
  chartData,
  orderBook,
  lang,
}) => {
  const isAr = lang === 'ar';

  // Calculate real bid/ask depth volume from live orderbook if available
  const totalBidsQty = orderBook?.bids?.reduce((acc, b) => acc + (b.quantity * b.price), 0) || 0;
  const totalAsksQty = orderBook?.asks?.reduce((acc, a) => acc + (a.quantity * a.price), 0) || 0;
  const totalDepthNotional = totalBidsQty + totalAsksQty;
  
  const realImbalancePct = orderBook && orderBook.imbalance !== undefined
    ? Number((orderBook.imbalance * 100).toFixed(1))
    : (totalDepthNotional > 0 ? Number((((totalBidsQty - totalAsksQty) / totalDepthNotional) * 100).toFixed(1)) : 0);

  // If chartData hasn't arrived yet from live stream, show single current live point
  const displayData = chartData && chartData.length > 0
    ? chartData
    : (currentPrice > 0 ? [{ time: 'Now', price: currentPrice, depthCyan: 1, depthMagenta: 1 }] : []);

  const minPrice = displayData.length > 0 ? Math.min(...displayData.map((d) => d.price)) : 0;
  const maxPrice = displayData.length > 0 ? Math.max(...displayData.map((d) => d.price)) : 0;
  const yDomainPadding = (maxPrice - minPrice) * 0.1 || 1;

  return (
    <div className="w-full h-full flex flex-col p-4 sm:p-5 holo-panel rounded-2xl border border-[rgba(0,243,255,0.25)] relative overflow-hidden group">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-[rgba(0,243,255,0.15)]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)] animate-pulse" />
          <h3 className="font-mono text-xs sm:text-sm font-bold text-white tracking-wider uppercase">
            {isAr ? 'مخطط الأسعار والعمق اللحظي (بايننس مباشر)' : 'Live Binance Real-Time Kline & Depth'}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--cyan)]">
            <span className="w-2 h-2 rounded-sm bg-[var(--cyan)] shadow-[0_0_6px_var(--cyan)]" />
            {isAr ? 'سعر التنفيذ الفعلي' : 'Live Kline'}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--magenta)]">
            <span className="w-2 h-2 rounded-sm bg-[var(--magenta)] shadow-[0_0_6px_var(--magenta)]" />
            {isAr ? 'حجم الصفقات' : 'Live Volume'}
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[220px] sm:h-[260px] relative">
        {displayData.length === 0 ? (
          <div className="h-full flex items-center justify-center font-mono text-xs text-[var(--muted)]">
            {isAr ? 'جاري استقبال تدفق الشموع الحية من بايننس...' : 'Connecting to live Binance kline stream...'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {/* Cyan Volumetric Glow */}
                <linearGradient id="cyanHoloGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f3ff" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#00f3ff" stopOpacity={0.0} />
                </linearGradient>

                {/* Magenta Volumetric Glow */}
                <linearGradient id="magentaHoloGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff007f" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#ff007f" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 243, 255, 0.08)" vertical={false} />
              <XAxis dataKey="time" stroke="#414d66" tick={{ fill: '#8b9bb4', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis
                domain={[minPrice - yDomainPadding, maxPrice + yDomainPadding]}
                stroke="#414d66"
                tick={{ fill: '#8b9bb4', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => (val >= 1000 ? val.toLocaleString(undefined, { maximumFractionDigits: 1 }) : val.toFixed(4))}
              />
              
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as RealChartPoint;
                    return (
                      <div className="p-3 rounded-xl holo-panel border border-[var(--cyan)] shadow-[0_0_20px_rgba(0,243,255,0.4)] backdrop-blur-2xl font-mono text-xs space-y-1">
                        <div className="text-[var(--cyan)] font-bold">{symbol} · {data.time}</div>
                        <div className="text-white">{isAr ? 'السعر الحي:' : 'Price:'} <b className="text-[var(--cyan)]">${data.price.toLocaleString()}</b></div>
                        {data.depthCyan > 0 && (
                          <div className="text-[10px] text-[var(--magenta)]">
                            {isAr ? 'الحجم الفعلي:' : 'Volume:'} {data.depthCyan.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Area
                type="monotone"
                dataKey="price"
                stroke="#00f3ff"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#cyanHoloGlow)"
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="depthCyan"
                stroke="#ff007f"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fillOpacity={0.25}
                fill="url(#magentaHoloGlow)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Real-Time Metrics */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[rgba(0,243,255,0.1)] text-center font-mono">
        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
          <span className="text-[9px] text-[var(--muted)] uppercase block">{isAr ? 'عدم توازن دفتر الأوامر' : 'Order Imbalance'}</span>
          <span className={`text-xs font-bold ${realImbalancePct >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}`}>
            {realImbalancePct >= 0 ? '+' : ''}{realImbalancePct}%
          </span>
        </div>
        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
          <span className="text-[9px] text-[var(--muted)] uppercase block">{isAr ? 'عمق طلبات الشراء' : 'Bid Depth'}</span>
          <span className="text-xs font-bold text-[var(--cyan)]">
            {totalBidsQty > 0 ? (totalBidsQty >= 1e6 ? `$${(totalBidsQty / 1e6).toFixed(2)}M` : `$${(totalBidsQty / 1e3).toFixed(1)}K`) : '---'}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
          <span className="text-[9px] text-[var(--muted)] uppercase block">{isAr ? 'عمق عروض البيع' : 'Ask Depth'}</span>
          <span className="text-xs font-bold text-[var(--magenta)]">
            {totalAsksQty > 0 ? (totalAsksQty >= 1e6 ? `$${(totalAsksQty / 1e6).toFixed(2)}M` : `$${(totalAsksQty / 1e3).toFixed(1)}K`) : '---'}
          </span>
        </div>
      </div>
    </div>
  );
};
