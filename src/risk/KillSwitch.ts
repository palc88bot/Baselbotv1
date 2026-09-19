/**
 * Basel Quantum Algorithmic Trading System
 * Autonomous Multi-Tier Kill Switch & Safety Circuit Breaker
 */

import { KillSwitchLevel } from '../domain/types';

export interface KillSwitchEvent {
  timestamp: number;
  fromLevel: KillSwitchLevel;
  toLevel: KillSwitchLevel;
  reason: string;
  triggeredBy: 'AUTO_RISK_ENGINE' | 'MANUAL_OPERATOR' | 'SPREAD_BLOWOUT' | 'HEALTH_HEARTBEAT_LOSS';
}

const ORDER: Record<KillSwitchLevel, number> = {
  NORMAL: 0,
  SOFT_HALT: 1,
  CIRCUIT_BREAKER: 2,
  HARD_HALT: 2,
  EMERGENCY_LIQUIDATE: 3,
};

export class KillSwitch {
  private level: KillSwitchLevel = 'NORMAL';
  private history: KillSwitchEvent[] = [];
  private listeners: Set<(event: KillSwitchEvent) => void> = new Set();
  private autoRecoveryTimer: any = null;

  public getLevel(): KillSwitchLevel {
    return this.level;
  }

  public isActive(): boolean {
    return this.level !== 'NORMAL';
  }

  public isEntryAllowed(): boolean {
    return this.level === 'NORMAL';
  }

  public isExitAllowed(): boolean {
    return this.level !== 'EMERGENCY_LIQUIDATE'; // In emergency liquidate, automated liquidation takes over
  }

  public getHistory(): KillSwitchEvent[] {
    return [...this.history];
  }

  public subscribe(listener: (event: KillSwitchEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public trigger(
    targetLevel: KillSwitchLevel,
    reason: string,
    triggeredBy: KillSwitchEvent['triggeredBy'] = 'AUTO_RISK_ENGINE'
  ): boolean {
    if ((ORDER[targetLevel] ?? 0) <= (ORDER[this.level] ?? 0)) return false;

    const event: KillSwitchEvent = {
      timestamp: Date.now(),
      fromLevel: this.level,
      toLevel: targetLevel,
      reason,
      triggeredBy,
    };

    this.level = targetLevel;
    this.history.unshift(event);
    if (this.history.length > 50) this.history.pop();

    this.listeners.forEach((fn) => fn(event));
    return true;
  }

  public reset(operatorKey?: string): { success: boolean; message: string } {
    const prev = this.level;
    this.level = 'NORMAL';

    const event: KillSwitchEvent = {
      timestamp: Date.now(),
      fromLevel: prev,
      toLevel: 'NORMAL',
      reason: 'Manual operator safety reset and re-arming',
      triggeredBy: 'MANUAL_OPERATOR',
    };

    this.history.unshift(event);
    this.listeners.forEach((fn) => fn(event));

    return {
      success: true,
      message: `KillSwitch reset successfully. System returned to NORMAL operational status.`,
    };
  }
}
