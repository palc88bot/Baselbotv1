/**
 * Basel Quantum Algorithmic Trading System
 * CLI & Automated Headless Demo Runner
 */

import { IntegrationBootstrap } from './IntegrationBootstrap';
import { TradingPipeline } from './TradingPipeline';

export async function runHeadlessDemo() {
  console.log('====================================================');
  console.log('  BASEL QUANTUM ALGORITHMIC TRADING ENGINE DEMO     ');
  console.log('====================================================');

  console.log('\n[1] Running Subsystem Diagnostics & Bootstrap...');
  const bootReport = IntegrationBootstrap.runDiagnostics();
  bootReport.diagnostics.forEach((d) => {
    console.log(`  - [${d.status}] ${d.system} (${d.latencyMs}ms): ${d.details}`);
  });

  console.log('\n[2] Initializing Trading Pipeline...');
  const pipeline = new TradingPipeline();
  pipeline.start();

  console.log('\n[3] Solving Initial QUBO Allocation (Quantum Annealing)...');
  const solution = pipeline.runQuantumOptimization();
  console.log(`  Convergence in ${solution.solveTimeMs}ms with Energy: ${solution.energy}`);
  console.log('  Allocations:');
  Object.entries(solution.normalizedWeights).forEach(([sym, w]) => {
    console.log(`    * ${sym}: ${(w * 100).toFixed(1)}%`);
  });

  console.log('\n[4] Trading Pipeline active and listening to order book ticks.\n');
  return pipeline;
}
