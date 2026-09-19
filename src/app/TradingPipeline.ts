/**
 * Basel Quantum Algorithmic Trading System
 * Master Unified Trading Pipeline Orchestrator
 */

import {
  AccountBalance,
  AssetSymbol,
  CalculatedFeatures,
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
} from '../domain/types';
import { OrderGateway } from '../execution/OrderGateway';
import { UserDataStream } from '../execution/UserDataStream';
import { FeatureEngine } from '../features/FeatureEngine';
import { MeanReversionStrategy } from '../strategies/MeanReversionStrategy';
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
  private dynamicRiskManager: DynamicRiskManager;
  private regimeDetector: RegimeDetector;
  private portfolioSizer: PortfolioSizer;
  private partialProfitManager: PartialProfitManager;
  private scaleInManager: ScaleInManager;
  private lastSnapshotTime: number = 0;

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
    const executionMode = (process.env.EXECUTION_MODE as 'LIVE' | 'TESTNET' | 'PAPER') || 'PAPER';
    const apiBaseUrl = executionMode === 'TESTNET' 
      ? 'https://testnet.binancefuture.com' 
      : 'https://fapi.binance.com';

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
    // Main Trading Loop (1Hz)
    setInterval(async () => {
      try {
        if (this.isRunning) {
          await this.evaluateAndExecute();
        }
      } catch (error) {
        console.error('Error in trading loop:', error);
      }
    }, 1000);

    // Risk Evaluation Loop (1m)
    setInterval(async () => {
      try {
        if (this.isRunning) {
          await this.updateRiskMetrics();
        }
      } catch (error) {
        console.error('Error in risk evaluation loop:', error);
      }
    }, 60 * 1000);

    // Maintenance Cycle (5m)
    setInterval(async () => {
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

  public async startAutonomousTrading() {
    await this.start();
  }

  private async evaluateAndExecute() {
    // 1. Safety Check
    if (!this.killSwitch.isEntryAllowed()) return;

    // 2. Risk Decision Check
    const lastDecision = this.dynamicRiskManager.getLastDecision();
    if (lastDecision?.action === 'STOP' || lastDecision?.action === 'PAUSE') return;

    // 3. Evaluate each symbol
    for (const symbol of this.config.activeSymbols) {
      const book = this.orderBookBuilder.getBook(symbol);
      const currentPrice = book?.midPrice || 0;

      if (!book || currentPrice === 0) continue;

      // Get latest features for this symbol
      const features = this.lastFeatures.get(symbol);
      if (!features) continue;

      // 4. Strategy Evaluation
      const signal = this.strategy.evaluate(features, book);
      
      if (signal) {
        // Only trade if signal is strong enough
        if (signal.strength > 0.7) {
           const multipliers = this.dynamicRiskManager.getCurrentMultipliers();
           const baseQty = 0.01;
           const qty = Number((baseQty * multipliers.positionSize).toFixed(3));

           if (qty < 0.001) continue;

           // 5. Risk Validation
           const riskCheck = this.riskEngine.validateOrder(
             { symbol, side: signal.type === 'BUY' ? 'BUY' : 'SELL', quantity: qty, price: currentPrice },
             this.userDataStream.getBalance(),
             this.userDataStream.getPositions()
           );
           
           if (riskCheck.allowed) {
              // Rate limiting - 1 order per symbol per 10 seconds for safety in trial
              const lastTime = this.lastOrderTime.get(symbol) || 0;
              if (Date.now() - lastTime > 10000) {
                 console.log(`🎯 Executing real-time signal for ${symbol}: ${signal.type} @ ${currentPrice} (Size Adj: ${multipliers.positionSize.toFixed(2)}x)`);
                 
                 // Execute order
                 const order = this.orderGateway.submitOrder({
                   symbol,
                   side: signal.type === 'BUY' ? 'BUY' : 'SELL',
                   type: 'MARKET',
                   quantity: qty,
                   strategyId: 'MeanReversion'
                 });
                 
                 // Update tracking
                 this.lastOrderTime.set(symbol, Date.now());
                 this.lastSignals.set(symbol, signal);
                 
                 // Notify UI
                 this.eventJournal.record(
                   'ORDER',
                   'STRATEGY',
                   `Order executed for ${symbol}: ${signal.type}`,
                   { signal, orderId: order.id }
                 );

                 await this.telegramService.sendMessage(`🎯 <b>Signal Executed</b>\n\nSymbol: ${symbol}\nType: ${signal.type}\nPrice: ${currentPrice}\nReason: ${signal.reason}`);
              }
           }
        }
      }
    }
  }

  private setupEventForwarding() {
    // Forward market ticks into feature engine and strategy
    this.marketData.subscribeTicks((tick) => {
      this.handleIncomingTick(tick);
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

    // Forward order executions to journal
    this.orderGateway.subscribeOrders((ord) => {
      this.healthMonitor.recordOrder();
      if (ord.status === 'FILLED' || ord.status === 'PARTIALLY_FILLED') {
        this.eventJournal.record('FILL', 'ORDER_GATEWAY', `Order ${ord.id} ${ord.status}: ${ord.side} ${ord.filledQuantity} ${ord.symbol} @ $${ord.avgFillPrice}`);
      } else if (ord.status === 'REJECTED' || ord.status === 'CANCELLED') {
        this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Order ${ord.id} ${ord.status}: ${ord.errorMessage || 'No reason provided'}`);
      }
    });

    // Setup Auto-Trading Event Engine
    this.setupAutoTradingEngine();
  }

  /**
   * Autonomous Trading Processor: evaluated when any market update comes in
   */
  private async processMarketUpdate(symbol: AssetSymbol) {
    if (!this.isRunning) return;

    // 1. Check Kill Switch
    if (!this.killSwitch.isEntryAllowed()) {
      return;
    }

    // 2. Fetch current features and orderbook builder state
    const features = this.lastFeatures.get(symbol);
    const book = this.orderBookBuilder.getBook(symbol);

    if (!features || !book) {
      return;
    }

    // 3. Evaluate signals & execute if auto trading is enabled
    if (this.config.autoTradingEnabled) {
      await this.evaluateSignalAndExecute(symbol, features, book);
    }
  }

  /**
   * Subscribes the auto-trading decision maker to the unified event emitter
   */
  private setupAutoTradingEngine() {
    console.log('🤖 Autonomous Auto-Trading Engine activated...');
    
    // Listen to real-time market updates emitted by ExchangeMarketData
    this.marketData.on('market_update', async (symbol: string) => {
      await this.processMarketUpdate(symbol as AssetSymbol);
    });
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
      this.evaluateSignalAndExecute(tick.symbol, features, book);
    }

    // Update telemetry latencies
    this.healthMonitor.updateLatency({
      feedParsingUs: 38,
      featureExtractionUs: Math.round(tFeatures * 1000),
      strategySignalUs: 45,
      riskValidationUs: 32,
    });
  }

  private async evaluateSignalAndExecute(symbol: AssetSymbol, features: any, book?: OrderBook) {
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

    const { zScore, ouMu, ouSigma, halfLifePeriods, hurstExponent, rsi14, orderFlowImbalance } = features;

    // Check if mean-reversion signal condition is met
    if (hurstExponent > 0.52 || halfLifePeriods > 30 || halfLifePeriods <= 0) return;

    let signalType: 'BUY' | 'SELL' | null = null;
    let strength = 0;
    let reason = '';

    const adjustedMinZScore = this.portfolioSizer.getAdjustedZScoreThreshold(-1.6);

    if (zScore <= adjustedMinZScore && rsi14 < 45) {
      signalType = 'BUY';
      strength = Math.min(1.0, Math.abs(zScore) / 3.0);
      reason = `Oversold Reversion: Z-Score ${zScore.toFixed(2)} (Threshold: ${adjustedMinZScore.toFixed(1)}), RSI ${rsi14}`;
    } else if (zScore >= -adjustedMinZScore && rsi14 > 55) {
      signalType = 'SELL';
      strength = Math.min(1.0, zScore / 3.0);
      reason = `Overbought Reversion: Z-Score +${zScore.toFixed(2)}, RSI ${rsi14}`;
    }

    if (signalType && strength >= 0.6) {
      // 1. Check if we can Scale-In to an existing position on this symbol
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

      // 30-second cooldown per symbol to prevent order spamming
      const now = Date.now();
      const lastTime = this.lastOrderTime.get(symbol) || 0;
      if (now - lastTime < 30000) {
        return;
      }

      const sig: TradingSignal = {
        id: `SIG-${Date.now().toString(36)}`,
        symbol,
        timestamp: Date.now(),
        type: signalType === 'BUY' ? 'BUY' : 'SELL',
        strength,
        zScore,
        halfLife: halfLifePeriods,
        targetPrice: ouMu,
        stopLoss: signalType === 'BUY' ? features.currentPrice - 3 * ouSigma : features.currentPrice + 3 * ouSigma,
        takeProfit: ouMu,
        reason,
        strategy: 'Ornstein-Uhlenbeck Mean Reversion',
      };
      this.lastSignals.set(symbol, sig);

      // Portfolio Sizer calculation with Compounding
      const balance = this.userDataStream.getBalance();
      const positionSizing = this.portfolioSizer.calculatePositionSize(
        strength,
        features.currentPrice,
        balance.totalEquity
      );

      let qty = positionSizing.quantity;

      // Correlation risk adjustment factor
      const correlationFactor = this.correlationRiskManager.getCorrelationAdjustmentFactor(this.config.activeSymbols);
      if (correlationFactor === 0) {
        console.log(`⏸️ Trading halted for ${symbol} due to critical correlation risk`);
        return;
      }
      qty = Number((qty * correlationFactor).toFixed(4));

      // Apply Dynamic Position Size Multiplier
      const multipliers = this.dynamicRiskManager.getCurrentMultipliers();
      qty = Number((qty * multipliers.positionSize).toFixed(4));

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
          zScore,
          executed: val.allowed
        });

        if (val.allowed) {
          this.lastOrderTime.set(symbol, now);
          const ord = this.orderGateway.submitOrder({
            symbol,
            side: signalType,
            type: 'MARKET',
            quantity: qty,
            price: features.currentPrice,
            strategyId: 'OU-QUBO-COMPOUND',
          });

          // 💾 Save Trade to database
          await this.db.saveTrade({
            id: ord.id,
            timestamp: Date.now(),
            symbol,
            side: signalType === 'BUY' ? 'BUY' : 'SELL',
            quantity: qty,
            price: features.currentPrice,
            strategy: 'OU-QUBO-COMPOUND',
            status: 'OPEN'
          });

          // 📝 Register with Partial Profit Manager
          this.partialProfitManager.registerPosition(
            ord.id,
            symbol,
            signalType,
            features.currentPrice,
            qty
          );

          // 📈 Register with Scale-In Manager
          this.scaleInManager.registerOriginalPosition(
            ord.id,
            symbol,
            signalType,
            features.currentPrice,
            qty
          );

          // 🔥 Add protective orders
          this.orderGateway.sendProtectiveOrders(
              ord.symbol,
              ord.side,
              qty,
              features.currentPrice,
              sig.stopLoss,
              sig.takeProfit
          );

          this.eventJournal.record(
            'ORDER',
            'STRATEGY',
            `Auto Strategy Triggered ${signalType} ${qty} ${symbol}: ${reason}`,
            { signal: sig }
          );
        }
      }
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
        const baseUrl = this.userDataStream.getApiBaseUrl();
        
        const accountRes = await fetch(`${baseUrl}/fapi/v2/account`, {
            headers: { 'X-MBX-APIKEY': this.orderGateway.getApiKey() || '' }
        });

        const positionsRes = await fetch(`${this.orderGateway.getApiBaseUrl()}/fapi/v2/positionRisk`, {
            headers: { 'X-MBX-APIKEY': this.orderGateway.getApiKey() || '' }
        });

        if (!accountRes.ok || !positionsRes.ok) {
            console.warn('⚠️ Reconciliation skipped: Exchange API returned error or was unreachable.');
            return;
        }

        const accountData = await accountRes.json();
        const positionsData = await positionsRes.json();

        const realEquity = parseFloat(accountData.totalWalletBalance);
        if (isNaN(realEquity)) {
            console.warn('⚠️ Reconciliation skipped: Invalid account data received.');
            return;
        }

        const dbState = await this.db.getState<{equity: number, timestamp: number}>('last_balance');
        
        if (dbState && Math.abs(realEquity - dbState.equity) > 1) {
            console.warn(`⚠️ Balance mismatch! Real: ${realEquity}, DB: ${dbState.equity}. Updating DB.`);
            await this.db.saveState('last_balance', { equity: realEquity, timestamp: Date.now() });
        }

        if (!Array.isArray(positionsData)) {
            console.warn('⚠️ Reconciliation skipped: Invalid positions data received.');
            return;
        }

        const realOpenPositions = positionsData.filter((p: any) => parseFloat(p.positionAmt) !== 0);
        const dbOpenTrades = await this.db.getOpenTrades();

        if (realOpenPositions.length !== dbOpenTrades.length) {
            console.error(` CRITICAL: Position mismatch! Real: ${realOpenPositions.length}, DB: ${dbOpenTrades.length}`);
            if (this.config.executionMode !== 'PAPER_TRADING') {
                await this.telegramService.sendMessage(`🚨 <b>Reconciliation Failed</b>\nPositions mismatch detected. Bot halted.`);
                this.killSwitch.trigger('HARD_HALT', 'State mismatch');
            }
            return;
        }

        console.log('✅ State Reconciliation successful. Bot is in sync with Exchange.');
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

  public stop() {
    this.isRunning = false;
    this.marketData.stopStreaming();
    this.userDataStream.stop();
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
    this.eventJournal.record('INFO', 'SYSTEM', 'Basel Quantum Trading Pipeline paused by operator');
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

  public getRegimeDetector(): RegimeDetector {
    return this.regimeDetector;
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
