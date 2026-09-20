import { Candle } from '../domain/types';
import { calculateHurstDFA, sigmoid, clamp } from '../utils/stats';

export interface RegimeAnalysis {
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  hurstExponent: number;
  adx: number;
  volatility: number;
  trendStrength: number;
  trendScore: number;
  tradingAllowed: boolean;
  confidence: number;
  sizeMultiplier: number;
}

export class RegimeDetector {
  private priceHistory: number[] = [];
  private highHistory: number[] = [];
  private lowHistory: number[] = [];
  private returnsHistory: number[] = [];

  public update(candles: Candle[]): void {
    this.priceHistory = candles.map(c => c.close);
    this.highHistory = candles.map(c => c.high);
    this.lowHistory = candles.map(c => c.low);
    
    this.returnsHistory = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const ret = (this.priceHistory[i] - this.priceHistory[i - 1]) / this.priceHistory[i - 1];
      this.returnsHistory.push(ret);
    }
  }

  public analyze(): RegimeAnalysis {
    const volatility = this.calculateVolatility();
    const hurstExponent = this.calculateHurstExponent();
    const adx = this.calculateADX(14);
    const trendStrength = this.calculateTrendStrength();

    let volatilityRegime: RegimeAnalysis['volatilityRegime'];
    if (volatility < 0.40) volatilityRegime = 'LOW';
    else if (volatility < 0.75) volatilityRegime = 'NORMAL';
    else if (volatility < 1.10) volatilityRegime = 'HIGH';
    else volatilityRegime = 'EXTREME';

    // Continuous classification (البند 41)
    const trendScore = 0.6 * sigmoid(hurstExponent - 0.5, 12) + 0.4 * sigmoid((adx - 22) / 22, 12);
    const tradingAllowed = trendScore < 0.65;
    const confidence = Math.min(1, Math.abs(trendScore - 0.5) * 2);
    const sizeMultiplier = clamp(1 - Math.max(0, trendScore - 0.45) * 2, 0.25, 1);

    let marketRegime: RegimeAnalysis['marketRegime'];
    if (trendScore >= 0.60) {
      marketRegime = 'TRENDING';
    } else if (trendScore <= 0.40) {
      marketRegime = 'RANGING';
    } else {
      marketRegime = 'VOLATILE';
    }

    return {
      volatilityRegime,
      marketRegime,
      hurstExponent,
      adx,
      volatility,
      trendStrength,
      trendScore,
      tradingAllowed,
      confidence,
      sizeMultiplier,
    };
  }

  private calculateADX(period: number = 14): number {
    if (this.highHistory.length < period + 1) return 20;

    const n = this.highHistory.length;
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const tr: number[] = [];

    for (let i = 1; i < n; i++) {
      const highDiff = this.highHistory[i] - this.highHistory[i - 1];
      const lowDiff = this.lowHistory[i - 1] - this.lowHistory[i];

      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

      const tr1 = this.highHistory[i] - this.lowHistory[i];
      const tr2 = Math.abs(this.highHistory[i] - this.priceHistory[i - 1]);
      const tr3 = Math.abs(this.lowHistory[i] - this.priceHistory[i - 1]);
      tr.push(Math.max(tr1, tr2, tr3));
    }

    const smoothPlusDM = this.smooth(plusDM, period);
    const smoothMinusDM = this.smooth(minusDM, period);
    const smoothTR = this.smooth(tr, period);

    const plusDI = smoothPlusDM.map((dm, i) => (dm / Math.max(0.0001, smoothTR[i])) * 100);
    const minusDI = smoothMinusDM.map((dm, i) => (dm / Math.max(0.0001, smoothTR[i])) * 100);

    const dx = plusDI.map((pdi, i) => {
      const mdi = minusDI[i];
      const denominator = pdi + mdi;
      return denominator === 0 ? 0 : (Math.abs(pdi - mdi) / denominator) * 100;
    });

    const adxValues = this.smooth(dx, period);
    return adxValues[adxValues.length - 1] || 20;
  }

  private smooth(data: number[], period: number): number[] {
    const result: number[] = [];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        sum += data[i];
        if (i === period - 1) {
          result.push(sum / period);
        }
      } else {
        sum = result[result.length - 1] * (period - 1) + data[i];
        result.push(sum / period);
      }
    }

    return result;
  }

  private calculateVolatility(candleIntervalMs: number = 60000): number {
    if (this.returnsHistory.length < 20) return 0.50;
    const returns = this.returnsHistory.slice(-1440);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const periodsPerYear = (365 * 24 * 3600 * 1000) / candleIntervalMs;
    return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
  }

  private calculateHurstExponent(): number {
    if (this.returnsHistory.length < 32) return 0.5;
    return calculateHurstDFA(this.returnsHistory, 8, 32);
  }

  private calculateTrendStrength(): number {
    if (this.priceHistory.length < 50) return 0.5;
    const prices = this.priceHistory.slice(-100);
    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const predicted = x.map(xi => slope * xi + intercept);
    const ssRes = prices.reduce((sum, yi, i) => sum + Math.pow(yi - predicted[i], 2), 0);
    const meanY = sumY / n;
    const ssTot = prices.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    return 1 - (ssRes / ssTot);
  }
}
