/**
 * Basel Quantum Algorithmic Trading System
 * Exchange Market Data Stream & Synthetic/Live Data Bridge
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AssetSymbol, Candle, Tick } from '../domain/types';
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
    basePrice: 91450.0,
    volatilityDaily: 0.045,
    meanReversionSpeed: 0.18,
    equilibriumMean: 91200.0,
    tickSize: 0.1,
    lotSize: 0.001,
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    basePrice: 3420.5,
    volatilityDaily: 0.055,
    meanReversionSpeed: 0.22,
    equilibriumMean: 3400.0,
    tickSize: 0.01,
    lotSize: 0.01,
  },
  'SOL/USDT': {
    symbol: 'SOL/USDT',
    basePrice: 198.4,
    volatilityDaily: 0.075,
    meanReversionSpeed: 0.30,
    equilibriumMean: 195.0,
    tickSize: 0.01,
    lotSize: 0.1,
  },
  'QNT/USDT': {
    symbol: 'QNT/USDT',
    basePrice: 112.3,
    volatilityDaily: 0.060,
    meanReversionSpeed: 0.25,
    equilibriumMean: 110.0,
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
  private hawkesIntensity: Map<AssetSymbol, number> = new Map();
  private candleHistory: Map<AssetSymbol, Candle[]> = new Map();
  private orderBookBuilder: OrderBookBuilder;
  private tickListeners: Set<(tick: Tick) => void> = new Set();
  
  // Simulated streaming timer
  private intervalId: any = null;
  private isRunning: boolean = false;
  private tradeCounter: number = 0;

  // Live WebSocket variables
  private ws: WebSocket | null = null;
  private executionMode: string;
  private wsUrl: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(orderBookBuilder?: OrderBookBuilder) {
    super();
    this.orderBookBuilder = orderBookBuilder || new OrderBookBuilder(10);
    const hasApiKey = !!process.env.EXCHANGE_API_KEY;
    this.executionMode = process.env.EXECUTION_MODE || (hasApiKey ? 'TESTNET' : 'PAPER');
    this.wsUrl = this.executionMode === 'LIVE' ? 'wss://fstream.binance.com/stream?streams=' : 'wss://fstream.binancefuture.com/stream?streams=';
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

  public startStreaming(tickRateMs: number = 300) {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.executionMode === 'PAPER') {
      console.log('📝 ExchangeMarketData: Running in PAPER simulation mode.');
      this.intervalId = setInterval(() => {
        this.generateNextTicks();
      }, tickRateMs);
    } else {
      console.log(`🌐 ExchangeMarketData: Connecting to live streams via WebSocket (${this.executionMode})...`);
      this.startWebSocketStreaming();
    }
  }

  public stopStreaming() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    console.log('🔴 ExchangeMarketData: Stopped.');
  }

  // --- Binance Live WebSocket Stream Integration ---
  private startWebSocketStreaming() {
    // Map system symbols to lowercase for Binance stream format (e.g. BTC/USDT -> btcusdt)
    const symbols = Object.keys(DEFAULT_SYMBOLS);
    const activeSymbols = symbols.map(s => s.replace('/', '').toLowerCase());
    
    // Build multi-stream URL
    const streams = activeSymbols.flatMap(symbol => [
      `${symbol}@depth20@100ms`, // Orderbook (20 levels, 100ms updates)
      `${symbol}@kline_1m`,      // Candles (1m interval)
      `${symbol}@aggTrade`       // Ticks / Aggregate Trades
    ]).join('/');

    const url = `${this.wsUrl}${streams}`;
    console.log(`📡 ExchangeMarketData: Connecting to streams: ${url}`);
    
    this.connectWebSocket(url);
  }

  private connectWebSocket(url: string) {
    if (this.ws) this.ws.close();

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('✅ ExchangeMarketData: WebSocket connected to Binance Futures ' + this.executionMode);
    });

    this.ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleWebSocketMessage(msg);
      } catch (e) {
        console.error('❌ ExchangeMarketData: Error parsing message', e);
      }
    });

    this.ws.on('close', () => {
      console.log('⚠️ ExchangeMarketData: WebSocket connection closed.');
      if (this.isRunning) {
        this.scheduleReconnect(url);
      }
    });

    this.ws.on('error', (err) => {
      console.error('❌ ExchangeMarketData: WebSocket error', err);
    });
  }

  private handleWebSocketMessage(msg: any) {
    const stream = msg.stream;
    const data = msg.data;

    if (!stream || !data) return;

    // Convert raw Binance symbol (e.g. BTCUSDT) to System Symbol (BTC/USDT)
    const rawSym = data.s || (data.k && data.k.s);
    if (!rawSym) return;
    const symbol = this.toSystemSymbol(rawSym);

    // 1. OrderBook Update
    if (stream.includes('@depth')) {
      if (data.b && data.a) {
        this.orderBookBuilder.update(symbol, data.b, data.a);
        this.emit('market_update', symbol);
      }
    }

    // 2. Candlestick Update
    if (stream.includes('@kline')) {
      const candle: Candle = {
        timestamp: data.k.t,
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c),
        volume: parseFloat(data.k.v),
        vwap: parseFloat(data.k.V) || parseFloat(data.k.c)
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

      // Update last price map too
      this.currentPrices.set(symbol, candle.close);
      
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

      const tick: Tick = {
        symbol,
        price: tickPrice,
        size: tickSize,
        side,
        timestamp: data.T,
        tradeId: data.a.toString()
      };

      // Reconstruct orderbook from tick to keep simulation active for UI
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
    if (upper.endsWith('USD')) {
      return `${upper.slice(0, -3)}/USD` as AssetSymbol;
    }
    return upper as AssetSymbol;
  }

  private scheduleReconnect(url: string) {
    if (this.reconnectTimer) return;
    console.log('⏳ ExchangeMarketData: Reconnecting in 5 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket(url);
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
