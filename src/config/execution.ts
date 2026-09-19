// src/config/execution.ts

export type ExecutionMode = 'LIVE' | 'TESTNET' | 'PAPER';

function readExecutionMode(): ExecutionMode {
  const envMode = process.env.EXECUTION_MODE?.toUpperCase() || process.env.VITE_EXECUTION_MODE?.toUpperCase();
  if (envMode === 'LIVE') return 'LIVE';
  if (envMode === 'TESTNET') return 'TESTNET';
  return 'PAPER';
}

const mode = readExecutionMode();

export const EXECUTION = Object.freeze({
  mode,
  restUrl: mode === 'LIVE' ? 'https://fapi.binance.com' : 'https://testnet.binancefuture.com',
  wsUrl: mode === 'LIVE' ? 'wss://fstream.binance.com/ws' : 'wss://fstream.binancefuture.com/ws',
  apiKey: process.env.EXCHANGE_API_KEY || process.env.BINANCE_API_KEY || '',
  apiSecret: process.env.EXCHANGE_API_SECRET || process.env.BINANCE_API_SECRET || '',
});
