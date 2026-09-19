import { Candle } from '../domain/types';

export interface RegimeAnalysis {
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  hurstExponent: number;
  adx: number;
  volatility: number;
  trendStrength: number;
  tradingAllowed: boolean;
  confidence: number;
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
    if (volatility < 0.01) volatilityRegime = 'LOW';
    else if (volatility < 0.02) volatilityRegime = 'NORMAL';
    else if (volatility < 0.03) volatilityRegime = 'HIGH';
    else volatilityRegime = 'EXTREME';

    let marketRegime: RegimeAnalysis['marketRegime'];
    let tradingAllowed = true;
    let confidence = 0.5;

    if (hurstExponent > 0.55 && adx > 25) {
      marketRegime = 'TRENDING';
      tradingAllowed = false;
      confidence = 0.9;
    } else if (hurstExponent > 0.52 && adx > 20) {
      marketRegime = 'TRENDING';
      tradingAllowed = true;
      confidence = 0.7;
    } else if (hurstExponent < 0.45 && adx < 20) {
      marketRegime = 'RANGING';
      tradingAllowed = true;
      confidence = 0.85;
    } else {
      marketRegime = 'VOLATILE';
      tradingAllowed = true;
      confidence = 0.5;
    }

    return {
      volatilityRegime,
      marketRegime,
      hurstExponent,
      adx,
      volatility,
      trendStrength,
      tradingAllowed,
      confidence,
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

  private calculateVolatility(): number {
    if (this.returnsHistory.length < 20) return 0.02;
    const returns = this.returnsHistory.slice(-1440);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(1440);
  }

  private calculateHurstExponent(): number {
    if (this.returnsHistory.length < 100) return 0.5;
    const returns = this.returnsHistory.slice(-1000);
    const n = returns.length;
    const sizes = [10, 20, 50, 100];
    const rsValues: number[] = [];

    for (const size of sizes) {
      if (n < size) continue;
      const numBlocks = Math.floor(n / size);
      const rsList: number[] = [];
      for (let i = 0; i < numBlocks; i++) {
        const block = returns.slice(i * size, (i + 1) * size);
        const mean = block.reduce((a, b) => a + b, 0) / block.length;
        const cumDev: number[] = [];
        let sum = 0;
        for (const r of block) {
          sum += (r - mean);
          cumDev.push(sum);
        }
        const range = Math.max(...cumDev) - Math.min(...cumDev);
        const stdDev = Math.sqrt(block.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / block.length);
        if (stdDev > 0) rsList.push(range / stdDev);
      }
      if (rsList.length > 0) {
        const avgRs = rsList.reduce((a, b) => a + b, 0) / rsList.length;
        rsValues.push(Math.log(avgRs) / Math.log(size));
      }
    }

    if (rsValues.length === 0) return 0.5;
    const x = rsValues.map((_, i) => Math.log(sizes[i]));
    const y = rsValues.map((_, i) => Math.log(rsValues[i]));
    const n2 = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const hurst = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);
    return Math.max(0, Math.min(1, hurst));
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
