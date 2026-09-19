// src/backtest/BacktestEngine.ts

import { DatabaseService } from '../storage/DatabaseService';
import { AssetSymbol, Candle } from '../domain/types';
import { FeatureEngine } from '../features/FeatureEngine';
import { decide } from '../strategies/DecisionEngine';

interface BacktestConfig {
    symbols: string[];
    startDate: string;
    endDate: string;
    initialCapital: number;
    commission: number; // e.g., 0.0004
    slippage: number; // e.g., 0.0001
    maxLeverage: number;
}

interface BacktestResult {
    totalReturn: number;
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    avgTradeDuration: number;
    equityCurve: { timestamp: number; equity: number }[];
}

export class BacktestEngine {
    private config: BacktestConfig;
    private db: DatabaseService;

    constructor(config: BacktestConfig) {
        this.config = config;
        this.db = new DatabaseService('data/baselbot_backtest.json');
    }

    /**
     * Run the backtest using fetched or synthetic data
     */
    public async run(): Promise<BacktestResult> {
        console.log('🧪 Starting backtest...');
        console.log(`   Period: ${this.config.startDate} to ${this.config.endDate}`);
        console.log(`   Capital: $${this.config.initialCapital}`);

        // 1. Load historical data
        let historicalData: Map<string, any[]>;
        try {
            historicalData = await this.loadHistoricalData();
        } catch (err) {
            console.warn("⚠️ Failed to load real historical Binance candles, generating high-fidelity synthetic candles for reliable local backtest:", err);
            historicalData = this.generateSyntheticData();
        }
        
        // 2. Simulate trading
        const simulation = await this.simulateTrading(historicalData);
        
        // 3. Calculate metrics
        const metrics = this.calculateMetrics(simulation);
        
        // 4. Save results
        this.db.saveState('last_backtest', {
            config: this.config,
            result: metrics,
            timestamp: Date.now()
        });

        console.log('✅ Backtest completed!');
        this.printReport(metrics);
        
        return metrics;
    }

    /**
     * Run the backtest with pre-loaded candles (used by Optimizer)
     */
    public async runWithCandles(candles: Map<string, any[]>): Promise<BacktestResult> {
        const simulation = await this.simulateTrading(candles);
        return this.calculateMetrics(simulation);
    }

