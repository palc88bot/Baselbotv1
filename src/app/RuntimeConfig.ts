/**
 * Basel Quantum Algorithmic Trading System
 * Master Dynamic Runtime Configuration
 */

import { AssetSymbol, SolverType } from '../domain/types';

export interface RuntimeConfigState {
  executionMode: 'LIVE_SIMULATION' | 'PAPER_TRADING' | 'TESTNET_EXCHANGE' | 'STRESS_TEST';
  activeSymbols: AssetSymbol[];
  activeSolver: SolverType;
  rebalanceIntervalMs: number;
  autoTradingEnabled: boolean;
  qaoaLayers: number;
  riskAversionLambda: number;
  budgetPenaltyGamma: number;
  maxLeverage: number;
  maxDrawdownCapPct: number;
  enableKillSwitch: boolean;
}

export const INITIAL_RUNTIME_CONFIG: RuntimeConfigState = {
  executionMode: 'LIVE_SIMULATION',
  activeSymbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT'],
  activeSolver: 'QUANTUM_ANNEALING',
  rebalanceIntervalMs: 2500,
  autoTradingEnabled: true,
  qaoaLayers: 3,
  riskAversionLambda: 0.5,
  budgetPenaltyGamma: 5.0,
  maxLeverage: 3.0,
  maxDrawdownCapPct: 6.0,
  enableKillSwitch: true,
};
