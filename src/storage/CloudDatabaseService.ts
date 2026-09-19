// src/storage/CloudDatabaseService.ts

import { db as pgDb } from '../db/index.ts';
import { trades, balanceHistory, users } from '../db/schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { TradeRecord, SignalRecord, BalanceSnapshot, PriceRecord } from './DatabaseService.ts';

export class CloudDatabaseService {
  private firestore: Firestore;
  private userId: number | null = null;
  private userUid: string | null = null;

  constructor(userUid?: string) {
    let app: App;
    if (!getApps().length) {
      app = initializeApp({
        projectId: firebaseConfig.projectId,
      });
    } else {
      app = getApps()[0];
    }
    this.firestore = getFirestore(app);
    if (userUid) {
      this.userUid = userUid;
    }
  }

  public async setUserId(id: number, uid: string) {
    this.userId = id;
    this.userUid = uid;
  }

  // --- Prices (Firestore for speed/live feed) ---
  public async savePrice(symbol: string, price: number) {
    if (!this.userUid) return;
    const priceRef = this.firestore
      .collection('users')
      .doc(this.userUid)
      .collection('prices')
      .doc(symbol.replace('/', '_'));
    
    await priceRef.set({
      timestamp: Date.now(),
      symbol,
      price
    });

    // Also store history in a subcollection if needed for optimization
    await priceRef.collection('history').add({
      timestamp: Date.now(),
      price
    });
  }

  public async getPriceHistory(symbol: string, limit: number = 100): Promise<PriceRecord[]> {
    if (!this.userUid) return [];
    const snapshot = await this.firestore
      .collection('users')
      .doc(this.userUid)
      .collection('prices')
      .doc(symbol.replace('/', '_'))
      .collection('history')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      timestamp: doc.data().timestamp,
      symbol,
      price: doc.data().price
    })).reverse();
  }

  // --- Trades (Cloud SQL for durability/audit) ---
  public async saveTrade(trade: TradeRecord) {
    if (!this.userId) return;
    await pgDb.insert(trades).values({
      userId: this.userId,
      symbol: trade.symbol,
      side: trade.side,
      price: trade.price,
      quantity: trade.quantity,
      status: trade.status,
      strategyId: trade.strategy,
      timestamp: new Date(trade.timestamp)
    });
  }

  public async getOpenTrades(symbol?: string): Promise<TradeRecord[]> {
    if (!this.userId) return [];
    let query = pgDb.select().from(trades).where(
      and(
        eq(trades.userId, this.userId),
        eq(trades.status, 'OPEN')
      )
    );
    
    const results = await query;
    const filtered = symbol ? results.filter(r => r.symbol === symbol) : results;
    
    return filtered.map(r => ({
      id: r.id.toString(),
      timestamp: r.timestamp.getTime(),
      symbol: r.symbol,
      side: r.side as 'BUY' | 'SELL',
      quantity: r.quantity,
      price: r.price,
      strategy: r.strategyId,
      status: r.status as 'OPEN' | 'CLOSED' | 'CANCELLED'
    }));
  }

  public async closeTrade(id: string, pnl: number) {
    if (!this.userId) return;
    await pgDb.update(trades)
      .set({ status: 'CLOSED', price: 0 /* This would need actual exit price in real scenario */ })
      .where(and(eq(trades.id, parseInt(id)), eq(trades.userId, this.userId)));
  }

  // --- Signals (Firestore for real-time UI) ---
  public async saveSignal(signal: SignalRecord) {
    if (!this.userUid) return;
    await this.firestore
      .collection('users')
      .doc(this.userUid)
      .collection('signals')
      .add({
        ...signal,
        timestamp: Date.now()
      });
  }

  // --- Balance Snapshots (Cloud SQL) ---
  public async saveBalanceSnapshot(equity: number, freeMargin: number, unrealizedPnl: number) {
    if (!this.userId) return;
    await pgDb.insert(balanceHistory).values({
      userId: this.userId,
      totalEquity: equity,
      availableCash: freeMargin,
      timestamp: new Date()
    });
  }

  // --- Bot State (Firestore) ---
  public async saveState(key: string, value: any) {
    if (!this.userUid) return;
    await this.firestore
      .collection('users')
      .doc(this.userUid)
      .collection('state')
      .doc(key)
      .set({ value, updatedAt: Date.now() });
  }

  public async getState<T>(key: string): Promise<T | null> {
    if (!this.userUid) return null;
    const doc = await this.firestore
      .collection('users')
      .doc(this.userUid)
      .collection('state')
      .doc(key)
      .get();
    return doc.exists ? (doc.data()?.value as T) : null;
  }

  public async getPerformanceMetrics() {
    if (!this.userId) return null;
    const tradesList = await pgDb.select().from(trades).where(
      and(
        eq(trades.userId, this.userId),
        eq(trades.status, 'CLOSED')
      )
    );
    
    const totalTrades = tradesList.length;
    // PnL calculation would require exit prices in the schema, for now simplified
    return {
      totalTrades,
      winRate: 0, 
      totalPnl: 0
    };
  }
}
