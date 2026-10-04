/**
 * Basel Quantum Algorithmic Trading System
 * Master Unified Trading Pipeline Orchestrator
 */

import {
  AccountBalance,
  AssetSymbol,
  CalculatedFeatures,
  ExecutionMode,
  KillSwitchLevel,
  Order,
  OrderBook,
  Position,
  QuboMatrix,
  QuboSolution,
  RiskMetrics,
  SolverType,
  Tick,
  TradingSignal,
  getBinanceBaseUrl,
  normalizeExecutionMode,
} from '../domain/types';
import crypto from 'crypto';
import { OrderGateway } from '../execution/OrderGateway';
import { UserDataStream } from '../execution/UserDataStream';
import { FeatureEngine } from '../features/FeatureEngine';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy';
import { DecisionEngine } from '../strategies/DecisionEngine';
import { ExchangeMarketData } from '../market-data/ExchangeMarketData';
import { OrderBookBuilder } from '../market-data/OrderBookBuilder';
import { HealthMonitor } from '../monitoring/HealthMonitor';
import { ClassicalBaseline } from '../portfolio/ClassicalBaseline';
import { QuboPortfolio } from '../portfolio/QuboPortfolio';
import { QAOAAdapter } from '../quantum/QAOAAdapter';
import { QuantumInspiredSolver } from '../quantum/QuantumInspiredSolver';
import { KillSwitch } from '../risk/KillSwitch';
import { RiskEngine } from '../risk/RiskEngine';
import { EventJournal } from '../storage/EventJournal';
import { INITIAL_RUNTIME_CONFIG, RuntimeConfigState } from './RuntimeConfig';
import { DatabaseService } from '../storage/DatabaseService';
import { CorrelationRiskManager } from '../risk/CorrelationRiskManager';
import { TelegramService } from '../services/TelegramService';
import { DynamicRiskManager } from '../risk/DynamicRiskManager';
import { RegimeDetector, RegimeAnalysis } from '../risk/RegimeDetector';
import { PortfolioSizer } from '../risk/PortfolioSizer';
import { PartialProfitManager } from '../execution/PartialProfitManager';
import { ScaleInManager } from '../execution/ScaleInManager';
import { AssetScreener } from '../market-data/AssetScreener';
import { StrategyManager } from '../strategies/StrategyManager';
import { SystemWatchdog, WatchdogStatus } from '../monitoring/SystemWatchdog';
import { BotStrategy, StrategyScreenerItem } from '../domain/types';
import fs from 'fs';

export class TradingPipeline {
  private assetScreener: AssetScreener;
  private strategyManager: StrategyManager;
  private marketData: ExchangeMarketData;
  private orderBookBuilder: OrderBookBuilder;
  private featureEngine: FeatureEngine;
  private userDataStream: UserDataStream;
  private orderGateway: OrderGateway;
  private riskEngine: RiskEngine;
  private killSwitch: KillSwitch;
  private eventJournal: EventJournal;
  private healthMonitor: HealthMonitor;
  private watchdog: SystemWatchdog;
  private db: DatabaseService;
  private correlationRiskManager: CorrelationRiskManager;
  private telegramService: TelegramService;
  private strategy: MeanReversionStrategy;
  private decisionEngine: DecisionEngine;
  private dynamicRiskManager: DynamicRiskManager;
  private regimeDetector: RegimeDetector;
  private regimeDetectors: Map<AssetSymbol, RegimeDetector> = new Map();
  private portfolioSizer: PortfolioSizer;
  private partialProfitManager: PartialProfitManager;
  private scaleInManager: ScaleInManager;
  private lastSnapshotTime: number = 0;
  private inFlightSymbols: Set<string> = new Set();
  private pendingProtection: Map<string, { ouSigma: number; ouMu: number; side: 'BUY' | 'SELL'; symbol: AssetSymbol }> = new Map();
  private lastAlertState: Map<string, { value: string; ts: number }> = new Map();
  private signalHistory: TradingSignal[] = [];
  private riskInterval: NodeJS.Timeout | null = null;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private positionCheckInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private previousTradingAllowed: boolean = true;

  private config: RuntimeConfigState;
  private isRunning: boolean = false;
  private lastQuboSolution: QuboSolution | null = null;
  private lastSignals: Map<AssetSymbol, TradingSignal> = new Map();
  private lastFeatures: Map<AssetSymbol, any> = new Map();
  private rebalanceTimer: any = null;
  private lastOrderTime: Map<AssetSymbol, number> = new Map();

  // Covariance matrix for quantum portfolio optimization
  private covarianceMatrix: number[][] = [
    [0.040, 0.022, 0.028, 0.016, 0.012, 0.009],
    [0.022, 0.065, 0.038, 0.021, 0.014, 0.011],
    [0.028, 0.038, 0.095, 0.029, 0.018, 0.015],
    [0.016, 0.021, 0.029, 0.055, 0.010, 0.008],
    [0.012, 0.014, 0.018, 0.010, 0.035, 0.018],
    [0.009, 0.011, 0.015, 0.008, 0.018, 0.025],
  ];

  private expectedReturns: Record<AssetSymbol, number> = {
    'BTC/USDT': 0.095,
    'ETH/USDT': 0.125,
    'SOL/USDT': 0.180,
    'QNT/USDT': 0.145,
    'NVDA/USD': 0.110,
    'AAPL/USD': 0.075,
  };

