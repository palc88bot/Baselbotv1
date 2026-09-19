import { OrderGateway } from './OrderGateway';
import { AssetSymbol } from '../domain/types';
import { PortfolioTier } from '../risk/PortfolioSizer';

export interface ScaleInConfig {
  enabled: boolean;
  maxScaleIns: number;
  scaleInTriggerPercent: number;
  scaleInSizePercent: number;
  scaleInDecay: number;
  minConfirmationCandles: number;
  cooldownMs: number;
  maxTotalExposurePercent: number;  // الحد الأقصى للتعرض الكلي من المحفظة
  maxSingleScaleInPercent: number;  // الحد الأقصى لإضافة واحدة من المحفظة
  requireProfitLock: boolean;       // هل نطلب قفل أرباح قبل الإضافة؟
  minProfitToScale: number;         // الحد الأدنى للربح المضمون (%)
  volatilityFilter: boolean;        // فلتر التقلب
  maxVolatilityPercent: number;     // أقصى تقلب مسموح (%)
}

export interface ScaleInEntry {
  orderId: string;
  entryPrice: number;
  quantity: number;
  timestamp: number;
  profitAtEntry: number;
}

export interface ScaleInState {
  originalOrderId: string;
  symbol: AssetSymbol;
  side: 'BUY' | 'SELL';
  originalEntryPrice: number;
  originalQuantity: number;
  currentTotalQuantity: number;
  averageEntryPrice: number;
  scaleInCount: number;
  lastScaleInTime: number;
  lastScaleInPrice: number;
  scaleInHistory: ScaleInEntry[];
  lockedProfitAmount?: number;
}

export class ScaleInManager {
  private orderGateway: OrderGateway;
  private configs: Record<PortfolioTier, ScaleInConfig>;
  private activePositions: Map<string, ScaleInState> = new Map();
  private currentTier: PortfolioTier = 'MEDIUM';

  constructor(orderGateway: OrderGateway) {
    this.orderGateway = orderGateway;
    
    // Tier-based smart constraints
    this.configs = {
      MICRO: {
        enabled: true,
        maxScaleIns: 1,                    // إضافة واحدة فقط
        scaleInTriggerPercent: 0.05,       // 5% ربح
        scaleInSizePercent: 0.25,          // 25% من الحجم الأصلي
        scaleInDecay: 0.50,                // تقلص سريع
        minConfirmationCandles: 5,
        cooldownMs: 15 * 60 * 1000,        // 15 دقيقة
        maxTotalExposurePercent: 0.30,     // 30% أقصى تعرض من المحفظة
        maxSingleScaleInPercent: 0.10,     // 10% أقصى إضافة واحدة
        requireProfitLock: true,           // يجب قفل جزء من الربح أولاً
        minProfitToScale: 0.03,            // 3% ربح مضمون
        volatilityFilter: true,
        maxVolatilityPercent: 0.015,       // تقلب أقل من 1.5%
      },
      
      SMALL: {
        enabled: true,
        maxScaleIns: 2,
        scaleInTriggerPercent: 0.04,
        scaleInSizePercent: 0.35,
        scaleInDecay: 0.60,
        minConfirmationCandles: 4,
        cooldownMs: 10 * 60 * 1000,        // 10 دقائق
        maxTotalExposurePercent: 0.40,     // 40% تعرض
        maxSingleScaleInPercent: 0.15,     // 15% إضافة واحدة
        requireProfitLock: true,
        minProfitToScale: 0.025,           // 2.5% ربح
        volatilityFilter: true,
        maxVolatilityPercent: 0.02,        // تقلب 2.0%
      },
      
      MEDIUM: {
        enabled: true,
        maxScaleIns: 3,
        scaleInTriggerPercent: 0.03,
        scaleInSizePercent: 0.50,
        scaleInDecay: 0.70,
        minConfirmationCandles: 3,
        cooldownMs: 5 * 60 * 1000,         // 5 دقائق
        maxTotalExposurePercent: 0.50,     // 50% تعرض
        maxSingleScaleInPercent: 0.20,     // 20% إضافة واحدة
        requireProfitLock: false,
        minProfitToScale: 0.02,            // 2% ربح
        volatilityFilter: true,
        maxVolatilityPercent: 0.025,       // تقلب 2.5%
      },
      
      LARGE: {
        enabled: true,
        maxScaleIns: 4,
        scaleInTriggerPercent: 0.025,
        scaleInSizePercent: 0.50,
        scaleInDecay: 0.75,
        minConfirmationCandles: 2,
        cooldownMs: 3 * 60 * 1000,         // 3 دقائق
        maxTotalExposurePercent: 0.60,     // 60% تعرض
        maxSingleScaleInPercent: 0.25,     // 25% إضافة واحدة
        requireProfitLock: false,
        minProfitToScale: 0.015,           // 1.5% ربح
        volatilityFilter: false,
        maxVolatilityPercent: 0.03,        // تقلب 3.0%
      },
    };
  }

