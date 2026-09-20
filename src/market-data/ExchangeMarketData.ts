/**
 * Basel Quantum Algorithmic Trading System
 * Exchange Market Data Stream & Synthetic/Live Data Bridge
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AssetSymbol, Candle, ExecutionMode, Tick, getBinanceWsUrl, normalizeExecutionMode } from '../domain/types';
import { OrderBookBuilder } from './OrderBookBuilder';

export interface SymbolConfig {
  symbol: AssetSymbol;
  basePrice: number;
  volatilityDaily: number;
  meanReversionSpeed: number; // Ornstein-Uhlenbeck theta
  equilibriumMean: number;
  tickSize: number;
  lotSize: number;
}

export const DEFAULT_SYMBOLS: Record<AssetSymbol, SymbolConfig> = {
  'BTC/USDT': {
    symbol: 'BTC/USDT',
    basePrice: 80800.0,
    volatilityDaily: 0.045,
    meanReversionSpeed: 0.18,
    equilibriumMean: 80800.0,
    tickSize: 0.1,
    lotSize: 0.001,
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    basePrice: 2150.0,
    volatilityDaily: 0.055,
    meanReversionSpeed: 0.22,
    equilibriumMean: 2150.0,
    tickSize: 0.01,
    lotSize: 0.01,
  },
  'SOL/USDT': {
    symbol: 'SOL/USDT',
    basePrice: 135.0,
    volatilityDaily: 0.075,
    meanReversionSpeed: 0.30,
    equilibriumMean: 135.0,
    tickSize: 0.01,
    lotSize: 0.1,
  },
  'QNT/USDT': {
    symbol: 'QNT/USDT',
    basePrice: 64.0,
    volatilityDaily: 0.060,
    meanReversionSpeed: 0.25,
    equilibriumMean: 64.0,
    tickSize: 0.01,
    lotSize: 0.1,
  },
  'NVDA/USD': {
    symbol: 'NVDA/USD',
    basePrice: 138.7,
    volatilityDaily: 0.040,
    meanReversionSpeed: 0.15,
    equilibriumMean: 137.5,
    tickSize: 0.01,
    lotSize: 1,
  },
  'AAPL/USD': {
    symbol: 'AAPL/USD',
    basePrice: 228.6,
    volatilityDaily: 0.025,
    meanReversionSpeed: 0.12,
    equilibriumMean: 227.0,
    tickSize: 0.01,
    lotSize: 1,
  },
};

export class ExchangeMarketData extends EventEmitter {
  private currentPrices: Map<AssetSymbol, number> = new Map();
  private lastUpdateTimes: Map<AssetSymbol, number> = new Map();
  private hawkesIntensity: Map<AssetSymbol, number> = new Map();
  private candleHistory: Map<AssetSymbol, Candle[]> = new Map();
  private orderBookBuilder: OrderBookBuilder;
  private tickListeners: Set<(tick: Tick) => void> = new Set();
  
  // Simulated streaming timer fallback
  private intervalId: any = null;
  private isRunning: boolean = false;
  private tradeCounter: number = 0;

  // Live WebSocket variables
  private marketWs: WebSocket | null = null;
  private depthWs: WebSocket | null = null;
  private executionMode: string;
  private activeCryptoSymbols: AssetSymbol[] = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT'];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(orderBookBuilder?: OrderBookBuilder, activeSymbols?: AssetSymbol[]) {
    super();
    this.orderBookBuilder = orderBookBuilder || new OrderBookBuilder(10);
    const hasApiKey = !!process.env.EXCHANGE_API_KEY;
    this.executionMode = normalizeExecutionMode(process.env.EXECUTION_MODE, hasApiKey);
    if (activeSymbols && activeSymbols.length > 0) {
      this.activeCryptoSymbols = activeSymbols.filter(s => s.endsWith('/USDT'));
    }
    this.initializeState();
  }

  private initializeState() {
    for (const [symbol, config] of Object.entries(DEFAULT_SYMBOLS) as [AssetSymbol, SymbolConfig][]) {
      this.currentPrices.set(symbol, config.basePrice);
      this.hawkesIntensity.set(symbol, 1.0);
      this.orderBookBuilder.initialize(symbol, config.basePrice);

      // Generate 60 initial 1-minute historical candles
      const candles: Candle[] = [];
      let p = config.basePrice * 0.98;
      const now = Date.now();
      for (let i = 60; i >= 0; i--) {
        const cTime = now - i * 60 * 1000;
        const drift = (config.equilibriumMean - p) * 0.05;
        const noise = (Math.random() - 0.49) * p * 0.003;
        const open = p;
        p = Math.max(1, p + drift + noise);
        const high = Math.max(open, p) + Math.random() * p * 0.002;
        const low = Math.min(open, p) - Math.random() * p * 0.002;
        const close = p;
        const volume = Number((Math.random() * 50 + 10).toFixed(2));
        candles.push({
          timestamp: cTime,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume,
          vwap: Number(((open + high + low + close) / 4).toFixed(2)),
        });
      }
      this.candleHistory.set(symbol, candles);
    }
  }

  public getOrderBookBuilder(): OrderBookBuilder {
    return this.orderBookBuilder;
  }

  public getPrice(symbol: AssetSymbol): number {
    return this.currentPrices.get(symbol) || DEFAULT_SYMBOLS[symbol].basePrice;
  }

  public getLastUpdateTime(symbol: AssetSymbol): number {
    return this.lastUpdateTimes.get(symbol) || Date.now();
  }

  public getAllPrices(): Record<AssetSymbol, number> {
    const res: Partial<Record<AssetSymbol, number>> = {};
    for (const [sym, price] of this.currentPrices.entries()) {
      res[sym] = price;
    }
    return res as Record<AssetSymbol, number>;
  }

  public getCandles(symbol: AssetSymbol): Candle[] {
    return this.candleHistory.get(symbol) || [];
  }

  public subscribeTicks(listener: (tick: Tick) => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  public async backfillRealCandles(symbols?: AssetSymbol[]): Promise<void> {
    const targetSymbols = (symbols && symbols.length > 0 ? symbols : this.activeCryptoSymbols)
      .filter(s => s.endsWith('/USDT'));
    const baseUrl = this.executionMode === 'TESTNET' ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';

    const primarySymbols = targetSymbols.slice(0, 8);
    console.log(`📥 ExchangeMarketData: Backfilling real historical candles for ${primarySymbols.join(', ')}...`);

    await Promise.all(primarySymbols.map(async (sym) => {
      const binanceSym = sym.replace('/', '').toUpperCase();
      try {
        const res = await fetch(`${baseUrl}/fapi/v1/klines?symbol=${binanceSym}&interval=1m&limit=100`);
        if (!res.ok) {
          console.warn(`⚠️ ExchangeMarketData: Could not fetch candles for ${sym}: HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const candles: Candle[] = data.map((k: any) => ({
            timestamp: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            vwap: parseFloat(k[7]) > 0 && parseFloat(k[5]) > 0 ? parseFloat(k[7]) / parseFloat(k[5]) : parseFloat(k[4])
          }));
          this.candleHistory.set(sym, candles);
          const latestPrice = candles[candles.length - 1].close;
          this.currentPrices.set(sym, latestPrice);
          this.lastUpdateTimes.set(sym, Date.now());
          this.orderBookBuilder.initialize(sym, latestPrice);
          this.emit('market_update', sym);
          console.log(`✅ ExchangeMarketData: Loaded ${candles.length} real candles for ${sym} (Latest Price: $${latestPrice})`);
        }
      } catch (err: any) {
        console.warn(`⚠️ ExchangeMarketData: Failed to backfill candles for ${sym}:`, err.message);
      }
    }));
  }

  public startStreaming(tickRateMs: number = 300, activeSymbols?: AssetSymbol[]) {
    if (this.isRunning) return;
    this.isRunning = true;

    if (activeSymbols && activeSymbols.length > 0) {
      this.activeCryptoSymbols = activeSymbols.filter(s => s.endsWith('/USDT'));
    }

    console.log(`🌐 ExchangeMarketData: Connecting to live Binance WebSocket market data streams for ${this.activeCryptoSymbols.join(', ')}...`);
    this.startWebSocketStreaming();

    // Fallback heartbeat timer: keeps system health metrics and any non-crypto assets alive
    this.intervalId = setInterval(() => {
      // Check if market data is stale (> 10 seconds since last live update)
      const now = Date.now();
      let hasLiveFeed = false;
      for (const sym of this.activeCryptoSymbols) {
        const lastUp = this.lastUpdateTimes.get(sym) || 0;
        if (now - lastUp < 10000) {
          hasLiveFeed = true;
          break;
        }
      }
      // If live feed is disconnected or in offline sandbox, run gentle fallback ticks
      if (!hasLiveFeed) {
        this.generateNextTicks();
      }
    }, tickRateMs);
  }

  public stopStreaming() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.marketWs) {
      this.marketWs.close();
      this.marketWs = null;
    }
    if (this.depthWs) {
      this.depthWs.close();
      this.depthWs = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    console.log('🔴 ExchangeMarketData: Stopped.');
  }

  // --- Binance Live Multi-Stream Integration ---
  private startWebSocketStreaming() {
    const rawPairs = this.activeCryptoSymbols.map(s => s.replace('/', '').toLowerCase());
    if (rawPairs.length === 0) return;

    const baseWsHost = this.executionMode === 'TESTNET' ? 'wss://fstream.binancefuture.com' : 'wss://fstream.binance.com';

    // 1. Regular market data streams: aggTrade & kline_1m (routed through /market/)
    const marketStreams = rawPairs.flatMap(symbol => [
      `${symbol}@aggTrade`,
      `${symbol}@kline_1m`
    ]).join('/');
    const marketUrl = `${baseWsHost}/market/stream?streams=${marketStreams}`;

    // 2. High-frequency OrderBook depth stream: depth10@100ms (routed through /public/)
    const depthStreams = rawPairs.map(symbol => `${symbol}@depth10@100ms`).join('/');
    const depthUrl = `${baseWsHost}/public/stream?streams=${depthStreams}`;

    this.connectMarketWs(marketUrl);
    this.connectDepthWs(depthUrl);
  }

  private connectMarketWs(url: string) {
    if (this.marketWs) {
      try { this.marketWs.close(); } catch (e) {}
    }

    try {
      this.marketWs = new WebSocket(url);

      this.marketWs.on('open', () => {
        console.log(`✅ ExchangeMarketData: Connected to Binance Futures live trade & kline stream`);
      });

      this.marketWs.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleWebSocketMessage(msg);
        } catch (e) {
          console.error('❌ ExchangeMarketData: Error parsing market message', e);
        }
      });

      this.marketWs.on('close', () => {
        if (this.isRunning) {
          console.log('⚠️ ExchangeMarketData: Market WebSocket closed. Reconnecting in 5s...');
          this.scheduleReconnect();
        }
      });

      this.marketWs.on('error', (err) => {
        console.warn('⚠️ ExchangeMarketData: Market WebSocket warning:', err.message);
      });
    } catch (err: any) {
      console.warn('⚠️ ExchangeMarketData: Could not open market WS:', err.message);
    }
  }

  private connectDepthWs(url: string) {
    if (this.depthWs) {
      try { this.depthWs.close(); } catch (e) {}
    }

    try {
      this.depthWs = new WebSocket(url);

      this.depthWs.on('open', () => {
        console.log(`✅ ExchangeMarketData: Connected to Binance Futures live L2 depth stream`);
      });

      this.depthWs.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleWebSocketMessage(msg);
        } catch (e) {
          console.error('❌ ExchangeMarketData: Error parsing depth message', e);
        }
      });

      this.depthWs.on('close', () => {
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });

      this.depthWs.on('error', (err) => {
        console.warn('⚠️ ExchangeMarketData: Depth WebSocket warning:', err.message);
      });
    } catch (err: any) {
      console.warn('⚠️ ExchangeMarketData: Could not open depth WS:', err.message);
    }
  }

  private handleWebSocketMessage(msg: any) {
    const stream = msg.stream;
    const data = msg.data;

    if (!stream || !data) return;

    // Convert raw Binance symbol (e.g. BTCUSDT) to System Symbol (BTC/USDT)
    const rawSym = data.s || (data.k && data.k.s);
    if (!rawSym) return;
    const symbol = this.toSystemSymbol(rawSym);

    // 1. OrderBook L2 Depth Update
    if (stream.includes('@depth')) {
      const bids = data.b || data.bids;
      const asks = data.a || data.asks;
      if (bids && asks) {
        this.orderBookBuilder.update(symbol, bids, asks);
        this.emit('market_update', symbol);
      }
    }

    // 2. Candlestick Kline Update
    if (stream.includes('@kline') && data.k) {
      const candle: Candle = {
        timestamp: data.k.t,
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c),
        volume: parseFloat(data.k.v),
        vwap: parseFloat(data.k.V) > 0 && parseFloat(data.k.v) > 0 
          ? parseFloat(data.k.V) / parseFloat(data.k.v) 
          : parseFloat(data.k.c)
      };

      if (!this.candleHistory.has(symbol)) {
        this.candleHistory.set(symbol, []);
      }
      const candlesArr = this.candleHistory.get(symbol)!;
      const lastCandle = candlesArr[candlesArr.length - 1];

      if (lastCandle && lastCandle.timestamp === candle.timestamp) {
        candlesArr[candlesArr.length - 1] = candle;
      } else {
        candlesArr.push(candle);
        if (candlesArr.length > 120) candlesArr.shift();
      }

      this.currentPrices.set(symbol, candle.close);
      this.lastUpdateTimes.set(symbol, Date.now());
      
      this.emit('market_update', symbol);
      if (data.k.x) {
        this.emit('candle_close', symbol, candle);
      }
    }

    // 3. Trade Ticks Update
    if (stream.includes('@aggTrade')) {
      const tickPrice = parseFloat(data.p);
      const tickSize = parseFloat(data.q);
      const side = data.m ? 'sell' : 'buy';

      this.currentPrices.set(symbol, tickPrice);
      this.lastUpdateTimes.set(symbol, Date.now());

      const tick: Tick = {
        symbol,
        price: tickPrice,
        size: tickSize,
        side,
        timestamp: data.T,
        tradeId: data.a ? data.a.toString() : `TICK-${Date.now()}`
      };

      // Reconstruct orderbook from tick
      this.orderBookBuilder.processTick(tick);

      // Trigger listeners
      this.tickListeners.forEach((fn) => fn(tick));
      
      this.emit('market_update', symbol);
    }
  }

  private toSystemSymbol(binanceSymbol: string): AssetSymbol {
    const upper = binanceSymbol.toUpperCase();
    if (upper.endsWith('USDT')) {
      return `${upper.slice(0, -4)}/USDT` as AssetSymbol;
    }
    if (upper.endsWith('BUSD')) {
      return `${upper.slice(0, -4)}/BUSD` as AssetSymbol;
    }
    if (upper.endsWith('USD')) {
      return `${upper.slice(0, -3)}/USD` as AssetSymbol;
    }
    return upper as AssetSymbol;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isRunning) {
        this.startWebSocketStreaming();
      }
    }, 5000);
  }

  // --- End of Binance Live Integration ---

  public generateNextTicks(): Tick[] {
    const symbols = Object.keys(DEFAULT_SYMBOLS) as AssetSymbol[];
    const ticks: Tick[] = [];

    for (const symbol of symbols) {
      const config = DEFAULT_SYMBOLS[symbol];
      const prevPrice = this.currentPrices.get(symbol) || config.basePrice;
      const intensity = this.hawkesIntensity.get(symbol) || 1.0;

      const dt = 1 / 3600;
      const ouDrift = config.meanReversionSpeed * (config.equilibriumMean - prevPrice) * dt;
      const sigma = (config.volatilityDaily / Math.sqrt(24)) * Math.sqrt(intensity);
      const brownian = sigma * prevPrice * this.boxMullerRandom();

      let jump = 0;
      if (Math.random() < 0.02) {
        jump = (Math.random() - 0.5) * prevPrice * 0.015;
        this.hawkesIntensity.set(symbol, intensity + 3.0);
      } else {
        this.hawkesIntensity.set(symbol, Math.max(1.0, intensity * 0.96));
      }

      let newPrice = prevPrice + ouDrift + brownian + jump;
      newPrice = Math.max(0.1, Number(newPrice.toFixed(newPrice > 100 ? 2 : 4)));
      this.currentPrices.set(symbol, newPrice);

      const side = newPrice >= prevPrice ? 'buy' : 'sell';
      const size = Number((Math.random() * 1.5 + 0.1).toFixed(3));
      this.tradeCounter += 1;

      const tick: Tick = {
        symbol,
        price: newPrice,
        size,
        side,
        timestamp: Date.now(),
        tradeId: `TICK-${this.tradeCounter}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      };

      this.orderBookBuilder.processTick(tick);
      this.updateCandles(symbol, newPrice, size);

      ticks.push(tick);
      this.tickListeners.forEach((fn) => fn(tick));
      this.emit('market_update', symbol);
    }

    return ticks;
  }

  private updateCandles(symbol: AssetSymbol, price: number, size: number) {
    const candles = this.candleHistory.get(symbol);
    if (!candles || candles.length === 0) return;

    const lastCandle = candles[candles.length - 1];
    const now = Date.now();
    const isNewMinute = now - lastCandle.timestamp >= 60 * 1000;

    if (isNewMinute) {
      const newCandle: Candle = {
        timestamp: now,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size,
        vwap: price,
      };
      candles.push(newCandle);
      if (candles.length > 120) candles.shift();
    } else {
      lastCandle.high = Math.max(lastCandle.high, price);
      lastCandle.low = Math.min(lastCandle.low, price);
      lastCandle.close = price;
      lastCandle.volume = Number((lastCandle.volume + size).toFixed(3));
      lastCandle.vwap = Number(((lastCandle.open + lastCandle.high + lastCandle.low + lastCandle.close) / 4).toFixed(2));
    }
  }

  private boxMullerRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public injectStressEvent(priceDropPct: number, volatilityMult: number, symbols?: AssetSymbol[]) {
    const targetSymbols = symbols || (Object.keys(DEFAULT_SYMBOLS) as AssetSymbol[]);
    for (const sym of targetSymbols) {
      const curr = this.currentPrices.get(sym) || DEFAULT_SYMBOLS[sym].basePrice;
      const dropped = curr * (1 - priceDropPct / 100);
      this.currentPrices.set(sym, Number(dropped.toFixed(2)));
      this.hawkesIntensity.set(sym, volatilityMult);
      this.orderBookBuilder.initialize(sym, dropped, 20 * volatilityMult);
    }
  }
}
