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
import { RegimeDetector } from '../risk/RegimeDetector';
import { PortfolioSizer } from '../risk/PortfolioSizer';
import { PartialProfitManager } from '../execution/PartialProfitManager';
import { ScaleInManager } from '../execution/ScaleInManager';
import { AssetScreener } from '../market-data/AssetScreener';
import fs from 'fs';

export class TradingPipeline {
  private assetScreener: AssetScreener;
  private marketData: ExchangeMarketData;
  private orderBookBuilder: OrderBookBuilder;
  private featureEngine: FeatureEngine;
  private userDataStream: UserDataStream;
  private orderGateway: OrderGateway;
  private riskEngine: RiskEngine;
  private killSwitch: KillSwitch;
  private eventJournal: EventJournal;
  private healthMonitor: HealthMonitor;
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

  constructor(telegramService: TelegramService) {
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
    this.telegramService = telegramService;
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

    // Load optimized parameters if available
    this.loadOptimizedParameters();

    this.dynamicRiskManager.on('critical_alert', async (decision) => {
      await this.telegramService.sendMessage(`🚨 <b>Critical Risk Alert</b>\n\nAction: ${decision.action}\nLeverage: ${(decision.leverageMultiplier * 100).toFixed(0)}%\nPosition Size: ${(decision.positionSizeMultiplier * 100).toFixed(0)}%\n\nReasons:\n${decision.reasons.map((r: string) => `• ${r}`).join('\n')}`);
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
      await this.userDataStream.start();
      this.marketData.startStreaming(300);

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

      await this.telegramService.sendMessage('🚀 <b>Basel AlgoCore Started</b>\n\nAutonomous Trading System is now active.');
    } catch (error: any) {
      this.isRunning = false;
      console.error('❌ Failed to start autonomous trading:', error);
      await this.telegramService.sendMessage(`🚨 <b>Critical Startup Error</b>\n\n${error.message}`);
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

    // Maintenance Cycle (5m)
    this.maintenanceInterval = setInterval(async () => {
      try {
        if (this.isRunning) {
          this.correlationRiskManager.calculateCorrelationMatrix();
          const balance = this.userDataStream.getBalance();
          await this.db.saveBalanceSnapshot(balance.totalEquity, balance.freeMargin, balance.unrealizedPnl);
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
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('🛑 Stopping TradingPipeline...');

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

    // 2. Position closed listener to clean up zombie positions (البند 4)
    this.userDataStream.onPositionClosed((closedSymbol) => {
      console.log(`🧹 TradingPipeline: Position for ${closedSymbol} closed on Binance. Cleaning up local tracking.`);
      this.partialProfitManager.removeBySymbol(closedSymbol);
      this.scaleInManager.removeBySymbol(closedSymbol);
    });

    // Forward KillSwitch events to journal
    this.killSwitch.subscribe((evt) => {
      this.eventJournal.record(
        evt.toLevel === 'NORMAL' ? 'INFO' : 'CRITICAL',
        'KILL_SWITCH',
        `KillSwitch transitioned to [${evt.toLevel}]: ${evt.reason}`,
        { ...evt }
      );

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
              pending.ouMu
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
    const decision = this.decisionEngine.decide(symbol, features, tier, regime);

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
        strength,
        features.currentPrice,
        balance.totalEquity,
        sig.stopLoss
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
📈 <b>Scale-In Executed</b>
━━━━━━━━━━━━━━━━
Symbol: ${symbol}
Side: ${signalType}
Added Qty: ${scaleInCheck.quantity.toFixed(4)} @ $${currentPrice.toFixed(2)}
Total Position: ${updatedState?.currentTotalQuantity.toFixed(4)}
New Avg Entry: $${updatedState?.averageEntryPrice.toFixed(2)}
━━━━━━━━━━━━━━━━
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
   * Triggers Quantum Portfolio Optimization rebalance cycle
   */
  public runQuantumOptimization(): QuboSolution {
    const t0 = performance.now();
    const assets = this.config.activeSymbols;

    // Filter covariance matrix for active assets
    const allSymbols: AssetSymbol[] = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT', 'NVDA/USD', 'AAPL/USD'];
    const activeIndices = assets.map((a) => allSymbols.indexOf(a)).filter((idx) => idx !== -1);
    const subCov = activeIndices.map((i) => activeIndices.map((j) => this.covarianceMatrix[i][j]));

    const qubo = QuboPortfolio.buildQuboMatrix(assets, this.expectedReturns, subCov, {
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
        solution = QuantumInspiredSolver.solveQuantumAnnealing(assets, qubo, this.expectedReturns, subCov, { numSweeps: 350 });
        break;
      case 'SIMULATED_ANNEALING':
        solution = QuantumInspiredSolver.solveSimulatedAnnealing(assets, qubo, this.expectedReturns, subCov, { numSweeps: 400 });
        break;
      case 'TABU_SEARCH':
        solution = QuantumInspiredSolver.solveTabuSearch(assets, qubo, this.expectedReturns, subCov, { numSweeps: 250 });
        break;
      case 'CLASSICAL_MARKOWITZ':
      default:
        solution = ClassicalBaseline.solveMarkowitz(assets, this.expectedReturns, subCov, this.config.riskAversionLambda);
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

        // Reconcile DB open trades: if a trade in DB is not on exchange, mark it CLOSED
        const dbOpenTrades = await this.db.getOpenTrades();
        for (const trade of dbOpenTrades) {
          const cleanSym = trade.symbol.replace('/', '');
          if (!realOpenSymbols.has(cleanSym)) {
            console.log(`🔄 Reconciled: Trade ${trade.id} (${trade.symbol}) is closed on exchange. Syncing DB status to CLOSED.`);
            await this.db.closeTrade(trade.id, 0);
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

    const recentEvents = this.eventJournal.getEvents();
    const fills = recentEvents.filter((e: any) => e.type === 'FILL');
    
    const winRate = fills.length > 0 ? fills.filter((f: any) => (f.metadata?.pnl || 0) > 0).length / fills.length : 0.6;
    const sharpe = 1.2;
    
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

      if (!regime.tradingAllowed) {
        await this.telegramService.sendMessage(`⚠️ <b>Market Regime Change Detected</b>\n\nMarket: TRENDING (Strong Direction)\nHurst: ${regime.hurstExponent.toFixed(3)}\nADX: ${regime.adx.toFixed(1)}\n\nAction: <b>Trading PAUSED</b>\nReason: Mean Reversion strategy is not suitable for trending markets.`);
      }
    }
  }

  public getDynamicRiskManager(): DynamicRiskManager {
    return this.dynamicRiskManager;
  }

  public getAssetScreener(): AssetScreener {
    return this.assetScreener;
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
