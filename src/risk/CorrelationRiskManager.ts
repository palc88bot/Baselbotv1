// src/risk/CorrelationRiskManager.ts

export interface CorrelationMatrix {
    [symbol: string]: {
        [symbol: string]: number;
    };
}

export interface CorrelationRisk {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    score: number; // 0 to 1
    correlatedPairs: Array<{
        symbol1: string;
        symbol2: string;
        correlation: number;
    }>;
    recommendation: string;
}

export class CorrelationRiskManager {
    private correlationMatrix: CorrelationMatrix = {};
    private priceHistory: Map<string, number[]> = new Map();
    private maxHistoryLength: number = 100; // last 100 pricing points
    private correlationThreshold: number = 0.7; // high correlation threshold

    constructor() {
        console.log(' CorrelationRiskManager initialized');
    }

    /**
     * Update price history
     */
    public updatePriceHistory(symbol: string, currentPrice: number) {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }

        const history = this.priceHistory.get(symbol)!;
        history.push(currentPrice);

        if (history.length > this.maxHistoryLength) {
            history.shift();
        }
    }

    /**
     * Calculate correlation matrix
     */
    public calculateCorrelationMatrix(): CorrelationMatrix {
        const symbols = Array.from(this.priceHistory.keys());
        const matrix: CorrelationMatrix = {};

        symbols.forEach(s1 => {
            matrix[s1] = {};
            symbols.forEach(s2 => {
                matrix[s1][s2] = 1.0; // Self correlation is 1
            });
        });

        for (let i = 0; i < symbols.length; i++) {
            for (let j = i + 1; j < symbols.length; j++) {
                const s1 = symbols[i];
                const s2 = symbols[j];
                const correlation = this.calculatePearsonCorrelation(
                    this.priceHistory.get(s1)!,
                    this.priceHistory.get(s2)!
                );
                matrix[s1][s2] = correlation;
                matrix[s2][s1] = correlation;
            }
        }

        this.correlationMatrix = matrix;
        return matrix;
    }

    private calculatePearsonCorrelation(x: number[], y: number[]): number {
        const n = Math.min(x.length, y.length);
        if (n < 10) return 0; // Not enough data points

        const xSlice = x.slice(-n);
        const ySlice = y.slice(-n);

        const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
        const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let xVariance = 0;
        let yVariance = 0;

        for (let i = 0; i < n; i++) {
            const xDiff = xSlice[i] - xMean;
            const yDiff = ySlice[i] - yMean;
            numerator += xDiff * yDiff;
            xVariance += xDiff * xDiff;
            yVariance += yDiff * yDiff;
        }

        const denominator = Math.sqrt(xVariance * yVariance);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Assess risk across currently active symbols
     */
    public assessCorrelationRisk(activeSymbols: string[]): CorrelationRisk {
        this.calculateCorrelationMatrix();

        const correlatedPairs: Array<{
            symbol1: string;
            symbol2: string;
            correlation: number;
        }> = [];

        let totalCorrelation = 0;
        let pairCount = 0;

        for (let i = 0; i < activeSymbols.length; i++) {
            for (let j = i + 1; j < activeSymbols.length; j++) {
                const s1 = activeSymbols[i];
                const s2 = activeSymbols[j];
                const correlation = this.correlationMatrix[s1]?.[s2] || 0;

                if (Math.abs(correlation) > this.correlationThreshold) {
                    correlatedPairs.push({
                        symbol1: s1,
                        symbol2: s2,
                        correlation
                    });
                }

                totalCorrelation += Math.abs(correlation);
                pairCount++;
            }
        }

        const avgCorrelation = pairCount > 0 ? totalCorrelation / pairCount : 0;

        let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        let recommendation: string;

        if (avgCorrelation < 0.3) {
            level = 'LOW';
            recommendation = 'محفظة متنوعة بشكل جيد. يمكن المتابعة.';
        } else if (avgCorrelation < 0.6) {
            level = 'MEDIUM';
            recommendation = 'ارتباط متوسط. يُنصح بتقليل حجم الصفقات بنسبة 20%.';
        } else if (avgCorrelation < 0.8) {
            level = 'HIGH';
            recommendation = 'ارتباط عالي! يجب تقليل حجم الصفقات بنسبة 40% وإضافة أصول غير مترابطة.';
        } else {
            level = 'CRITICAL';
            recommendation = 'ارتباط حرج! إيقاف التداول حتى انخفاض الارتباط. المحفظة معرضة لخسائر متزامنة.';
        }

        return {
            level,
            score: avgCorrelation,
            correlatedPairs,
            recommendation
        };
    }

    /**
     * Get adjustment multiplier for position sizes (0 to 1)
     */
    public getCorrelationAdjustmentFactor(activeSymbols: string[]): number {
        const risk = this.assessCorrelationRisk(activeSymbols);

        switch (risk.level) {
            case 'LOW':
                return 1.0;
            case 'MEDIUM':
                return 0.8;
            case 'HIGH':
                return 0.6;
            case 'CRITICAL':
                return 0.0; // Stop new trading completely
            default:
                return 1.0;
        }
    }

    /**
     * Generate formatting report
     */
    public getCorrelationReport(activeSymbols: string[]): string {
        const risk = this.assessCorrelationRisk(activeSymbols);

        let report = `📊 تقرير مخاطر الارتباط\n`;
        report += `━━━━━━━━━━━━━━━━━━━━\n`;
        report += `مستوى الخطر: ${risk.level}\n`;
        report += `متوسط الارتباط: ${(risk.score * 100).toFixed(1)}%\n`;
        report += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (risk.correlatedPairs.length > 0) {
            report += `⚠️ أزواج ذات ارتباط عالي:\n`;
            risk.correlatedPairs.forEach(pair => {
                report += `• ${pair.symbol1} ↔ ${pair.symbol2}: ${(pair.correlation * 100).toFixed(1)}%\n`;
            });
            report += `\n`;
        }

        report += `💡 التوصية: ${risk.recommendation}\n`;

        return report;
    }
}
