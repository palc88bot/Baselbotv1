/**
 * Basel Quantum Algorithmic Trading System
 * Smart Order Router (SOR) & Execution Order Gateway
 */

import { AssetSymbol, Fill, Order, OrderSide, OrderStatus, OrderType, TimeInForce } from '../domain/types';
import { OrderBookBuilder } from '../market-data/OrderBookBuilder';
import { OrderStateMachine } from './OrderStateMachine';
import { UserDataStream } from './UserDataStream';
import { RateLimiter } from '../utils/RateLimiter';
import crypto from 'crypto';

export interface GatewayConfig {
  makerFeeBps: number;
  takerFeeBps: number;
  simulatedLatencyMs: number;
  commissionAsset: string;
  apiKey?: string;
  apiSecret?: string;
  apiBaseUrl?: string;
  executionMode?: 'LIVE' | 'TESTNET' | 'PAPER';
}

export class OrderGateway {
  private orders: Map<string, Order> = new Map();
  private fsm: OrderStateMachine;
  private userDataStream: UserDataStream;
  private orderBookBuilder: OrderBookBuilder;
  private config: GatewayConfig;
  private orderCounter: number = 0;
  private listeners: Set<(order: Order) => void> = new Set();
  private rateLimiter: RateLimiter;

  private apiKey: string = '';
  private apiSecret: string = '';
  private apiBaseUrl: string = 'https://fapi.binance.com';
  private executionMode: 'LIVE' | 'TESTNET' | 'PAPER' = 'PAPER';

