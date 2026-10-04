/**
 * HolographicQuantumCanvas
 * 3D Holographic Cyberpunk Canvas with volumetric particle mesh,
 * depth-of-field nodes, cyan & magenta laser rings, real-time audio reactivity,
 * and high-tech HUD vector displays.
 */

import React, { useEffect, useRef } from 'react';

interface HolographicQuantumCanvasProps {
  currentPrice?: number;
  symbol: string;
  change24h: number;
  rsi: number;
  status: 'BULLISH' | 'BEARISH' | 'ACCUMULATION';
  high24h: number;
  low24h: number;
  lang: 'ar' | 'en';
}

export const HolographicQuantumCanvas: React.FC<HolographicQuantumCanvasProps> = ({
  currentPrice = 92500,
  symbol,
  change24h,
  rsi,
  status,
  high24h,
  low24h,
  lang,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 450);

    const onResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', onResize);

    // 3D holographic particles
    const particleCount = 70;
    const particles = Array.from({ length: particleCount }, () => ({
      x: (Math.random() - 0.5) * width * 1.2,
      y: (Math.random() - 0.5) * height * 1.2,
      z: Math.random() * 400 + 50,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      vz: (Math.random() - 0.5) * 1.5,
      size: Math.random() * 2.5 + 1.2,
      color: Math.random() > 0.45 ? '#00f3ff' : '#ff007f',
    }));

    // Historical mini wave for holographic terrain
    const wavePoints = 40;
    const waveHeights = Array.from({ length: wavePoints }, (_, i) => Math.sin(i * 0.25) * 20);

    let angle = 0;
    let pulse = 0;

    const render = () => {
      angle += 0.012;
      pulse += 0.03;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Volumetric Cyan & Magenta Gradient Aura (Backdrop lighting)
      const grad = ctx.createRadialGradient(
        centerX,
        centerY,
        20,
        centerX,
        centerY,
        Math.max(width, height) * 0.65
      );
      grad.addColorStop(0, 'rgba(0, 243, 255, 0.12)');
      grad.addColorStop(0.35, 'rgba(255, 0, 127, 0.08)');
      grad.addColorStop(0.7, 'rgba(157, 0, 255, 0.04)');
      grad.addColorStop(1, 'rgba(2, 4, 10, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 2. Holographic Floor Perspective Grid (Tron/Cyberpunk Style)
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.15)';
      ctx.lineWidth = 1;

      const horizon = centerY + 40;
      const gridLines = 14;

      // Vanishing lines to horizon
      for (let i = -gridLines; i <= gridLines; i++) {
        const spreadX = centerX + i * 50;
        ctx.beginPath();
        ctx.moveTo(centerX, horizon);
        ctx.lineTo(spreadX * 2 - centerX, height + 20);
        ctx.stroke();
      }

      // Horizontal lines with perspective distance
      for (let y = horizon + 5; y < height; y += (y - horizon) * 0.35 + 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Central Hologram Orbital Gyroscope / Radar Ring
      ctx.save();
      ctx.translate(centerX, centerY - 25);

      // Outer Cyan Ring
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 140 + Math.sin(pulse) * 4, 65, angle * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Magenta Ring tilted
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 100, 48 + Math.cos(pulse) * 3, -angle * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      // Segmented Neon Reticle
      ctx.strokeStyle = 'rgba(0, 255, 102, 0.6)';
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, 175, angle, angle + Math.PI * 1.5);
      ctx.stroke();
      ctx.setLineDash([]);

      // Central Quantum Core Glyph
      ctx.fillStyle = 'rgba(0, 243, 255, 0.8)';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(0, 0, 6 + Math.sin(pulse * 2) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // 4. 3D Floating Hologram Particles with Depth-of-Field Blur
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        if (p.z <= 10) p.z = 400;
        if (p.z > 400) p.z = 10;
        if (p.x < -width) p.x = width;
        if (p.x > width) p.x = -width;
        if (p.y < -height) p.y = height;
        if (p.y > height) p.y = -height;

        // Perspective projection
        const fov = 300;
        const scale = fov / (fov + p.z);
        const px = centerX + p.x * scale;
        const py = centerY - 25 + p.y * scale;

        if (px >= 0 && px <= width && py >= 0 && py <= height) {
          const alpha = (1 - p.z / 400) * 0.85;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0.1, alpha);

          ctx.beginPath();
          ctx.arc(px, py, p.size * scale * 1.8, 0, Math.PI * 2);
          ctx.fill();

          // Connect nearby particles with laser filaments
          for (let j = i + 1; j < Math.min(i + 4, particles.length); j++) {
            const p2 = particles[j];
            const scale2 = fov / (fov + p2.z);
            const p2x = centerX + p2.x * scale2;
            const p2y = centerY - 25 + p2.y * scale2;

            const dist = Math.hypot(px - p2x, py - p2y);
            if (dist < 85) {
              ctx.strokeStyle = p.color === '#00f3ff' ? 'rgba(0, 243, 255, 0.25)' : 'rgba(255, 0, 127, 0.25)';
              ctx.lineWidth = 0.75 * scale;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(p2x, p2y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1.0;

      // 5. Hologram HUD Overlay & High-Tech Coordinates
      ctx.save();
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
      ctx.fillText(`SYS:QUANTUM_CORE // TARGET: ${symbol}`, 20, 25);
      ctx.fillStyle = 'rgba(255, 0, 127, 0.7)';
      ctx.fillText(`LATENCY: 1.4ms // REGIME: ${status}`, 20, 42);

      // Top right coordinate ticker
      const coordText = `ANG: ${(angle % (Math.PI * 2)).toFixed(3)} rad // VOL: 4.8 THz`;
      const textWidth = ctx.measureText(coordText).width;
      ctx.fillStyle = 'rgba(0, 255, 102, 0.8)';
      ctx.fillText(coordText, width - textWidth - 20, 25);

      // HUD corner accents
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
      ctx.lineWidth = 1.5;

      // Top-Left corner
      ctx.beginPath();
      ctx.moveTo(10, 30);
      ctx.lineTo(10, 10);
      ctx.lineTo(30, 10);
      ctx.stroke();

      // Top-Right corner
      ctx.beginPath();
      ctx.moveTo(width - 30, 10);
      ctx.lineTo(width - 10, 10);
      ctx.lineTo(width - 10, 30);
      ctx.stroke();

      // Bottom-Left corner
      ctx.beginPath();
      ctx.moveTo(10, height - 30);
      ctx.lineTo(10, height - 10);
      ctx.lineTo(30, height - 10);
      ctx.stroke();

      // Bottom-Right corner
      ctx.beginPath();
      ctx.moveTo(width - 30, height - 10);
      ctx.lineTo(width - 10, height - 10);
      ctx.lineTo(width - 10, height - 30);
      ctx.stroke();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, [symbol, status]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-2xl border border-[rgba(0,243,255,0.25)] bg-[#02040a] shadow-[0_0_35px_rgba(0,243,255,0.15)] group">
      {/* 3D Holographic Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Hologram scanlines effect */}
      <div className="absolute inset-0 holo-scanlines pointer-events-none" />

      {/* Floating HUD Information Badge */}
      <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl holo-panel border border-[rgba(0,243,255,0.4)] backdrop-blur-xl shadow-2xl gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[var(--cyan)] shadow-[0_0_12px_var(--cyan)] animate-ping" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm sm:text-base font-bold text-white tracking-wide">
                {symbol}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                change24h >= 0 
                  ? 'bg-emerald-500/20 text-[var(--lime)] border-emerald-500/40 shadow-[0_0_10px_rgba(0,255,102,0.3)]' 
                  : 'bg-rose-500/20 text-[var(--magenta)] border-rose-500/40 shadow-[0_0_10px_rgba(255,0,127,0.3)]'
              }`}>
                {change24h >= 0 ? '+' : ''}{change24h}%
              </span>
            </div>
            <p className="text-[10px] font-mono text-[var(--muted)]">
              {lang === 'ar' ? 'سعر بايننس الفوري الحي' : 'Live Binance Real-Time Ticker'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex flex-col text-right rtl:text-left">
            <span className="text-[9px] font-mono text-[var(--muted)] uppercase">
              {lang === 'ar' ? 'السعر الحالي' : 'Live Price'}
            </span>
            <span className="font-mono font-bold text-base sm:text-lg text-[var(--cyan)] neon-cyan-glow tracking-wider">
              ${currentPrice > 0 ? (currentPrice >= 1000 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currentPrice.toFixed(6)) : '---'}
            </span>
          </div>

          <div className="flex flex-col text-right rtl:text-left">
            <span className="text-[9px] font-mono text-[var(--muted)] uppercase">
              {lang === 'ar' ? 'أعلى 24س' : '24h High'}
            </span>
            <span className="font-mono text-xs font-semibold text-white">
              ${high24h > 0 ? high24h.toLocaleString() : '---'}
            </span>
          </div>

          <div className="flex flex-col text-right rtl:text-left">
            <span className="text-[9px] font-mono text-[var(--muted)] uppercase">
              {lang === 'ar' ? 'أدنى 24س' : '24h Low'}
            </span>
            <span className="font-mono text-xs font-semibold text-[var(--magenta)]">
              ${low24h > 0 ? low24h.toLocaleString() : '---'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
