/**
 * Basel AlgoCore Session Portrait Modal
 * Interactive Neural Session Snapshot on return
 */

import React, { useEffect, useRef } from 'react';
import { Sparkles, X, TrendingUp, Wallet, ShieldCheck, Activity } from 'lucide-react';
import { AccountBalance } from '../domain/types';

interface SessionPortraitProps {
  isOpen: boolean;
  onClose: () => void;
  balance: AccountBalance;
  lang: 'ar' | 'en';
}

export const SessionPortraitModal: React.FC<SessionPortraitProps> = ({
  isOpen,
  onClose,
  balance,
  lang,
}) => {
  const isAr = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let ang = 0;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = 28;
    const N = 26;
    const nodes: Array<{ x: number; y: number; z: number }> = [];

    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      nodes.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ang += 0.012;
      const cA = Math.cos(ang);
      const sA = Math.sin(ang);

      const pts = nodes.map((n) => {
        const x1 = n.x * cA - n.z * sA;
        const z1 = n.x * sA + n.z * cA;
        return { x: cx + x1 * R, y: cy + n.y * R, z: z1 };
      });

      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue('--accent-rgb').trim() || '0,229,255';

      // Lines
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dz = nodes[i].z - nodes[j].z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 0.55) {
            ctx.strokeStyle = `rgba(${accent}, ${0.08 + (pts[i].z + 1) * 0.12})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      // Dots
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const depth = (p.z + 1) / 2;
        ctx.fillStyle = `rgba(${accent}, ${0.3 + depth * 0.7})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9 + depth * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md p-6 rounded-3xl border border-[var(--stroke-2)] bg-[rgba(6,10,18,0.95)] backdrop-blur-2xl shadow-2xl space-y-4 relative"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-[var(--text-3)] hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-[var(--cyan)] font-bold uppercase tracking-widest">
          <Sparkles className="w-4 h-4 text-[var(--cyan)]" />
          <span>{isAr ? 'مرحباً بعودتك إلى عقل التداول الذاتي' : 'Welcome Back · Session Active'}</span>
        </div>

        <div className="flex items-center gap-4 py-2">
          <canvas
            ref={canvasRef}
            width={140}
            height={140}
            className="w-[70px] h-[70px] rounded-full border border-[var(--stroke)] bg-black/40 shrink-0"
          />

          <div className="space-y-1 font-mono text-xs text-[var(--text-2)]">
            <div>
              {isAr ? 'محفظة التداول الحالية:' : 'Current Portfolio Balance:'}{' '}
              <b className="text-[var(--text)] font-bold">${balance?.totalEquity?.toLocaleString()}</b>
            </div>
            <div>
              {isAr ? 'الأرباح المحققة اليوم:' : 'Realized Profit Today:'}{' '}
              <b className="text-[var(--lime)] font-bold">+${balance?.realizedPnl?.toLocaleString()}</b>
            </div>
            <div className="text-[10px] text-[var(--text-3)]">
              {isAr ? '47 منصة متصلة · 0 انزلاق سعري' : '47 Feeds Synced · 0 Slippage'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-black bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 shadow-lg shadow-[var(--cyan)]/25 transition-all cursor-pointer"
        >
          {isAr ? 'متابعة التداول والتحكم ↵' : 'Continue Trading Mind ↵'}
        </button>
      </div>
    </div>
  );
};
