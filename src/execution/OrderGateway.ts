/**
 * Basel Quantum Algorithmic Trading System
 * Smart Order Router (SOR) & Execution Order Gateway
 */

import { AssetSymbol, ExecutionMode, Fill, Order, OrderSide, OrderStatus, OrderType, TimeInForce, getBinanceBaseUrl, normalizeExecutionMode, roundToStep } from '../domain/types';
import { OrderBookBuilder } from '../market-data/OrderBookBuilder';
import { OrderStateMachine } from './OrderStateMachine';
import { UserDataStream } from './UserDataStream';
import { RateLimiter } from '../utils/RateLimiter';
import { formatPriceToTick, formatQuantityToStep } from '../market-data/AssetScreener';
import { EXECUTION } from '../config/execution';
import crypto from 'crypto';

export interface GatewayConfig {
  makerFeeBps: number;
  takerFeeBps: number;
  simulatedLatencyMs: number;
  commissionAsset: string;
  apiKey?: string;
  apiSecret?: string;
  apiBaseUrl?: string;
  executionMode?: 'LIVE' | 'TESTNET' | 'PAPER' | string;
}

export const ERROR_POLICY: Record<number, 'RETRY' | 'SHRINK' | 'DISABLE_SYMBOL' | 'HALT'> = {
  [-1003]: 'RETRY',          // rate limit
  [-1021]: 'RETRY',          // timestamp offset, syncTime first
  [-2019]: 'SHRINK',         // margin is insufficient
  [-4164]: 'DISABLE_SYMBOL', // less than min notional
  [-1111]: 'DISABLE_SYMBOL', // bad precision
  [-2015]: 'HALT',           // API key invalid / rejected
};

export class OrderGateway {
  private orders: Map<string, Order> = new Map();
  private exchangeIdMap: Map<string, string> = new Map(); // exchangeOrderId -> localOrderId
  private protectiveOrders: Map<string, { slId?: string; tpId?: string }> = new Map(); // localOrderId -> protective IDs
  private fsm: OrderStateMachine;
  private userDataStream: UserDataStream;
  private orderBookBuilder: OrderBookBuilder;
  private config: GatewayConfig;
  private orderCounter: number = 0;
  private listeners: Set<(order: Order) => void> = new Set();
  private rateLimiter: RateLimiter;
  private symbolFilters: Map<string, { stepSize: number; tickSize: number; minQty: number; minNotional: number }> = new Map();
  private currentLeverage: Map<string, number> = new Map();
  private timeOffset: number = 0;

