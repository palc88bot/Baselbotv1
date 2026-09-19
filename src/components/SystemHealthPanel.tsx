import React, { useEffect, useState } from 'react';
import { Activity, Shield, Database } from 'lucide-react';

export default function SystemHealthPanel({ lang }: { lang: 'ar' | 'en' }) {
    const [health, setHealth] = useState<any>(null);
    const isAr = lang === 'ar';

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const res = await fetch('/api/system-health');
                const data = await res.json();
                setHealth(data);
            } catch (e) { console.error(e); }
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!health) return <div className="animate-pulse text-cyan-500 font-mono text-[10px] uppercase tracking-widest">Awaiting_Data_Packet...</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Correlation Risk */}
            <div className="bg-[#0a0f1d]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-xl transition-all hover:bg-cyan-500/5 group">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'خطر الارتباط' : 'CORRELATION_RISK'}</h3>
                    <Shield className={`w-4 h-4 ${health.correlation?.level === 'LOW' ? 'text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]'}`} />
                </div>
                <p className={`text-3xl font-mono font-black ${health.correlation?.level === 'LOW' ? 'text-emerald-400' : 'text-rose-400'}`}>{health.correlation?.level || 'N/A'}</p>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">
                   {(health.correlation?.score * 100 || 0).toFixed(1)}% {isAr ? 'معامل الارتباط' : 'SYNC_COEFFICIENT'}
                </div>
            </div>

            {/* Rate Limit */}
            <div className="bg-[#0a0f1d]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-xl transition-all hover:bg-cyan-500/5 group">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'حدود API' : 'API_RATE_LIMIT'}</h3>
                    <Activity className="w-4 h-4 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]" />
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-6 mb-4">
                    <div className="bg-cyan-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(6,182,212,0.5)]" style={{ width: `${health.rateLimit?.usagePercent || 0}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 font-mono uppercase font-bold">
                   {health.rateLimit?.used || 0} <span className="text-slate-600">/</span> {health.rateLimit?.limit || 0} <span className="text-cyan-500 ml-1">WEIGHT_LOAD</span>
                </p>
            </div>

            {/* Database Trades */}
            <div className="bg-[#0a0f1d]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-xl transition-all hover:bg-cyan-500/5 group">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase">{isAr ? 'إجمالي الصفقات' : 'SQL_PERSISTENCE'}</h3>
                    <Database className="w-4 h-4 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.3)]" />
                </div>
                <p className="text-3xl font-mono font-black text-slate-100">{health.db?.totalTrades || 0}</p>
                <div className="flex items-center gap-2 mt-2">
                   <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-black tracking-widest uppercase">
                      WIN_RATE: {(health.db?.winRate || 0).toFixed(1)}%
                   </div>
                </div>
            </div>
        </div>
    );
}
