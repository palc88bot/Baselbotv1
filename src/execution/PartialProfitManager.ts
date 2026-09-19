/**
 * Basel Quantum Algorithmic Trading System
 * Partial Profit Taking, Break-Even Protection & Trailing Stop Manager
 */

import { OrderGateway } from './OrderGateway';
import { AssetSymbol } from '../domain/types';

export interface PartialProfitConfig {
  enabled: boolean;
  firstTargetPercent: number;      // الهدف الأول (مثلاً 0.05 = 5%)
  firstClosePercent: number;       // نسبة الإغلاق الأول (مثلاً 0.50 = 50%)
  trailingStopPercent: number;     // نسبة Trailing Stop (مثلاً 0.03 = 3%)
  moveStopToBreakEven: boolean;    // نقل الوقف لنقطة الدخول
}

export interface PositionState {
  orderId: string;
  symbol: AssetSymbol;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  originalQuantity: number;
  remainingQuantity: number;
  partialProfitTaken: boolean;
  breakEvenActivated: boolean;
  highestPrice: number;            // أعلى سعر وصلته (للـ BUY)
  lowestPrice: number;             // أدنى سعر وصلته (للـ SELL)
  trailingStopPrice: number;
}

export class PartialProfitManager {
  private orderGateway: OrderGateway;
  private config: PartialProfitConfig;
  private activePositions: Map<string, PositionState> = new Map();

  constructor(orderGateway: OrderGateway, config: Partial<PartialProfitConfig> = {}) {
    this.orderGateway = orderGateway;
    this.config = {
      enabled: true,
      firstTargetPercent: 0.05,      // 5% ربح
      firstClosePercent: 0.50,       // إغلاق 50%
      trailingStopPercent: 0.03,     // Trailing 3%
      moveStopToBreakEven: true,
      ...config,
    };
  }

  public registerPosition(
    orderId: string,
    symbol: AssetSymbol,
    side: 'BUY' | 'SELL',
    entryPrice: number,
    quantity: number
  ): void {
    if (!this.config.enabled) return;

    this.activePositions.set(orderId, {
      orderId,
      symbol,
      side,
      entryPrice,
      originalQuantity: quantity,
      remainingQuantity: quantity,
      partialProfitTaken: false,
      breakEvenActivated: false,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      trailingStopPrice: 0,
    });

    console.log(`📝 PartialProfitManager: Position registered [${orderId}] | ${symbol} ${side} @ $${entryPrice} | Qty: ${quantity}`);
  }

  public async updatePosition(orderIdOrSymbol: string, currentPrice: number): Promise<void> {
    const matchingPositions: PositionState[] = [];

    if (this.activePositions.has(orderIdOrSymbol)) {
      matchingPositions.push(this.activePositions.get(orderIdOrSymbol)!);
    } else {
      for (const pos of this.activePositions.values()) {
        if (pos.symbol === orderIdOrSymbol) {
          matchingPositions.push(pos);
        }
      }
    }

    for (const position of matchingPositions) {
      if (position.side === 'BUY') {
        position.highestPrice = Math.max(position.highestPrice, currentPrice);
      } else {
        position.lowestPrice = Math.min(position.lowestPrice, currentPrice);
      }

      // 1. Check Partial Profit Target (e.g. +5%)
      if (!position.partialProfitTaken) {
        const profitPercent = position.side === 'BUY'
          ? (currentPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - currentPrice) / position.entryPrice;

        if (profitPercent >= this.config.firstTargetPercent) {
          await this.executePartialProfit(position, currentPrice);
        }
      }

      // 2. Trailing Stop Management (after partial profit)
      if (position.partialProfitTaken) {
        await this.updateTrailingStop(position, currentPrice);
      }
    }
  }

