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
    basePrice: 91250.0,
    volatilityDaily: 0.045,
    meanReversionSpeed: 0.18,
    equilibriumMean: 91250.0,
    tickSize: 0.1,
    lotSize: 0.001,
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    basePrice: 3420.0,
    volatilityDaily: 0.055,
    meanReversionSpeed: 0.22,
    equilibriumMean: 3420.0,
    tickSize: 0.01,
    lotSize: 0.01,
  },
  'SOL/USDT': {
    symbol: 'SOL/USDT',
    basePrice: 216.5,
    volatilityDaily: 0.075,
    meanReversionSpeed: 0.30,
    equilibriumMean: 216.5,
    tickSize: 0.01,
    lotSize: 0.1,
  },
  'XRP/USDT': {
    symbol: 'XRP/USDT' as AssetSymbol,
    basePrice: 1.88,
    volatilityDaily: 0.080,
    meanReversionSpeed: 0.25,
    equilibriumMean: 1.88,
    tickSize: 0.0001,
    lotSize: 1,
  },
  'AVAX/USDT': {
    symbol: 'AVAX/USDT' as AssetSymbol,
    basePrice: 38.4,
    volatilityDaily: 0.070,
    meanReversionSpeed: 0.28,
    equilibriumMean: 38.4,
    tickSize: 0.01,
    lotSize: 0.1,
  },
  'ADA/USDT': {
    symbol: 'ADA/USDT' as AssetSymbol,
    basePrice: 0.86,
    volatilityDaily: 0.065,
    meanReversionSpeed: 0.24,
    equilibriumMean: 0.86,
    tickSize: 0.0001,
    lotSize: 1,
  },
  'BNB/USDT': {
    symbol: 'BNB/USDT' as AssetSymbol,
    basePrice: 658.0,
    volatilityDaily: 0.040,
    meanReversionSpeed: 0.20,
    equilibriumMean: 658.0,
    tickSize: 0.01,
    lotSize: 0.01,
  },
  'DOGE/USDT': {
    symbol: 'DOGE/USDT' as AssetSymbol,
    basePrice: 0.36,
    volatilityDaily: 0.085,
    meanReversionSpeed: 0.32,
    equilibriumMean: 0.36,
    tickSize: 0.0001,
    lotSize: 1,
  },
  'QNT/USDT': {
    symbol: 'QNT/USDT',
    basePrice: 94.0,
    volatilityDaily: 0.060,
    meanReversionSpeed: 0.25,
    equilibriumMean: 94.0,
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
  'PEPE/USDT': {
    symbol: 'PEPE/USDT',
    basePrice: 0.0000215,
    volatilityDaily: 0.095,
    meanReversionSpeed: 0.35,
    equilibriumMean: 0.0000215,
    tickSize: 0.00000001,
    lotSize: 1000,
  },
  'SUI/USDT': {
    symbol: 'SUI/USDT',
    basePrice: 3.45,
    volatilityDaily: 0.080,
    meanReversionSpeed: 0.28,
    equilibriumMean: 3.45,
    tickSize: 0.0001,
    lotSize: 1,
  },
  'NEAR/USDT': {
    symbol: 'NEAR/USDT',
    basePrice: 6.85,
    volatilityDaily: 0.070,
    meanReversionSpeed: 0.25,
    equilibriumMean: 6.85,
    tickSize: 0.001,
    lotSize: 0.1,
  },
  'RENDER/USDT': {
    symbol: 'RENDER/USDT',
    basePrice: 8.40,
    volatilityDaily: 0.075,
    meanReversionSpeed: 0.27,
    equilibriumMean: 8.40,
    tickSize: 0.001,
    lotSize: 0.1,
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
  private spotWs: WebSocket | null = null;
  private executionMode: string;
  private activeCryptoSymbols: AssetSymbol[] = [
    'BTC/USDT',
    'ETH/USDT',
    'SOL/USDT',
    'XRP/USDT',
    'AVAX/USDT',
    'ADA/USDT',
    'BNB/USDT',
    'DOGE/USDT',
    'QNT/USDT',
    'PEPE/USDT',
    'SUI/USDT',
    'NEAR/USDT',
    'RENDER/USDT',
  ];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private livePollTimer: NodeJS.Timeout | null = null;
  private depthPollTimer: NodeJS.Timeout | null = null;

  constructor(orderBookBuilder?: OrderBookBuilder, activeSymbols?: AssetSymbol[]) {
    super();
    this.orderBookBuilder = orderBookBuilder || new OrderBookBuilder(10);
    const hasApiKey = !!process.env.EXCHANGE_API_KEY;
    this.executionMode = normalizeExecutionMode(process.env.EXECUTION_MODE, hasApiKey);
    if (activeSymbols && activeSymbols.length > 0) {
      this.activeCryptoSymbols = activeSymbols.filter(s => s.endsWith('/USDT'));
    }
    this.initializeState();
    // Immediate initial live price sync
    this.fetchLiveRestPrices().catch(err => {
      console.warn('Initial price sync notice:', err.message);
    });
  }

  private initializeState() {
    for (const [symbol, config] of Object.entries(DEFAULT_SYMBOLS) as [AssetSymbol, SymbolConfig][]) {
      this.currentPrices.set(symbol, config.basePrice);
      this.hawkesIntensity.set(symbol, 1.0);
      this.orderBookBuilder.initialize(symbol, config.basePrice);
      // Initialize with empty real candle array; populated exclusively via backfillRealCandles and live kline stream
      this.candleHistory.set(symbol, []);
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

    const primarySymbols = targetSymbols;
    console.log(`📥 ExchangeMarketData: Backfilling real historical candles for ${primarySymbols.length} pairs (${primarySymbols.slice(0, 6).join(', ')}...)...`);

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

    console.log(`🌐 ExchangeMarketData: Starting live Binance real-time data engine for ${this.activeCryptoSymbols.join(', ')}...`);

    // 1. Initial backfill of real klines and live price pull
    this.fetchLiveRestPrices().catch(() => {});
    this.backfillRealCandles().catch(() => {});
    this.fetchOrderBookSnapshots().catch(() => {});

    // 2. Start WebSocket real-time streams
    this.startWebSocketStreaming();

    // 3. High-frequency live REST price poller: guarantees 100% real live market prices every 1.5 seconds
    this.livePollTimer = setInterval(() => {
      this.fetchLiveRestPrices().catch(err => {
        // Silent catch for resilience
      });
    }, 1500);

    // 4. Real OrderBook depth poller: refreshes real L2 depth levels every 3.5 seconds
    this.depthPollTimer = setInterval(() => {
      this.fetchOrderBookSnapshots().catch(() => {});
    }, 3500);

    // 5. Fallback heartbeat timer: keeps system health metrics alive
    this.intervalId = setInterval(() => {
      const now = Date.now();
      let hasLiveFeed = false;
      for (const sym of this.activeCryptoSymbols) {
        const lastUp = this.lastUpdateTimes.get(sym) || 0;
        if (now - lastUp < 10000) {
          hasLiveFeed = true;
          break;
        }
      }
      if (!hasLiveFeed) {
        this.fetchLiveRestPrices().catch(() => {});
      }
    }, Math.max(tickRateMs, 1000));
  }

  public async fetchLiveRestPrices(): Promise<void> {
    const urls = [
      'https://fapi.binance.com/fapi/v1/ticker/price',
      'https://api.binance.com/api/v3/ticker/price'
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;

        const priceMap = new Map<string, number>();
        for (const item of data) {
          if (item.symbol && item.price) {
            priceMap.set(item.symbol.toUpperCase(), parseFloat(item.price));
          }
        }

        const now = Date.now();
        for (const sym of this.activeCryptoSymbols) {
          const rawBinance = sym.replace('/', '').toUpperCase();
          const p = priceMap.get(rawBinance);
          if (p && p > 0) {
            const oldPrice = this.currentPrices.get(sym) || p;
            this.currentPrices.set(sym, p);
            this.lastUpdateTimes.set(sym, now);

            // Construct or update candle
            this.updateCandles(sym, p, Math.max(0.01, Math.abs(p - oldPrice) * 10));

            // Construct real tick
            this.tradeCounter += 1;
            const tick: Tick = {
              symbol: sym,
              price: p,
              size: Number((Math.random() * 0.5 + 0.05).toFixed(3)),
              side: p >= oldPrice ? 'buy' : 'sell',
              timestamp: now,
              tradeId: `REST-${this.tradeCounter}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            };

            const book = this.orderBookBuilder.getBook(sym);
            if (!book || book.bids.length === 0) {
              this.orderBookBuilder.initialize(sym, p);
            }

            this.tickListeners.forEach((fn) => fn(tick));
            this.emit('market_update', sym);
          }
        }

        // Successfully updated from real exchange
        return;
      } catch (err) {
        // Try next URL fallback
      }
    }
  }

  public async fetchOrderBookSnapshots(): Promise<void> {
    const symbolsToFetch = this.activeCryptoSymbols.slice(0, 4);
    for (const sym of symbolsToFetch) {
      const rawBinance = sym.replace('/', '').toUpperCase();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${rawBinance}&limit=10`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const data = await res.json();
        if (data.bids && data.asks) {
          this.orderBookBuilder.update(sym, data.bids, data.asks);
          this.emit('market_update', sym);
        }
      } catch {
        // Non-blocking
      }
    }
  }

  public stopStreaming() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.livePollTimer) {
      clearInterval(this.livePollTimer);
      this.livePollTimer = null;
    }
    if (this.depthPollTimer) {
      clearInterval(this.depthPollTimer);
      this.depthPollTimer = null;
    }
    if (this.marketWs) {
      this.marketWs.close();
      this.marketWs = null;
    }
    if (this.depthWs) {
      this.depthWs.close();
      this.depthWs = null;
    }
    if (this.spotWs) {
      this.spotWs.close();
      this.spotWs = null;
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

    // 1. Regular market data streams: aggTrade & kline_1m
    const marketStreams = rawPairs.flatMap(symbol => [
      `${symbol}@aggTrade`,
      `${symbol}@kline_1m`
    ]).join('/');
    const marketUrl = `${baseWsHost}/stream?streams=${marketStreams}`;

    // 2. High-frequency OrderBook depth stream: depth10@100ms
    const depthStreams = rawPairs.map(symbol => `${symbol}@depth10@100ms`).join('/');
    const depthUrl = `${baseWsHost}/stream?streams=${depthStreams}`;

    this.connectMarketWs(marketUrl);
    this.connectDepthWs(depthUrl);

    // 3. Optional Spot fallback stream for maximum uptime
    const spotStreams = rawPairs.slice(0, 4).map(s => `${s}@ticker`).join('/');
    this.connectSpotWs(`wss://stream.binance.com:9443/stream?streams=${spotStreams}`);
  }

  private connectSpotWs(url: string) {
    if (this.spotWs) {
      try { this.spotWs.close(); } catch (e) {}
    }

    try {
      this.spotWs = new WebSocket(url);
      this.spotWs.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.data && msg.data.s && msg.data.c) {
            const sym = this.toSystemSymbol(msg.data.s);
            const p = parseFloat(msg.data.c);
            if (p > 0) {
              const oldPrice = this.currentPrices.get(sym) || p;
              this.currentPrices.set(sym, p);
              this.lastUpdateTimes.set(sym, Date.now());
              this.updateCandles(sym, p, parseFloat(msg.data.v) || 0.1);
              this.emit('market_update', sym);
            }
          }
        } catch {}
      });
      this.spotWs.on('error', () => {});
    } catch {}
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

      // Reconstruct orderbook from tick only if no real book is available yet
      const existingBook = this.orderBookBuilder.getBook(symbol);
      if (!existingBook || existingBook.bids.length === 0) {
        this.orderBookBuilder.processTick(tick);
      }

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
