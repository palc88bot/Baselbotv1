import { decide, DecisionEngine, DecisionInput, StrategyParams } from '../src/strategies/DecisionEngine';
import { FeatureEngine } from '../src/features/FeatureEngine';
import { RegimeAnalysis, RegimeDetector } from '../src/risk/RegimeDetector';
import { calculateHurstDFA } from '../src/utils/stats';
import { AssetSymbol, Candle } from '../src/domain/types';

// ==========================================
// 1. تعريف أنواع البيانات للاختبار
// ==========================================
interface TestTick {
  timestamp: number;
  price: number;
  high: number;
  low: number;
  volume: number;
}

interface ParityMismatch {
  tickIndex: number;
  timestamp: string;
  price: number;
  liveDecision: any;
  backtestDecision: any;
}

// ==========================================
// 2. مولد بيانات حتمي (Deterministic Data Generator)
// نستخدم بيانات مصطنعة تحاكي عملية Ornstein-Uhlenbeck لضمان تكرار الاختبار 100%
// ==========================================
function generateDeterministicData(numTicks: number, startPrice: number = 100): TestTick[] {
  const data: TestTick[] = [];
  let price = startPrice;
  const baseTime = 1700000000000;
  const theta = 0.01; // سرعة الارتداد للمتوسط
  const mu = 100;     // المتوسط
  const sigma = 0.5;  // التقلب

  // Simple deterministic pseudo-random LCG to guarantee exact reproducibility
  let seed = 42;
  function lcg() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < numTicks; i++) {
    const dt = 1;
    const drift = theta * (mu - price) * dt;
    const shock = sigma * Math.sqrt(dt) * (lcg() * 2 - 1);
    
    price = price + drift + shock;
    
    data.push({
      timestamp: baseTime + i * 60000,
      price: Number(price.toFixed(2)),
      high: Number((price + lcg() * 0.5).toFixed(2)),
      low: Number((price - lcg() * 0.5).toFixed(2)),
      volume: Math.floor(lcg() * 1000) + 100,
    });
  }
  return data;
}

// ==========================================
// 3. محرك الاختبار الرئيسي
// ==========================================
async function runParityTest() {
  console.log('🧪 Starting Parity Test (Live vs Backtest Equivalence)...\n');

  // المعاملات الثابتة (يجب أن تكون نفس المستخدمة في الإنتاج)
  const params: StrategyParams = {
    entryZ: 1.8,
    rsiBuy: 45,
    rsiSell: 55,
    maxHurst: 0.52,
    maxHalfLife: 30,
    minConfidence: 0.50,
    candleIntervalMs: 60000,
  };

  // تهيئة المحركات
  const featureEngine = new FeatureEngine();
  const regimeDetector = new RegimeDetector();
  const decisionEngine = new DecisionEngine(params);

  // توليد 10,000 شمعة للاختبار
  const ticks = generateDeterministicData(10000, 100);
  console.log(`📊 Generated ${ticks.length} deterministic ticks.\n`);

  let liveDecisionsCount = 0;
  let backtestDecisionsCount = 0;
  const mismatches: ParityMismatch[] = [];

  // فترة إحماء (Warm-up) لحساب المؤشرات الأولية بدقة
  const warmupPeriod = 100;
  const symbol: AssetSymbol = 'BTC/USDT';

  console.log('⏳ Processing ticks and comparing decisions...\n');

  const historyCandles: Candle[] = [];

  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i];

    historyCandles.push({
      timestamp: tick.timestamp,
      open: tick.price,
      high: tick.high,
      low: tick.low,
      close: tick.price,
      volume: tick.volume,
      vwap: tick.price,
    });

    if (historyCandles.length > 200) {
      historyCandles.shift();
    }

    if (i < warmupPeriod) continue;

    // 1. تحديث الحالة الداخلية للمحركات
    const features = featureEngine.extractFeatures(symbol, tick.price, historyCandles);
    const returns = historyCandles.slice(-100).map((c, idx, arr) => idx > 0 ? (c.close - arr[idx - 1].close) : 0).slice(1);
    const hurst = calculateHurstDFA(returns, 8, 32);
    
    const regime: RegimeAnalysis = {
      marketRegime: (hurst > 0.52 ? 'TRENDING' : 'RANGING'),
      tradingAllowed: hurst <= 0.52,
      confidence: 0.8,
      hurstExponent: hurst,
      adx: 20,
      volatilityRegime: 'NORMAL',
      volatility: 0.02,
      trendStrength: 0.3,
      trendScore: 0.2,
      sizeMultiplier: 1.0,
    };

    const input: DecisionInput = { features, regime, params };

    // 2. اتخاذ القرار من "المحرك الحي"
    const liveDecisionResult = decisionEngine.decide(symbol, features, 'AUTO', regime);
    const liveDecision = liveDecisionResult.signal ? {
      ...liveDecisionResult.signal,
      id: 'DETERMINISTIC_ID',
      timestamp: tick.timestamp,
    } : null;

    if (liveDecision) liveDecisionsCount++;

    // 3. اتخاذ القرار من "محرك الـ Backtest" (استدعاء دالة decide النقية الموحدة)
    const rawBacktestSignal = decide(input);
    const backtestDecision = rawBacktestSignal ? {
      ...rawBacktestSignal,
      id: 'DETERMINISTIC_ID',
      timestamp: tick.timestamp,
    } : null;

    if (backtestDecision) backtestDecisionsCount++;

    // 4. التحقق من التكافؤ التام (Deep Equality)
    const liveStr = JSON.stringify(liveDecision);
    const backtestStr = JSON.stringify(backtestDecision);

    if (liveStr !== backtestStr) {
      mismatches.push({
        tickIndex: i,
        timestamp: new Date(tick.timestamp).toISOString(),
        price: tick.price,
        liveDecision: liveDecision,
        backtestDecision: backtestDecision,
      });

      if (mismatches.length >= 5) {
        break;
      }
    }
  }

  // ==========================================
  // 5. تقرير النتائج
  // ==========================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 PARITY TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Ticks Processed:   ${ticks.length - warmupPeriod}`);
  console.log(`Live Decisions Made:     ${liveDecisionsCount}`);
  console.log(`Backtest Decisions Made: ${backtestDecisionsCount}`);
  console.log(`Mismatches Found:        ${mismatches.length}`);
  console.log('='.repeat(60));

  if (mismatches.length === 0 && liveDecisionsCount === backtestDecisionsCount) {
    console.log('\n✅ SUCCESS: Live and Backtest logic are 100% EQUIVALENT.');
    console.log('🚀 The Backtest engine is trustworthy. You may proceed to deployment.');
    process.exit(0);
  } else {
    console.log('\n❌ FAILURE: Divergence detected between Live and Backtest engines!');
    console.log('\nFirst 5 Mismatches:');
    mismatches.forEach((m, idx) => {
      console.log(`\n[${idx + 1}] Tick #${m.tickIndex} @ ${m.timestamp} (Price: $${m.price})`);
      console.log(`   Live:     ${JSON.stringify(m.liveDecision)}`);
      console.log(`   Backtest: ${JSON.stringify(m.backtestDecision)}`);
    });
    console.log('\n⚠️ ACTION REQUIRED: Do NOT deploy or trust backtest results until this divergence is resolved.');
    console.log('   Check for duplicated logic, global state mutations, or non-deterministic functions.');
    process.exit(1);
  }
}

// تشغيل الاختبار
runParityTest().catch((err) => {
  console.error('💥 Parity Test crashed:', err);
  process.exit(1);
});
