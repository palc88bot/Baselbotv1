/**
 * Basel Quantum Algorithmic Trading System
 * Binance Futures User Data Stream & Real-Time Portfolio State Engine
 */

import crypto from 'crypto';
import WebSocket from 'ws';
import { AccountBalance, AssetSymbol, ExecutionMode, Fill, Position, getBinanceBaseUrl, getBinanceWsUrl, normalizeExecutionMode } from '../domain/types';

type EventCallback = (type: 'balance_update' | 'position_update' | 'order_update' | 'position_closed', data: any) => void;

export class UserDataStream {
  private executionMode: ExecutionMode;
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
  private closedListeners: Set<(s: AssetSymbol) => void> = new Set();
  private orderTradeListeners: Set<(o: any) => void> = new Set();

  constructor(initialCapital: number = 0, onEvent?: EventCallback) {
    this.onEvent = onEvent;
    this.apiKey = process.env.EXCHANGE_API_KEY || '';
    this.apiSecret = process.env.EXCHANGE_API_SECRET || '';
    this.executionMode = normalizeExecutionMode(process.env.EXECUTION_MODE, !!this.apiKey);
    
    // Default 10k for PAPER and initial fallback for others to prevent zeroed UI on boot
    const startBalance = initialCapital > 0 ? initialCapital : 10000;

    this.apiBaseUrl = getBinanceBaseUrl(this.executionMode);
    this.wsUrl = `${getBinanceWsUrl(this.executionMode)}/ws`;

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

  public getBalance(): AccountBalance {
    const rawBal = this.balance;
    const totalEq = Number.isFinite(rawBal.totalEquity) ? rawBal.totalEquity : (Number.isFinite(rawBal.availableCash) ? rawBal.availableCash : 10000);
    const availCash = Number.isFinite(rawBal.availableCash) ? rawBal.availableCash : totalEq;
    const unPnl = Number.isFinite(rawBal.unrealizedPnl) ? rawBal.unrealizedPnl : 0;
    
    return {
      totalEquity: Number(totalEq.toFixed(2)),
      availableCash: Number(availCash.toFixed(2)),
      usedMargin: Number((Number.isFinite(rawBal.usedMargin) ? rawBal.usedMargin : 0).toFixed(2)),
      marginLevel: Number((Number.isFinite(rawBal.marginLevel) ? rawBal.marginLevel : 999).toFixed(2)),
      freeMargin: Number((Number.isFinite(rawBal.freeMargin) ? rawBal.freeMargin : availCash).toFixed(2)),
      unrealizedPnl: Number(unPnl.toFixed(2)),
      realizedPnl: Number((Number.isFinite(rawBal.realizedPnl) ? rawBal.realizedPnl : 0).toFixed(2)),
      dailyPnl: Number((Number.isFinite(rawBal.dailyPnl) ? rawBal.dailyPnl : 0).toFixed(2)),
      dailyPnlPct: Number((Number.isFinite(rawBal.dailyPnlPct) ? rawBal.dailyPnlPct : 0).toFixed(2)),
      currency: rawBal.currency || 'USDT',
    };
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

      const wb = parseFloat(accountInfo.totalWalletBalance || '0') || 0;
      const up = parseFloat(accountInfo.totalUnrealizedProfit || '0') || 0;
      const available = parseFloat(accountInfo.availableBalance || '0') || 0;
      const usedMargin = parseFloat(accountInfo.totalInitialMargin || '0') || 0;
      const maintMargin = parseFloat(accountInfo.totalMaintMargin || '0') || 0;
      
      this.balance = {
        totalEquity: Number((wb + up).toFixed(2)),
        availableCash: Number(available.toFixed(2)),
        usedMargin: Number(usedMargin.toFixed(2)),
        marginLevel: maintMargin > 0 ? Number(((wb + up) / maintMargin).toFixed(2)) : 999.0,
        freeMargin: Number(available.toFixed(2)),
        unrealizedPnl: Number(up.toFixed(2)),
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
      const balances = msg.a?.B;
      const positions = msg.a?.P;

      if (positions) {
        positions.forEach((pos: any) => {
          const amount = parseFloat(pos.pa || '0') || 0;
          const symbol = pos.s?.includes('/') ? pos.s : `${(pos.s || '').replace('USDT', '')}/USDT`;
          if (amount !== 0) {
            const ep = parseFloat(pos.ep || '0') || 0;
            const up = parseFloat(pos.up || '0') || 0;
            const lev = parseFloat(pos.leverage || '20') || 20;
            this.positions.set(symbol as AssetSymbol, {
              symbol: symbol as AssetSymbol,
              size: amount,
              entryPrice: ep,
              currentPrice: ep,
              unrealizedPnl: up,
              unrealizedPnlPct: 0,
              realizedPnl: 0,
              marginUsed: Math.abs(amount * ep) / lev,
              liquidationPrice: parseFloat(pos.sl || '0') || 0,
              leverage: lev,
              updatedAt: Date.now(),
            });
          } else {
            const hadPosition = this.positions.has(symbol as AssetSymbol);
            this.positions.delete(symbol as AssetSymbol);
            if (hadPosition) {
              console.log(`🔒 UserDataStream: Position for ${symbol} is fully CLOSED on exchange.`);
              for (const cl of this.closedListeners) cl(symbol as AssetSymbol);
              if (this.onEvent) this.onEvent('position_closed', { symbol });
            }
          }
        });
        if (this.onEvent) this.onEvent('position_update', this.getPositions());
      }

      const totalUnrealized = Array.from(this.positions.values()).reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);

      if (balances) {
        const usdtBalance = balances.find((b: any) => b.a === 'USDT');
        if (usdtBalance) {
          const wb = parseFloat(usdtBalance.wb || '0') || 0;
          this.balance.availableCash = wb;
          this.balance.unrealizedPnl = totalUnrealized;
          this.balance.totalEquity = wb + totalUnrealized;
          this.balance.freeMargin = wb;
          
          for (const l of this.balanceListeners) l(this.getBalance());
          if (this.onEvent) this.onEvent('balance_update', this.getBalance());
        }
      } else {
        this.balance.unrealizedPnl = totalUnrealized;
        this.balance.totalEquity = this.balance.availableCash + totalUnrealized;
        for (const l of this.balanceListeners) l(this.getBalance());
      }
    }

    if (msg.e === 'ORDER_TRADE_UPDATE') {
      const order = msg.o;
      console.log(`📡 Order Update: ${order.s} | ${order.S} | Status: ${order.X} | Filled: ${order.z}`);
      for (const ot of this.orderTradeListeners) ot(order);
      if (this.onEvent) this.onEvent('order_update', order);
    }
  }

  public onPositionClosed(listener: (symbol: AssetSymbol) => void): () => void {
    this.closedListeners.add(listener);
    return () => this.closedListeners.delete(listener);
  }

  public onOrderTradeUpdate(listener: (order: any) => void): () => void {
    this.orderTradeListeners.add(listener);
    return () => this.orderTradeListeners.delete(listener);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.listenKeyTimer) {
      clearInterval(this.listenKeyTimer);
      this.listenKeyTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    console.log('🛑 UserDataStream: Stopped cleanly.');
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