  private async executePartialProfit(position: PositionState, currentPrice: number): Promise<void> {
    const closeQuantity = Number((position.originalQuantity * this.config.firstClosePercent).toFixed(4));
    if (closeQuantity <= 0) return;

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

    console.log(`💰 Partial Profit Triggered: Closing ${closeQuantity} ${position.symbol} @ $${currentPrice}`);

    try {
      this.orderGateway.submitOrder({
        symbol: position.symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: closeQuantity,
        price: currentPrice,
        strategyId: 'PARTIAL_PROFIT',
      });

      position.remainingQuantity = Number((position.remainingQuantity - closeQuantity).toFixed(4));
      position.partialProfitTaken = true;

      if (this.config.moveStopToBreakEven) {
        await this.moveToBreakEven(position);
      }

      const profit = position.side === 'BUY'
        ? (currentPrice - position.entryPrice) * closeQuantity
        : (position.entryPrice - currentPrice) * closeQuantity;

      console.log(`✅ Partial profit taken: +$${profit.toFixed(2)} | Remaining qty: ${position.remainingQuantity}`);
    } catch (err) {
      console.error('❌ Failed to execute partial profit order:', err);
    }
  }

  private async moveToBreakEven(position: PositionState): Promise<void> {
    console.log(`🛡️ Moving Stop Loss to Break-Even for ${position.symbol} @ $${position.entryPrice}`);

    await this.orderGateway.cancelProtectiveOrders(position.orderId);

    const stopPrice = position.entryPrice;
    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';

    await this.orderGateway.sendStopLoss(
      position.symbol,
      closeSide,
      position.remainingQuantity,
      stopPrice
    );

    position.breakEvenActivated = true;
  }

  private async updateTrailingStop(position: PositionState, currentPrice: number): Promise<void> {
    let newStopPrice: number;

    if (position.side === 'BUY') {
      newStopPrice = Number((position.highestPrice * (1 - this.config.trailingStopPercent)).toFixed(2));
      
      if (newStopPrice > position.trailingStopPrice && newStopPrice > position.entryPrice) {
        position.trailingStopPrice = newStopPrice;
        await this.updateStopLossOrder(position, newStopPrice);
        console.log(`📈 Trailing Stop updated for ${position.symbol}: $${newStopPrice.toFixed(2)} (High: $${position.highestPrice.toFixed(2)})`);
      }
    } else {
      newStopPrice = Number((position.lowestPrice * (1 + this.config.trailingStopPercent)).toFixed(2));
      
      if ((newStopPrice < position.trailingStopPrice || position.trailingStopPrice === 0) && newStopPrice < position.entryPrice) {
        position.trailingStopPrice = newStopPrice;
        await this.updateStopLossOrder(position, newStopPrice);
        console.log(`📉 Trailing Stop updated for ${position.symbol}: $${newStopPrice.toFixed(2)} (Low: $${position.lowestPrice.toFixed(2)})`);
      }
    }
  }

  private async updateStopLossOrder(position: PositionState, stopPrice: number): Promise<void> {
    await this.orderGateway.cancelProtectiveOrders(position.orderId);

    const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY';
    await this.orderGateway.sendStopLoss(
      position.symbol,
      closeSide,
      position.remainingQuantity,
      stopPrice
    );
  }

  public removePosition(orderId: string): void {
    this.activePositions.delete(orderId);
    console.log(`🗑️ Position removed from PartialProfitManager: ${orderId}`);
  }

  public getPositionState(orderId: string): PositionState | undefined {
    return this.activePositions.get(orderId);
  }

  public getReport(): any {
    const positions = Array.from(this.activePositions.values());
    return {
      enabled: this.config.enabled,
      config: this.config,
      totalPositions: positions.length,
      partialProfitTakenCount: positions.filter(p => p.partialProfitTaken).length,
      breakEvenActivatedCount: positions.filter(p => p.breakEvenActivated).length,
      positions: positions.map(p => ({
        orderId: p.orderId,
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice,
        remainingQuantity: p.remainingQuantity,
        partialProfitTaken: p.partialProfitTaken,
        breakEvenActivated: p.breakEvenActivated,
        trailingStopPrice: p.trailingStopPrice,
        unrealizedPnl: p.side === 'BUY'
          ? (p.highestPrice - p.entryPrice) * p.remainingQuantity
          : (p.entryPrice - p.lowestPrice) * p.remainingQuantity,
      })),
    };
  }
}
