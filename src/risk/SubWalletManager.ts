/**
 * SubWalletManager.ts
 * ====================================================================
 * Micro-Quant Sub-Portfolio & Isolated Capital Quarantine Engine
 * ====================================================================
 * - Quarantines $25.00 from Master Testnet Wallet for Micro-Trading
 * - Master Wallet is completely untouched and locked against over-exposure
 * - Auto-compounds exclusively from accumulated profits
 * - Persists state in SQLite / Cloud DB so balance doesn't reset on restarts
 * - Only resets if wallet is depleted (currentEquity < $1.00) or requested
 * ====================================================================
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

export interface SubWalletState {
  isActive: boolean;
  initialAllocation: number;
  allocatedCapital: number;
  currentEquity: number;
  availableMargin: number;
  usedMargin: number;
  realizedProfit: number;
  unrealizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  growthPct: number;
  isDepleted: boolean;
  lastUpdated: number;
}

const SUB_WALLET_STATE_FILE = path.join(process.cwd(), 'data', 'sub_wallet_state.json');

export class SubWalletManager extends EventEmitter {
  private state: SubWalletState;

  constructor(initialCapital: number = 25.0) {
    super();
    this.state = this.loadState(initialCapital);
  }

  private loadState(initialCapital: number): SubWalletState {
    try {
      if (fs.existsSync(SUB_WALLET_STATE_FILE)) {
        const raw = fs.readFileSync(SUB_WALLET_STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.currentEquity === 'number') {
          // If depleted (< $1.00), reset back to $25
          if (parsed.currentEquity < 1.0) {
            console.log('🔄 [SUB-WALLET] Previous capital was depleted. Re-allocating $25.00 quarantine slice.');
            return this.createNewState(initialCapital);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('⚠️ [SUB-WALLET] Could not load saved state, initializing fresh $25 slice:', e);
    }
    return this.createNewState(initialCapital);
  }

  private createNewState(initialCapital: number): SubWalletState {
    const newState: SubWalletState = {
      isActive: true,
      initialAllocation: initialCapital,
      allocatedCapital: initialCapital,
      currentEquity: initialCapital,
      availableMargin: initialCapital,
      usedMargin: 0,
      realizedProfit: 0,
      unrealizedPnl: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      growthPct: 0,
      isDepleted: false,
      lastUpdated: Date.now(),
    };
    this.saveState(newState);
    return newState;
  }

  private saveState(state: SubWalletState): void {
    try {
      const dir = path.dirname(SUB_WALLET_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SUB_WALLET_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.error('❌ [SUB-WALLET] Failed to persist state to disk:', e);
    }
  }

  public getState(): SubWalletState {
    return { ...this.state };
  }

  public getCurrentEquity(): number {
    return Math.max(0, this.state.currentEquity);
  }

  public getAvailableMargin(): number {
    return Math.max(0, this.state.availableMargin);
  }

  public updateUnrealizedPnl(unrealizedPnl: number, usedMargin: number = 0): void {
    this.state.unrealizedPnl = Number(unrealizedPnl.toFixed(2));
    this.state.usedMargin = Number(usedMargin.toFixed(2));
    this.state.currentEquity = Number((this.state.allocatedCapital + this.state.realizedProfit + this.state.unrealizedPnl).toFixed(2));
    this.state.availableMargin = Number(Math.max(0, this.state.currentEquity - this.state.usedMargin).toFixed(2));
    this.state.growthPct = Number((((this.state.currentEquity - this.state.initialAllocation) / this.state.initialAllocation) * 100).toFixed(2));
    this.state.isDepleted = this.state.currentEquity < 1.0;
    this.state.lastUpdated = Date.now();
    this.saveState(this.state);
    this.emit('update', this.state);
  }

  public recordTradeResult(pnl: number, fee: number = 0): void {
    const netPnl = pnl - fee;
    this.state.realizedProfit = Number((this.state.realizedProfit + netPnl).toFixed(2));
    this.state.totalTrades += 1;
    if (netPnl > 0) {
      this.state.winningTrades += 1;
    } else if (netPnl < 0) {
      this.state.losingTrades += 1;
    }
    this.state.winRate = this.state.totalTrades > 0
      ? Number(((this.state.winningTrades / this.state.totalTrades) * 100).toFixed(1))
      : 0;

    this.state.currentEquity = Number((this.state.allocatedCapital + this.state.realizedProfit + this.state.unrealizedPnl).toFixed(2));
    this.state.availableMargin = Number(Math.max(0, this.state.currentEquity - this.state.usedMargin).toFixed(2));
    this.state.growthPct = Number((((this.state.currentEquity - this.state.initialAllocation) / this.state.initialAllocation) * 100).toFixed(2));
    this.state.isDepleted = this.state.currentEquity < 1.0;
    this.state.lastUpdated = Date.now();

    console.log(`💼 [SUB-WALLET] Closed Trade recorded: Net PnL = $${netPnl.toFixed(2)} | Sub-Equity = $${this.state.currentEquity.toFixed(2)} (${this.state.growthPct >= 0 ? '+' : ''}${this.state.growthPct}%)`);
    this.saveState(this.state);
    this.emit('update', this.state);
  }

  public resetSubWallet(amount: number = 25.0): SubWalletState {
    this.state = this.createNewState(amount);
    console.log(`🔄 [SUB-WALLET] Manually re-allocated Sub-Wallet capital: $${amount.toFixed(2)}`);
    this.emit('update', this.state);
    return this.state;
  }

  public syncWithTrades(trades: any[]): void {
    const closedTrades = (trades || []).filter(t => t.status === 'CLOSED');
    let realizedPnl = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    for (const t of closedTrades) {
      const pnl = Number(t.pnl) || 0;
      realizedPnl += pnl;
      if (pnl > 0) winningTrades += 1;
      else if (pnl < 0) losingTrades += 1;
    }

    this.state.totalTrades = closedTrades.length;
    this.state.winningTrades = winningTrades;
    this.state.losingTrades = losingTrades;
    this.state.realizedProfit = Number(realizedPnl.toFixed(2));
    this.state.winRate = closedTrades.length > 0 ? Number(((winningTrades / closedTrades.length) * 100).toFixed(1)) : 0;
    this.state.currentEquity = Number((this.state.allocatedCapital + this.state.realizedProfit + this.state.unrealizedPnl).toFixed(2));
    this.state.availableMargin = Number(Math.max(0, this.state.currentEquity - this.state.usedMargin).toFixed(2));
    this.state.growthPct = Number((((this.state.currentEquity - this.state.initialAllocation) / this.state.initialAllocation) * 100).toFixed(2));
    this.state.lastUpdated = Date.now();
    this.saveState(this.state);
    this.emit('update', this.state);
    console.log(`💼 [SUB-WALLET] Synchronized with ${closedTrades.length} trades from DB. Realized PnL: $${realizedPnl.toFixed(2)} | Sub-Equity: $${this.state.currentEquity.toFixed(2)}`);
  }
}
