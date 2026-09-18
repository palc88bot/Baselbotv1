/**
 * Basel Quantum Algorithmic Trading System
 * User Data Stream & Real-Time Account Portfolio State
 */

import { AccountBalance, AssetSymbol, Fill, Position } from '../domain/types';

export class UserDataStream {
  private balance: AccountBalance;
  private positions: Map<AssetSymbol, Position> = new Map();
  private fillsHistory: Fill[] = [];
  private balanceListeners: Set<(b: AccountBalance) => void> = new Set();
  private fillListeners: Set<(f: Fill) => void> = new Set();

  constructor(initialCapital: number = 100000) {
    this.balance = {
      totalEquity: initialCapital,
      availableCash: initialCapital,
      usedMargin: 0,
      marginLevel: 999.0,
      freeMargin: initialCapital,
      unrealizedPnl: 0,
      realizedPnl: 0,
      dailyPnl: 0,
      dailyPnlPct: 0,
      currency: 'USDT',
    };
  }

  public getBalance(): AccountBalance {
    return { ...this.balance };
  }

  public getPositions(): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.size !== 0);
  }

  public getPosition(symbol: AssetSymbol): Position | undefined {
    return this.positions.get(symbol);
  }

  public getFills(): Fill[] {
    return [...this.fillsHistory];
  }

  public subscribeBalance(listener: (b: AccountBalance) => void): () => void {
    this.balanceListeners.add(listener);
    return () => this.balanceListeners.delete(listener);
  }

  public subscribeFills(listener: (f: Fill) => void): () => void {
    this.fillListeners.add(listener);
    return () => this.fillListeners.delete(listener);
  }

  public processFill(fill: Fill, currentPrice: number) {
    this.fillsHistory.unshift(fill);
    if (this.fillsHistory.length > 500) this.fillsHistory.pop();

    let pos = this.positions.get(fill.symbol);
    if (!pos) {
      pos = {
        symbol: fill.symbol,
        size: 0,
        entryPrice: fill.price,
        currentPrice,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
        marginUsed: 0,
        liquidationPrice: 0,
        leverage: 1.0,
        updatedAt: fill.timestamp,
      };
      this.positions.set(fill.symbol, pos);
    }

    const tradeSize = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    const oldSize = pos.size;
    const newSize = Number((oldSize + tradeSize).toFixed(4));

    // Realized PnL if closing/reducing position
    if ((oldSize > 0 && tradeSize < 0) || (oldSize < 0 && tradeSize > 0)) {
      const closingQty = Math.min(Math.abs(oldSize), Math.abs(tradeSize));
      const pnlPerUnit = oldSize > 0 ? fill.price - pos.entryPrice : pos.entryPrice - fill.price;
      const realized = closingQty * pnlPerUnit - fill.commission;

      pos.realizedPnl += realized;
      this.balance.realizedPnl += realized;
      this.balance.dailyPnl += realized;
      this.balance.availableCash += realized;
    } else if (Math.abs(newSize) > Math.abs(oldSize)) {
      // Increasing position - adjust average entry price
      const totalCost = Math.abs(oldSize) * pos.entryPrice + fill.quantity * fill.price;
      pos.entryPrice = Number((totalCost / Math.abs(newSize)).toFixed(4));
    }

    // Deduct commission
    this.balance.availableCash -= fill.commission;

    pos.size = newSize;
    pos.currentPrice = currentPrice;
    pos.updatedAt = fill.timestamp;

    this.recalculatePortfolio(new Map([[fill.symbol, currentPrice]]));
    this.fillListeners.forEach((fn) => fn(fill));
  }

  public updateMarketPrices(prices: Map<AssetSymbol, number>) {
    this.recalculatePortfolio(prices);
  }

  private recalculatePortfolio(prices: Map<AssetSymbol, number>) {
    let totalUnrealizedPnl = 0;
    let totalMarginUsed = 0;

    for (const [sym, pos] of this.positions.entries()) {
      if (pos.size === 0) continue;
      const price = prices.get(sym) || pos.currentPrice;
      pos.currentPrice = price;

      const pnl = pos.size > 0 ? pos.size * (price - pos.entryPrice) : Math.abs(pos.size) * (pos.entryPrice - price);
      pos.unrealizedPnl = Number(pnl.toFixed(2));
      pos.unrealizedPnlPct = pos.entryPrice > 0 ? Number(((pnl / (Math.abs(pos.size) * pos.entryPrice)) * 100).toFixed(2)) : 0;

      const notional = Math.abs(pos.size * price);
      pos.marginUsed = Number((notional / (pos.leverage || 1.0)).toFixed(2));

      totalUnrealizedPnl += pos.unrealizedPnl;
      totalMarginUsed += pos.marginUsed;
    }

    this.balance.unrealizedPnl = Number(totalUnrealizedPnl.toFixed(2));
    this.balance.usedMargin = Number(totalMarginUsed.toFixed(2));
    this.balance.totalEquity = Number((this.balance.availableCash + totalMarginUsed + totalUnrealizedPnl).toFixed(2));
    this.balance.freeMargin = Math.max(0, this.balance.totalEquity - totalMarginUsed);
    this.balance.marginLevel = totalMarginUsed > 0 ? Number(((this.balance.totalEquity / totalMarginUsed) * 100).toFixed(1)) : 999.0;
    this.balance.dailyPnlPct = this.balance.totalEquity > 0 ? Number(((this.balance.dailyPnl / this.balance.totalEquity) * 100).toFixed(2)) : 0;

    this.balanceListeners.forEach((fn) => fn(this.balance));
  }
}
