import { BacktestEngine } from './BacktestEngine';
import fs from 'fs';

export interface OptimizationResult {
    parameters: any;
    fitness: number;
    metrics: any;
}

export interface WFOSegment {
    inSampleStart: number;
    inSampleEnd: number;
    outSampleStart: number;
    outSampleEnd: number;
    bestParams?: any;
    oosPerformance?: any;
}

export class WalkForwardOptimizer {
    private engine: BacktestEngine;
    private segments: WFOSegment[] = [];

    constructor(
        private symbols: string[],
        private totalDays: number,
        private inSampleDays: number,
        private outSampleDays: number
    ) {
        this.engine = new BacktestEngine({
            symbols,
            startDate: '', // Will be overridden per segment
            endDate: '',
            initialCapital: 10000,
            commission: 0.0004,
            slippage: 0.0001,
            maxLeverage: 3
        });
    }

    public generateSegments(endTime: number) {
        const dayMs = 24 * 60 * 60 * 1000;
        let currentEnd = endTime;

        this.segments = [];
        while (currentEnd - (this.inSampleDays + this.outSampleDays) * dayMs >= endTime - this.totalDays * dayMs) {
            const outEnd = currentEnd;
            const outStart = outEnd - this.outSampleDays * dayMs;
            const inEnd = outStart;
            const inStart = inEnd - this.inSampleDays * dayMs;

            this.segments.unshift({
                inSampleStart: inStart,
                inSampleEnd: inEnd,
                outSampleStart: outStart,
                outSampleEnd: outEnd
            });

            currentEnd -= this.outSampleDays * dayMs;
        }

        // If no segments fitted, generate at least one default segment
        if (this.segments.length === 0) {
            const inEnd = endTime - this.outSampleDays * dayMs;
            const inStart = inEnd - this.inSampleDays * dayMs;
            this.segments.push({
                inSampleStart: Math.max(0, inStart),
                inSampleEnd: inEnd,
                outSampleStart: inEnd,
                outSampleEnd: endTime,
            });
        }
    }

    public async run(candles: Map<string, any[]>) {
        console.log(`🚀 Starting Walk-Forward Optimization (${this.segments.length} segments)...`);
        
        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            console.log(`\n--- Segment ${i + 1}/${this.segments.length} ---`);
            console.log(`In-Sample:  ${new Date(segment.inSampleStart).toLocaleDateString()} -> ${new Date(segment.inSampleEnd).toLocaleDateString()}`);
            console.log(`Out-Sample: ${new Date(segment.outSampleStart).toLocaleDateString()} -> ${new Date(segment.outSampleEnd).toLocaleDateString()}`);

            // 1. Optimize In-Sample
            const inSampleCandles = this.sliceCandles(candles, segment.inSampleStart, segment.inSampleEnd);
            const best = await this.optimize(inSampleCandles);
            segment.bestParams = best.parameters;

            // 2. Validate Out-of-Sample using the discovered best parameters
            const outSampleCandles = this.sliceCandles(candles, segment.outSampleStart, segment.outSampleEnd);
            segment.oosPerformance = await this.engine.runWithCandles(outSampleCandles, best.parameters);
            
            console.log(`Best Params: ${JSON.stringify(best.parameters)}`);
            console.log(`OOS Sharpe:  ${segment.oosPerformance.sharpeRatio.toFixed(2)} | OOS Return: ${segment.oosPerformance.totalReturn.toFixed(2)}%`);
        }

        this.printFullReport();
        return this.segments;
    }

    private async optimize(candles: Map<string, any[]>): Promise<OptimizationResult> {
        // Grid search over entry z-score thresholds and halfLife thresholds
        const zScores = [1.2, 1.5, 1.8, 2.2];
        const halfLifes = [15, 25, 40];
        let best: OptimizationResult | null = null;

        for (const z of zScores) {
            for (const hl of halfLifes) {
                const params = { entryZ: z, maxHalfLife: hl };
                const metrics = await this.engine.runWithCandles(candles, params);
                const ddPct = (metrics as any).maxDrawdownPct ?? (metrics as any).maxDrawdown ?? 0;
                const fitness = metrics.sharpeRatio - (ddPct * 0.05);

                if (!best || fitness > best.fitness) {
                    best = { parameters: params, fitness, metrics };
                }
            }
        }

        return best || { parameters: { entryZ: 1.5, maxHalfLife: 25 }, fitness: 0, metrics: {} as any };
    }

    private sliceCandles(allCandles: Map<string, any[]>, start: number, end: number): Map<string, any[]> {
        const sliced = new Map();
        allCandles.forEach((candles, symbol) => {
            sliced.set(symbol, candles.filter(c => c.timestamp >= start && c.timestamp <= end));
        });
        return sliced;
    }

    private printFullReport() {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 WFO FINAL REPORT');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const validSegments = this.segments.filter(s => s.oosPerformance);
        const count = validSegments.length || 1;
        const avgSharpe = validSegments.reduce((acc, s) => acc + (s.oosPerformance?.sharpeRatio || 0), 0) / count;
        const stability = validSegments.filter(s => (s.oosPerformance?.sharpeRatio || 0) > 0).length / count;

        console.log(`Average OOS Sharpe: ${avgSharpe.toFixed(2)}`);
        console.log(`Parameter Stability: ${(stability * 100).toFixed(0)}%`);

        // Save Best Params from last segment for live trading
        const lastSegment = this.segments[this.segments.length - 1];
        if (lastSegment && lastSegment.bestParams) {
            const configPath = './data/optimized_params.json';
            try {
                if (!fs.existsSync('./data')) fs.mkdirSync('./data');
                fs.writeFileSync(configPath, JSON.stringify({
                    ...lastSegment.bestParams,
                    optimizedAt: new Date().toISOString(),
                    oosSharpe: lastSegment.oosPerformance?.sharpeRatio || 0
                }, null, 2));
                console.log(`✅ Best parameters saved to ${configPath}`);
            } catch (e) {
                console.error('❌ Failed to save optimized parameters:', e);
            }
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}
