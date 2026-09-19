/**
 * Basel Quantum Algorithmic Trading System
 * Ornstein-Uhlenbeck Mean Reversion & Statistical Arbitrage Strategy
 */

import { AssetSymbol, OrderBook, SignalType, TradingSignal } from '../domain/types';
import { CalculatedFeatures } from '../features/FeatureEngine';

export interface StrategyConfig {
  zScoreEntryThreshold: number; // e.g. 1.8
  zScoreExitThreshold: number; // e.g. 0.3
  maxHalfLifePeriods: number; // reject if mean reversion is too slow (> 25 periods)
  maxHurstExponent: number; // reject if trending (> 0.55)
  minConfidence: number; // e.g. 0.65
  stopLossZScore: number; // e.g. 3.2
  takeProfitRatio: number; // 0.8 to 1.0 of the distance to mu
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  zScoreEntryThreshold: 1.6,
  zScoreExitThreshold: 0.25,
  maxHalfLifePeriods: 35,
  maxHurstExponent: 0.60,
  minConfidence: 0.50,
  stopLossZScore: 3.5,
  takeProfitRatio: 0.85,
};

export class MeanReversionStrategy {
  private config: StrategyConfig;
  private signalCounter: number = 0;

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };
  }

  public updateConfig(newConfig: Partial<StrategyConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public evaluate(features: CalculatedFeatures, orderBook?: OrderBook): TradingSignal | null {
    const { symbol, currentPrice, zScore, ouMu, ouSigma, halfLifePeriods, hurstExponent, rsi14, orderFlowImbalance } = features;

    // Filter 1: Regime check - Must show mean-reverting property
    if (hurstExponent > this.config.maxHurstExponent) {
      return null; // Market is trending, mean-reversion would suffer adverse selection
    }

    // Filter 2: Speed check - Reversion must be fast enough
    if (halfLifePeriods > this.config.maxHalfLifePeriods || halfLifePeriods <= 0) {
      return null; // Too sluggish
    }

    let signalType: SignalType = 'NEUTRAL';
    let strength = 0;
    let reason = '';

    // Condition A: Asset is significantly undervalued (Z-Score < -Threshold)
    if (zScore <= -this.config.zScoreEntryThreshold) {
      // Oversold confirmation via RSI or Order Flow Imbalance
      const rsiConfirm = rsi14 < 45;
      const ofiConfirm = orderFlowImbalance > -0.4;

      if (rsiConfirm && ofiConfirm) {
        signalType = zScore <= -this.config.zScoreEntryThreshold * 1.5 ? 'STRONG_BUY' : 'BUY';
        strength = Math.min(1.0, (Math.abs(zScore) / 3.0) * 0.7 + (1 - hurstExponent) * 0.3);
        reason = `OU Mean Reversion Buy: Z-Score ${zScore} below -${this.config.zScoreEntryThreshold}, Half-life ${halfLifePeriods}p, RSI ${rsi14}`;
      }
    }
    // Condition B: Asset is significantly overvalued (Z-Score > +Threshold)
    else if (zScore >= this.config.zScoreEntryThreshold) {
      const rsiConfirm = rsi14 > 55;
      const ofiConfirm = orderFlowImbalance < 0.4;

      if (rsiConfirm && ofiConfirm) {
        signalType = zScore >= this.config.zScoreEntryThreshold * 1.5 ? 'STRONG_SELL' : 'SELL';
        strength = Math.min(1.0, (zScore / 3.0) * 0.7 + (1 - hurstExponent) * 0.3);
        reason = `OU Mean Reversion Sell: Z-Score +${zScore} above +${this.config.zScoreEntryThreshold}, Half-life ${halfLifePeriods}p, RSI ${rsi14}`;
      }
    }

    if (signalType === 'NEUTRAL' || strength < this.config.minConfidence) {
      return null;
    }

    this.signalCounter += 1;
    const isBuy = signalType === 'BUY' || signalType === 'STRONG_BUY';

    // Target is equilibrium mean (mu)
    const targetPrice = ouMu;
    const distanceToMu = Math.abs(currentPrice - ouMu);
    
    // Stop loss at extreme Z-Score boundary
    const stopLoss = isBuy
      ? Number((currentPrice - this.config.stopLossZScore * ouSigma).toFixed(2))
      : Number((currentPrice + this.config.stopLossZScore * ouSigma).toFixed(2));

    const takeProfit = isBuy
      ? Number((currentPrice + distanceToMu * this.config.takeProfitRatio).toFixed(2))
      : Number((currentPrice - distanceToMu * this.config.takeProfitRatio).toFixed(2));

    return {
      id: `SIG-${this.signalCounter}-${symbol.replace('/', '')}-${Date.now().toString(36)}`,
      symbol,
      timestamp: Date.now(),
      type: signalType,
      strength: Number(strength.toFixed(3)),
      zScore,
      halfLife: halfLifePeriods,
      targetPrice,
      stopLoss,
      takeProfit,
      reason,
      strategy: 'Ornstein-Uhlenbeck Statistical Arbitrage',
    };
  }
}
