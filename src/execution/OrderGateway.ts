/**
 * Basel Quantum Algorithmic Trading System
 * Smart Order Router (SOR) & Execution Order Gateway
 */

import { AssetSymbol, ExecutionMode, Fill, Order, OrderSide, OrderStatus, OrderType, TimeInForce, getBinanceBaseUrl, normalizeExecutionMode, roundToStep, isLiveTradingConfirmed } from '../domain/types';
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

export const ERROR_POLICY: Record<number, 'RETRY' | 'SHRINK' | 'ADJUST_NOTIONAL' | 'DISABLE_SYMBOL' | 'HALT'> = {
  [-1003]: 'RETRY',           // rate limit
  [-1021]: 'RETRY',           // timestamp offset, syncTime first
  [-2019]: 'SHRINK',          // margin is insufficient
  [-4164]: 'ADJUST_NOTIONAL', // less than min notional -> auto-calibrate threshold
  [-1111]: 'DISABLE_SYMBOL',  // bad precision
  [-2015]: 'HALT',            // API key invalid / rejected
};

export class OrderGateway {
  private orders: Map<string, Order> = new Map();
  private exchangeIdMap: Map<string, string> = new Map(); // exchangeOrderId -> localOrderId
  private protectiveOrders: Map<string, { slId?: string; tpId?: string }> = new Map(); // localOrderId -> protective IDs
  // Fill bookkeeping for real-exchange modes (prevents double processing & keeps true commissions)
  private fillRecorded: Set<string> = new Set();
  private seenTrades: Set<string> = new Set();
  private orderCommission: Map<string, number> = new Map();
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

