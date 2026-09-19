/**
 * Basel Quantum Algorithmic Trading System
 * Dynamic Portfolio Sizer, Tier Manager & Compounding Safety Engine
 */

import { AssetSymbol } from '../domain/types';
import { AssetScreener } from '../market-data/AssetScreener';

export type PortfolioTier = 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE';

export interface TierConfig {
  tier: PortfolioTier;
  maxConcurrentPositions: number;
  minLeverage: number;          // 5x (Binance minimum standard)
  maxLeverage: number;          // 5x - 15x depending on Tier
  minTradeValue: number;       // بالـ USDT
  maxTradePercentage: number;  // نسبة من المحفظة
  maxQualifiedAssets: number;   // عدد العملات المؤهلة كحد أقصى
  allowedSymbols: AssetSymbol[];
  quboEnabled: boolean;        // هل نستخدم QUBO؟
  minZScore: number;           // عتبة أكثر صرامة للمحافظ الصغيرة
  maxDrawdownPercent: number;
}

export interface CompoundingConfig {
  enabled: boolean;
  reinvestPercentage: number;     // نسبة إعادة الاستثمار (0.80 = 80%)
  maxDailyLossPercent: number;    // حد الخسارة اليومية (0.10 = 10%)
  maxConsecutiveLosses: number;   // حد الخسائر المتتالية (3)
  profitLockPercentage: number;   // نسبة قفل الأرباح (0.20 = 20%)
  autoUpgradeEnabled: boolean;    // ترقية تلقائية للحساب
}

export interface TierStats {
  tier: PortfolioTier;
  dailyPnL: number;              // الربح/الخسارة اليومي
  consecutiveLosses: number;     // عدد الخسائر المتتالية
  totalTradesToday: number;      // عدد صفقات اليوم
  lastTradeTime: number;         // آخر صفقة
  profitsLocked: number;         // الأرباح المقفلة
  startingBalance: number;       // الرصيد عند بداية اليوم
}

export class PortfolioSizer {
  private currentTier: PortfolioTier = 'MEDIUM';
  private currentBalance: number = 0;
  private compoundingConfig: CompoundingConfig;
  private tierStats: TierStats;
  private assetScreener?: AssetScreener;
  private allowedSymbols: AssetSymbol[] = [];

  private tierConfigs: Record<PortfolioTier, TierConfig> = {
    MICRO: {
      tier: 'MICRO',
      maxConcurrentPositions: 1,
      minLeverage: 5,           // 5x ثابت للحماية
      maxLeverage: 5,
      minTradeValue: 5,
      maxTradePercentage: 0.50, // 50% من المحفظة في صفقة واحدة
      maxQualifiedAssets: 15,   // 15 عملة صغيرة آمنة
      allowedSymbols: ['SOL/USDT', 'BTC/USDT', 'ETH/USDT', 'QNT/USDT'],
      quboEnabled: false,
      minZScore: -2.5, // أكثر صرامة
      maxDrawdownPercent: 0.15,
    },
    SMALL: {
      tier: 'SMALL',
      maxConcurrentPositions: 2,
      minLeverage: 5,
      maxLeverage: 8,           // 8x
      minTradeValue: 10,
      maxTradePercentage: 0.40,
      maxQualifiedAssets: 25,   // 25 عملة
      allowedSymbols: ['SOL/USDT', 'ETH/USDT', 'BTC/USDT', 'QNT/USDT'],
      quboEnabled: false,
      minZScore: -2.0,
      maxDrawdownPercent: 0.20,
    },
    MEDIUM: {
      tier: 'MEDIUM',
      maxConcurrentPositions: 5,
      minLeverage: 5,
      maxLeverage: 12,          // 12x
      minTradeValue: 20,
      maxTradePercentage: 0.25,
      maxQualifiedAssets: 40,   // 40 عملة
      allowedSymbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT'],
      quboEnabled: true,
      minZScore: -1.6,
      maxDrawdownPercent: 0.25,
    },
    LARGE: {
      tier: 'LARGE',
      maxConcurrentPositions: 10,
      minLeverage: 5,
      maxLeverage: 15,          // 15x
      minTradeValue: 50,
      maxTradePercentage: 0.15,
      maxQualifiedAssets: 100,  // حتى 100 عملة مؤهلة
      allowedSymbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT', 'NVDA/USD', 'AAPL/USD'],
      quboEnabled: true,
      minZScore: -1.6,
      maxDrawdownPercent: 0.30,
    },
  };

