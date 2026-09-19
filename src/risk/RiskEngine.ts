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
    this.limits = { ...DEFAULT_RISK_LIMITS, ...limits };
  }

  public getLimits(): RiskLimits {
    return this.limits;
  }

  public updateLimits(newLimits: Partial<RiskLimits>) {
    this.limits = { ...this.limits, ...newLimits };
  }

  public setDailyStartEquity(equity: number) {
    if (equity <= 0) return;
    this.dailyStartEquity = equity;
    if (equity > this.peakEquity) this.peakEquity = equity;
  }

  public recordReturn(ret: number) {
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

    // 1. Current Drawdown Calculation (only if we have a valid peak)
    const currentDrawdownPct = this.peakEquity > 0 && totalEquity > 0 
        ? ((this.peakEquity - totalEquity) / this.peakEquity) * 100 
        : 0;

    // 2. Daily Loss Calculation
    const dailyLossPct = this.dailyStartEquity > 0 && totalEquity > 0
        ? Math.max(0, ((this.dailyStartEquity - totalEquity) / this.dailyStartEquity) * 100) 
        : 0;

    // 3. Current Portfolio Leverage
    const totalExposure = positions.reduce((acc, p) => acc + Math.abs(p.size * p.currentPrice), 0);
    const currentLeverage = totalEquity > 0 ? totalExposure / totalEquity : 0;

    // 4. Value at Risk (VaR) & CVaR
    const { var95, var99, cvar95 } = this.calculateVaR(this.returnsHistory, totalEquity);

    // 5. Sharpe & Sortino ratios from return series
    const { sharpe, sortino } = this.calculateRatios(this.returnsHistory);

    const metrics: RiskMetrics = {
      currentDrawdownPct: Number(currentDrawdownPct.toFixed(2)),
      dailyLossPct: Number(dailyLossPct.toFixed(2)),
      var95: Number(var95.toFixed(2)),
      var99: Number(var99.toFixed(2)),
      cvar95: Number(cvar95.toFixed(2)),
      portfolioBeta: 1.05,
      currentLeverage: Number(currentLeverage.toFixed(2)),
      sharpeRatio: Number(sharpe.toFixed(2)),
      sortinoRatio: Number(sortino.toFixed(2)),
      killSwitchLevel: currentKillSwitchLevel,
      killSwitchActive: currentKillSwitchLevel !== 'NORMAL',
    };

    // Check violations
    let violation = false;
    let violationReason = '';
    let recommendedKillLevel: KillSwitchLevel = 'NORMAL';

    if (currentDrawdownPct >= this.limits.maxDrawdownPct) {
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
    spreadPct: number = 0.05
  ): { allowed: boolean; reason?: string } {
    const orderCost = (order.quantity || 0) * (order.price || 0);
    const maxPos = this.limits.maxPositionSizeUsd ?? 50000;
    const maxSpread = this.limits.maxSpreadThresholdPct ?? 0.5;

    // 1. Position size limit
    if (orderCost > maxPos) {
      return { allowed: false, reason: `Order value $${orderCost.toFixed(0)} exceeds max position limit $${maxPos}` };
    }

    // 2. Margin availability check
    if (orderCost > balance.freeMargin * this.limits.maxPortfolioLeverage) {
      return { allowed: false, reason: `Insufficient margin. Required: $${orderCost.toFixed(0)}, Free Margin: $${balance.freeMargin.toFixed(0)}` };
    }

    // 3. Spread explosion check
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

  private calculateRatios(returns: number[]): { sharpe: number; sortino: number } {
    if (returns.length < 5) return { sharpe: 1.85, sortino: 2.45 };

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance);

    const downReturns = returns.filter((r) => r < 0);
    const downVariance = downReturns.length > 0 ? downReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downReturns.length : 0.0001;
    const downStd = Math.sqrt(downVariance);

    const rf = 0.0001;
    const sharpe = std > 0 ? ((mean - rf) / std) * Math.sqrt(365 * 24) : 0;
    const sortino = downStd > 0 ? ((mean - rf) / downStd) * Math.sqrt(365 * 24) : 0;

    return {
      sharpe: Math.max(-5, Math.min(10, sharpe)),
      sortino: Math.max(-5, Math.min(15, sortino)),
    };
  }
}