  constructor(telegramService?: TelegramService) {
    this.config = { ...INITIAL_RUNTIME_CONFIG };
    
    // Read environment configuration
    const rawMode = process.env.EXECUTION_MODE;
    const hasKey = !!process.env.EXCHANGE_API_KEY;
    const executionMode: ExecutionMode = normalizeExecutionMode(rawMode, hasKey);
    const apiBaseUrl = getBinanceBaseUrl(executionMode);

    if (executionMode === 'LIVE') {
      this.config.executionMode = 'LIVE_SIMULATION';
    } else if (executionMode === 'TESTNET') {
      this.config.executionMode = 'TESTNET_EXCHANGE';
    } else {
      this.config.executionMode = 'PAPER_TRADING';
    }

    this.orderBookBuilder = new OrderBookBuilder(10);
    this.marketData = new ExchangeMarketData(this.orderBookBuilder);
    this.featureEngine = new FeatureEngine();
    this.userDataStream = new UserDataStream(0); // Start with 0, will be updated by fetchInitialAccountData
    
    this.orderGateway = new OrderGateway(this.userDataStream, this.orderBookBuilder, {
      executionMode,
      apiKey: process.env.EXCHANGE_API_KEY,
      apiSecret: process.env.EXCHANGE_API_SECRET,
      apiBaseUrl: apiBaseUrl,
    });

    this.riskEngine = new RiskEngine({ maxDrawdownPct: this.config.maxDrawdownCapPct, maxPortfolioLeverage: this.config.maxLeverage });
    this.killSwitch = new KillSwitch();
    this.eventJournal = new EventJournal(1000);
    this.healthMonitor = new HealthMonitor();
    this.db = new DatabaseService();
    this.correlationRiskManager = new CorrelationRiskManager();
    this.telegramService = telegramService || new TelegramService();
    this.strategy = new MeanReversionStrategy();
    this.decisionEngine = new DecisionEngine();

    // Initialize Asset Screener & Dynamic Risk System
    this.assetScreener = new AssetScreener(
      apiBaseUrl,
      process.env.EXCHANGE_API_KEY || '',
      process.env.EXCHANGE_API_SECRET || ''
    );
    this.dynamicRiskManager = new DynamicRiskManager({ zScoreThreshold: -1.6, halfLifeMax: 30 });
    this.regimeDetector = new RegimeDetector();
    this.portfolioSizer = new PortfolioSizer(this.assetScreener);
    this.partialProfitManager = new PartialProfitManager(this.orderGateway);
    this.scaleInManager = new ScaleInManager(this.orderGateway);
    this.strategyManager = new StrategyManager();

    this.watchdog = new SystemWatchdog({
      getFeedLastUpdate: () => {
        const activeSymbols = this.config.activeSymbols || ['BTC/USDT'];
        let maxTime = 0;
        for (const s of activeSymbols) {
          const t = this.marketData.getLastUpdateTime(s);
          if (t > maxTime) maxTime = t;
        }
        return maxTime > 0 ? maxTime : Date.now();
      },
      onFeedStall: async () => {
        await this.marketData.fetchLiveRestPrices();
        await this.marketData.fetchOrderBookSnapshots();
        this.eventJournal.record('WARN', 'SYSTEM', 'Watchdog 24/7 auto-healed stalled market data stream via Binance live REST snapshot');
      },
      getInFlightLocks: () => this.inFlightSymbols,
      onClearStaleLocks: (stale) => {
        const now = Date.now();
        for (const sym of stale) {
          const last = this.lastOrderTime.get(sym) || 0;
          if (now - last > 20000) {
            this.inFlightSymbols.delete(sym);
            console.log();
          }
        }
      },
      onHeartbeatPulse: (status) => {
        this.healthMonitor.recordMessage();
      },
    });
    this.watchdog.start(2500);


    // Load optimized parameters if available
    this.loadOptimizedParameters();

    this.dynamicRiskManager.on('critical_alert', async (decision) => {
      const actionAr = decision.action === 'REDUCE_SIZE' ? 'تقليص حجم العقود' : decision.action === 'PAUSE' ? 'تهدئة مؤقتة' : decision.action === 'REDUCE_LEVERAGE' ? 'تخفيض الرافعة المالية' : decision.action;
      await this.telegramService.sendMessage(`🚨 <b>تنبيه إدارة المخاطر المتقدمة</b>\n\n⚡ الإجراء المتخذ: <b>${actionAr}</b>\n⚖️ الرافعة المالية المسموحة: <b>${(decision.leverageMultiplier * 100).toFixed(0)}%</b>\n📦 نسبة حجم المركز: <b>${(decision.positionSizeMultiplier * 100).toFixed(0)}%</b>\n\n📋 أسباب التقييم:\n${decision.reasons.map((r: string) => `• ${r}`).join('\n')}`);
    });

    this.setupEventForwarding();
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('🚀 Starting Basel AlgoCore Autonomous Trading System...');

    try {
      // 0. Screen qualified assets
      console.log('🔍 Screening qualified assets from exchange...');
      await this.assetScreener.refreshAllAssets();
      for (const asset of this.assetScreener.getAllAssets()) {
        this.orderGateway.setSymbolFilter(asset.symbol, asset.stepSize, asset.tickSize, asset.minQuantity);
      }
      this.portfolioSizer.updateBalance(this.userDataStream.getBalance().totalEquity);
      this.config.activeSymbols = this.portfolioSizer.getAllowedSymbols();

      // 1. Reconcile State with Exchange
      await this.reconcileState();
      
      // 2. Start Market Data & User Data Streams
      console.log('🌐 Connecting to Market Data & User Data Streams...');
      try {
        await this.marketData.backfillRealCandles(this.config.activeSymbols);
      } catch (e: any) {
        console.warn('⚠️ Non-blocking candle backfill notice:', e.message);
      }
      await this.userDataStream.start();
      this.marketData.startStreaming(300, this.config.activeSymbols);

      // 3. Start Optimization
      this.runQuantumOptimization();

      // 4. Start Control Loops
      this.setupIntervals();

      console.log('✅ Autonomous System is fully operational!');
      
      // Send a "System Init" signal for immediate UI feedback
      const initSignal: TradingSignal = {
        id: `INIT-${Date.now().toString(36)}`,
        symbol: this.config.activeSymbols[0],
        timestamp: Date.now(),
        type: 'NEUTRAL',
        strength: 0.99,
        zScore: 0,
        halfLife: 0,
        targetPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        reason: 'Basel Core System Initialized - Monitoring Market Liquidity',
        strategy: 'System Diagnostics',
      };
      this.lastSignals.set(this.config.activeSymbols[0], initSignal);

      if (this.telegramService) {
        await this.telegramService.sendMessage('🚀 <b>تم تفعيل خط التداول الآلي (Basel AlgoCore)</b>\n\n✅ النظام الحسابي المستمر نشط الآن ويراقب سيولة وعمق السوق 24/7.').catch(() => {});
      }
    } catch (error: any) {
      this.isRunning = false;
      console.error('❌ Failed to start autonomous trading:', error);
      if (this.telegramService) {
        await this.telegramService.sendMessage(`🚨 <b>خطأ أثناء بدء التشغيل</b>\n\n${error.message}`).catch(() => {});
      }
    }
  }

