/**
 * Basel Quantum Algorithmic Trading System
 * Exchange Market Data Stream & Synthetic Jump-Diffusion/Hawkes Generator
 */

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

export class ExchangeMarketData {
  private currentPrices: Map<AssetSymbol, number> = new Map();
  private hawkesIntensity: Map<AssetSymbol, number> = new Map();
  private candleHistory: Map<AssetSymbol, Candle[]> = new Map();
  private orderBookBuilder: OrderBookBuilder;
  private listeners: Set<(tick: Tick) => void> = new Set();
  private intervalId: any = null;
  private isRunning: boolean = false;
  private tradeCounter: number = 0;

  constructor(orderBookBuilder?: OrderBookBuilder) {
    this.orderBookBuilder = orderBookBuilder || new OrderBookBuilder(10);
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
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public startStreaming(tickRateMs: number = 300) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.generateNextTicks();
    }, tickRateMs);
  }

  public stopStreaming() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  public generateNextTicks(): Tick[] {
    const symbols = Object.keys(DEFAULT_SYMBOLS) as AssetSymbol[];
    const ticks: Tick[] = [];

    for (const symbol of symbols) {
      const config = DEFAULT_SYMBOLS[symbol];
      const prevPrice = this.currentPrices.get(symbol) || config.basePrice;
      const intensity = this.hawkesIntensity.get(symbol) || 1.0;

      // Ornstein-Uhlenbeck continuous drift + Brownian motion + Hawkes shock
      const dt = 1 / 3600;
      const ouDrift = config.meanReversionSpeed * (config.equilibriumMean - prevPrice) * dt;
      const sigma = (config.volatilityDaily / Math.sqrt(24)) * Math.sqrt(intensity);
      const brownian = sigma * prevPrice * this.boxMullerRandom();

      // Jump diffusion Poisson jump (rare big move)
      let jump = 0;
      if (Math.random() < 0.02) {
        jump = (Math.random() - 0.5) * prevPrice * 0.015;
        this.hawkesIntensity.set(symbol, intensity + 3.0); // excite Hawkes process
      } else {
        // Hawkes decay
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

      // Process inside orderbook
      this.orderBookBuilder.processTick(tick);
      this.updateCandles(symbol, newPrice, size);

      ticks.push(tick);
      this.listeners.forEach((fn) => fn(tick));
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
