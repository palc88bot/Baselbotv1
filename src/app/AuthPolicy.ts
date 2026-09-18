/**
 * Basel Quantum Algorithmic Trading System
 * API Security & Role-Based Policy Validator
 */

export type AccessRole = 'READ_ONLY' | 'QUANT_TRADER' | 'RISK_OFFICER' | 'ADMIN_ROOT';

export interface AuthSession {
  role: AccessRole;
  token: string;
  expiresAt: number;
  permissions: string[];
}

export class AuthPolicy {
  public static validateAccess(role: AccessRole, requiredPermission: string): boolean {
    const permissionsMap: Record<AccessRole, string[]> = {
      READ_ONLY: ['VIEW_METRICS', 'VIEW_FEEDS', 'VIEW_LOGS'],
      QUANT_TRADER: ['VIEW_METRICS', 'VIEW_FEEDS', 'VIEW_LOGS', 'MANUAL_TRADE', 'RUN_BACKTEST', 'TUNE_QUBO'],
      RISK_OFFICER: ['VIEW_METRICS', 'VIEW_FEEDS', 'VIEW_LOGS', 'MANUAL_TRADE', 'RUN_BACKTEST', 'TUNE_QUBO', 'TRIGGER_KILLSWITCH', 'RESET_KILLSWITCH'],
      ADMIN_ROOT: ['VIEW_METRICS', 'VIEW_FEEDS', 'VIEW_LOGS', 'MANUAL_TRADE', 'RUN_BACKTEST', 'TUNE_QUBO', 'TRIGGER_KILLSWITCH', 'RESET_KILLSWITCH', 'CONFIG_OVERRIDE'],
    };

    return permissionsMap[role]?.includes(requiredPermission) || false;
  }
}
