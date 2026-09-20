/**
 * Basel Quantum Algorithmic Trading System
 * QUBO Portfolio Formulation Engine (Quadratic Unconstrained Binary Optimization)
 * Maps Markowitz Mean-Variance + Cardinality + Transaction Costs into Ising/QUBO Hamiltonian
 */

import { AssetSymbol, QuboMatrix, QuboProblemConfig, QuboSolution, SolverType } from '../domain/types';

export class QuboPortfolio {
  /**
   * Constructs the QUBO Matrix Q such that:
   * Min H(x) = x^T Q x
   * Where:
   * x_i \in {0, 1} represents binary choice or discretized portfolio weights.
   * Objective: - \sum_i \mu_i w_i + \lambda \sum_{i,j} \sigma_{ij} w_i w_j + P_B (\sum_i w_i - 1)^2 + P_T \sum_i c_i |w_i - w_0|
   */
  public static buildQuboMatrix(
    assets: AssetSymbol[],
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    config: QuboProblemConfig,
    currentWeights?: Record<AssetSymbol, number>
  ): QuboMatrix {
    const numAssets = assets.length;
    const bitsPerAsset = Math.max(1, config.discretizationBits || 2);
    const totalVariables = numAssets * bitsPerAsset;

    // Weight discretization: e.g. for 2 bits per asset: bit0 = 1/3, bit1 = 2/3 (or power of 2 basis)
    const weightFractions: number[] = [];
    const maxVal = Math.pow(2, bitsPerAsset) - 1;
    for (let b = 0; b < bitsPerAsset; b++) {
      weightFractions.push(Math.pow(2, b) / (maxVal * (config.cardinalityLimit || 3)));
    }

    const variableMap: QuboMatrix['variableMap'] = {};
    let varIdx = 0;
    for (let a = 0; a < numAssets; a++) {
      for (let b = 0; b < bitsPerAsset; b++) {
        variableMap[varIdx] = {
          symbol: assets[a],
          bit: b,
          weightFraction: weightFractions[b],
        };
        varIdx++;
      }
    }

    // Initialize NxN symmetric matrix
    const matrix: number[][] = Array(totalVariables).fill(0).map(() => Array(totalVariables).fill(0));
    const linearTerms: number[] = Array(totalVariables).fill(0);

    const lambda = config.riskAversion || 0.5;
    const penaltyBudget = config.budgetPenalty || 5.0;
    const penaltyTx = config.transactionCostPenalty || 0.2;
    const targetBudgetUnits = 1.0;

    // Term 1: Linear Return term - \mu_i * w_i
    for (let i = 0; i < totalVariables; i++) {
      const { symbol, weightFraction } = variableMap[i];
      const ret = expectedReturns[symbol] || 0.05;
      linearTerms[i] -= ret * weightFraction;
    }

    // Term 2: Quadratic Risk (Covariance) term + \lambda * \sigma_{ij} * w_i * w_j
    for (let i = 0; i < totalVariables; i++) {
      const assetI = assets.indexOf(variableMap[i].symbol);
      const wI = variableMap[i].weightFraction;

      for (let j = 0; j < totalVariables; j++) {
        const assetJ = assets.indexOf(variableMap[j].symbol);
        const wJ = variableMap[j].weightFraction;
        const cov = covarianceMatrix[assetI]?.[assetJ] || (assetI === assetJ ? 0.04 : 0.005);

        matrix[i][j] += lambda * cov * wI * wJ;
      }
    }

    // Term 3: Budget Constraint Penalty P_B * (\sum_i w_i - 1)^2
    // (\sum w_i - 1)^2 = \sum_i w_i^2 + 2 \sum_{i < j} w_i w_j - 2 \sum_i w_i + 1
    // Since x_i \in {0,1}, x_i^2 = x_i
    for (let i = 0; i < totalVariables; i++) {
      const wI = variableMap[i].weightFraction;
      // Linear component: P_B * (w_i^2 - 2 * targetBudget * w_i)
      linearTerms[i] += penaltyBudget * (wI * wI - 2 * targetBudgetUnits * wI);

      for (let j = 0; j < totalVariables; j++) {
        if (i !== j) {
          const wJ = variableMap[j].weightFraction;
          matrix[i][j] += penaltyBudget * (wI * wJ);
        }
      }
    }

    // Term 4: Transaction Cost Penalty if currentWeights exist
    if (currentWeights) {
      for (let i = 0; i < totalVariables; i++) {
        const { symbol, weightFraction } = variableMap[i];
        const prevW = currentWeights[symbol] || 0;
        // Linearized penalty for rebalancing deviation
        linearTerms[i] += penaltyTx * (weightFraction - 2 * prevW * weightFraction);
      }
    }

    // Fold linear terms into diagonal matrix elements (since x_i^2 = x_i)
    for (let i = 0; i < totalVariables; i++) {
      matrix[i][i] += linearTerms[i];
    }

    return {
      dimension: totalVariables,
      matrix,
      variableMap,
      linearTerms,
      constantOffset: penaltyBudget * (targetBudgetUnits * targetBudgetUnits),
    };
  }

