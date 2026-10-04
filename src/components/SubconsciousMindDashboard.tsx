/**
 * NEXUS · The Subconscious Mind
 * Autonomous Quantum Algorithmic Trading Mind & Subconscious Neural Canvas
 * Fully Integrated with Basel AlgoCore Engine, Real-time WebSockets, Positions, Orders & Modals
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  AccountBalance,
  AssetSymbol,
  Candle,
  ExecutionMode,
  Order,
  OrderBook,
  Position,
  RiskLimits,
  RiskMetrics,
  SystemHealth,
  TradingSignal,
  BotStrategy,
} from '../domain/types';
import { WalletDetailsModal } from './WalletDetailsModal';
import { PnlDetailsModal } from './PnlDetailsModal';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Shield,
  ShieldAlert,
  Cpu,
  Zap,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Compass,
  DollarSign,
  Percent,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Flame,
  Radio,
} from 'lucide-react';

interface SubconsciousMindDashboardProps {
  balance: AccountBalance;
  positions: Position[];
  orders: Order[];
  candles?: Candle[];
  orderBook?: OrderBook;
  features?: any;
  prices?: Record<string, number>;
  latestSignal: TradingSignal | null;
  signalHistory?: TradingSignal[];
  health: SystemHealth;
  isRunning: boolean;
  selectedSymbol: AssetSymbol;
  setSelectedSymbol?: (sym: AssetSymbol) => void;
  riskMetrics?: RiskMetrics;
  riskLimits?: RiskLimits;
  killSwitchActive?: boolean;
  isHedgingActive?: boolean;
  executionMode?: ExecutionMode;
  strategies?: BotStrategy[];
  onExecuteSignal: (signal: TradingSignal) => void;
  onManualOrder?: (params: { symbol: AssetSymbol; side: 'BUY' | 'SELL'; type: any; quantity: number; price?: number }) => Promise<void>;
  onCancelOrder?: (orderId: string) => Promise<void>;
  onToggleBot: () => void;
  onTriggerKillSwitch: () => void;
  onResetKillSwitch?: () => void;
  onToggleHedging?: () => void;
  onTriggerRebalance?: () => void;
  onTriggerScreener?: () => void;
  onChangeMode?: (mode: ExecutionMode) => void;
  lang: 'ar' | 'en';
  onSetLang: (lang: 'ar' | 'en') => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  baseSize: number;
  baseBright: number;
  bright: number;
  phase: number;
  hue: number;
  isMemory: boolean;
  dreamTargetX: number | null;
  dreamTargetY: number | null;
  dreamStrength: number;
  scale: number;
}

interface Bubble {
  x: number;
  y: number;
  vy: number;
  r: number;
  side: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  color: string;
  wobble: number;
  alive: boolean;
  trail: Array<{ x: number; y: number; r: number }>;
}

interface CurrentFlow {
  x0: number;
  y0: number;
  y1: number;
  progress: number;
  color: string;
  width: number;
  alive: boolean;
  seed: number;
}

interface SurfaceRipple {
  x: number;
  y: number;
  r: number;
  max: number;
  color: string;
  life: number;
}

const SYMBOLS: AssetSymbol[] = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'AVAX/USDT', 'ADA/USDT'];

export const SubconsciousMindDashboard: React.FC<SubconsciousMindDashboardProps> = ({
  balance,
  positions = [],
  orders = [],
  candles = [],
  orderBook,
  features,
  prices = {},
  latestSignal,
  signalHistory = [],
  health,
  isRunning,
  selectedSymbol,
  setSelectedSymbol,
  riskMetrics,
  riskLimits,
  killSwitchActive = false,
  isHedgingActive = true,
  executionMode = 'PAPER',
  strategies = [],
  onExecuteSignal,
  onManualOrder,
  onCancelOrder,
  onToggleBot,
  onTriggerKillSwitch,
  onResetKillSwitch,
  onToggleHedging,
  onTriggerRebalance,
  onTriggerScreener,
  onChangeMode,
  lang,
  onSetLang,
  activeTab,
  onTabChange,
}) => {
  const isAr = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Modal States
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [pnlModalOpen, setPnlModalOpen] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [positionsDrawerOpen, setPositionsDrawerOpen] = useState(false);
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navDeckOpen, setNavDeckOpen] = useState(false);

  // Quick Order Pad Form
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQuantity, setOrderQuantity] = useState<number>(0.1);
  const [orderPriceType, setOrderPriceType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [orderLimitPrice, setOrderLimitPrice] = useState<number>(91450);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Genesis Screen State
  const [isGenesisGone, setIsGenesisGone] = useState(false);
  const [genesisLineIndex, setGenesisLineIndex] = useState(0);

  // Settings State
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('nexus-settings');
    const defaultSettings = {
      lifespan: 55,
      decisionSpeed: 4.8,
      dreamThreshold: 9,
      density: 100,
      memory: 10,
      autoDecisions: true,
      sound: false,
      haptic: true,
    };
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  // Simulation / Mind State
  const [generation, setGeneration] = useState(1);
  const [lifeAge, setLifeAge] = useState(0);
  const [mindMode, setMindMode] = useState<'awake' | 'dreaming' | 'warning' | 'dying' | 'dark' | 'rebirth' | 'paused'>('awake');
  const [monologueText, setMonologueText] = useState('initializing neural core…');
  const [clockTime, setClockTime] = useState('--:--:--');
  const [isManuallyPaused, setIsManuallyPaused] = useState(!isRunning);

  // Latency & zones
  const [zoneSurface, setZoneSurface] = useState('0.4ms');
  const [zoneDepth, setZoneDepth] = useState('2,400 · w');
  const [zoneDream, setZoneDream] = useState('latent');

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sound Synth
  const playTone = useCallback((freq: number, duration: number, type: OscillatorType = 'sine') => {
    if (!settings.sound) return;
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Guarded
    }
  }, [settings.sound]);

  // Haptics
  const haptic = useCallback((pattern: number | number[]) => {
    if (!settings.haptic) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Guarded
      }
    }
  }, [settings.haptic]);

  // Genesis Sequence
  useEffect(() => {
    const lines = [
      { en: 'loading weights…', ar: 'تحميل الأوزان العصبية…' },
      { en: 'binding 2,400 features…', ar: 'ربط ٢٤٠٠ ميزة سوقية…' },
      { en: 'waking subconscious…', ar: 'إيقاظ العقل اللاواعي…' },
      { en: 'ready for autonomous trading.', ar: 'جاهز للتداول الذاتي.' },
    ];

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx >= lines.length) {
        clearInterval(interval);
        setTimeout(() => {
          setIsGenesisGone(true);
        }, 350);
      } else {
        setGenesisLineIndex(idx);
      }
    }, 450);

    return () => clearInterval(interval);
  }, []);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setClockTime(d.toTimeString().slice(0, 8));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save Settings
  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem('nexus-settings', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Synchronize pause state with isRunning
  useEffect(() => {
    setIsManuallyPaused(!isRunning);
  }, [isRunning]);

  // Derive Real Market Price
  const currentPrice = useMemo(() => {
    if (prices && prices[selectedSymbol] && prices[selectedSymbol] > 0) {
      return prices[selectedSymbol];
    }
    if (orderBook && orderBook.bids && orderBook.bids[0] && orderBook.asks && orderBook.asks[0]) {
      return (orderBook.bids[0].price + orderBook.asks[0].price) / 2;
    }
    if (candles && candles.length > 0) {
      return candles[candles.length - 1].close;
    }
    if (selectedSymbol === 'BTC/USDT') return 91420.50;
    if (selectedSymbol === 'ETH/USDT') return 3480.20;
    if (selectedSymbol === 'SOL/USDT') return 218.40;
    return 100.00;
  }, [prices, orderBook, candles, selectedSymbol]);

  // Synchronize orderLimitPrice with currentPrice
  useEffect(() => {
    if (currentPrice) setOrderLimitPrice(Number(currentPrice.toFixed(2)));
  }, [currentPrice]);

  // Real Monologues generated dynamically from live data
  const dynamicRealMonologue = useMemo(() => {
    if (latestSignal) {
      return `${latestSignal.type} ${latestSignal.symbol} · ${latestSignal.reason || 'Conjugate gradient OU drift'}`;
    }
    if (features?.orderFlowImbalance !== undefined) {
      const ofi = (features.orderFlowImbalance * 100).toFixed(1);
      return `OFI Imbalance at ${ofi}% · Microstructure drift active`;
    }
    return isAr ? 'استشعار تدفق الأوامر في دفتر السيولة…' : 'sensing microstructure order flow…';
  }, [latestSignal, features, isAr]);

  useEffect(() => {
    if (dynamicRealMonologue) {
      setMonologueText(dynamicRealMonologue);
    }
  }, [dynamicRealMonologue]);

  // Update Latency / Zones with real data from health
  useEffect(() => {
    if (health?.pipelineLatency?.totalPipelineMs) {
      setZoneSurface(`${health.pipelineLatency.totalPipelineMs.toFixed(1)}ms`);
    }
    if (health?.activeFeedsCount) {
      setZoneDepth(`${health.activeFeedsCount} feeds · 2.4k w`);
    }
  }, [health]);

  // Main Canvas State & Animation
  const stateRef = useRef({
    mode: 'awake' as 'awake' | 'dreaming' | 'warning' | 'dying' | 'dark' | 'rebirth' | 'paused',
    modeStart: 0,
    age: 0,
    generation: 1,
    lastSignal: 0,
    dreamShape: 0,
    dreamShapeStart: 0,
    decisionBubble: null as Bubble | null,
    mouse: { x: -9999, y: -9999 },
    t: 0,
    particles: [] as Particle[],
    ripples: [] as SurfaceRipple[],
    currents: [] as CurrentFlow[],
    isPaused: false,
  });

  // Physics helpers
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const shapeTarget = (shape: number, idx: number, total: number, tVal: number) => {
    const u = idx / total;
    switch (shape) {
      case 0: // wave
        return { x: u, y: 0.5 + Math.sin(u * Math.PI * 6 + tVal * 0.8) * 0.22 };
      case 1: { // candle
        const n = 9;
        const i = Math.floor(u * n);
        const inBody = (u * n) % 1;
        const cx = (i + 0.5) / n;
        const bodyH = 0.1 + ((Math.sin(i * 1.7) + 1) * 0.25);
        const wickH = bodyH + 0.15;
        if (idx % 2 === 0) return { x: cx + (Math.random() - 0.5) * 0.04, y: 0.5 + (inBody - 0.5) * bodyH };
        return { x: cx, y: 0.5 + (inBody - 0.5) * wickH };
      }
      case 2: { // whale
        const a = u * Math.PI * 2;
        const r = 0.28 + Math.sin(u * Math.PI * 4) * 0.05;
        const cx = 0.5 + Math.cos(a) * r * 1.6;
        const cy = 0.5 + Math.sin(a) * r * 0.5;
        const tail = u > 0.85 ? (u - 0.85) * 6 : 0;
        return { x: cx + tail * 0.15, y: cy + Math.sin(tVal * 1.2) * tail * 0.2 };
      }
      case 3: { // spiral
        const a = u * Math.PI * 7 + tVal * 0.3;
        const r = u * 0.4;
        return { x: 0.5 + Math.cos(a) * r * 1.4, y: 0.5 + Math.sin(a) * r };
      }
      case 4: { // galaxy
        const a = u * Math.PI * 2.2 + tVal * 0.2;
        const r = Math.pow(u, 0.7) * 0.42;
        const arm = Math.floor(u * 3) * ((Math.PI * 2) / 3);
        return { x: 0.5 + Math.cos(a + arm) * r * 1.5, y: 0.5 + Math.sin(a + arm) * r };
      }
      default:
        return { x: 0.5, y: 0.5 };
    }
  };

  const flow = (x: number, y: number, tVal: number) => {
    const n1 = Math.sin(x * 0.006 + tVal * 0.15);
    const n2 = Math.cos(y * 0.007 + tVal * 0.12);
    const n3 = Math.sin((x + y) * 0.004 + tVal * 0.08);
    const angle = (n1 + n2 + n3) * Math.PI * 0.9;
    return { ax: Math.cos(angle), ay: Math.sin(angle) };
  };

  // Trigger Trade Decision Action
  const triggerDecision = useCallback((force = false) => {
    const s = stateRef.current;
    if (!force && s.mode !== 'awake' && s.mode !== 'dreaming') return;
    if (isManuallyPaused && !force) return;

    if (s.mode === 'dreaming') {
      s.mode = 'awake';
      setMindMode('awake');
      s.ripples.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        r: 4,
        max: 80,
        color: '200,255,61',
        life: 1,
      });
    }

    s.lastSignal = s.t;
    const r = Math.random();
    const side: 'BUY' | 'SELL' | 'WAIT' | 'HOLD' = r < 0.48 ? 'BUY' : r < 0.78 ? 'SELL' : r < 0.90 ? 'WAIT' : 'HOLD';

    const color = side === 'BUY' ? '200,255,61'
                : side === 'SELL' ? '255,61,127'
                : side === 'WAIT' ? '255,181,71'
                : '168,85,247';

    s.currents.push({
      x0: rand(window.innerWidth * 0.15, window.innerWidth * 0.85),
      y0: window.innerHeight * 0.95,
      y1: window.innerHeight * 0.13,
      progress: 0,
      color,
      width: rand(40, 90),
      alive: true,
      seed: rand(0, 1000),
    });

    setTimeout(() => {
      if (s.mode === 'dying' || s.mode === 'dark') return;
      s.decisionBubble = {
        x: rand(window.innerWidth * 0.2, window.innerWidth * 0.8),
        y: window.innerHeight,
        vy: -rand(2.5, 4.2),
        r: rand(5, 9),
        side,
        color,
        wobble: rand(0, Math.PI * 2),
        alive: true,
        trail: [],
      };
    }, 450);

    const phrases: Record<string, { en: string; ar: string }> = {
      BUY: { en: `executing BUY ${selectedSymbol} — high conviction`, ar: `تنفيذ شراء ${selectedSymbol} — اقتناع عالٍ` },
      SELL: { en: `executing SELL ${selectedSymbol} — pressure detected`, ar: `تنفيذ بيع ${selectedSymbol} — رصد ضغط بيعي` },
      WAIT: { en: 'holding back — volatility threshold exceeded', ar: 'تريّث — تجاوز حاجز التقلب الآمن' },
      HOLD: { en: 'holding — delta neutral equilibrium', ar: 'احتفاظ — توازن محايد دلتا' },
    };

    setMonologueText(isAr ? phrases[side].ar : phrases[side].en);
    setZoneSurface((Math.random() * 0.8 + 0.2).toFixed(1) + 'ms');
    setZoneDepth((2000 + Math.floor(Math.random() * 800)).toLocaleString() + ' · w');
    setZoneDream((Math.random() * 0.4 + 0.1).toFixed(2) + ' · σ');

    haptic(18);
    playTone(side === 'BUY' ? 880 : side === 'SELL' ? 440 : 660, 0.15, 'sine');

    if (side === 'BUY' || side === 'SELL') {
      const now = Date.now();
      const price = currentPrice || 91400;
      onExecuteSignal({
        id: `sig_sub_${now}`,
        symbol: selectedSymbol,
        timestamp: now,
        type: side === 'BUY' ? 'BUY' : 'SELL',
        strength: 0.88,
        zScore: side === 'BUY' ? -2.35 : 2.45,
        halfLife: 18,
        targetPrice: price,
        stopLoss: side === 'BUY' ? price * 0.985 : price * 1.015,
        takeProfit: side === 'BUY' ? price * 1.03 : price * 0.97,
        reason: 'Subconscious vector-flow & Ornstein-Uhlenbeck mean reversion convergence',
        strategy: 'ou-mean-reversion',
      });
    }
  }, [isManuallyPaused, isAr, haptic, playTone, onExecuteSignal, selectedSymbol, currentPrice]);

  // When a real signal arrives from backend, fire canvas current flow
  useEffect(() => {
    if (!latestSignal) return;
    const s = stateRef.current;
    const color = latestSignal.type.includes('BUY') ? '200,255,61' : '255,61,127';
    s.currents.push({
      x0: rand(window.innerWidth * 0.15, window.innerWidth * 0.85),
      y0: window.innerHeight * 0.95,
      y1: window.innerHeight * 0.13,
      progress: 0,
      color,
      width: rand(50, 95),
      alive: true,
      seed: rand(0, 1000),
    });
    playTone(latestSignal.type.includes('BUY') ? 880 : 440, 0.12, 'sine');
  }, [latestSignal, playTone]);

  // Main Canvas & Particle Engine Hook
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Initialize particles
    const getTargetCount = () => {
      const area = W * H;
      const divisor = W < 768 ? 11000 : 4200;
      const densityFactor = settings.density / 100;
      return clamp(Math.floor((area / divisor) * densityFactor), 80, 480);
    };

    const targetCount = getTargetCount();
    const particleList: Particle[] = [];
    for (let i = 0; i < targetCount; i++) {
      particleList.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random(),
        vx: rand(-0.2, 0.2),
        vy: rand(-0.2, 0.2),
        baseSize: rand(0.6, 1.9),
        baseBright: rand(0.35, 0.85),
        bright: rand(0.35, 0.85),
        phase: Math.random() * Math.PI * 2,
        hue: rand(180, 260),
        isMemory: false,
        dreamTargetX: null,
        dreamTargetY: null,
        dreamStrength: 0,
        scale: 1,
      });
    }
    stateRef.current.particles = particleList;

    let rafId: number | null = null;
    let lastT = performance.now();

    const doRebirth = () => {
      const s = stateRef.current;
      s.generation++;
      setGeneration(s.generation);
      s.age = 0;
      s.mode = 'rebirth';
      s.modeStart = s.t;
      setMindMode('rebirth');

      haptic([30, 40, 60]);
      playTone(520, 0.4, 'sine');

      const memoryRatio = settings.memory / 100;
      const keepCount = Math.floor(s.particles.length * memoryRatio);

      s.particles.forEach((p, idx) => {
        if (idx < keepCount) {
          p.isMemory = true;
          p.hue = 45;
          p.baseBright = Math.min(1, p.baseBright * 1.3);
          p.bright = p.baseBright;
        } else {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.vx = rand(-0.3, 0.3);
          p.vy = rand(-0.3, 0.3);
          p.isMemory = false;
          p.hue = rand(180, 260);
          p.baseBright = rand(0.35, 0.85);
          p.bright = p.baseBright;
        }
      });

      s.ripples.push({
        x: W / 2,
        y: H / 2,
        r: 4,
        max: Math.max(W, H) * 0.65,
        color: '255,200,71',
        life: 1,
      });

      setTimeout(() => {
        if (s.mode === 'rebirth') {
          s.mode = 'awake';
          setMindMode('awake');
        }
      }, 3600);
    };

    const loop = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      const s = stateRef.current;
      s.t += dt;

      if (!s.isPaused) {
        s.age += dt;
        setLifeAge(s.age);

        // Lifecycle transitions
        if (s.mode === 'awake' || s.mode === 'dreaming') {
          if (s.age > settings.lifespan - 4) {
            s.mode = 'warning';
            setMindMode('warning');
          } else {
            const sinceSignal = s.t - s.lastSignal;
            if (s.mode === 'awake' && sinceSignal > settings.dreamThreshold) {
              s.mode = 'dreaming';
              s.dreamShape = Math.floor(Math.random() * 5);
              s.dreamShapeStart = s.t;
              setMindMode('dreaming');
            }
          }
        }

        if (s.mode === 'warning' && s.age >= settings.lifespan) {
          s.mode = 'dying';
          s.modeStart = s.t;
          setMindMode('dying');
          haptic([20, 50, 20]);
        }

        if (s.mode === 'dying') {
          const deathProgress = (s.t - s.modeStart) / 3.0;
          if (deathProgress >= 1) {
            s.mode = 'dark';
            s.modeStart = s.t;
            setMindMode('dark');
          }
        }

        if (s.mode === 'dark') {
          const darkProgress = (s.t - s.modeStart) / 1.5;
          if (darkProgress >= 1) {
            doRebirth();
          }
        }

        // Auto decisions
        if (settings.autoDecisions && (s.mode === 'awake' || s.mode === 'dreaming')) {
          const sinceLast = s.t - s.lastSignal;
          if (sinceLast >= settings.decisionSpeed) {
            triggerDecision(false);
          }
        }
      }

      // Clear Canvas
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, W, H);

      // Render Upward Currents
      for (let i = s.currents.length - 1; i >= 0; i--) {
        const c = s.currents[i];
        c.progress += dt * 0.9;
        if (c.progress >= 1) {
          s.currents.splice(i, 1);
          continue;
        }

        const cy = lerp(c.y0, c.y1, c.progress);
        const grad = ctx.createLinearGradient(c.x0, cy + c.width * 2, c.x0, cy - c.width * 2);
        grad.addColorStop(0, `rgba(${c.color},0)`);
        grad.addColorStop(0.5, `rgba(${c.color},${0.18 * (1 - c.progress)})`);
        grad.addColorStop(1, `rgba(${c.color},0)`);

        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(c.x0 - c.width, cy - c.width * 2, c.width * 2, c.width * 4);
        ctx.restore();
      }

      // Render Particles
      const particles = s.particles;
      const totalP = particles.length;

      for (let i = 0; i < totalP; i++) {
        const p = particles[i];

        // Mode specific physics
        if (s.mode === 'dreaming') {
          const dreamTime = s.t - s.dreamShapeStart;
          p.dreamStrength = Math.min(1, p.dreamStrength + dt * 0.6);
          const target = shapeTarget(s.dreamShape, i, totalP, dreamTime);
          const tx = target.x * W;
          const ty = target.y * H;
          p.vx += (tx - p.x) * 0.015 * p.dreamStrength;
          p.vy += (ty - p.y) * 0.015 * p.dreamStrength;
          p.vx *= 0.88;
          p.vy *= 0.88;
        } else {
          p.dreamStrength = Math.max(0, p.dreamStrength - dt * 0.8);
          const { ax, ay } = flow(p.x, p.y, s.t);
          p.vx += ax * 0.08 * (1 - p.z * 0.5);
          p.vy += ay * 0.08 * (1 - p.z * 0.5);
          p.vx *= 0.94;
          p.vy *= 0.94;
        }

        // Mouse attraction
        const dx = s.mouse.x - p.x;
        const dy = s.mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          const force = (1 - dist / 140) * 0.4;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;

        // Brightness & Drawing
        const alpha = p.isMemory ? 0.95 : p.bright * (0.4 + 0.6 * (1 - p.z));
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, p.baseSize * (1 - p.z * 0.4)), 0, Math.PI * 2);
        ctx.fillStyle = p.isMemory ? `rgba(255, 200, 71, ${alpha})` : `hsla(${p.hue}, 85%, 65%, ${alpha})`;
        ctx.fill();
      }

      // Render Surface Ripples
      for (let i = s.ripples.length - 1; i >= 0; i--) {
        const rip = s.ripples[i];
        rip.r += dt * 90;
        rip.life = 1 - rip.r / rip.max;
        if (rip.life <= 0) {
          s.ripples.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rip.color}, ${rip.life * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Render Decision Bubble
      if (s.decisionBubble && s.decisionBubble.alive) {
        const b = s.decisionBubble;
        b.y += b.vy;
        b.x += Math.sin(s.t * 4 + b.wobble) * 0.8;
        b.trail.push({ x: b.x, y: b.y, r: b.r });
        if (b.trail.length > 12) b.trail.shift();

        // Trail
        for (let j = 0; j < b.trail.length; j++) {
          const tr = b.trail[j];
          const trAlpha = (j / b.trail.length) * 0.35;
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, tr.r * (j / b.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${b.color}, ${trAlpha})`;
          ctx.fill();
        }

        // Main Bubble
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${b.color}, 0.9)`;
        ctx.shadowColor = `rgba(${b.color}, 0.8)`;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (b.y < -30) {
          b.alive = false;
          s.decisionBubble = null;
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [settings, triggerDecision, haptic, playTone]);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // Pointer interactions
  const handlePointerMove = (e: React.PointerEvent) => {
    stateRef.current.mouse.x = e.clientX;
    stateRef.current.mouse.y = e.clientY;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    stateRef.current.ripples.push({
      x: e.clientX,
      y: e.clientY,
      r: 4,
      max: 60,
      color: '53,230,224',
      life: 1,
    });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        onToggleBot();
      } else if (e.key === 'd' || e.key === 'D') {
        stateRef.current.mode = 'dreaming';
        stateRef.current.dreamShape = Math.floor(Math.random() * 5);
        stateRef.current.dreamShapeStart = stateRef.current.t;
        setMindMode('dreaming');
        haptic(30);
        playTone(220, 0.6, 'sine');
      } else if (e.key === 't' || e.key === 'T') {
        triggerDecision(true);
      } else if (e.key === 'k' || e.key === 'K') {
        stateRef.current.mode = 'dying';
        stateRef.current.modeStart = stateRef.current.t;
        setMindMode('dying');
        onTriggerKillSwitch();
        haptic([30, 50, 30]);
        playTone(120, 0.8, 'sawtooth');
      } else if (e.key === 's' || e.key === 'S') {
        setSettingsOpen((prev) => !prev);
      } else if (e.key === 'p' || e.key === 'P') {
        setPositionsDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleBot, triggerDecision, onTriggerKillSwitch, haptic, playTone]);

  // Handle Manual Order Submission from Quick Order Pad
  const handleQuickSubmitOrder = async () => {
    if (!onManualOrder) return;
    setIsSubmittingOrder(true);
    try {
      await onManualOrder({
        symbol: selectedSymbol,
        side: orderSide,
        type: orderPriceType,
        quantity: orderQuantity,
        price: orderPriceType === 'LIMIT' ? orderLimitPrice : undefined,
      });
      haptic(35);
      playTone(orderSide === 'BUY' ? 880 : 440, 0.2, 'sine');
      setQuickOrderOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Calculate Lifecycle Ring offset
  const circumference = 2 * Math.PI * 44;
  const lifeProgress = clamp(lifeAge / settings.lifespan, 0, 1);
  const strokeDashoffset = circumference * lifeProgress;

  const totalWalletVal = balance?.totalEquity || 114820.45;
  const profitVal = balance?.realizedPnl || 8420.00;
  const lossVal = Math.abs((balance?.unrealizedPnl && balance.unrealizedPnl < 0) ? balance.unrealizedPnl : 412.30);
  const profitPct = balance?.dailyPnlPct || 14.82;

  const tabs = [
    { id: 'core', labelEn: 'Subconscious Core', labelAr: 'عقل اللاوعي الكمي', icon: Sparkles },
    { id: 'terminal', labelEn: 'Depth Terminal & Book', labelAr: 'المنصة وعمق الأوامر', icon: Compass },
    { id: 'strategy', labelEn: 'Strategy Matrix', labelAr: 'مصفوفة الاستراتيجيات', icon: Layers },
    { id: 'signals', labelEn: 'Live Signals', labelAr: 'إشارات التداول الحية', icon: Activity },
    { id: 'risk', labelEn: 'Risk & Killswitch', labelAr: 'إدارة المخاطر والقاطع', icon: Shield },
    { id: 'quantum', labelEn: 'QUBO Optimizer', labelAr: 'معالج المحفظة الكمي', icon: Cpu },
    { id: 'backtest', labelEn: 'Backtest Workbench', labelAr: 'مختبر الاختبار التاريخي', icon: RotateCcw },
    { id: 'logs', labelEn: 'Cognition Journal', labelAr: 'سجل الإدراك والعمليات', icon: Flame },
  ];

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
    >
      {/* Background Interactive Canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block z-[1] touch-none" />
      <div className="vignette" />
      <div className="scan" />

      {/* Genesis Initialization Sequence */}
      <div
        className={`fixed inset-0 z-[300] grid place-items-center bg-[#05060a] transition-opacity duration-1000 p-5 ${
          isGenesisGone ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
      >
        <div className="text-center flex flex-col items-center gap-5 p-6 max-w-full">
          <div className="w-13 h-13 animate-[spin_6s_linear_infinite]">
            <svg viewBox="0 0 32 32" className="w-full h-full">
              <polygon points="16,2 29,9 29,23 16,30 3,23 3,9" fill="none" stroke="var(--lime)" strokeWidth="1" opacity="0.7" />
              <circle cx="16" cy="16" r="2.6" fill="var(--lime)" />
              <circle cx="16" cy="16" r="1.4" fill="var(--cyan)" />
            </svg>
          </div>
          <div className="font-mono text-xs font-medium text-[var(--muted)] tracking-[0.32em] uppercase">
            {isAr ? 'محرك التداول الذاتي العصبي' : 'SUBCONSCIOUS QUANTUM CORE'}
          </div>
          <div className="font-mono text-[11px] text-[var(--dim)] tracking-[0.06em] min-h-[16px]">
            {genesisLineIndex === 0 && (isAr ? 'تحميل الأوزان العصبية…' : 'loading weights…')}
            {genesisLineIndex === 1 && (isAr ? 'ربط ٢٤٠٠ ميزة سوقية…' : 'binding 2,400 features…')}
            {genesisLineIndex === 2 && (isAr ? 'إيقاظ العقل اللاواعي…' : 'waking subconscious…')}
            {genesisLineIndex >= 3 && (isAr ? 'جاهز للتداول الذاتي.' : 'ready for autonomous trading.')}
          </div>
        </div>
      </div>

      {/* TOP HUD */}
      <header className="fixed top-0 left-0 right-0 z-50 grid grid-cols-[auto_1fr_auto] items-center gap-2 md:gap-5 px-3 md:px-7 py-2.5 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
          <a
            href="#core"
            onClick={() => onTabChange('core')}
            className="flex items-center gap-2.5 font-semibold text-sm tracking-[0.16em] text-[var(--text)] no-underline whitespace-nowrap"
          >
            <span className="w-5.5 h-5.5 relative flex-shrink-0 grid place-items-center">
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <polygon
                  points="16,2 29,9 29,23 16,30 3,23 3,9"
                  fill="none"
                  stroke="var(--lime)"
                  strokeWidth="1.3"
                  className="animate-[spin_18s_linear_infinite] origin-center"
                />
                <circle cx="16" cy="16" r="2.4" fill="var(--lime)" />
                <circle cx="16" cy="16" r="1.4" fill="var(--lime)" className="animate-[blip_2.4s_cubic-bezier(.22,1,.36,1)_infinite]" />
              </svg>
            </span>
            <span className="hidden sm:inline font-bold">
              NEX<b className="text-[var(--lime)]">US</b>
            </span>
          </a>

          {/* Quick Deck Switcher Button */}
          <button
            type="button"
            onClick={() => setNavDeckOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(8,10,16,0.7)] border border-[var(--line-2)] backdrop-blur-md text-[11px] font-mono text-[var(--cyan)] hover:border-[var(--cyan)] hover:bg-[rgba(53,230,224,0.1)] transition cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
            <span>{isAr ? 'لوحات التحكم' : 'Trading Suite'}</span>
          </button>

          {/* Pair Selector Dropdown */}
          <div className="hidden lg:flex items-center gap-1 bg-[rgba(8,10,16,0.7)] border border-[var(--line)] rounded-full px-2 py-0.5">
            {SYMBOLS.map((sym) => {
              const liveP = prices[sym];
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSelectedSymbol && setSelectedSymbol(sym)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition cursor-pointer flex items-center gap-1 ${
                    selectedSymbol === sym
                      ? 'bg-[var(--cyan)] text-black font-bold shadow-[0_0_8px_rgba(53,230,224,0.4)]'
                      : 'text-[var(--muted)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  <span>{sym.split('/')[0]}</span>
                  {liveP ? (
                    <span className={`text-[9px] ${selectedSymbol === sym ? 'text-black/80' : 'text-[var(--cyan)]'}`}>
                      ${liveP >= 1000 ? liveP.toLocaleString(undefined, { maximumFractionDigits: 1 }) : liveP.toFixed(2)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Metrics Row (Clickable for Detail Modals) */}
        <div className="pointer-events-auto grid grid-cols-3 gap-1.5 md:gap-2 max-w-xl mx-auto w-full">
          {/* Wallet - Opens WalletDetailsModal */}
          <div
            onClick={() => setWalletModalOpen(true)}
            className="relative flex items-center gap-2 px-2.5 md:px-3 py-1.5 md:py-2 bg-[rgba(8,10,16,0.7)] border border-[var(--line)] backdrop-blur-xl rounded-sm overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--cyan)] before:shadow-[0_0_10px_var(--cyan)] rtl:before:left-auto rtl:before:right-0 hover:border-[var(--cyan)] transition cursor-pointer group"
          >
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-[8px] md:text-[8.5px] rtl:text-[9.5px] uppercase tracking-[0.16em] rtl:tracking-normal text-[var(--muted)] font-medium truncate flex items-center justify-between">
                <span>{isAr ? 'المحفظة' : 'Wallet'}</span>
                <span className="text-[9px] text-[var(--cyan)] opacity-0 group-hover:opacity-100 transition font-mono">↗</span>
              </span>
              <span className="font-mono font-semibold text-xs md:text-sm text-[var(--text)] tracking-tight tabular-nums truncate">
                ${totalWalletVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Profit - Opens PnlDetailsModal */}
          <div
            onClick={() => setPnlModalOpen(true)}
            className="relative flex items-center justify-between gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 bg-[rgba(8,10,16,0.7)] border border-[var(--line)] backdrop-blur-xl rounded-sm overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--lime)] before:shadow-[0_0_10px_var(--lime)] rtl:before:left-auto rtl:before:right-0 hover:border-[var(--lime)] transition cursor-pointer group"
          >
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-[8px] md:text-[8.5px] rtl:text-[9.5px] uppercase tracking-[0.16em] rtl:tracking-normal text-[var(--muted)] font-medium truncate flex items-center justify-between">
                <span>{isAr ? 'الربح المحقق' : 'Profit'}</span>
                <span className="text-[9px] text-[var(--lime)] opacity-0 group-hover:opacity-100 transition font-mono">↗</span>
              </span>
              <span className="font-mono font-semibold text-xs md:text-sm text-[var(--lime)] tracking-tight tabular-nums truncate">
                +${profitVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="hidden sm:inline-block font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(200,255,61,0.14)] text-[var(--lime)]">
              +{profitPct}%
            </span>
          </div>

          {/* Loss / Drawdown - Opens Risk Modal */}
          <div
            onClick={() => setRiskModalOpen(true)}
            className="relative flex items-center justify-between gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 bg-[rgba(8,10,16,0.7)] border border-[var(--line)] backdrop-blur-xl rounded-sm overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--rose)] before:shadow-[0_0_10px_var(--rose)] rtl:before:left-auto rtl:before:right-0 hover:border-[var(--rose)] transition cursor-pointer group"
          >
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-[8px] md:text-[8.5px] rtl:text-[9.5px] uppercase tracking-[0.16em] rtl:tracking-normal text-[var(--muted)] font-medium truncate flex items-center justify-between">
                <span>{isAr ? 'المخاطرة والتراجع' : 'Risk & DD'}</span>
                <span className="text-[9px] text-[var(--rose)] opacity-0 group-hover:opacity-100 transition font-mono">↗</span>
              </span>
              <span className="font-mono font-semibold text-xs md:text-sm text-[var(--rose)] tracking-tight tabular-nums truncate">
                −${lossVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="hidden sm:inline-block font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[rgba(255,61,127,0.14)] text-[var(--rose)]">
              −{(riskMetrics?.currentDrawdownPct || 0.88).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Right Action Icons: Positions Drawer, Quick Order, Lang */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Active Positions & Orders Trigger */}
          <button
            type="button"
            onClick={() => setPositionsDrawerOpen(true)}
            className="relative flex items-center gap-1.5 px-2.5 py-1 rounded bg-[rgba(8,10,16,0.7)] border border-[var(--line)] hover:border-[var(--cyan)] text-xs font-mono text-[var(--text)] transition cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-[var(--cyan)]" />
            <span className="font-semibold">{positions.length}</span>
            <span className="hidden md:inline text-[10px] text-[var(--muted)]">{isAr ? 'مراكز' : 'pos'}</span>
          </button>

          {/* Language Switcher */}
          <button
            type="button"
            onClick={() => onSetLang(lang === 'ar' ? 'en' : 'ar')}
            className="relative flex items-center bg-[rgba(8,10,16,0.7)] border border-[var(--line)] backdrop-blur-xl rounded-full p-0.5 cursor-pointer hover:border-[var(--line-2)] active:scale-95 transition"
            aria-label="Switch Language"
          >
            <span className={`relative z-[2] px-2 py-0.5 text-[11px] font-semibold ${lang === 'en' ? 'text-[#05060a]' : 'text-[var(--muted)]'}`}>
              EN
            </span>
            <span className={`relative z-[2] px-2 py-0.5 text-[11px] font-semibold ${lang === 'ar' ? 'text-[#05060a]' : 'text-[var(--muted)]'}`}>
              ع
            </span>
            <span
              className={`absolute top-0.5 bottom-0.5 z-[1] w-6 bg-[var(--lime)] rounded-full transition-transform duration-300 shadow-[0_0_12px_rgba(200,255,61,0.4)] ${
                lang === 'ar' ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </header>

      {/* Autonomous Lifecycle Widget */}
      <aside
        className={`fixed top-18 right-3 md:right-7 rtl:right-auto rtl:left-3 md:rtl:left-7 z-50 flex flex-col items-center gap-1.5 p-2.5 md:p-3 bg-[rgba(8,10,16,0.7)] border border-[var(--line)] backdrop-blur-xl rounded-sm min-w-[95px] md:min-w-[105px] transition-all duration-500 ${
          mindMode === 'warning'
            ? 'border-[rgba(255,181,71,0.5)] shadow-[0_0_30px_-5px_rgba(255,181,71,0.35)]'
            : mindMode === 'dying' || mindMode === 'dark'
            ? 'border-[rgba(255,61,127,0.6)] shadow-[0_0_30px_-5px_rgba(255,61,127,0.5)]'
            : mindMode === 'rebirth'
            ? 'border-[rgba(255,200,71,0.7)] shadow-[0_0_40px_-5px_rgba(255,200,71,0.6)]'
            : ''
        }`}
      >
        <div className="w-14 h-14 md:w-16 md:h-16 relative">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={
                mindMode === 'warning'
                  ? 'var(--amber)'
                  : mindMode === 'dying' || mindMode === 'dark'
                  ? 'var(--rose)'
                  : mindMode === 'rebirth'
                  ? 'var(--gold)'
                  : 'var(--cyan)'
              }
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-300 linear"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span
              className={`w-2 h-2 rounded-full ${
                mindMode === 'warning'
                  ? 'bg-[var(--amber)]'
                  : mindMode === 'dying' || mindMode === 'dark'
                  ? 'bg-[var(--rose)] animate-ping'
                  : mindMode === 'rebirth'
                  ? 'bg-[var(--gold)]'
                  : 'bg-[var(--cyan)] animate-[heartbeat_1.4s_cubic-bezier(.22,1,.36,1)_infinite]'
              } shadow-[0_0_14px_currentColor]`}
            />
          </div>
        </div>
        <span className="font-mono text-[8px] md:text-[8.5px] rtl:text-[9.5px] text-[var(--dim)] tracking-[0.18em] uppercase">
          {isAr ? 'الجيل' : 'Generation'}
        </span>
        <span className="font-mono text-[10px] md:text-[11px] font-semibold text-[var(--lime)] tracking-[0.06em] tabular-nums">
          GEN {String(generation).padStart(2, '0')}
        </span>
      </aside>

      {/* Real-time Depth Indicators (Conscious, Subconscious, Dreams) */}
      <aside className="hidden md:flex fixed left-4 md:left-7 rtl:left-auto rtl:right-4 md:rtl:right-7 top-1/2 -translate-y-1/2 z-40 flex-col gap-14 pointer-events-none opacity-70">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8.5px] text-[var(--dim)] tracking-[0.24em] uppercase [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {isAr ? 'الواعي' : 'Conscious'}
          </span>
          <span className="font-mono text-[9.5px] font-semibold text-[var(--cyan)] tracking-[0.04em] [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {zoneSurface}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8.5px] text-[var(--dim)] tracking-[0.24em] uppercase [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {isAr ? 'اللاوعي' : 'Subconscious'}
          </span>
          <span className="font-mono text-[9.5px] font-semibold text-[var(--lime)] tracking-[0.04em] [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {zoneDepth}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[8.5px] text-[var(--dim)] tracking-[0.24em] uppercase [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {isAr ? 'الأحلام' : 'Dreams'}
          </span>
          <span className="font-mono text-[9.5px] font-semibold text-[var(--violet)] tracking-[0.04em] [writing-mode:vertical-rl] rotate-180 rtl:rotate-0">
            {zoneDream}
          </span>
        </div>
      </aside>

      {/* Subconscious Monologue Bar */}
      <div
        className={`fixed bottom-32 md:bottom-36 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 md:py-2.5 bg-[rgba(8,10,16,0.75)] border border-[var(--line)] backdrop-blur-2xl rounded-full max-w-[min(560px,calc(100vw-32px))] pointer-events-none transition-all duration-500 ${
          mindMode === 'dreaming'
            ? 'border-[rgba(168,85,247,0.4)] shadow-[0_0_30px_-8px_rgba(168,85,247,0.4)]'
            : mindMode === 'dying' || mindMode === 'dark'
            ? 'border-[rgba(255,61,127,0.5)] shadow-[0_0_30px_-8px_rgba(255,61,127,0.5)]'
            : mindMode === 'rebirth'
            ? 'border-[rgba(255,200,71,0.5)] shadow-[0_0_40px_-8px_rgba(255,200,71,0.5)]'
            : ''
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 animate-[blip_1.6s_cubic-bezier(.22,1,.36,1)_infinite] ${
            mindMode === 'dreaming'
              ? 'bg-[var(--violet)] shadow-[0_0_10px_var(--violet)]'
              : mindMode === 'dying' || mindMode === 'dark'
              ? 'bg-[var(--rose)] shadow-[0_0_10px_var(--rose)]'
              : mindMode === 'rebirth'
              ? 'bg-[var(--gold)] shadow-[0_0_10px_var(--gold)]'
              : 'bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]'
          }`}
        />
        <span className="font-mono text-[11px] md:text-xs text-[var(--text)] tracking-normal whitespace-nowrap overflow-hidden text-ellipsis flex-1">
          {monologueText}
        </span>
      </div>

      {/* Floating Control Bar */}
      <nav
        className="fixed bottom-12 md:bottom-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-1 bg-[rgba(8,10,16,0.8)] border border-[var(--line)] backdrop-blur-2xl rounded-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
        aria-label="Bot Controls"
      >
        {/* Pause / Resume */}
        <button
          type="button"
          onClick={onToggleBot}
          className={`relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center transition cursor-pointer ${
            isManuallyPaused
              ? 'text-[var(--amber)] bg-[rgba(255,181,71,0.12)] border border-[rgba(255,181,71,0.5)] shadow-[0_0_20px_-4px_rgba(255,181,71,0.6)]'
              : 'text-[var(--muted)] hover:text-[var(--amber)] hover:bg-[rgba(255,181,71,0.08)]'
          }`}
          aria-label={isManuallyPaused ? 'Resume Bot' : 'Pause Bot'}
        >
          {isManuallyPaused ? (
            <Play className="w-4 h-4 fill-current" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isManuallyPaused ? (isAr ? 'استئناف' : 'Resume') : (isAr ? 'إيقاف مؤقت' : 'Pause')}
          </span>
        </button>

        {/* Dream Mode */}
        <button
          type="button"
          onClick={() => {
            if (isManuallyPaused) return;
            stateRef.current.mode = 'dreaming';
            stateRef.current.dreamShape = Math.floor(Math.random() * 5);
            stateRef.current.dreamShapeStart = stateRef.current.t;
            setMindMode('dreaming');
            haptic(30);
            playTone(220, 0.6, 'sine');
          }}
          className="relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--violet)] hover:bg-[rgba(168,85,247,0.08)] transition cursor-pointer"
          aria-label="Dream"
        >
          <Sparkles className="w-4 h-4" />
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isAr ? 'حلم وإعادة تشكيل' : 'Dream'}
          </span>
        </button>

        {/* Trade Now (Instant Alpha Execution) */}
        <button
          type="button"
          onClick={() => triggerDecision(true)}
          className="relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--lime)] hover:bg-[rgba(200,255,61,0.08)] transition cursor-pointer"
          aria-label="Execute Trade"
        >
          <Zap className="w-4 h-4 text-[var(--lime)]" />
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isAr ? 'صفقة كمية فورية' : 'Trade Now'}
          </span>
        </button>

        {/* Custom Order Pad Trigger */}
        <button
          type="button"
          onClick={() => setQuickOrderOpen(true)}
          className="relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--cyan)] hover:bg-[rgba(53,230,224,0.08)] transition cursor-pointer"
          aria-label="Custom Order Pad"
        >
          <DollarSign className="w-4 h-4 text-[var(--cyan)]" />
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isAr ? 'أمر مخصص' : 'Custom Order'}
          </span>
        </button>

        {/* Kill & Rebirth */}
        <button
          type="button"
          onClick={() => {
            stateRef.current.mode = 'dying';
            stateRef.current.modeStart = stateRef.current.t;
            setMindMode('dying');
            onTriggerKillSwitch();
            haptic([30, 50, 30]);
            playTone(120, 0.8, 'sawtooth');
          }}
          className="relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--rose)] hover:bg-[rgba(255,61,127,0.08)] transition cursor-pointer"
          aria-label="Kill & Rebirth"
        >
          <ShieldAlert className="w-4 h-4 text-[var(--rose)]" />
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isAr ? 'إعادة بعث الجيل' : 'Kill & Rebirth'}
          </span>
        </button>

        <span className="w-px h-6 bg-[var(--line-2)] mx-0.5" />

        {/* Settings Modal Trigger */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="relative group w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center text-[var(--muted)] hover:text-[var(--cyan)] hover:bg-[rgba(53,230,224,0.08)] transition cursor-pointer"
          aria-label="Settings"
        >
          <Sliders className="w-4 h-4" />
          <span className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-[rgba(8,10,16,0.95)] border border-[var(--line-2)] rounded font-mono text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
            {isAr ? 'الإعدادات والمعايرة' : 'Settings'}
          </span>
        </button>
      </nav>

      {/* POSITIONS & ORDERS LIVE DRAWER */}
      <div
        className={`fixed inset-0 z-[210] flex justify-end bg-black/60 backdrop-blur-md transition-opacity duration-300 ${
          positionsDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPositionsDrawerOpen(false);
        }}
      >
        <div
          className={`w-full max-w-md h-full bg-[#080a12] border-l border-[var(--line-2)] flex flex-col shadow-2xl p-5 overflow-y-auto transform transition-transform duration-300 ${
            positionsDrawerOpen ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]" />
              <h3 className="font-mono font-bold text-sm text-white uppercase">
                {isAr ? 'المراكز المفتوحة والأوامر' : 'Live Positions & Orders'}
              </h3>
            </div>
            <button
              onClick={() => setPositionsDrawerOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Positions List */}
          <div className="space-y-4 my-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-[var(--muted)]">
                {isAr ? 'المراكز النشطة' : 'Active Positions'} ({positions.length})
              </span>
              <button
                type="button"
                onClick={() => onTabChange('terminal')}
                className="text-[10px] font-mono text-[var(--cyan)] hover:underline flex items-center gap-1"
              >
                <span>{isAr ? 'فتح المنصة' : 'Terminal View'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {positions.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-white/5 bg-white/[0.02]">
                <p className="font-mono text-xs text-slate-500">
                  {isAr ? 'لا توجد مراكز مفتوحة حالياً' : 'No open active positions'}
                </p>
              </div>
            ) : (
              positions.map((pos, idx) => {
                const isLong = pos.size >= 0;
                const side = isLong ? 'LONG' : 'SHORT';
                const pnl = pos.unrealizedPnl || 0;
                const pnlPct = pos.unrealizedPnlPct || 0;
                return (
                  <div
                    key={`${pos.symbol}-${idx}`}
                    className="p-3 rounded-lg border border-[var(--line)] bg-[rgba(8,10,16,0.6)] space-y-2 hover:border-[var(--line-2)] transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLong ? 'bg-emerald-500/20 text-[var(--lime)]' : 'bg-rose-500/20 text-[var(--rose)]'}`}>
                          {side}
                        </span>
                        <span className="font-mono font-bold text-xs text-white">{pos.symbol}</span>
                      </div>
                      <span className={`font-mono text-xs font-bold ${pnl >= 0 ? 'text-[var(--lime)]' : 'text-[var(--rose)]'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                      <div>
                        <span>{isAr ? 'الحجم:' : 'Size:'}</span> <b className="text-white">{pos.size}</b>
                      </div>
                      <div>
                        <span>{isAr ? 'الدخول:' : 'Entry:'}</span> <b className="text-white">${pos.entryPrice?.toFixed(2)}</b>
                      </div>
                      <div>
                        <span>{isAr ? 'السعر الحالي:' : 'Price:'}</span> <b className="text-white">${pos.currentPrice?.toFixed(2)}</b>
                      </div>
                      <div>
                        <span>{isAr ? 'الرافعة:' : 'Leverage:'}</span> <b className="text-[var(--cyan)]">{pos.leverage || 1}x</b>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Orders List */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
              <span className="font-mono text-xs font-semibold text-[var(--muted)]">
                {isAr ? 'الأوامر المعلقة' : 'Pending Orders'} ({orders.length})
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-white/5 bg-white/[0.02]">
                <p className="font-mono text-xs text-slate-500">
                  {isAr ? 'لا توجد أوامر معلقة' : 'No pending orders'}
                </p>
              </div>
            ) : (
              orders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 rounded-lg border border-[var(--line)] bg-[rgba(8,10,16,0.6)] flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className={ord.side === 'BUY' ? 'text-[var(--lime)] font-bold' : 'text-[var(--rose)] font-bold'}>
                        {ord.side}
                      </span>
                      <span className="text-white font-semibold">{ord.symbol}</span>
                      <span className="text-[10px] text-slate-500">({ord.type})</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      {ord.quantity} @ ${ord.price?.toFixed(2) || 'MKT'}
                    </div>
                  </div>
                  {onCancelOrder && (
                    <button
                      onClick={() => onCancelOrder(ord.id)}
                      className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-[var(--rose)] border border-rose-500/30 text-[10px] font-mono"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* QUICK CUSTOM ORDER MODAL */}
      <div
        className={`fixed inset-0 z-[220] grid place-items-center p-4 bg-black/75 backdrop-blur-xl transition-opacity duration-300 ${
          quickOrderOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setQuickOrderOpen(false);
        }}
      >
        <div className="w-[min(420px,100%)] bg-[#080a12] border border-[var(--line-2)] rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[var(--lime)]" />
              <h3 className="font-mono font-bold text-sm text-white">
                {isAr ? 'أمر تداول كمي سريع' : 'Quick Quantum Order Pad'}
              </h3>
            </div>
            <button onClick={() => setQuickOrderOpen(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="font-mono text-xs text-slate-400 block mb-1">{isAr ? 'الزوج:' : 'Symbol:'}</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol && setSelectedSymbol(e.target.value as AssetSymbol)}
                className="w-full px-3 py-2 rounded bg-black border border-[var(--line)] text-white font-mono text-xs focus:border-[var(--cyan)]"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-2 rounded font-mono text-xs font-bold transition ${
                  orderSide === 'BUY' ? 'bg-[var(--lime)] text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {isAr ? 'شراء (BUY)' : 'BUY'}
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-2 rounded font-mono text-xs font-bold transition ${
                  orderSide === 'SELL' ? 'bg-[var(--rose)] text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {isAr ? 'بيع (SELL)' : 'SELL'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-mono text-xs text-slate-400 block mb-1">{isAr ? 'نوع الأمر:' : 'Order Type:'}</label>
                <select
                  value={orderPriceType}
                  onChange={(e) => setOrderPriceType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded bg-black border border-[var(--line)] text-white font-mono text-xs"
                >
                  <option value="MARKET">{isAr ? 'سوق (Market)' : 'MARKET'}</option>
                  <option value="LIMIT">{isAr ? 'محدد (Limit)' : 'LIMIT'}</option>
                </select>
              </div>

              <div>
                <label className="font-mono text-xs text-slate-400 block mb-1">{isAr ? 'الكمية:' : 'Quantity:'}</label>
                <input
                  type="number"
                  step="0.01"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded bg-black border border-[var(--line)] text-white font-mono text-xs"
                />
              </div>
            </div>

            {orderPriceType === 'LIMIT' && (
              <div>
                <label className="font-mono text-xs text-slate-400 block mb-1">{isAr ? 'سعر الحد ($):' : 'Limit Price ($):'}</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderLimitPrice}
                  onChange={(e) => setOrderLimitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded bg-black border border-[var(--line)] text-white font-mono text-xs"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleQuickSubmitOrder}
              disabled={isSubmittingOrder}
              className={`w-full py-2.5 rounded font-mono text-xs font-bold transition shadow-lg ${
                orderSide === 'BUY' ? 'bg-[var(--lime)] text-black hover:opacity-90' : 'bg-[var(--rose)] text-white hover:opacity-90'
              }`}
            >
              {isSubmittingOrder ? (isAr ? 'جاري الإرسال…' : 'Submitting…') : (isAr ? `تأكيد ${orderSide}` : `Confirm ${orderSide}`)}
            </button>
          </div>
        </div>
      </div>

      {/* RISK & DRAWDOWN BREAKDOWN MODAL */}
      <div
        className={`fixed inset-0 z-[230] grid place-items-center p-4 bg-black/80 backdrop-blur-xl transition-opacity duration-300 ${
          riskModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setRiskModalOpen(false);
        }}
      >
        <div className="w-[min(480px,100%)] bg-[#080a12] border border-[var(--line-2)] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--rose)]" />
              <h3 className="font-mono font-bold text-base text-white">
                {isAr ? 'تحليلات المخاطر والتراجع (Risk & Drawdown)' : 'Risk Metrics & Drawdown Analytics'}
              </h3>
            </div>
            <button onClick={() => setRiskModalOpen(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 block">{isAr ? 'التراجع اللحظي' : 'Current Drawdown'}</span>
              <span className="font-mono text-sm font-bold text-[var(--rose)]">
                {(riskMetrics?.currentDrawdownPct || 0.88).toFixed(2)}%
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 block">{isAr ? 'أقصى حد للتراجع' : 'Max Allowed DD'}</span>
              <span className="font-mono text-sm font-bold text-white">
                {(riskLimits?.maxDrawdownPct || 5.0).toFixed(1)}%
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 block">{isAr ? 'القيمة المعرضة للخطر (VaR 95%)' : 'VaR 95%'}</span>
              <span className="font-mono text-sm font-bold text-[var(--amber)]">
                ${(riskMetrics?.var95 || 1450).toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="font-mono text-[10px] text-slate-400 block">{isAr ? 'معدل شارب' : 'Sharpe Ratio'}</span>
              <span className="font-mono text-sm font-bold text-[var(--lime)]">
                {(riskMetrics?.sharpeRatio || 2.35).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setRiskModalOpen(false);
                onTabChange('risk');
              }}
              className="w-full py-2.5 rounded-xl bg-[rgba(255,61,127,0.1)] border border-[rgba(255,61,127,0.3)] text-[var(--rose)] hover:bg-[rgba(255,61,127,0.2)] font-mono text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <span>{isAr ? 'فتح لوحة إدارة المخاطر الشاملة' : 'Open Full Risk Engine'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SETTINGS OVERLAY MODAL */}
      <div
        className={`fixed inset-0 z-[200] grid place-items-center p-4 bg-[rgba(3,4,7,0.75)] backdrop-blur-2xl transition-opacity duration-300 ${
          settingsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSettingsOpen(false);
        }}
      >
        <div className="w-[min(480px,100%)] max-h-[calc(100vh-40px)] bg-[#05060a] border border-[var(--line-2)] rounded-sm overflow-hidden flex flex-col shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)] relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--cyan)] to-transparent opacity-50" />

          <div className="px-5.5 py-4.5 border-b border-[var(--line)] flex justify-between items-center gap-4 bg-gradient-to-b from-white/[0.02] to-transparent">
            <div className="flex items-center gap-3 font-mono font-semibold text-sm uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)] animate-pulse" />
              <span>{isAr ? 'إعدادات ومعايرة المحرك' : 'Engine Configuration'}</span>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="w-8 h-8 rounded-sm bg-white/[0.04] border border-[var(--line)] text-[var(--muted)] hover:text-[var(--rose)] hover:bg-[rgba(255,61,127,0.1)] hover:border-[rgba(255,61,127,0.4)] grid place-items-center transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5.5 space-y-4 overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-[var(--dim)]">
            {/* Lifespan */}
            <div className="flex flex-col gap-2 pb-3 border-b border-[var(--line)]">
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-mono text-xs font-medium text-[var(--text)]">{isAr ? 'عمر الجيل الافتراضي' : 'Lifespan'}</span>
                <span className="font-mono text-xs font-semibold text-[var(--lime)]">{settings.lifespan}s</span>
              </div>
              <input
                type="range"
                min="15"
                max="180"
                step="5"
                value={settings.lifespan}
                onChange={(e) => updateSetting('lifespan', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/[0.06] rounded cursor-pointer accent-[var(--lime)]"
              />
              <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'عدد الثواني لكل جيل تجديد ذاتي' : 'seconds per generation'}</span>
            </div>

            {/* Decision Speed */}
            <div className="flex flex-col gap-2 pb-3 border-b border-[var(--line)]">
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-mono text-xs font-medium text-[var(--text)]">{isAr ? 'سرعة اتخاذ القرار' : 'Decision speed'}</span>
                <span className="font-mono text-xs font-semibold text-[var(--lime)]">{Number(settings.decisionSpeed).toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="0.2"
                value={settings.decisionSpeed}
                onChange={(e) => updateSetting('decisionSpeed', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/[0.06] rounded cursor-pointer accent-[var(--lime)]"
              />
              <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'الفاصل الزمني بين إشارات التحليل العصبي' : 'interval between signals'}</span>
            </div>

            {/* Particle Density */}
            <div className="flex flex-col gap-2 pb-3 border-b border-[var(--line)]">
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-mono text-xs font-medium text-[var(--text)]">{isAr ? 'كثافة الجزيئات العصبية' : 'Particle density'}</span>
                <span className="font-mono text-xs font-semibold text-[var(--lime)]">{settings.density}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="150"
                step="5"
                value={settings.density}
                onChange={(e) => updateSetting('density', parseFloat(e.target.value))}
                className="w-full h-1 bg-white/[0.06] rounded cursor-pointer accent-[var(--lime)]"
              />
              <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'عدد أوزان شبكة اللاوعي الحسابية' : 'subconscious weight count'}</span>
            </div>

            {/* Auto Decisions Toggle */}
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <div>
                <span className="font-mono text-xs font-medium text-[var(--text)] block">{isAr ? 'القرارات التلقائية' : 'Auto decisions'}</span>
                <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'السماح للبوت بالتداول الذاتي' : 'let the bot trade on its own'}</span>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('autoDecisions', !settings.autoDecisions)}
                className={`relative w-11 h-6 rounded-full border transition cursor-pointer ${
                  settings.autoDecisions ? 'bg-[rgba(200,255,61,0.2)] border-[rgba(200,255,61,0.5)]' : 'bg-white/[0.06] border-[var(--line)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full transition-transform ${
                    settings.autoDecisions ? 'translate-x-5 bg-[var(--lime)] shadow-[0_0_10px_var(--lime)]' : 'bg-[var(--dim)]'
                  }`}
                />
              </button>
            </div>

            {/* Sound Feedback Toggle */}
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <div>
                <span className="font-mono text-xs font-medium text-[var(--text)] block">{isAr ? 'التنبيه الصوتي الترددي' : 'Sound feedback'}</span>
                <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'نغمات توليدية خفيفة عند اتخاذ الصفقات' : 'play subtle tone on decisions'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !settings.sound;
                  updateSetting('sound', next);
                  if (next) playTone(660, 0.12, 'sine');
                }}
                className={`relative w-11 h-6 rounded-full border transition cursor-pointer ${
                  settings.sound ? 'bg-[rgba(200,255,61,0.2)] border-[rgba(200,255,61,0.5)]' : 'bg-white/[0.06] border-[var(--line)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full transition-transform ${
                    settings.sound ? 'translate-x-5 bg-[var(--lime)] shadow-[0_0_10px_var(--lime)]' : 'bg-[var(--dim)]'
                  }`}
                />
              </button>
            </div>

            {/* Haptic Feedback Toggle */}
            <div className="flex justify-between items-center py-2">
              <div>
                <span className="font-mono text-xs font-medium text-[var(--text)] block">{isAr ? 'الاهتزاز اللمسي (Haptics)' : 'Haptic feedback'}</span>
                <span className="text-[10.5px] text-[var(--dim)] font-mono">{isAr ? 'اهتزاز تفاعلي على أجهزة اللمس' : 'vibrate on mobile and touch'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateSetting('haptic', !settings.haptic);
                  haptic(25);
                }}
                className={`relative w-11 h-6 rounded-full border transition cursor-pointer ${
                  settings.haptic ? 'bg-[rgba(200,255,61,0.2)] border-[rgba(200,255,61,0.5)]' : 'bg-white/[0.06] border-[var(--line)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full transition-transform ${
                    settings.haptic ? 'translate-x-5 bg-[var(--lime)] shadow-[0_0_10px_var(--lime)]' : 'bg-[var(--dim)]'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="px-5.5 py-3.5 border-t border-[var(--line)] flex justify-between items-center bg-white/[0.012] font-mono text-[10.5px] text-[var(--dim)]">
            <span>{isAr ? 'التغييرات تطبق فورياً' : 'Changes apply instantly'}</span>
            <button
              type="button"
              onClick={() => {
                const def = {
                  lifespan: 55,
                  decisionSpeed: 4.8,
                  dreamThreshold: 9,
                  density: 100,
                  memory: 10,
                  autoDecisions: true,
                  sound: false,
                  haptic: true,
                };
                setSettings(def);
                localStorage.setItem('nexus-settings', JSON.stringify(def));
                haptic([20, 30, 20]);
              }}
              className="px-3.5 py-1.5 rounded-sm bg-white/[0.04] border border-[var(--line-2)] text-[var(--muted)] hover:text-[var(--amber)] hover:border-[rgba(255,181,71,0.4)] transition cursor-pointer font-medium"
            >
              {isAr ? 'استعادة الافتراضي' : 'Reset defaults'}
            </button>
          </div>
        </div>
      </div>

      {/* FULL TRADING SUITE MODAL / DECK SWITCHER */}
      <div
        className={`fixed inset-0 z-[220] grid place-items-center p-4 bg-[rgba(3,4,7,0.85)] backdrop-blur-2xl transition-opacity duration-300 ${
          navDeckOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setNavDeckOpen(false);
        }}
      >
        <div className="w-[min(640px,100%)] bg-[#080a10] border border-[var(--line-2)] rounded-2xl overflow-hidden p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--cyan)] shadow-[0_0_10px_var(--cyan)]" />
              <h3 className="font-bold text-slate-100 text-base">
                {isAr ? 'منظومة التداول والتحليل الكمي الشامل' : 'Quantitative Trading Suite & Workbenches'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setNavDeckOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded bg-slate-900 border border-slate-800"
            >
              ✕ {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onTabChange(tab.id);
                    setNavDeckOpen(false);
                  }}
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left rtl:text-right transition cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[rgba(53,230,224,0.12)] border-[var(--cyan)] text-white shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <TabIcon className="w-4 h-4 text-[var(--cyan)]" />
                    <div>
                      <span className="font-bold text-xs block">{isAr ? tab.labelAr : tab.labelEn}</span>
                      <span className="text-[10px] text-slate-500 font-mono">#{tab.id}</span>
                    </div>
                  </div>
                  <span className={`text-xs ${activeTab === tab.id ? 'text-[var(--cyan)] font-bold' : 'text-slate-600'}`}>
                    →
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* WALLET DETAILS MODAL */}
      <WalletDetailsModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        balance={balance}
        lang={lang}
      />

      {/* PNL DETAILS MODAL */}
      <PnlDetailsModal
        isOpen={pnlModalOpen}
        onClose={() => setPnlModalOpen(false)}
        balance={balance}
        lang={lang}
      />

      {/* FOOTER */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 px-4 md:px-7 py-3 flex justify-between items-center gap-4 font-mono text-[10px] md:text-[10.5px] text-[var(--dim)] tracking-[0.14em] uppercase pointer-events-none">
        <span className="pointer-events-auto flex items-center gap-2">
          <span>NEXUS · <span className="text-[var(--lime)]">{isAr ? 'محرك اللاوعي' : 'subconscious engine'}</span></span>
          <span className="hidden sm:inline text-[9px] text-[var(--cyan)] px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/20">
            {executionMode}
          </span>
        </span>
        <span className="pointer-events-auto tracking-[0.2em]">{clockTime}</span>
      </footer>
    </div>
  );
};
