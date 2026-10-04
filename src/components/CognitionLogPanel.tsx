/**
 * Basel AlgoCore Cognition Log Panel
 * Real-Time Synaptic Event Stream with Cryptographic Fingerprints
 */

import React, { useEffect, useState } from 'react';
import { JournalEvent } from '../domain/types';

interface CognitionLogProps {
  events?: JournalEvent[];
  lang: 'ar' | 'en';
}

const makeFingerprint = (seed: string | number) => {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return Math.abs(h) % n;
  };
  const paths: string[] = [];
  const arcs = 3 + rng(3);
  for (let i = 0; i < arcs; i++) {
    const x1 = 2 + rng(12);
    const y1 = 2 + rng(12);
    const x2 = 2 + rng(12);
    const y2 = 2 + rng(12);
    const cx = 2 + rng(12);
    const cy = 2 + rng(12);
    paths.push(`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
  }
  const circles = 1 + rng(3);
  let dots = '';
  for (let i = 0; i < circles; i++) {
    const cx = 3 + rng(10);
    const cy = 3 + rng(10);
    const r = 1 + rng(2);
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  }
  const color = ['var(--cyan)', 'var(--lime)', 'var(--magenta)', 'var(--amber)'][rng(4)];
  return { paths, color, dots };
};

export const CognitionLogPanel: React.FC<CognitionLogProps> = React.memo(({
  events = [],
  lang,
}) => {
  const isAr = lang === 'ar';
  const [logTime, setLogTime] = useState<string>('--:--:--');

  const defaultLogs = [
    { type: 'ok', msgEn: 'Sync complete · 47 exchanges', msgAr: 'اكتملت المزامنة · 47 منصة', time: '23:18:40', fp: 'sync47' },
    { type: 'inf', msgEn: 'Evaluated 284 markets in 41ms', msgAr: 'تم تقييم 284 سوقاً في 41 مللي ثانية', time: '23:18:35', fp: 'mkt284' },
    { type: 'inf', msgEn: 'Risk: position sized 2.4% equity', msgAr: 'المخاطر: حجم الصفقة 2.4% من رأس المال', time: '23:18:30', fp: 'risk24' },
    { type: 'wrn', msgEn: 'Volatility spike detected on SOL', msgAr: 'تم رصد ارتفاع التقلب على SOL', time: '23:18:22', fp: 'volsol' },
    { type: 'inf', msgEn: 'Reweighted 14 strategy nodes', msgAr: 'أُعيد ترجيح 14 عقدة استراتيجية', time: '23:18:15', fp: 'weight14' },
    { type: 'err', msgEn: 'Rejected: confidence below 0.62', msgAr: 'مرفوض: الثقة أقل من 0.62', time: '23:18:05', fp: 'rej62' },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLogTime(new Date().toTimeString().slice(0, 8));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const displayLogs = events.length > 0 ? events.slice(-6).reverse().map(e => ({
    type: e.severity === 'ERROR' ? 'err' : e.severity === 'WARN' ? 'wrn' : e.severity === 'ORDER' ? 'ok' : 'inf',
    msgEn: e.message,
    msgAr: e.message,
    time: new Date(e.timestamp).toTimeString().slice(0, 8),
    fp: e.id || e.message,
  })) : defaultLogs;

  return (
    <div 
      id="logsPanel" 
      role="tabpanel"
      className="border border-[var(--stroke)] rounded-[var(--rad-lg)] bg-gradient-to-b from-[rgba(8,12,22,0.6)] to-[rgba(4,6,12,0.8)] overflow-hidden flex flex-col shadow-xl breathe-panel min-h-[220px]"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Head */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-[var(--stroke)] font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-[var(--cyan)] flex items-center justify-between">
        <span className="font-bold">{isAr ? 'سجل الإدراك العصبي' : 'COGNITION LOG'}</span>
        <span className="text-[var(--text-3)] font-mono text-[9px]">{logTime}</span>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4 font-mono text-[10px] sm:text-[11px] leading-relaxed space-y-2.5 overflow-hidden">
        {displayLogs.map((log, idx) => {
          const fp = makeFingerprint(log.fp);
          return (
            <div key={idx} className="flex items-center gap-2.5 truncate">
              {/* SVG Fingerprint */}
              <div className="w-4 h-4 shrink-0 opacity-85 hover:scale-125 transition-transform cursor-pointer">
                <svg viewBox="0 0 16 16" className="w-full h-full block">
                  <g fill="none" stroke={fp.color} strokeWidth="0.7" opacity="0.9">
                    {fp.paths.map((p, i) => (
                      <path key={i} d={p} />
                    ))}
                  </g>
                  <g fill={fp.color} opacity="0.8" dangerouslySetInnerHTML={{ __html: fp.dots }} />
                </svg>
              </div>

              {/* Timestamp */}
              <span className="text-[var(--text-3)] text-[9px] shrink-0">[{log.time}]</span>

              {/* Message */}
              <span className={`truncate font-medium ${
                log.type === 'ok' ? 'text-[var(--lime)]' :
                log.type === 'err' ? 'text-[var(--red)]' :
                log.type === 'wrn' ? 'text-[var(--amber)]' : 'text-[var(--cyan)]'
              }`}>
                {isAr ? log.msgAr : log.msgEn}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
