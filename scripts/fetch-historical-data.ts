import fs from 'fs';
import https from 'https';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let currentStartTime = startTime;
  const cleanSymbol = symbol.replace('/', '');

  console.log(`📥 Fetching ${symbol} data...`);

  while (currentStartTime < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=1000`;
    
    const data = await new Promise<any[]>((resolve, reject) => {
      https.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
        res.on('error', reject);
      });
    });

    if (!Array.isArray(data) || data.length === 0) break;

    const formatted = data.map(c => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    allCandles.push(...formatted);
    currentStartTime = data[data.length - 1][6] + 1;
    
    console.log(`   Progress: ${new Date(currentStartTime).toLocaleDateString()} (${allCandles.length} candles)`);
    await new Promise(r => setTimeout(r, 200)); // Rate limiting
  }

  return allCandles;
}

async function main() {
  const symbol = 'BTCUSDT';
  const interval = '1h';
  const endTime = Date.now();
  const startTime = endTime - 365 * 24 * 60 * 60 * 1000; // 1 year

  try {
    const candles = await fetchKlines(symbol, interval, startTime, endTime);
    const path = `./data/${symbol}_${interval}.json`;
    
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    fs.writeFileSync(path, JSON.stringify(candles, null, 2));
    
    console.log(`\n✅ Saved ${candles.length} candles to ${path}`);
  } catch (error) {
    console.error('❌ Failed to fetch data:', error);
  }
}

main();
