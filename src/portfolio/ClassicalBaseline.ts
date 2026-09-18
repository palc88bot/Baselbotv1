/**
 * Basel Quantum Algorithmic Trading System
 * Classical Portfolio Optimization Benchmarks
 * (Markowitz QP, Inverse Volatility, Equal Weight, Min Variance)
 */

import { AssetSymbol, QuboSolution } from '../domain/types';

export class ClassicalBaseline {
  /**
   * Classical Markowitz Mean-Variance via Projected Gradient Descent with simplex constraint
   */
  public static solveMarkowitz(
    assets: AssetSymbol[],
    expectedReturns: Record<AssetSymbol, number>,
    covarianceMatrix: number[][],
    riskAversion: number = 0.5,
    maxIterations: number = 200
  ): QuboSolution {
    const startTime = performance.now();
    const n = assets.length;
    let weights = Array(n).fill(1 / n);
    const lr = 0.05;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Gradient of f(w) = - \mu^T w + \lambda w^T \Sigma w
      const grad = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const ret = expectedReturns[assets[i]] || 0.05;
        let covTerm = 0;
        for (let j = 0; j < n; j++) {
          covTerm += (covarianceMatrix[i]?.[j] || 0) * weights[j];
        }
        grad[i] = -ret + 2 * riskAversion * covTerm;
      }

      // Gradient Step
      for (let i = 0; i < n; i++) {
        weights[i] = Math.max(0, weights[i] - lr * grad[i]);
      }

      // Simplex Projection (normalize sum to 1)
      const sum = weights.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        weights = weights.map((w) => w / sum);
      }
    }

    const normalizedWeights: Record<AssetSymbol, number> = {} as any;
    assets.forEach((sym, idx) => {
      normalizedWeights[sym] = Number(weights[idx].toFixed(4));
    });

    let expRet = 0;
    for (const a of assets) {
      expRet += (normalizedWeights[a] || 0) * (expectedReturns[a] || 0.05);
    }

    let portVar = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVar += (normalizedWeights[assets[i]] || 0) * (normalizedWeights[assets[j]] || 0) * (covarianceMatrix[i]?.[j] || 0);
      }
    }

    const sharpe = (expRet - 0.03) / Math.sqrt(Math.max(0.0001, portVar));
    const solveTimeMs = Number((performance.now() - startTime).toFixed(2));

    return {
      binaryVector: [],
      energy: Number((-expRet + riskAversion * portVar).toFixed(6)),
      rawAllocations: normalizedWeights,
      normalizedWeights,
      expectedReturn: Number(expRet.toFixed(4)),
      portfolioVariance: Number(portVar.toFixed(6)),
      sharpeRatio: Number(sharpe.toFixed(3)),
      solveTimeMs,
      solverType: 'CLASSICAL_MARKOWITZ',
      iterations: maxIterations,
      feasible: true,
    };
  }

  /**
   * Inverse Volatility Weighting
   */
  public static solveInverseVolatility(assets: AssetSymbol[], volatilities: Record<AssetSymbol, number>): Record<AssetSymbol, number> {
    const invVols: number[] = assets.map((a) => 1 / Math.max(0.01, volatilities[a] || 0.2));
    const totalInv = invVols.reduce((a, b) => a + b, 0);
    const weights: Record<AssetSymbol, number> = {} as any;
    assets.forEach((a, i) => {
      weights[a] = Number((invVols[i] / totalInv).toFixed(4));
    });
    return weights;
  }

  /**
   * Equal Weighting (1/N)
   */
  public static solveEqualWeight(assets: AssetSymbol[]): Record<AssetSymbol, number> {
    const w = Number((1 / assets.length).toFixed(4));
    const weights: Record<AssetSymbol, number> = {} as any;
    assets.forEach((a) => (weights[a] = w));
    return weights;
  }
}
