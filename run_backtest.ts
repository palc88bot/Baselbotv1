import { BacktestEngine } from './src/backtest/BacktestEngine';

const config = {
    symbols: ['BTC/USDT', 'ETH/USDT'],
    startDate: '2023-09-01',
    endDate: '2024-09-01',
    initialCapital: 10000,
    commission: 0.0004,
    slippage: 0.0001,
    maxLeverage: 3 // نستخدم رافعة منخفضة في الباك تست للواقعية
};

const engine = new BacktestEngine(config);
engine.run().then(result => {
    console.log('Final Result:', result);
    process.exit(0);
});
