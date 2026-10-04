/**
 * Basel AlgoCore Constellation Overlay
 * Dynamic SVG curve rays linking the Neural Decision Core to active signals and trades
 */

import React, { useEffect, useState } from 'react';

export interface ConstellationRay {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isWin: boolean;
  pair: string;
}

export const ConstellationOverlay: React.FC = () => {
  const [rays, setRays] = useState<ConstellationRay[]>([]);

  useEffect(() => {
    const handleFireConstellation = (e: CustomEvent<{ pair: string; isWin: boolean }>) => {
      const { pair, isWin } = e.detail;
      const coreEl = document.getElementById('coreCanvas');
      const sigEl = document.querySelector(`[data-pair="${pair}"]`) || document.getElementById('signalsPanel');

      if (!coreEl || !sigEl) return;

      const cRect = coreEl.getBoundingClientRect();
      const sRect = sigEl.getBoundingClientRect();

      const x1 = cRect.left + cRect.width / 2;
      const y1 = cRect.top + cRect.height / 2;
      const x2 = sRect.left + sRect.width / 2;
      const y2 = sRect.top + sRect.height / 2;

      const newRay: ConstellationRay = {
        id: `ray-${Date.now()}-${Math.random()}`,
        x1,
        y1,
        x2,
        y2,
        isWin,
        pair,
      };

      setRays((prev) => [...prev.slice(-4), newRay]);

      setTimeout(() => {
        setRays((prev) => prev.filter((r) => r.id !== newRay.id));
      }, 1400);
    };

    window.addEventListener('nexus-constellation' as any, handleFireConstellation);
    return () => {
      window.removeEventListener('nexus-constellation' as any, handleFireConstellation);
    };
  }, []);

  if (rays.length === 0) return null;

  return (
    <svg className="fixed inset-0 z-50 pointer-events-none w-full h-full overflow-visible" aria-hidden="true">
      <defs>
        <filter id="glow-ray">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {rays.map((ray) => {
        const mx = (ray.x1 + ray.x2) / 2;
        const my = Math.min(ray.y1, ray.y2) - 50;
        const d = `M${ray.x1},${ray.y1} Q${mx},${my} ${ray.x2},${ray.y2}`;
        const strokeColor = ray.isWin ? 'var(--lime)' : 'var(--magenta)';

        return (
          <g key={ray.id} filter="url(#glow-ray)">
            <path
              d={d}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.6"
              strokeLinecap="round"
              className="animate-[rayFade_1.4s_cubic-bezier(0.22,0.61,0.36,1)_forwards]"
              style={{
                strokeDasharray: '400',
                strokeDashoffset: '400',
                animation: 'rayDraw 1.4s ease-out forwards',
              }}
            />
          </g>
        );
      })}
    </svg>
  );
};
