/**
 * Basel Quantum Algorithmic Trading System
 * Extreme Market Stress Scenarios & Shock Testing
 */

import { StressScenario } from '../domain/types';

export const PRESET_STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'FLASH_CRASH_2010',
    name: 'Flash Crash Microstructure Drain',
    nameAr: 'انهيار فلاش المفاجئ ونضوب السيولة السريع',
    description: 'Sudden 9% cascade drop in 5 minutes with order book liquidity evaporation and spread explosion (2010 style).',
    priceDropPct: 8.5,
    volatilityMultiplier: 5.2,
    spreadMultiplier: 6.0,
    liquidityDrainPct: 75,
    recoveryType: 'V_SHAPED',
  },
  {
    id: 'COVID_LIQUIDITY_2020',
    name: 'Global Liquidity Crunch (March 2020)',
    nameAr: 'أزمة السيولة العالمية (مارس 2020)',
    description: 'Systemic liquidity freeze across all risk assets with correlated sell-off and high volatility clustering.',
    priceDropPct: 18.0,
    volatilityMultiplier: 6.8,
    spreadMultiplier: 4.5,
    liquidityDrainPct: 60,
    recoveryType: 'SLOW_GRIND',
  },
  {
    id: 'CRYPTO_DEPEG_CASCADE',
    name: 'Algorithmic Depeg Liquidation Cascade',
    nameAr: 'انهيار وفك ارتباط أصول وتصفيات متتالية',
    description: 'Severe basis breakdown causing cascading liquidations on perpetual swaps and extreme order flow imbalance.',
    priceDropPct: 24.5,
    volatilityMultiplier: 8.5,
    spreadMultiplier: 7.2,
    liquidityDrainPct: 85,
    recoveryType: 'L_SHAPED',
  },
  {
    id: 'BLACK_SWAN_VOLATILITY',
    name: 'Extreme Tail-Risk Volatility Spike',
    nameAr: 'صدمة البجعة السوداء وتقلبات الذيل العظمى',
    description: 'Massive intraday 5-sigma price swings violating parametric Gaussian distribution assumptions.',
    priceDropPct: 12.0,
    volatilityMultiplier: 9.0,
    spreadMultiplier: 5.0,
    liquidityDrainPct: 50,
    recoveryType: 'V_SHAPED',
  },
  {
    id: 'SPREAD_EXPLOSION',
    name: 'Exchange Outage Spread Blowout',
    nameAr: 'انفجار فروق الأسعار وانقطاع التغذية',
    description: 'Bid-Ask spreads widen by 12x due to market maker withdrawal, triggering pre-trade risk halts.',
    priceDropPct: 4.0,
    volatilityMultiplier: 3.5,
    spreadMultiplier: 12.0,
    liquidityDrainPct: 80,
    recoveryType: 'V_SHAPED',
  },
];

export const STRESS_SCENARIOS_CATALOG = PRESET_STRESS_SCENARIOS;

