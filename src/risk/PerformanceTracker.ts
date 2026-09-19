/**
 * PerformanceTracker.ts
 * يتتبع الأرباح والخسائر المحققة الفعلية ومنحنى رأس المال لحساب مقاييس المخاطر الحية:
 * - Sharpe Ratio الفعلي (سنوي بجذر 365 * 24)
 * - نسبة الفوز الحقيقية Rolling Win Rate
 * - التراجع الحالي Current Drawdown
 * - سرعة التراجع Drawdown Velocity
 */

export class PerformanceTracker {
  private trades: { ts: number; pnl: number }[] = [];
  private equityCurve: { ts: number; equity: number }[] = [];

  constructor(initialEquity: number = 10000) {
    this.recordEquity(initialEquity);
  }

  public recordFill(pnl: number): void {
    if (!isNaN(pnl) && isFinite(pnl)) {
      this.trades.push({ ts: Date.now(), pnl });
      // الاحتفاظ بآخر 1000 صفقة فقط لتفادي تضخم الذاكرة
      if (this.trades.length > 1000) {
        this.trades.shift();
      }
    }
  }

  public recordEquity(equity: number): void {
    if (!isNaN(equity) && isFinite(equity) && equity > 0) {
      this.equityCurve.push({ ts: Date.now(), equity });
      // الاحتفاظ بآخر 2000 نقطة لمنحنى رأس المال
      if (this.equityCurve.length > 2000) {
        this.equityCurve.shift();
      }
    }
  }

  public rollingSharpe(window = 100): number {
    const periodTrades = this.trades.slice(-window);
    if (periodTrades.length < 5) return 1.0;

    const returns = periodTrades.map(t => t.pnl);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const sd = Math.sqrt(variance);

    if (sd <= 0) return mean > 0 ? 3.0 : 0;
    // التحويل إلى مقياس سنوي
    const annualFactor = Math.sqrt(365 * 24);
    const sharpe = (mean / sd) * annualFactor;
    return Math.max(-3, Math.min(5, Number(sharpe.toFixed(2))));
  }

  public rollingWinRate(window = 50): number {
    const recent = this.trades.slice(-window);
    if (recent.length === 0) return 0.5;
    const winning = recent.filter(t => t.pnl > 0).length;
    return Number((winning / recent.length).toFixed(3));
  }

  public currentDrawdown(): number {
    if (this.equityCurve.length < 2) return 0;
    let peak = -Infinity;
    let maxDd = 0;

    for (const pt of this.equityCurve) {
      if (pt.equity > peak) {
        peak = pt.equity;
      }
      if (peak > 0) {
        const dd = (peak - pt.equity) / peak;
        if (dd > maxDd) maxDd = dd;
      }
    }

    const currentEquity = this.equityCurve[this.equityCurve.length - 1].equity;
    const currentDd = peak > 0 ? Math.max(0, (peak - currentEquity) / peak) : 0;
    return Number(currentDd.toFixed(4));
  }

  public drawdownVelocity(): number {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const pts = this.equityCurve.filter(e => e.ts >= dayAgo);
    if (pts.length < 2) return 0;
    const start = pts[0].equity;
    const end = pts[pts.length - 1].equity;
    if (start <= 0) return 0;
    const vel = Math.max(0, (start - end) / start);
    return Number(vel.toFixed(4));
  }

  public getStats() {
    return {
      totalTradesRecorded: this.trades.length,
      winRate: this.rollingWinRate(),
      sharpeRatio: this.rollingSharpe(),
      currentDrawdown: this.currentDrawdown(),
      drawdownVelocity: this.drawdownVelocity(),
      totalRealizedPnl: this.trades.reduce((acc, t) => acc + t.pnl, 0),
    };
  }
}
