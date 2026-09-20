// src/utils/stats.ts

/**
 * Robust Hurst Exponent calculation using Rescaled Range (R/S) Analysis
 */
export function hurstRS(series: number[], minChunk: number = 8): number {
  if (!series || series.length < 32) return 0.5;

  const n = series.length;
  // Calculate log returns or simple diffs
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) {
    diffs.push(series[i] - series[i - 1]);
  }

  const chunkSizes: number[] = [];
  for (let s = minChunk; s <= Math.floor(diffs.length / 2); s = Math.floor(s * 1.5) + 1) {
    chunkSizes.push(s);
  }

  if (chunkSizes.length < 2) return 0.5;

  const logSizes: number[] = [];
  const logRS: number[] = [];

  for (const size of chunkSizes) {
    const numChunks = Math.floor(diffs.length / size);
    if (numChunks === 0) continue;

    let totalRS = 0;
    for (let c = 0; c < numChunks; c++) {
      const chunk = diffs.slice(c * size, (c + 1) * size);
      const mean = chunk.reduce((sum, v) => sum + v, 0) / size;

      // Cumulative deviations
      let cumDev = 0;
      let minCum = 0;
      let maxCum = 0;
      let sumSqDiff = 0;

      for (let i = 0; i < size; i++) {
        const dev = chunk[i] - mean;
        cumDev += dev;
        if (cumDev < minCum) minCum = cumDev;
        if (cumDev > maxCum) maxCum = cumDev;
        sumSqDiff += dev * dev;
      }

      const range = maxCum - minCum;
      const std = Math.sqrt(sumSqDiff / size);

      if (std > 1e-12) {
        totalRS += range / std;
      }
    }

    const avgRS = totalRS / numChunks;
    if (avgRS > 0) {
      logSizes.push(Math.log(size));
      logRS.push(Math.log(avgRS));
    }
  }

  if (logSizes.length < 2) return 0.5;

  // Linear regression slope
  const meanX = logSizes.reduce((a, b) => a + b, 0) / logSizes.length;
  const meanY = logRS.reduce((a, b) => a + b, 0) / logRS.length;

  let num = 0;
  let den = 0;
  for (let i = 0; i < logSizes.length; i++) {
    const dx = logSizes[i] - meanX;
    const dy = logRS[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }

  const h = den !== 0 ? num / den : 0.5;
  return Math.max(0.01, Math.min(0.99, h));
}

/**
 * Detrended Fluctuation Analysis (DFA) for robust Hurst Exponent calculation
 */
export function calculateHurstDFA(series: number[], minScale: number = 8, maxScale: number = 64): number {
  if (!series || series.length < 32) return 0.5;

  const n = series.length;
  // 1. Calculate cumulative sum of deviations from mean (profile)
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const profile = new Float64Array(n);
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += series[i] - mean;
    profile[i] = cum;
  }

  // 2. Compute fluctuation function F(s) for multiple scales
  const scales: number[] = [];
  const maxS = Math.min(maxScale, Math.floor(n / 4));
  for (let s = minScale; s <= maxS; s = Math.floor(s * 1.4) + 1) {
    scales.push(s);
  }

  if (scales.length < 2) return hurstRS(series);

  const logScales: number[] = [];
  const logF: number[] = [];

  for (const s of scales) {
    const numSegments = Math.floor(n / s);
    if (numSegments === 0) continue;

    let totalVariance = 0;

    for (let seg = 0; seg < numSegments; seg++) {
      const offset = seg * s;
      // Linear regression trend fit within segment
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;

      for (let i = 0; i < s; i++) {
        const x = i;
        const y = profile[offset + i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }

      const meanX = sumX / s;
      const meanY = sumY / s;
      const slope = (sumXY - s * meanX * meanY) / (sumXX - s * meanX * meanX || 1);
      const intercept = meanY - slope * meanX;

      // Calculate mean square error (detrended variance)
      let segVar = 0;
      for (let i = 0; i < s; i++) {
        const trend = intercept + slope * i;
        const diff = profile[offset + i] - trend;
        segVar += diff * diff;
      }
      totalVariance += segVar / s;
    }

    const rms = Math.sqrt(totalVariance / numSegments);
    if (rms > 0) {
      logScales.push(Math.log(s));
      logF.push(Math.log(rms));
    }
  }

  if (logScales.length < 2) return 0.5;

  // Linear regression of log(F(s)) against log(s)
  const meanX = logScales.reduce((a, b) => a + b, 0) / logScales.length;
  const meanY = logF.reduce((a, b) => a + b, 0) / logF.length;

  let num = 0;
  let den = 0;
  for (let i = 0; i < logScales.length; i++) {
    const dx = logScales[i] - meanX;
    const dy = logF[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }

  const alpha = den !== 0 ? num / den : 0.5;
  return Math.max(0.01, Math.min(0.99, Number(alpha.toFixed(3))));
}

/**
 * Sigmoid function
 */
export function sigmoid(x: number, k: number = 12): number {
  return 1 / (1 + Math.exp(-k * x));
}

/**
 * Clamp helper
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
