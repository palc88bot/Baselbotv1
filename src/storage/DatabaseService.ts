// src/storage/DatabaseService.ts

import path from 'path';
import fs from 'fs';

export interface TradeRecord {
    id: string;
    timestamp: number;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    strategy: string;
    pnl?: number;
    status: 'OPEN' | 'CLOSED' | 'CANCELLED';
}

export interface SignalRecord {
    id: string;
    timestamp: number;
    symbol: string;
    type: string;
    strength: number;
    zScore: number;
    executed: boolean;
}

export interface BalanceSnapshot {
    timestamp: number;
    total_equity: number;
    free_margin: number;
    unrealized_pnl: number;
}

export interface PriceRecord {
    timestamp: number;
    symbol: string;
    price: number;
}

export class DatabaseService {
    private filePath: string;
    private data: {
        trades: Record<string, TradeRecord>;
        signals: SignalRecord[];
        balanceSnapshots: BalanceSnapshot[];
        prices: Record<string, PriceRecord[]>;
        botState: Record<string, any>;
    };

    constructor(dbPath: string = 'data/baselbot_db.json') {
        this.filePath = path.join(process.cwd(), dbPath);
        this.data = {
            trades: {},
            signals: [],
            balanceSnapshots: [],
            prices: {},
            botState: {}
        };
        this.load();
        console.log(`🗄️ Database Service initialized at ${this.filePath}`);
    }

    private load() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.data = {
                    trades: parsed.trades || {},
                    signals: parsed.signals || [],
                    balanceSnapshots: parsed.balanceSnapshots || [],
                    prices: parsed.prices || {},
                    botState: parsed.botState || {}
                };
            }
        } catch (err) {
            console.error('Error loading persistent database:', err);
        }
    }

    // ... (rest of save method remains similar)

    private save() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (err) {
            console.error('Error saving persistent database:', err);
        }
    }

    // --- Prices ---
    public async savePrice(symbol: string, price: number) {
        if (!this.data.prices[symbol]) {
            this.data.prices[symbol] = [];
        }
        this.data.prices[symbol].push({
            timestamp: Date.now(),
            symbol,
            price
        });
        
        // Keep last 1000 prices per symbol
        if (this.data.prices[symbol].length > 1000) {
            this.data.prices[symbol].shift();
        }
        this.save();
    }

    public async getPriceHistory(symbol: string, limit: number = 100): Promise<PriceRecord[]> {
        const history = this.data.prices[symbol] || [];
        return history.slice(-limit);
    }

    // --- Trades ---
    public async saveTrade(trade: TradeRecord) {
        this.data.trades[trade.id] = trade;
        this.save();
    }

    public async getOpenTrades(symbol?: string): Promise<TradeRecord[]> {
        const list = Object.values(this.data.trades).filter(t => t.status === 'OPEN');
        if (symbol) {
            return list.filter(t => t.symbol === symbol);
        }
        return list;
    }

    public async closeTrade(id: string, pnl: number) {
        if (this.data.trades[id]) {
            this.data.trades[id].status = 'CLOSED';
            this.data.trades[id].pnl = pnl;
            this.save();
        }
    }

    // --- Signals ---
    public async saveSignal(signal: SignalRecord) {
        this.data.signals.push(signal);
        if (this.data.signals.length > 500) {
            this.data.signals.shift();
        }
        this.save();
    }

    // --- Balance Snapshots ---
    public async saveBalanceSnapshot(equity: number, freeMargin: number, unrealizedPnl: number) {
        this.data.balanceSnapshots.push({
            timestamp: Date.now(),
            total_equity: equity,
            free_margin: freeMargin,
            unrealized_pnl: unrealizedPnl
        });
        if (this.data.balanceSnapshots.length > 1000) {
            this.data.balanceSnapshots.shift();
        }
        this.save();
    }

    // --- Bot State (Recovery) ---
    public async saveState(key: string, value: any) {
        this.data.botState[key] = value;
        this.save();
    }

    public async getState<T>(key: string): Promise<T | null> {
        const val = this.data.botState[key];
        return val !== undefined ? (val as T) : null;
    }

    // --- Analytics ---
    public getPerformanceMetrics() {
        const tradesList = Object.values(this.data.trades).filter(t => t.status === 'CLOSED');
        const totalTrades = tradesList.length;
        const winningTrades = tradesList.filter(t => (t.pnl || 0) > 0).length;
        const totalPnl = tradesList.reduce((sum, t) => sum + (t.pnl || 0), 0);
        
        return {
            totalTrades,
            winningTrades,
            winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
            totalPnl,
            avgPnl: totalTrades > 0 ? totalPnl / totalTrades : 0
        };
    }

    public close() {
        this.save();
        console.log('🔒 Database connection closed gracefully');
    }
}