  constructor(
    userDataStream: UserDataStream,
    orderBookBuilder: OrderBookBuilder,
    config: Partial<GatewayConfig> = {}
  ) {
    this.userDataStream = userDataStream;
    this.orderBookBuilder = orderBookBuilder;
    this.fsm = new OrderStateMachine();
    this.rateLimiter = new RateLimiter();
    this.config = {
      makerFeeBps: 1.0,
      takerFeeBps: 3.5,
      simulatedLatencyMs: 15,
      commissionAsset: 'USDT',
      executionMode: 'PAPER',
      ...config,
    };

    this.apiKey = this.config.apiKey || process.env.EXCHANGE_API_KEY || '';
    this.apiSecret = this.config.apiSecret || process.env.EXCHANGE_API_SECRET || '';
    this.executionMode = this.config.executionMode || 'PAPER';
    
    if (this.config.apiBaseUrl) {
      this.apiBaseUrl = this.config.apiBaseUrl;
    } else {
      this.apiBaseUrl = this.executionMode === 'TESTNET' 
        ? 'https://testnet.binancefuture.com' 
        : 'https://fapi.binance.com';
    }
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getApiKey(): string { return this.apiKey; }
  public getApiBaseUrl(): string { return this.apiBaseUrl; }

  /**
   * إرسال أوامر الحماية (Stop Loss & Take Profit) فور تنفيذ صفقة
   */
  public async sendProtectiveOrders(symbol: string, side: 'BUY' | 'SELL', quantity: number, entryPrice: number, slPrice: number, tpPrice: number) {
    if (this.executionMode === 'PAPER') return;

    const cleanSymbol = symbol.replace('/', '');
    const endpoint = '/fapi/v1/order';
    const timestamp = Date.now();

    // 1. Stop Loss Order
    const slSide = side === 'BUY' ? 'SELL' : 'BUY';
    const slParams = `symbol=${cleanSymbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${slPrice}&quantity=${quantity}&reduceOnly=true&closePosition=true&timestamp=${timestamp}`;
    const slSig = crypto.createHmac('sha256', this.apiSecret).update(slParams).digest('hex');
    
    // 2. Take Profit Order
    const tpParams = `symbol=${cleanSymbol}&side=${slSide}&type=TAKE_PROFIT_MARKET&stopPrice=${tpPrice}&quantity=${quantity}&reduceOnly=true&closePosition=true&timestamp=${timestamp + 1}`;
    const tpSig = crypto.createHmac('sha256', this.apiSecret).update(tpParams).digest('hex');

    // إرسال الأوامر بالتوازي
    const headers = { 'X-MBX-APIKEY': this.apiKey, 'Content-Type': 'application/json' };
    
    await Promise.all([
        fetch(`${this.apiBaseUrl}${endpoint}?${slParams}&signature=${slSig}`, { method: 'POST', headers }),
        fetch(`${this.apiBaseUrl}${endpoint}?${tpParams}&signature=${tpSig}`, { method: 'POST', headers })
    ]);

    console.log(`🛡️ Protective Orders (SL: ${slPrice}, TP: ${tpPrice}) set for ${cleanSymbol}`);
  }

  public getOrders(): Order[] {
    return Array.from(this.orders.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public getActiveOrders(): Order[] {
    return this.getOrders().filter((o) => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING_NEW');
  }

  public subscribeOrders(listener: (order: Order) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public submitOrder(params: {
    symbol: AssetSymbol;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    timeInForce?: TimeInForce;
    strategyId?: string;
    executionTag?: string;
  }): Order {
    // Check and record rate limit usage asynchronously to prevent blocking execution
    this.rateLimiter.checkRateLimit('/fapi/v1/order').catch(err => console.error("RateLimiter error:", err));

    this.orderCounter += 1;
    const orderId = `ORD-${Date.now().toString(36)}-${this.orderCounter}`;
    const clientOrderId = `C_${orderId}`;

    const book = this.orderBookBuilder.getBook(params.symbol);
    const midPrice = book?.midPrice || 100;
    const limitPrice = params.price || (params.side === 'BUY' ? midPrice * 1.0005 : midPrice * 0.9995);

    const order: Order = {
      id: orderId,
      clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      price: Number(limitPrice.toFixed(4)),
      quantity: params.quantity,
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      avgFillPrice: 0,
      status: 'PENDING_NEW',
      timeInForce: params.timeInForce || 'GTC',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      strategyId: params.strategyId || 'Ornstein-Uhlenbeck-QUBO',
      executionTag: params.executionTag || 'SOR-AUTO',
    };

    this.orders.set(orderId, order);
    this.notifyOrder(order);

    // Simulate async network wire latency and exchange ACK
    setTimeout(() => {
      this.acknowledgeAndExecute(orderId);
    }, this.config.simulatedLatencyMs);

    return order;
  }

  private acknowledgeAndExecute(orderId: string) {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'PENDING_NEW') return;

    // Transition to NEW
    this.fsm.transition(order, 'NEW');
    this.notifyOrder(order);

    // Immediate execution matching for MARKET or crossing LIMIT
    if (order.type === 'MARKET' || order.type === 'TWAP' || order.type === 'VWAP') {
      this.executeFill(order, order.quantity, true);
    } else if (order.type === 'LIMIT') {
      const book = this.orderBookBuilder.getBook(order.symbol);
      if (book) {
        const canFill = (order.side === 'BUY' && order.price >= book.asks[0]?.price) || (order.side === 'SELL' && order.price <= book.bids[0]?.price);
        if (canFill) {
          // Fill immediately
          this.executeFill(order, order.quantity, false);
        }
      }
    }
  }

  public executeFill(order: Order, fillQty: number, isTaker: boolean) {
    const book = this.orderBookBuilder.getBook(order.symbol);
    const vwapResult = this.orderBookBuilder.getVwapExecutionPrice(order.symbol, order.side, fillQty);
    const fillPrice = vwapResult.avgPrice || order.price;

    const feeBps = isTaker ? this.config.takerFeeBps : this.config.makerFeeBps;
    const notional = fillQty * fillPrice;
    const commission = Number(((notional * feeBps) / 10000).toFixed(4));

    const fill: Fill = {
      fillId: `FILL-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      price: fillPrice,
      quantity: fillQty,
      commission,
      commissionAsset: this.config.commissionAsset,
      timestamp: Date.now(),
      isMaker: !isTaker,
    };

    // Update Order state
    order.filledQuantity = Number((order.filledQuantity + fillQty).toFixed(4));
    order.remainingQuantity = Number((order.quantity - order.filledQuantity).toFixed(4));
    order.avgFillPrice = fillPrice;

    if (order.remainingQuantity <= 0.0001) {
      this.fsm.transition(order, 'FILLED');
    } else {
      this.fsm.transition(order, 'PARTIALLY_FILLED');
    }

    this.userDataStream.processFill(fill, fillPrice);
    this.notifyOrder(order);
  }

  public cancelOrder(orderId: string, reason: string = 'User requested cancellation'): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;

    if (this.fsm.canTransition(order.status, 'CANCELLED')) {
      this.fsm.transition(order, 'CANCELLED', reason);
      this.notifyOrder(order);
      return true;
    }
    return false;
  }

  public cancelAllOrders(reason: string = 'Emergency KillSwitch activated'): number {
    let cancelled = 0;
    for (const order of this.getActiveOrders()) {
      if (this.cancelOrder(order.id, reason)) {
        cancelled++;
      }
    }
    return cancelled;
  }

  private notifyOrder(order: Order) {
    this.listeners.forEach((fn) => fn({ ...order }));
  }
}
