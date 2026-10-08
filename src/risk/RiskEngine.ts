/**
 * Basel Quantum Algorithmic Trading System
 * Continuous Real-Time Risk Engine & Quantitative Limit Validation
 */

import { AccountBalance, AssetSymbol, KillSwitchLevel, Order, Position, RiskLimits, RiskMetrics } from '../domain/types';

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxDrawdownPct: 6.0, // 6% max drawdown
  maxDailyLossPct: 3.5, // 3.5% daily loss limit
  maxPositionSizeUsd: 50000,
  maxPortfolioLeverage: 3.0,
  maxVaR95Pct: 4.0, // 4% 1-day 95% VaR cap
  maxSlippageBps: 25,
  maxSpreadThresholdPct: 0.5,
  cooldownPeriodMs: 60000,
};

export class RiskEngine {
  private limits: RiskLimits;
  private peakEquity: number = 0;
  private dailyStartEquity: number = 0;
  private returnsHistory: number[] = [];

  constructor(limits: Partial<RiskLimits> = {}) {
    this.limits = { ...DEFAULT_RISK_LIMITS };
    this.updateLimits(limits);
  }

  public getLimits(): RiskLimits {
    return this.limits;
  }

  public updateLimits(newLimits: Partial<RiskLimits>) {
    const candidate = { ...this.limits, ...newLimits };
    const boundedPercentages: Array<keyof RiskLimits> = ['maxDrawdownPct', 'maxDailyLossPct', 'maxVaR95Pct', 'maxSpreadThresholdPct'];
    for (const key of boundedPercentages) {
      const value = candidate[key];
      if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 100)) {
        throw new Error(`${key} must be a finite value between 0 and 100`);
      }
    }
    for (const key of ['maxPositionSizeUsd', 'maxPortfolioLeverage', 'maxSlippageBps'] as const) {
      const value = candidate[key];
      if (value === undefined || !Number.isFinite(value) || value <= 0 || (key === 'maxPortfolioLeverage' && value > 125)) {
        throw new Error(`${key} must be a finite positive value${key === 'maxPortfolioLeverage' ? ' no greater than 125' : ''}`);
      }
    }
    if (candidate.cooldownPeriodMs === undefined || !Number.isFinite(candidate.cooldownPeriodMs) || candidate.cooldownPeriodMs < 0) {
      throw new Error('cooldownPeriodMs must be a finite non-negative value');
    }
    this.limits = { ...this.limits, ...newLimits };
  }

  public setDailyStartEquity(equity: number) {
    if (equity <= 0) return;
    this.dailyStartEquity = equity;
    if (equity > this.peakEquity) this.peakEquity = equity;
  }

  /** Manual KillSwitch reset: restart the high-water mark, otherwise the old peak re-triggers HARD_HALT immediately. */
  public resetPeakEquity(equity: number) {
    if (equity <= 0) return;
    this.peakEquity = equity;
    this.dailyStartEquity = equity;
  }

  public recordReturn(ret: number) {
    if (!Number.isFinite(ret)) return;
    this.returnsHistory.push(ret);
    if (this.returnsHistory.length > 500) this.returnsHistory.shift();
  }

  public evaluateRisk(
    balance: AccountBalance,
    positions: Position[],
    currentKillSwitchLevel: KillSwitchLevel = 'NORMAL'
  ): { metrics: RiskMetrics; violation: boolean; violationReason?: string; recommendedKillLevel?: KillSwitchLevel } {
    const totalEquity = balance.totalEquity;
    
    // Initialize peak/daily start on first positive equity
    if (totalEquity > 0) {
        if (this.peakEquity === 0) this.peakEquity = totalEquity;
        if (this.dailyStartEquity === 0) this.dailyStartEquity = totalEquity;
        if (totalEquity > this.peakEquity) this.peakEquity = totalEquity;
    }

    const invalidEquity = !Number.isFinite(totalEquity) || totalEquity <= 0;

    // Invalid or depleted equity is a hard risk breach, never a zero drawdown.
    const currentDrawdownPct = invalidEquity ? 100 : this.peakEquity > 0
        ? ((this.peakEquity - totalEquity) / this.peakEquity) * 100 
        : 0;

    // 2. Daily Loss Calculation
    const dailyLossPct = invalidEquity ? 100 : this.dailyStartEquity > 0
        ? Math.max(0, ((this.dailyStartEquity - totalEquity) / this.dailyStartEquity) * 100) 
        : 0;

    // 3. Current Portfolio Leverage
    const totalExposure = positions.reduce((acc, p) => acc + Math.abs(p.size * p.currentPrice), 0);
    const currentLeverage = totalEquity > 0 ? totalExposure / totalEquity : 0;

    // 4. Value at Risk (VaR) & CVaR
    const safeEquity = Number.isFinite(totalEquity) && totalEquity > 0 ? totalEquity : 0;
    const { var95, var99, cvar95 } = this.calculateVaR(this.returnsHistory, safeEquity);

    // 5. Sharpe & Sortino ratios from return series
    const { sharpe, sortino } = this.calculateRatios(this.returnsHistory);

    const metrics: RiskMetrics = {
      currentDrawdownPct: Number(currentDrawdownPct.toFixed(2)),
      dailyLossPct: Number(dailyLossPct.toFixed(2)),
      var95: Number(var95.toFixed(2)),
      var99: Number(var99.toFixed(2)),
      cvar95: Number(cvar95.toFixed(2)),
      // portfolioBeta intentionally omitted: it was a hard-coded 1.05 and no beta is computed anywhere.
      currentLeverage: Number(currentLeverage.toFixed(2)),
      sharpeRatio: sharpe === null ? null : Number(sharpe.toFixed(2)),
      sortinoRatio: sortino === null ? null : Number(sortino.toFixed(2)),
      varSource: this.returnsHistory.length >= 10 ? 'HISTORICAL' : 'ASSUMED',
      returnsSampleSize: this.returnsHistory.length,
      killSwitchLevel: currentKillSwitchLevel,
      killSwitchActive: currentKillSwitchLevel !== 'NORMAL',
    };

    // Check violations
    let violation = false;
    let violationReason = '';
    let recommendedKillLevel: KillSwitchLevel = 'NORMAL';

    if (invalidEquity) {
      violation = true;
      violationReason = 'Account equity is invalid or non-positive; trading must halt';
      recommendedKillLevel = 'HARD_HALT';
    } else if (currentDrawdownPct >= this.limits.maxDrawdownPct) {
      violation = true;
      violationReason = `Max Drawdown breached: ${currentDrawdownPct.toFixed(2)}% >= ${this.limits.maxDrawdownPct}%`;
      recommendedKillLevel = 'HARD_HALT';
    } else if (dailyLossPct >= this.limits.maxDailyLossPct) {
      violation = true;
      violationReason = `Daily Loss Limit breached: ${dailyLossPct.toFixed(2)}% >= ${this.limits.maxDailyLossPct}%`;
      recommendedKillLevel = 'SOFT_HALT';
    } else if (currentLeverage > this.limits.maxPortfolioLeverage) {
      violation = true;
      violationReason = `Leverage Limit exceeded: ${currentLeverage.toFixed(2)}x > ${this.limits.maxPortfolioLeverage}x`;
      recommendedKillLevel = 'SOFT_HALT';
    } else if ((var95 / totalEquity) * 100 > (this.limits.maxVaR95Pct ?? 5.0)) {
      violation = true;
      violationReason = `VaR 95% Risk threshold exceeded: ${((var95 / totalEquity) * 100).toFixed(2)}%`;
      recommendedKillLevel = 'SOFT_HALT';
    }

    if (violation) {
      metrics.killSwitchReason = violationReason;
      metrics.lastBreachTimestamp = Date.now();
    }

    return { metrics, violation, violationReason, recommendedKillLevel };
  }

  /**
   * Pre-trade risk validation for order creation
   */
  public validateOrder(
    order: Partial<Order>,
    balance: AccountBalance,
    positions: Position[],
    spreadPct: number = 0.05,
    pendingExposureUsd: number = 0,
  ): { allowed: boolean; reason?: string } {
    const quantity = order.quantity;
    const price = order.price;
    if (!Number.isFinite(quantity) || (quantity as number) <= 0 || !Number.isFinite(price) || (price as number) <= 0) {
      return { allowed: false, reason: 'Order quantity and price must be finite positive numbers' };
    }
    if (!Number.isFinite(balance.totalEquity) || balance.totalEquity <= 0) {
      return { allowed: false, reason: 'Account equity is invalid or non-positive' };
    }
    if (!Number.isFinite(balance.freeMargin) || balance.freeMargin <= 0) {
      return { allowed: false, reason: 'Free margin is invalid or insufficient' };
    }
    if (!Number.isFinite(spreadPct) || spreadPct < 0) {
      return { allowed: false, reason: 'Spread data is invalid' };
    }
    if (!Number.isFinite(pendingExposureUsd) || pendingExposureUsd < 0) {
      return { allowed: false, reason: 'Pending-order exposure is invalid' };
    }

    const orderCost = (quantity as number) * (price as number);
    if (!Number.isFinite(orderCost) || orderCost <= 0) {
      return { allowed: false, reason: 'Order notional is invalid' };
    }
    const maxPos = this.limits.maxPositionSizeUsd ?? 50000;
    const maxSpread = this.limits.maxSpreadThresholdPct ?? 0.5;

    // 1. Position size limit
    if (orderCost > maxPos) {
      return { allowed: false, reason: `Order value $${orderCost.toFixed(0)} exceeds max position limit $${maxPos}` };
    }

    // 2. Margin availability check
    const pendingMargin = pendingExposureUsd / this.limits.maxPortfolioLeverage;
    const usableFreeMargin = Math.max(0, balance.freeMargin - pendingMargin);
    if (orderCost / this.limits.maxPortfolioLeverage > usableFreeMargin) {
      return { allowed: false, reason: `Insufficient margin. Required: $${orderCost.toFixed(0)}, Free Margin after pending orders: $${usableFreeMargin.toFixed(0)}` };
    }

    // 3. Aggregate existing exposure with this new entry before allowing it.
    const currentExposure = positions.reduce((total, position) => {
      const exposure = Math.abs(position.size * position.currentPrice);
      return total + (Number.isFinite(exposure) ? exposure : Number.POSITIVE_INFINITY);
    }, 0);
    if (!Number.isFinite(currentExposure)) {
      return { allowed: false, reason: 'Existing position exposure is invalid' };
    }
    const projectedLeverage = (currentExposure + pendingExposureUsd + orderCost) / balance.totalEquity;
    if (projectedLeverage > this.limits.maxPortfolioLeverage) {
      return { allowed: false, reason: `Projected portfolio leverage ${projectedLeverage.toFixed(2)}x exceeds ${this.limits.maxPortfolioLeverage}x` };
    }

    // 4. Spread explosion check
    if (spreadPct > maxSpread) {
      return { allowed: false, reason: `Spread too wide: ${spreadPct.toFixed(3)}% > ${maxSpread}% limit` };
    }

    return { allowed: true };
  }

  private calculateVaR(returns: number[], equity: number): { var95: number; var99: number; cvar95: number } {
    if (returns.length < 10) {
      // Default parametric approximations
      const std = equity * 0.02;
      return {
        var95: Number((1.645 * std).toFixed(2)),
        var99: Number((2.326 * std).toFixed(2)),
        cvar95: Number((2.06 * std).toFixed(2)),
      };
    }

    const sorted = [...returns].sort((a, b) => a - b);
    const idx95 = Math.floor(sorted.length * 0.05);
    const idx99 = Math.floor(sorted.length * 0.01);

    const ret95 = Math.abs(Math.min(0, sorted[idx95]));
    const ret99 = Math.abs(Math.min(0, sorted[idx99]));

    // CVaR is mean of losses beyond 95th percentile
    const tailLosses = sorted.slice(0, Math.max(1, idx95));
    const meanTailLoss = Math.abs(tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length);

    return {
      var95: Number((ret95 * equity).toFixed(2)),
      var99: Number((ret99 * equity).toFixed(2)),
      cvar95: Number((meanTailLoss * equity).toFixed(2)),
    };
  }

  /**
   * Per-trade (non-annualised) Sharpe/Sortino from recorded closed-trade returns.
   * Returns null while there are fewer than 10 real observations instead of inventing numbers
   * (the old code returned fixed 1.85 / 2.45 and annualised per-trade data with an hourly factor).
   */
  private calculateRatios(returns: number[]): { sharpe: number | null; sortino: number | null } {
    if (returns.length < 10) return { sharpe: null, sortino: null };

    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const std = Math.sqrt(variance);

    // Downside deviation over ALL observations (target 0): sqrt(mean(min(0, r)^2))
    const downVar = returns.reduce((a, b) => a + Math.pow(Math.min(0, b), 2), 0) / n;
    const downStd = Math.sqrt(downVar);

    const sharpe = std > 0 ? mean / std : 0;
    const sortino = downStd > 0 ? mean / downStd : (mean > 0 ? 10 : 0);

    return {
      sharpe: Math.max(-10, Math.min(10, sharpe)),
      sortino: Math.max(-10, Math.min(15, sortino)),
    };
  }
}
