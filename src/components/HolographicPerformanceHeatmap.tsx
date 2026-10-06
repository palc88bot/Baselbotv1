/**
 * HolographicPerformanceHeatmap.tsx
 * ====================================================================
 * Cyberpunk Performance & Profitability Heatmap Widget
 * ====================================================================
 * Analyzes existing order history and live positions across all traded
 * symbols over the last 24 hours. Visualizes profitability intensity,
 * win rates, volume, and trade density with responsive neon aesthetics.
 * ====================================================================
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Filter,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  Info
} from 'lucide-react';
import { CompletedOrder, LivePosition } from './HolographicTradeHistory';
import { HolographicAsset } from './HolographicPairSelector';

export interface SymbolPerformanceMetrics {
  symbol: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalVolume: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
  lastTradeTimestamp: number;
  hasOpenPosition: boolean;
  intensityLevel: -3 | -2 | -1 | 0 | 1 | 2 | 3;
}

interface HolographicPerformanceHeatmapProps {
  orders?: CompletedOrder[];
  positions?: LivePosition[];
  markets?: HolographicAsset[];
  selectedSymbol?: string;
  onSelectSymbol?: (asset: HolographicAsset) => void;
  lang: 'ar' | 'en';
  playTone?: (freq?: number, duration?: number) => void;
}

export const HolographicPerformanceHeatmap: React.FC<HolographicPerformanceHeatmapProps> = ({
  orders: propOrders,
  positions: propPositions,
  markets = [],
  selectedSymbol,
  onSelectSymbol,
  lang,
  playTone
}) => {
  const isAr = lang === 'ar';

  const [orders, setOrders] = useState<CompletedOrder[]>(propOrders || []);
  const [positions, setPositions] = useState<LivePosition[]>(propPositions || []);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | 'all'>('24h');
  const [sortBy, setSortBy] = useState<'profit' | 'trades' | 'winrate' | 'volume'>('profit');
  const [selectedHeatmapSymbol, setSelectedHeatmapSymbol] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync prop changes
  useEffect(() => {
    if (propOrders && propOrders.length > 0) setOrders(propOrders);
  }, [propOrders]);

  useEffect(() => {
    if (propPositions) setPositions(propPositions);
  }, [propPositions]);

  // Fetch fresh order history & live positions if not provided via props
  const fetchOrderHistory = async () => {
    setIsLoading(true);
    try {
      const [orderRes, statusRes] = await Promise.all([
        fetch('/api/protected/order-history'),
        fetch('/api/live-status')
      ]);

      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (orderData.success && Array.isArray(orderData.orders)) {
          setOrders(orderData.orders);
        } else if (Array.isArray(orderData)) {
          setOrders(orderData);
        }
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (Array.isArray(statusData.positions)) {
          setPositions(statusData.positions);
        }
      }
    } catch (err) {
      console.warn('Heatmap history fetch notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderHistory();
    const interval = setInterval(fetchOrderHistory, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, []);

  // Compute Performance Heatmap Metrics
  const { metricsList, overallStats } = useMemo(() => {
    const now = Date.now();
    const timeLimit = timeRange === '24h'
      ? now - 24 * 60 * 60 * 1000
      : timeRange === '7d'
      ? now - 7 * 24 * 60 * 60 * 1000
      : 0;

    // Filter orders by time window
    const relevantOrders = orders.filter(o => {
      const t = o.timestamp || o.updatedAt || 0;
      return t >= timeLimit;
    });

    // Map open positions
    const openPosMap = new Map<string, LivePosition>();
    positions.forEach(p => openPosMap.set(p.symbol, p));

    // Collect all unique symbols from orders, positions, and active markets
    const symbolSet = new Set<string>();
    relevantOrders.forEach(o => symbolSet.add(o.symbol));
    positions.forEach(p => symbolSet.add(p.symbol));
    markets.forEach(m => symbolSet.add(m.symbol));

    const symbolMetricsMap = new Map<string, SymbolPerformanceMetrics>();

    symbolSet.forEach(symbol => {
      const symbolOrders = relevantOrders.filter(o => o.symbol === symbol);
      const openPos = openPosMap.get(symbol);

      let realizedPnl = 0;
      let totalVolume = 0;
      let winningTrades = 0;
      let losingTrades = 0;
      let bestTrade = -Infinity;
      let worstTrade = Infinity;
      let lastTradeTime = 0;

      symbolOrders.forEach(o => {
        const pnl = Number((o as any).pnl) || 0;
        const vol = (o.filledQuantity || o.quantity || 0) * (o.avgFillPrice || o.price || 0);
        totalVolume += vol;
        realizedPnl += pnl;

        if (pnl > 0) winningTrades += 1;
        else if (pnl < 0) losingTrades += 1;

        if (pnl > bestTrade) bestTrade = pnl;
        if (pnl < worstTrade) worstTrade = pnl;

        const t = o.timestamp || o.updatedAt || 0;
        if (t > lastTradeTime) lastTradeTime = t;
      });

      const unrealizedPnl = openPos ? (openPos.unrealizedPnl || 0) : 0;
      const totalPnl = Number((realizedPnl + unrealizedPnl).toFixed(2));
      const tradeCount = symbolOrders.length;
      const winRate = tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0;
      const avgPnl = tradeCount > 0 ? realizedPnl / tradeCount : 0;

      // Assign intensity level: -3 (heavy loss) to +3 (heavy profit)
      let intensityLevel: -3 | -2 | -1 | 0 | 1 | 2 | 3 = 0;
      if (totalPnl >= 10.0) intensityLevel = 3;
      else if (totalPnl >= 3.0) intensityLevel = 2;
      else if (totalPnl > 0.1) intensityLevel = 1;
      else if (totalPnl <= -10.0) intensityLevel = -3;
      else if (totalPnl <= -3.0) intensityLevel = -2;
      else if (totalPnl < -0.1) intensityLevel = -1;
      else intensityLevel = 0;

      symbolMetricsMap.set(symbol, {
        symbol,
        totalPnl,
        realizedPnl: Number(realizedPnl.toFixed(2)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
        tradeCount,
        winningTrades,
        losingTrades,
        winRate: Number(winRate.toFixed(1)),
        totalVolume: Number(totalVolume.toFixed(2)),
        avgPnl: Number(avgPnl.toFixed(2)),
        bestTrade: bestTrade === -Infinity ? 0 : Number(bestTrade.toFixed(2)),
        worstTrade: worstTrade === Infinity ? 0 : Number(worstTrade.toFixed(2)),
        lastTradeTimestamp: lastTradeTime,
        hasOpenPosition: !!openPos,
        intensityLevel
      });
    });

    let list = Array.from(symbolMetricsMap.values());

    // Sort list
    if (sortBy === 'profit') {
      list.sort((a, b) => b.totalPnl - a.totalPnl);
    } else if (sortBy === 'trades') {
      list.sort((a, b) => b.tradeCount - a.tradeCount);
    } else if (sortBy === 'winrate') {
      list.sort((a, b) => b.winRate - a.winRate);
    } else if (sortBy === 'volume') {
      list.sort((a, b) => b.totalVolume - a.totalVolume);
    }

    // Overall aggregate stats
    const totalPnlAll = list.reduce((acc, m) => acc + m.totalPnl, 0);
    const totalVolumeAll = list.reduce((acc, m) => acc + m.totalVolume, 0);
    const totalTradesAll = list.reduce((acc, m) => acc + m.tradeCount, 0);
    const totalWinsAll = list.reduce((acc, m) => acc + m.winningTrades, 0);
    const overallWinRate = totalTradesAll > 0 ? (totalWinsAll / totalTradesAll) * 100 : 0;
    const topPerformer = list.length > 0 ? list[0] : null;

    return {
      metricsList: list,
      overallStats: {
        totalPnl: Number(totalPnlAll.toFixed(2)),
        totalVolume: Number(totalVolumeAll.toFixed(2)),
        totalTrades: totalTradesAll,
        overallWinRate: Number(overallWinRate.toFixed(1)),
        topPerformer
      }
    };
  }, [orders, positions, markets, timeRange, sortBy]);

  const selectedMetrics = useMemo(() => {
    return metricsList.find(m => m.symbol === selectedHeatmapSymbol) || null;
  }, [metricsList, selectedHeatmapSymbol]);

  // Color styles based on intensity level
  const getIntensityStyles = (level: number, isSelected: boolean) => {
    switch (level) {
      case 3:
        return {
          bg: 'bg-emerald-500/25',
          border: isSelected ? 'border-emerald-300 ring-2 ring-emerald-400' : 'border-emerald-400/70',
          glow: 'shadow-[0_0_20px_rgba(16,185,129,0.35)]',
          text: 'text-emerald-300',
          barColor: 'bg-emerald-400',
          badgeBg: 'bg-emerald-500/30 text-emerald-200'
        };
      case 2:
        return {
          bg: 'bg-emerald-500/15',
          border: isSelected ? 'border-emerald-400 ring-2 ring-emerald-500' : 'border-emerald-500/40',
          glow: 'shadow-[0_0_12px_rgba(16,185,129,0.2)]',
          text: 'text-emerald-400',
          barColor: 'bg-emerald-500',
          badgeBg: 'bg-emerald-500/20 text-emerald-300'
        };
      case 1:
        return {
          bg: 'bg-cyan-500/15',
          border: isSelected ? 'border-cyan-300 ring-2 ring-cyan-400' : 'border-cyan-400/40',
          glow: 'shadow-[0_0_10px_rgba(0,243,255,0.2)]',
          text: 'text-cyan-300',
          barColor: 'bg-cyan-400',
          badgeBg: 'bg-cyan-500/20 text-cyan-200'
        };
      case -1:
        return {
          bg: 'bg-amber-500/15',
          border: isSelected ? 'border-amber-300 ring-2 ring-amber-400' : 'border-amber-500/40',
          glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]',
          text: 'text-amber-400',
          barColor: 'bg-amber-500',
          badgeBg: 'bg-amber-500/20 text-amber-200'
        };
      case -2:
        return {
          bg: 'bg-rose-500/15',
          border: isSelected ? 'border-rose-400 ring-2 ring-rose-500' : 'border-rose-500/50',
          glow: 'shadow-[0_0_12px_rgba(244,63,94,0.25)]',
          text: 'text-rose-400',
          barColor: 'bg-rose-500',
          badgeBg: 'bg-rose-500/20 text-rose-300'
        };
      case -3:
        return {
          bg: 'bg-rose-600/25',
          border: isSelected ? 'border-rose-300 ring-2 ring-rose-400' : 'border-rose-400/80',
          glow: 'shadow-[0_0_20px_rgba(255,0,127,0.35)]',
          text: 'text-rose-300',
          barColor: 'bg-rose-400',
          badgeBg: 'bg-rose-500/30 text-rose-100'
        };
      default: // 0 - Neutral
        return {
          bg: 'bg-slate-900/60',
          border: isSelected ? 'border-cyan-400' : 'border-white/10',
          glow: '',
          text: 'text-slate-300',
          barColor: 'bg-slate-500',
          badgeBg: 'bg-white/10 text-slate-300'
        };
    }
  };

  const handleTileClick = (m: SymbolPerformanceMetrics) => {
    if (playTone) playTone(700, 0.05);
    setSelectedHeatmapSymbol(selectedHeatmapSymbol === m.symbol ? null : m.symbol);

    // If an asset matches this symbol, trigger onSelectSymbol to focus the main dashboard
    if (onSelectSymbol) {
      const targetAsset = markets.find(item => item.symbol === m.symbol);
      if (targetAsset) {
        onSelectSymbol(targetAsset);
      }
    }
  };

  return (
    <div className="holo-panel rounded-2xl p-4 sm:p-5 border border-cyan-500/30 shadow-2xl relative overflow-hidden bg-gradient-to-br from-black/90 via-[#030816] to-black/90 space-y-4">
      {/* 🌟 Header & Controls Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,243,255,0.3)]">
            <Flame className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>{isAr ? 'خريطة الأداء والكثافة الربحية' : 'Performance Profitability Heatmap'}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {timeRange === '24h' ? (isAr ? 'آخر 24 ساعة' : '24H Window') : timeRange === '7d' ? (isAr ? 'آخر 7 أيام' : '7D Window') : (isAr ? 'كافة الفترات' : 'All Time')}
                </span>
              </h3>
            </div>
            <p className="text-[11px] font-mono text-[var(--muted)]">
              {isAr
                ? 'تحليل كثافة الأرباح المحققة، حجم التداول، ومعدل النجاح لجميع العملات المتداولة'
                : 'Real-time profitability intensity, trading density, and win rate across all traded assets'}
            </p>
          </div>
        </div>

        {/* Filter Controls: Timeframe & Sort */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-black/60 p-1 rounded-xl border border-white/10 text-xs font-mono">
            {[
              { id: '24h', label: isAr ? '24 ساعة' : '24H' },
              { id: '7d', label: isAr ? '7 أيام' : '7D' },
              { id: 'all', label: isAr ? 'الكل' : 'ALL' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTimeRange(t.id as any);
                  if (playTone) playTone(550, 0.05);
                }}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  timeRange === t.id
                    ? 'bg-cyan-500/25 text-cyan-200 font-bold border border-cyan-400/40 shadow-[0_0_8px_rgba(0,243,255,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center bg-black/60 p-1 rounded-xl border border-white/10 text-xs font-mono">
            <span className="text-[10px] text-gray-400 px-1.5 hidden sm:inline">
              <SlidersHorizontal className="w-3 h-3 inline mr-1" />
              {isAr ? 'ترتيب:' : 'Sort:'}
            </span>
            {[
              { id: 'profit', label: isAr ? 'الأرباح' : 'PnL' },
              { id: 'trades', label: isAr ? 'الصفقات' : 'Trades' },
              { id: 'winrate', label: isAr ? 'النجاح' : 'Win%' },
              { id: 'volume', label: isAr ? 'الحجم' : 'Vol' }
            ].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSortBy(s.id as any);
                  if (playTone) playTone(650, 0.05);
                }}
                className={`px-2 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                  sortBy === s.id
                    ? 'bg-white/15 text-white font-bold border border-white/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchOrderHistory}
            className="p-1.5 rounded-xl bg-black/50 border border-white/10 hover:border-cyan-400 text-gray-300 hover:text-cyan-300 transition cursor-pointer"
            title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 📊 Aggregate Performance Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
        <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <span className="text-[10px] text-[var(--muted)] uppercase block">
            {isAr ? 'صافي أرباح الفترة' : 'Window Net PnL'}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-base sm:text-lg font-bold ${overallStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {overallStats.totalPnl >= 0 ? '+' : ''}${overallStats.totalPnl.toFixed(2)}
            </span>
            <span className="text-[10px] text-[var(--muted)]">USDT</span>
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <span className="text-[10px] text-[var(--muted)] uppercase block">
            {isAr ? 'أفضل عملة أداءً' : 'Top Performer'}
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm sm:text-base font-bold text-white">
              {overallStats.topPerformer?.symbol || '---'}
            </span>
            {overallStats.topPerformer && (
              <span className={`text-[10px] font-bold ${overallStats.topPerformer.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overallStats.topPerformer.totalPnl >= 0 ? '+' : ''}${overallStats.topPerformer.totalPnl.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <span className="text-[10px] text-[var(--muted)] uppercase block">
            {isAr ? 'معدل الفوز الإجمالي' : 'Overall Win Rate'}
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base sm:text-lg font-bold text-cyan-300">
              {overallStats.overallWinRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-gray-400">
              ({overallStats.totalTrades} {isAr ? 'صفقة' : 'trades'})
            </span>
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-xl p-2.5 sm:p-3">
          <span className="text-[10px] text-[var(--muted)] uppercase block">
            {isAr ? 'إجمالي حجم التداول' : 'Total Traded Vol'}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-base sm:text-lg font-bold text-indigo-300">
              ${overallStats.totalVolume >= 1000 ? `${(overallStats.totalVolume / 1000).toFixed(1)}k` : overallStats.totalVolume.toFixed(0)}
            </span>
            <span className="text-[10px] text-[var(--muted)]">USDT</span>
          </div>
        </div>
      </div>

      {/* 🌡️ THE HEATMAP MATRIX GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {metricsList.map(item => {
          const isSelected = selectedHeatmapSymbol === item.symbol || selectedSymbol === item.symbol;
          const styles = getIntensityStyles(item.intensityLevel, isSelected);
          const isPositive = item.totalPnl >= 0;

          return (
            <div
              key={item.symbol}
              onClick={() => handleTileClick(item)}
              className={`p-3 rounded-xl border ${styles.bg} ${styles.border} ${styles.glow} transition-all duration-200 cursor-pointer relative overflow-hidden group hover:scale-[1.02] active:scale-[0.99] flex flex-col justify-between min-h-[110px]`}
            >
              {/* Background Intensity Flare */}
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl pointer-events-none" />

              {/* Tile Top: Symbol & Position Indicator */}
              <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-mono text-xs font-extrabold text-white tracking-wide truncate">
                    {item.symbol}
                  </span>
                </div>
                {item.hasOpenPosition && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f3ff] animate-ping shrink-0" title="Active Open Position" />
                )}
              </div>

              {/* Tile Middle: Net PnL Value */}
              <div className="my-1.5">
                <div className="flex items-baseline justify-between">
                  <span className={`font-mono text-sm sm:text-base font-extrabold ${styles.text}`}>
                    {isPositive ? '+' : ''}${item.totalPnl.toFixed(2)}
                  </span>
                  <span className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${styles.badgeBg}`}>
                    {item.intensityLevel > 0 ? `+${item.intensityLevel}` : item.intensityLevel < 0 ? `${item.intensityLevel}` : '0'} INT
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted)] mt-0.5">
                  <span>{item.tradeCount} {isAr ? 'صفقة' : 'trades'}</span>
                  <span className={item.winRate >= 50 ? 'text-emerald-400' : 'text-gray-400'}>
                    {item.winRate.toFixed(0)}% Win
                  </span>
                </div>
              </div>

              {/* Tile Bottom: Intensity Thermometer Bar */}
              <div className="w-full space-y-1">
                <div className="w-full h-1 bg-black/50 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full ${styles.barColor} transition-all duration-300`}
                    style={{
                      width: `${Math.min(100, Math.max(15, (Math.abs(item.totalPnl) / (Math.abs(overallStats.totalPnl) || 10)) * 100))}%`
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🔍 EXPANDED INSPECTOR PANEL (When a symbol tile is selected) */}
      {selectedMetrics && (
        <div className="bg-black/80 border border-cyan-400/40 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-white">{selectedMetrics.symbol}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                {isAr ? 'تحليل الأداء الفردي' : 'Asset Breakdown'}
              </span>
              {selectedMetrics.hasOpenPosition && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <Activity className="w-3 h-3 animate-pulse" />
                  {isAr ? 'مركز نشط في السوق' : 'Live Active Position'}
                </span>
              )}
            </div>

            <button
              onClick={() => setSelectedHeatmapSymbol(null)}
              className="text-xs text-gray-400 hover:text-white font-mono cursor-pointer"
            >
              {isAr ? 'إغلاق التفاصيل ✕' : 'Close ✕'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'إجمالي الأرباح:' : 'Total PnL:'}</span>
              <span className={`text-sm font-bold ${selectedMetrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {selectedMetrics.totalPnl >= 0 ? '+' : ''}${selectedMetrics.totalPnl.toFixed(2)} USDT
              </span>
            </div>

            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'أرباح محققة:' : 'Realized PnL:'}</span>
              <span className="text-sm font-bold text-white">
                {selectedMetrics.realizedPnl >= 0 ? '+' : ''}${selectedMetrics.realizedPnl.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'أرباح عائمة:' : 'Floating PnL:'}</span>
              <span className={`text-sm font-bold ${selectedMetrics.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {selectedMetrics.unrealizedPnl >= 0 ? '+' : ''}${selectedMetrics.unrealizedPnl.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'الصفقات الرابحة/الخاسرة:' : 'Wins / Losses:'}</span>
              <span className="text-sm font-bold text-white">
                <span className="text-emerald-400">{selectedMetrics.winningTrades}W</span> / <span className="text-rose-400">{selectedMetrics.losingTrades}L</span>
              </span>
            </div>

            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'أفضل صفقة:' : 'Best Trade:'}</span>
              <span className="text-sm font-bold text-emerald-400">
                +${selectedMetrics.bestTrade.toFixed(2)}
              </span>
            </div>

            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-[10px] text-[var(--muted)] block">{isAr ? 'حجم التداول:' : 'Volume:'}</span>
              <span className="text-sm font-bold text-cyan-300">
                ${selectedMetrics.totalVolume.toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ℹ️ Heatmap Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[var(--muted)] pt-2 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {isAr
              ? 'انقر على أي خلية لتحديد العملة وعرض الرسم البياني، دفتر الأوامر، وتفاصيل الأداء فورياً'
              : 'Click any tile to focus asset on live chart, orderbook depth, and execution terminal'}
          </span>
        </div>

        {/* Color Legend Bar */}
        <div className="flex items-center gap-1.5">
          <span>{isAr ? 'مقياس الكثافة الربحية:' : 'Profit Intensity Scale:'}</span>
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.2 rounded text-[8px] bg-rose-600/30 text-rose-300 border border-rose-500/50">-3</span>
            <span className="px-1.5 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40">-1</span>
            <span className="px-1.5 py-0.2 rounded text-[8px] bg-white/10 text-gray-300 border border-white/20">0</span>
            <span className="px-1.5 py-0.2 rounded text-[8px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">+1</span>
            <span className="px-1.5 py-0.2 rounded text-[8px] bg-emerald-500/30 text-emerald-300 border border-emerald-400/50">+3</span>
          </div>
        </div>
      </div>
    </div>
  );
};
