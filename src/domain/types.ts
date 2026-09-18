/**
 * Basel Quantum-Integrated Algorithmic Trading System
 * Core Domain Types and Data Contracts
 */

export type AssetSymbol = 'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT' | 'QNT/USDT' | 'NVDA/USD' | 'AAPL/USD';

export interface OrderBookLevel {
  price: number;
  size: number;
  total?: number;
}

export interface OrderBook {
  symbol: AssetSymbol;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  sequence: number;
  midPrice: number;
  spread: number;
  microPrice: number;
  orderBookImbalance: number; // -1.0 (all ask) to +1.0 (all bid)
}

export interface Tick {
  symbol: AssetSymbol;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeId: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
}

export type SignalType = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';

export interface TradingSignal {
  id: string;
  symbol: AssetSymbol;
  timestamp: number;
  type: SignalType;
  strength: number; // 0 to 1
  zScore: number;
  halfLife: number; // in periods/seconds
  targetPrice: number;
  stopLoss: number;
  takeProfit: number;
  reason: string;
  strategy: string;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET' | 'TWAP' | 'VWAP' | 'ICEBERG';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';
export type OrderStatus = 'PENDING_NEW' | 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: AssetSymbol;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number;
  status: OrderStatus;
  timeInForce: TimeInForce;
  timestamp: number;
  updatedAt: number;
  strategyId?: string;
  executionTag?: string;
  errorMessage?: string;
}

export interface Fill {
  fillId: string;
  orderId: string;
  symbol: AssetSymbol;
  side: OrderSide;
  price: number;
  quantity: number;
  commission: number;
  commissionAsset: string;
  timestamp: number;
  isMaker: boolean;
}

export interface Position {
  symbol: AssetSymbol;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  marginUsed: number;
  liquidationPrice: number;
  leverage: number;
  updatedAt: number;
}

export interface AccountBalance {
  totalEquity: number;
  availableCash: number;
  usedMargin: number;
  marginLevel: number; // Equity / Used Margin
  freeMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dailyPnl: number;
  dailyPnlPct: number;
  currency: string;
}

// Quantum & QUBO Types
export type SolverType = 'CLASSICAL_MARKOWITZ' | 'SIMULATED_ANNEALING' | 'QUANTUM_ANNEALING' | 'QAOA_CIRCUIT' | 'TABU_SEARCH';

export interface AssetParameters {
  symbol: AssetSymbol;
  expectedReturn: number;
  volatility: number;
  currentWeight: number;
  targetWeight: number;
  liquidityScore: number;
}

export interface QuboProblemConfig {
  assets: AssetSymbol[];
  riskAversion: number; // Lambda
  budgetPenalty: number; // Gamma budget constraint
  transactionCostPenalty: number;
  cardinalityLimit: number; // Maximum assets to hold
  discretizationBits: number; // Binary representation bits per asset weight
}

export interface QuboMatrix {
  dimension: number;
  matrix: number[][]; // Symmetric QUBO coefficient matrix Q where H(x) = x^T Q x
  variableMap: { [index: number]: { symbol: AssetSymbol; bit: number; weightFraction: number } };
  linearTerms: number[];
  constantOffset: number;
}

export interface QuboSolution {
  binaryVector: number[];
  energy: number;
  rawAllocations: Record<AssetSymbol, number>;
  normalizedWeights: Record<AssetSymbol, number>;
  expectedReturn: number;
  portfolioVariance: number;
  sharpeRatio: number;
  solveTimeMs: number;
  solverType: SolverType;
  iterations: number;
  feasible: boolean;
}

export interface QAOAConfig {
  pLayers: number; // Circuit depth p
  gammaParams: number[];
  betaParams: number[];
  shots: number;
  optimizationSteps: number;
  mixerType: 'X_MIXER' | 'XY_HAMILTONIAN';
}

export interface QAOAResult {
  optimalGamma: number[];
  optimalBeta: number[];
  expectationValue: number;
  groundStateProbability: number;
  stateProbabilities: { state: string; probability: number; energy: number; symbols: string[] }[];
  circuitDepth: number;
  qubitCount: number;
  fidelityScore: number;
}

// Risk and Safety
export type KillSwitchLevel = 'NORMAL' | 'SOFT_HALT' | 'HARD_HALT' | 'EMERGENCY_LIQUIDATE' | 'CIRCUIT_BREAKER';

