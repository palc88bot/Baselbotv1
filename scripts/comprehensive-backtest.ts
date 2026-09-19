import dotenv from 'dotenv';
dotenv.config();

import { BacktestEngine } from '../src/backtest/BacktestEngine';
import fs from 'fs';
import path from 'path';

async function runComprehensiveBacktest() {
  console.log('🚀 Starting Comprehensive Backtest...\n');

  const config = {
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'QNT/USDT'],
    startDate: '2024-01-01',
    endDate: '2024-09-01',
    initialCapital: 100000,
    commission: 0.0004,
    slippage: 0.0001,
    maxLeverage: 3.0,
  };

  const engine = new BacktestEngine(config);

  try {
    const result = await engine.run();
    
    // Save results to a report file
    const reportDir = path.join(process.cwd(), 'data/reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, `backtest_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    console.log('✨ Backtesting sequence complete.');
  } catch (error) {
    console.error('❌ Backtest failed:', error);
  }
}

runComprehensiveBacktest().catch(console.error);
