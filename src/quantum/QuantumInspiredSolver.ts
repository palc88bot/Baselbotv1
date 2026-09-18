/**
 * Basel Quantum Algorithmic Trading System
 * Quantum-Inspired QUBO Solvers
 * (Simulated Annealing, Quantum Annealing / Transverse-Field Tunneling, Tabu Search)
 */

import { AssetSymbol, QuboMatrix, QuboSolution, SolverType } from '../domain/types';
import { QuboPortfolio } from '../portfolio/QuboPortfolio';

export interface SolverOptions {
  numSweeps?: number;
  initialTemperature?: number;
  finalTemperature?: number;
  gammaInitial?: number; // Transverse magnetic field for quantum tunneling
  numTrotterSlices?: number; // Quantum Trotter replica slices
  tabuTenure?: number;
}

export class QuantumInspiredSolver {
  /**
   * Quantum Simulated Annealing (QSA) via Path-Integral / Transverse-Field Tunneling
   * Simulates quantum spin flips under Hamiltonian:
   * H(t) = \Gamma(t) \sum_i \sigma_i^x + (1 - \Gamma(t)) H_{QUBO}
   */
  public static solveQuantumAnnealing(
    assets: AssetSymbol[],
    qubo: QuboMatrix,
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    options: SolverOptions = {}
  ): QuboSolution {
    const startTime = performance.now();
    const dim = qubo.dimension;
    const numSweeps = options.numSweeps || 350;
    const trotterSlices = options.numTrotterSlices || 8;

    // Initialize Trotter replicas (slices)
    const replicas: number[][] = Array(trotterSlices)
      .fill(0)
      .map(() => Array(dim).fill(0).map(() => (Math.random() > 0.5 ? 1 : 0)));

    let bestVector = [...replicas[0]];
    let bestEnergy = QuboPortfolio.evaluateEnergy(qubo, bestVector);

    for (let sweep = 0; sweep < numSweeps; sweep++) {
      const s = sweep / numSweeps;
      // Annealing schedule: Transverse field Gamma decreases from 1 to 0, QUBO weight increases from 0 to 1
      const gamma = (1 - s) * (options.gammaInitial || 2.0);
      const beta = 0.5 + s * 10.0; // Inverse thermal temperature

      // Quantum coupling J_perp between adjacent Trotter slices
      const jPerp = -0.5 * Math.log(Math.tanh(Math.max(1e-4, gamma / trotterSlices)));

      for (let r = 0; r < trotterSlices; r++) {
        const nextR = (r + 1) % trotterSlices;
        const prevR = (r - 1 + trotterSlices) % trotterSlices;

        for (let i = 0; i < dim; i++) {
          // Classical QUBO energy delta from flipping bit i in slice r
          const currentBit = replicas[r][i];
          const flippedBit = 1 - currentBit;

          // Calculate energy delta
          let deltaEClassical = 0;
          for (let j = 0; j < dim; j++) {
            if (i === j) {
              deltaEClassical += (flippedBit - currentBit) * qubo.matrix[i][i];
            } else if (replicas[r][j] === 1) {
              deltaEClassical += (flippedBit - currentBit) * (qubo.matrix[i][j] + qubo.matrix[j][i]);
            }
          }

          // Quantum tunneling coupling penalty between neighboring Trotter replicas
          const spinCurrent = currentBit === 1 ? 1 : -1;
          const spinFlipped = flippedBit === 1 ? 1 : -1;
          const spinNext = replicas[nextR][i] === 1 ? 1 : -1;
          const spinPrev = replicas[prevR][i] === 1 ? 1 : -1;

          const deltaEQuantum = -jPerp * (spinFlipped - spinCurrent) * (spinNext + spinPrev);
          const totalDeltaE = (1 - s) * deltaEQuantum + s * deltaEClassical;

          // Quantum Metropolis Acceptance criterion
          if (totalDeltaE < 0 || Math.random() < Math.exp(-beta * totalDeltaE)) {
            replicas[r][i] = flippedBit;

            // Track global minimum
            const currentEnergy = QuboPortfolio.evaluateEnergy(qubo, replicas[r]);
            if (currentEnergy < bestEnergy) {
              bestEnergy = currentEnergy;
              bestVector = [...replicas[r]];
            }
          }
        }
      }
    }

    const solveTimeMs = Number((performance.now() - startTime).toFixed(2));
    return QuboPortfolio.decodeWeights(
      assets,
      qubo,
      bestVector,
      expectedReturns,
      covarianceMatrix,
      'QUANTUM_ANNEALING',
      solveTimeMs,
      numSweeps
    );
  }

