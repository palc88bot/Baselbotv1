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
