/**
 * Basel Quantum Algorithmic Trading System
 * Master Application Component & WebSocket Client (Headless Architecture UI)
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AccountBalance,
  AssetSymbol,
  Candle,
  JournalEvent,
  Order,
  OrderBook,
  Position,
  QuboSolution,
  RiskLimits,
  RiskMetrics,
  SystemHealth,
  TradingSignal,
} from './domain/types';
import { INITIAL_RUNTIME_CONFIG, RuntimeConfigState } from './app/RuntimeConfig';
import { Header } from './components/Header';
import { AccountSummary } from './components/AccountSummary';
import { LiveTradingDashboard } from './components/LiveTradingDashboard';
import { QuantumOptimizerView } from './components/QuantumOptimizerView';
import { RiskEngineView } from './components/RiskEngineView';
import { BacktestWorkbench } from './components/BacktestWorkbench';
import { TelemetryJournalView } from './components/TelemetryJournalView';
import SystemHealthPanel from './components/SystemHealthPanel';
import { LoginView } from './components/LoginView';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const { user, loading, getToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // React State
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<AssetSymbol>('BTC/USDT');
  const [config, setConfig] = useState<RuntimeConfigState>(INITIAL_RUNTIME_CONFIG);

  // Real-time market & engine data state from Backend Brain
  const [orderBook, setOrderBook] = useState<OrderBook | undefined>(undefined);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [features, setFeatures] = useState<any>(undefined);
  const [latestSignal, setLatestSignal] = useState<TradingSignal | null>(null);
  const [signalHistory, setSignalHistory] = useState<TradingSignal[]>([]);
  const [balance, setBalance] = useState<AccountBalance>({
    totalEquity: 0,
    availableCash: 0,
    usedMargin: 0,
    marginLevel: 0,
    freeMargin: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    dailyPnl: 0,
    dailyPnlPct: 0,
    currency: 'USDT',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastSolution, setLastSolution] = useState<QuboSolution | null>(null);
  const [health, setHealth] = useState<SystemHealth>({
    status: 'OPTIMAL',
    uptimeSeconds: 0,
    cpuUsagePct: 0,
    memoryUsageMb: 0,
    activeFeedsCount: 0,
    messagesPerSecond: 0,
    ordersPerSecond: 0,
    pipelineLatency: {
      feedParsingUs: 0,
      featureExtractionUs: 0,
      strategySignalUs: 0,
      quboOptimizationMs: 0,
      riskValidationUs: 0,
      orderDispatchUs: 0,
      totalPipelineMs: 0,
    },
    lastHeartbeat: Date.now(),
  });
  const [events, setEvents] = useState<JournalEvent[]>([]);

  // Risk & KillSwitch
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);
  const [killSwitchLevel, setKillSwitchLevel] = useState<string>('NORMAL');
  const [killSwitchHistory, setKillSwitchHistory] = useState<any[]>([]);
  const [isTelegramEnabled, setIsTelegramEnabled] = useState<boolean>(false);
  const [telegramMaskedId, setTelegramMaskedId] = useState<string>('Not configured');
  const [regime, setRegime] = useState<any>(null);
  const [riskDecision, setRiskDecision] = useState<any>(null);
  const [isGuestMode, setIsGuestMode] = useState<boolean>(true);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    portfolioValue: 100000,
    currentDrawdownPct: 0.45,
    maxDrawdownPeak: 100000,
    dailyLossPct: 0,
    currentLeverage: 1.2,
    var95: 1450,
    cvar95: 2200,
    var99: 2800,
    cvar99: 3900,
    sharpeRatio: 2.35,
    sortinoRatio: 3.12,
    killSwitchLevel: 'NORMAL',
    killSwitchActive: false,
  });
  const [riskLimits, setRiskLimits] = useState<RiskLimits>({
    maxDrawdownPct: 5.0,
    maxDailyLossPct: 3.0,
    maxPortfolioLeverage: 3.0,
    maxSinglePositionPct: 25.0,
    maxSpreadSlippageBps: 20,
    stalePriceThresholdMs: 3000,
    consecutiveLossKillCount: 5,
  });

  const selectedSymbolRef = useRef<AssetSymbol>('BTC/USDT');

  // Sync user with backend
  useEffect(() => {
    if (user && !isSynced) {
      const syncUser = async () => {
        try {
          const token = await getToken();
          const res = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          if (res.ok) {
            setIsSynced(true);
            setSyncError(null);
            console.log('✅ User synced with cloud database');
          } else {
            const data = await res.json();
            setSyncError(data.error || 'Failed to communicate with sync endpoint');
          }
        } catch (err: any) {
          console.error('Failed to sync user:', err);
          setSyncError(err.message || 'Network error during synchronization');
        }
      };
      syncUser();
    } else if (!user) {
      setIsSynced(true);
    }
  }, [user, isSynced, getToken]);

  // Fetch Telegram status
  useEffect(() => {
    fetch('/api/telegram/status')
      .then(res => res.json())
      .then(data => {
        setIsTelegramEnabled(data.isEnabled);
        setTelegramMaskedId(data.maskedChatId);
      })
      .catch(err => console.error('Failed to fetch telegram status:', err));
  }, []);

  // Toggle Telegram
  const handleToggleTelegram = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chatId: '123456789', isEnabled: !isTelegramEnabled }), // Dummy chatId for now
      });
      const data = await response.json();
      setIsTelegramEnabled(data.isEnabled);
      setTelegramMaskedId(data.maskedChatId);
    } catch (err) {
      console.error('Failed to toggle telegram:', err);
    }
  };

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // Connect to Backend WebSocket Brain with Exponential Backoff
  useEffect(() => {
    if (!user && !isGuestMode) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_BRAIN_WS_URL || `${wsProtocol}//${window.location.host}/brain-ws`;

    let reconnectAttempt = 0;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isUnmounted = false;

    const connect = async () => {
      if (isUnmounted) return;
      try {
        const token = await getToken();
        const fullWsUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
        console.log(`🔌 Attempting Brain WebSocket connection: ${wsUrl}`);
        wsRef.current = new WebSocket(fullWsUrl);

        wsRef.current.onopen = () => {
          console.log('✅ Connected to Baselbot Brain WebSocket');
          setIsConnected(true);
          setIsRunning(true);
          reconnectAttempt = 0; // reset on success
        };

        let pendingData: any = null;
        let updateScheduled = false;

        const processThrottledUpdate = () => {
          if (updateScheduled) return;
          updateScheduled = true;

          requestAnimationFrame(() => {
            updateScheduled = false;
            if (!pendingData) return;
            const data = pendingData;
            pendingData = null;

            React.startTransition(() => {
              if (data.balance) setBalance(data.balance);
              if (data.positions) setPositions(data.positions);
              if (data.orders) setOrders(data.orders);
              if (data.health) setHealth(data.health);
              if (data.regime) setRegime(data.regime);
              if (data.riskDecision) setRiskDecision(data.riskDecision);
              if (data.killSwitch) {
                setKillSwitchActive(data.killSwitch.active);
                setKillSwitchLevel(data.killSwitch.level);
              }
              if (data.signals && data.signals.length > 0) {
                const signals = data.signals;
                setLatestSignal(signals[signals.length - 1]);
                setSignalHistory(prev => {
                  const combined = [...signals.slice(-5).reverse(), ...prev];
                  return combined.slice(0, 5);
                });
              }

              // Extract and set live market data for current active symbol
              const currentSym = selectedSymbolRef.current;
              if (data.candles && data.candles[currentSym]) {
                setCandles(data.candles[currentSym]);
              }
              if (data.orderBooks && data.orderBooks[currentSym]) {
                setOrderBook(data.orderBooks[currentSym]);
              }
              if (data.features && data.features[currentSym]) {
                setFeatures(data.features[currentSym]);
              }
            });
          });
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'INIT_STATE' || message.type === 'STATE_UPDATE') {
              pendingData = message.data;
              processThrottledUpdate();
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        wsRef.current.onclose = (event) => {
          if (isUnmounted) return;
          setIsConnected(false);
          setIsRunning(false);

          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
          console.log(`❌ Brain WebSocket closed: ${event.code} ${event.reason}. Reconnecting in ${(delay / 1000).toFixed(1)}s (Attempt ${reconnectAttempt + 1})...`);
          
          reconnectAttempt++;
          reconnectTimer = setTimeout(connect, delay);
        };

        wsRef.current.onerror = (err) => {
          console.error('❌ Brain WebSocket Error:', err);
        };
      } catch (err) {
        console.error('Failed to initialize WebSocket safely:', err);
        const delay = 5000;
        reconnectTimer = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Master Bot Toggle
  const handleToggleRun = async () => {
    const newState = !isRunning;
    try {
      const token = await getToken();
      const res = await fetch('/api/protected/toggle-trading', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ running: newState })
      });
      if (res.ok) {
        setIsRunning(newState);
      }
    } catch (err) {
      console.error('Failed to toggle trading:', err);
    }
  };

  // Config change
  const handleConfigChange = (newCfg: Partial<RuntimeConfigState>) => {
    setConfig({ ...config, ...newCfg });
  };

  // Emergency KillSwitch trigger & reset via Backend API
  const handleEmergencyKill = async (level: any = 'HARD_HALT', reason: string = 'Manual operator emergency stop') => {
    try {
      setKillSwitchActive(true);
      setKillSwitchLevel(level);
      const token = await getToken();
      const res = await fetch('/api/protected/killswitch/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ level, reason })
      });
      const data = await res.json();
      if (data.success) {
        setKillSwitchActive(data.active);
        setKillSwitchLevel(data.level);
      }
    } catch (err) {
      console.error('Failed to trigger killswitch on server:', err);
    }
  };

  const handleResetKill = async () => {
    try {
      setKillSwitchActive(false);
      setKillSwitchLevel('NORMAL');
      const token = await getToken();
      const res = await fetch('/api/protected/killswitch/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setKillSwitchActive(data.active);
        setKillSwitchLevel(data.level);
      }
    } catch (err) {
      console.error('Failed to reset killswitch on server:', err);
    }
  };

  // Manual trade dispatch via Backend API
  const handleManualOrder = async (params: {
    symbol: AssetSymbol;
    side: 'BUY' | 'SELL';
    type: any;
    quantity: number;
    price?: number;
  }) => {
    try {
      const token = await getToken();
      await fetch('/api/protected/manual-order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params),
      });
    } catch (err) {
      console.error('Failed to submit manual order:', err);
    }
  };

  // Re-run quantum optimization
  const handleRunOptimization = async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/protected/run-optimization', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          assets: config.activeSymbols,
          constraints: { riskAversion: 0.5 }
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setLastSolution({
          binaryVector: config.activeSymbols.map((_, i) => (data.weights[i] > 0.01 ? 1 : 0)),
          energy: -data.sharpeRatio,
          rawAllocations: config.activeSymbols.reduce((acc, sym, i) => ({ ...acc, [sym]: data.weights[i] }), {} as Record<AssetSymbol, number>),
          normalizedWeights: config.activeSymbols.reduce((acc, sym, i) => ({ ...acc, [sym]: data.weights[i] }), {} as Record<AssetSymbol, number>),
          expectedReturn: data.expectedReturn,
          portfolioVariance: data.risk * data.risk,
          sharpeRatio: data.sharpeRatio,
          solveTimeMs: Date.now() - data.timestamp + 5,
          solverType: config.activeSolver,
          iterations: 100,
          feasible: true,
        });
      }
    } catch (err) {
      console.error('Failed to run quantum optimization:', err);
    }
  };

  // Update risk limits via Backend API
  const handleUpdateLimits = async (newLimits: Partial<RiskLimits>) => {
    setRiskLimits(prev => ({ ...prev, ...newLimits }));
    try {
      const token = await getToken();
      const res = await fetch('/api/protected/risk-limits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newLimits)
      });
      const data = await res.json();
      if (data.success && data.limits) {
        setRiskLimits(data.limits);
      }
    } catch (err) {
      console.error('Failed to update risk limits on server:', err);
    }
  };

  const isAr = lang === 'ar';

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#02040a] text-cyan-500 font-black gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
        <div className="animate-pulse tracking-[0.3em]">BOOTING_CORE...</div>
      </div>
    );
  }

  if (!user && !isGuestMode) return <LoginView lang={lang} onGuestAccess={() => setIsGuestMode(true)} />;

  if (!isSynced && !isGuestMode) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#02040a] text-slate-100 font-bold gap-6 p-6 text-center">
        <div className="relative">
            <div className="w-20 h-20 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-full animate-ping" />
            </div>
        </div>
        <div className="space-y-2">
            <h2 className="text-xl tracking-tight">Synchronizing Intelligence...</h2>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Establishing secure connection with Basel AlgoCore quantum backend...</p>
        </div>
        {syncError && (
          <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-mono max-w-md">
            [SYNC_ERROR]: {syncError}
            <button onClick={() => window.location.reload()} className="block mt-2 underline opacity-80 hover:opacity-100">Retry Synchronization</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#02040a] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 antialiased quantum-grid relative overflow-x-hidden"
    >
      {/* Global Quantum Effects */}
      {!reduceMotion && <div className="quantum-scanline" />}
      
      {/* Immersive Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-700/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-indigo-900/5 rounded-full blur-[160px]" />
      </div>

      {/* Navigation Header */}
      <Header
        isRunning={isRunning}
        onToggleRun={handleToggleRun}
        killSwitchActive={killSwitchActive}
        killSwitchLevel={killSwitchLevel}
        onEmergencyKill={handleEmergencyKill}
        onResetKill={handleResetKill}
        config={config}
        onConfigChange={handleConfigChange}
        lang={lang}
        onToggleLang={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeSymbols={config.activeSymbols}
        selectedSymbol={selectedSymbol}
        setSelectedSymbol={setSelectedSymbol}
        isConnected={isConnected}
        isTelegramEnabled={isTelegramEnabled}
        onToggleTelegram={handleToggleTelegram}
        reduceMotion={reduceMotion}
        onToggleReduceMotion={() => setReduceMotion(!reduceMotion)}
      />

      {/* Main View Container */}
      <main className="max-w-[1680px] mx-auto px-4 sm:px-6 py-6">
        <AccountSummary balance={balance} lang={lang} />
        
        {activeTab === 'dashboard' && (
          <div>
            <LiveTradingDashboard
              selectedSymbol={selectedSymbol}
              orderBook={orderBook}
              candles={candles}
              features={features}
              latestSignal={latestSignal}
              signalHistory={signalHistory}
              balance={balance}
              positions={positions}
              orders={orders}
              onManualOrder={handleManualOrder}
              lang={lang}
              reduceMotion={reduceMotion}
              health={health}
              isRunning={isRunning}
              regime={regime}
              riskDecision={riskDecision}
            />
            <div className="mt-6">
              <SystemHealthPanel lang={lang} />
            </div>
          </div>
        )}

        {activeTab === 'quantum' && (
          <div>
            <QuantumOptimizerView
              activeSymbols={config.activeSymbols}
              lastSolution={lastSolution}
              onRunOptimization={handleRunOptimization}
              lang={lang}
              reduceMotion={reduceMotion}
            />
          </div>
        )}

        {activeTab === 'risk' && (
          <div>
            <RiskEngineView
              metrics={riskMetrics}
              limits={riskLimits}
              balance={balance}
              positions={positions}
              onUpdateLimits={handleUpdateLimits}
              onTriggerKillSwitch={(lvl, rsn) => {
                handleEmergencyKill(lvl, rsn);
              }}
              onResetKillSwitch={handleResetKill}
              killSwitchHistory={killSwitchHistory}
              lang={lang}
              reduceMotion={reduceMotion}
            />
          </div>
        )}

        {activeTab === 'backtest' && (
          <div>
            <BacktestWorkbench lang={lang} />
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div>
            <TelemetryJournalView
              health={health}
              events={events}
              onClearJournal={() => setEvents([])}
              lang={lang}
            />
          </div>
        )}
      </main>
    </div>
  );
}