  public updateTier(tier: PortfolioTier): void {
    if (this.currentTier !== tier) {
      this.currentTier = tier;
      console.log(`📊 Scale-In Manager: Tier updated to ${tier}`);
    }
  }

  public getConfig(): ScaleInConfig {
    return this.configs[this.currentTier];
  }

  public registerOriginalPosition(
    orderId: string,
    symbol: AssetSymbol,
    side: 'BUY' | 'SELL',
    entryPrice: number,
    quantity: number
  ): void {
    this.activePositions.set(orderId, {
      originalOrderId: orderId,
      symbol,
      side,
      originalEntryPrice: entryPrice,
      originalQuantity: quantity,
      currentTotalQuantity: quantity,
      averageEntryPrice: entryPrice,
      scaleInCount: 0,
      lastScaleInTime: Date.now(),
      lastScaleInPrice: entryPrice,
      scaleInHistory: [],
      lockedProfitAmount: 0,
    });
    console.log(`📝 ScaleInManager registered original position: ${orderId} (${symbol} ${side} ${quantity} @ $${entryPrice})`);
  }

  public setLockedProfit(orderId: string, lockedProfitAmount: number): void {
    const pos = this.activePositions.get(orderId);
    if (pos) {
      pos.lockedProfitAmount = (pos.lockedProfitAmount || 0) + lockedProfitAmount;
    }
  }

  public async evaluateScaleIn(
    orderId: string,
    currentPrice: number,
    currentBalance: number,
    lockedProfit: number = 0,
    currentVolatility: number = 0.01
  ): Promise<{ allowed: boolean; reason?: string; quantity?: number }> {
    const position = this.activePositions.get(orderId);
    if (!position) return { allowed: false, reason: 'Position not found in ScaleInManager' };

    const config = this.getConfig();

    // 1. Check if Scale-In is enabled for current tier
    if (!config.enabled) {
      return { allowed: false, reason: `Scale-In disabled for ${this.currentTier} tier` };
    }

    // 2. Check max scale-ins count
    if (position.scaleInCount >= config.maxScaleIns) {
      return { allowed: false, reason: `Max scale-ins reached (${config.maxScaleIns}) for ${this.currentTier}` };
    }

    // 3. Check Cooldown
    const timeSinceLastScaleIn = Date.now() - position.lastScaleInTime;
    if (position.scaleInCount > 0 && timeSinceLastScaleIn < config.cooldownMs) {
      const remainingMs = config.cooldownMs - timeSinceLastScaleIn;
      return { allowed: false, reason: `Cooldown active (${Math.ceil(remainingMs / 1000)}s remaining)` };
    }

    // 4. Calculate current profit percentage
    const profitPercent = position.side === 'BUY'
      ? (currentPrice - position.averageEntryPrice) / position.averageEntryPrice
      : (position.averageEntryPrice - currentPrice) / position.averageEntryPrice;

    // 5. Check minimum profit threshold
    const minProfitRequired = Math.max(config.minProfitToScale, config.scaleInTriggerPercent);
    if (profitPercent < minProfitRequired) {
      return { 
        allowed: false, 
        reason: `Profit ${(profitPercent * 100).toFixed(2)}% < required ${(minProfitRequired * 100).toFixed(2)}%` 
      };
    }

    // 6. Check profit lock requirement
    const effectiveLockedProfit = (position.lockedProfitAmount || 0) + lockedProfit;
    if (config.requireProfitLock && effectiveLockedProfit <= 0) {
      return { allowed: false, reason: 'Must lock partial profit before scaling in' };
    }

    // 7. Volatility filter
    if (config.volatilityFilter && currentVolatility > config.maxVolatilityPercent) {
      return { 
        allowed: false, 
        reason: `High volatility detected: ${(currentVolatility * 100).toFixed(2)}% > ${(config.maxVolatilityPercent * 100).toFixed(2)}%` 
      };
    }

    // 8. Calculate base scale-in size with decay
    const baseSize = position.originalQuantity * config.scaleInSizePercent;
    const decayFactor = Math.pow(config.scaleInDecay, position.scaleInCount);
    let scaleInQuantity = baseSize * decayFactor;

    // 9. Single Scale-In Cap
    const maxSingleNotional = currentBalance * config.maxSingleScaleInPercent;
    const scaleInNotional = scaleInQuantity * currentPrice;
    
    if (scaleInNotional > maxSingleNotional) {
      scaleInQuantity = maxSingleNotional / Math.max(1, currentPrice);
      console.log(`⚠️ Scale-in size capped by maxSingleScaleInPercent (${(config.maxSingleScaleInPercent * 100).toFixed(0)}%)`);
    }

    // 10. Total Exposure Cap
    const currentExposure = position.currentTotalQuantity * currentPrice;
    const projectedExposure = currentExposure + (scaleInQuantity * currentPrice);
    const maxTotalExposure = currentBalance * config.maxTotalExposurePercent;

    if (projectedExposure > maxTotalExposure) {
      const allowedAddition = maxTotalExposure - currentExposure;
      if (allowedAddition <= 0) {
        return { allowed: false, reason: `Max total exposure reached (${(config.maxTotalExposurePercent * 100).toFixed(0)}%)` };
      }
      scaleInQuantity = allowedAddition / Math.max(1, currentPrice);
      console.log(`⚠️ Scale-in size capped by maxTotalExposurePercent (${(config.maxTotalExposurePercent * 100).toFixed(0)}%)`);
    }

    // 11. Balance check
    const requiredNotional = scaleInQuantity * currentPrice;
    if (requiredNotional > currentBalance * 0.25) {
      return { allowed: false, reason: 'Insufficient balance available for scale-in' };
    }

    // 12. Min Quantity check
    if (scaleInQuantity < 0.0001) {
      return { allowed: false, reason: 'Scale-in quantity too small (< 0.0001)' };
    }

    return {
      allowed: true,
      quantity: Number(scaleInQuantity.toFixed(6)),
    };
  }

