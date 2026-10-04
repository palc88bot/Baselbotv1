/**
 * Basel AlgoCore Neural Core Visualizer
 * 3D Spherical Node Graph with Kinetic Synaptic Pulses, Edge Light Radiation, and Trade Heatmaps
 */

import React, { useEffect, useRef } from 'react';

interface NeuralCoreCanvasProps {
  decisionOps?: number;
  openPositionsCount?: number;
  winRatePct?: number;
  latencyMs?: number;
  activeExchangesCount?: number;
  lang: 'ar' | 'en';
  reduceMotion: boolean;
  activeTradeEvent?: { pair: string; isWin: boolean; timestamp: number } | null;
}

export const NeuralCoreCanvas: React.FC<NeuralCoreCanvasProps> = React.memo(({
  decisionOps = 1247,
  openPositionsCount = 18,
  winRatePct = 73.6,
  latencyMs = 12,
  activeExchangesCount = 47,
  lang,
  reduceMotion,
  activeTradeEvent,
}) => {
  const isAr = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let DPR = Math.min(window.devicePixelRatio || 1, 2);
    let rafId: number | null = null;
    let isVisible = true;
    let angle = 0;
    let mousePX = 0;
    let mousePY = 0;
    let targetPX = 0;
    let targetPY = 0;

    const nodeCount = window.innerWidth > 860 ? 90 : 60;
    const nodes: Array<{ x: number; y: number; z: number; size: number }> = [];
    const edges: Array<[number, number, number]> = [];
    const pulses: Array<{ edge: number; t: number; speed: number }> = [];
    const edgePulses: Array<{
      angle: number;
      start: number;
      duration: number;
      maxR: number;
      size: number;
      isWin: boolean;
    }> = [];

    // Build Fibonnaci sphere nodes
    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      nodes.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        size: 1 + Math.random() * 1.8,
      });
    }

    // Connect close nodes
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.42) {
          edges.push([i, j, d]);
        }
      }
    }

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      W = rect.width;
      H = rect.height;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Spawn pulses between nodes
    const pulseInterval = setInterval(() => {
      if (reduceMotion) return;
      if (pulses.length < 32 && edges.length > 0) {
        pulses.push({
          edge: Math.floor(Math.random() * edges.length),
          t: 0,
          speed: 0.008 + Math.random() * 0.018,
        });
      }
    }, 180);

    const handleMouseMove = (e: MouseEvent) => {
      if (reduceMotion) return;
      const r = canvas.getBoundingClientRect();
      targetPX = ((e.clientX - r.left) / r.width - 0.5) * 0.3;
      targetPY = ((e.clientY - r.top) / r.height - 0.5) * 0.3;
    };

    const handleMouseLeave = () => {
      targetPX = 0;
      targetPY = 0;
    };

    canvas.addEventListener('mousemove', handleMouseMove, { passive: true });
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const render = () => {
      if (!W || !H || !isVisible) {
        rafId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.max(105, Math.min(270, Math.min(W, H) * 0.33));

      if (!reduceMotion) {
        angle += 0.0035;
      }

      mousePX += (targetPX - mousePX) * 0.06;
      mousePY += (targetPY - mousePY) * 0.06;

      const aX = angle + mousePX;
      const aY = angle * 0.62 + mousePY;
      const cA = Math.cos(aX);
      const sA = Math.sin(aX);
      const cB = Math.cos(aY);
      const sB = Math.sin(aY);

      const pts = new Array(nodeCount);
      for (let i = 0; i < nodeCount; i++) {
        const n = nodes[i];
        const x1 = n.x * cA - n.z * sA;
        const z1 = n.x * sA + n.z * cA;
        const y2 = n.y * cB - z1 * sB;
        const z2 = n.y * sB + z1 * cB;
        pts[i] = { x: cx + x1 * R, y: cy + y2 * R, z: z2 };
      }

      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue('--accent-rgb').trim() || '0,229,255';
      const accent2 = styles.getPropertyValue('--accent-2-rgb').trim() || '182,255,46';

      // Draw Edges
      for (let k = 0; k < edges.length; k++) {
        const [i, j] = edges[k];
        const a = pts[i];
        const b = pts[j];
        const depth = (a.z + b.z) / 2;
        const alpha = 0.05 + (depth + 1) * 0.14;
        ctx.strokeStyle = `rgba(${accent}, ${Math.max(0.04, alpha)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw Pulses along edges
      if (!reduceMotion) {
        for (let k = pulses.length - 1; k >= 0; k--) {
          const p = pulses[k];
          p.t += p.speed;
          if (p.t >= 1) {
            pulses.splice(k, 1);
            continue;
          }
          const [i, j] = edges[p.edge];
          const a = pts[i];
          const b = pts[j];
          const x = a.x + (b.x - a.x) * p.t;
          const y = a.y + (b.y - a.y) * p.t;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
          g.addColorStop(0, `rgba(${accent2}, 0.9)`);
          g.addColorStop(1, `rgba(${accent2}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Nodes
      for (let i = 0; i < nodeCount; i++) {
        const p = pts[i];
        const depth = (p.z + 1) / 2;
        const r = nodes[i].size * (0.6 + depth * 1.0);
        const alpha = 0.28 + depth * 0.72;

        if (depth > 0.72) {
          ctx.fillStyle = `rgba(${accent}, ${(depth - 0.72) * 0.55})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${accent}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        if (depth > 0.85) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    render();

    return () => {
      clearInterval(pulseInterval);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [reduceMotion]);

  return (
    <section 
      id="corePanel" 
      role="tabpanel"
      className="relative border border-[var(--stroke)] rounded-[var(--rad-lg)] bg-gradient-to-b from-[rgba(8,12,22,0.65)] to-[rgba(4,6,12,0.85)] overflow-hidden min-h-[440px] lg:min-h-[540px] flex flex-col shadow-2xl breathe-panel"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Corner Brackets */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-[var(--cyan)] opacity-50 pointer-events-none rounded-tl-md" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-[var(--cyan)] opacity-50 pointer-events-none rounded-br-md" />

      {/* Head */}
      <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-[var(--stroke)] font-mono text-[10px] sm:text-xs tracking-widest uppercase text-[var(--text-3)]">
        <div className="text-[var(--cyan)] flex items-center gap-2 font-bold font-sans">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)] animate-pulse" />
          <span>{isAr ? 'النواة العصبية الكمية' : 'NEURAL CORE'}</span>
        </div>
        <div className="text-[var(--text-2)] font-mono text-[9px] sm:text-[10px]">
          {isAr ? `متزامن · ${activeExchangesCount} منصة` : `SYNCED · ${activeExchangesCount} EXCHANGES`}
        </div>
      </div>

      {/* Canvas Wrap */}
      <div className="relative flex-1 min-h-[280px] sm:min-h-[350px]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" aria-label="Animated neural network visualization" />
        
        {/* Overlay Badges */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
          <div className="flex justify-between font-mono text-[9px] text-[var(--text-3)] tracking-widest">
            <span className="bg-black/40 px-2 py-1 rounded border border-white/5">NODE 07</span>
            <span className="bg-black/40 px-2 py-1 rounded border border-white/5">LAT {latencyMs}ms</span>
          </div>
          <div className="flex justify-end font-mono text-[9px] text-[var(--text-3)] tracking-widest">
            <span className="bg-black/40 px-2 py-1 rounded border border-white/5">
              {isAr ? 'مدة التشغيل 99.98%' : 'UPTIME 99.98%'}
            </span>
          </div>
        </div>

        {/* Center Pulse HUD */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-10">
          <div className="font-mono text-[8px] sm:text-[9px] tracking-[0.25em] text-[var(--text-3)] uppercase mb-1">
            {isAr ? 'نبضة القرار الخوارزمي' : 'DECISION PULSE'}
          </div>
          <div className="font-mono text-2xl sm:text-4xl font-light text-[var(--cyan)] tracking-tight">
            {decisionOps.toLocaleString()}<small className="text-xs text-[var(--text-3)] ml-1">ops/s</small>
          </div>
          <div className="font-mono text-[9px] sm:text-[10px] text-[var(--lime)] tracking-widest mt-2 uppercase font-bold flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--lime)] animate-ping" />
            <span>{isAr ? 'ذاتي نشط' : 'AUTONOMOUS ACTIVE'}</span>
          </div>
        </div>
      </div>

      {/* Core Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-[var(--stroke)] border-t border-[var(--stroke)]">
        <div className="bg-[var(--panel-bg-2)] p-3 font-mono">
          <div className="text-[8px] sm:text-[9px] tracking-wider text-[var(--text-3)] uppercase mb-1">
            {isAr ? 'قرارات/دقيقة' : 'DECISIONS/MIN'}
          </div>
          <div className="text-sm sm:text-base font-bold text-[var(--cyan)]">
            284
          </div>
        </div>

        <div className="bg-[var(--panel-bg-2)] p-3 font-mono">
          <div className="text-[8px] sm:text-[9px] tracking-wider text-[var(--text-3)] uppercase mb-1">
            {isAr ? 'نسبة الفوز' : 'WIN RATE'}
          </div>
          <div className="text-sm sm:text-base font-bold text-[var(--lime)]">
            {winRatePct.toFixed(1)}%
          </div>
        </div>

        <div className="bg-[var(--panel-bg-2)] p-3 font-mono">
          <div className="text-[8px] sm:text-[9px] tracking-wider text-[var(--text-3)] uppercase mb-1">
            {isAr ? 'متوسط الاستجابة' : 'AVG LATENCY'}
          </div>
          <div className="text-sm sm:text-base font-bold text-[var(--text)]">
            {latencyMs}ms
          </div>
        </div>

        <div className="bg-[var(--panel-bg-2)] p-3 font-mono">
          <div className="text-[8px] sm:text-[9px] tracking-wider text-[var(--text-3)] uppercase mb-1">
            {isAr ? 'صفقات مفتوحة' : 'OPEN POSITIONS'}
          </div>
          <div className="text-sm sm:text-base font-bold text-[var(--text)]">
            {openPositionsCount}
          </div>
        </div>
      </div>
    </section>
  );
});