  /**
   * Computes energy H(x) = x^T Q x + constantOffset
   */
  public static evaluateEnergy(qubo: QuboMatrix, bitVector: number[]): number {
    const dim = qubo.dimension;
    let energy = qubo.constantOffset;

    for (let i = 0; i < dim; i++) {
      if (bitVector[i] === 1) {
        for (let j = 0; j < dim; j++) {
          if (bitVector[j] === 1) {
            energy += qubo.matrix[i][j];
          }
        }
      }
    }
    return energy;
  }

  /**
   * Decodes a binary vector solution into normalized portfolio asset weights
   */
  public static decodeWeights(
    assets: AssetSymbol[],
    qubo: QuboMatrix,
    bitVector: number[],
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    solverType: SolverType,
    solveTimeMs: number,
    iterations: number
  ): QuboSolution {
    const rawAllocations: Record<AssetSymbol, number> = {} as any;
    assets.forEach((a) => (rawAllocations[a] = 0));

    for (let i = 0; i < qubo.dimension; i++) {
      if (bitVector[i] === 1) {
        const mapping = qubo.variableMap[i];
        rawAllocations[mapping.symbol] += mapping.weightFraction;
      }
    }

    const totalRaw = Object.values(rawAllocations).reduce((a, b) => a + b, 0);
    const normalizedWeights: Record<AssetSymbol, number> = {} as any;

    if (totalRaw > 0.001) {
      for (const asset of assets) {
        normalizedWeights[asset] = Number((rawAllocations[asset] / totalRaw).toFixed(4));
      }
    } else {
      // Fallback equal weight if no bits set
      const eq = 1 / assets.length;
      for (const asset of assets) {
        normalizedWeights[asset] = Number(eq.toFixed(4));
      }
    }

    // Calculate Portfolio Expected Return
    let expReturn = 0;
    for (const asset of assets) {
      expReturn += (normalizedWeights[asset] || 0) * (expectedReturns[asset] || 0.05);
    }

    // Calculate Portfolio Variance = w^T Sigma w
    let portVar = 0;
    for (let i = 0; i < assets.length; i++) {
      for (let j = 0; j < assets.length; j++) {
        const wI = normalizedWeights[assets[i]] || 0;
        const wJ = normalizedWeights[assets[j]] || 0;
        const cov = covarianceMatrix[i]?.[j] || (i === j ? 0.04 : 0.005);
        portVar += wI * wJ * cov;
      }
    }

    const portStd = Math.sqrt(Math.max(0.0001, portVar));
    const riskFreeRate = 0.03;
    const sharpe = (expReturn - riskFreeRate) / portStd;
    const energy = this.evaluateEnergy(qubo, bitVector);

    return {
      binaryVector: bitVector,
      energy: Number(energy.toFixed(6)),
      rawAllocations,
      normalizedWeights,
      expectedReturn: Number(expReturn.toFixed(4)),
      portfolioVariance: Number(portVar.toFixed(6)),
      sharpeRatio: Number(sharpe.toFixed(3)),
      solveTimeMs,
      solverType,
      iterations,
      feasible: totalRaw > 0.2 && totalRaw < 2.5,
    };
  }

  /**
   * Calculates dynamic empirical covariance matrix from asset return series
   */
  public static calculateDynamicCovariance(assets: AssetSymbol[], returnsMap: Map<AssetSymbol, number[]>): number[][] {
    const n = assets.length;
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      const symA = assets[i];
      const retsA = returnsMap.get(symA) || [];
      const meanA = retsA.length > 0 ? retsA.reduce((a, b) => a + b, 0) / retsA.length : 0;

      for (let j = 0; j < n; j++) {
        const symB = assets[j];
        const retsB = returnsMap.get(symB) || [];
        const meanB = retsB.length > 0 ? retsB.reduce((a, b) => a + b, 0) / retsB.length : 0;

        const len = Math.min(retsA.length, retsB.length);
        if (len < 10) {
          matrix[i][j] = i === j ? 0.04 : 0.01;
          continue;
        }

        let covSum = 0;
        for (let k = 0; k < len; k++) {
          covSum += (retsA[k] - meanA) * (retsB[k] - meanB);
        }
        // Annualized covariance (assuming 1m returns: 365*24*60 periods)
        const annualizedFactor = 525600;
        matrix[i][j] = Number(((covSum / (len - 1)) * annualizedFactor).toFixed(6));
      }
    }
    return matrix;
  }

  /**
   * Calculates dynamic expected annualized returns from historical returns
   */
  public static calculateDynamicReturns(assets: AssetSymbol[], returnsMap: Map<AssetSymbol, number[]>): Record<AssetSymbol, number> {
    const result: Record<AssetSymbol, number> = {} as any;
    const annualizedFactor = 525600;

    for (const sym of assets) {
      const rets = returnsMap.get(sym) || [];
      if (rets.length < 10) {
        result[sym] = 0.10;
        continue;
      }
      const mean1m = rets.reduce((a, b) => a + b, 0) / rets.length;
      result[sym] = Number(Math.max(-0.5, Math.min(1.5, mean1m * annualizedFactor)).toFixed(4));
    }
    return result;
  }
}
