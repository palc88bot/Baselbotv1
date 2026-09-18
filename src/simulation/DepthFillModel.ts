/**
 * Basel Quantum Algorithmic Trading System
 * High-Precision L2/L3 Depth Fill & Slippage Simulation Model
 */

import { OrderBook, OrderSide } from '../domain/types';

export class DepthFillModel {
  /**
   * Simulates market impact and depth consumption:
   * Slippage \Delta P = \gamma \cdot \sigma \cdot \sqrt{Q / V}
   */
  public static simulateExecution(
    book: OrderBook,
    side: OrderSide,
    quantity: number,
    slippageModel: 'ZERO' | 'LINEAR_DEPTH' | 'SQUARE_ROOT_IMPACT' = 'SQUARE_ROOT_IMPACT'
  ): { executedPrice: number; slippageBps: number; marketImpact: number } {
    const bestPrice = side === 'BUY' ? book.asks[0]?.price || book.midPrice : book.bids[0]?.price || book.midPrice;
    
    if (slippageModel === 'ZERO') {
      return { executedPrice: bestPrice, slippageBps: 0, marketImpact: 0 };
    }

    const levels = side === 'BUY' ? book.asks : book.bids;
    let totalDepth = levels.reduce((acc, lvl) => acc + lvl.size, 0);
    totalDepth = Math.max(0.1, totalDepth);

    const participationRate = Math.min(1.0, quantity / totalDepth);

    let slippageBps = 0;
    if (slippageModel === 'LINEAR_DEPTH') {
      slippageBps = participationRate * 15; // 15 bps max linear
    } else {
      // Square-root Kyle's lambda impact
      slippageBps = Math.sqrt(participationRate) * 12;
    }

    const multiplier = side === 'BUY' ? 1 + slippageBps / 10000 : 1 - slippageBps / 10000;
    const executedPrice = Number((bestPrice * multiplier).toFixed(4));
    const marketImpact = Number((Math.abs(executedPrice - bestPrice)).toFixed(4));

    return {
      executedPrice,
      slippageBps: Number(slippageBps.toFixed(2)),
      marketImpact,
    };
  }
}