  private isHedgeMode: boolean = false;

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
          console.warn('⚠️ Account is in Hedge mode. Attempting to automatically switch to One-Way Mode...');
          // Attempt auto-switch to One-Way Mode (dualSidePosition=false)
          try {
            const setTs = this.ts();
            const setQ = `dualSidePosition=false&timestamp=${setTs}`;
            const setSig = crypto.createHmac('sha256', this.apiSecret).update(setQ).digest('hex');
            const setRes = await fetch(`${this.apiBaseUrl}/fapi/v1/positionSide/dual?${setQ}&signature=${setSig}`, {
              method: 'POST',
              headers: { 'X-MBX-APIKEY': this.apiKey },
            });
            if (setRes.ok) {
              console.log('✅ Successfully switched Binance Futures account to One-Way position mode.');
              this.isHedgeMode = false;
              return true;
            } else {
              const errJson = await setRes.json().catch(() => ({}));
              console.error('🚨 Failed to auto-switch to One-Way Mode (existing hedge positions may be open):', errJson);
              this.isHedgeMode = true;
              return false;
            }
          } catch (switchErr) {
            console.error('🚨 Error switching position side mode:', switchErr);
            this.isHedgeMode = true;
            return false;
          }
        } else {
          this.isHedgeMode = false;
          return true;
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not verify position side mode:', err);
    }
    return true;
  }

  public getIsHedgeMode(): boolean {
    return this.isHedgeMode;
  }

  public async signedRequest(
    endpointOrMethod: string,
    methodOrEndpoint: string = 'GET',
    params: Record<string, any> = {},
    timeoutMs: number = 8000
  ): Promise<{ ok: boolean; status: number; data: any }> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) {
      return { ok: true, status: 200, data: {} };
    }

    let method: 'GET' | 'POST' | 'DELETE' = 'GET';
    let endpoint: string = '';
    if (['GET', 'POST', 'DELETE'].includes(endpointOrMethod.toUpperCase())) {
      method = endpointOrMethod.toUpperCase() as any;
      endpoint = methodOrEndpoint;
    } else {
      endpoint = endpointOrMethod;
      method = methodOrEndpoint.toUpperCase() as any;
    }

    const execute = async (retryOnTime: boolean = true): Promise<{ ok: boolean; status: number; data: any }> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const timestamp = this.ts();
        const fullParams = { ...params, recvWindow: 5000, timestamp };
        const query = Object.entries(fullParams)
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&');
        const signature = crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
        const url = `${this.apiBaseUrl}${endpoint}?${query}&signature=${signature}`;

        const res = await fetch(url, {
          method,
          headers: { 'X-MBX-APIKEY': this.apiKey },
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));

        // Rate limit headers
        const used = Number(res.headers.get('x-mbx-used-weight-1m') || 0);
        if (used > 0) this.rateLimiter.syncUsed(used);
        if (res.status === 429 || res.status === 418) {
          const retryAfter = Number(res.headers.get('retry-after') || 60) * 1000;
          await this.rateLimiter.backoff(retryAfter);
        }

        // Auto clock re-sync on -1021
        if (data && (data.code === -1021 || data.code === -1002) && retryOnTime) {
          console.warn('⏱️ Binance timestamp offset error (-1021). Re-synchronizing system clock...');
          await this.syncTime();
          return execute(false);
        }

        return { ok: res.ok, status: res.status, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, status: 0, data: { error: err.message || 'Network error' } };
      }
    };

    return execute(true);
  }

  public async signedGet(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const res = await this.signedRequest(endpoint, 'GET', params);
    return res.data;
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
  public setExecutionMode(mode: 'LIVE' | 'TESTNET' | 'PAPER') {
    this.executionMode = mode;
    this.apiBaseUrl = getBinanceBaseUrl(mode);
  }

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
   * إرسال أوامر الحماية (Stop Loss & Take Profit) بدقة مع reduceOnly وتتبع معرفاتها والتحقق من جانب الوقف
   */
  public async sendProtectiveOrders(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    entryPrice: number,
    slPrice: number,
    tpPrice: number,
    localOrderId?: string
  ): Promise<{ slId?: string; tpId?: string; slOk: boolean }> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return { slOk: true };

    const cleanSymbol = symbol.replace('/', '');
    const filter = this.getSymbolFilter(symbol);
    const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
    const formattedSl = formatPriceToTick(slPrice, filter.tickSize);
    const formattedTp = formatPriceToTick(tpPrice, filter.tickSize);
    const formattedQty = formatQuantityToStep(quantity, filter.stepSize);

    if (!Number.isFinite(formattedQty) || formattedQty < filter.minQty) {
      console.warn(`⚠️ Protective order quantity ${formattedQty} below minQty ${filter.minQty} for ${symbol}`);
      return { slOk: false };
    }

    // Sanity: the stop must sit on the losing side of the entry, the target on the winning side.
    const slNum = Number(formattedSl);
    const tpNum = Number(formattedTp);
    const slValid = Number.isFinite(slNum) && slNum > 0 &&
      (side === 'BUY' ? slNum < entryPrice : slNum > entryPrice);
    const tpValid = Number.isFinite(tpNum) && tpNum > 0 &&
      (side === 'BUY' ? tpNum > entryPrice : tpNum < entryPrice);

    const idTail = (localOrderId || String(Date.now())).slice(-24); // Binance max clientOrderId = 36 chars
    const result: { slId?: string; tpId?: string; slOk: boolean } = { slOk: false };

    if (!slValid) {
      console.error(`❌ Invalid stop-loss price ${formattedSl} for ${side} entry @ ${entryPrice} (${symbol}); stop NOT placed.`);
    } else {
      const sl = await this.signedRequest('/fapi/v1/order', 'POST', {
        symbol: cleanSymbol,
        side: exitSide,
        type: 'STOP_MARKET',
        stopPrice: formattedSl,
        quantity: formattedQty,
        reduceOnly: true,
        workingType: 'MARK_PRICE',
        priceProtect: true,
        newClientOrderId: `BASEL_SL_${idTail}`,
      });
      if (sl.ok && sl.data?.orderId) {
        result.slId = String(sl.data.orderId);
        result.slOk = true;
      } else {
        console.error('❌ SL order rejected on Binance:', sl.data);
      }
    }

    if (!tpValid) {
      console.warn(`⚠️ Invalid take-profit price ${formattedTp} for ${side} entry @ ${entryPrice} (${symbol}); TP NOT placed.`);
    } else {
      const tp = await this.signedRequest('/fapi/v1/order', 'POST', {
        symbol: cleanSymbol,
        side: exitSide,
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: formattedTp,
        quantity: formattedQty,
        reduceOnly: true,
        workingType: 'MARK_PRICE',
        priceProtect: true,
        newClientOrderId: `BASEL_TP_${idTail}`,
      });
      if (tp.ok && tp.data?.orderId) {
        result.tpId = String(tp.data.orderId);
      } else {
        console.warn('⚠️ TP order rejected on Binance:', tp.data);
      }
    }

    this.protectiveOrders.set(localOrderId || cleanSymbol, { slId: result.slId, tpId: result.tpId });
    console.log(`🛡️ Protective Orders [${cleanSymbol}] | SL: $${formattedSl} (ID: ${result.slId || 'FAILED'}) | TP: $${formattedTp} (ID: ${result.tpId || 'N/A'}) | Qty: ${formattedQty}`);
    return result;
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
      const formattedSl = formatPriceToTick(stopPrice, filter.tickSize);
      const formattedQty = formatQuantityToStep(quantity, filter.stepSize);

      if (formattedQty < filter.minQty) return undefined;

      const res = await this.signedRequest('/fapi/v1/order', 'POST', {
        symbol: cleanSymbol,
        side,
        type: 'STOP_MARKET',
        stopPrice: formattedSl,
        quantity: formattedQty,
        reduceOnly: true,
        workingType: 'MARK_PRICE',
      });

      if (res.ok && res.data?.orderId) {
        const slId = String(res.data.orderId);
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
  public async cancelProtectiveOrders(symbolOrOrderId: string, secondaryKey?: string): Promise<void> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return;

    try {
      const clean = symbolOrOrderId.replace('/', '');
      
      // إذا كان لدينا معرفات محددة مسجلة مسبقاً لهذا الأمر أو الرمز
      const tracked = this.protectiveOrders.get(symbolOrOrderId) || 
                      this.protectiveOrders.get(clean) || 
                      (secondaryKey ? this.protectiveOrders.get(secondaryKey) : undefined);

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
        if (secondaryKey) this.protectiveOrders.delete(secondaryKey);
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

      // دقة الكمية والسعر مطابقة لفلاتر Binance بالضبط مع التوافق مع الأرصدة الصغيرة
      let formattedQty = formatQuantityToStep(params.quantity, filter.stepSize);
      if (formattedQty < filter.minQty) {
        formattedQty = filter.minQty;
      }
      if (params.price && filter.minNotional && (formattedQty * params.price) < filter.minNotional) {
        const bumped = formatQuantityToStep((filter.minNotional * 1.02) / params.price, filter.stepSize);
        if (bumped >= filter.minQty) {
          formattedQty = bumped;
        }
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

        if (code === -4164) {
          const match = String(data.msg || '').match(/no smaller than\s+([0-9.]+)/i);
          if (match && match[1]) {
            const actualMinNotional = parseFloat(match[1]);
            if (!isNaN(actualMinNotional) && actualMinNotional > 0) {
              const currentFilter = this.getSymbolFilter(params.symbol);
              this.setSymbolFilter(params.symbol, currentFilter.stepSize, currentFilter.tickSize, currentFilter.minQty, actualMinNotional);
              console.log(`🔧 [AUTO-RECOVERY] Calibrated minNotional filter for ${params.symbol} to $${actualMinNotional} based on Binance response.`);
            }
          }
        }

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
          if (this.executionMode === 'PAPER') {
            this.executeFill(order, order.filledQuantity, true);
          } else {
            // Real exchange fills are recorded from ORDER_TRADE_UPDATE (true price / commission).
            // Safety net: if the stream has not delivered the fill within 3s, record it once from the REST result.
            const filledOrder = order;
            setTimeout(() => this.recordFallbackFill(filledOrder), 3000);
          }
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

    // Accumulate commission across every TRADE event (each event carries only its own fee).
    if (eventOrder.x === 'TRADE' && eventOrder.t !== undefined) {
      const tradeKey = `${exchangeOrderId}:${eventOrder.t}`;
      if (!this.seenTrades.has(tradeKey)) {
        if (this.seenTrades.size > 5000) this.seenTrades.clear();
        this.seenTrades.add(tradeKey);
        const feeAsset = String(eventOrder.N || 'USDT');
        const fee = (feeAsset === 'USDT' || feeAsset === 'USDC') ? (parseFloat(eventOrder.n) || 0) : 0;
        this.orderCommission.set(order.id, (this.orderCommission.get(order.id) || 0) + fee);
      }
    }

    let targetStatus: OrderStatus = order.status;
    if (binanceStatus === 'FILLED') {
      targetStatus = 'FILLED';
      if (!this.fillRecorded.has(order.id)) {
        if (this.fillRecorded.size > 5000) this.fillRecorded.clear();
        this.fillRecorded.add(order.id);
        const px = order.avgFillPrice || order.price;
        let commission = this.orderCommission.get(order.id) || 0;
        if (commission === 0) commission = Number(((order.filledQuantity * px * this.config.takerFeeBps) / 10000).toFixed(6));
        this.userDataStream.processFill({
          fillId: `EX_FILL-${exchangeOrderId}`,
          orderId: order.id,
          symbol: order.symbol,
          side: order.side,
          price: px,
          quantity: order.filledQuantity,
          commission,
          commissionAsset: 'USDT',
          timestamp: eventOrder.T || Date.now(),
          isMaker: eventOrder.m || false,
        }, px);
        this.orderCommission.delete(order.id);
      }
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
    let formattedQty = formatQuantityToStep(params.quantity, filter.stepSize);

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
      // للأرصدة الصغيرة: تصحيح الكمية تلقائياً للوصول للحد الأدنى لبايننس (5 USDT)
      const adjustedQty = formatQuantityToStep((filter.minNotional * 1.02) / limitPrice, filter.stepSize);
      if (adjustedQty >= filter.minQty && (adjustedQty * limitPrice) >= filter.minNotional) {
        formattedQty = adjustedQty;
        console.log(`ℹ️ Auto-adjusted micro order quantity for ${params.symbol} to meet minNotional: ${formattedQty} (Val: $${(formattedQty * limitPrice).toFixed(2)})`);
      } else {
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
    }

    // 🛡️ Hard Safety Barrier for LIVE Real Execution
    if (this.executionMode === 'LIVE') {
      if (!isLiveTradingConfirmed()) {
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
          executionTag: params.executionTag || 'LIVE-UNCONFIRMED',
          errorMessage: 'LIVE trading execution blocked: Confirmation barrier active (CONFIRM_LIVE_TRADING=true is required in server environment).',
        };
        console.error(`⛔ LIVE ORDER REJECTED: Order ${orderId} on ${params.symbol} rejected because CONFIRM_LIVE_TRADING is missing or false!`);
        this.orders.set(orderId, order);
        this.notifyOrder(order);
        return order;
      }
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

  /** REST-based safety net for a FILLED order whose stream event never arrived (real modes only). */
  private recordFallbackFill(order: Order): void {
    if (this.executionMode === 'PAPER' || this.fillRecorded.has(order.id)) return;
    this.fillRecorded.add(order.id);
    const px = order.avgFillPrice || order.price;
    const commission = Number(((order.filledQuantity * px * this.config.takerFeeBps) / 10000).toFixed(6));
    console.warn(`⚠️ Stream fill missing for ${order.id}; recording from REST result (estimated fee).`);
    this.userDataStream.processFill({
      fillId: `REST_FILL-${order.exchangeOrderId || order.id}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      price: px,
      quantity: order.filledQuantity,
      commission,
      commissionAsset: 'USDT',
      timestamp: Date.now(),
      isMaker: false,
    }, px);
  }

  /** Cancels a resting order on the exchange (real modes). Protective SL/TP are tracked separately and untouched. */
  private async cancelOnExchange(order: Order): Promise<void> {
    if (this.executionMode === 'PAPER' || !order.exchangeOrderId) return;
    const r = await this.signedRequest('/fapi/v1/order', 'DELETE', {
      symbol: order.symbol.replace('/', ''),
      orderId: order.exchangeOrderId,
    });
    // -2011 = unknown/already closed order: not an error for our purposes
    if (!r.ok && Number(r.data?.code) !== -2011) {
      console.warn(`⚠️ Exchange cancel failed for ${order.id}:`, r.data);
    }
  }

  public cancelOrder(orderId: string, reason: string = 'User requested cancellation'): boolean {
    const order = this.orders.get(orderId);
    if (!order) return false;

    if (this.fsm.canTransition(order.status, 'CANCELLED')) {
      this.fsm.transition(order, 'CANCELLED', reason);
      this.notifyOrder(order);
      void this.cancelOnExchange(order);
      return true;
    }
    return false;
  }

  public async cancelAllOpenOrdersForSymbol(symbol: string): Promise<boolean> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) return true;
    const r = await this.signedRequest('/fapi/v1/allOpenOrders', 'DELETE', { symbol: symbol.replace('/', '') });
    if (!r.ok) console.error(`❌ Failed to cancel open orders on Binance for ${symbol}`, r.data);
    return r.ok;
  }

  /**
   * Closes a position on the exchange.
   * Order of operations matters: the reduce-only MARKET close is sent FIRST and the protective
   * SL/TP are removed only after the close is confirmed, so a failed close never leaves a naked position.
   */
  public async closePositionDirectlyOnBinance(symbol: AssetSymbol, size?: number): Promise<{ success: boolean; qty: number; error?: string }> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) {
      return { success: true, qty: size || 0 };
    }
    const cleanSymbol = symbol.replace('/', '');
    try {
      // Authoritative amount from the exchange (local size may be stale)
      const pr = await this.signedRequest('/fapi/v2/positionRisk', 'GET', { symbol: cleanSymbol });
      let amtStr = '';
      if (pr.ok && Array.isArray(pr.data)) {
        const p = pr.data.find((x: any) => x.symbol === cleanSymbol);
        amtStr = p ? String(p.positionAmt) : '0';
      } else if (size !== undefined && size !== 0) {
        amtStr = String(formatQuantityToStep(Math.abs(size), this.getSymbolFilter(symbol).stepSize) * (size < 0 ? -1 : 1));
      } else {
        return { success: false, qty: 0, error: 'Could not read exchange position' };
      }

      const currentAmt = parseFloat(amtStr);
      if (!Number.isFinite(currentAmt) || Math.abs(currentAmt) < 1e-9) {
        console.log(`ℹ️ [EXCHANGE CLOSE] No active position on Binance for ${symbol}`);
        return { success: true, qty: 0 };
      }

      const closeSide: OrderSide = currentAmt > 0 ? 'SELL' : 'BUY';
      const qtyStr = amtStr.replace('-', ''); // exchange-provided string: already step-aligned

      const order = await this.signedRequest('/fapi/v1/order', 'POST', {
        symbol: cleanSymbol,
        side: closeSide,
        type: 'MARKET',
        quantity: qtyStr,
        reduceOnly: true,
        newOrderRespType: 'RESULT',
      });
      if (!order.ok) {
        console.warn(`⚠️ [EXCHANGE CLOSE REJECTED] ${symbol}`, order.data);
        return { success: false, qty: 0, error: order.data?.msg || 'Close rejected' };
      }

      // MARKET + RESULT is normally FILLED; otherwise verify against the exchange before claiming success
      if (order.data?.status !== 'FILLED') {
        await new Promise((r) => setTimeout(r, 700));
        const chk = await this.signedRequest('/fapi/v2/positionRisk', 'GET', { symbol: cleanSymbol });
        const p2 = chk.ok && Array.isArray(chk.data) ? chk.data.find((x: any) => x.symbol === cleanSymbol) : null;
        if (!p2 || Math.abs(parseFloat(p2.positionAmt)) > 1e-9) {
          return { success: false, qty: 0, error: 'Close order accepted but position still open' };
        }
      }

      // Position is flat: now it is safe to remove the leftover SL/TP orders
      await this.cancelAllOpenOrdersForSymbol(symbol);
      await this.cancelProtectiveOrders(symbol);
      console.log(`✅ [EXCHANGE CLOSE SUCCESS] Closed ${symbol} on Binance (${closeSide} ${qtyStr})`);
      return { success: true, qty: Math.abs(currentAmt) };
    } catch (e) {
      console.error(`❌ [EXCHANGE CLOSE ERROR] ${symbol}`, e);
      return { success: false, qty: 0, error: String(e) };
    }
  }

  /** Closes every open position on the exchange and reports exactly which ones failed. */
  public async closeAllPositionsOnExchange(_positions?: { symbol: AssetSymbol; size: number }[]): Promise<{ closed: number; failed: string[] }> {
    if (this.executionMode === 'PAPER' || !this.apiKey || !this.apiSecret) {
      return { closed: 0, failed: [] };
    }
    const pr = await this.signedRequest('/fapi/v2/positionRisk', 'GET');
    if (!pr.ok || !Array.isArray(pr.data)) {
      console.error('❌ Full liquidation aborted: could not read positions from exchange', pr.data);
      return { closed: 0, failed: ['ACCOUNT_READ_FAILED'] };
    }
    const open = pr.data.filter((p: any) => Math.abs(parseFloat(p.positionAmt)) > 1e-9);
    console.log(`⚡ [EXCHANGE LIQUIDATION] Liquidating ${open.length} positions on Binance...`);
    let closed = 0;
    const failed: string[] = [];
    for (const p of open) {
      const raw: string = p.symbol;
      const asset = (raw.endsWith('USDT') ? `${raw.slice(0, -4)}/USDT` : raw) as AssetSymbol;
      const r = await this.closePositionDirectlyOnBinance(asset);
      if (r.success) closed++; else failed.push(raw);
    }
    return { closed, failed };
  }

  public async liquidateAllExchangePositions(): Promise<number> {
    const res = await this.closeAllPositionsOnExchange();
    return res.closed;
  }

  public async cancelAllOrders(reason: string = 'Emergency KillSwitch activated', activeSymbols: string[] = []): Promise<number> {
    let cancelled = 0;

    // 1. If executing on exchange, send DELETE /fapi/v1/allOpenOrders across all active symbols
    if (this.executionMode !== 'PAPER' && this.apiKey && this.apiSecret) {
      const symbolsToCancel = new Set<string>(activeSymbols);
      for (const order of this.getActiveOrders()) {
        symbolsToCancel.add(order.symbol);
      }
      for (const sym of symbolsToCancel) {
        try {
          await this.cancelAllOpenOrdersForSymbol(sym);
        } catch (e) {
          console.error(`❌ Failed to cancel exchange orders for ${sym}:`, e);
        }
      }
    }

    // 2. Cancel all tracked active orders in FSM
    for (const order of this.getActiveOrders()) {
      if (this.fsm.canTransition(order.status, 'CANCELLED')) {
        this.fsm.transition(order, 'CANCELLED', reason);
        this.notifyOrder(order);
        cancelled++;
      }
    }
    return cancelled;
  }

  private notifyOrder(order: Order) {
    this.listeners.forEach((fn) => fn({ ...order }));
  }
}
