/**
 * Basel AlgoCore Trading System
 * Live Trading Dashboard, L2 OrderBook Ladder, OU Mean-Reversion Chart & Execution FSM
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Clock,
  DollarSign,
  Layers,
  Percent,
  RefreshCw,
  Send,
  Shield,
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
  SystemHealth,
} from '../domain/types';

interface DashboardProps {
  selectedSymbol: AssetSymbol;
  orderBook?: OrderBook;
  candles: Candle[];
  features?: any;
  latestSignal?: TradingSignal | null;
  signalHistory?: TradingSignal[];
  balance: AccountBalance;
  positions: Position[];
  orders: Order[];
  onManualOrder: (params: { symbol: AssetSymbol; side: 'BUY' | 'SELL'; type: any; quantity: number; price?: number }) => void;
  lang: 'ar' | 'en';
  reduceMotion: boolean;
  health: SystemHealth;
  isRunning: boolean;
  regime?: any;
  riskDecision?: any;
}

export const LiveTradingDashboard: React.FC<DashboardProps> = React.memo(({
  selectedSymbol,
  orderBook,
  candles,
  features,
  latestSignal,
  signalHistory = [],
  balance,
  positions,
  orders,
  onManualOrder,
  lang,
  reduceMotion,
  health,
  isRunning,
  regime,
  riskDecision,
}) => {
  const isAr = lang === 'ar';
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQty, setOrderQty] = useState<number>(0.1);

  const currentPrice = orderBook?.midPrice || 0;
  const spread = orderBook?.spread || 0;
  
  // Real-time metrics from health object
  const latency = health.pipelineLatency.totalPipelineMs || 0;
  const throughput = health.messagesPerSecond || 0;

  const ouMu = features?.ouMu || currentPrice;
  const ouSigma = features?.ouSigma || currentPrice * 0.01;

  // Chart data formatting - memoized to prevent re-parsing on unrelated renders
  const chartData = React.useMemo(() => {
    return (candles || []).slice(-50).map((c) => ({
      time: new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      price: c?.close || 0,
      vwap: c?.vwap || 0,
      upper: Number((ouMu + 2 * ouSigma).toFixed(2)),
      lower: Number((ouMu - 2 * ouSigma).toFixed(2)),
    }));
  }, [candles, ouMu, ouSigma]);

  // Real Decisions from signalHistory
  const aiDecisions = React.useMemo(() => {
    return signalHistory.map(sig => ({
      time: new Date(sig.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      msg: isAr ? sig.reason : sig.reason,
      type: sig.type
    }));
  }, [signalHistory, isAr]);

  return (
    <div className="relative w-full space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      
      {/* 1. AlgoCore Top Hero Section (PnL, Regime, Risk & Algorithm Status) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Profits Card */}
        <div className="bg-[#0a0f1d]/90 border border-cyan-500/20 rounded-[2rem] p-6 shadow-lg relative overflow-hidden group gpu-accelerated">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
          <div className={`flex flex-col gap-1 ${isAr ? 'items-start text-right' : 'items-start text-left'}`}>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'إجمالي الأرباح' : 'TOTAL_PROFITS'}</h4>
            <div className={`text-2xl font-black font-mono tracking-tighter ${balance?.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'} truncate w-full`}>
              {balance?.unrealizedPnl >= 0 ? '+' : ''}${Math.abs(balance?.unrealizedPnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="w-full bg-slate-900/50 h-1.5 rounded-full mt-3 overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '75%' }}
                className="h-full bg-gradient-to-r from-cyan-600 to-emerald-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]" 
              />
            </div>
          </div>
        </div>

        {/* Market Regime Card */}
        <div className="bg-[#0a0f1d]/90 border border-indigo-500/20 rounded-[2rem] p-6 shadow-lg relative overflow-hidden group gpu-accelerated">
          <div className={`flex flex-col gap-1 ${isAr ? 'items-start text-right' : 'items-start text-left'}`}>
            <div className="flex items-center justify-between w-full">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'نظام السوق' : 'MARKET_REGIME'}</h4>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                regime?.tradingAllowed !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {regime?.tradingAllowed !== false ? (isAr ? 'مسموح ✅' : 'ALLOWED ✅') : (isAr ? 'متوقف 🛑' : 'PAUSED 🛑')}
              </span>
            </div>
            <div className="text-xl font-black text-indigo-400 font-mono tracking-tight uppercase">
              {regime?.marketRegime || 'RANGING'}
            </div>
            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2 mt-1">
              <span>Hurst: {regime?.hurstExponent ? regime.hurstExponent.toFixed(3) : '0.420'}</span>
              <span>•</span>
              <span>ADX: {regime?.adx ? regime.adx.toFixed(1) : '15.2'}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Risk Management Card */}
        <div className="bg-[#0a0f1d]/90 border border-blue-500/20 rounded-[2rem] p-6 shadow-lg relative overflow-hidden group gpu-accelerated">
          <div className={`flex flex-col gap-1 ${isAr ? 'items-start text-right' : 'items-start text-left'}`}>
            <div className="flex items-center justify-between w-full">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'إدارة المخاطر الديناميكية' : 'DYNAMIC_RISK'}</h4>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] font-black uppercase">
                {riskDecision?.action || 'NORMAL'}
              </span>
            </div>
            <div className="text-xl font-black text-cyan-400 font-mono tracking-tight">
              {((riskDecision?.positionSizeMultiplier ?? 1) * 100).toFixed(0)}% <span className="text-xs font-normal text-slate-400">{isAr ? 'حجم الصفقة' : 'Pos Size'}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">
              {isAr ? 'مضاعف الرافعة:' : 'Leverage:'} {((riskDecision?.leverageMultiplier ?? 1) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Algorithm Status Card */}
        <div className="bg-[#0a0f1d]/90 border border-white/5 rounded-[2rem] p-6 shadow-lg relative overflow-hidden group gpu-accelerated">
          <div className={`flex flex-col gap-1 ${isAr ? 'items-start text-right' : 'items-start text-left'}`}>
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'حالة الخوارزمية' : 'ALGO_STATE'}</h4>
            <div className="flex items-center gap-3 w-full">
              <div className={`text-xl font-black tracking-tight shrink-0 ${isRunning ? 'text-cyan-400' : 'text-rose-500'}`}>
                {isRunning ? (isAr ? 'نشط' : 'ACTIVE') : (isAr ? 'متوقف' : 'STOPPED')}
              </div>
              <div className={`flex flex-col justify-center min-w-0 ${isAr ? 'items-end' : 'items-start'}`}>
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest truncate">{isAr ? 'السرعة' : 'LOAD'}</span>
                <span className="text-[10px] font-mono text-slate-500 truncate">{latency.toFixed(1)}ms | {throughput} msg/s</span>
              </div>
            </div>
            <div className="w-full bg-slate-900/50 h-1.5 rounded-full mt-3 overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: isRunning ? '92%' : '0%' }}
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Market Analysis & Execution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Market Visualizer (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-6 md:p-8 shadow-xl relative gpu-accelerated">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-100 tracking-[0.3em] uppercase flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,1)]" />
                {isAr ? 'تحليل السوق المباشر' : 'LIVE_MARKET_ANALYSIS'}
              </h3>
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded-full bg-slate-900 border border-white/5 text-[9px] font-black text-slate-400 uppercase">{selectedSymbol}</span>
                <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[9px] font-black text-cyan-400 uppercase">1m</span>
              </div>
            </div>
            
            {/* Modernized Quantum Glow Area Chart */}
            <div className="h-[280px] md:h-[400px] w-full relative">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="#ffffff" opacity={0.03} vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(2, 4, 10, 0.95)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '14px', fontSize: '10px' }}
                      itemStyle={{ color: '#06b6d4', padding: '2px 0' }}
                      cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#06b6d4" 
                      strokeWidth={2.5} 
                      fill="url(#qPrice)" 
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="upper" 
                      stroke="#ef4444" 
                      strokeWidth={1} 
                      strokeDasharray="3 6" 
                      dot={false} 
                      opacity={0.15} 
                      isAnimationActive={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="lower" 
                      stroke="#10b981" 
                      strokeWidth={1} 
                      strokeDasharray="3 6" 
                      dot={false} 
                      opacity={0.15} 
                      isAnimationActive={false}
                    />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
          </div>

          {/* AI Decision Stream Ribbon */}
          <div className="bg-[#0a0f1d]/60 border border-white/5 rounded-[2rem] p-6 shadow-xl">
             <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 text-center">
               {isAr ? 'شريط قرارات الذكاء الاصطناعي' : 'AI_DECISION_STREAM'}
             </h4>
             <div className="flex flex-col md:flex-row gap-3">
                {aiDecisions.map((dec, i) => (
                  <div key={i} className="flex-1 flex items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-2xl group hover:border-cyan-500/30 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate-600">[{dec.time}]</span>
                      <span className="text-[11px] font-bold text-slate-300">{dec.msg}</span>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${dec.type.includes('BUY') ? 'bg-emerald-500' : dec.type.includes('SELL') ? 'bg-rose-500' : 'bg-slate-600'}`} />
                  </div>
                ))}
             </div>
          </div>

          {/* Active Open Positions & Orders Monitor */}
          <div className="bg-[#0a0f1d]/80 border border-cyan-500/20 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
             <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                   <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                   <h4 className="text-xs font-black text-slate-100 uppercase tracking-[0.2em]">
                      {isAr ? 'المراكز المفتوحة والأوامر النشطة' : 'ACTIVE_OPEN_POSITIONS_AND_ORDERS'}
                   </h4>
                </div>
                <div className="px-3 py-1 bg-cyan-500/10 rounded-full border border-cyan-500/20 text-[10px] font-mono text-cyan-400 font-bold">
                   {positions.length} {isAr ? 'صفقة مفتوحة' : 'OPEN'}
                </div>
             </div>

             {positions.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                   {isAr ? 'لا توجد صفقات مفتوحة حالياً في المحفظة.' : 'NO_OPEN_POSITIONS_CURRENTLY_ACTIVE'}
                </div>
             ) : (
                <div className="overflow-x-auto no-scrollbar">
                   <table className="w-full text-left font-mono text-xs">
                      <thead>
                         <tr className="text-[10px] text-slate-500 border-b border-white/5 uppercase">
                            <th className="pb-3 font-black">{isAr ? 'الأصل' : 'ASSET'}</th>
                            <th className="pb-3 font-black">{isAr ? 'النوع' : 'SIDE'}</th>
                            <th className="pb-3 font-black">{isAr ? 'الحجم' : 'SIZE'}</th>
                            <th className="pb-3 font-black">{isAr ? 'سعر الدخول' : 'ENTRY_PRICE'}</th>
                            <th className="pb-3 font-black">{isAr ? 'السعر الحالي' : 'MARK_PRICE'}</th>
                            <th className="pb-3 font-black">{isAr ? 'الربح/الخسارة غير المحققة' : 'UPNL'}</th>
                            <th className="pb-3 font-black text-right">{isAr ? 'الرافع المالية' : 'LEVERAGE'}</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {positions.map((pos, idx) => {
                            const isLong = pos.size > 0;
                            const pnl = pos.unrealizedPnl || 0;
                            return (
                               <tr key={idx} className="hover:bg-white/5 transition-colors">
                                  <td className="py-3 font-bold text-slate-200">{pos.symbol}</td>
                                  <td className="py-3">
                                     <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isLong ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                        {isLong ? (isAr ? 'شراء LONG' : 'LONG') : (isAr ? 'بيع SHORT' : 'SHORT')}
                                     </span>
                                  </td>
                                  <td className="py-3 font-bold text-slate-300">{Math.abs(pos.size)}</td>
                                  <td className="py-3 text-slate-400">${(pos.entryPrice || 0).toLocaleString()}</td>
                                  <td className="py-3 text-cyan-400 font-bold">${(pos.currentPrice || currentPrice).toLocaleString()}</td>
                                  <td className={`py-3 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                     {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                  </td>
                                  <td className="py-3 text-right text-purple-400 font-black">{pos.leverage || 20}x</td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
             )}
          </div>
        </div>

        {/* Execution & OrderBook Hub (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* L2 Liquidity Ladder */}
          <div className="bg-[#0a0f1d]/80 border border-white/5 rounded-[2.5rem] p-8 shadow-xl h-[420px] flex flex-col">
             <div className="flex items-center justify-between mb-6">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'عمق السيولة' : 'LIQUIDITY_DEPTH'}</h4>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Live_Sync</span>
                </div>
             </div>
             <div className="flex-1 overflow-hidden font-mono text-[10px]">
                <div className="grid grid-cols-3 text-slate-600 font-black pb-3 border-b border-white/5 mb-3 px-2">
                   <span>PRICE</span>
                   <span className="text-center">SIZE</span>
                   <span className="text-right">SUM</span>
                </div>
                <div className="space-y-1 overflow-y-auto h-full no-scrollbar pb-10">
                   {orderBook?.asks.slice(0, 8).reverse().map((ask, i) => (
                     <div key={i} className="grid grid-cols-3 px-2 py-1.5 relative group">
                        <div className="absolute inset-y-0 right-0 bg-rose-500/5 transition-all" style={{ width: `${Math.min(100, (ask?.size || 0) * 5)}%` }} />
                        <span className="text-rose-400 font-bold relative z-10">{(ask?.price || 0).toLocaleString()}</span>
                        <span className="text-center text-slate-300 relative z-10">{(ask?.size || 0).toFixed(4)}</span>
                        <span className="text-right text-slate-500 relative z-10">{( (ask?.price || 0) * (ask?.size || 0) ).toFixed(0)}</span>
                     </div>
                   ))}
                   <div className="py-4 my-2 border-y border-white/5 text-center bg-cyan-500/5 font-black text-cyan-400 text-lg tracking-tighter">
                      {currentPrice.toLocaleString()}
                   </div>
                   {orderBook?.bids.slice(0, 8).map((bid, i) => (
                     <div key={i} className="grid grid-cols-3 px-2 py-1.5 relative group">
                        <div className="absolute inset-y-0 left-0 bg-emerald-500/5 transition-all" style={{ width: `${Math.min(100, (bid?.size || 0) * 5)}%` }} />
                        <span className="text-emerald-400 font-bold relative z-10">{(bid?.price || 0).toLocaleString()}</span>
                        <span className="text-center text-slate-300 relative z-10">{(bid?.size || 0).toFixed(4)}</span>
                        <span className="text-right text-slate-500 relative z-10">{( (bid?.price || 0) * (bid?.size || 0) ).toFixed(0)}</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>

          {/* Quick Execution Port */}
          <div className="bg-gradient-to-br from-[#0a0f1d] to-[#0f172a] border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
             <h4 className="text-xs font-black text-slate-100 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <Zap className="w-4 h-4 text-cyan-400" />
                {isAr ? 'محطة التنفيذ' : 'EXECUTION_PORT'}
             </h4>
             
             <div className="flex gap-2 bg-slate-900/80 p-1.5 rounded-2xl mb-6 border border-white/5">
                {(['BUY', 'SELL'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setOrderSide(side)}
                    className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-[0.15em] ${
                      orderSide === side 
                        ? (side === 'BUY' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-rose-600 text-white shadow-lg')
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {isAr ? (side === 'BUY' ? 'شراء' : 'بيع') : side}
                  </button>
                ))}
             </div>

             <div className="space-y-6">
                <div className="relative">
                   <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedSymbol.split('/')[0]}</div>
                   <input 
                     type="number" 
                     value={orderQty}
                     onChange={(e) => setOrderQty(Number(e.target.value))}
                     className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-6 pr-16 py-4 text-sm font-mono text-slate-100 outline-none focus:border-cyan-500/50 transition-all"
                     placeholder="0.00"
                   />
                </div>
                <button
                  onClick={() => onManualOrder({ symbol: selectedSymbol, side: orderSide, type: 'MARKET', quantity: orderQty })}
                  className={`w-full py-5 rounded-2xl font-black text-xs tracking-[0.3em] transition-all flex items-center justify-center gap-3 group ${
                    orderSide === 'BUY' 
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)]' 
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_30px_rgba(244,63,94,0.3)]'
                  }`}
                >
                  <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  {isAr ? 'تأكيد العملية' : 'CONFIRM_ORDER'}
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
});