  /**
   * Classical Simulated Annealing (SA) with geometric temperature cooling
   */
  public static solveSimulatedAnnealing(
    assets: AssetSymbol[],
    qubo: QuboMatrix,
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    options: SolverOptions = {}
  ): QuboSolution {
    const startTime = performance.now();
    const dim = qubo.dimension;
    const numSweeps = options.numSweeps || 500;
    const tInit = options.initialTemperature || 10.0;
    const tFinal = options.finalTemperature || 0.01;
    const coolingRate = Math.pow(tFinal / tInit, 1 / numSweeps);

    let state: number[] = Array(dim).fill(0).map(() => (Math.random() > 0.5 ? 1 : 0));
    let currentEnergy = QuboPortfolio.evaluateEnergy(qubo, state);

    let bestState = [...state];
    let bestEnergy = currentEnergy;
    let temp = tInit;

    for (let step = 0; step < numSweeps; step++) {
      for (let i = 0; i < dim; i++) {
        const flipIdx = Math.floor(Math.random() * dim);
        const originalBit = state[flipIdx];
        state[flipIdx] = 1 - originalBit;

        const newEnergy = QuboPortfolio.evaluateEnergy(qubo, state);
        const deltaE = newEnergy - currentEnergy;

        if (deltaE < 0 || Math.random() < Math.exp(-deltaE / Math.max(0.001, temp))) {
          currentEnergy = newEnergy;
          if (currentEnergy < bestEnergy) {
            bestEnergy = currentEnergy;
            bestState = [...state];
          }
        } else {
          // Revert flip
          state[flipIdx] = originalBit;
        }
      }
      temp *= coolingRate;
    }

    const solveTimeMs = Number((performance.now() - startTime).toFixed(2));
    return QuboPortfolio.decodeWeights(
      assets,
      qubo,
      bestState,
      expectedReturns,
      covarianceMatrix,
      'SIMULATED_ANNEALING',
      solveTimeMs,
      numSweeps
    );
  }

  /**
   * Tabu Search Metaheuristic with short-term memory list
   */
  public static solveTabuSearch(
    assets: AssetSymbol[],
    qubo: QuboMatrix,
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    options: SolverOptions = {}
  ): QuboSolution {
    const startTime = performance.now();
    const dim = qubo.dimension;
    const maxIterations = options.numSweeps || 250;
    const tabuTenure = options.tabuTenure || 7;

    let currentState: number[] = Array(dim).fill(0).map(() => (Math.random() > 0.6 ? 1 : 0));
    let currentEnergy = QuboPortfolio.evaluateEnergy(qubo, currentState);

    let bestState = [...currentState];
    let bestEnergy = currentEnergy;

    // Tabu list stores the iteration until which bit flip is forbidden
    const tabuList = Array(dim).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      let bestNeighborIdx = -1;
      let bestNeighborEnergy = Infinity;

      for (let i = 0; i < dim; i++) {
        // Test neighbor by flipping bit i
        currentState[i] = 1 - currentState[i];
        const neighborEnergy = QuboPortfolio.evaluateEnergy(qubo, currentState);
        currentState[i] = 1 - currentState[i]; // revert

        const isTabu = tabuList[i] > iter;
        const aspirationCriterion = neighborEnergy < bestEnergy; // allow tabu move if it beats global best

        if ((!isTabu || aspirationCriterion) && neighborEnergy < bestNeighborEnergy) {
          bestNeighborEnergy = neighborEnergy;
          bestNeighborIdx = i;
        }
      }

      if (bestNeighborIdx !== -1) {
        currentState[bestNeighborIdx] = 1 - currentState[bestNeighborIdx];
        currentEnergy = bestNeighborEnergy;
        tabuList[bestNeighborIdx] = iter + tabuTenure;

        if (currentEnergy < bestEnergy) {
          bestEnergy = currentEnergy;
          bestState = [...currentState];
        }
      }
    }

    const solveTimeMs = Number((performance.now() - startTime).toFixed(2));
    return QuboPortfolio.decodeWeights(
      assets,
      qubo,
      bestState,
      expectedReturns,
      covarianceMatrix,
      'TABU_SEARCH',
      solveTimeMs,
      maxIterations
    );
  }
}
