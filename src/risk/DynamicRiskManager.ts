import { EventEmitter } from 'events';

export interface RiskMetrics {
  rollingSharpe: number;
  rollingWinRate: number;
  rollingDrawdown: number;
  drawdownVelocity: number; // % loss per day
  parameterDrift: number; // 0-1 (0 = aligned with WFO, 1 = complete drift)
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  marketRegime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  tradingAllowed: boolean;
  regimeConfidence: number;
  hurstExponent?: number;
  adx?: number;
}

export interface RiskDecision {
  timestamp: number;
  leverageMultiplier: number; // 0.0 - 1.0
  positionSizeMultiplier: number; // 0.0 - 1.0
  action: 'NORMAL' | 'REDUCE_LEVERAGE' | 'REDUCE_SIZE' | 'PAUSE' | 'STOP';
  reasons: string[];
  metrics: RiskMetrics;
}

export class DynamicRiskManager extends EventEmitter {
  private metrics: RiskMetrics;
  private decisions: RiskDecision[] = [];
  private wfoParameters: any;
  private currentParameters: any;

  private thresholds = {
    sharpeExcellent: 1.5,
    sharpeGood: 1.0,
    sharpePoor: 0.5,
    winRateExcellent: 0.60,
    winRateGood: 0.55,
    winRatePoor: 0.45,
    maxDrawdownVelocity: 0.05, // 5% per day
    maxParameterDrift: 0.3, // 30% drift
  };

  public updateThresholds(newThresholds: Partial<typeof this.thresholds>) {
    Object.assign(this.thresholds, newThresholds);
  }

  constructor(wfoParameters: any) {
    super();
    this.wfoParameters = wfoParameters;
    this.currentParameters = { ...wfoParameters };
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): RiskMetrics {
    return {
      rollingSharpe: 1.5,
      rollingWinRate: 0.60,
      rollingDrawdown: 0.0,
      drawdownVelocity: 0.0,
      parameterDrift: 0.0,
      volatilityRegime: 'NORMAL',
      marketRegime: 'RANGING',
      tradingAllowed: true,
      regimeConfidence: 1.0,
    };
  }

  public updateMetrics(newMetrics: Partial<RiskMetrics>): void {
    this.metrics = { ...this.metrics, ...newMetrics };
    const decision = this.evaluateRisk();
    this.decisions.push(decision);
    
    if (this.decisions.length > 1000) {
      this.decisions.shift();
    }

    this.emit('risk_decision', decision);

    if (decision.action === 'STOP' || decision.action === 'PAUSE') {
      this.emit('critical_alert', decision);
    }
  }

  private evaluateRisk(): RiskDecision {
    const reasons: string[] = [];
    let leverageMultiplier = 1.0;
    let positionSizeMultiplier = 1.0;
    let action: RiskDecision['action'] = 'NORMAL';

    // 0. Regime Filter Check
    if (!this.metrics.tradingAllowed) {
      reasons.push(`Critical: Market regime is TRENDING (Hurst: ${this.metrics.hurstExponent?.toFixed(3)}, ADX: ${this.metrics.adx?.toFixed(1)})`);
      reasons.push(`Mean Reversion strategy is not suitable for trending markets`);
      leverageMultiplier = 0.0;
      positionSizeMultiplier = 0.0;
      action = 'STOP';
      
      return {
        timestamp: Date.now(),
        leverageMultiplier,
        positionSizeMultiplier,
        action,
        reasons,
        metrics: { ...this.metrics },
      };
    }

    // Volatile regime reduction
    if (this.metrics.marketRegime === 'VOLATILE' && this.metrics.regimeConfidence < 0.6) {
      reasons.push(`Warning: Uncertain market regime (confidence: ${(this.metrics.regimeConfidence * 100).toFixed(0)}%)`);
      positionSizeMultiplier *= 0.5;
      action = 'REDUCE_SIZE';
    }

    if (this.metrics.rollingSharpe < this.thresholds.sharpePoor) {
      reasons.push(`Critical: Rolling Sharpe ${this.metrics.rollingSharpe.toFixed(2)} < ${this.thresholds.sharpePoor}`);
      leverageMultiplier *= 0.25;
      positionSizeMultiplier *= 0.5;
      action = 'REDUCE_LEVERAGE';
    } else if (this.metrics.rollingSharpe < this.thresholds.sharpeGood) {
      reasons.push(`Warning: Rolling Sharpe ${this.metrics.rollingSharpe.toFixed(2)} < ${this.thresholds.sharpeGood}`);
      leverageMultiplier *= 0.5;
      positionSizeMultiplier *= 0.75;
      action = 'REDUCE_LEVERAGE';
    }

    if (this.metrics.rollingWinRate < this.thresholds.winRatePoor) {
      reasons.push(`Critical: Win Rate ${(this.metrics.rollingWinRate * 100).toFixed(1)}% < ${(this.thresholds.winRatePoor * 100).toFixed(0)}%`);
      positionSizeMultiplier *= 0.5;
      if (action === 'NORMAL') action = 'REDUCE_SIZE';
    }

    if (this.metrics.drawdownVelocity > this.thresholds.maxDrawdownVelocity) {
      reasons.push(`Critical: Drawdown Velocity ${(this.metrics.drawdownVelocity * 100).toFixed(2)}%/day > ${(this.thresholds.maxDrawdownVelocity * 100).toFixed(0)}%/day`);
      leverageMultiplier *= 0.25;
      positionSizeMultiplier *= 0.25;
      action = 'PAUSE';
    }

    if (this.metrics.parameterDrift > this.thresholds.maxParameterDrift) {
      reasons.push(`Critical: Parameter Drift ${(this.metrics.parameterDrift * 100).toFixed(1)}% > ${(this.thresholds.maxParameterDrift * 100).toFixed(0)}%`);
      leverageMultiplier *= 0.0;
      positionSizeMultiplier *= 0.0;
      action = 'STOP';
    }

    leverageMultiplier = Math.max(0.0, Math.min(1.0, leverageMultiplier));
    positionSizeMultiplier = Math.max(0.0, Math.min(1.0, positionSizeMultiplier));

    if (leverageMultiplier === 1.0 && positionSizeMultiplier === 1.0) {
      action = 'NORMAL';
    }

    return {
      timestamp: Date.now(),
      leverageMultiplier,
      positionSizeMultiplier,
      action,
      reasons,
      metrics: { ...this.metrics },
    };
  }

  public getCurrentMultipliers(): { leverage: number; positionSize: number } {
    const lastDecision = this.decisions[this.decisions.length - 1];
    return lastDecision ? { leverage: lastDecision.leverageMultiplier, positionSize: lastDecision.positionSizeMultiplier } : { leverage: 1, positionSize: 1 };
  }

  public getLastDecision(): RiskDecision | null {
    return this.decisions[this.decisions.length - 1] || null;
  }

  public getDecisionHistory(limit: number = 100): RiskDecision[] {
    return this.decisions.slice(-limit);
  }

  public calculateParameterDrift(): number {
    let totalDrift = 0;
    let paramCount = 0;
    for (const key in this.wfoParameters) {
      if (this.currentParameters[key] !== undefined) {
        const wfoValue = this.wfoParameters[key];
        const currentValue = this.currentParameters[key];
        const drift = Math.abs(currentValue - wfoValue) / Math.max(0.0001, Math.abs(wfoValue));
        totalDrift += drift;
        paramCount++;
      }
    }
    return paramCount > 0 ? totalDrift / paramCount : 0;
  }
}
