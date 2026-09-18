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

export class TradingPipeline {
  private marketData: ExchangeMarketData;
  private orderBookBuilder: OrderBookBuilder;
  private featureEngine: FeatureEngine;
  private userDataStream: UserDataStream;
  private orderGateway: OrderGateway;
  private riskEngine: RiskEngine;
  private killSwitch: KillSwitch;
  private eventJournal: EventJournal;
  private healthMonitor: HealthMonitor;

  private config: RuntimeConfigState;
  private isRunning: boolean = false;
  private lastQuboSolution: QuboSolution | null = null;
  private lastSignals: Map<AssetSymbol, TradingSignal> = new Map();
  private lastFeatures: Map<AssetSymbol, any> = new Map();
  private rebalanceTimer: any = null;

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

  constructor() {
    this.config = { ...INITIAL_RUNTIME_CONFIG };
    this.orderBookBuilder = new OrderBookBuilder(10);
    this.marketData = new ExchangeMarketData(this.orderBookBuilder);
    this.featureEngine = new FeatureEngine();
    this.userDataStream = new UserDataStream(100000);
    this.orderGateway = new OrderGateway(this.userDataStream, this.orderBookBuilder);
    this.riskEngine = new RiskEngine({ maxDrawdownPct: this.config.maxDrawdownCapPct, maxPortfolioLeverage: this.config.maxLeverage });
    this.killSwitch = new KillSwitch();
    this.eventJournal = new EventJournal(1000);
    this.healthMonitor = new HealthMonitor();

    this.setupEventForwarding();
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
  }

  private handleIncomingTick(tick: Tick) {
    const t0 = performance.now();
    this.healthMonitor.recordMessage();

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

    // 3. Automated Strategy Evaluation (if enabled and killswitch allows entry)
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

  private evaluateSignalAndExecute(symbol: AssetSymbol, features: any, book?: OrderBook) {
    const { zScore, ouMu, ouSigma, halfLifePeriods, hurstExponent, rsi14, orderFlowImbalance } = features;

    // Check if mean-reversion signal condition is met
    if (hurstExponent > 0.52 || halfLifePeriods > 30 || halfLifePeriods <= 0) return;

    let signalType: 'BUY' | 'SELL' | null = null;
    let strength = 0;
    let reason = '';

    if (zScore <= -1.6 && rsi14 < 45) {
      signalType = 'BUY';
      strength = Math.min(1.0, Math.abs(zScore) / 3.0);
      reason = `Oversold Reversion: Z-Score ${zScore.toFixed(2)}, RSI ${rsi14}, Target $${ouMu}`;
    } else if (zScore >= 1.6 && rsi14 > 55) {
      signalType = 'SELL';
      strength = Math.min(1.0, zScore / 3.0);
      reason = `Overbought Reversion: Z-Score +${zScore.toFixed(2)}, RSI ${rsi14}, Target $${ouMu}`;
    }

    if (signalType && strength >= 0.6) {
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

      // Determine order quantity based on QUBO target weight
      const quboWeight = this.lastQuboSolution?.normalizedWeights[symbol] || (1 / this.config.activeSymbols.length);
      const balance = this.userDataStream.getBalance();
      const notionalToAllocate = Math.min(balance.freeMargin * 0.25, balance.totalEquity * quboWeight * 0.5);
      const qty = Number((notionalToAllocate / Math.max(1, features.currentPrice)).toFixed(3));

      if (qty > 0.001) {
        // Pre-trade risk validation
        const val = this.riskEngine.validateOrder(
          { quantity: qty, price: features.currentPrice, symbol },
          balance,
          this.userDataStream.getPositions(),
          book ? (book.spread / book.midPrice) * 100 : 0.02
        );

        if (val.allowed) {
          this.orderGateway.submitOrder({
            symbol,
            side: signalType,
            type: 'MARKET',
            quantity: qty,
            price: features.currentPrice,
            strategyId: 'OU-QUBO-AUTO',
          });

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

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.marketData.startStreaming(250);

    // Initial optimization
    this.runQuantumOptimization();

    // Rebalance timer
    this.rebalanceTimer = setInterval(() => {
      if (this.isRunning && this.killSwitch.isEntryAllowed()) {
        this.runQuantumOptimization();
      }
    }, this.config.rebalanceIntervalMs);

    this.eventJournal.record('INFO', 'SYSTEM', 'Basel Quantum Trading Pipeline launched successfully in ' + this.config.executionMode);
  }

  public stop() {
    this.isRunning = false;
    this.marketData.stopStreaming();
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
    this.eventJournal.record('INFO', 'SYSTEM', 'Basel Quantum Trading Pipeline paused by operator');
  }

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
}
