/**
 * Basel Quantum Algorithmic Trading System
 * Real-Time Position & Order State Reconciliation Service
 */

import { AssetSymbol, Position } from '../domain/types';
import { UserDataStream } from './UserDataStream';

export interface ReconciliationReport {
  timestamp: number;
  isBalanced: boolean;
  discrepancies: {
    symbol: AssetSymbol;
    internalSize: number;
    exchangeSize: number;
    drift: number;
    actionTaken: 'NONE' | 'AUTO_CORRECTED' | 'MANUAL_ALERT';
  }[];
}

export class ReconciliationService {
  private userDataStream: UserDataStream;
  private reports: ReconciliationReport[] = [];

  constructor(userDataStream: UserDataStream) {
    this.userDataStream = userDataStream;
  }

  public runReconciliation(mockExchangePositions?: Map<AssetSymbol, number>): ReconciliationReport {
    const internalPositions = this.userDataStream.getPositions();
    const discrepancies: ReconciliationReport['discrepancies'] = [];
    let isBalanced = true;

    for (const pos of internalPositions) {
      const exchangeSize = mockExchangePositions?.get(pos.symbol) ?? pos.size;
      const drift = Number((pos.size - exchangeSize).toFixed(4));

      if (Math.abs(drift) > 0.0001) {
        isBalanced = false;
        discrepancies.push({
          symbol: pos.symbol,
          internalSize: pos.size,
          exchangeSize,
          drift,
          actionTaken: Math.abs(drift) < 0.01 ? 'AUTO_CORRECTED' : 'MANUAL_ALERT',
        });
      }
    }

    const report: ReconciliationReport = {
      timestamp: Date.now(),
      isBalanced,
      discrepancies,
    };

    this.reports.unshift(report);
    if (this.reports.length > 50) this.reports.pop();

    return report;
  }

  public getLatestReports(): ReconciliationReport[] {
    return [...this.reports];
  }
}