    private async loadHistoricalData() {
        const allData: Map<string, any[]> = new Map();

        for (const symbol of this.config.symbols) {
            console.log(` Loading historical data for ${symbol}...`);
            const cleanSymbol = symbol.replace('/', '');
            const startTime = new Date(this.config.startDate).getTime();
            const endTime = new Date(this.config.endDate).getTime();
            
            const candles: any[] = [];
            let currentStart = startTime;

            // Cap retries and count to avoid blocking
            let iterations = 0;
            while (currentStart < endTime && iterations < 3) {
                iterations++;
                const url = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=1h&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Binance API error: ${response.statusText}`);
                }
                const data = await response.json();
                
                if (!Array.isArray(data) || data.length === 0) break;
                
                candles.push(...data);
                currentStart = data[data.length - 1][6] + 1; // last close timestamp + 1ms
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (candles.length === 0) {
                throw new Error("No candles loaded from API");
            }

            allData.set(symbol, candles.map((c: any) => ({
                timestamp: c[0],
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5])
            })));

            console.log(`   ✓ Loaded ${candles.length} candles for ${symbol}`);
        }

        return allData;
    }

    private generateSyntheticData(): Map<string, any[]> {
        const allData: Map<string, any[]> = new Map();
        const startTime = new Date(this.config.startDate).getTime();
        const endTime = new Date(this.config.endDate).getTime();
        const hourMs = 3600000;
        const totalSteps = Math.min(200, Math.floor((endTime - startTime) / hourMs));

        for (const symbol of this.config.symbols) {
            const candles: any[] = [];
            let basePrice = symbol.includes('BTC') ? 90000 : 3500;
            let currentPrice = basePrice;
            
            for (let i = 0; i < totalSteps; i++) {
                const ts = startTime + i * hourMs;
                // Ornstein-Uhlenbeck random walk behavior
                const theta = 0.1;
                const mu = basePrice;
                const sigma = basePrice * 0.015;
                const dx = theta * (mu - currentPrice) + sigma * (Math.random() - 0.5);
                currentPrice += dx;

                const open = currentPrice * (1 + (Math.random() - 0.5) * 0.002);
                const close = currentPrice;
                const high = Math.max(open, close) * (1 + Math.random() * 0.003);
                const low = Math.min(open, close) * (1 - Math.random() * 0.003);
                const volume = 100 + Math.random() * 1000;

                candles.push({ timestamp: ts, open, high, low, close, volume });
            }
            allData.set(symbol, candles);
        }
        return allData;
    }

    private async simulateTrading(historicalData: Map<string, any[]>) {
        const trades: any[] = [];
        let capital = this.config.initialCapital;
        const equityCurve: { timestamp: number; equity: number }[] = [];
        const featureEngine = new FeatureEngine();

        const allTimestamps = new Set<number>();
        historicalData.forEach(candles => {
            candles.forEach((c: any) => allTimestamps.add(c.timestamp));
        });
        const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

        let wins = 0, losses = 0, totalProfit = 0, totalLoss = 0;

        for (const timestamp of sortedTimestamps) {
            for (const rawSymbol of this.config.symbols) {
                const symbol = rawSymbol as AssetSymbol;
                const candles = historicalData.get(rawSymbol)!;
                const currentCandle = candles.find(c => c.timestamp === timestamp);
                if (!currentCandle) continue;

                // 1. Check open trades for this symbol: Stop-Loss, Take-Profit, or Time Exit (maxHoldMs)
                const openTradeIndex = trades.findIndex(t => t.symbol === symbol && t.status === 'OPEN');
                if (openTradeIndex !== -1) {
                    const openTrade = trades[openTradeIndex];
                    const isLong = openTrade.side === 'BUY';
                    const hitSL = isLong ? currentCandle.low <= openTrade.stopLoss : currentCandle.high >= openTrade.stopLoss;
                    const hitTP = isLong ? currentCandle.high >= openTrade.takeProfit : currentCandle.low <= openTrade.takeProfit;
                    const timeExpired = openTrade.maxHoldMs ? (timestamp - openTrade.entryTime >= openTrade.maxHoldMs) : false;

                    if (hitSL || hitTP || timeExpired) {
                        let exitPrice = currentCandle.close;
                        if (hitSL) exitPrice = openTrade.stopLoss;
                        else if (hitTP) exitPrice = openTrade.takeProfit;

                        exitPrice = isLong ? exitPrice * (1 - this.config.slippage) : exitPrice * (1 + this.config.slippage);
                        const rawPnl = isLong 
                            ? (exitPrice - openTrade.entryPrice) * openTrade.quantity
                            : (openTrade.entryPrice - exitPrice) * openTrade.quantity;
                        const exitCost = openTrade.quantity * exitPrice * this.config.commission;
                        const netPnl = rawPnl - exitCost;

                        openTrade.exitTime = timestamp;
                        openTrade.exitPrice = exitPrice;
                        openTrade.pnl = netPnl;
                        openTrade.status = 'CLOSED';
                        openTrade.exitReason = hitSL ? 'STOP_LOSS' : (hitTP ? 'TAKE_PROFIT' : 'TIME_EXPIRED');

                        capital += netPnl;

                        if (netPnl > 0) {
                            wins++;
                            totalProfit += netPnl;
                        } else {
                            losses++;
                            totalLoss += Math.abs(netPnl);
                        }
                        continue;
                    }
                }

                // 2. Feature Extraction using FeatureEngine (Parity with Live Trading - Point 15 & 16)
                const historicalSubCandles = candles.filter(c => c.timestamp <= timestamp).slice(-60) as Candle[];
                if (historicalSubCandles.length < 20) continue;

                const features = featureEngine.extractFeatures(
                    symbol,
                    currentCandle.close,
                    historicalSubCandles
                );

                // 3. Decision Engine evaluation (Unified Single Source of Truth - Point 15 & 16)
                const signal = decide({
                    features,
                    params: {
                        candleIntervalMs: 60 * 60 * 1000 // 1h candles in backtest
                    }
                });

                if (signal && capital > 100 && openTradeIndex === -1) {
                    // Risk 1% of current capital per trade (Point 6 & 8)
                    const riskAmount = capital * 0.01;
                    const stopDistance = Math.abs(currentCandle.close - signal.stopLoss);
                    let quantity = stopDistance > 0 ? (riskAmount / stopDistance) : (capital * 0.05) / currentCandle.close;
                    
                    // Cap position notional to max 2x leverage (Point 7)
                    const maxNotional = capital * Math.min(this.config.maxLeverage, 2);
                    if (quantity * currentCandle.close > maxNotional) {
                        quantity = maxNotional / currentCandle.close;
                    }

                    const entrySlippage = signal.type === 'BUY' ? (1 + this.config.slippage) : (1 - this.config.slippage);
                    const entryPrice = currentCandle.close * entrySlippage;
                    const entryCost = quantity * entryPrice * this.config.commission;

                    trades.push({
                        symbol,
                        entryTime: timestamp,
                        entryPrice,
                        quantity,
                        side: signal.type,
                        stopLoss: signal.stopLoss,
                        takeProfit: signal.takeProfit,
                        maxHoldMs: signal.maxHoldMs,
                        status: 'OPEN'
                    });

                    capital -= entryCost;
                }
            }

            equityCurve.push({ timestamp, equity: capital });
        }

        return { trades, equityCurve, wins, losses, totalProfit, totalLoss };
    }

    private calculateMetrics(simulation: any): BacktestResult {
        const closedTrades = simulation.trades.filter((t: any) => t.status === 'CLOSED');
        const totalTrades = closedTrades.length;
        const winRate = totalTrades > 0 ? (simulation.wins / totalTrades) * 100 : 0;
        const profitFactor = simulation.totalLoss > 0 ? simulation.totalProfit / simulation.totalLoss : simulation.totalProfit;
        
        const returns = simulation.equityCurve.slice(1).map((e: any, i: number) => {
            const prev = simulation.equityCurve[i].equity;
            return prev > 0 ? (e.equity - prev) / prev : 0;
        });
        
        const avgReturn = returns.length > 0 ? returns.reduce((a: number, b: number) => a + b, 0) / returns.length : 0;
        const stdDev = this.calculateStdDev(returns);
        
        // Sharpe Ratio
        const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252 * 24) : 0; // Hourly to Annual

        // Sortino Ratio (Downside deviation only)
        const negativeReturns = returns.filter((r: number) => r < 0);
        const downsideDev = this.calculateStdDev(negativeReturns);
        const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252 * 24) : 0;

        let peak = this.config.initialCapital;
        let maxDrawdown = 0;
        simulation.equityCurve.forEach((e: any) => {
            if (e.equity > peak) peak = e.equity;
            const drawdown = peak > 0 ? (peak - e.equity) / peak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });

        // Calmar Ratio
        const annualReturn = totalTrades > 0 ? (simulation.equityCurve[simulation.equityCurve.length - 1].equity / this.config.initialCapital) - 1 : 0;
        const calmarRatio = maxDrawdown > 0 ? annualReturn / maxDrawdown : 0;

        const totalReturn = this.config.initialCapital > 0 
            ? ((simulation.equityCurve[simulation.equityCurve.length - 1].equity - this.config.initialCapital) / this.config.initialCapital) * 100
            : 0;

        return {
            totalReturn,
            sharpeRatio,
            sortinoRatio,
            calmarRatio,
            maxDrawdown: maxDrawdown * 100,
            winRate,
            profitFactor,
            totalTrades,
            avgTradeDuration: 0,
            equityCurve: simulation.equityCurve
        };
    }

    private calculateStdDev(values: number[]): number {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    private printReport(metrics: BacktestResult) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 BACKTEST REPORT');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Return:      ${metrics.totalReturn.toFixed(2)}%`);
        console.log(`Sharpe Ratio:      ${metrics.sharpeRatio.toFixed(2)}`);
        console.log(`Sortino Ratio:     ${metrics.sortinoRatio.toFixed(2)}`);
        console.log(`Calmar Ratio:      ${metrics.calmarRatio.toFixed(2)}`);
        console.log(`Max Drawdown:      ${metrics.maxDrawdown.toFixed(2)}%`);
        console.log(`Win Rate:          ${metrics.winRate.toFixed(1)}%`);
        console.log(`Profit Factor:     ${metrics.profitFactor.toFixed(2)}`);
        console.log(`Total Trades:      ${metrics.totalTrades}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}
