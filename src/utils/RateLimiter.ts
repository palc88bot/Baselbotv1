// src/utils/RateLimiter.ts

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    weight?: number;
}

export interface RateLimitStatus {
    used: number;
    limit: number;
    remaining: number;
    resetTime: number;
    isApproachingLimit: boolean;
}

export class RateLimiter {
    private requestLog: Map<string, number[]> = new Map();
    private configs: Map<string, RateLimitConfig> = new Map();
    private globalLimit: RateLimitConfig;

    constructor() {
        this.globalLimit = {
            maxRequests: 2400, // 2400 requests/minute for Binance Futures
            windowMs: 60000
        };

        this.configs.set('/fapi/v1/order', {
            maxRequests: 300, // 300 orders per 10 seconds
            windowMs: 10000,
            weight: 1
        });

        this.configs.set('/fapi/v1/positionRisk', {
            maxRequests: 2400,
            windowMs: 60000,
            weight: 10
        });

        this.configs.set('/fapi/v1/account', {
            maxRequests: 2400,
            windowMs: 60000,
            weight: 20
        });

        console.log('🚦 RateLimiter initialized with Binance Futures limits');
    }

    /**
     * Check if request can be made, wait if necessary
     */
    public async checkRateLimit(endpoint: string): Promise<boolean> {
        const now = Date.now();
        const config = this.configs.get(endpoint) || this.globalLimit;
        const key = endpoint;

        this.cleanOldRequests(key, config.windowMs, now);

        const requests = this.requestLog.get(key) || [];
        const totalWeight = requests.length * (config.weight || 1);

        if (totalWeight >= config.maxRequests) {
            const resetTime = (requests[0] || now) + config.windowMs;
            const waitTime = resetTime - now;

            console.warn(`⚠️ Rate limit approaching for ${endpoint}. Waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime + 100));
            return this.checkRateLimit(endpoint); // re-check after wait
        }

        if (!this.requestLog.has(key)) {
            this.requestLog.set(key, []);
        }
        this.requestLog.get(key)!.push(now);

        return true;
    }

    public getRateLimitStatus(endpoint: string): RateLimitStatus {
        const now = Date.now();
        const config = this.configs.get(endpoint) || this.globalLimit;
        const key = endpoint;

        this.cleanOldRequests(key, config.windowMs, now);

        const requests = this.requestLog.get(key) || [];
        const used = requests.length * (config.weight || 1);
        const remaining = Math.max(0, config.maxRequests - used);

        return {
            used,
            limit: config.maxRequests,
            remaining,
            resetTime: requests.length > 0 ? requests[0] + config.windowMs : now,
            isApproachingLimit: remaining < config.maxRequests * 0.2
        };
    }

    public handleBinanceRateLimitResponse(headers: any): void {
        const limit = parseInt(headers['x-mbx-used-weight-1m'] || '0');
        const orderLimit = parseInt(headers['x-mbx-order-count-10s'] || '0');

        if (limit > 0 || orderLimit > 0) {
            console.log(` Binance Rate Limit Status:`);
            console.log(`   Used Weight (1min): ${limit}/2400`);
            console.log(`   Orders (10s): ${orderLimit}/300`);
        }
    }

    private cleanOldRequests(key: string, windowMs: number, now: number) {
        const requests = this.requestLog.get(key) || [];
        const cutoff = now - windowMs;
        const filtered = requests.filter(timestamp => timestamp > cutoff);
        this.requestLog.set(key, filtered);
    }

    public async smartDelay(endpoint: string): Promise<void> {
        const status = this.getRateLimitStatus(endpoint);

        if (status.isApproachingLimit) {
            const delay = 1000;
            console.log(`⏳ Smart delay: ${delay}ms (approaching rate limit)`);
            await new Promise(resolve => setTimeout(resolve, delay));
        } else if (status.remaining < status.limit * 0.5) {
            const delay = 500;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    public async handle429Error(endpoint: string, retryCount: number = 0): Promise<void> {
        const maxRetries = 3;
        if (retryCount >= maxRetries) {
            throw new Error(`Rate limit exceeded after ${maxRetries} retries for ${endpoint}`);
        }

        const backoffTime = Math.pow(2, retryCount) * 1000;
        console.warn(`⚠️ 429 Error for ${endpoint}. Retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
    }

    public getFullReport(): string {
        let report = `🚦 Rate Limiter Report\n`;
        report += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        this.configs.forEach((config, endpoint) => {
            const status = this.getRateLimitStatus(endpoint);
            const usagePercent = (status.used / status.limit) * 100;
            
            report += `${endpoint}\n`;
            report += `  Used: ${status.used}/${status.limit} (${usagePercent.toFixed(1)}%)\n`;
            report += `  Remaining: ${status.remaining}\n`;
            report += `  Status: ${status.isApproachingLimit ? '⚠️ APPROACHING LIMIT' : '✅ OK'}\n\n`;
        });

        return report;
    }
}