  private apiKey: string = '';
  private apiSecret: string = '';
  private apiBaseUrl: string = 'https://fapi.binance.com';
  private executionMode: ExecutionMode = 'PAPER';

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
      executionMode: EXECUTION.mode,
      ...config,
    };

    this.apiKey = this.config.apiKey || EXECUTION.apiKey;
    this.apiSecret = this.config.apiSecret || EXECUTION.apiSecret;
    this.executionMode = (this.config.executionMode as ExecutionMode) || EXECUTION.mode;
    this.apiBaseUrl = this.config.apiBaseUrl || EXECUTION.restUrl;

    // Default filters for liquid perpetuals with minNotional
    this.symbolFilters.set('BTCUSDT', { stepSize: 0.001, tickSize: 0.1, minQty: 0.001, minNotional: 5.0 });
    this.symbolFilters.set('ETHUSDT', { stepSize: 0.001, tickSize: 0.01, minQty: 0.001, minNotional: 5.0 });
    this.symbolFilters.set('SOLUSDT', { stepSize: 0.01, tickSize: 0.01, minQty: 0.01, minNotional: 5.0 });
    this.symbolFilters.set('BNBUSDT', { stepSize: 0.01, tickSize: 0.01, minQty: 0.01, minNotional: 5.0 });
    this.symbolFilters.set('XRPUSDT', { stepSize: 0.1, tickSize: 0.0001, minQty: 0.1, minNotional: 5.0 });
    this.symbolFilters.set('DOGEUSDT', { stepSize: 1, tickSize: 0.00001, minQty: 1, minNotional: 5.0 });

    if (this.executionMode !== 'PAPER' && this.apiKey && this.apiSecret) {
      void this.syncTime();
      void this.checkDualSidePosition();
    }
  }

  public async syncTime(): Promise<void> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/fapi/v1/time`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.serverTime) {
          this.timeOffset = data.serverTime - Date.now();
          console.log(`⏱️ Binance Server Time Synced: Offset = ${this.timeOffset}ms`);
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not sync Binance server time:', e);
    }
  }

  public ts(): number {
    return Date.now() + this.timeOffset;
  }

  public async checkDualSidePosition(): Promise<boolean> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return true;
    try {
      const timestamp = this.ts();
      const q = `timestamp=${timestamp}`;
      const sig = crypto.createHmac('sha256', this.apiSecret).update(q).digest('hex');
      const res = await fetch(`${this.apiBaseUrl}/fapi/v1/positionSide/dual?${q}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.dualSidePosition === true) {
          console.warn('⚠️ Account is in Hedge mode. For One-way trading, One-way mode is recommended.');
          return false;
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not verify position side mode:', err);
    }
    return true;
  }

  public async signedGet(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return [];
    try {
      const timestamp = this.ts();
      const queryParts = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
      queryParts.push(`timestamp=${timestamp}`);
      queryParts.push(`recvWindow=5000`);
      const queryStr = queryParts.join('&');
      const sig = crypto.createHmac('sha256', this.apiSecret).update(queryStr).digest('hex');
      const res = await fetch(`${this.apiBaseUrl}${endpoint}?${queryStr}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      const used = Number(res.headers.get('x-mbx-used-weight-1m') || 0);
      this.rateLimiter.syncUsed(used);
      if (res.status === 429 || res.status === 418) {
        const retryAfter = Number(res.headers.get('retry-after') || 60) * 1000;
        await this.rateLimiter.backoff(retryAfter);
      }
      return await res.json();
    } catch (e) {
      console.error(`❌ signedGet failed for ${endpoint}:`, e);
      return [];
    }
  }

  public setSymbolFilter(symbol: string, stepSize: number, tickSize: number, minQty: number = 0.001, minNotional: number = 5.0) {
    const clean = symbol.replace('/', '');
    this.symbolFilters.set(clean, { stepSize, tickSize, minQty, minNotional });
  }

  public getSymbolFilter(symbol: string) {
    const clean = symbol.replace('/', '');
    return this.symbolFilters.get(clean) || { stepSize: 0.001, tickSize: 0.01, minQty: 0.001, minNotional: 5.0 };
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getApiKey(): string { return this.apiKey; }
  public getApiSecret(): string { return this.apiSecret; }
  public getApiBaseUrl(): string { return this.apiBaseUrl; }
  public getExecutionMode(): 'LIVE' | 'TESTNET' | 'PAPER' { return this.executionMode; }

  /**
   * ضبط الرافعة المالية ونوع الهامش (ISOLATED أو CROSSED) للرمز على Binance Futures
   */
  public async ensureLeverage(symbol: string, leverage: number, marginType: 'ISOLATED' | 'CROSSED' = 'ISOLATED'): Promise<boolean> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return true;

    const cleanSymbol = symbol.replace('/', '');
    const roundedLev = Math.max(1, Math.min(50, Math.round(leverage)));

    if (this.currentLeverage.get(cleanSymbol) === roundedLev) return true;

    try {
      const timestamp = Date.now();
      const headers = { 'X-MBX-APIKEY': this.apiKey };

      // 1. محاولة ضبط نوع الهامش (تجاهل الخطأ إذا كان مضبوطاً مسبقاً)
      try {
        const marginQuery = `symbol=${cleanSymbol}&marginType=${marginType}&timestamp=${timestamp}`;
        const marginSig = crypto.createHmac('sha256', this.apiSecret).update(marginQuery).digest('hex');
        await fetch(`${this.apiBaseUrl}/fapi/v1/marginType?${marginQuery}&signature=${marginSig}`, {
          method: 'POST',
          headers,
        });
      } catch (mErr) {
        // تجاهل أخطاء نوع الهامش إذا كان مفعلاً بالفعل
      }

      // 2. ضبط الرافعة المالية
      const levQuery = `symbol=${cleanSymbol}&leverage=${roundedLev}&timestamp=${Date.now()}`;
      const levSig = crypto.createHmac('sha256', this.apiSecret).update(levQuery).digest('hex');

      const res = await fetch(`${this.apiBaseUrl}/fapi/v1/leverage?${levQuery}&signature=${levSig}`, {
        method: 'POST',
        headers,
      });

      const data = await res.json();
      if (res.ok) {
        this.currentLeverage.set(cleanSymbol, roundedLev);
        console.log(`⚡ Binance Futures Leverage set for ${cleanSymbol}: ${data.leverage}x (ISOLATED)`);
        return true;
      } else {
        console.warn(`⚠️ Failed to set Binance leverage for ${cleanSymbol}:`, data);
        return false;
      }
    } catch (err) {
      console.error(`❌ Error configuring leverage for ${cleanSymbol}:`, err);
      return false;
    }
  }

  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    return this.ensureLeverage(symbol, leverage);
  }

  /**
   * إرسال أوامر الحماية (Stop Loss & Take Profit) بدقة مع reduceOnly وتتبع معرفاتها
   */
  public async sendProtectiveOrders(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    entryPrice: number,
    slPrice: number,
    tpPrice: number,
    localOrderId?: string
  ): Promise<{ slId?: string; tpId?: string }> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return {};

    try {
      const cleanSymbol = symbol.replace('/', '');
      const filter = this.getSymbolFilter(symbol);
      const endpoint = '/fapi/v1/order';
      const timestamp = Date.now();

      const slSide = side === 'BUY' ? 'SELL' : 'BUY';
      const formattedSl = formatPriceToTick(slPrice, filter.tickSize);
      const formattedTp = formatPriceToTick(tpPrice, filter.tickSize);
      const formattedQty = formatQuantityToStep(quantity, filter.stepSize);

      if (formattedQty < filter.minQty) {
        console.warn(`⚠️ Protective order quantity ${formattedQty} below minQty ${filter.minQty} for ${symbol}`);
        return {};
      }

      // 1. Stop Loss Order (reduceOnly, MARK_PRICE, priceProtect)
      const slClientOrderId = localOrderId ? `BASEL_PROT_SL_${localOrderId}`.substring(0, 32) : `BASEL_SL_${timestamp}`;
      const slParams = `symbol=${cleanSymbol}&side=${slSide}&type=STOP_MARKET&stopPrice=${formattedSl}&quantity=${formattedQty}&reduceOnly=true&workingType=MARK_PRICE&priceProtect=true&newClientOrderId=${slClientOrderId}&timestamp=${timestamp}`;
      const slSig = crypto.createHmac('sha256', this.apiSecret).update(slParams).digest('hex');
      
      // 2. Take Profit Order (reduceOnly, MARK_PRICE, priceProtect)
      const tpClientOrderId = localOrderId ? `BASEL_PROT_TP_${localOrderId}`.substring(0, 32) : `BASEL_TP_${timestamp + 100}`;
      const tpParams = `symbol=${cleanSymbol}&side=${slSide}&type=TAKE_PROFIT_MARKET&stopPrice=${formattedTp}&quantity=${formattedQty}&reduceOnly=true&workingType=MARK_PRICE&priceProtect=true&newClientOrderId=${tpClientOrderId}&timestamp=${timestamp + 100}`;
      const tpSig = crypto.createHmac('sha256', this.apiSecret).update(tpParams).digest('hex');

      const headers = { 'X-MBX-APIKEY': this.apiKey };
      
      const [slRes, tpRes] = await Promise.all([
        fetch(`${this.apiBaseUrl}${endpoint}?${slParams}&signature=${slSig}`, { method: 'POST', headers }),
        fetch(`${this.apiBaseUrl}${endpoint}?${tpParams}&signature=${tpSig}`, { method: 'POST', headers })
      ]);

      const slData = await slRes.json();
      const tpData = await tpRes.json();

      const result: { slId?: string; tpId?: string } = {};

      if (!slRes.ok) {
        console.warn('⚠️ SL order rejected on Binance:', slData);
      } else if (slData.orderId) {
        result.slId = String(slData.orderId);
      }

      if (!tpRes.ok) {
        console.warn('⚠️ TP order rejected on Binance:', tpData);
      } else if (tpData.orderId) {
        result.tpId = String(tpData.orderId);
      }

      const trackKey = localOrderId || cleanSymbol;
      this.protectiveOrders.set(trackKey, result);

      console.log(`🛡️ Protective Orders Submitted [${cleanSymbol}] | SL: $${formattedSl} (ID: ${result.slId || 'N/A'}) | TP: $${formattedTp} (ID: ${result.tpId || 'N/A'}) | Qty: ${formattedQty}`);
      return result;
    } catch (err) {
      console.error('❌ Failed to set protective orders on Binance:', err);
      return {};
    }
  }

  /**
   * إرسال أمر وقف خسارة منفرد (مثلاً لـ Trailing Stop أو Break-Even)
   */
  public async sendStopLoss(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    stopPrice: number,
    localOrderId?: string
  ): Promise<string | undefined> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return undefined;
    try {
      const cleanSymbol = symbol.replace('/', '');
      const filter = this.getSymbolFilter(symbol);
      const endpoint = '/fapi/v1/order';
      const timestamp = Date.now();
      const formattedSl = formatPriceToTick(stopPrice, filter.tickSize);
      const formattedQty = formatQuantityToStep(quantity, filter.stepSize);

      if (formattedQty < filter.minQty) return undefined;

      const slParams = `symbol=${cleanSymbol}&side=${side}&type=STOP_MARKET&stopPrice=${formattedSl}&quantity=${formattedQty}&reduceOnly=true&workingType=MARK_PRICE&timestamp=${timestamp}`;
      const slSig = crypto.createHmac('sha256', this.apiSecret).update(slParams).digest('hex');
      const headers = { 'X-MBX-APIKEY': this.apiKey };

      const res = await fetch(`${this.apiBaseUrl}${endpoint}?${slParams}&signature=${slSig}`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok && data.orderId) {
        const slId = String(data.orderId);
        const trackKey = localOrderId || cleanSymbol;
        const current = this.protectiveOrders.get(trackKey) || {};
        this.protectiveOrders.set(trackKey, { ...current, slId });
        return slId;
      }
    } catch (e) {
      console.error('❌ Failed to send standalone Stop Loss:', e);
    }
    return undefined;
  }

  /**
   * إلغاء كافة أوامر الحماية للرمز أو لأمر محدد بالمعرف
   */
  public async cancelProtectiveOrders(symbolOrOrderId: string): Promise<void> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return;

    try {
      const clean = symbolOrOrderId.replace('/', '');
      
      // إذا كان لدينا معرفات محددة مسجلة مسبقاً لهذا الأمر
      const tracked = this.protectiveOrders.get(symbolOrOrderId) || this.protectiveOrders.get(clean);
      if (tracked && (tracked.slId || tracked.tpId)) {
        const headers = { 'X-MBX-APIKEY': this.apiKey };
        const cancelPromises = [];
        
        if (tracked.slId) {
          const q = `symbol=${clean}&orderId=${tracked.slId}&timestamp=${Date.now()}`;
          const sig = crypto.createHmac('sha256', this.apiSecret).update(q).digest('hex');
          cancelPromises.push(fetch(`${this.apiBaseUrl}/fapi/v1/order?${q}&signature=${sig}`, { method: 'DELETE', headers }));
        }
        if (tracked.tpId) {
          const q = `symbol=${clean}&orderId=${tracked.tpId}&timestamp=${Date.now() + 50}`;
          const sig = crypto.createHmac('sha256', this.apiSecret).update(q).digest('hex');
          cancelPromises.push(fetch(`${this.apiBaseUrl}/fapi/v1/order?${q}&signature=${sig}`, { method: 'DELETE', headers }));
        }

        await Promise.allSettled(cancelPromises);
        this.protectiveOrders.delete(symbolOrOrderId);
        this.protectiveOrders.delete(clean);
        console.log(`🗑️ Cancelled specific protective order IDs for ${symbolOrOrderId}`);
        return;
      }

      // كبديل موثوق: إلغاء كافة الأوامر المفتوحة للرمز
      await this.cancelAllProtectiveForSymbol(clean);
    } catch (err) {
      console.error(`❌ Error cancelling protective orders for ${symbolOrOrderId}:`, err);
    }
  }

  public async cancelAllProtectiveForSymbol(symbol: string): Promise<void> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return;
    try {
      const cleanSymbol = symbol.replace('/', '');
      const timestamp = Date.now();
      const endpoint = '/fapi/v1/allOpenOrders';
      const query = `symbol=${cleanSymbol}&timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');

      const res = await fetch(`${this.apiBaseUrl}${endpoint}?${query}&signature=${signature}`, {
        method: 'DELETE',
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`🗑️ Cancelled all open protective orders for ${cleanSymbol}`);
      } else {
        console.warn(`⚠️ Could not cancel open orders for ${cleanSymbol}:`, data);
      }
    } catch (err) {
      console.error(`❌ Error cancelling all open orders for ${symbol}:`, err);
    }
  }

  /**
   * إرسال طلب أمر حقيقي لـ Binance Futures API مع تطبيق فلاتر الدقة (stepSize / tickSize)
   */
  private async sendOrderToBinance(order: Order, params: {
    symbol: AssetSymbol;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    timeInForce?: TimeInForce;
    reduceOnly?: boolean;
  }) {
    if (!this.apiKey || !this.apiSecret) return;

    try {
      const allowed = await this.rateLimiter.acquire('/fapi/v1/order', 1);
      if (!allowed) {
        order.status = 'REJECTED';
        order.errorMessage = 'Rate limit budget exhausted';
        this.notifyOrder(order);
        return;
      }

      const cleanSymbol = params.symbol.replace('/', '');
      const filter = this.getSymbolFilter(params.symbol);
      const timestamp = this.ts();
      const endpoint = '/fapi/v1/order';

      // دقة الكمية والسعر مطابقة لفلاتر Binance بالضبط
      const formattedQty = formatQuantityToStep(params.quantity, filter.stepSize);
      if (formattedQty < filter.minQty) {
        order.status = 'REJECTED';
        order.errorMessage = `Quantity ${formattedQty} is below minimum ${filter.minQty}`;
        this.notifyOrder(order);
        return;
      }

      let queryStr = `symbol=${cleanSymbol}&side=${params.side}&type=${params.type}&quantity=${formattedQty}&newClientOrderId=${order.id}&newOrderRespType=RESULT&timestamp=${timestamp}&recvWindow=5000`;
      if (params.reduceOnly) {
        queryStr += '&reduceOnly=true';
      }
      if (params.type === 'LIMIT' && params.price) {
        const formattedPrice = formatPriceToTick(params.price, filter.tickSize);
        queryStr += `&price=${formattedPrice}&timeInForce=${params.timeInForce || 'GTC'}`;
      }

      const signature = crypto.createHmac('sha256', this.apiSecret).update(queryStr).digest('hex');
      const url = `${this.apiBaseUrl}${endpoint}?${queryStr}&signature=${signature}`;

      console.log(`🌐 Submitting order to Binance Futures [${this.executionMode}]: ${params.side} ${formattedQty} ${cleanSymbol} (ClientOID: ${order.id})...`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });

      const used = Number(res.headers.get('x-mbx-used-weight-1m') || 0);
      this.rateLimiter.syncUsed(used);
      if (res.status === 429 || res.status === 418) {
        const retryAfter = Number(res.headers.get('retry-after') || 60) * 1000;
        await this.rateLimiter.backoff(retryAfter);
      }

      const data = await res.json();
      if (!res.ok) {
        console.error('❌ Binance Futures REST Order Rejected:', data);
        const code = Number(data.code || 0);
        const policy = ERROR_POLICY[code] || 'HALT';
        console.warn(`⚠️ Applied Error Policy for Binance code ${code}: ${policy}`);

        order.status = 'REJECTED';
        order.errorMessage = data.msg || 'Binance REST API Rejected';
        this.notifyOrder(order);
      } else {
        console.log(`✅ Binance Futures Order Accepted [ID: ${data.orderId}]: ${data.symbol} ${data.side} status=${data.status}`);
        order.exchangeOrderId = String(data.orderId);
        if (this.exchangeIdMap.size > 2000) {
          const oldest = this.exchangeIdMap.keys().next().value;
          if (oldest) this.exchangeIdMap.delete(oldest);
        }
        this.exchangeIdMap.set(String(data.orderId), order.id);

        order.status = 'PENDING_NEW'; // initial state
        const targetStatus: OrderStatus = data.status === 'FILLED' ? 'FILLED' : data.status === 'NEW' ? 'NEW' : 'PARTIALLY_FILLED';
        if (data.avgPrice && parseFloat(data.avgPrice) > 0) {
          order.avgFillPrice = parseFloat(data.avgPrice);
        }
        order.filledQuantity = parseFloat(data.executedQty) || (data.status === 'FILLED' ? formattedQty : 0);
        order.remainingQuantity = Math.max(0, formattedQty - order.filledQuantity);

        if (this.fsm.canTransition(order.status, targetStatus)) {
          this.fsm.transition(order, targetStatus);
        } else {
          order.status = targetStatus;
        }

        if (data.status === 'FILLED') {
          this.executeFill(order, order.filledQuantity, true);
        }
        this.notifyOrder(order);
      }
    } catch (err) {
      console.error('❌ Error sending order to Binance Futures:', err);
      if (this.fsm.canTransition(order.status, 'REJECTED')) {
        this.fsm.transition(order, 'REJECTED', String(err));
      } else {
        order.status = 'REJECTED';
        order.errorMessage = String(err);
      }
      this.notifyOrder(order);
    }
  }

  /**
   * تطبيق تحديثات الأوامر الحقيقية الصادرة من Binance WebSocket (ORDER_TRADE_UPDATE)
   */
  public applyExchangeUpdate(eventOrder: any): void {
    if (!eventOrder) return;
    const exchangeOrderId = String(eventOrder.i || '');
    const clientOrderId = String(eventOrder.c || '');
    const localId = this.exchangeIdMap.get(exchangeOrderId) || clientOrderId.replace(/^C_/, '');
    const order = this.orders.get(localId) || this.orders.get(clientOrderId);

    if (!order) return;

    const binanceStatus = eventOrder.X;
    const avgPrice = parseFloat(eventOrder.ap) || parseFloat(eventOrder.L) || order.avgFillPrice;
    const cumQty = parseFloat(eventOrder.z) || 0;

    order.updatedAt = Date.now();
    if (avgPrice > 0) order.avgFillPrice = avgPrice;
    if (cumQty > 0) order.filledQuantity = cumQty;
    order.remainingQuantity = Math.max(0, order.quantity - order.filledQuantity);

    let targetStatus: OrderStatus = order.status;
    if (binanceStatus === 'FILLED') {
      targetStatus = 'FILLED';
      this.userDataStream.processFill({
        fillId: `EX_FILL-${exchangeOrderId}-${Date.now()}`,
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        price: order.avgFillPrice || order.price,
        quantity: order.filledQuantity,
        commission: parseFloat(eventOrder.n) || 0,
        commissionAsset: eventOrder.N || 'USDT',
        timestamp: eventOrder.T || Date.now(),
        isMaker: eventOrder.m || false,
      }, order.avgFillPrice || order.price);
    } else if (binanceStatus === 'PARTIALLY_FILLED') {
      targetStatus = 'PARTIALLY_FILLED';
    } else if (binanceStatus === 'CANCELED' || binanceStatus === 'EXPIRED') {
      targetStatus = 'CANCELLED';
    } else if (binanceStatus === 'REJECTED') {
      targetStatus = 'REJECTED';
    } else if (binanceStatus === 'NEW') {
      targetStatus = 'NEW';
    }

    if (this.fsm.canTransition(order.status, targetStatus)) {
      this.fsm.transition(order, targetStatus);
    } else {
      order.status = targetStatus;
    }

    this.notifyOrder(order);
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
    reduceOnly?: boolean;
  }): Order {
    // Check and record rate limit usage
    this.rateLimiter.checkRateLimit('/fapi/v1/order').catch(err => console.error("RateLimiter error:", err));

    this.orderCounter += 1;
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const orderId = `ORD-${Date.now().toString(36)}-${this.orderCounter}-${randomSuffix}`;
    const clientOrderId = `C_${orderId}`;

    const filter = this.getSymbolFilter(params.symbol);
    const formattedQty = formatQuantityToStep(params.quantity, filter.stepSize);

    const book = this.orderBookBuilder.getBook(params.symbol);
    const midPrice = book?.midPrice || 100;
    const limitPrice = params.price || (params.side === 'BUY' ? midPrice * 1.0005 : midPrice * 0.9995);

    const notionalValue = formattedQty * limitPrice;

    // التحقق من الحد الأدنى للكمية والقيمة الاسمية (minNotional)
    if (formattedQty < filter.minQty) {
      const order: Order = {
        id: orderId,
        clientOrderId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        price: formatPriceToTick(limitPrice, filter.tickSize),
        quantity: formattedQty,
        filledQuantity: 0,
        remainingQuantity: formattedQty,
        avgFillPrice: 0,
        status: 'REJECTED',
        timeInForce: params.timeInForce || 'GTC',
        timestamp: Date.now(),
        updatedAt: Date.now(),
        strategyId: params.strategyId || 'Ornstein-Uhlenbeck-QUBO',
        executionTag: params.executionTag || 'SOR-AUTO',
        errorMessage: `Quantity ${formattedQty} below symbol minimum ${filter.minQty}`,
      };
      this.orders.set(orderId, order);
      this.notifyOrder(order);
      return order;
    }

    if (filter.minNotional && notionalValue < filter.minNotional) {
      const order: Order = {
        id: orderId,
        clientOrderId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        price: formatPriceToTick(limitPrice, filter.tickSize),
        quantity: formattedQty,
        filledQuantity: 0,
        remainingQuantity: formattedQty,
        avgFillPrice: 0,
        status: 'REJECTED',
        timeInForce: params.timeInForce || 'GTC',
        timestamp: Date.now(),
        updatedAt: Date.now(),
        strategyId: params.strategyId || 'Ornstein-Uhlenbeck-QUBO',
        executionTag: params.executionTag || 'SOR-AUTO',
        errorMessage: `Notional value $${notionalValue.toFixed(2)} is below minimum $${filter.minNotional}`,
      };
      this.orders.set(orderId, order);
      this.notifyOrder(order);
      return order;
    }

    const order: Order = {
      id: orderId,
      clientOrderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      price: formatPriceToTick(limitPrice, filter.tickSize),
      quantity: formattedQty,
      filledQuantity: 0,
      remainingQuantity: formattedQty,
      avgFillPrice: 0,
      status: 'PENDING_NEW',
      timeInForce: params.timeInForce || 'GTC',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      strategyId: params.strategyId || 'Ornstein-Uhlenbeck-QUBO',
      executionTag: params.executionTag || 'SOR-AUTO',
    };

    // Memory leak protection: bound order cache to 2,000 entries
    if (this.orders.size > 2000) {
      const oldestKey = this.orders.keys().next().value;
      if (oldestKey) this.orders.delete(oldestKey);
    }

    this.orders.set(orderId, order);
    this.notifyOrder(order);

    if (this.executionMode !== 'PAPER' && this.apiKey && this.apiSecret) {
      // Send real order to Binance Testnet or Live ONLY - NO duplicate local paper fill!
      this.sendOrderToBinance(order, params);
    } else {
      // Simulate async network wire latency and exchange ACK in PAPER mode only
      setTimeout(() => {
        this.acknowledgeAndExecute(orderId);
      }, this.config.simulatedLatencyMs);
    }

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
