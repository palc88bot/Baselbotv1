/**
 * Basel Quantum Algorithmic Trading System
 * Binance Futures User Data Stream & Real-Time Portfolio State Engine
 */

import crypto from 'crypto';
import WebSocket from 'ws';
import { AccountBalance, AssetSymbol, Fill, Position } from '../domain/types';

type EventCallback = (type: 'balance_update' | 'position_update' | 'order_update', data: any) => void;

export class UserDataStream {
  private executionMode: string;
  private apiKey: string;
  private apiSecret: string;
  private apiBaseUrl: string;
  private wsUrl: string;
  
  private ws: WebSocket | null = null;
  private listenKey: string = '';
  private listenKeyTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  private balance: AccountBalance;
  private positions: Map<AssetSymbol, Position> = new Map();
  private fillsHistory: Fill[] = [];
  
  private onEvent?: EventCallback;
  private isRunning: boolean = false;
  private balanceListeners: Set<(b: AccountBalance) => void> = new Set();
  private fillListeners: Set<(f: Fill) => void> = new Set();

  constructor(initialCapital: number = 0, onEvent?: EventCallback) {
    this.onEvent = onEvent;
    this.apiKey = process.env.EXCHANGE_API_KEY || '';
    this.apiSecret = process.env.EXCHANGE_API_SECRET || '';
    this.executionMode = process.env.EXECUTION_MODE || (this.apiKey ? 'TESTNET' : 'PAPER');
    
    // Default 10k for PAPER and initial fallback for others to prevent zeroed UI on boot
    const startBalance = initialCapital > 0 ? initialCapital : 10000;

    this.apiBaseUrl = this.executionMode === 'LIVE' ? 'https://fapi.binance.com' : 'https://testnet.binancefuture.com';
    this.wsUrl = this.executionMode === 'LIVE' ? 'wss://fstream.binance.com/ws' : 'wss://fstream.binancefuture.com/ws';

    this.balance = {
      totalEquity: startBalance,
      availableCash: startBalance,
      usedMargin: 0,
      marginLevel: 999.0,
      freeMargin: startBalance,
      unrealizedPnl: 0,
      realizedPnl: 0,
      dailyPnl: 0,
      dailyPnlPct: 0,
      currency: 'USDT',
    };
  }

  public getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    if (this.executionMode === 'PAPER') {
      console.log('📝 UserDataStream: Running in PAPER simulation mode.');
      return;
    }

    console.log(`🌐 UserDataStream: Starting connection to Binance Futures (${this.executionMode})...`);
    try {
      // Fetch initial account balance & positions from Binance REST API on startup
      await this.fetchInitialAccountData();

      await this.getListenKey();
      this.connectWebSocket();
      this.startListenKeyKeepAlive();
    } catch (error) {
      console.error('❌ UserDataStream: Failed to start Binance stream, falling back to simulation state.', error);
      this.scheduleReconnect();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.ws) this.ws.close();
    if (this.listenKeyTimer) clearInterval(this.listenKeyTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    console.log('🔴 UserDataStream: Stopped.');
  }

  public getBalance(): AccountBalance {
    return { ...this.balance };
  }

