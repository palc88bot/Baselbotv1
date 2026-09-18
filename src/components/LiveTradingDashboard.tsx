/**
 * Basel Quantum Algorithmic Trading System
 * Live Trading Dashboard, L2 OrderBook Ladder, OU Mean-Reversion Chart & Execution FSM
 */

import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  Clock,
  DollarSign,
  Layers,
  Percent,
  RefreshCw,
  Send,
  Shield,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  AccountBalance,
  AssetSymbol,
  Candle,
  Order,
  OrderBook,
  Position,
  TradingSignal,
} from '../domain/types';

interface DashboardProps {
  selectedSymbol: AssetSymbol;
  orderBook?: OrderBook;
  candles: Candle[];
  features?: any;
  latestSignal?: TradingSignal | null;
  balance: AccountBalance;
  positions: Position[];
  orders: Order[];
  onManualOrder: (params: { symbol: AssetSymbol; side: 'BUY' | 'SELL'; type: any; quantity: number; price?: number }) => void;
  lang: 'ar' | 'en';
}

export const LiveTradingDashboard: React.FC<DashboardProps> = ({
  selectedSymbol,
  orderBook,
  candles,
  features,
  latestSignal,
  balance,
  positions,
  orders,
  onManualOrder,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'TWAP'>('MARKET');
  const [orderQty, setOrderQty] = useState<number>(0.1);
  const [limitPrice, setLimitPrice] = useState<number>(orderBook?.midPrice || 100);

  const currentPrice = orderBook?.midPrice || 100;
  const spread = orderBook?.spread || 0.5;
  const spreadBps = currentPrice > 0 ? (spread / currentPrice) * 10000 : 0;
  const obi = orderBook?.orderBookImbalance || 0;
  const zScore = features?.zScore || 0;
  const halfLife = features?.halfLifePeriods || 0;
  const ouMu = features?.ouMu || currentPrice;
  const ouSigma = features?.ouSigma || currentPrice * 0.01;

  // Chart data formatting
  const chartData = candles.slice(-40).map((c, i) => ({
    time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    price: c.close,
    vwap: c.vwap,
    mu: ouMu,
    upperCorridor: Number((ouMu + 2 * ouSigma).toFixed(2)),
    lowerCorridor: Number((ouMu - 2 * ouSigma).toFixed(2)),
  }));

  const activePos = positions.find((p) => p.symbol === selectedSymbol);

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    onManualOrder({
      symbol: selectedSymbol,
      side: orderSide,
      type: orderType,
      quantity: Number(orderQty),
      price: orderType === 'LIMIT' ? Number(limitPrice) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Mid Price & Microprice */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'السعر اللحظي / المجهري' : 'Mid / MicroPrice'}</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">${currentPrice.toLocaleString()}</div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>{isAr ? 'المجهري:' : 'Micro:'}</span>
            <span className="text-cyan-400 font-mono font-medium">${orderBook?.microPrice.toLocaleString() || currentPrice}</span>
          </div>
        </div>

        {/* Metric 2: Spread & OBI */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'فرق السعر (Spread)' : 'Spread & OBI'}</span>
            <Layers className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            ${spread.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">({spreadBps.toFixed(1)} bps)</span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <span className="text-slate-400">{isAr ? 'اختلال السيولة:' : 'OBI:'}</span>
            <span
              className={`font-mono font-bold ${
                obi > 0.2 ? 'text-emerald-400' : obi < -0.2 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {(obi * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Metric 3: OU Z-Score */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'انحراف Z-Score (أورنشتاين)' : 'OU Z-Score'}</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              zScore <= -1.5 ? 'text-emerald-400' : zScore >= 1.5 ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {zScore > 0 ? `+${zScore.toFixed(2)}` : zScore.toFixed(2)}σ
          </div>
          <div className="text-xs text-slate-400 mt-1">
            <span>{isAr ? 'الهدف التوازني:' : 'Equil μ:'}</span>{' '}
            <span className="text-amber-300 font-mono">${ouMu.toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 4: Mean-Reversion Half Life */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'عمر النصف للارتداد (τ)' : 'Half-Life (τ)'}</span>
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {halfLife > 0 ? `${halfLife.toFixed(1)} p` : 'N/A'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            <span>{isAr ? 'أس هيرست:' : 'Hurst H:'}</span>{' '}
            <span className="text-indigo-300 font-mono">{features?.hurstExponent || 0.45}</span>
          </div>
        </div>

        {/* Metric 5: Total Equity & Margin */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'إجمالي المحفظة' : 'Portfolio Equity'}</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            ${balance.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
            <span>{isAr ? 'الهامش المتاح:' : 'Free Margin:'}</span>
            <span className="text-slate-200 font-mono">${balance.freeMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Metric 6: Daily PnL */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'الربح/الخسارة اليومية' : 'Daily PnL'}</span>
            {balance.dailyPnl >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              balance.dailyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {balance.dailyPnl >= 0 ? `+$${balance.dailyPnl.toFixed(2)}` : `-$${Math.abs(balance.dailyPnl).toFixed(2)}`}
          </div>
          <div
            className={`text-xs font-mono font-semibold mt-1 ${
              balance.dailyPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {balance.dailyPnlPct >= 0 ? `+${balance.dailyPnlPct.toFixed(2)}%` : `${balance.dailyPnlPct.toFixed(2)}%`}
          </div>
        </div>
      </div>

      {/* Main Grid: Chart & OrderBook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Price Chart & Ornstein-Uhlenbeck Reversion Corridor (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <span>{selectedSymbol}</span>
                <span className="text-xs text-cyan-400 font-normal">
                  {isAr ? 'ممر ارتداد أورنشتاين-أولنبيك (OU Corridor)' : 'OU Mean-Reversion Price Corridor'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'الممر الإحصائي μ ± 2σ مع إشارات التداول اللحظية'
                  : 'Stochastic equilibrium envelope (μ ± 2σ) & real-time executions'}
              </p>
            </div>

            {/* Signal Indicator Badge */}
            {latestSignal && (
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold ${
                  latestSignal.type.includes('BUY')
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50'
                    : latestSignal.type.includes('SELL')
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-600/50'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {latestSignal.type}: {latestSignal.reason}
                </span>
              </div>
            )}
          </div>

          {/* Recharts Price Area Chart */}
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  domain={['dataMin - 10', 'dataMax + 10']}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                {/* Upper OU Bound */}
                <Line type="monotone" dataKey="upperCorridor" stroke="#f43f5e" strokeDasharray="4 4" dot={false} strokeWidth={1.2} name="Upper +2σ" />
                {/* Equilibrium Mean Mu */}
                <Line type="monotone" dataKey="mu" stroke="#f59e0b" strokeDasharray="2 2" dot={false} strokeWidth={1.5} name="Equilibrium μ" />
                {/* Lower OU Bound */}
                <Line type="monotone" dataKey="lowerCorridor" stroke="#10b981" strokeDasharray="4 4" dot={false} strokeWidth={1.2} name="Lower -2σ" />
                {/* Actual Price */}
                <Line type="monotone" dataKey="price" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 2, fill: '#06b6d4' }} name="Price" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Stats Footnote */}
          <div className="grid grid-cols-4 gap-2 pt-3 mt-2 border-t border-slate-800/80 text-center text-xs">
            <div>
              <span className="text-slate-400 block">{isAr ? 'مؤشر القوة RSI (14)' : 'RSI (14)'}</span>
              <span className="font-mono font-bold text-slate-200">{features?.rsi14 || 50}</span>
            </div>
            <div>
              <span className="text-slate-400 block">{isAr ? 'التقلب المحقق السنوي' : 'Realized Vol'}</span>
              <span className="font-mono font-bold text-slate-200">{((features?.realizedVolAnn || 0.4) * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-slate-400 block">{isAr ? 'سرعة الارتداد (θ)' : 'Reversion θ'}</span>
              <span className="font-mono font-bold text-slate-200">{features?.ouTheta || 0.18}</span>
            </div>
            <div>
              <span className="text-slate-400 block">{isAr ? 'انحراف أورنشتاين (σ)' : 'Noise (σ)'}</span>
              <span className="font-mono font-bold text-slate-200">${features?.ouSigma || 25}</span>
            </div>
          </div>
        </div>

        {/* L2 OrderBook Ladder Visualizer (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>{isAr ? 'عمق دفتر الطلبات L2' : 'L2 Order Book Ladder'}</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">Seq #{orderBook?.sequence || 1}</span>
            </div>

            {/* Order Book Table */}
            <div className="space-y-1 text-xs font-mono">
              {/* Asks (Red) - Top 5 reversed */}
              <div className="space-y-0.5">
                {(orderBook?.asks || []).slice(0, 5).reverse().map((ask, i) => (
                  <div key={i} className="relative flex items-center justify-between px-2 py-1 rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 right-0 bg-rose-500/15"
                      style={{ width: `${Math.min(100, (ask.size / 5) * 100)}%` }}
                    />
                    <span className="text-rose-400 font-semibold relative z-10">${ask.price.toLocaleString()}</span>
                    <span className="text-slate-300 relative z-10">{ask.size.toFixed(3)}</span>
                    <span className="text-slate-400 text-[10px] relative z-10">{ask.total?.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Spread Divider */}
              <div className="py-1.5 px-2 my-1 rounded bg-slate-800/80 border border-slate-700/50 flex items-center justify-between text-slate-300">
                <span className="text-[11px] text-slate-400">{isAr ? 'الفرق السعري:' : 'Spread:'}</span>
                <span className="font-bold text-cyan-300">${spread.toFixed(2)}</span>
                <span className="text-[10px] text-slate-400">OBI: {(obi * 100).toFixed(0)}%</span>
              </div>

              {/* Bids (Green) - Top 5 */}
              <div className="space-y-0.5">
                {(orderBook?.bids || []).slice(0, 5).map((bid, i) => (
                  <div key={i} className="relative flex items-center justify-between px-2 py-1 rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-500/15"
                      style={{ width: `${Math.min(100, (bid.size / 5) * 100)}%` }}
                    />
                    <span className="text-emerald-400 font-semibold relative z-10">${bid.price.toLocaleString()}</span>
                    <span className="text-slate-300 relative z-10">{bid.size.toFixed(3)}</span>
                    <span className="text-slate-400 text-[10px] relative z-10">{bid.total?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Manual Trade Dispatch Form */}
          <form onSubmit={handleSubmitOrder} className="mt-4 pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{isAr ? 'تنفيذ فوري سريع (SOR)' : 'Smart Order Dispatch'}</span>
              <span className="font-mono text-cyan-400">{selectedSymbol}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-1.5 rounded-lg text-xs font-bold transition ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'شراء (BUY)' : 'BUY (Long)'}
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-1.5 rounded-lg text-xs font-bold transition ${
                  orderSide === 'SELL'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-900/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'بيع (SELL)' : 'SELL (Short)'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'الكمية' : 'Quantity'}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  value={orderQty}
                  onChange={(e) => setOrderQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'نوع الأمر' : 'Order Type'}</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="MARKET">Market (SOR)</option>
                  <option value="LIMIT">Limit</option>
                  <option value="TWAP">TWAP Sliced</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? `إرسال أمر ${orderSide === 'BUY' ? 'الشراء' : 'البيع'}`
                  : `Dispatch ${orderSide} Order`}
              </span>
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Grid: Positions & Orders Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Open Positions (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'المراكز المفتوحة وحالة الهامش' : 'Open Positions & Margin'}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {positions.length} {isAr ? 'مراكز نشطة' : 'Active'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">{isAr ? 'الأصل' : 'Symbol'}</th>
                  <th className="py-2 px-3">{isAr ? 'الحجم' : 'Size'}</th>
                  <th className="py-2 px-3">{isAr ? 'سعر الدخول' : 'Entry'}</th>
                  <th className="py-2 px-3">{isAr ? 'السعر الحالي' : 'Mark'}</th>
                  <th className="py-2 px-3 text-right">{isAr ? 'الربح غير المحقق' : 'PnL (uPnL)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                      {isAr ? 'لا توجد مراكز مفتوحة حالياً' : 'No active open positions'}
                    </td>
                  </tr>
                ) : (
                  positions.map((pos, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-bold text-slate-200">{pos.symbol}</td>
                      <td className={`py-2.5 px-3 font-semibold ${pos.size > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pos.size > 0 ? `+${pos.size}` : pos.size}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">${pos.entryPrice.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-slate-300">${pos.currentPrice.toLocaleString()}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {pos.unrealizedPnl >= 0 ? `+$${pos.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`}{' '}
                        <span className="text-[10px] font-normal">({pos.unrealizedPnlPct.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Orders & State Machine FSM (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'تدفق الأوامر وآلة الحالات (FSM)' : 'Order Lifecycle & Execution FSM'}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {orders.slice(0, 10).length} {isAr ? 'أوامر حديثة' : 'Recent'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">{isAr ? 'معرف الأمر' : 'Order ID'}</th>
                  <th className="py-2 px-3">{isAr ? 'النوع / الأصل' : 'Side / Symbol'}</th>
                  <th className="py-2 px-3">{isAr ? 'الكمية' : 'Qty'}</th>
                  <th className="py-2 px-3">{isAr ? 'السعر' : 'Price'}</th>
                  <th className="py-2 px-3 text-right">{isAr ? 'الحالة (FSM)' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.slice(0, 5).map((ord, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{ord.id}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold mr-1.5 ${
                          ord.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {ord.side}
                      </span>
                      <span className="text-slate-300">{ord.symbol}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">{ord.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      ${(ord.avgFillPrice || ord.price).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.status === 'FILLED'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                            : ord.status === 'PARTIALLY_FILLED'
                            ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/50'
                            : ord.status === 'NEW' || ord.status === 'PENDING_NEW'
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50 animate-pulse'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-700/50'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