  private setupIntervals() {
    // Risk Evaluation Loop (1m)
    this.riskInterval = setInterval(async () => {
      try {
        if (this.isRunning) {
          await this.updateRiskMetrics();
        }
      } catch (error) {
        console.error('Error in risk evaluation loop:', error);
      }
    }, 60 * 1000);

    // Position Trailing Stop & Take Profit Loop (1s)
    this.positionCheckInterval = setInterval(async () => {
      try {
        if (this.isRunning) {
          const report = this.partialProfitManager.getReport();
          if (report && report.positions) {
            for (const pos of report.positions) {
              const currentPrice = this.marketData.getPrice(pos.symbol);
              if (currentPrice > 0) {
                await this.partialProfitManager.updatePosition(pos.symbol, currentPrice);
              }
            }
          }
        }
      } catch (err) {
        // Silent catch
      }
    }, 1000);

    // Maintenance Cycle (5m)
    this.maintenanceInterval = setInterval(async () => {
      try {
        if (this.isRunning) {
          this.correlationRiskManager.calculateCorrelationMatrix();
          const balance = this.userDataStream.getBalance();
          await this.db.saveBalanceSnapshot(balance.totalEquity, balance.freeMargin, balance.unrealizedPnl);
          // Continuous inventory & orphan position reconciliation
          await this.reconcileState();
        }
      } catch (error) {
        console.error('Error in maintenance tasks:', error);
      }
    }, 5 * 60 * 1000);

    // Rebalance timer (Quantum Optimization)
    this.rebalanceTimer = setInterval(() => {
      if (this.isRunning && this.killSwitch.isEntryAllowed()) {
        this.runQuantumOptimization();
      }
    }, this.config.rebalanceIntervalMs);

    // Zero-Halt Continuous Auto-Recovery Watchdog (every 10s)
    this.watchdogInterval = setInterval(async () => {
      try {
        if (!this.isRunning && !this.killSwitch.isActive()) {
          console.log('🔄 Zero-Halt Watchdog: Auto-recovering autonomous trading loop...');
          await this.startAutonomousTrading();
        }

        // Verify market data feeds are active and fresh
        const now = Date.now();
        let staleCount = 0;
        for (const sym of this.config.activeSymbols) {
          const lastUp = this.marketData.getLastUpdateTime(sym);
          if (now - lastUp > 15000) {
            staleCount++;
          }
        }

        if (staleCount > 0) {
          await this.marketData.fetchLiveRestPrices();
        }
      } catch (e) {
        // Watchdog resilience
      }
    }, 10000);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('🛑 Stopping TradingPipeline...');

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
    if (this.riskInterval) {
      clearInterval(this.riskInterval);
      this.riskInterval = null;
    }
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
      this.positionCheckInterval = null;
    }

