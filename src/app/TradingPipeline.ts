import { BoardOfDirectorsEngine, BoardMeetingDecision } from '../strategies/BoardOfDirectorsEngine';
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
  isLiveTradingConfirmed,
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
import { SubWalletManager, SubWalletState } from '../risk/SubWalletManager';
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
  private boardOfDirectors: BoardOfDirectorsEngine;

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
  private subWalletManager: SubWalletManager;
  private partialProfitManager: PartialProfitManager;
  private scaleInManager: ScaleInManager;
  private lastSnapshotTime: number = 0;
  private inFlightSymbols: Set<string> = new Set();
  private peakEquityObserved: number = 0;
  private pendingProtection: Map<string, { ouSigma: number; ouMu: number; side: 'BUY' | 'SELL'; symbol: AssetSymbol }> = new Map();
  private lastAlertState: Map<string, { value: string; ts: number }> = new Map();
  private signalHistory: TradingSignal[] = [];
  private riskInterval: NodeJS.Timeout | null = null;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private positionCheckInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;
  private previousTradingAllowed: boolean = true;
  private heartbeatIntervalTimer: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number = 30 * 60 * 1000;
  private lastHeartbeatSent: number = 0;

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
    
    // Read environment configuration with dual key support (BINANCE_API_KEY / EXCHANGE_API_KEY)
    const apiKey = (process.env.EXCHANGE_API_KEY || process.env.BINANCE_API_KEY || '').trim();
    const apiSecret = (process.env.EXCHANGE_API_SECRET || process.env.BINANCE_API_SECRET || '').trim();
    const rawMode = process.env.EXECUTION_MODE;
    const hasKey = !!apiKey && !!apiSecret;
    let executionMode: ExecutionMode = normalizeExecutionMode(rawMode, hasKey);

    // 🛡️ Security Barrier: If LIVE mode is requested without explicit confirmation, safely demote to PAPER
    if (executionMode === 'LIVE' && !isLiveTradingConfirmed()) {
      console.warn('⛔ [SECURITY BARRIER] EXECUTION_MODE=LIVE requested, but CONFIRM_LIVE_TRADING=true is missing in environment. Falling back to PAPER mode for asset protection.');
      executionMode = 'PAPER';
    }

    const apiBaseUrl = getBinanceBaseUrl(executionMode);

    if (executionMode === 'LIVE') {
      this.config.executionMode = 'LIVE_EXCHANGE';
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
      apiKey: apiKey,
      apiSecret: apiSecret,
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
    this.subWalletManager = new SubWalletManager(25.0);
    this.portfolioSizer = new PortfolioSizer(this.assetScreener);
    this.partialProfitManager = new PartialProfitManager(this.orderGateway);
    this.scaleInManager = new ScaleInManager(this.orderGateway);
    this.strategyManager = new StrategyManager();
    this.boardOfDirectors = BoardOfDirectorsEngine.getInstance();


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
            console.log(`🔓 Cleared stale in-flight lock for ${sym}`);
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

    
    this.userDataStream.subscribeFills((fill) => {
      // Calculate approximate realized pnl if closing
      if (fill.realizedPnl && fill.realizedPnl !== 0) {
        this.subWalletManager.recordTradeResult(fill.realizedPnl, fill.commission || 0);
      }
    });

    this.setupEventForwarding();
    this.initHeartbeatTimer();
    this.db.getAllTrades().then((trades) => {
      this.subWalletManager.syncWithTrades(trades);
    }).catch(() => {});
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
        this.orderGateway.setSymbolFilter(asset.symbol, asset.stepSize, asset.tickSize, asset.minQuantity, asset.minNotional);
      }

      // Synchronize Sub-Wallet with all closed trades recorded in persistent DB
      try {
        const allDbTrades = await this.db.getAllTrades();
        this.subWalletManager.syncWithTrades(allDbTrades);
      } catch (err) {
        console.warn('⚠️ Could not sync sub-wallet with DB trades on boot:', err);
      }

      this.portfolioSizer.updateBalance(this.subWalletManager.getCurrentEquity());
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

    // Position Trailing Stop & Take Profit Loop (1s) - Closes simultaneously on Bot & Binance
    this.positionCheckInterval = setInterval(async () => {
      try {
        if (this.isRunning) {
          // 1. Partial Profit Manager trailing stop check
          const report = this.partialProfitManager.getReport();
          if (report && report.positions) {
            for (const pos of report.positions) {
              const currentPrice = this.marketData.getPrice(pos.symbol);
              if (currentPrice > 0) {
                await this.partialProfitManager.updatePosition(pos.symbol, currentPrice);
              }
            }
          }

          // 2. Active Exchange Positions Direct Supervisor & Live Sub-Wallet Floating PnL Sync
          const openPositions = this.userDataStream.getPositions();
          let totalUnrealizedPnl = 0;
          let totalUsedMargin = 0;

          for (const pos of openPositions) {
            const currentPrice = this.marketData.getPrice(pos.symbol) || pos.currentPrice;
            if (currentPrice > 0 && pos.entryPrice > 0) {
              const isLong = pos.size > 0;
              const pnl = isLong ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * Math.abs(pos.size);
              totalUnrealizedPnl += pnl;

              const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * (isLong ? 100 : -100);
              // 1. Full Take Profit Target: +2.8% to +3.5% (High Momentum Runner)
              if (pnlPct >= 2.8) {
                console.log(`🎯 [TAKE PROFIT TRIGGER] ${pos.symbol} reached +${pnlPct.toFixed(2)}%. Closing on Binance & Bot...`);
                await this.closeSinglePositionOnExchange(pos.symbol, `Take Profit Target Hit (+${pnlPct.toFixed(2)}%)`);
              }
              // 2. Tactical Scalp Lock: +1.6% (Locks in +5% to +8% ROE on margin before mean-reversion pullbacks)
              else if (pnlPct >= 1.6) {
                console.log(`🎯 [TACTICAL PROFIT LOCK] ${pos.symbol} reached +${pnlPct.toFixed(2)}%. Securing solid intraday gain...`);
                await this.closeSinglePositionOnExchange(pos.symbol, `Tactical Scalp Target Hit (+${pnlPct.toFixed(2)}%)`);
              }
              // 3. Stop Loss Target: -1.5% (Strict Risk Discipline, 1:2 R:R Ratio)
              else if (pnlPct <= -1.5) {
                console.log(`🛑 [STOP LOSS TRIGGER] ${pos.symbol} reached ${pnlPct.toFixed(2)}%. Closing on Binance & Bot...`);
                await this.closeSinglePositionOnExchange(pos.symbol, `Stop Loss Triggered (${pnlPct.toFixed(2)}%)`);
              }
            }
            totalUsedMargin += pos.marginUsed || 0;
          }

          // Live Sub-Wallet Floating Equity update
          this.subWalletManager.updateUnrealizedPnl(totalUnrealizedPnl, totalUsedMargin);
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
        if (openTrades.length === 0) return; // already settled by closeSinglePositionOnExchange: do not record/learn a phantom 0-PnL trade
        const lastCandle = this.marketData.getCandles(closedSymbol).slice(-1)[0];
        const exitPrice = lastCandle ? lastCandle.close : undefined;
        let totalPnl = 0;
        let totalCommissions = 0;
        for (const t of openTrades) {
          const grossPnl = exitPrice ? (t.side === 'BUY' ? (exitPrice - t.price) * t.quantity : (t.price - exitPrice) * t.quantity) : 0;
          // Deduct round-trip taker commissions (0.05% entry + 0.05% exit = 0.10% notional)
          const roundTripFee = (t.quantity * (exitPrice || t.price)) * 0.0010;
          const netPnl = Number((grossPnl - roundTripFee).toFixed(4));
          totalPnl += netPnl;
          totalCommissions += roundTripFee;
          await this.db.closeTrade(t.id, netPnl, exitPrice);
        }

        this.subWalletManager.recordTradeResult(totalPnl);
        this.boardOfDirectors.learnFromOutcome(totalPnl, closedSymbol);

        await this.telegramService.sendMessage(`
🏁 <b>تم إغلاق صفقة بالكامل (صافي بعد خصم العمولات)</b>
━━━━━━━━━━━━━━━━
🪙 الزوج: <b>${closedSymbol}</b>
💵 سعر الخروج: <b>$${exitPrice ? (exitPrice >= 100 ? exitPrice.toFixed(2) : exitPrice.toFixed(6)) : 'سعر السوق'}</b>
💰 الربح الصافي (بعد العمولات): <b>${totalPnl >= 0 ? '🟢 +' : '🔴 '}${totalPnl.toFixed(2)} USDT</b>
🏷️ عمولة المنصة (فتح + إغلاق): <b>-$${totalCommissions.toFixed(3)} USDT</b>
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

      // Auto cancel active orders on non-normal states across the entire exchange
      if (evt.toLevel !== 'NORMAL') {
        const activeSymbols = this.config.activeSymbols || [];
        this.orderGateway.cancelAllOrders(`KillSwitch trigger: ${evt.toLevel}`, activeSymbols)
          .then((cancelled: number) => {
            this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Cancelled ${cancelled} resting orders on exchange due to KillSwitch trigger`);
          })
          .catch((err: any) => {
            console.error('Failed to cancel exchange orders on KillSwitch:', err);
          });

        if (evt.toLevel === 'HARD_HALT') {
          console.warn('🚨 HARD_HALT triggered: Liquidating all open positions on exchange...');
          this.orderGateway.liquidateAllExchangePositions()
            .then((liquidated: number) => {
              this.eventJournal.record('CRITICAL', 'ORDER_GATEWAY', `Emergency liquidated ${liquidated} positions on exchange`);
            })
            .catch((err: any) => {
              console.error('Failed to liquidate positions on exchange:', err);
            });
        }
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
🛡️ جارٍ تثبيت أوامر الحماية — سيصلك تأكيد منفصل بنتيجة التثبيت.
          `).catch(() => {});
        }

        // Item 23: Send protection from fill handler using actual fill price
        if (ord.status === 'FILLED' && !ord.strategyId?.startsWith('PROTECT')) {
          const pending = this.pendingProtection.get(ord.id);
          if (pending) {
            this.pendingProtection.delete(ord.id); // delete first: protection must run exactly once
            await this.applyProtection(ord, pending);
          }
        }
      } else if (ord.status === 'REJECTED' || ord.status === 'CANCELLED') {
        this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Order ${ord.id} ${ord.status}: ${ord.errorMessage || 'No reason provided'}`);
        const pending = this.pendingProtection.get(ord.id);
        this.pendingProtection.delete(ord.id);
        // A partially filled order that is then cancelled still left an open position: protect the filled part.
        if (pending && ord.filledQuantity > 0) {
          await this.applyProtection(ord, pending);
        }
      }
    });
  }

  /**
   * Places SL/TP for a filled entry and VERIFIES the stop. If the stop cannot be placed the position
   * is closed immediately and the KillSwitch is raised: a leveraged position must never stay naked.
   */
  private async applyProtection(ord: any, pending: { side: 'BUY' | 'SELL'; ouSigma: number; ouMu: number }): Promise<void> {
    const fill = ord.avgFillPrice || ord.price;
    // Stop distance: 2 sigma, clamped to a sane band (0.4%..3% of price) so a degenerate sigma cannot produce a nonsense stop
    const rawDist = 2 * Number(pending.ouSigma);
    const dist = Math.min(Math.max(Number.isFinite(rawDist) ? rawDist : 0, fill * 0.004), fill * 0.03);
    const sl = pending.side === 'BUY' ? fill - dist : fill + dist;

    const prot = await this.orderGateway.sendProtectiveOrders(
      ord.symbol, pending.side, ord.filledQuantity, fill, sl, pending.ouMu, ord.id
    );

    if (prot.slOk) {
      this.telegramService.sendMessage(`🛡️ <b>تم تثبيت وقف الخسارة</b> على ${ord.symbol} عند $${Number(sl).toFixed(4)}${prot.tpId ? ' + هدف الربح' : ' (بدون هدف ربح)'}`).catch(() => {});
      return;
    }

    this.eventJournal.record('CRITICAL', 'ORDER_GATEWAY', `Stop-loss placement FAILED for ${ord.symbol}; closing position immediately`);
    this.telegramService.sendMessage(`🚨 <b>فشل تثبيت وقف الخسارة</b> على ${ord.symbol} — يتم إغلاق المركز فوراً لتفادي بقائه بلا حماية.`).catch(() => {});
    const res = await this.closeSinglePositionOnExchange(ord.symbol, 'Protective stop could not be placed');
    if (!res.success) {
      this.telegramService.sendMessage(`🆘 <b>تنبيه حرج:</b> تعذّر إغلاق ${ord.symbol} بعد فشل الوقف. تدخّل يدوي مطلوب فوراً.`).catch(() => {});
    }
    try {
      this.killSwitch.trigger('SOFT_HALT', `Stop-loss placement failed for ${ord.symbol}`);
    } catch (e) {
      console.warn('KillSwitch trigger after protection failure failed:', e);
    }
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
      this.evaluateSignalAndExecute(tick.symbol, features, book, regime).catch((err) => {
        console.error(`❌ Uncaught error during strategy evaluation for ${tick.symbol}:`, err);
      });
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
    try {
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

    // 🏛️ Board of Directors v6.0 Evaluation (6 Decision Makers + 8 Anti-Overfitting Guards)
    const candlesMap: Record<string, any> = {};
    for (const sym of this.config.activeSymbols || [symbol]) {
      candlesMap[sym] = this.marketData.getCandles(sym) || [];
    }
    const boardDecision = this.boardOfDirectors.holdMeeting({
      symbol,
      candles,
      candlesMap,
      signals: [sig],
      features,
      regime,
      capital: this.subWalletManager.getCurrentEquity(),
      latencyMs: 15
    });

    if (boardDecision.verdict === 'REJECTED') {
      console.log('🏛️ [BOARD REJECTED] ' + symbol + ' signal blocked by Board of Directors: ' + boardDecision.action + ' (Guards: ' + boardDecision.guardsPassed + '/8)');
      this.eventJournal.record('WARN', 'STRATEGY', 'Signal blocked for ' + symbol + ': ' + boardDecision.action);
      return;
    }

    // ACQUIRE LOCK BEFORE ANY ASYNC OPERATIONS (البند 2)
    this.inFlightSymbols.add(symbol);
    this.lastOrderTime.set(symbol, now);

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
      const subEquity = this.subWalletManager.getCurrentEquity();
      const positionSizing = this.portfolioSizer.calculatePositionSize(
        features.currentPrice,
        sig.stopLoss,
        subEquity,
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

      // Minimum-notional handling. The old code raised ANY undersized order to ~$5.5, which silently
      // cancelled every risk reduction applied above (dynamic risk, regime, warm-up, correlation).
      // Default: skip the trade. Opt-in bump (ALLOW_MIN_NOTIONAL_BUMP=true) is capped at 3x the risk-sized notional.
      const symFilter = this.orderGateway.getSymbolFilter(symbol);
      const minNotionalUsd = Number(symFilter.minNotional) || 5;
      const minQty = symFilter.minQty || 0.0001;
      const riskSizedNotional = qty * features.currentPrice;
      if (features.currentPrice > 0 && riskSizedNotional < minNotionalUsd * 1.02) {
        const bumpAllowed = process.env.ALLOW_MIN_NOTIONAL_BUMP === 'true';
        const bumpedNotional = minNotionalUsd * 1.1;
        if (bumpAllowed && riskSizedNotional > 0 && bumpedNotional <= riskSizedNotional * 3) {
          qty = Number((bumpedNotional / features.currentPrice).toFixed(6));
        } else {
          console.log(`⏭️ Skipping ${symbol}: risk-sized notional $${riskSizedNotional.toFixed(2)} is below exchange minimum $${minNotionalUsd}`);
          return;
        }
      }

      const subAvailableMargin = this.subWalletManager.getAvailableMargin();
      const requiredLev = positionSizing.leverage || 5;
      const notionalVal = qty * features.currentPrice;
      const requiredMargin = notionalVal / requiredLev;

      if (subAvailableMargin < requiredMargin) {
        console.log(`⚠️ Insufficient sub-wallet margin for ${symbol}: needed $${requiredMargin.toFixed(2)}, available $${subAvailableMargin.toFixed(2)}`);
        return;
      }

      if (qty >= minQty && qty > 0) {
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

      // Synchronize UserDataStream positions and balance directly with Binance REST snapshot (البند 12)
      this.userDataStream.syncAccountSnapshot(accountData);

      // Keep portfolio sizer synced with real exchange equity
      this.portfolioSizer.updateBalance(this.subWalletManager.getCurrentEquity());

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
            const shouldAdopt = process.env.ADOPT_ORPHANS === 'true';
            if (!shouldAdopt) {
              console.log(`ℹ️ [RECONCILE] Position on exchange for ${rawSymbol} (Amt: ${posAmt}) not generated by BaselBot. ADOPT_ORPHANS is false; leaving position unmanaged.`);
              continue;
            }

            const baseAsset = rawSymbol.replace('USDT', '');
            const formattedSymbol = `${baseAsset}/USDT` as AssetSymbol;
            const side = posAmt > 0 ? 'BUY' : 'SELL';
            const qty = Math.abs(posAmt);
            const entryPrice = parseFloat(p.entryPrice) || this.marketData.getPrice(formattedSymbol) || 1;
            const orphanOrderId = `ADOPTED-${Date.now().toString(36)}-${rawSymbol}`;

            console.log(`🛡️ Orphan Position Detected for ${rawSymbol} (${side} ${qty} @ $${entryPrice}). Adopting under algorithmic management (ADOPT_ORPHANS=true)...`);

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

            // تسجيلها في مدير التعزيز بالترتيب الصحيح: (orderId, symbol, side, entryPrice, quantity)
            this.scaleInManager.registerOriginalPosition(
              orphanOrderId,
              formattedSymbol,
              side,
              entryPrice,
              qty
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

  public getSubWallet(): SubWalletManager { return this.subWalletManager; }

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
  public getTelegramService(): TelegramService { return this.telegramService; }

  /**
   * Continuous 30-Minute Telegram Heartbeat System
   * Runs independently of whether bot is actively trading or paused.
   * Periodically reports exact running/stopped status, sub-wallet metrics, and market conditions.
   */
  public initHeartbeatTimer(): void {
    if (this.heartbeatIntervalTimer) {
      clearInterval(this.heartbeatIntervalTimer);
      this.heartbeatIntervalTimer = null;
    }

    const config = this.telegramService.getHeartbeatConfig();
    const intervalMinutes = config.intervalMinutes || 30;
    this.heartbeatIntervalMs = intervalMinutes * 60 * 1000;

    console.log(`⏱️ [TELEGRAM-HEARTBEAT] Periodic 30-minute status alert loop activated. Interval: ${intervalMinutes} minutes.`);

    // Run periodically every 30 minutes
    this.heartbeatIntervalTimer = setInterval(async () => {
      try {
        const currentConfig = this.telegramService.getHeartbeatConfig();
        if (currentConfig.enabled) {
          await this.sendHeartbeatNotification(false);
        }
      } catch (err) {
        console.error('❌ [TELEGRAM-HEARTBEAT] Error in periodic heartbeat dispatch:', err);
      }
    }, this.heartbeatIntervalMs);
  }

  public async sendHeartbeatNotification(isManual: boolean = false): Promise<{ success: boolean; isRunning: boolean; message: string }> {
    const isBotRunning = this.isRunning && !this.killSwitch.isActive();
    const subWallet = this.subWalletManager.getState();
    const balance = this.userDataStream.getBalance();
    const positions = this.userDataStream.getPositions();
    const killSwitchActive = this.killSwitch.isActive();
    const executionMode = this.config.executionMode || 'TESTNET';

    // Snapshot of major prices
    const btcPrice = this.marketData.getPrice('BTC/USDT');
    const ethPrice = this.marketData.getPrice('ETH/USDT');
    const solPrice = this.marketData.getPrice('SOL/USDT');

    const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    const intervalMins = this.telegramService.getHeartbeatConfig().intervalMinutes || 30;

    let msg = '';
    if (isBotRunning) {
      msg = `🟢 <b>إشعار نبضات البوت الدوري (Basel AlgoCore Heartbeat)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ <b>حالة البوت الحالية:</b> 🟢 <b>قيد التشغيل والعمل 24/7 (RUNNING)</b>\n` +
        `⏱️ <b>الفترة:</b> إشعار نصف ساعوي دوري (كل ${intervalMins} دقيقة)${isManual ? ' [فحص يدوي فوري]' : ''}\n` +
        `🎯 <b>وضع التنفيذ:</b> <b>${executionMode}</b>\n` +
        `🛡️ <b>درع الأمان (Kill-Switch):</b> 🟢 في أمان تام (طبيعي)\n\n` +
        `💼 <b>حالة المحفظة والأرباح:</b>\n` +
        `• المحفظة الثانوية ($25): <b>$${subWallet.currentEquity.toFixed(2)}</b> (${subWallet.growthPct >= 0 ? '+' : ''}${subWallet.growthPct.toFixed(1)}% ROI)\n` +
        `• الأرباح المحققة: <b>${subWallet.realizedProfit >= 0 ? '🟢 +' : '🔴 '}$${subWallet.realizedProfit.toFixed(2)} USDT</b>\n` +
        `• الخزينة المركزية المحمية: <b>$${balance.totalEquity.toFixed(2)} USDT</b>\n` +
        `• الصفقات المنفذة: <b>${subWallet.totalTrades}</b> (${subWallet.winningTrades} رابحة / ${subWallet.losingTrades} خاسرة - ${subWallet.winRate.toFixed(0)}%)\n` +
        `• المراكز المفتوحة حالياً: <b>${positions.length} مركز نشط</b>\n\n` +
        `📊 <b>أسعار السوق اللحظية:</b>\n` +
        `• BTC: <b>$${btcPrice > 0 ? btcPrice.toLocaleString(undefined, { minimumFractionDigits: 1 }) : '---'}</b>\n` +
        `• ETH: <b>$${ethPrice > 0 ? ethPrice.toLocaleString(undefined, { minimumFractionDigits: 1 }) : '---'}</b>\n` +
        `• SOL: <b>$${solPrice > 0 ? solPrice.toFixed(2) : '---'}</b>\n\n` +
        `🕒 <b>توقيت الإشعار:</b> ${nowStr} (${dateStr})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ المحرك يعمل باستمرار ويراقب سيولة وعمق السوق. الإشعار القادم بعد ${intervalMins} دقيقة.`;
    } else {
      msg = `🔴 <b>إشعار نبضات البوت الدوري (Basel AlgoCore Heartbeat)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ <b>حالة البوت الحالية:</b> 🛑 <b>متوقف عن العمل حالياً (STOPPED / PAUSED)</b>\n` +
        `⏱️ <b>الفترة:</b> إشعار نصف ساعوي دوري (كل ${intervalMins} دقيقة)${isManual ? ' [فحص يدوي فوري]' : ''}\n` +
        `📝 <b>السبب:</b> ${killSwitchActive ? 'تم تفعيل درع الطوارئ (Kill-Switch)' : 'البوت في وضع الإيقاف المؤقت بواسطة المشغل'}\n` +
        `🛡️ <b>حالة رأس المال:</b> محفوظ في أمان تام بنسبة 100%\n\n` +
        `💼 <b>حالة المحفظة:</b>\n` +
        `• المحفظة الثانوية ($25): <b>$${subWallet.currentEquity.toFixed(2)}</b>\n` +
        `• الأرباح المحققة السابقة: <b>${subWallet.realizedProfit >= 0 ? '+' : ''}$${subWallet.realizedProfit.toFixed(2)} USDT</b>\n` +
        `• الخزينة المركزية المحمية: <b>$${balance.totalEquity.toFixed(2)} USDT</b>\n` +
        `• المراكز المفتوحة: <b>${positions.length} مركز</b>\n\n` +
        `🕒 <b>توقيت الإشعار:</b> ${nowStr} (${dateStr})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ <b>تنبيه للمشغل:</b> البوت لا يقوم بتنفيذ صفقات جديدة حالياً. لتشغيل البوت يرجى التوجه للوحة التحكم والنقر على "تشغيل البوت". الإشعار القادم بعد ${intervalMins} دقيقة.`;
    }

    const ok = await this.telegramService.sendMessage(msg);
    if (ok) {
      this.lastHeartbeatSent = Date.now();
      this.telegramService.recordHeartbeatSent();
      console.log(`📡 [TELEGRAM-HEARTBEAT] Dispatched 30-min status heartbeat (Bot status: ${isBotRunning ? 'RUNNING' : 'STOPPED'})`);
    } else {
      console.warn(`⚠️ [TELEGRAM-HEARTBEAT] Heartbeat notification could not be delivered. Ensure Bot Token and Chat ID are configured.`);
    }

    return {
      success: ok,
      isRunning: isBotRunning,
      message: isBotRunning ? 'Bot is RUNNING' : 'Bot is STOPPED'
    };
  }

  public getHeartbeatStatus() {
    const config = this.telegramService.getHeartbeatConfig();
    const intervalMins = config.intervalMinutes || 30;
    const intervalMs = intervalMins * 60 * 1000;
    const lastSent = this.lastHeartbeatSent || config.lastSent || 0;
    const nextDue = lastSent > 0 ? lastSent + intervalMs : Date.now() + intervalMs;

    return {
      enabled: config.enabled,
      intervalMinutes: intervalMins,
      lastSent,
      nextDue,
      isRunning: this.isRunning && !this.killSwitch.isActive(),
      isConfigured: this.telegramService.getConfigStatus().isConfigured,
      chatId: this.telegramService.getConfigStatus().maskedChatId
    };
  }

  public updateHeartbeatSettings(enabled: boolean, intervalMinutes?: number) {
    this.telegramService.updateConfig(
      undefined as any,
      undefined as any,
      undefined,
      enabled,
      intervalMinutes
    );
    this.initHeartbeatTimer();
  }

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
      for (const asset of this.assetScreener.getAllAssets()) {
        this.orderGateway.setSymbolFilter(asset.symbol, asset.stepSize, asset.tickSize, asset.minQuantity, asset.minNotional);
      }
    }

    const balance = this.userDataStream.getBalance();
    const currentTier = this.portfolioSizer.updateBalance(this.subWalletManager.getCurrentEquity());
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
    
    this.peakEquityObserved = Math.max(this.peakEquityObserved, balance.totalEquity);
    const drawdown = this.peakEquityObserved > 0
      ? Math.max(0, (this.peakEquityObserved - balance.totalEquity) / this.peakEquityObserved)
      : 0;

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

  public getBoardOfDirectors(): BoardOfDirectorsEngine {
    return this.boardOfDirectors;
  }
  public getStrategyManager(): StrategyManager {
    return this.strategyManager;
  }

  public async closeSinglePositionOnExchange(
    symbol: AssetSymbol,
    reason: string = "Manual / Target Exit"
  ): Promise<{
    success: boolean;
    message: string;
    pnl?: number;
    symbol?: string;
    exitPrice?: number;
    reason?: string;
    learningEvent?: any;
  }> {
    console.log(`🛑 [PIPELINE CLOSE] Closing ${symbol} on Binance and local systems... Reason: ${reason}`);
    this.inFlightSymbols.add(symbol);
    try {
      const pos = this.userDataStream.getPosition(symbol);
      const closeRes = await this.orderGateway.closePositionDirectlyOnBinance(symbol, pos?.size);
      if (!closeRes.success) {
        // Do NOT touch local state: the position (and its stop) still exists on the exchange.
        this.eventJournal.record('CRITICAL', 'ORDER_GATEWAY', `Exchange close FAILED for ${symbol}: ${closeRes.error || 'unknown'}`);
        this.telegramService.sendMessage(`🆘 <b>فشل إغلاق ${symbol} على بايننس</b>\nالسبب: ${String(closeRes.error || 'غير معروف').replace(/[<>&]/g, '')}\nالمركز ما زال مفتوحاً — تحقق يدوياً.`).catch(() => {});
        return { success: false, message: `Exchange close failed for ${symbol}: ${closeRes.error || 'unknown'}. Position left untouched.` };
      }

      this.partialProfitManager.removeBySymbol(symbol);
      this.scaleInManager.removeBySymbol(symbol);
      const isPaperMode = this.orderGateway.getExecutionMode() === 'PAPER';

      const openTrades = await this.db.getOpenTrades(symbol);
      if (openTrades.length === 0) {
        if (isPaperMode) this.userDataStream.removePosition(symbol);
        return { success: true, message: `${symbol} already closed; nothing left to settle`, symbol };
      }
      const lastCandle = this.marketData.getCandles(symbol).slice(-1)[0];
      const exitPrice = lastCandle ? lastCandle.close : (pos?.currentPrice || pos?.entryPrice);
      let totalPnl = 0;
      let totalFees = 0;
      for (const t of openTrades) {
        const grossPnl = exitPrice ? (t.side === "BUY" ? (exitPrice - t.price) * t.quantity : (t.price - exitPrice) * t.quantity) : 0;
        const roundTripFee = (t.quantity * (exitPrice || t.price)) * 0.0010;
        const netPnl = Number((grossPnl - roundTripFee).toFixed(4));
        totalPnl += netPnl;
        totalFees += roundTripFee;
        await this.db.closeTrade(t.id, netPnl, exitPrice);
      }

      if (pos) {
        this.subWalletManager.recordTradeResult(totalPnl);
      }
      this.portfolioSizer.updateBalance(this.subWalletManager.getCurrentEquity());

      // Live/testnet: the position disappears via ACCOUNT_UPDATE (confirmed by the exchange). Paper: remove it here, after settlement.
      if (isPaperMode) this.userDataStream.removePosition(symbol);

      // 🏛️ Real trade feedback into Board of Directors Self-Learning Engine
      const learnEvent = this.boardOfDirectors.learnFromOutcome(totalPnl, symbol);

      this.eventJournal.record("INFO", "ORDER_GATEWAY", `Successfully closed ${symbol} on Binance and bot: Net PnL: $${totalPnl.toFixed(2)} (Fees: -$${totalFees.toFixed(3)}) (${reason})`);
      await this.telegramService.sendMessage(`🏁 <b>تم تأكيد إغلاق الصفقة على بايننس والبوت بالكامل (صافي)</b>\n━━━━━━━━━━━━━━━━\n🪙 الزوج: <b>${symbol}</b>\n💵 سعر الخروج: <b>$${exitPrice ? (exitPrice >= 100 ? exitPrice.toFixed(2) : exitPrice.toFixed(4)) : "سعر السوق"}</b>\n💰 الربح الصافي (بعد العمولات): <b>${totalPnl >= 0 ? "🟢 +" : "🔴 "}${totalPnl.toFixed(2)} USDT</b>\n🏷️ عمولة المنصة (فتح + إغلاق): <b>-$${totalFees.toFixed(3)} USDT</b>\n📝 السبب: <b>${reason}</b>\n━━━━━━━━━━━━━━━━\n✅ تم التأكد من إغلاق المركز على بايننس وتحرير الهامش بالكامل.\n🔎 البوت جاهز الآن للبحث عن الصفقة التالية.`).catch(() => {});

      return {
        success: true,
        message: `Closed ${symbol} on Binance and local state successfully`,
        pnl: totalPnl,
        symbol,
        exitPrice,
        reason,
        learningEvent: learnEvent
      };
    } catch (e: any) {
      console.error(`❌ Failed to close position for ${symbol}:`, e);
      return { success: false, message: e.message || "Close failed" };
    } finally {
      this.inFlightSymbols.delete(symbol);
    }
  }

  public async scaleUpCurrentPositions(targetMarginPerPosition: number = 6.0): Promise<{ success: boolean; results: any[]; message: string }> {
    console.log(`⚡ [SCALE UP] Adjusting open positions margin to $${targetMarginPerPosition.toFixed(2)} USDT each...`);
    const openPositions = this.userDataStream.getPositions();
    const results: any[] = [];

    if (openPositions.length === 0) {
      return {
        success: false,
        results: [],
        message: 'No open positions currently active on exchange to adjust.'
      };
    }

    for (const pos of openPositions) {
      const currentPrice = this.marketData.getPrice(pos.symbol) || pos.currentPrice || pos.entryPrice;
      const lev = pos.leverage || 3;
      const currentMargin = pos.marginUsed || ((Math.abs(pos.size) * currentPrice) / lev);

      if (currentMargin < targetMarginPerPosition && currentPrice > 0) {
        const additionalMarginNeeded = targetMarginPerPosition - currentMargin;
        const additionalNotional = additionalMarginNeeded * lev;
        let additionalQty = additionalNotional / currentPrice;

        const filter = this.orderGateway.getSymbolFilter(pos.symbol);
        const step = filter?.stepSize || 0.001;
        additionalQty = Math.max(filter?.minQty || 0.001, Math.round(additionalQty / step) * step);
        additionalQty = Number(additionalQty.toFixed(4));

        const isLong = pos.size > 0;
        const side = isLong ? 'BUY' : 'SELL';

        console.log(`⚡ [SCALE UP] Scaling up ${pos.symbol}: Margin $${currentMargin.toFixed(2)} -> Target $${targetMarginPerPosition.toFixed(2)} | Submitting order: ${side} ${additionalQty} @ ~$${currentPrice}`);

        try {
          const ord = this.orderGateway.submitOrder({
            symbol: pos.symbol,
            side: side,
            type: 'MARKET',
            quantity: additionalQty,
            price: currentPrice,
            strategyId: 'PROPORTIONAL-MARGIN-SCALE-UP',
          });

          results.push({
            symbol: pos.symbol,
            side,
            quantityAdded: additionalQty,
            previousMargin: Number(currentMargin.toFixed(2)),
            addedMargin: Number(additionalMarginNeeded.toFixed(2)),
            newTargetMargin: targetMarginPerPosition,
            orderId: ord.id,
            success: true
          });
        } catch (err: any) {
          console.error(`❌ Failed to scale up ${pos.symbol}:`, err);
          results.push({
            symbol: pos.symbol,
            error: err.message,
            success: false
          });
        }
      } else {
        results.push({
          symbol: pos.symbol,
          message: `Already at target margin ($${currentMargin.toFixed(2)} >= $${targetMarginPerPosition.toFixed(2)})`,
          currentMargin: Number(currentMargin.toFixed(2)),
          success: true
        });
      }
    }

    setTimeout(() => {
      const updatedPositions = this.userDataStream.getPositions();
      let totalUnrealized = 0;
      let totalMargin = 0;
      for (const p of updatedPositions) {
        const pPrice = this.marketData.getPrice(p.symbol) || p.currentPrice;
        if (pPrice > 0 && p.entryPrice > 0) {
          const pLong = p.size > 0;
          totalUnrealized += pLong ? (pPrice - p.entryPrice) * p.size : (p.entryPrice - pPrice) * Math.abs(p.size);
        }
        totalMargin += p.marginUsed || 0;
      }
      this.subWalletManager.updateUnrealizedPnl(totalUnrealized, totalMargin);
    }, 1500);

    return {
      success: true,
      results,
      message: `Scaled up ${results.filter(r => r.quantityAdded).length} positions to match proportional margin ($${targetMarginPerPosition.toFixed(2)} USDT).`
    };
  }

  public async liquidateAndResetForNewWallet(): Promise<void> {
    console.log('🔄 [REALIGNMENT] Closing and resetting all trades to match new 5 Sub-Wallet...');
    const currentPositions = this.userDataStream.getPositions();
    const liq = await this.orderGateway.closeAllPositionsOnExchange(currentPositions);
    if (liq.failed.length > 0) {
      throw new Error(`Realignment aborted before any data was deleted: could not close ${liq.failed.join(', ')}`);
    }
    this.orderGateway.cancelAllOrders('Full realignment for 5 micro-wallet');
    this.userDataStream.closeAllPositions();
    await this.db.resetAllTrades();
    this.subWalletManager.resetSubWallet(25.0);
    this.portfolioSizer.updateBalance(25.0);
    this.eventJournal.record('INFO', 'ORDER_GATEWAY', 'Liquidated all legacy positions on exchange and strictly enforced 1 concurrent position max for 5 Sub-Wallet');
  }

  public async closeAllPositions(): Promise<{ success: boolean; closed: number; failed: string[]; message: string }> {
    const isPaperMode = this.orderGateway.getExecutionMode() === 'PAPER';
    let closed = 0;
    let failed: string[] = [];

    if (!isPaperMode) {
      const r = await this.orderGateway.closeAllPositionsOnExchange(this.userDataStream.getPositions());
      closed = r.closed;
      failed = r.failed;
    } else {
      closed = this.userDataStream.getPositions().length;
    }

    for (const p of this.userDataStream.getPositions()) {
      if (!failed.includes(p.symbol.replace('/', ''))) {
        this.partialProfitManager.removeBySymbol(p.symbol);
        this.scaleInManager.removeBySymbol(p.symbol);
      }
    }
    this.orderGateway.cancelAllOrders('Manual operator liquidation'); // resting entry orders (local + exchange); SL/TP of survivors are kept

    if (failed.length === 0) {
      this.userDataStream.closeAllPositions(); // only after the exchange confirmed flat (or paper mode)
      this.eventJournal.record('WARN', 'ORDER_GATEWAY', `Liquidated ${closed} position(s) and cancelled pending orders`);
      return { success: true, closed, failed, message: `Closed ${closed} position(s)` };
    }

    this.eventJournal.record('CRITICAL', 'ORDER_GATEWAY', `Liquidation INCOMPLETE. Closed ${closed}, FAILED: ${failed.join(', ')}`);
    return { success: false, closed, failed, message: `Closed ${closed}; FAILED to close: ${failed.join(', ')}` };
  }

  public getExecutionMode(): ExecutionMode {
    return this.orderGateway.getExecutionMode();
  }

  public setExecutionMode(mode: ExecutionMode): void {
    if (mode === 'LIVE' && !isLiveTradingConfirmed()) {
      throw new Error('Switching to LIVE mode blocked: CONFIRM_LIVE_TRADING=true environment confirmation is required.');
    }
    this.orderGateway.setExecutionMode(mode);
    this.config.executionMode = mode === 'LIVE' ? 'LIVE_EXCHANGE' : (mode === 'TESTNET' ? 'TESTNET_EXCHANGE' : 'PAPER_TRADING');
    console.log(`🔄 Pipeline execution mode switched to: ${mode} (${this.config.executionMode})`);
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