  constructor(assetScreener?: AssetScreener) {
    this.assetScreener = assetScreener;
    this.compoundingConfig = {
      enabled: true,
      reinvestPercentage: 0.80,    // أعد استثمار 80% من الأرباح
      maxDailyLossPercent: 0.10,   // حد أقصى 10% خسارة يومية
      maxConsecutiveLosses: 3,     // توقف بعد 3 خسائر متتالية
      profitLockPercentage: 0.20,  // اقفل 20% من الأرباح (لا تُعاد استثمارها)
      autoUpgradeEnabled: true,    // ترقية تلقائية
    };

    this.tierStats = {
      tier: 'MEDIUM',
      dailyPnL: 0,
      consecutiveLosses: 0,
      totalTradesToday: 0,
      lastTradeTime: 0,
      profitsLocked: 0,
      startingBalance: 0,
    };

    this.refreshAllowedSymbols();
  }

  /**
   * ربط AssetScreener مع Sizer
   */
  public setAssetScreener(screener: AssetScreener): void {
    this.assetScreener = screener;
    this.refreshAllowedSymbols();
  }

  /**
   * يُستدعى عند كل تحديث للرصيد
   */
  public updateBalance(balance: number): PortfolioTier {
    this.currentBalance = balance;
    if (this.tierStats.startingBalance === 0 && balance > 0) {
      this.tierStats.startingBalance = balance;
    }

    const previousTier = this.currentTier;

    if (balance < 50) {
      this.currentTier = 'MICRO';
    } else if (balance < 100) {
      this.currentTier = 'SMALL';
    } else if (balance < 500) {
      this.currentTier = 'MEDIUM';
    } else {
      this.currentTier = 'LARGE';
    }

    this.tierStats.tier = this.currentTier;

    if (previousTier !== this.currentTier) {
      console.log(`📊 Portfolio tier changed: ${previousTier} → ${this.currentTier} (Balance: $${balance.toFixed(2)})`);
    }

    this.refreshAllowedSymbols();

    return this.currentTier;
  }

  /**
   * تحديث قائمة العملات المسموحة بناءً على الفلتر الفعال والفئة الحالية
   */
  public refreshAllowedSymbols(): AssetSymbol[] {
    const config = this.getConfig();
    if (this.assetScreener) {
      const qualified = this.assetScreener.getQualifiedAssets(config.maxQualifiedAssets);
      if (qualified && qualified.length > 0) {
        this.allowedSymbols = qualified;
        return this.allowedSymbols;
      }
    }
    this.allowedSymbols = config.allowedSymbols;
    return this.allowedSymbols;
  }

  public getAllowedSymbols(): AssetSymbol[] {
    if (this.allowedSymbols.length === 0) {
      return this.refreshAllowedSymbols();
    }
    return this.allowedSymbols;
  }

  public isSymbolAllowed(symbol: AssetSymbol): boolean {
    const allowed = this.getAllowedSymbols();
    return allowed.includes(symbol);
  }

  /**
   * حساب الرافعة الديناميكية (5x إلى 15x) بناءً على قوة الإشارة وفئة المحفظة
   */
  public calculateDynamicLeverage(signalStrength: number): number {
    const config = this.getConfig();
    const minLeverage = config.minLeverage || 5;
    const maxLeverage = config.maxLeverage || 5;

    if (minLeverage >= maxLeverage) {
      return minLeverage;
    }

    const leverageRange = maxLeverage - minLeverage;
    const dynamicLeverage = minLeverage + (leverageRange * Math.max(0, Math.min(1, signalStrength)));
    const roundedLeverage = Math.round(dynamicLeverage);

    console.log(`📊 Dynamic Leverage: ${roundedLeverage}x (Signal: ${(signalStrength * 100).toFixed(0)}%, Range: ${minLeverage}x-${maxLeverage}x)`);

    return roundedLeverage;
  }

  /**
   * يُستدعى عند بداية كل يوم
   */
  public resetDailyStats(currentBalance: number): void {
    this.tierStats.dailyPnL = 0;
    this.tierStats.consecutiveLosses = 0;
    this.tierStats.totalTradesToday = 0;
    this.tierStats.startingBalance = currentBalance;
    console.log(`📅 Daily stats reset. Starting balance: $${currentBalance.toFixed(2)}`);
  }

  /**
   * يُستدعى بعد كل صفقة
   */
  public recordTradeResult(pnl: number, currentBalance: number): void {
    this.tierStats.dailyPnL += pnl;
    this.tierStats.totalTradesToday += 1;
    this.tierStats.lastTradeTime = Date.now();

    if (pnl < 0) {
      this.tierStats.consecutiveLosses += 1;
    } else {
      this.tierStats.consecutiveLosses = 0;
      const profitToLock = pnl * this.compoundingConfig.profitLockPercentage;
      this.tierStats.profitsLocked += profitToLock;
    }

    if (this.compoundingConfig.autoUpgradeEnabled) {
      this.checkAutoUpgrade(currentBalance);
    }

    console.log(`📊 Trade recorded: PnL $${pnl.toFixed(2)} | Daily: $${this.tierStats.dailyPnL.toFixed(2)} | Consecutive losses: ${this.tierStats.consecutiveLosses}`);
  }