  public async executeScaleIn(
    originalOrderId: string,
    currentPrice: number,
    quantity: number
  ): Promise<string | null> {
    const position = this.activePositions.get(originalOrderId);
    if (!position) return null;

    console.log(`🚀 SCALE-IN #${position.scaleInCount + 1} [${this.currentTier}]: Adding ${quantity.toFixed(6)} ${position.symbol} @ $${currentPrice}`);

    const scaleInOrder = this.orderGateway.submitOrder({
      symbol: position.symbol,
      side: position.side,
      type: 'MARKET',
      quantity: Number(quantity.toFixed(6)),
      price: currentPrice,
      strategyId: 'SCALE_IN',
    });

    const profitPercent = position.side === 'BUY'
      ? (currentPrice - position.averageEntryPrice) / position.averageEntryPrice
      : (position.averageEntryPrice - currentPrice) / position.averageEntryPrice;

    const totalCost = (position.averageEntryPrice * position.currentTotalQuantity) + (currentPrice * quantity);
    position.currentTotalQuantity += quantity;
    position.averageEntryPrice = totalCost / position.currentTotalQuantity;
    position.scaleInCount += 1;
    position.lastScaleInTime = Date.now();
    position.lastScaleInPrice = currentPrice;

    position.scaleInHistory.push({
      orderId: scaleInOrder.id,
      timestamp: Date.now(),
      entryPrice: currentPrice,
      quantity,
      profitAtEntry: Number((profitPercent * 100).toFixed(2)),
    });

    console.log(`✅ Scale-In executed for ${originalOrderId}! OrderId: ${scaleInOrder.id}`);
    console.log(`   Tier: ${this.currentTier} | New Avg Entry: $${position.averageEntryPrice.toFixed(2)} | Total Qty: ${position.currentTotalQuantity.toFixed(6)}`);

    return scaleInOrder.id;
  }

  public removePosition(orderId: string): void {
    if (this.activePositions.has(orderId)) {
      this.activePositions.delete(orderId);
      console.log(`🗑️ Removed position from ScaleInManager: ${orderId}`);
    }
  }

  public removeBySymbol(symbol: AssetSymbol): void {
    for (const [orderId, pos] of this.activePositions.entries()) {
      if (pos.symbol === symbol) {
        this.activePositions.delete(orderId);
        console.log(`🗑️ ScaleInManager: Removed tracked position for closed symbol ${symbol} (${orderId})`);
      }
    }
  }

  public getState(orderId: string): ScaleInState | undefined {
    return this.activePositions.get(orderId);
  }

  public getActivePositions(): ScaleInState[] {
    return Array.from(this.activePositions.values());
  }

  public getReport(): any {
    const positions = Array.from(this.activePositions.values());
    const config = this.getConfig();
    return {
      currentTier: this.currentTier,
      tierConfig: config,
      totalTrackedPositions: positions.length,
      totalScaleInsExecuted: positions.reduce((acc, p) => acc + p.scaleInCount, 0),
      positions: positions.map(p => ({
        originalOrderId: p.originalOrderId,
        symbol: p.symbol,
        side: p.side,
        originalEntryPrice: p.originalEntryPrice,
        averageEntryPrice: p.averageEntryPrice,
        originalQuantity: p.originalQuantity,
        currentTotalQuantity: p.currentTotalQuantity,
        scaleInCount: p.scaleInCount,
        maxScaleIns: config.maxScaleIns,
        lastScaleInPrice: p.lastScaleInPrice,
        lockedProfitAmount: p.lockedProfitAmount || 0,
        history: p.scaleInHistory,
      })),
    };
  }
}
