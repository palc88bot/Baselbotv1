/**
 * Basel Quantum Algorithmic Trading System
 * Integration Bootstrap & System Diagnostic Self-Test
 */

import { AssetSymbol } from '../domain/types';
import { FeatureEngine } from '../features/FeatureEngine';
import { OrderBookBuilder } from '../market-data/OrderBookBuilder';
import { ClassicalBaseline } from '../portfolio/ClassicalBaseline';
import { QuboPortfolio } from '../portfolio/QuboPortfolio';
import { QAOAAdapter } from '../quantum/QAOAAdapter';
import { QuantumInspiredSolver } from '../quantum/QuantumInspiredSolver';
import { RiskEngine } from '../risk/RiskEngine';

export interface BootstrapReport {
  timestamp: number;
  allSystemsGreen: boolean;
  diagnostics: {
    system: string;
    status: 'PASSED' | 'WARNING' | 'FAILED';
    latencyMs: number;
    details: string;
  }[];
}

export class IntegrationBootstrap {
  public static runDiagnostics(): BootstrapReport {
    const diagnostics: BootstrapReport['diagnostics'] = [];
    const symbols: AssetSymbol[] = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT'];

    // 1. OrderBookBuilder Test
    const t0 = performance.now();
    const ob = new OrderBookBuilder(10);
    const book = ob.initialize('BTC/USDT', 91000);
    const t0Elapsed = performance.now() - t0;
    diagnostics.push({
      system: 'L2/L3 OrderBook Reconstruction',
      status: book.bids.length === 10 ? 'PASSED' : 'FAILED',
      latencyMs: Number(t0Elapsed.toFixed(2)),
      details: `Initialized with ${book.bids.length} depth levels, Microprice: $${book.microPrice}, Spread: $${book.spread}`,
    });

    // 2. FeatureEngine Ornstein-Uhlenbeck Test
    const t1 = performance.now();
    const fe = new FeatureEngine();
    const ou = fe.estimateOrnsteinUhlenbeck([91000, 91100, 90950, 91200, 91050, 91150]);
    const t1Elapsed = performance.now() - t1;
    diagnostics.push({
      system: 'Feature Engine & OU Mean Reversion',
      status: ou.theta > 0 ? 'PASSED' : 'FAILED',
      latencyMs: Number(t1Elapsed.toFixed(2)),
      details: `OU Theta: ${ou.theta.toFixed(4)}, Half-life: ${ou.halfLife.toFixed(1)}p, Mu: $${ou.mu.toFixed(2)}`,
    });

    // 3. QUBO Hamiltonian & Quantum Annealing Solver Test
    const t2 = performance.now();
    const expectedReturns = { 'BTC/USDT': 0.08, 'ETH/USDT': 0.12, 'SOL/USDT': 0.16, 'QNT/USDT': 0.14 };
    const cov = [
      [0.04, 0.02, 0.025, 0.015],
      [0.02, 0.06, 0.035, 0.02],
      [0.025, 0.035, 0.08, 0.025],
      [0.015, 0.02, 0.025, 0.05],
    ];
    const qubo = QuboPortfolio.buildQuboMatrix(symbols, expectedReturns as any, cov, {
      assets: symbols,
      riskAversion: 0.5,
      budgetPenalty: 5.0,
      transactionCostPenalty: 0.1,
      cardinalityLimit: 3,
      discretizationBits: 2,
    });
    const sol = QuantumInspiredSolver.solveQuantumAnnealing(symbols, qubo, expectedReturns as any, cov, { numSweeps: 150 });
    const t2Elapsed = performance.now() - t2;
    diagnostics.push({
      system: 'QUBO Quantum Annealing Optimizer',
      status: sol.feasible ? 'PASSED' : 'WARNING',
      latencyMs: Number(t2Elapsed.toFixed(2)),
      details: `Solved 8-qubit Hamiltonian in ${sol.solveTimeMs}ms, Energy: ${sol.energy}, Sharpe: ${sol.sharpeRatio}`,
    });

    // 4. QAOA Variational Circuit Simulator Test
    const t3 = performance.now();
    const qaoaRes = QAOAAdapter.simulateQAOA(qubo, { pLayers: 2 });
    const t3Elapsed = performance.now() - t3;
    diagnostics.push({
      system: 'QAOA Variational Circuit Statevector',
      status: qaoaRes.groundStateProbability > 0 ? 'PASSED' : 'FAILED',
      latencyMs: Number(t3Elapsed.toFixed(2)),
      details: `Calculated 2-layer statevector with Fidelity: ${(qaoaRes.fidelityScore * 100).toFixed(1)}%, Ground Prob: ${(qaoaRes.groundStateProbability * 100).toFixed(1)}%`,
    });

    // 5. Risk Engine Limit Checks
    const t4 = performance.now();
    const re = new RiskEngine();
    const riskCheck = re.evaluateRisk(
      { totalEquity: 100000, availableCash: 100000, usedMargin: 0, marginLevel: 999, freeMargin: 100000, unrealizedPnl: 0, realizedPnl: 0, dailyPnl: 0, dailyPnlPct: 0, currency: 'USDT' },
      []
    );
    const t4Elapsed = performance.now() - t4;
    diagnostics.push({
      system: 'Continuous Risk Engine & VaR Monitor',
      status: !riskCheck.violation ? 'PASSED' : 'FAILED',
      latencyMs: Number(t4Elapsed.toFixed(2)),
      details: `VaR 95%: $${riskCheck.metrics.var95}, CVaR: $${riskCheck.metrics.cvar95}, KillSwitch: ${riskCheck.metrics.killSwitchLevel}`,
    });

    const allSystemsGreen = diagnostics.every((d) => d.status === 'PASSED');

    return {
      timestamp: Date.now(),
      allSystemsGreen,
      diagnostics,
    };
  }
}