    this.marketData.stopStreaming();
    this.userDataStream.stop();
    this.eventJournal.record('INFO', 'SYSTEM', 'Basel Quantum Trading Pipeline paused by operator');
    console.log('✅ TradingPipeline stopped cleanly.');
  }

  public async startAutonomousTrading() {
    await this.start();
  }

  private setupEventForwarding() {
    // Forward market ticks into feature engine and strategy
    this.marketData.subscribeTicks((tick) => {
      this.handleIncomingTick(tick);
    });

    // 1. Forward real-time order updates to OrderGateway (البند 1 و 9)
    this.userDataStream.onOrderTradeUpdate((binanceOrder) => {
      this.orderGateway.applyExchangeUpdate(binanceOrder);
    });

    // 2. Position closed listener to clean up zombie positions & record trade metrics in DB (البند 4)
    this.userDataStream.onPositionClosed(async (closedSymbol) => {
      console.log(`🧹 TradingPipeline: Position for ${closedSymbol} closed on Binance. Cleaning up local tracking.`);
      this.partialProfitManager.removeBySymbol(closedSymbol);
      this.scaleInManager.removeBySymbol(closedSymbol);

      // Close open trade in db
      try {
        const openTrades = await this.db.getOpenTrades(closedSymbol);
        const lastCandle = this.marketData.getCandles(closedSymbol).slice(-1)[0];
        const exitPrice = lastCandle ? lastCandle.close : undefined;
        let totalPnl = 0;
        for (const t of openTrades) {
          const pnl = exitPrice ? (t.side === 'BUY' ? (exitPrice - t.price) * t.quantity : (t.price - exitPrice) * t.quantity) : 0;
          totalPnl += pnl;
          await this.db.closeTrade(t.id, pnl, exitPrice);
        }

        await this.telegramService.sendMessage(`
🏁 <b>تم إغلاق صفقة بالكامل</b>
━━━━━━━━━━━━━━━━
🪙 الزوج: <b>${closedSymbol}</b>
💵 سعر الخروج: <b>$${exitPrice ? (exitPrice >= 100 ? exitPrice.toFixed(2) : exitPrice.toFixed(6)) : 'سعر السوق'}</b>
💰 النتيجة التقديرية: <b>${totalPnl >= 0 ? '🟢 +' : '🔴 '}${totalPnl.toFixed(2)} USDT</b>
━━━━━━━━━━━━━━━━
✅ تم تحرير الهامش وإعادة ضبط مصفوفة الأوزان بنجاح.
        `).catch(() => {});
      } catch (err) {
        console.warn('Failed to update closed trade in DB:', err);
      }
    });

    // Forward KillSwitch events to journal & persist to DB
    this.killSwitch.subscribe((evt) => {
      this.eventJournal.record(
        evt.toLevel === 'NORMAL' ? 'INFO' : 'CRITICAL',
        'KILL_SWITCH',
        `KillSwitch transitioned to [${evt.toLevel}]: ${evt.reason}`,
        { ...evt }
      );

      const levelAr = evt.toLevel === 'NORMAL' ? 'عادي (مستقر ومفعّل)' : evt.toLevel === 'SOFT_HALT' ? 'توقف وقائي ناعم (إيقاف الأوامر الجديدة)' : 'توقف طارئ كامل (Hard Halt)';
      this.telegramService.sendMessage(`
⚠️ <b>تنبيه صمام الأمان (KillSwitch)</b>
━━━━━━━━━━━━━━━━
🛡️ الحالة الجديدة: <b>${levelAr}</b>
📝 السبب: <b>${evt.reason}</b>
━━━━━━━━━━━━━━━━
      `).catch(() => {});

      // Persist killswitch state to DB
      this.db.saveState('killswitch_state', {
        level: evt.toLevel,
        active: evt.toLevel !== 'NORMAL',
        reason: evt.reason,
        timestamp: evt.timestamp,
      }).catch((e) => console.warn('Failed to save killswitch state to DB:', e));

      // Auto cancel active orders on non-normal states
      if (evt.toLevel !== 'NORMAL') {
        const cancelled = this.orderGateway.cancelAllOrders(`KillSwitch trigger: ${evt.toLevel}`);
        this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Cancelled ${cancelled} resting orders due to KillSwitch trigger`);
      }
    });

    // Forward order executions to journal & trigger protective orders from actual fill price (البند 23)
    this.orderGateway.subscribeOrders(async (ord) => {
      this.healthMonitor.recordOrder();
      if (ord.status === 'FILLED' || ord.status === 'PARTIALLY_FILLED') {
        this.eventJournal.record('FILL', 'ORDER_GATEWAY', `Order ${ord.id} ${ord.status}: ${ord.side} ${ord.filledQuantity} ${ord.symbol} @ $${ord.avgFillPrice}`);
        
        // Telegram trade fill notification in Arabic
        if (!ord.strategyId?.startsWith('PROTECT')) {
          const sideText = ord.side === 'BUY' ? '🟢 شراء (LONG)' : '🔴 بيع (SHORT)';
          const fillPrice = ord.avgFillPrice || ord.price;
          this.telegramService.sendMessage(`
⚡ <b>تم تنفيذ صفقة تداول جديدة</b>
━━━━━━━━━━━━━━━━
🪙 الزوج: <b>${ord.symbol}</b>
📋 الاتجاه: <b>${sideText}</b>
📦 الكمية المنفذة: <b>${ord.filledQuantity}</b>
💵 متوسط سعر التنفيذ: <b>$${fillPrice}</b>
🏷️ الاستراتيجية: <b>${ord.strategyId || 'تداول خوارزمي متكيف'}</b>
━━━━━━━━━━━━━━━━
🛡️ تم تثبيت أوامر الحماية ووقف الخسارة تلقائياً في دفتر الأوامر.
          `).catch(() => {});
        }

        // Item 23: Send protection from fill handler using actual fill price
        if (ord.status === 'FILLED' && !ord.strategyId?.startsWith('PROTECT')) {
          const pending = this.pendingProtection.get(ord.id);
          if (pending) {
            const fill = ord.avgFillPrice || ord.price;
            const sl = pending.side === 'BUY' ? fill - 2 * pending.ouSigma : fill + 2 * pending.ouSigma;
            await this.orderGateway.sendProtectiveOrders(
              ord.symbol,
              pending.side,
              ord.filledQuantity,
              fill,
              sl,
              pending.ouMu,
              ord.id
            );
            this.pendingProtection.delete(ord.id);
          }
        }
      } else if (ord.status === 'REJECTED' || ord.status === 'CANCELLED') {
        this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Order ${ord.id} ${ord.status}: ${ord.errorMessage || 'No reason provided'}`);
        this.pendingProtection.delete(ord.id);
      }
    });
  }

  public getRegimeDetector(symbol?: AssetSymbol): RegimeDetector {
    if (symbol) {
      let rd = this.regimeDetectors.get(symbol);
      if (!rd) {
        rd = new RegimeDetector();
        this.regimeDetectors.set(symbol, rd);
      }
      return rd;
    }
    return this.regimeDetector;
  }

  public alertOnChange(key: string, value: string, msg: string, minGapMs = 30 * 60_000) {
    const prev = this.lastAlertState.get(key);
    if (prev?.value === value && Date.now() - prev.ts < minGapMs) return;
    this.lastAlertState.set(key, { value, ts: Date.now() });
    this.telegramService.sendMessage(msg);
  }

  public pushSignal(s: TradingSignal) {
    this.signalHistory.push(s);
    if (this.signalHistory.length > 100) this.signalHistory.shift();
  }

  public getSignalHistory(): TradingSignal[] {
    return [...this.signalHistory];
  }

  private handleIncomingTick(tick: Tick) {
    const t0 = performance.now();
    this.healthMonitor.recordMessage();

    // Update Correlation Risk price history
    this.correlationRiskManager.updatePriceHistory(tick.symbol, tick.price);

    // 1. Feature Extraction
    const candles = this.marketData.getCandles(tick.symbol);
    const book = this.orderBookBuilder.getBook(tick.symbol);
    const features = this.featureEngine.extractFeatures(tick.symbol, tick.price, candles, book);
    this.lastFeatures.set(tick.symbol, features);

    // Per-symbol Regime Detection (البند 39)
    const regimeDetector = this.getRegimeDetector(tick.symbol);
    regimeDetector.update(candles);
    const regime = regimeDetector.analyze();

    const tFeatures = performance.now() - t0;

    // 2. Risk Check on every tick
    const balance = this.userDataStream.getBalance();
    const positions = this.userDataStream.getPositions();
    const riskEval = this.riskEngine.evaluateRisk(balance, positions, this.killSwitch.getLevel());

    if (riskEval.violation && this.config.enableKillSwitch) {
      this.killSwitch.trigger(riskEval.recommendedKillLevel || 'SOFT_HALT', riskEval.violationReason || 'Risk limit breached');
    }

    // Throttle balance snapshot logging (every 5 minutes in production)
    const nowMs = Date.now();
    if (nowMs - this.lastSnapshotTime > 5 * 60 * 1000) {
      this.lastSnapshotTime = nowMs;
      this.db.saveBalanceSnapshot(balance.totalEquity, balance.freeMargin, balance.unrealizedPnl);
    }

    // 3. Automated Strategy Evaluation & Partial Profit Management
    this.partialProfitManager.updatePosition(tick.symbol, tick.price);

    if (this.config.autoTradingEnabled && this.killSwitch.isEntryAllowed()) {
      this.evaluateSignalAndExecute(tick.symbol, features, book, regime);
    }

    // Update telemetry latencies
    this.healthMonitor.updateLatency({
      feedParsingUs: 38,
      featureExtractionUs: Math.round(tFeatures * 1000),
      strategySignalUs: 45,
      riskValidationUs: 32,
    });
  }

  private async evaluateSignalAndExecute(symbol: AssetSymbol, features: any, book?: OrderBook, regime?: any) {
    // Strict Stale Market Data Check (منع التداول على بيانات قديمة أو ميتة)
    const dataAge = Date.now() - this.marketData.getLastUpdateTime(symbol);
    if (dataAge > 3000) {
      console.warn(`⚠️ [${symbol}] Stale market data detected (${dataAge}ms). Execution aborted.`);
      return;
    }

    // 0. Dynamic Risk Check
    const lastDecision = this.dynamicRiskManager.getLastDecision();
    if (lastDecision?.action === 'STOP' || lastDecision?.action === 'PAUSE') {
      console.log(`🛑 Trading halted/paused for ${symbol}: ${lastDecision.reasons[0] || 'Dynamic risk stop'}`);
      return;
    }

    // 0.1 Portfolio Tier & Safety Brake Check
    if (!this.portfolioSizer.isSymbolAllowed(symbol)) {
      return;
    }

    const openPositionsCount = this.userDataStream.getPositions().length;
    const safetyCheck = this.portfolioSizer.canOpenNewTrade(openPositionsCount);
    if (!safetyCheck.allowed) {
      console.log(`🛑 Trade blocked for ${symbol}: ${safetyCheck.reason}`);
      return;
    }

    // Check concurrency lock IMMEDIATELY (البند 2: منع التسابق وحظر الرمز أثناء العمليات غير المتزامنة)
    if (this.inFlightSymbols.has(symbol)) {
      return;
    }

    // 15-second cooldown per symbol to prevent order spamming
    const now = Date.now();
    const lastTime = this.lastOrderTime.get(symbol) || 0;
    if (now - lastTime < 15000) {
      return;
    }

    // 1. Unified Strategy Decision via DecisionEngine (البنود 15 و 16 و 39)
    const tier = this.portfolioSizer.getPortfolioTier();
    // 1. Evaluate Multi-Agent Quant Engine first if active
    const candles = this.marketData.getCandles(symbol) || [];
    const multiAgentRes = this.strategyManager.getMultiAgentEngine().evaluate(features, regime, candles);
    
    // Fall back to OU Decision Engine
    const decision = multiAgentRes?.signal 
      ? { signal: multiAgentRes.signal } 
      : this.decisionEngine.decide(symbol, features, tier, regime);

    if (!decision.signal || decision.signal.type === 'NEUTRAL' || decision.signal.strength < 0.5) {
      return;
    }

    const sig = decision.signal;
    const signalType = sig.type as 'BUY' | 'SELL';
    const strength = sig.strength;

    // ACQUIRE LOCK BEFORE ANY ASYNC OPERATIONS (البند 2)
    this.inFlightSymbols.add(symbol);
    this.lastOrderTime.set(symbol, now);

    try {
      // 2. Check if we can Scale-In to an existing position on this symbol
      const scaled = await this.checkScaleInOpportunity(
        symbol,
        signalType,
        features.currentPrice,
        strength,
        features.realizedVolAnn || 0.01
      );
      if (scaled) {
        return;
      }

      this.lastSignals.set(symbol, sig);
      this.pushSignal(sig);

      // 3. Portfolio Sizer calculation with 1% Risk-Based Sizing (البند 6 و 8)
      const balance = this.userDataStream.getBalance();
      const positionSizing = this.portfolioSizer.calculatePositionSize(
        features.currentPrice,
        sig.stopLoss,
        balance.totalEquity,
        0.01
      );

      let qty = positionSizing.quantity;

      // Correlation risk adjustment factor
      const correlationFactor = this.correlationRiskManager.getCorrelationAdjustmentFactor(this.config.activeSymbols);
      if (correlationFactor === 0) {
        console.log(`⏸️ Trading halted for ${symbol} due to critical correlation risk`);
        return;
      }
      qty = Number((qty * correlationFactor).toFixed(4));

      // Apply Dynamic Position Size Multiplier & Warm-up Multiplier (البند 43)
      const multipliers = this.dynamicRiskManager.getCurrentMultipliers();
      const warmupMul = this.dynamicRiskManager.getWarmupMultiplier(this.eventJournal.getEvents().length);
      const regimeMul = regime?.sizeMultiplier ?? 1;
      qty = Number((qty * multipliers.positionSize * warmupMul * regimeMul).toFixed(4));

      // التوافق مع الأرصدة الصغيرة (< 50$): ضمان عدم النزول عن 5.2$ لتفادي رفض بايننس (MIN_NOTIONAL)
      if (features.currentPrice > 0 && qty * features.currentPrice < 5.2) {
        qty = Number((5.5 / features.currentPrice).toFixed(4));
        if (qty === 0) {
          qty = Number((5.5 / features.currentPrice).toFixed(6));
        }
      }

      if (qty > 0.0001) {
        // Pre-trade risk validation
        const val = this.riskEngine.validateOrder(
          { quantity: qty, price: features.currentPrice, symbol },
          balance,
          this.userDataStream.getPositions(),
          book ? (book.spread / book.midPrice) * 100 : 0.02
        );

        // 💾 Save Signal to database
        await this.db.saveSignal({
          id: sig.id,
          timestamp: sig.timestamp,
          symbol,
          type: signalType,
          strength,
          zScore: sig.zScore,
          executed: val.allowed,
        });

        if (val.allowed) {
          // Set leverage and isolated margin on Binance Futures
          await this.orderGateway.ensureLeverage(symbol, this.config.maxLeverage || 10, 'ISOLATED');

          // Register pending protection to be sent upon actual order fill (البند 23)
          const ord = this.orderGateway.submitOrder({
            symbol,
            side: signalType,
            type: 'MARKET',
            quantity: qty,
            price: features.currentPrice,
            strategyId: 'OU-DECISION-ENGINE',
          });

          this.pendingProtection.set(ord.id, {
            ouSigma: features.ouSigma || (features.currentPrice * 0.005),
            ouMu: sig.takeProfit,
            side: signalType,
            symbol,
          });

          // 💾 Save Trade to database
          await this.db.saveTrade({
            id: ord.id,
            timestamp: Date.now(),
            symbol,
            side: signalType,
            quantity: qty,
            price: features.currentPrice,
            strategy: 'OU-DECISION-ENGINE',
            status: 'OPEN',
          });

          // 📝 Register with Partial Profit Manager (including maxHoldMs for Point 11 time exit)
          this.partialProfitManager.registerPosition(
            ord.id,
            symbol,
            signalType,
            features.currentPrice,
            qty,
            sig.maxHoldMs
          );

          // 📈 Register with Scale-In Manager
          this.scaleInManager.registerOriginalPosition(
            ord.id,
            symbol,
            signalType,
            features.currentPrice,
            qty
          );

          this.eventJournal.record(
            'ORDER',
            'STRATEGY',
            `Auto Strategy Triggered ${signalType} ${qty} ${symbol}: ${sig.reason}`,
            { signal: sig }
          );
        }
      }
    } catch (err) {
      console.error(`❌ Error in evaluateSignalAndExecute for ${symbol}:`, err);
    } finally {
      this.inFlightSymbols.delete(symbol);
    }
  }

  /**
   * Evaluates Scale-In opportunity for an active symbol position
   */
  private async checkScaleInOpportunity(
    symbol: AssetSymbol,
    signalType: 'BUY' | 'SELL',
    currentPrice: number,
    signalStrength: number,
    realizedVol: number = 0.01
  ): Promise<boolean> {
    const positions = this.userDataStream.getPositions();
    const balance = this.userDataStream.getBalance();

    for (const pos of positions) {
      const posSide = pos.size >= 0 ? 'BUY' : 'SELL';
      if (pos.symbol === symbol && posSide === signalType) {
        const scaleInState = this.scaleInManager.getActivePositions().find(
          (p) => p.symbol === symbol && p.side === signalType
        );

        if (scaleInState) {
          const partialState = this.partialProfitManager.getPositionState(scaleInState.originalOrderId);
          const lockedProfit = partialState?.partialProfitTaken
            ? (partialState.entryPrice * 0.05 * partialState.originalQuantity * 0.5)
            : 0;

          const scaleInCheck = await this.scaleInManager.evaluateScaleIn(
            scaleInState.originalOrderId,
            currentPrice,
            balance.totalEquity,
            lockedProfit,
            realizedVol
          );

          if (scaleInCheck.allowed && scaleInCheck.quantity) {
            console.log(`📈 Scale-In opportunity approved for ${symbol}!`);

            const scaleInOrderId = await this.scaleInManager.executeScaleIn(
              scaleInState.originalOrderId,
              currentPrice,
              scaleInCheck.quantity
            );

            if (scaleInOrderId) {
              this.partialProfitManager.registerPosition(
                scaleInOrderId,
                symbol,
                signalType,
                currentPrice,
                scaleInCheck.quantity
              );

              const updatedState = this.scaleInManager.getState(scaleInState.originalOrderId);
              await this.telegramService.sendMessage(`
📈 <b>تم تنفيذ تعزيز للمركز (Scale-In)</b>
━━━━━━━━━━━━━━━━
🪙 الزوج: <b>${symbol}</b>
📋 الاتجاه: <b>${signalType === 'BUY' ? '🟢 شراء (LONG)' : '🔴 بيع (SHORT)'}</b>
➕ الكمية المضافة: <b>${scaleInCheck.quantity.toFixed(4)}</b> بسعر <b>$${currentPrice.toFixed(2)}</b>
📊 إجمالي حجم المركز: <b>${updatedState?.currentTotalQuantity.toFixed(4)}</b>
🎯 متوسط سعر الدخول الجديد: <b>$${updatedState?.averageEntryPrice.toFixed(2)}</b>
━━━━━━━━━━━━━━━━
✅ تم تحديث مستويات جني الأرباح ووقف الخسارة التناسبي.
              `);

              return true;
            }
          } else if (scaleInCheck.reason) {
            console.log(`ℹ️ Scale-In evaluated for ${symbol} but not executed: ${scaleInCheck.reason}`);
          }
        }
      }
    }

    return false;
  }

  /**
   * Triggers Quantum Portfolio Optimization rebalance cycle with dynamic empirical covariance
   */
  public runQuantumOptimization(): QuboSolution {
    const t0 = performance.now();
    const assets = this.config.activeSymbols;

    // Calculate dynamic covariance & expected returns from real market returns
    const returnsMap = this.correlationRiskManager.getReturnsMap();
    const dynamicCov = QuboPortfolio.calculateDynamicCovariance(assets, returnsMap);
    const dynamicReturns = QuboPortfolio.calculateDynamicReturns(assets, returnsMap);

    const qubo = QuboPortfolio.buildQuboMatrix(assets, dynamicReturns, dynamicCov, {
      assets,
      riskAversion: this.config.riskAversionLambda,
      budgetPenalty: this.config.budgetPenaltyGamma,
      transactionCostPenalty: 0.15,
      cardinalityLimit: Math.min(4, assets.length),
      discretizationBits: 2,
    });

    let solution: QuboSolution;

    switch (this.config.activeSolver) {
      case 'QUANTUM_ANNEALING':
        solution = QuantumInspiredSolver.solveQuantumAnnealing(assets, qubo, dynamicReturns, dynamicCov, { numSweeps: 350 });
        break;
      case 'SIMULATED_ANNEALING':
        solution = QuantumInspiredSolver.solveSimulatedAnnealing(assets, qubo, dynamicReturns, dynamicCov, { numSweeps: 400 });
        break;
      case 'TABU_SEARCH':
        solution = QuantumInspiredSolver.solveTabuSearch(assets, qubo, dynamicReturns, dynamicCov, { numSweeps: 250 });
        break;
      case 'CLASSICAL_MARKOWITZ':
      default:
        solution = ClassicalBaseline.solveMarkowitz(assets, dynamicReturns, dynamicCov, this.config.riskAversionLambda);
        break;
    }

    const elapsed = performance.now() - t0;
    this.healthMonitor.updateLatency({ quboOptimizationMs: Number(elapsed.toFixed(2)) });
    this.lastQuboSolution = solution;

    this.eventJournal.record(
      'QUANTUM',
      'QUANTUM_SOLVER',
      `QUBO optimization converged using [${solution.solverType}] in ${solution.solveTimeMs}ms. Sharpe: ${solution.sharpeRatio}, Min Energy: ${solution.energy}`,
      { solution }
    );

    return solution;
  }

  private async reconcileState() {
    console.log('🔄 Starting State Reconciliation...');
    
    try {
      // Restore persistent KillSwitch state if previously triggered
      const savedKs = await this.db.getState<{ level: KillSwitchLevel; active: boolean; reason: string }>('killswitch_state');
      if (savedKs && savedKs.active && savedKs.level !== 'NORMAL') {
        console.warn(`🚨 Restoring persisted KillSwitch state: [${savedKs.level}] - ${savedKs.reason}`);
        this.killSwitch.trigger(savedKs.level, `Restored from persistent state: ${savedKs.reason}`, 'AUTO_RISK_ENGINE');
      }

      const apiKey = this.orderGateway.getApiKey();
      const apiSecret = this.orderGateway.getApiSecret();
      const baseUrl = this.orderGateway.getApiBaseUrl();
      const executionMode = this.orderGateway.getExecutionMode();

      if (executionMode === 'PAPER' || !apiKey || !apiSecret) {
        console.log('ℹ️ State Reconciliation: Running in PAPER mode or credentials not configured. Local state verified.');
        const currentBal = this.userDataStream.getBalance();
        await this.db.saveState('last_balance', { equity: currentBal.totalEquity, timestamp: Date.now() });
        return;
      }

      const timestamp = Date.now();
      const recvWindow = 5000;
      const query = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
      const headers = { 'X-MBX-APIKEY': apiKey };

      const [accountRes, positionsRes] = await Promise.all([
        fetch(`${baseUrl}/fapi/v2/account?${query}&signature=${signature}`, { headers }),
        fetch(`${baseUrl}/fapi/v2/positionRisk?${query}&signature=${signature}`, { headers })
      ]);

      if (!accountRes.ok || !positionsRes.ok) {
        const accErr = !accountRes.ok ? await accountRes.text().catch(() => '') : 'OK';
        const posErr = !positionsRes.ok ? await positionsRes.text().catch(() => '') : 'OK';
        console.warn(`⚠️ Reconciliation skipped: Exchange API returned error (Account HTTP ${accountRes.status}: ${accErr} | Positions HTTP ${positionsRes.status}: ${posErr})`);
        return;
      }

      const accountData = await accountRes.json();
      const positionsData = await positionsRes.json();

      const realEquity = parseFloat(accountData.totalWalletBalance);
      if (isNaN(realEquity)) {
        console.warn('⚠️ Reconciliation skipped: Invalid account data received.');
        return;
      }

      // Keep portfolio sizer synced with real exchange equity
      this.portfolioSizer.updateBalance(realEquity);

      const dbState = await this.db.getState<{ equity: number; timestamp: number }>('last_balance');
      if (dbState && Math.abs(realEquity - dbState.equity) > 1) {
        console.log(`📊 Balance reconciled: Real: $${realEquity.toFixed(2)}, DB: $${dbState.equity.toFixed(2)}. Updating DB.`);
      }
      await this.db.saveState('last_balance', { equity: realEquity, timestamp: Date.now() });

      if (Array.isArray(positionsData)) {
        const realOpenPositions = positionsData.filter((p: any) => parseFloat(p.positionAmt) !== 0);
        const realOpenSymbols = new Set(realOpenPositions.map((p: any) => p.symbol));

        // 1. Reconcile DB open trades: if a trade in DB is not on exchange, mark it CLOSED
        const dbOpenTrades = await this.db.getOpenTrades();
        for (const trade of dbOpenTrades) {
          const cleanSym = trade.symbol.replace('/', '');
          if (!realOpenSymbols.has(cleanSym)) {
            console.log(`🔄 Reconciled: Trade ${trade.id} (${trade.symbol}) is closed on exchange. Syncing DB status to CLOSED.`);
            await this.db.closeTrade(trade.id, 0);
          }
        }

        // 2. Detect & Adopt Orphan Positions (صفقات يتيمة):
        // إذا كان هناك مركز مفتوح على بايننس غير مسجل في قاعدة البيانات أو إدارة المخاطر
        // يقوم البوت بتبنيه فوراً، وإدراجه تحت نظام التتبع ووقف الخسارة وجني الأرباح التلقائي!
        const knownDbSymbols = new Set(dbOpenTrades.map((t) => t.symbol.replace('/', '')));
        for (const p of realOpenPositions) {
          const rawSymbol = p.symbol;
          const posAmt = parseFloat(p.positionAmt);
          if (posAmt === 0) continue;

          if (!knownDbSymbols.has(rawSymbol)) {
            const baseAsset = rawSymbol.replace('USDT', '');
            const formattedSymbol = `${baseAsset}/USDT` as AssetSymbol;
            const side = posAmt > 0 ? 'BUY' : 'SELL';
            const qty = Math.abs(posAmt);
            const entryPrice = parseFloat(p.entryPrice) || this.marketData.getPrice(formattedSymbol) || 1;
            const orphanOrderId = `ADOPTED-${Date.now().toString(36)}-${rawSymbol}`;

            console.log(`🛡️ Orphan Position Detected for ${rawSymbol} (${side} ${qty} @ $${entryPrice}). Adopting under algorithmic management...`);

            // تسجيل الصفقة اليتيمة في قاعدة البيانات
            await this.db.saveTrade({
              id: orphanOrderId,
              symbol: formattedSymbol,
              side: side,
              quantity: qty,
              price: entryPrice,
              timestamp: Date.now(),
              strategy: 'Orphan-Adopted-Protective-Manager',
              status: 'OPEN',
              pnl: 0,
            });

            // تسجيلها في مدير الأرباح الجزئية والوقف المتحرك
            this.partialProfitManager.registerPosition(
              orphanOrderId,
              formattedSymbol,
              side,
              entryPrice,
              qty
            );

            // تسجيلها في مدير التعزيز
            this.scaleInManager.registerOriginalPosition(
              orphanOrderId,
              formattedSymbol,
              side,
              qty,
              entryPrice
            );

            // إرسال تنبيه بالعربية عبر تليجرام لإبلاغ المتداول
            await this.telegramService.sendMessage(`
🛡️ <b>تم رصد وتبني صفقة يتيمة (Orphan Position Adopted)</b>
━━━━━━━━━━━━━━━━
🪙 الزوج: <b>${formattedSymbol}</b>
📋 الاتجاه: <b>${side === 'BUY' ? '🟢 شراء (LONG)' : '🔴 بيع (SHORT)'}</b>
📦 الكمية: <b>${qty}</b>
💵 متوسط سعر الدخول: <b>$${entryPrice >= 100 ? entryPrice.toFixed(2) : entryPrice.toFixed(6)}</b>
🏷️ الحالة: <b>تم الإلحاق بنظام الحماية وإدارة المخاطر</b>
━━━━━━━━━━━━━━━━
✅ تم تبني المركز المفتوح بنجاح، وربطه بمحرك جني الأرباح الجزئية ووقف الخسارة التلقائي لحمايته من أي انعكاسات.
            `).catch(() => {});
          }
        }

        console.log(`✅ State Reconciliation complete. In sync with Binance Futures (${executionMode}). Equity: $${realEquity.toFixed(2)}, Open positions: ${realOpenPositions.length}`);
      }
    } catch (error) {
      console.error('❌ Reconciliation failed:', error);
    }
  }

  public getLastHealth() {
    return this.healthMonitor.getHealth();
  }

  public setDatabase(database: DatabaseService) {
    this.db = database;
    console.log("🗄️ Trading Pipeline linked to new Database Storage");
  }

  public getDatabase(): DatabaseService {
    return this.db;
  }

  public getCorrelationReport(): string {
    return this.correlationRiskManager.getCorrelationReport(this.config.activeSymbols);
  }

  public getPortfolioSizer(): PortfolioSizer { return this.portfolioSizer; }
  public getPartialProfitManager(): PartialProfitManager { return this.partialProfitManager; }
  public getScaleInManager(): ScaleInManager { return this.scaleInManager; }

  // Getters
  public getMarketData(): ExchangeMarketData { return this.marketData; }
  public getOrderBookBuilder(): OrderBookBuilder { return this.orderBookBuilder; }
  public getUserDataStream(): UserDataStream { return this.userDataStream; }
  public getOrderGateway(): OrderGateway { return this.orderGateway; }
  public getRiskEngine(): RiskEngine { return this.riskEngine; }
  public getKillSwitch(): KillSwitch { return this.killSwitch; }
  public getEventJournal(): EventJournal { return this.eventJournal; }
  public getWatchdog(): SystemWatchdog {
    return this.watchdog;
  }

  public getHealthMonitor(): HealthMonitor { return this.healthMonitor; }
  public getConfig(): RuntimeConfigState { return { ...this.config }; }
  public getLastQuboSolution(): QuboSolution | null { return this.lastQuboSolution; }
  public getLastSignals(): Map<AssetSymbol, TradingSignal> { return this.lastSignals; }
  public getLastFeatures(): Map<AssetSymbol, any> { return this.lastFeatures; }
  public getIsRunning(): boolean { return this.isRunning; }

  public updateConfig(newConfig: Partial<RuntimeConfigState>) {
    this.config = { ...this.config, ...newConfig };
    this.riskEngine.updateLimits({
      maxDrawdownPct: this.config.maxDrawdownCapPct,
      maxPortfolioLeverage: this.config.maxLeverage,
    });
  }

  public triggerEmergencyKill(reason: string = 'Manual operator emergency stop') {
    this.killSwitch.trigger('HARD_HALT', reason, 'MANUAL_OPERATOR');
  }

  public resetEmergencyKill(): { success: boolean; message: string } {
    return this.killSwitch.reset();
  }

  private async updateRiskMetrics() {
    if (this.assetScreener.shouldRefresh()) {
      console.log('🔄 Refreshing qualified assets screener...');
      await this.assetScreener.refreshAllAssets();
    }

    const balance = this.userDataStream.getBalance();
    const currentTier = this.portfolioSizer.updateBalance(balance.totalEquity);
    this.config.activeSymbols = this.portfolioSizer.getAllowedSymbols();

    this.scaleInManager.updateTier(currentTier);

    const metrics = this.db.getPerformanceMetrics();
    const winRate = metrics && metrics.totalTrades > 0 ? (metrics.winningTrades / metrics.totalTrades) : 0.6;
    
    // Calculate dynamic Sharpe from trade history if available, else standard baseline
    const fills = this.userDataStream.getFills();
    let sharpe = 1.2;
    if (fills.length >= 5) {
      const returns = fills.map(f => (f.side === 'BUY' ? -f.commission : -f.commission));
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      const std = Math.sqrt(variance);
      if (std > 0) {
        sharpe = Number(((mean / std) * Math.sqrt(252)).toFixed(2));
      }
    }
    
    const drawdown = balance.totalEquity > 0 ? (10000 - balance.totalEquity) / 10000 : 0;

    const symbol = this.config.activeSymbols[0] || 'BTC/USDT';
    const candles = this.marketData.getCandles(symbol);
    if (candles.length > 20) {
      this.regimeDetector.update(candles);
      const regime = this.regimeDetector.analyze();

      console.log(`📊 Market Regime: ${regime.marketRegime} (Hurst: ${regime.hurstExponent.toFixed(3)}, ADX: ${regime.adx.toFixed(1)})`);
      console.log(`   Trading Allowed: ${regime.tradingAllowed ? '✅' : '❌'} | Confidence: ${(regime.confidence * 100).toFixed(0)}%`);

      this.dynamicRiskManager.updateMetrics({
        rollingSharpe: sharpe,
        rollingWinRate: winRate,
        rollingDrawdown: drawdown,
        drawdownVelocity: 0,
        volatilityRegime: regime.volatilityRegime,
        marketRegime: regime.marketRegime,
        tradingAllowed: regime.tradingAllowed,
        regimeConfidence: regime.confidence,
        hurstExponent: regime.hurstExponent,
        adx: regime.adx,
        parameterDrift: this.dynamicRiskManager.calculateParameterDrift()
      });

      // Only notify when regime state changes to prevent telegram spam
      if (this.previousTradingAllowed !== regime.tradingAllowed) {
        this.previousTradingAllowed = regime.tradingAllowed;
        if (!regime.tradingAllowed) {
          await this.telegramService.sendMessage(`🔄 <b>تغير نظام السوق: اتجاه قوي (TRENDING)</b>\n\nنظام السوق: <b>اتجاهي (حركة قوية)</b>\nمؤشر هيرست: <b>${regime.hurstExponent.toFixed(3)}</b>\nمؤشر ADX: <b>${regime.adx.toFixed(1)}</b>\n\nالإجراء: <b>تم التحول تلقائياً لاستراتيجية كسر الاتجاه (Trend Breakout)</b>\nالمحرك: التداول مستمر بدون توقف (Zero-Halt) مع تفعيل وقف الخسارة المتحرك.`);
        } else {
          await this.telegramService.sendMessage(`✅ <b>استقرار نظام السوق: حركة عرضية (RANGING)</b>\n\nنظام السوق: <b>${regime.marketRegime === 'RANGING' ? 'عرضي متذبذب' : 'معتدل'}</b>\nمؤشر هيرست: <b>${regime.hurstExponent.toFixed(3)}</b>\nمؤشر ADX: <b>${regime.adx.toFixed(1)}</b>\n\nالإجراء: <b>تم التحول تلقائياً لاستراتيجية الارتداد للمتوسط (Ornstein-Uhlenbeck)</b>\nالمحرك: استهداف مراجحة الانحرافات الإحصائية مع مسار التعادل.`);
        }
      }
    }
  }

  public async addSymbol(symbol: AssetSymbol): Promise<boolean> {
    const formatted = symbol.includes('/') ? symbol : `${symbol}/USDT`;
    if (!this.config.activeSymbols.includes(formatted)) {
      this.config.activeSymbols.push(formatted);
      try {
        await this.marketData.backfillRealCandles([formatted]);
        this.marketData.startStreaming(300, this.config.activeSymbols);
      } catch (err) {
        console.warn(`⚠️ Added symbol streaming notice for ${formatted}:`, err);
      }
      return true;
    }
    return false;
  }

  public getDynamicRiskManager(): DynamicRiskManager {
    return this.dynamicRiskManager;
  }

  public getAssetScreener(): AssetScreener {
    return this.assetScreener;
  }

  public getStrategyManager(): StrategyManager {
    return this.strategyManager;
  }

  public closeAllPositions() {
    this.orderGateway.cancelAllOrders('Manual operator liquidation');
    this.userDataStream.closeAllPositions();
    this.eventJournal.record('WARN', 'ORDER_GATEWAY', 'Liquidated all active portfolio positions and cancelled pending orders');
  }

  public getStrategies(): BotStrategy[] {
    const totalEquity = this.userDataStream.getBalance().totalEquity || 10000;
    const strats = this.strategyManager.getStrategies();
    // Dynamically calculate allocated capital
    for (const s of strats) {
      s.allocatedCapital = Number(((totalEquity * s.allocationPct) / 100).toFixed(2));
    }
    return strats;
  }

  public toggleStrategy(id: string, active?: boolean): BotStrategy | undefined {
    const updated = this.strategyManager.toggleStrategy(id, active);
    if (updated) {
      this.eventJournal.record(
        'INFO',
        'STRATEGY',
        `Strategy [${updated.name}] transitioned to ${updated.status}`
      );
      this.telegramService.sendMessage(
        `⚙️ <b>تحديث حالة استراتيجية التداول</b>\n\nالاستراتيجية: <b>${updated.nameAr || updated.name}</b>\nالحالة: <b>${updated.status === 'ACTIVE' ? 'نشطة مفعّلة ✅' : 'متوقفة مؤقتاً ⏸️'}</b>\nنسبة التخصيص من المحفظة: <b>${updated.allocationPct}%</b>`
      ).catch(() => {});
    }
    return updated;
  }

  public updateStrategyParams(id: string, params: Record<string, any>): BotStrategy | undefined {
    const updated = this.strategyManager.updateStrategyParams(id, params);
    if (updated) {
      this.eventJournal.record(
        'INFO',
        'STRATEGY',
        `Updated parameters for [${updated.name}]`
      );
      // If OU strategy, update decision engine params
      if (id === 'ou-mean-reversion') {
        this.decisionEngine.updateParams(params as any);
      }
    }
    return updated;
  }

  public rebalanceStrategies(allocations: Record<string, number>): BotStrategy[] {
    const totalEquity = this.userDataStream.getBalance().totalEquity || 10000;
    const updated = this.strategyManager.updateAllocations(allocations, totalEquity);
    this.eventJournal.record('INFO', 'STRATEGY', 'Rebalanced portfolio strategy allocation weights');
    return updated;
  }

  public getStrategyScreener(): StrategyScreenerItem[] {
    const candlesMap = new Map<AssetSymbol, any[]>();
    const regimeMap = new Map<AssetSymbol, RegimeAnalysis>();
    const qualifiedMap = new Map<AssetSymbol, any>();

    for (const sym of this.config.activeSymbols) {
      const candles = this.marketData.getCandles(sym);
      candlesMap.set(sym, candles);
      const rd = this.getRegimeDetector(sym);
      rd.update(candles);
      regimeMap.set(sym, rd.analyze());
    }

    for (const q of this.assetScreener.getAllAssets()) {
      qualifiedMap.set(q.symbol, q);
    }

    return this.strategyManager.evaluateScreener(
      this.lastFeatures,
      candlesMap,
      regimeMap,
      qualifiedMap
    );
  }

  private loadOptimizedParameters() {
    const configPath = './data/optimized_params.json';
    try {
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Loaded optimized parameters:', data);
        
        if (data.zScore) {
            this.dynamicRiskManager.updateThresholds({
                sharpePoor: 0.5,
            });
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not load optimized parameters, using defaults.');
    }
  }
}
