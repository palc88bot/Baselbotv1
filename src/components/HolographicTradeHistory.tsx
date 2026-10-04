/**
 * HolographicTradeHistory
 * Tab component for displaying real executed and completed order history
 * Fetches directly from /api/protected/order-history
 * Shows execution timestamps, filled prices, order type, side, and status badges.
 */

import React, { useEffect, useState } from 'react';
import {
  History,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Shield,
  Layers,
  Activity,
} from 'lucide-react';

export interface CompletedOrder {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number;
  status: 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'PARTIALLY_FILLED' | 'NEW';
  timestamp: number;
  updatedAt: number;
  strategyId?: string;
  executionTag?: string;
  errorMessage?: string;
  exchangeOrderId?: number | string;
}

interface HolographicTradeHistoryProps {
  lang: 'ar' | 'en';
  onOrderExecuted?: () => void;
}

export interface LivePosition {
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct?: number;
  realizedPnl?: number;
  marginUsed: number;
  liquidationPrice?: number;
  leverage: number;
  updatedAt: number;
}

export const HolographicTradeHistory: React.FC<HolographicTradeHistoryProps> = ({
  lang,
}) => {
  const isAr = lang === 'ar';
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [viewTab, setViewTab] = useState<'positions' | 'orders'>('positions');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');

  const fetchTradeAndPositionData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orderRes, statusRes] = await Promise.all([
        fetch('/api/protected/order-history'),
        fetch('/api/live-status'),
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
          // If positions exist and user hasn't explicitly chosen orders, default to positions
          if (statusData.positions.length > 0 && orders.length === 0) {
            setViewTab('positions');
          }
        }
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Error fetching trade and position data:', err);
      setError(err.message || 'Unable to retrieve trade history from engine');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTradeAndPositionData();
    // Auto refresh every 4 seconds for real-time tracking
    const timer = setInterval(fetchTradeAndPositionData, 4000);
    return () => clearInterval(timer);
  }, []);

  const symbols = ['ALL', ...Array.from(new Set([
    ...orders.map((o) => o.symbol),
    ...positions.map((p) => p.symbol),
  ]))];

  const filteredOrders = filterSymbol === 'ALL'
    ? orders
    : orders.filter((o) => o.symbol === filterSymbol);

  const filteredPositions = filterSymbol === 'ALL'
    ? positions
    : positions.filter((p) => p.symbol === filterSymbol);

  const getStatusBadge = (status: CompletedOrder['status']) => {
    switch (status) {
      case 'FILLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-[var(--lime)] shadow-[0_0_8px_rgba(0,255,102,0.3)]">
            <CheckCircle2 className="w-3 h-3 text-[var(--lime)]" />
            <span>{isAr ? 'مكتمل (FILLED)' : 'FILLED'}</span>
          </span>
        );
      case 'PARTIALLY_FILLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/40 text-[var(--cyan)] shadow-[0_0_8px_rgba(0,243,255,0.3)]">
            <Clock className="w-3 h-3 text-[var(--cyan)] animate-spin" />
            <span>{isAr ? 'مكتمل جزئياً' : 'PARTIAL'}</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>{isAr ? 'ملغى' : 'CANCELLED'}</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 border border-rose-500/40 text-[var(--magenta)] shadow-[0_0_8px_rgba(255,0,127,0.3)]">
            <XCircle className="w-3 h-3 text-[var(--magenta)]" />
            <span>{isAr ? 'مرفوض' : 'REJECTED'}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/10 border border-white/20 text-slate-300">
            <span>{status}</span>
          </span>
        );
    }
  };

  const filledCount = orders.filter((o) => o.status === 'FILLED').length;
  const totalNotionalExecuted = orders.reduce((sum, o) => {
    const p = o.avgFillPrice || o.price || 0;
    const q = o.filledQuantity || o.quantity || 0;
    return sum + (p * q);
  }, 0);

  return (
    <div className="holo-panel rounded-2xl p-5 sm:p-6 border border-[rgba(0,243,255,0.3)] space-y-6 shadow-2xl relative overflow-hidden">
      {/* Background Volumetric Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--cyan)] rounded-full blur-[140px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[var(--magenta)] rounded-full blur-[140px] opacity-10 pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[rgba(0,243,255,0.15)] relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgba(0,243,255,0.12)] border border-[rgba(0,243,255,0.4)] grid place-items-center shadow-[0_0_15px_rgba(0,243,255,0.25)]">
            <History className="w-5 h-5 text-[var(--cyan)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base sm:text-lg font-bold text-white tracking-wider">
                {isAr ? 'سجل الصفقات والأوامر المنفذة' : 'Completed Trade & Order History'}
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/30 text-[var(--cyan)]">
                /api/protected/order-history
              </span>
            </div>
            <p className="text-xs font-mono text-[var(--muted)]">
              {isAr ? 'تتبع لحظي دقيق لجميع الأوامر المنفذة على المنصة مع الطوابع الزمنية وحالات التنفيذ' : 'Live real-time ledger of completed orders, execution prices, and status indicators'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] font-mono text-[var(--muted)]">
              {isAr ? 'آخر تحديث:' : 'Updated:'} <b className="text-white">{lastUpdated}</b>
            </span>
          )}
          <button
            type="button"
            onClick={fetchTradeAndPositionData}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-xl holo-panel border border-[var(--cyan)]/40 hover:border-[var(--cyan)] text-white hover:text-[var(--cyan)] text-xs font-mono font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[var(--cyan)]' : ''}`} />
            <span>{isAr ? 'تحديث السجل' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-1">
          <span className="text-xs font-mono text-[var(--muted)] block">
            {isAr ? 'إجمالي الأوامر المسجلة' : 'Total Logged Orders'}
          </span>
          <div className="text-xl font-mono font-bold text-white flex items-center justify-between">
            <span>{orders.length}</span>
            <Layers className="w-4 h-4 text-[var(--cyan)]" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-1">
          <span className="text-xs font-mono text-[var(--muted)] block">
            {isAr ? 'الأوامر المنفذة بنجاح' : 'Filled Orders'}
          </span>
          <div className="text-xl font-mono font-bold text-[var(--lime)] flex items-center justify-between">
            <span>{filledCount}</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--lime)]" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-1">
          <span className="text-xs font-mono text-[var(--muted)] block">
            {isAr ? 'إجمالي السيولة المنفذة' : 'Total Executed Volume'}
          </span>
          <div className="text-xl font-mono font-bold text-[var(--cyan)] neon-cyan-glow flex items-center justify-between">
            <span>${totalNotionalExecuted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <Shield className="w-4 h-4 text-[var(--cyan)]" />
          </div>
        </div>
      </div>

      {/* View Switcher: Active Positions vs Executed Orders */}
      <div className="flex items-center gap-3 border-b border-[rgba(0,243,255,0.15)] pb-3 relative z-10">
        <button
          type="button"
          onClick={() => setViewTab('positions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
            viewTab === 'positions'
              ? 'bg-gradient-to-r from-[var(--cyan)] to-emerald-400 text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]'
              : 'bg-black/40 border border-white/10 text-[var(--muted)] hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>{isAr ? `المراكز المفتوحة حالياً (${positions.length})` : `Active Positions (${positions.length})`}</span>
        </button>

        <button
          type="button"
          onClick={() => setViewTab('orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
            viewTab === 'orders'
              ? 'bg-gradient-to-r from-[var(--cyan)] to-emerald-400 text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]'
              : 'bg-black/40 border border-white/10 text-[var(--muted)] hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{isAr ? `سجل الأوامر المنفذة (${orders.length})` : `Executed Orders (${orders.length})`}</span>
        </button>
      </div>

      {/* Symbol Filter Chips */}
      {symbols.length > 2 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 relative z-10 scrollbar-none">
          <span className="text-[11px] font-mono text-[var(--muted)] uppercase shrink-0">
            {isAr ? 'تصفية حسب الزوج:' : 'Filter:'}
          </span>
          {symbols.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => setFilterSymbol(sym)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer shrink-0 ${
                filterSymbol === sym
                  ? 'bg-[var(--cyan)] text-black font-bold shadow-[0_0_10px_var(--cyan)]'
                  : 'bg-black/40 border border-white/10 text-[var(--muted)] hover:text-white'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      {/* VIEW 1: ACTIVE OPEN POSITIONS TABLE */}
      {viewTab === 'positions' && (
        <div className="relative z-10 overflow-x-auto rounded-xl border border-[rgba(0,243,255,0.18)] bg-black/50 backdrop-blur-xl">
          {isLoading && positions.length === 0 ? (
            <div className="py-16 text-center font-mono text-xs text-[var(--muted)] flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--cyan)]" />
              <span>{isAr ? 'جاري فحص المراكز المفتوحة...' : 'Checking active positions...'}</span>
            </div>
          ) : filteredPositions.length === 0 ? (
            <div className="py-16 text-center font-mono text-xs text-[var(--muted)] space-y-2">
              <Shield className="w-8 h-8 text-[var(--lime)] mx-auto opacity-50" />
              <p className="text-white font-semibold">
                {isAr ? 'لا توجد مراكز مفتوحة حالياً (الحساب في وضع الأمان)' : 'No active positions open. Capital is secure.'}
              </p>
              <p className="text-[11px] max-w-md mx-auto text-[var(--muted)]">
                {isAr
                  ? 'يقوم البوت برصد الصفقات المفتوحة والمتبناة تلقائياً وحمايتها بوقف الخسارة وجني الأرباح.'
                  : 'Positions entered autonomously or manually will be tracked and safeguarded here.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-black/60 border-b border-[rgba(0,243,255,0.2)] text-[var(--muted)] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">{isAr ? 'الزوج' : 'Symbol'}</th>
                  <th className="py-3.5 px-4">{isAr ? 'الاتجاه' : 'Direction'}</th>
                  <th className="py-3.5 px-4 text-right">{isAr ? 'حجم المركز' : 'Position Size'}</th>
                  <th className="py-3.5 px-4 text-right">{isAr ? 'سعر الدخول' : 'Entry Price'}</th>
                  <th className="py-3.5 px-4 text-right">{isAr ? 'السعر الحالي' : 'Current Price'}</th>
                  <th className="py-3.5 px-4 text-right">{isAr ? 'الهامش / الرافعة' : 'Margin / Lev'}</th>
                  <th className="py-3.5 px-4 text-right">{isAr ? 'الربح غير المحقق' : 'Unrealized PnL'}</th>
                  <th className="py-3.5 px-4 text-center">{isAr ? 'الحماية' : 'Safeguard'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPositions.map((pos, idx) => {
                  const isLong = pos.size > 0;
                  const pnl = pos.unrealizedPnl || 0;
                  const currentP = pos.currentPrice || pos.entryPrice;
                  const pnlPct = pos.entryPrice > 0 ? ((currentP - pos.entryPrice) / pos.entryPrice) * (isLong ? 100 : -100) : 0;

                  return (
                    <tr key={idx} className="hover:bg-[rgba(0,243,255,0.04)] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[var(--cyan)] animate-ping" />
                          <span>{pos.symbol}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[10px] ${
                          isLong ? 'bg-emerald-500/20 text-[var(--lime)]' : 'bg-rose-500/20 text-[var(--magenta)]'
                        }`}>
                          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>{isLong ? (isAr ? 'شراء (LONG)' : 'LONG') : (isAr ? 'بيع (SHORT)' : 'SHORT')}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className="font-bold text-white">{Math.abs(pos.size)}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-white">
                        ${pos.entryPrice >= 100 ? pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : pos.entryPrice.toFixed(4)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-[var(--cyan)]">
                        ${currentP >= 100 ? currentP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currentP.toFixed(4)}
                      </td>

                      <td className="py-3.5 px-4 text-right text-slate-300">
                        <span>${(pos.marginUsed || 0).toFixed(2)}</span>
                        <span className="text-[10px] text-[var(--muted)] ml-1">({pos.leverage || 3}x)</span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className={`font-bold ${pnl >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}`}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT
                        </div>
                        <div className={`text-[10px] ${pnlPct >= 0 ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'}`}>
                          ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-[var(--lime)]">
                          <CheckCircle2 className="w-3 h-3 text-[var(--lime)]" />
                          <span>{isAr ? 'وقف متحرك نشط' : 'Trailing SL/TP'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VIEW 2: EXECUTED ORDERS TABLE */}
      {viewTab === 'orders' && (
      <div className="relative z-10 overflow-x-auto rounded-xl border border-[rgba(0,243,255,0.18)] bg-black/50 backdrop-blur-xl">
        {isLoading && orders.length === 0 ? (
          <div className="py-16 text-center font-mono text-xs text-[var(--muted)] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[var(--cyan)]" />
            <span>{isAr ? 'جاري استرجاع سجل الأوامر والصفقات من المحرك...' : 'Retrieving completed order history from engine...'}</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center font-mono text-xs text-[var(--magenta)] flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6 text-[var(--magenta)]" />
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchTradeAndPositionData}
              className="mt-2 px-3 py-1 rounded bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            >
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center font-mono text-xs text-[var(--muted)] space-y-2">
            <History className="w-8 h-8 text-[var(--muted)] mx-auto opacity-40" />
            <p className="text-white font-semibold">
              {isAr ? 'لا توجد صفقات منفذة مسجلة حتى الآن' : 'No completed trades recorded yet'}
            </p>
            <p className="text-[11px] max-w-md mx-auto text-[var(--muted)]">
              {isAr
                ? 'عند إرسال وتنفيذ الأوامر عبر المحرك أو من خلال البوت اللحظي، ستظهر هنا فوراً مع كافة تفاصيل الأسعار والطوابع الزمنية.'
                : 'Orders executed via the autonomous pipeline or manually routed through the exchange gateway will automatically appear here.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-black/60 border-b border-[rgba(0,243,255,0.2)] text-[var(--muted)] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{isAr ? 'معرف الأمر' : 'Order ID'}</th>
                <th className="py-3.5 px-4">{isAr ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                <th className="py-3.5 px-4">{isAr ? 'الزوج' : 'Symbol'}</th>
                <th className="py-3.5 px-4">{isAr ? 'الاتجاه' : 'Side'}</th>
                <th className="py-3.5 px-4">{isAr ? 'النوع' : 'Type'}</th>
                <th className="py-3.5 px-4 text-right">{isAr ? 'السعر المستهدف / المنفذ' : 'Price / Fill Price'}</th>
                <th className="py-3.5 px-4 text-right">{isAr ? 'الكمية المنفذة' : 'Filled / Total Qty'}</th>
                <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredOrders.map((order) => {
                const isBuy = order.side === 'BUY';
                const dateObj = new Date(order.timestamp || order.updatedAt || Date.now());
                const timeStr = dateObj.toLocaleTimeString();
                const dateStr = dateObj.toLocaleDateString();

                const executionPrice = order.avgFillPrice || order.price || 0;
                const formattedPrice = executionPrice >= 1000
                  ? `$${executionPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${executionPrice.toFixed(4)}`;

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-[rgba(0,243,255,0.04)] transition-colors group"
                  >
                    {/* Order ID */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white group-hover:text-[var(--cyan)] transition-colors flex items-center gap-1.5">
                        <span>{order.id}</span>
                      </div>
                      {order.clientOrderId && (
                        <div className="text-[10px] text-[var(--muted)]">{order.clientOrderId}</div>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="text-white">{timeStr}</div>
                      <div className="text-[10px] text-[var(--muted)]">{dateStr}</div>
                    </td>

                    {/* Symbol */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white">{order.symbol}</span>
                    </td>

                    {/* Side */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 font-bold ${
                        isBuy ? 'text-[var(--lime)]' : 'text-[var(--magenta)]'
                      }`}>
                        {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span>{order.side}</span>
                      </span>
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4">
                      <span className="text-[var(--muted)]">{order.type}</span>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-white">{formattedPrice}</div>
                      {order.avgFillPrice > 0 && order.avgFillPrice !== order.price && (
                        <div className="text-[10px] text-[var(--cyan)]">
                          Avg: ${order.avgFillPrice.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="text-white font-medium">
                        <span className={order.filledQuantity > 0 ? 'text-[var(--cyan)] font-bold' : ''}>
                          {order.filledQuantity}
                        </span>
                        <span className="text-[var(--muted)]"> / {order.quantity}</span>
                      </div>
                      {executionPrice > 0 && order.filledQuantity > 0 && (
                        <div className="text-[10px] text-[var(--muted)]">
                          ≈ ${(executionPrice * order.filledQuantity).toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(order.status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
};
