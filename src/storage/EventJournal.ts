/**
 * Basel Quantum Algorithmic Trading System
 * Append-Only Event Journal & Audit Store
 */

import { LogEvent, LogSeverity } from '../domain/types';

export class EventJournal {
  private events: LogEvent[] = [];
  private maxCapacity: number;
  private listeners: Set<(event: LogEvent) => void> = new Set();
  private eventCounter: number = 0;

  constructor(maxCapacity: number = 1000) {
    this.maxCapacity = maxCapacity;
  }

  public record(
    severity: LogSeverity,
    source: LogEvent['source'],
    message: string,
    details?: Record<string, any>
  ): LogEvent {
    this.eventCounter += 1;
    const event: LogEvent = {
      id: `EVT-${this.eventCounter}-${Date.now().toString(36)}`,
      timestamp: Date.now(),
      severity,
      source,
      message,
      details,
    };

    this.events.unshift(event);
    if (this.events.length > this.maxCapacity) {
      this.events.pop();
    }

    this.listeners.forEach((fn) => fn(event));
    return event;
  }

  public getEvents(filter?: { severity?: LogSeverity; source?: LogEvent['source']; limit?: number }): LogEvent[] {
    let list = this.events;
    if (filter?.severity) {
      list = list.filter((e) => e.severity === filter.severity);
    }
    if (filter?.source) {
      list = list.filter((e) => e.source === filter.source);
    }
    if (filter?.limit) {
      list = list.slice(0, filter.limit);
    }
    return list;
  }

  public subscribe(listener: (event: LogEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clear() {
    this.events = [];
  }
}
