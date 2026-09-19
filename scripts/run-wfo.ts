import fs from 'fs';
import { WalkForwardOptimizer } from '../src/backtest/WalkForwardOptimizer';

async function main() {
  const symbol = 'BTCUSDT';
  const dataPath = `./data/${symbol}_1h.json`;

  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Data file not found: ${dataPath}`);
    console.log('💡 Please run: bun run scripts/fetch-historical-data.ts first.');
    return;
  }

  console.log('📂 Loading historical data...');
  const candles = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const candleMap = new Map();
  candleMap.set('BTC/USDT', candles);

  const wfo = new WalkForwardOptimizer(
    ['BTC/USDT'],
    365, // 1 year total
    90,  // 90 days in-sample
    30   // 30 days out-sample
  );

  const endTime = candles[candles.length - 1].timestamp;
  wfo.generateSegments(endTime);
  await wfo.run(candleMap);
}

main();
