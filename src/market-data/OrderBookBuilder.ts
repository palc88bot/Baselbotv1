/**
 * Basel Quantum Algorithmic Trading System
 * High-Frequency OrderBook Reconstruction & Microstructure Analytics
 */

import { AssetSymbol, OrderBook, OrderBookLevel, Tick } from '../domain/types';

export class OrderBookBuilder {
  private books: Map<AssetSymbol, OrderBook> = new Map();
  private depthLevels: number;

  constructor(depthLevels: number = 10) {
    this.depthLevels = depthLevels;
  }

  public initialize(symbol: AssetSymbol, basePrice: number, baseSpreadBps: number = 2): OrderBook {
    const spread = (basePrice * baseSpreadBps) / 10000;
    const bestBid = basePrice - spread / 2;
    const bestAsk = basePrice + spread / 2;

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    let cumBidSize = 0;
    let cumAskSize = 0;

    for (let i = 0; i < this.depthLevels; i++) {
      const bidPrice = Number((bestBid * (1 - i * 0.0004)).toFixed(symbol.includes('USDT') && basePrice > 100 ? 2 : 4));
      const askPrice = Number((bestAsk * (1 + i * 0.0004)).toFixed(symbol.includes('USDT') && basePrice > 100 ? 2 : 4));
      
      const bidSize = Number((Math.random() * 2.5 + 0.5 * (i + 1)).toFixed(3));
      const askSize = Number((Math.random() * 2.5 + 0.5 * (i + 1)).toFixed(3));

      cumBidSize += bidSize;
      cumAskSize += askSize;

      bids.push({ price: bidPrice, size: bidSize, total: Number(cumBidSize.toFixed(3)) });
      asks.push({ price: askPrice, size: askSize, total: Number(cumAskSize.toFixed(3)) });
    }

    const orderBook: OrderBook = {
      symbol,
      timestamp: Date.now(),
      bids,
      asks,
      sequence: 1,
      midPrice: Number(((bestBid + bestAsk) / 2).toFixed(4)),
      spread: Number((bestAsk - bestBid).toFixed(4)),
      microPrice: this.calculateMicroPrice(bids[0], asks[0]),
      orderBookImbalance: this.calculateImbalance(bids, asks),
    };

    this.books.set(symbol, orderBook);
    return orderBook;
  }

  public getBook(symbol: AssetSymbol): OrderBook | undefined {
    return this.books.get(symbol);
  }

  public processTick(tick: Tick): OrderBook {
    let book = this.books.get(tick.symbol);
    if (!book) {
      book = this.initialize(tick.symbol, tick.price);
    }

    // Adjust top of book based on tick price and size
    const drift = (Math.random() - 0.5) * 0.0006 * tick.price;
    const newMid = Math.max(0.01, tick.price + drift);
    const halfSpread = Math.max(newMid * 0.0002, book.spread / 2);

    const bestBid = newMid - halfSpread;
    const bestAsk = newMid + halfSpread;

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    let cumBidSize = 0;
    let cumAskSize = 0;

    for (let i = 0; i < this.depthLevels; i++) {
      const stepPct = (i * 0.00035);
      const bPrice = Number((bestBid * (1 - stepPct)).toFixed(newMid > 100 ? 2 : 4));
      const aPrice = Number((bestAsk * (1 + stepPct)).toFixed(newMid > 100 ? 2 : 4));

      // Fluctuate sizes with liquidity memory
      const prevBSize = book.bids[i]?.size || (Math.random() * 2 + 1);
      const prevASize = book.asks[i]?.size || (Math.random() * 2 + 1);

      const bSize = Number(Math.max(0.1, prevBSize + (Math.random() - 0.48) * 0.8).toFixed(3));
      const aSize = Number(Math.max(0.1, prevASize + (Math.random() - 0.48) * 0.8).toFixed(3));

      cumBidSize += bSize;
      cumAskSize += aSize;

      bids.push({ price: bPrice, size: bSize, total: Number(cumBidSize.toFixed(3)) });
      asks.push({ price: aPrice, size: aSize, total: Number(cumAskSize.toFixed(3)) });
    }

    book.bids = bids;
    book.asks = asks;
    book.timestamp = tick.timestamp;
    book.sequence += 1;
    book.midPrice = Number(((bids[0].price + asks[0].price) / 2).toFixed(4));
    book.spread = Number((asks[0].price - bids[0].price).toFixed(4));
    book.microPrice = this.calculateMicroPrice(bids[0], asks[0]);
    book.orderBookImbalance = this.calculateImbalance(bids, asks);

    this.books.set(tick.symbol, book);
    return book;
  }

  /**
   * Microprice formulation incorporating depth weights:
   * P_micro = (P_ask * V_bid + P_bid * V_ask) / (V_bid + V_ask)
   */
  public calculateMicroPrice(bestBid: OrderBookLevel, bestAsk: OrderBookLevel): number {
    const totalVolume = bestBid.size + bestAsk.size;
    if (totalVolume === 0) return (bestBid.price + bestAsk.price) / 2;
    const micro = (bestAsk.price * bestBid.size + bestBid.price * bestAsk.size) / totalVolume;
    return Number(micro.toFixed(4));
  }

  /**
   * Order Book Imbalance (OBI) across top k levels:
   * OBI = (Sum(V_bid_k) - Sum(V_ask_k)) / (Sum(V_bid_k) + Sum(V_ask_k))
   */
  public calculateImbalance(bids: OrderBookLevel[], asks: OrderBookLevel[], depth: number = 5): number {
    const k = Math.min(depth, bids.length, asks.length);
    let bidVol = 0;
    let askVol = 0;

    for (let i = 0; i < k; i++) {
      // Weight closer levels higher with exponential decay
      const weight = Math.exp(-0.25 * i);
      bidVol += (bids[i]?.size || 0) * weight;
      askVol += (asks[i]?.size || 0) * weight;
    }

    const total = bidVol + askVol;
    if (total === 0) return 0;
    return Number(((bidVol - askVol) / total).toFixed(4));
  }

  /**
   * Volume-Weighted Average Price (VWAP) for an order size execution
   */
  public getVwapExecutionPrice(symbol: AssetSymbol, side: 'BUY' | 'SELL', targetSize: number): { avgPrice: number; slippageBps: number; filledSize: number } {
    const book = this.books.get(symbol);
    if (!book) return { avgPrice: 0, slippageBps: 0, filledSize: 0 };

    const levels = side === 'BUY' ? book.asks : book.bids;
    let remaining = targetSize;
    let cost = 0;
    let filled = 0;

    for (const level of levels) {
      const take = Math.min(remaining, level.size);
      cost += take * level.price;
      filled += take;
      remaining -= take;
      if (remaining <= 0) break;
    }

    if (filled === 0) return { avgPrice: book.midPrice, slippageBps: 0, filledSize: 0 };
    const avgPrice = cost / filled;
    const basePrice = side === 'BUY' ? levels[0].price : levels[0].price;
    const slippageBps = Math.abs((avgPrice - basePrice) / basePrice) * 10000;

    return {
      avgPrice: Number(avgPrice.toFixed(4)),
      slippageBps: Number(slippageBps.toFixed(2)),
      filledSize: Number(filled.toFixed(3)),
    };
  }
}