  private checkAutoUpgrade(currentBalance: number): void {
    const previousTier = this.currentTier;

    if (currentBalance >= 500 && this.currentTier !== 'LARGE') {
      this.currentTier = 'LARGE';
    } else if (currentBalance >= 100 && this.currentTier === 'SMALL') {
      this.currentTier = 'MEDIUM';
    } else if (currentBalance >= 50 && this.currentTier === 'MICRO') {
      this.currentTier = 'SMALL';
    }

    this.tierStats.tier = this.currentTier;

    if (previousTier !== this.currentTier) {
      console.log(`🎉 AUTO UPGRADE: ${previousTier} → ${this.currentTier} (Balance: $${currentBalance.toFixed(2)})`);
    }

    this.refreshAllowedSymbols();
  }

  public getConfig(): TierConfig {
    return this.tierConfigs[this.currentTier];
  }

  public canOpenNewTrade(currentOpenPositions: number): { allowed: boolean; reason?: string } {
    const config = this.getConfig();

    if (currentOpenPositions >= config.maxConcurrentPositions) {
      return { allowed: false, reason: `Max positions reached (${config.maxConcurrentPositions})` };
    }

    const starting = this.tierStats.startingBalance || this.currentBalance || 100;
    const maxDailyLoss = starting * this.compoundingConfig.maxDailyLossPercent;
    if (this.tierStats.dailyPnL < -maxDailyLoss) {
      return { 
        allowed: false, 
        reason: `Daily loss limit reached ($${this.tierStats.dailyPnL.toFixed(2)} / -$${maxDailyLoss.toFixed(2)})` 
      };
    }

    if (this.tierStats.consecutiveLosses >= this.compoundingConfig.maxConsecutiveLosses) {
      return { 
        allowed: false, 
        reason: `Max consecutive losses reached (${this.tierStats.consecutiveLosses})` 
      };
    }

    return { allowed: true };
  }

  public canOpenNewPosition(currentOpenPositions: number): boolean {
    return this.canOpenNewTrade(currentOpenPositions).allowed;
  }

  public calculatePositionSize(
    signalStrength: number,
    currentPrice: number,
    balance: number
  ): { quantity: number; notionalValue: number; leverage: number } {
    const config = this.getConfig();
    const availableBalance = Math.max(1, balance - this.tierStats.profitsLocked);

    let baseNotional: number;
    if (this.compoundingConfig.enabled) {
      baseNotional = availableBalance * config.maxTradePercentage * signalStrength * this.compoundingConfig.reinvestPercentage;
    } else {
      const starting = this.tierStats.startingBalance || balance;
      baseNotional = starting * config.maxTradePercentage * signalStrength;
    }

    const leverage = this.calculateDynamicLeverage(signalStrength);
    const leveragedNotional = baseNotional * leverage;

    const notionalValue = Math.max(config.minTradeValue * leverage, leveragedNotional);
    const safeNotional = Math.min(notionalValue, availableBalance * leverage * 0.95);
    const quantity = currentPrice > 0 ? safeNotional / currentPrice : 0.01;

    return {
      quantity: Number(quantity.toFixed(6)),
      notionalValue: Number(safeNotional.toFixed(2)),
      leverage,
    };
  }

  public getAdjustedZScoreThreshold(baseZScore: number): number {
    const config = this.getConfig();
    return Math.min(baseZScore, config.minZScore);
  }

  public getCompoundingReport(): any {
    return {
      enabled: this.compoundingConfig.enabled,
      tier: this.currentTier,
      currentBalance: this.currentBalance,
      startingBalance: this.tierStats.startingBalance,
      dailyPnL: this.tierStats.dailyPnL,
      consecutiveLosses: this.tierStats.consecutiveLosses,
      totalTradesToday: this.tierStats.totalTradesToday,
      profitsLocked: this.tierStats.profitsLocked,
      reinvestPercentage: this.compoundingConfig.reinvestPercentage,
      canTrade: this.canOpenNewTrade(0).allowed,
    };
  }

  public getPortfolioReport(): any {
    const config = this.getConfig();
    const symbols = this.getAllowedSymbols();
    return {
      tier: this.currentTier,
      balance: this.currentBalance,
      maxPositions: config.maxConcurrentPositions,
      minLeverage: config.minLeverage,
      maxLeverage: config.maxLeverage,
      allowedSymbolsCount: symbols.length,
      allowedSymbols: symbols,
      quboEnabled: config.quboEnabled,
      minZScore: config.minZScore,
      stats: this.tierStats,
    };
  }
}
