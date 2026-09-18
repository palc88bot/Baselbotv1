/**
 * Basel Quantum Algorithmic Trading System
 * Master Application Component & State Hub
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { TradingPipeline } from './app/TradingPipeline';
import { RuntimeConfigState } from './app/RuntimeConfig';
import { Header } from './components/Header';
import { LiveTradingDashboard } from './components/LiveTradingDashboard';
import { QuantumOptimizerView } from './components/QuantumOptimizerView';
import { RiskEngineView } from './components/RiskEngineView';
import { BacktestWorkbench } from './components/BacktestWorkbench';
import { TelemetryJournalView } from './components/TelemetryJournalView';
import { MergedCodeViewer } from './components/MergedCodeViewer';

export default function App() {
  const pipelineRef = useRef<TradingPipeline | null>(null);

  // Initialize TradingPipeline
  if (!pipelineRef.current) {
    pipelineRef.current = new TradingPipeline();
  }
  const pipeline = pipelineRef.current;

  // React State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedSymbol, setSelectedSymbol] = useState<AssetSymbol>('BTC/USDT');
  const [config, setConfig] = useState<RuntimeConfigState>(pipeline.getConfig());

  // Real-time market & engine data state
  const [orderBook, setOrderBook] = useState<OrderBook | undefined>(undefined);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [features, setFeatures] = useState<any>(undefined);
  const [latestSignal, setLatestSignal] = useState<TradingSignal | null>(null);
  const [balance, setBalance] = useState<AccountBalance>(pipeline.getUserDataStream().getBalance());
  const [positions, setPositions] = useState<Position[]>(pipeline.getUserDataStream().getPositions());
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastSolution, setLastSolution] = useState<QuboSolution | null>(null);
  const [health, setHealth] = useState<SystemHealth>(pipeline.getHealthMonitor().getHealth());
  const [events, setEvents] = useState<JournalEvent[]>([]);

  // Risk & KillSwitch
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);
  const [killSwitchLevel, setKillSwitchLevel] = useState<string>('NORMAL');
  const [killSwitchHistory, setKillSwitchHistory] = useState<any[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    portfolioValue: 100000,
    currentDrawdownPct: 0,
    maxDrawdownPeak: 100000,
    dailyLossPct: 0,
    currentLeverage: 0,
    var95: 1450,
    cvar95: 2200,
    var99: 2800,
    cvar99: 3900,
    sharpeRatio: 2.35,
    sortinoRatio: 3.12,
    killSwitchActive: false,
    killSwitchLevel: 'NORMAL',
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

  // Start market feed and subscriptions on mount
  useEffect(() => {
    // Start pipeline
    pipeline.start();
    setIsRunning(true);
    setLastSolution(pipeline.getLastQuboSolution());

    // Subscription intervals for UI refresh
    const interval = setInterval(() => {
      // 1. OrderBook & Candles
      const ob = pipeline.getOrderBookBuilder().getBook(selectedSymbol);
      if (ob) setOrderBook({ ...ob });
      setCandles([...pipeline.getMarketData().getCandles(selectedSymbol)]);

      // 2. Features & Signals
      const f = pipeline.getLastFeatures().get(selectedSymbol);
      if (f) setFeatures({ ...f });
      const sig = pipeline.getLastSignals().get(selectedSymbol);
      if (sig) setLatestSignal(sig);

      // 3. User Balances, Positions, Orders
      setBalance({ ...pipeline.getUserDataStream().getBalance() });
      setPositions([...pipeline.getUserDataStream().getPositions()]);
      setOrders([...pipeline.getOrderGateway().getOrders()]);

      // 4. KillSwitch status
      const ks = pipeline.getKillSwitch();
      setKillSwitchActive(ks.isActive());
      setKillSwitchLevel(ks.getLevel());
      setKillSwitchHistory([...ks.getHistory()]);

      // 5. Risk metrics
      const rEval = pipeline.getRiskEngine().evaluateRisk(
        pipeline.getUserDataStream().getBalance(),
        pipeline.getUserDataStream().getPositions(),
        ks.getLevel()
      );
      setRiskMetrics({ ...rEval.metrics });

      // 6. Health & Events
      setHealth({ ...pipeline.getHealthMonitor().getHealth() });
      setEvents([...pipeline.getEventJournal().getEvents()]);
    }, 200);

    return () => {
      clearInterval(interval);
      pipeline.stop();
    };
  }, [selectedSymbol]);

  // Master Bot Toggle
  const handleToggleRun = () => {
    if (isRunning) {
      pipeline.stop();
      setIsRunning(false);
    } else {
      pipeline.start();
      setIsRunning(true);
    }
  };

  // Config change
  const handleConfigChange = (newCfg: Partial<RuntimeConfigState>) => {
    pipeline.updateConfig(newCfg);
    setConfig(pipeline.getConfig());
  };

  // Emergency KillSwitch trigger & reset
  const handleEmergencyKill = () => {
    pipeline.triggerEmergencyKill('Manual emergency stop triggered via master UI');
    setKillSwitchActive(true);
    setKillSwitchLevel('HARD_HALT');
  };

  const handleResetKill = () => {
    const res = pipeline.resetEmergencyKill();
    if (res.success) {
      setKillSwitchActive(false);
      setKillSwitchLevel('NORMAL');
    }
  };

  // Manual trade dispatch
  const handleManualOrder = (params: {
    symbol: AssetSymbol;
    side: 'BUY' | 'SELL';
    type: any;
    quantity: number;
    price?: number;
  }) => {
    pipeline.getOrderGateway().submitOrder({
      ...params,
      strategyId: 'MANUAL_OPERATOR',
    });
  };

  // Re-run quantum optimization
  const handleRunOptimization = () => {
    const sol = pipeline.runQuantumOptimization();
    setLastSolution(sol);
  };

  // Update risk limits
  const handleUpdateLimits = (newLimits: Partial<RiskLimits>) => {
    pipeline.getRiskEngine().updateLimits(newLimits);
    setRiskLimits({ ...riskLimits, ...newLimits });
  };

  const isAr = lang === 'ar';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#070b14] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 antialiased"
    >
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
      />

      {/* Main View Container */}
      <main className="max-w-[1680px] mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <LiveTradingDashboard
                selectedSymbol={selectedSymbol}
                orderBook={orderBook}
                candles={candles}
                features={features}
                latestSignal={latestSignal}
                balance={balance}
                positions={positions}
                orders={orders}
                onManualOrder={handleManualOrder}
                lang={lang}
              />
            </motion.div>
          )}

          {activeTab === 'quantum' && (
            <motion.div
              key="quantum"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <QuantumOptimizerView
                activeSymbols={config.activeSymbols}
                lastSolution={lastSolution}
                onRunOptimization={handleRunOptimization}
                lang={lang}
              />
            </motion.div>
          )}

          {activeTab === 'risk' && (
            <motion.div
              key="risk"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <RiskEngineView
                metrics={riskMetrics}
                limits={riskLimits}
                balance={balance}
                positions={positions}
                onUpdateLimits={handleUpdateLimits}
                onTriggerKillSwitch={(lvl, rsn) => pipeline.getKillSwitch().trigger(lvl, rsn)}
                onResetKillSwitch={handleResetKill}
                killSwitchHistory={killSwitchHistory}
                lang={lang}
              />
            </motion.div>
          )}

          {activeTab === 'backtest' && (
            <motion.div
              key="backtest"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <BacktestWorkbench lang={lang} />
            </motion.div>
          )}

          {activeTab === 'telemetry' && (
            <motion.div
              key="telemetry"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <TelemetryJournalView
                health={health}
                events={events}
                onClearJournal={() => pipeline.getEventJournal().clear()}
                lang={lang}
              />
            </motion.div>
          )}

          {activeTab === 'code' && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <MergedCodeViewer lang={lang} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