export interface RiskLimits {
  maxDrawdownPct: number; // e.g. 5%
  maxDailyLossPct: number; // e.g. 3%
  maxPositionSizeUsd?: number;
  maxPortfolioLeverage: number; // e.g. 3.0x
  maxVaR95Pct?: number; // Value at risk limit
  maxSlippageBps?: number; // 20 bps
  maxSpreadThresholdPct?: number;
  cooldownPeriodMs?: number;
  maxSinglePositionPct?: number;
  maxSpreadSlippageBps?: number;
  stalePriceThresholdMs?: number;
  consecutiveLossKillCount?: number;
}

export interface RiskMetrics {
  portfolioValue?: number;
  currentDrawdownPct: number;
  dailyLossPct: number;
  var95: number;
  var99: number;
  cvar95: number; // Conditional Value at Risk
  cvar99?: number;
  maxDrawdownPeak?: number;
  portfolioBeta?: number;
  currentLeverage: number;
  sharpeRatio: number;
  sortinoRatio: number;
  killSwitchLevel: KillSwitchLevel;
  killSwitchActive: boolean;
  killSwitchReason?: string;
  lastBreachTimestamp?: number;
}

// Validation & Simulation
export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  symbols: AssetSymbol[];
  makerFeeBps: number;
  takerFeeBps: number;
  slippageModel: 'ZERO' | 'LINEAR_DEPTH' | 'SQUARE_ROOT_IMPACT';
  executionLatencyMs: number;
  rebalanceFrequency: 'TICK' | '1M' | '5M' | '1H' | '1D';
  solver: SolverType;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  benchmark: number;
  drawdown: number;
  cash: number;
  holdingsValue: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  totalReturnPct: number;
  annualizedReturnPct: number;
  benchmarkReturnPct: number;
  alpha: number;
  beta: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  calmarRatio: number;
  winRatePct: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgTradePnl: number;
  avgHoldTimeSec: number;
  totalFeesPaid: number;
  equityCurve: EquityPoint[];
  trades: Fill[];
  monthlyReturns: { month: string; returnPct: number }[];
}

export interface WalkForwardWindow {
  windowIndex: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  inSampleReturnPct: number;
  outOfSampleReturnPct: number;
  efficiencyRatio: number; // OOS / IS
  robustnessPass: boolean;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgInSampleSharpe: number;
  avgOutOfSampleSharpe: number;
  overallEfficiency: number;
  overfittingScore: number; // 0 (no overfit) to 1 (high overfit)
  verdict: 'HIGHLY_ROBUST' | 'MODERATE_DECAY' | 'OVERFITTED';
}

export type StressScenarioId = 'FLASH_CRASH_2010' | 'COVID_LIQUIDITY_2020' | 'CRYPTO_DEPEG_CASCADE' | 'BLACK_SWAN_VOLATILITY' | 'SPREAD_EXPLOSION';

export interface StressScenario {
  id: StressScenarioId;
  name: string;
  nameAr: string;
  description: string;
  priceDropPct: number;
  volatilityMultiplier: number;
  spreadMultiplier: number;
  liquidityDrainPct: number;
  recoveryType: 'V_SHAPED' | 'L_SHAPED' | 'SLOW_GRIND';
}

export interface CalculatedFeatures {
  symbol: AssetSymbol;
  currentPrice: number;
  zScore: number;
  ouMu: number;
  ouTheta: number;
  ouSigma: number;
  halfLifePeriods: number;
  hurstExponent: number;
  rsi14: number;
  realizedVolAnn: number;
  orderFlowImbalance: number;
  microPrice: number;
  bidAskSpread: number;
}

export type JournalEvent = LogEvent;

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'ORDER' | 'FILL' | 'QUANTUM' | 'RISK';

export interface LogEvent {
  id: string;
  timestamp: number;
  severity: LogSeverity;
  source: 'MARKET_DATA' | 'FEATURE_ENGINE' | 'STRATEGY' | 'QUANTUM_SOLVER' | 'RISK_ENGINE' | 'KILL_SWITCH' | 'ORDER_GATEWAY' | 'SYSTEM';
  message: string;
  details?: Record<string, any>;
}

export interface PipelineLatency {
  feedParsingUs: number;
  featureExtractionUs: number;
  strategySignalUs: number;
  quboOptimizationMs: number;
  riskValidationUs: number;
  orderDispatchUs: number;
  totalPipelineMs: number;
}

export interface SystemHealth {
  status: 'OPTIMAL' | 'DEGRADED' | 'HALTED' | 'STANDBY';
  uptimeSeconds: number;
  cpuUsagePct: number;
  memoryUsageMb: number;
  activeFeedsCount: number;
  messagesPerSecond: number;
  ordersPerSecond: number;
  pipelineLatency: PipelineLatency;
  lastHeartbeat: number;
}
