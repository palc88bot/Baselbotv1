import React, { useState, useMemo } from 'react';
import {
  Brain,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Zap,
  Info,
  Layers,
  Sparkles,
  BarChart3,
  Activity,
  Cpu,
  RefreshCw,
  Eye,
  Sliders,
  Maximize2
} from 'lucide-react';
import {
  AgentProfileReport,
  BoardDecision,
  AgentConfidenceShift,
  TradeLearningEvent
} from '../hooks/useBoardLearningSync';

interface QuantumBoardNodeGraphProps {
  agents: AgentProfileReport[];
  latestDecision: BoardDecision | null;
  recentShifts: Record<string, AgentConfidenceShift>;
  selectedSymbol: string;
  isAr: boolean;
  onHoldMeeting: () => void;
  onSimulateTrade: (pnl: number, symbol?: string, reason?: string) => void;
  playTone?: (freq?: number, duration?: number) => void;
}

// Fixed coordinates in 1000x700 viewport for a balanced orbital quantum topology
const NODE_COORDINATES: Record<string, { x: number; y: number }> = {
  // Center Hub
  core: { x: 500, y: 350 },

  // 6 Alpha Decision Makers (Left orbital wing)
  algo: { x: 190, y: 100 },
  trading: { x: 140, y: 200 },
  quant: { x: 120, y: 320 },
  scout: { x: 135, y: 440 },
  market: { x: 185, y: 555 },
  risk: { x: 265, y: 635 },

  // 8 Anti-Overfitting Guards (Right orbital shield)
  wf: { x: 810, y: 80 },
  oos: { x: 865, y: 165 },
  cross: { x: 890, y: 255 },
  tf: { x: 895, y: 350 },
  sens: { x: 885, y: 445 },
  boot: { x: 865, y: 535 },
  stress: { x: 815, y: 615 },
  regime: { x: 735, y: 655 },
};