  public getPositions(): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.size !== 0);
  }

  public getPosition(symbol: AssetSymbol): Position | undefined {
    return this.positions.get(symbol);
  }

  public getFills(): Fill[] {
    return [...this.fillsHistory];
  }

  public subscribeBalance(listener: (b: AccountBalance) => void): () => void {
    this.balanceListeners.add(listener);
    return () => this.balanceListeners.delete(listener);
  }

  public subscribeFills(listener: (f: Fill) => void): () => void {
    this.fillListeners.add(listener);
    return () => this.fillListeners.delete(listener);
  }

  public processFill(fill: Fill, currentPrice: number) {
    this.fillsHistory.unshift(fill);
    if (this.fillsHistory.length > 500) this.fillsHistory.pop();
    
    for (const l of this.fillListeners) l(fill);

    let pos = this.positions.get(fill.symbol);
    if (!pos) {
      pos = {
        symbol: fill.symbol,
        size: 0,
        entryPrice: fill.price,
        currentPrice,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
        marginUsed: 0,
        liquidationPrice: 0,
        leverage: 1.0,
        updatedAt: fill.timestamp,
      };
      this.positions.set(fill.symbol, pos);
    }

    const tradeSize = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    const oldSize = pos.size;
    const newSize = Number((oldSize + tradeSize).toFixed(4));
    pos.size = newSize;
    pos.currentPrice = currentPrice;

    if ((oldSize > 0 && tradeSize < 0) || (oldSize < 0 && tradeSize > 0)) {
      const closingQty = Math.min(Math.abs(oldSize), Math.abs(tradeSize));
      const pnlPerUnit = oldSize > 0 ? fill.price - pos.entryPrice : pos.entryPrice - fill.price;
      const realized = closingQty * pnlPerUnit - fill.commission;

      pos.realizedPnl += realized;
      this.balance.realizedPnl += realized;
      this.balance.dailyPnl += realized;
      this.balance.availableCash += realized;
    } else if (Math.abs(newSize) > Math.abs(oldSize)) {
      const totalCost = Math.abs(oldSize) * pos.entryPrice + fill.quantity * fill.price;
      pos.entryPrice = Number((totalCost / Math.abs(newSize)).toFixed(4));
    }

    this.balance.availableCash -= fill.commission;
    this.balance.totalEquity = this.balance.availableCash + this.balance.unrealizedPnl;
    
    for (const l of this.balanceListeners) l(this.getBalance());
  }

  private async fetchInitialAccountData() {
    if (!this.apiKey || !this.apiSecret) {
      console.warn('⚠️ UserDataStream: API credentials missing, using simulated initial capital.');
      return;
    }

    try {
      const timestamp = Date.now();
      const recvWindow = 5000;
      const query = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
      const url = `${this.apiBaseUrl}/fapi/v2/account?${query}&signature=${signature}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch account info: ${res.statusText}`);
      }

      const accountInfo = await res.json();
      console.log('✅ UserDataStream: Fetched initial account information from Binance Futures.');

      const wb = parseFloat(accountInfo.totalWalletBalance || '0');
      const up = parseFloat(accountInfo.totalUnrealizedProfit || '0');
      const available = parseFloat(accountInfo.availableBalance || '0');
      
      this.balance = {
        totalEquity: wb + up,
        availableCash: available,
        usedMargin: parseFloat(accountInfo.totalInitialMargin || '0'),
        marginLevel: parseFloat(accountInfo.totalMaintMargin || '0') > 0 
          ? (wb + up) / parseFloat(accountInfo.totalMaintMargin) 
          : 999.0,
        freeMargin: available,
        unrealizedPnl: up,
        realizedPnl: 0,
        dailyPnl: 0,
        dailyPnlPct: 0,
        currency: 'USDT',
      };

      if (accountInfo.positions) {
        accountInfo.positions.forEach((pos: any) => {
          const amount = parseFloat(pos.positionAmt);
          if (amount !== 0) {
            const rawSym = pos.symbol;
            const symbol = rawSym.endsWith('USDT') 
              ? `${rawSym.slice(0, -4)}/USDT` 
              : (rawSym.endsWith('USD') ? `${rawSym.slice(0, -3)}/USD` : rawSym);
            
            this.positions.set(symbol as AssetSymbol, {
              symbol: symbol as AssetSymbol,
              size: amount,
              entryPrice: parseFloat(pos.entryPrice),
              currentPrice: parseFloat(pos.entryPrice),
              unrealizedPnl: parseFloat(pos.unrealizedProfit),
              unrealizedPnlPct: 0,
              realizedPnl: 0,
              marginUsed: Math.abs(amount * parseFloat(pos.entryPrice)) / (parseFloat(pos.leverage) || 20),
              liquidationPrice: parseFloat(pos.liquidationPrice || '0'),
              leverage: parseFloat(pos.leverage) || 20,
              updatedAt: Date.now(),
            });
          }
        });
      }

      for (const l of this.balanceListeners) l(this.getBalance());
    } catch (err) {
      console.error('❌ UserDataStream: Error fetching initial REST account data:', err);
    }
  }

  private async getListenKey() {
    if (!this.apiKey) throw new Error('API Key missing for UserDataStream');
    const response = await fetch(`${this.apiBaseUrl}/fapi/v1/listenKey`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey }
    });
    if (!response.ok) throw new Error('Failed to get ListenKey');
    const data = await response.json();
    this.listenKey = data.listenKey;
    console.log('🔑 UserDataStream: ListenKey acquired.');
  }

  private connectWebSocket() {
    if (this.ws) this.ws.close();
    
    const url = `${this.wsUrl}/${this.listenKey}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('✅ UserDataStream: WebSocket Connected.');
    });

    this.ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('❌ UserDataStream: Error parsing message', e);
      }
    });

    this.ws.on('close', () => {
      console.log('⚠️ UserDataStream: WebSocket Closed.');
      if (this.isRunning) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('❌ UserDataStream: WebSocket Error', err);
    });
  }

  private handleMessage(msg: any) {
    if (msg.e === 'ACCOUNT_UPDATE') {
      const balances = msg.a.B;
      const positions = msg.a.P;

      if (balances) {
        const usdtBalance = balances.find((b: any) => b.a === 'USDT');
        if (usdtBalance) {
          const wb = parseFloat(usdtBalance.wb);
          const up = parseFloat(usdtBalance.up);
          this.balance.availableCash = wb;
          this.balance.unrealizedPnl = up;
          this.balance.totalEquity = wb + up;
          this.balance.freeMargin = wb;
          
          for (const l of this.balanceListeners) l(this.getBalance());
          if (this.onEvent) this.onEvent('balance_update', this.balance);
        }
      }

      if (positions) {
        positions.forEach((pos: any) => {
          const amount = parseFloat(pos.pa);
          const symbol = pos.s.includes('/') ? pos.s : `${pos.s.replace('USDT', '')}/USDT`;
          if (amount !== 0) {
            this.positions.set(symbol as AssetSymbol, {
              symbol: symbol as AssetSymbol,
              size: amount,
              entryPrice: parseFloat(pos.ep),
              currentPrice: parseFloat(pos.ep),
              unrealizedPnl: parseFloat(pos.up),
              unrealizedPnlPct: 0,
              realizedPnl: 0,
              marginUsed: Math.abs(amount * parseFloat(pos.ep)) / 20,
              liquidationPrice: parseFloat(pos.sl || '0'),
              leverage: 20,
              updatedAt: Date.now(),
            });
          } else {
            this.positions.delete(symbol as AssetSymbol);
          }
        });
        if (this.onEvent) this.onEvent('position_update', this.getPositions());
      }
    }

    if (msg.e === 'ORDER_TRADE_UPDATE') {
      const order = msg.o;
      console.log(`📡 Order Update: ${order.s} | ${order.S} | Status: ${order.X} | Filled: ${order.z}`);
      if (this.onEvent) this.onEvent('order_update', order);
    }
  }

  private startListenKeyKeepAlive() {
    this.listenKeyTimer = setInterval(async () => {
      try {
        await fetch(`${this.apiBaseUrl}/fapi/v1/listenKey`, {
          method: 'PUT',
          headers: { 'X-MBX-APIKEY': this.apiKey }
        });
        console.log('🔄 UserDataStream: ListenKey kept alive.');
      } catch (e) {
        console.error('❌ Failed to keep ListenKey alive', e);
      }
    }, 30 * 60 * 1000);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log('⏳ UserDataStream: Reconnecting in 5 seconds...');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.getListenKey();
        this.connectWebSocket();
      } catch (e) {
        this.scheduleReconnect();
      }
    }, 5000);
  }
}
