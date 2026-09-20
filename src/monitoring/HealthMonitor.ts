/**
 * Basel Quantum Algorithmic Trading System
 * High-Precision Telemetry & Pipeline Latency Health Monitor
 */

import { PipelineLatency, SystemHealth } from '../domain/types';

export class HealthMonitor {
  private startTime: number = Date.now();
  private pipelineLatency: PipelineLatency = {
    feedParsingUs: 42,
    featureExtractionUs: 115,
    strategySignalUs: 68,
    quboOptimizationMs: 3.4,
    riskValidationUs: 55,
    orderDispatchUs: 85,
    totalPipelineMs: 3.76,
  };
  private messagesCount: number = 0;
  private ordersCount: number = 0;
  private lastCalculationTime: number = Date.now();
  private messagesPerSec: number = 0;
  private ordersPerSec: number = 0;

  public recordMessage() {
    this.messagesCount++;
  }

  public recordOrder() {
    this.ordersCount++;
  }

  public updateLatency(latency: Partial<PipelineLatency>) {
    this.pipelineLatency = { ...this.pipelineLatency, ...latency };
    this.pipelineLatency.totalPipelineMs = Number(
      (
        (this.pipelineLatency.feedParsingUs +
          this.pipelineLatency.featureExtractionUs +
          this.pipelineLatency.strategySignalUs +
          this.pipelineLatency.riskValidationUs +
          this.pipelineLatency.orderDispatchUs) /
          1000 +
        this.pipelineLatency.quboOptimizationMs
      ).toFixed(2)
    );
  }

  public getHealth(): SystemHealth {
    const now = Date.now();
    const elapsedSec = Math.max(1, (now - this.lastCalculationTime) / 1000);

    if (elapsedSec >= 1.0) {
      this.messagesPerSec = Math.round(this.messagesCount / elapsedSec);
      this.ordersPerSec = Math.round(this.ordersCount / elapsedSec);
      this.messagesCount = 0;
      this.ordersCount = 0;
      this.lastCalculationTime = now;
    }

    const uptimeSeconds = Math.floor((now - this.startTime) / 1000);
    const mem = process.memoryUsage ? process.memoryUsage() : { heapUsed: 142 * 1024 * 1024 };
    const memoryUsageMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(1));

    // Calculate approximate CPU usage from process.cpuUsage if available
    let cpuUsagePct = 0;
    if (process.cpuUsage) {
      const cpu = process.cpuUsage();
      const totalMicros = (cpu.user + cpu.system);
      const elapsedMicros = Math.max(1, (now - this.startTime) * 1000);
      cpuUsagePct = Number(Math.min(100, Math.max(0, (totalMicros / elapsedMicros) * 100)).toFixed(1));
    }

    return {
      status: 'OPTIMAL',
      uptimeSeconds,
      cpuUsagePct,
      memoryUsageMb,
      activeFeedsCount: 6,
      messagesPerSecond: this.messagesPerSec,
      ordersPerSecond: this.ordersPerSec,
      pipelineLatency: { ...this.pipelineLatency },
      lastHeartbeat: now,
    };
  }
}
