/**
 * Basel Quantum Algorithmic Trading System
 * Feature Engineering, Statistical Arbitrage & Microstructure Alpha
 */

import { AssetSymbol, Candle, OrderBook } from '../domain/types';
import { hurstRS } from '../utils/stats';

export interface CalculatedFeatures {
  symbol: AssetSymbol;
  timestamp: number;
  currentPrice: number;
  zScore: number;
  ouTheta: number; // Mean-reversion speed
  ouMu: number; // Equilibrium price level
  ouSigma: number; // Volatility
  halfLifePeriods: number; // ln(2) / theta
  hurstExponent: number; // < 0.5 mean reverting, > 0.5 trending
  rsi14: number;
  bbUpper: number;
  bbLower: number;
  bbMiddle: number;
  realizedVolAnn: number;
  microstructureNoiseRatio: number;
  orderFlowImbalance: number;
}

export class FeatureEngine {
  private priceWindows: Map<AssetSymbol, number[]> = new Map();
  private maxWindowSize: number = 200;

  public updatePrice(symbol: AssetSymbol, price: number) {
    let window = this.priceWindows.get(symbol);
    if (!window) {
      window = [];
      this.priceWindows.set(symbol, window);
    }
    window.push(price);
    if (window.length > this.maxWindowSize) {
      window.shift();
    }
  }

  public extractFeatures(symbol: AssetSymbol, currentPrice: number, candles: Candle[], orderBook?: OrderBook): CalculatedFeatures {
    this.updatePrice(symbol, currentPrice);
    const window = this.priceWindows.get(symbol) || [currentPrice];
    const prices = window.length >= 20 ? window : candles.map((c) => c.close);

    const ou = this.estimateOrnsteinUhlenbeck(prices);
    const zScore = ou.sigma > 0 ? (currentPrice - ou.mu) / ou.sigma : 0;
    const hurst = this.estimateHurstExponent(prices);
    const rsi = this.calculateRSI(prices);
    const bb = this.calculateBollingerBands(prices);
    const vol = this.calculateRealizedVolatility(prices);
    const noiseRatio = this.calculateMicrostructureNoise(prices);
    const ofi = orderBook ? orderBook.orderBookImbalance : 0;

    return {
      symbol,
      timestamp: Date.now(),
      currentPrice,
      zScore: Number(zScore.toFixed(3)),
      ouTheta: Number(ou.theta.toFixed(4)),
      ouMu: Number(ou.mu.toFixed(2)),
      ouSigma: Number(ou.sigma.toFixed(3)),
      halfLifePeriods: Number(ou.halfLife.toFixed(1)),
      hurstExponent: Number(hurst.toFixed(3)),
      rsi14: Number(rsi.toFixed(1)),
      bbUpper: Number(bb.upper.toFixed(2)),
      bbLower: Number(bb.lower.toFixed(2)),
      bbMiddle: Number(bb.middle.toFixed(2)),
      realizedVolAnn: Number((vol * Math.sqrt(365 * 24)).toFixed(3)),
      microstructureNoiseRatio: Number(noiseRatio.toFixed(3)),
      orderFlowImbalance: Number(ofi.toFixed(3)),
    };
  }

  /**
   * Fits Ornstein-Uhlenbeck discrete process:
   * S_t - S_{t-1} = a + b * S_{t-1} + \epsilon
   * theta = -b / dt
   * mu = -a / b
   * sigma = std(residuals) / sqrt(dt)
   * Half-life = ln(2) / theta
   */
  public estimateOrnsteinUhlenbeck(prices: number[], dt: number = 1): { theta: number; mu: number; sigma: number; halfLife: number } {
    const n = prices.length;
    if (n < 5) {
      const p = prices[prices.length - 1] || 100;
      return { theta: 0.1, mu: p, sigma: p * 0.02, halfLife: 6.93 };
    }

    const x = prices.slice(0, n - 1);
    const y = prices.slice(1, n).map((p, i) => p - x[i]);

    // Ordinary Least Squares (OLS) of y on x
    const xMean = x.reduce((a, b) => a + b, 0) / x.length;
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;

    let num = 0;
    let den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - xMean) * (y[i] - yMean);
      den += Math.pow(x[i] - xMean, 2);
    }

    const b = den !== 0 ? num / den : -0.05;
    const a = yMean - b * xMean;

    const theta = Math.max(0.001, -b / dt);
    const mu = Math.abs(b) > 0.0001 ? -a / b : xMean;

    // Calculate residuals standard deviation
    let sumSqRes = 0;
    for (let i = 0; i < x.length; i++) {
      const pred = a + b * x[i];
      sumSqRes += Math.pow(y[i] - pred, 2);
    }
    const resStd = Math.sqrt(sumSqRes / Math.max(1, x.length - 2));
    const sigma = Math.max(0.001, resStd / Math.sqrt(dt));
    const halfLife = Math.log(2) / theta;

    return { theta, mu, sigma, halfLife };
  }

  /**
   * Rescaled Range (R/S) Hurst Exponent Estimation
   */
  public estimateHurstExponent(prices: number[]): number {
    const n = prices.length;
    if (n < 16) return 0.45; // Default slightly mean-reverting

    return hurstRS(prices);
  }

  public calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  public calculateBollingerBands(prices: number[], period: number = 20, numStd: number = 2): { upper: number; lower: number; middle: number } {
    const p = prices.slice(-period);
    const mean = p.reduce((a, b) => a + b, 0) / p.length;
    const variance = p.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / p.length;
    const std = Math.sqrt(variance);

    return {
      upper: mean + numStd * std,
      lower: mean - numStd * std,
      middle: mean,
    };
  }

  public calculateRealizedVolatility(prices: number[]): number {
    if (prices.length < 2) return 0.02;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  public calculateMicrostructureNoise(prices: number[]): number {
    if (prices.length < 10) return 0.05;
    // Ratio of high-frequency variance to low-frequency scaled variance (Zhang et al. 2005)
    const diffs1 = [];
    for (let i = 1; i < prices.length; i++) {
      diffs1.push(Math.pow(prices[i] - prices[i - 1], 2));
    }
    const var1 = diffs1.reduce((a, b) => a + b, 0) / diffs1.length;
    const meanPrice = prices[prices.length - 1] || 1;
    return Math.min(1.0, var1 / Math.pow(meanPrice * 0.01, 2));
  }
}
