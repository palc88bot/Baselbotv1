/**
 * DecisionEngine.ts
 * محرك القرار النقي الموحد بين التداول الحي والباك تست (Single Source of Truth)
 * يضمن تطابق القرارات بنسبة 100% بين الاختبار التاريخي والتنفيذ الحي.
 */

import { AssetSymbol, TradingSignal } from '../domain/types';
import { CalculatedFeatures } from '../features/FeatureEngine';
import { RegimeAnalysis } from '../risk/RegimeDetector';

export interface StrategyParams {
  entryZ: number;           // عتبة Z-score للدخول (افتراضياً 1.6)
  maxHalfLife: number;      // أقصى نصف عمر للارتداد بالشموع (افتراضياً 35)
  maxHurst: number;         // أقصى مؤشر هيرست لمنع الدخول في الأسواق الاتجاهية (افتراضياً 0.58)
  rsiBuy?: number;          // عتبة تأكيد الشراء من RSI (افتراضياً 45)
  rsiSell?: number;         // عتبة تأكيد البيع من RSI (افتراضياً 55)
  minConfidence?: number;   // الحد الأدنى لثقة الإشارة (افتراضياً 0.50)
  candleIntervalMs?: number;// مدة الشمعة بالملي ثانية لحساب الخروج الزمني (افتراضياً 60,000)
}

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  entryZ: 1.6,
  maxHalfLife: 35,
  maxHurst: 0.58,
  rsiBuy: 45,
  rsiSell: 55,
  minConfidence: 0.50,
  candleIntervalMs: 60 * 1000,
};

export interface DecisionInput {
  features: CalculatedFeatures;
  regime?: RegimeAnalysis;
  params?: Partial<StrategyParams>;
}

/**
 * دالة اتخاذ القرار النقية: تطبق شروط Ornstein-Uhlenbeck مع فلاتر النظام والـ R:R
 */
export function decide(input: DecisionInput): TradingSignal | null {
  const params: StrategyParams = { ...DEFAULT_STRATEGY_PARAMS, ...(input.params || {}) };
  const { features, regime } = input;
  const {
    symbol,
    currentPrice,
    zScore,
    ouMu,
    ouSigma,
    halfLifePeriods,
    hurstExponent,
    rsi14,
  } = features;

  // 1. فلتر نظام السوق (Regime Filter): إيقاف الدخول إذا كان السوق باتجاه قوي
  if (regime && !regime.tradingAllowed) {
    return null;
  }

  // 2. فلتر هيرست ونصف العمر (Mean-Reversion Suitability)
  if (hurstExponent > params.maxHurst || halfLifePeriods > params.maxHalfLife || halfLifePeriods <= 0) {
    return null;
  }

  // 3. التحقق من مسافة الوقف وضمان سيجما صالحة
  const safeSigma = ouSigma > 0 ? ouSigma : currentPrice * 0.005;
  const stopDistance = 2 * safeSigma; // البند 11: استخدام 2σ بدلاً من 3σ
  if (stopDistance <= 0) return null;

  let side: 'BUY' | 'SELL' | null = null;
  let strength = 0;
  let reason = '';

  const rsiBuyLimit = params.rsiBuy ?? 45;
  const rsiSellLimit = params.rsiSell ?? 55;

  // شرط الشراء: Z-Score <= -entryZ مع تأكيد RSI
  if (zScore <= -params.entryZ && rsi14 < rsiBuyLimit) {
    side = 'BUY';
    strength = Math.min(1.0, (Math.abs(zScore) - params.entryZ) / params.entryZ + 0.5);
    reason = `OU Mean Reversion BUY: Z-Score ${zScore.toFixed(2)} <= -${params.entryZ.toFixed(2)}, RSI ${rsi14.toFixed(1)}, HL ${halfLifePeriods}p`;
  }
  // شرط البيع: Z-Score >= +entryZ مع تأكيد RSI
  else if (zScore >= params.entryZ && rsi14 > rsiSellLimit) {
    side = 'SELL';
    strength = Math.min(1.0, (Math.abs(zScore) - params.entryZ) / params.entryZ + 0.5);
    reason = `OU Mean Reversion SELL: Z-Score +${zScore.toFixed(2)} >= +${params.entryZ.toFixed(2)}, RSI ${rsi14.toFixed(1)}, HL ${halfLifePeriods}p`;
  }

  // البند 20: التحقق الصارم من أن الإشارة حصراً BUY أو SELL
  if (!side || (side !== 'BUY' && side !== 'SELL')) {
    return null;
  }

  // البند 48: فحص الجدوى الاقتصادية (expectedMove >= 3 * roundTripCost)
  const expectedMove = (Math.abs(zScore) * safeSigma) / currentPrice;
  const roundTripCost = 2 * 0.0004 + 0.0002; // Taker/Maker fees + Slippage
  if (expectedMove < 3 * roundTripCost) {
    return null; // الحركة المتوقعة لا تعوض رسوم التداول والانزلاق
  }

  if (strength < (params.minConfidence ?? 0.50)) {
    return null;
  }

  // البند 11: التحقق من نسبة العائد إلى المخاطرة (R:R Ratio >= 0.75)
  const distanceToTarget = Math.abs(currentPrice - ouMu);
  const rrRatio = distanceToTarget / stopDistance;
  if (rrRatio < 0.75) {
    return null; // نسبة المخاطرة للعائد غير كافية
  }

  const stopLoss = side === 'BUY'
    ? Number((currentPrice - stopDistance).toFixed(2))
    : Number((currentPrice + stopDistance).toFixed(2));

  const takeProfit = Number(ouMu.toFixed(2));
  
  // الخروج الزمني بناءً على نصف عمر الارتداد (2 * halfLife)
  const candleMs = params.candleIntervalMs || 60000;
  const maxHoldMs = Math.max(300000, Math.round(2 * halfLifePeriods * candleMs));

  return {
    id: `SIG-${Date.now().toString(36)}-${symbol.replace('/', '')}`,
    symbol,
    timestamp: Date.now(),
    type: side,
    strength: Number(strength.toFixed(3)),
    zScore,
    halfLife: halfLifePeriods,
    targetPrice: takeProfit,
    stopLoss,
    takeProfit,
    reason,
    strategy: 'Ornstein-Uhlenbeck-Unified',
    maxHoldMs,
  };
}

export class DecisionEngine {
  private params: StrategyParams;

  constructor(params?: Partial<StrategyParams>) {
    this.params = { ...DEFAULT_STRATEGY_PARAMS, ...(params || {}) };
  }

  public setParams(params: Partial<StrategyParams>): void {
    this.params = { ...this.params, ...params };
  }

  public getParams(): StrategyParams {
    return { ...this.params };
  }

  public decide(
    symbol: AssetSymbol,
    features: CalculatedFeatures,
    tier?: string,
    regime?: RegimeAnalysis
  ): { signal: TradingSignal | null } {
    const signal = decide({
      features,
      regime,
      params: this.params,
    });
    return { signal };
  }
}