export const QuantumBoardNodeGraph: React.FC<QuantumBoardNodeGraphProps> = ({
  agents,
  latestDecision,
  recentShifts,
  selectedSymbol,
  isAr,
  onHoldMeeting,
  onSimulateTrade,
  playTone
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'alpha' | 'guards' | 'active'>('all');
  const [viewLayout, setViewLayout] = useState<'graph' | 'cards'>('graph');
  const [customPnl, setCustomPnl] = useState<string>('12.5');

  const selectedAgent = useMemo(() => {
    return agents.find(a => a.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const votes = latestDecision?.votes || {};
  const proposals = latestDecision?.proposals || {};
  const verdict = latestDecision?.verdict || 'CONDITIONAL';
  const approvalRatio = latestDecision?.approvalRatio ?? 0.74;
  const guardsPassed = latestDecision?.guardsPassed ?? 7;
  const basicApproved = latestDecision?.basicApproved ?? 5;
  const sizeMultiplier = latestDecision?.sizeMultiplier ?? 0.5;

  const coreColors = useMemo(() => {
    if (verdict === 'APPROVED') {
      return {
        glow: 'rgba(16, 185, 129, 0.45)',
        border: '#10b981',
        text: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
      };
    }
    if (verdict === 'CONDITIONAL') {
      return {
        glow: 'rgba(245, 158, 11, 0.45)',
        border: '#f59e0b',
        text: 'text-amber-400',
        badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300'
      };
    }
    return {
      glow: 'rgba(244, 63, 94, 0.45)',
      border: '#f43f5e',
      text: 'text-rose-400',
      badgeBg: 'bg-rose-500/20 border-rose-500/40 text-rose-300'
    };
  }, [verdict]);

  // Helper to render mini sparkline for performance curve
  const renderSparkline = (curve: number[], color: string, width = 72, height = 22) => {
    if (!curve || curve.length < 2) {
      return (
        <svg width={width} height={height} className="overflow-visible">
          <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.6} />
        </svg>
      );
    }
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const range = max - min || 0.1;
    const points = curve.map((val, idx) => {
      const x = (idx / (curve.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const lastX = width;
    const lastY = height - ((curve[curve.length - 1] - min) / range) * (height - 6) - 3;

    return (
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={`url(#grad-${color.replace('#', '')})`}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle cx={lastX} cy={lastY} r="2.5" fill="#ffffff" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* 🌌 Action & Simulation Test Bench Bar */}
      <div className="holo-panel rounded-2xl p-4 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-black/80 via-black/60 to-black/80 shadow-[0_0_25px_rgba(0,243,255,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,243,255,0.3)]">
            <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white tracking-wide">
                {isAr ? 'مخطط توبولوجيا المجلس الكمي (Node-Graph)' : 'Quantum Board Neural Synapse Map'}
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                Live 14 Nodes
              </span>
            </div>
            <p className="text-[11px] font-mono text-[var(--muted)]">
              {isAr ? 'مراقبة حية لتصويت الوكلاء، فواصل الثقة، ومنحنيات الأداء التراكمية' : 'Live voting states, confidence gauges, and real-time performance curve evolution'}
            </p>
          </div>
        </div>

        {/* Real-Time Outcome Learning Test Bench */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider hidden sm:inline">
            {isAr ? 'حلقة التعلم اللحظي:' : 'Live Feedback:'}
          </span>
          <button
            onClick={() => {
              if (playTone) playTone(784, 0.12);
              onSimulateTrade(14.8, selectedSymbol, 'Simulated Take Profit Execution (+14.8 USDT)');
            }}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            title={isAr ? 'محاكاة صفقة رابحة وتحديث ثقة الوكلاء' : 'Simulate Win & Trigger learn_from_outcome'}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAr ? '+ صفقة رابحة (+14.8)' : '+ Win (+14.8)'}</span>
          </button>

          <button
            onClick={() => {
              if (playTone) playTone(330, 0.15);
              onSimulateTrade(-8.4, selectedSymbol, 'Simulated Stop Loss Triggered (-8.4 USDT)');
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            title={isAr ? 'محاكاة صفقة خاسرة وتحديث ثقة الوكلاء' : 'Simulate Loss & Trigger learn_from_outcome'}
          >
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span>{isAr ? '- صفقة خاسرة (-8.4)' : '- Loss (-8.4)'}</span>
          </button>

          <button
            onClick={() => {
              if (playTone) playTone(587, 0.15);
              onHoldMeeting();
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(0,243,255,0.2)]"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isAr ? 'مداولة جديدة' : 'Deliberate'}</span>
          </button>
        </div>
      </div>

      {/* 🧭 Filter Bar & Topology Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          {[
            { id: 'all', label: isAr ? 'كافة الوكلاء (14)' : 'All 14 Agents' },
            { id: 'alpha', label: isAr ? 'صناع القرار (6)' : 'Alpha Experts (6)' },
            { id: 'guards', label: isAr ? 'حراس الأمان (8)' : 'Shield Guards (8)' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => {
                setFilterMode(f.id as any);
                if (playTone) playTone(440, 0.05);
              }}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                filterMode === f.id
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-[0_0_10px_rgba(0,243,255,0.2)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View Layout Switcher (Graph vs Mobile Fast Cards) */}
        <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => {
              setViewLayout('graph');
              if (playTone) playTone(500, 0.05);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
              viewLayout === 'graph' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-gray-400 hover:text-white'
            }`}
          >
            {isAr ? '🕸️ مخطط العقد' : '🕸️ Graph'}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewLayout('cards');
              if (playTone) playTone(600, 0.05);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
              viewLayout === 'cards' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-gray-400 hover:text-white'
            }`}
          >
            {isAr ? '📱 بطاقات سريعة' : '📱 Fast Cards'}
          </button>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[var(--muted)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span>{isAr ? 'موافق (Approved)' : 'Approved'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
            <span>{isAr ? 'تحفظ (Challenge)' : 'Challenge'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_#f43f5e]" />
            <span>{isAr ? 'رفض (Rejected)' : 'Rejected'}</span>
          </div>
        </div>
      </div>

      {/* 🕸️ THE QUANTUM NODE GRAPH CANVAS OR MOBILE FAST CARDS */}
      {viewLayout === 'graph' ? (
        <div className="holo-panel rounded-2xl border border-cyan-500/20 relative overflow-hidden bg-[#020617] shadow-[0_0_40px_rgba(0,243,255,0.08)] select-none">
        {/* Subtle Quantum Grid Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0, 243, 255, 0.15) 0%, transparent 70%),
                              linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 40px 40px, 40px 40px'
          }}
        />

        <svg
          viewBox="0 0 1000 710"
          className="w-full h-auto max-h-[720px] relative z-10"
          style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }}
        >
          <defs>
            {/* Core Glow Filter */}
            <filter id="glow-core" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Edge Gradients */}
            <linearGradient id="edge-approved" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f3ff" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="edge-challenge" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f3ff" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="edge-rejected" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00f3ff" stopOpacity="0.3" />
            </linearGradient>

            {/* Subtle orbital dashed rings */}
            <radialGradient id="halo-radial" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={coreColors.border} stopOpacity="0.35" />
              <stop offset="70%" stopColor={coreColors.border} stopOpacity="0.08" />
              <stop offset="100%" stopColor={coreColors.border} stopOpacity="0.0" />
            </radialGradient>
          </defs>

          {/* Background Orbital Guide Rings */}
          <circle cx={500} cy={350} r={170} fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 6" />
          <circle cx={500} cy={350} r={310} fill="none" stroke="rgba(0,243,255,0.05)" strokeDasharray="4 8" />
          <circle cx={500} cy={350} r={220} fill="url(#halo-radial)" />

          {/* Section Headers inside SVG */}
          <text x={180} y={42} fill="rgba(129, 140, 248, 0.85)" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
            {isAr ? '🧠 صناع القرار (6 خبراء كميون)' : '🧠 ALPHA DECISION MAKERS (6)'}
          </text>
          <text x={820} y={42} fill="rgba(52, 211, 153, 0.85)" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
            {isAr ? '🛡️ درع حراس مكافحة الإفراط (8 حراس)' : '🛡️ ANTI-OVERFITTING SHIELD (8)'}
          </text>

          {/* Synaptic Bezier Edges connecting every Agent to Central Core */}
          {agents.map(agent => {
            const pos = NODE_COORDINATES[agent.id];
            if (!pos) return null;

            const vote = votes[agent.id] || 'approved';
            const strokeColor = vote === 'approved' ? '#10b981' : (vote === 'challenge' ? '#f59e0b' : '#f43f5e');
            const strokeGrad = vote === 'approved' ? 'url(#edge-approved)' : (vote === 'challenge' ? 'url(#edge-challenge)' : 'url(#edge-rejected)');
            const weightWidth = Math.max(1.2, agent.weight * 2.5);

            const isVisible = filterMode === 'all' ||
              (filterMode === 'alpha' && agent.type === 'alpha') ||
              (filterMode === 'guards' && agent.type === 'guard');

            const isSelected = selectedAgentId === agent.id;

            // Control points for organic holographic curvature
            const midX = (pos.x + 500) / 2;
            const midY = (pos.y + 350) / 2 + (pos.y > 350 ? -25 : 25);
            const pathData = `M ${pos.x} ${pos.y} Q ${midX} ${midY} 500 350`;

            return (
              <g key={`edge-${agent.id}`} opacity={isVisible ? (isSelected ? 1.0 : 0.65) : 0.15} className="transition-opacity duration-300">
                {/* Glow Base Path */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isSelected ? weightWidth + 2.5 : weightWidth}
                  strokeOpacity={isSelected ? 0.9 : 0.45}
                />

                {/* Animated Pulsing Photon Dashes along the curve */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={weightWidth}
                  strokeDasharray="6 14"
                  className="animate-dash"
                  opacity={0.85}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="100"
                    to="0"
                    dur={vote === 'approved' ? '2.5s' : '3.8s'}
                    repeatCount="indefinite"
                  />
                </path>

                {/* Particle beacon along edge */}
                {isSelected && (
                  <circle r="4" fill="#ffffff" filter="url(#glow-core)">
                    <animateMotion
                      path={pathData}
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* 🌟 1. CENTRAL SINGULARITY / CONSENSUS CORE HUB */}
          <g transform="translate(500, 350)" className="cursor-pointer" onClick={() => setSelectedAgentId(null)}>
            {/* Outer rotating pulse ring */}
            <circle
              r={92}
              fill="none"
              stroke={coreColors.border}
              strokeWidth="1.5"
              strokeDasharray="12 18"
              opacity="0.6"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to="360"
                dur="30s"
                repeatCount="indefinite"
              />
            </circle>

            {/* Inner pulsating glow disc */}
            <circle
              r={78}
              fill="#080e1e"
              stroke={coreColors.border}
              strokeWidth="2.5"
              filter="url(#glow-core)"
              className="transition-all duration-500"
            />

            {/* Consensus Quorum Gauge Ring */}
            <circle
              r={74}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="5"
            />
            <circle
              r={74}
              fill="none"
              stroke={coreColors.border}
              strokeWidth="5"
              strokeDasharray={`${(approvalRatio || 0.74) * 465} 465`}
              strokeLinecap="round"
              transform="rotate(-90)"
              className="transition-all duration-700"
            />

            {/* Center Core Text & Hologram Labeling */}
            <text y={-38} fill="#94a3b8" fontSize="9" fontFamily="monospace" textAnchor="middle" letterSpacing="1.5">
              QUANTUM CORE
            </text>

            <text y={-14} fill={coreColors.border} fontSize="17" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
              {verdict}
            </text>

            <text y={10} fill="#ffffff" fontSize="22" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
              {Math.round((approvalRatio || 0.74) * 100)}%
            </text>

            <text y={28} fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">
              {selectedSymbol}
            </text>

            <text y={46} fill={coreColors.border} fontSize="9" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
              {sizeMultiplier > 0 ? `${sizeMultiplier * 100}% SIZE` : 'VETO HALT'}
            </text>

            <text y={62} fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">
              Guards: {guardsPassed}/8 • Experts: {basicApproved}/6
            </text>
          </g>

          {/* 🧩 2. THE 14 AGENT NODES */}
          {agents.map(agent => {
            const pos = NODE_COORDINATES[agent.id];
            if (!pos) return null;

            const vote = votes[agent.id] || 'approved';
            const proposal = proposals[agent.id];
            const shift = recentShifts[agent.id];
            const isSelected = selectedAgentId === agent.id;
            const isAlpha = agent.type === 'alpha';

            const isVisible = filterMode === 'all' ||
              (filterMode === 'alpha' && isAlpha) ||
              (filterMode === 'guards' && !isAlpha);

            const voteColor = vote === 'approved' ? '#10b981' : (vote === 'challenge' ? '#f59e0b' : '#f43f5e');
            const cardBg = isSelected ? 'rgba(15, 23, 42, 0.95)' : 'rgba(8, 14, 28, 0.85)';

            return (
              <g
                key={`node-${agent.id}`}
                transform={`translate(${pos.x}, ${pos.y})`}
                opacity={isVisible ? 1 : 0.25}
                className="cursor-pointer transition-all duration-300"
                onClick={() => {
                  if (playTone) playTone(520, 0.08);
                  setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id);
                }}
              >
                {/* Node Box Halo */}
                <rect
                  x={-75}
                  y={-40}
                  width={150}
                  height={80}
                  rx={12}
                  fill={cardBg}
                  stroke={isSelected ? '#00f3ff' : voteColor}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter={isSelected ? 'url(#glow-core)' : undefined}
                  className="transition-all duration-300"
                />

                {/* Agent Type Badge (Alpha vs Guard) */}
                <rect
                  x={-68}
                  y={-33}
                  width={34}
                  height={13}
                  rx={3}
                  fill={isAlpha ? 'rgba(99, 102, 241, 0.25)' : 'rgba(16, 185, 129, 0.25)'}
                  stroke={isAlpha ? '#818cf8' : '#34d399'}
                  strokeWidth="0.8"
                />
                <text
                  x={-51}
                  y={-24}
                  fill={isAlpha ? '#a5b4fc' : '#6ee7b7'}
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isAlpha ? 'ALPHA' : 'GUARD'}
                </text>

                {/* Vote Indicator Pill */}
                <rect
                  x={22}
                  y={-33}
                  width={46}
                  height={13}
                  rx={3}
                  fill={vote === 'approved' ? 'rgba(16,185,129,0.2)' : (vote === 'challenge' ? 'rgba(245,158,11,0.2)' : 'rgba(244,63,94,0.2)')}
                  stroke={voteColor}
                  strokeWidth="0.8"
                />
                <text
                  x={45}
                  y={-24}
                  fill={voteColor}
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {vote.toUpperCase()}
                </text>

                {/* Agent Title & Name */}
                <text
                  x={-68}
                  y={-6}
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="start"
                >
                  {agent.name}
                </text>

                {/* Arabic Title */}
                <text
                  x={-68}
                  y={7}
                  fill="#94a3b8"
                  fontSize="8"
                  fontFamily="sans-serif"
                  textAnchor="start"
                >
                  {agent.arabicName}
                </text>

                {/* Metric Bars & Sparkline Container */}
                <g transform="translate(-68, 14)">
                  {/* Confidence Bar */}
                  <text x={0} y={8} fill="#64748b" fontSize="7.5" fontFamily="monospace">
                    CONF: {Math.round(agent.confidence * 100)}%
                  </text>
                  <rect x={0} y={11} width={65} height={3} rx={1.5} fill="rgba(255,255,255,0.1)" />
                  <rect
                    x={0}
                    y={11}
                    width={Math.max(4, 65 * agent.confidence)}
                    height={3}
                    rx={1.5}
                    fill={agent.confidence >= 0.7 ? '#00f3ff' : '#f59e0b'}
                  />

                  {/* Accuracy Bar */}
                  <text x={0} y={22} fill="#64748b" fontSize="7.5" fontFamily="monospace">
                    ACC: {Math.round(agent.accuracy * 100)}%
                  </text>

                  {/* Mini Performance Curve Sparkline (Embedded SVG in ForeignObject / Direct render) */}
                  <g transform="translate(68, 2)">
                    {renderSparkline(agent.learningCurve || [0.5, 0.6], voteColor, 68, 20)}
                  </g>
                </g>

                {/* 🚀 Dynamic Shift Badge (When trade result learning triggers) */}
                {shift && (
                  <g transform="translate(48, -48)">
                    <rect
                      x={-28}
                      y={-10}
                      width={56}
                      height={18}
                      rx={9}
                      fill={shift.direction === 'up' ? '#10b981' : '#f43f5e'}
                      filter="url(#glow-core)"
                    />
                    <text
                      x={0}
                      y={2}
                      fill="#ffffff"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {shift.direction === 'up' ? `+${(shift.deltaConf * 100).toFixed(1)}%` : `${(shift.deltaConf * 100).toFixed(1)}%`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* ℹ️ Node Graph Footer Ribbon */}
        <div className="p-3 bg-black/70 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[var(--muted)]">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>
              {isAr
                ? 'انقر على أي عقدة (Node) لفتح ملف الفحص التفصيلي ومنحنى التعلم الدقيق للوكيل'
                : 'Click any Agent Node to inspect live reasoning dossier & performance curve'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-cyan-300">
              {isAr ? `إجمالي القرارات المسجلة: ${agents.reduce((acc, a) => acc + a.totalDecisions, 0)}` : `Total Epoch Decisions: ${agents.reduce((acc, a) => acc + a.totalDecisions, 0)}`}
            </span>
          </div>
        </div>
      </div>
      ) : (
        /* 📱 FAST MOBILE CARDS VIEW (ZERO SVG OVERHEAD, SMOOTH SCROLLING) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents
              .filter(a => filterMode === 'all' || (filterMode === 'alpha' && a.type === 'alpha') || (filterMode === 'guards' && a.type === 'guard'))
              .map(agent => {
                const vote = votes[agent.id] || 'approved';
                const shift = recentShifts[agent.id];
                const isSelected = selectedAgentId === agent.id;
                const voteColor = vote === 'approved' 
                  ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' 
                  : vote === 'challenge' 
                  ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' 
                  : 'text-rose-400 border-rose-500/40 bg-rose-500/10';

                return (
                  <div
                    key={agent.id}
                    onClick={() => {
                      if (playTone) playTone(520, 0.05);
                      setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id);
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer bg-black/60 relative overflow-hidden ${
                      isSelected ? 'border-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'border-white/10 hover:border-cyan-500/30'
                    }`}
                  >
                    {shift && (
                      <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        shift.direction === 'up' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {shift.direction === 'up' ? `+${(shift.deltaConf * 100).toFixed(1)}%` : `${(shift.deltaConf * 100).toFixed(1)}%`}
                      </div>
                    )}
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                      <div>
                        <span className="font-mono text-xs font-bold text-white block">{agent.name}</span>
                        <span className="text-[10px] text-[var(--muted)]">{agent.arabicName}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${voteColor}`}>
                        {vote.toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[var(--muted)]">{isAr ? 'الثقة:' : 'Confidence:'}</span>
                        <span className="font-bold text-cyan-300">{Math.round(agent.confidence * 100)}%</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-400" style={{ width: `${agent.confidence * 100}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted)] pt-1">
                        <span>{isAr ? 'الدقة:' : 'Accuracy:'} <b className="text-emerald-400">{Math.round(agent.accuracy * 100)}%</b></span>
                        <span>{isAr ? 'الوزن:' : 'Weight:'} <b className="text-indigo-300">{agent.weight.toFixed(2)}x</b></span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 📋 INSPECTOR PANEL: AGENT DOSSIER & INDIVIDUAL PERFORMANCE CURVE */}
      {selectedAgent && (
        <div className="holo-panel rounded-2xl p-6 border border-cyan-400/40 bg-gradient-to-br from-black/95 via-[#080e1e] to-black/95 shadow-[0_0_30px_rgba(0,243,255,0.18)] space-y-4 animate-in fade-in duration-300">
          <div className="flex items-start justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
                {selectedAgent.type === 'alpha' ? <Brain className="w-6 h-6 text-indigo-400" /> : <ShieldCheck className="w-6 h-6 text-emerald-400" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white font-mono">{selectedAgent.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    selectedAgent.type === 'alpha'
                      ? 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-300'
                      : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                  }`}>
                    {selectedAgent.type === 'alpha' ? (isAr ? 'خبير ألفا أساسي' : 'Alpha Expert') : (isAr ? 'حارس جودة إحصائي' : 'Protection Guard')}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)]">{selectedAgent.arabicName} — {selectedAgent.role}</p>
              </div>
            </div>

            <button
              onClick={() => setSelectedAgentId(null)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-black/50 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">{isAr ? 'مستوى الثقة اللحظي' : 'Confidence'}</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-cyan-300">{Math.round(selectedAgent.confidence * 100)}%</span>
                <span className="text-[10px] text-gray-400 font-mono">{selectedAgent.confidence >= 0.75 ? 'HIGH' : 'MODERATE'}</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${selectedAgent.confidence * 100}%` }} />
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">{isAr ? 'الدقة التاريخية' : 'Accuracy'}</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">{Math.round(selectedAgent.accuracy * 100)}%</span>
                <span className="text-[10px] text-gray-400 font-mono">{selectedAgent.correctDecisions}/{selectedAgent.totalDecisions}</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${selectedAgent.accuracy * 100}%` }} />
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">{isAr ? 'وزن التصويت المرجّح' : 'Vote Weight'}</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-indigo-300">{selectedAgent.weight.toFixed(3)}x</span>
                <span className="text-[10px] text-gray-400 font-mono">Quorum Power</span>
              </div>
              <p className="text-[10px] font-mono text-gray-400 mt-2 truncate">
                Formula: Conf * (0.5 + Acc*0.5)
              </p>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-xl p-3">
              <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">{isAr ? 'تصويت آخر مداولة' : 'Latest Vote'}</span>
              <div className="mt-1">
                {votes[selectedAgent.id] === 'approved' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> APPROVED
                  </span>
                )}
                {votes[selectedAgent.id] === 'challenge' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-mono font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" /> CHALLENGE
                  </span>
                )}
                {votes[selectedAgent.id] === 'rejected' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 text-rose-400 text-xs font-mono font-bold">
                    <XCircle className="w-3.5 h-3.5" /> REJECTED
                  </span>
                )}
                {!votes[selectedAgent.id] && (
                  <span className="text-gray-400 text-xs font-mono">STANDBY</span>
                )}
              </div>
              <p className="text-[10px] text-cyan-300 font-mono mt-2 truncate">
                {proposals[selectedAgent.id]?.riskPct ? `Risk: ${(proposals[selectedAgent.id].riskPct * 100).toFixed(2)}%` : 'Active Node'}
              </p>
            </div>
          </div>

          {/* Performance Curve Chart (Expanded) */}
          <div className="bg-black/60 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                {isAr ? 'منحنى أداء ودقة الوكيل عبر الصفقات (Epoch Learning Curve)' : 'Agent Historical Accuracy Learning Curve'}
              </span>
              <span className="text-[11px] font-mono text-[var(--muted)]">
                {selectedAgent.learningCurve?.length || 0} Epoch Points
              </span>
            </div>

            <div className="h-28 w-full flex items-end pt-2">
              {selectedAgent.learningCurve && selectedAgent.learningCurve.length > 1 ? (
                <div className="w-full h-full">
                  <svg viewBox="0 0 500 90" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id={`grad-inspect-${selectedAgent.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#00f3ff" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Horizontal grid lines */}
                    <line x1="0" y1="15" x2="500" y2="15" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <line x1="0" y1="45" x2="500" y2="45" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <line x1="0" y1="75" x2="500" y2="75" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                    {(() => {
                      const curve = selectedAgent.learningCurve;
                      const min = Math.min(...curve) * 0.9;
                      const max = Math.max(...curve) * 1.05;
                      const range = max - min || 0.1;
                      const pts = curve.map((v, i) => {
                        const x = (i / (curve.length - 1)) * 500;
                        const y = 80 - ((v - min) / range) * 70;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      }).join(' ');

                      return (
                        <>
                          <polygon
                            points={`0,85 ${pts} 500,85`}
                            fill={`url(#grad-inspect-${selectedAgent.id})`}
                          />
                          <polyline
                            fill="none"
                            stroke="#00f3ff"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={pts}
                          />
                          {curve.map((v, idx) => {
                            const cx = (idx / (curve.length - 1)) * 500;
                            const cy = 80 - ((v - min) / range) * 70;
                            return (
                              <circle
                                key={idx}
                                cx={cx}
                                cy={cy}
                                r={idx === curve.length - 1 ? 4 : 2.5}
                                fill={idx === curve.length - 1 ? '#ffffff' : '#00f3ff'}
                                stroke="#080e1e"
                                strokeWidth="1.5"
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-mono text-[var(--muted)]">
                  {isAr ? 'جاري بناء سجل النقاط الإحصائية...' : 'Building epoch history...'}
                </div>
              )}
            </div>
          </div>

          {/* Proposal Justification Note */}
          <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-xs font-mono">
            <span className="text-cyan-400 font-bold block mb-1">
              💬 {isAr ? 'الملاحظة التحليلية الأخيرة:' : 'Live Proposal Reasoning:'}
            </span>
            <p className="text-gray-300">
              {proposals[selectedAgent.id]?.note || (isAr ? 'النموذج الإحصائي والتحليلي يعمل بكفاءة كاملة' : 'Statistical and quantitative model operating at optimum parameters')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
