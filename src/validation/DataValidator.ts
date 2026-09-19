export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class DataValidator {
  /**
   * Validates and cleans candle data
   */
  public static validate(candles: Candle[], intervalMs: number = 3600000): Candle[] {
    if (candles.length === 0) return [];

    // 1. Sort by timestamp
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    const cleaned: Candle[] = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];

      // 2. Filter outliers (e.g., price <= 0)
      if (current.close <= 0 || current.high <= 0 || current.low <= 0 || current.open <= 0) {
        continue;
      }

      // 3. Handle duplicates
      if (cleaned.length > 0 && current.timestamp === cleaned[cleaned.length - 1].timestamp) {
        continue;
      }

      // 4. Fill gaps
      if (cleaned.length > 0) {
        const last = cleaned[cleaned.length - 1];
        const gap = current.timestamp - last.timestamp;

        if (gap > intervalMs) {
          const gapsCount = Math.floor(gap / intervalMs) - 1;
          console.warn(`⚠️ Gap detected: ${gapsCount} missing candles between ${new Date(last.timestamp).toISOString()} and ${new Date(current.timestamp).toISOString()}`);
          
          // Linear interpolation for gaps
          for (let g = 1; g <= gapsCount; g++) {
            const ratio = g / (gapsCount + 1);
            const interpolatedPrice = last.close + (current.open - last.close) * ratio;
            
            cleaned.push({
              timestamp: last.timestamp + g * intervalMs,
              open: interpolatedPrice,
              high: interpolatedPrice,
              low: interpolatedPrice,
              close: interpolatedPrice,
              volume: 0
            });
          }
        }
      }

      cleaned.push(current);
    }

    console.log(`✅ Data Validation Complete: ${candles.length} -> ${cleaned.length} candles`);
    return cleaned;
  }
}
