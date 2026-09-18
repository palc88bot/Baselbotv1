/**
 * Basel Quantum Algorithmic Trading System
 * Telemetry & Immutable Audit Event Journal
 */

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle,
  Cpu,
  Download,
  Filter,
  Flame,
  Layers,
  ListFilter,
  Radio,
  RefreshCw,
  Search,
  Server,
  Zap,
} from 'lucide-react';
import { PipelineLatency, SystemHealth, JournalEvent } from '../domain/types';

interface TelemetryProps {
  health: SystemHealth;
  events: JournalEvent[];
  onClearJournal: () => void;
  lang: 'ar' | 'en';
}

export const TelemetryJournalView: React.FC<TelemetryProps> = ({
  health,
  events,
  onClearJournal,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredEvents = events.filter((evt) => {
    const matchSev = filterSeverity === 'ALL' || evt.severity === filterSeverity;
    const matchSearch =
      searchQuery === '' ||
      evt.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSev && matchSearch;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `basel_event_journal_${Date.now()}.json`);
    dlAnchor.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Telemetry Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Metric 1: System Status */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'حالة النظام' : 'Health Status'}</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">{health.status}</div>
          <span className="text-[10px] text-slate-500 block mt-1">Uptime: {(health.uptimeSeconds / 60).toFixed(1)} mins</span>
        </div>

        {/* Metric 2: Message Throughput */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'إنتاجية الرسائل' : 'Throughput'}</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">{health.messagesPerSecond} msg/s</div>
          <span className="text-[10px] text-slate-500 block mt-1">Feeds: {health.activeFeedsCount}</span>
        </div>

        {/* Metric 3: Feature Latency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'استخراج المعالم' : 'Feature Latency'}</span>
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">{health.pipelineLatency.featureExtractionUs} μs</div>
          <span className="text-[10px] text-slate-500 block mt-1">Feed: {health.pipelineLatency.feedParsingUs} μs</span>
        </div>

        {/* Metric 4: QUBO Optimization Time */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'زمن المعالجة الكمومية' : 'QUBO Solve Time'}</span>
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">{health.pipelineLatency.quboOptimizationMs} ms</div>
          <span className="text-[10px] text-slate-500 block mt-1">Convergence: Fast</span>
        </div>

        {/* Metric 5: Memory Usage */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'استهلاك الذاكرة' : 'Memory Usage'}</span>
            <Server className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">{health.memoryUsageMb} MB</div>
          <span className="text-[10px] text-slate-500 block mt-1">Heap: Clean</span>
        </div>

        {/* Metric 6: Active Streams */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{isAr ? 'قنوات الربط النشطة' : 'Active Streams'}</span>
            <Radio className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">{health.activeFeedsCount} Feeds</div>
          <span className="text-[10px] text-slate-500 block mt-1">Orders/s: {health.ordersPerSecond}</span>
        </div>
      </div>

      {/* Latency Pipeline Breakdown Waterfall */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>{isAr ? 'شلال زمن الاستجابة بالميكروثانية (Microsecond Pipeline Latency Waterfall)' : 'Microsecond Latency Waterfall Breakdown'}</span>
          </h3>
        </div>

        <div className="space-y-3 font-mono text-xs">
          <div>
            <div className="flex justify-between text-slate-400 text-[11px] mb-1">
              <span>1. {isAr ? 'تفكيك تغذية السوق (Feed Parsing)' : 'Market Feed Ingestion & Parsing'}</span>
              <span className="text-slate-200">{health.pipelineLatency.feedParsingUs} μs</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div className="bg-cyan-500 h-full rounded-full" style={{ width: '15%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 text-[11px] mb-1">
              <span>2. {isAr ? 'استخراج المعالم وإشارات أورنشتاين (Feature Engine & OU Alpha)' : 'Feature Engine & OU Parameter Estimation'}</span>
              <span className="text-slate-200">{health.pipelineLatency.featureExtractionUs} μs</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full" style={{ width: '35%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 text-[11px] mb-1">
              <span>3. {isAr ? 'التحقق اللحظي من المخاطر (Continuous Risk Validation)' : 'Continuous Risk Engine Validation'}</span>
              <span className="text-slate-200">{health.pipelineLatency.riskValidationUs} μs</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '12%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 text-[11px] mb-1">
              <span>4. {isAr ? 'توليد الأوامر والتوجيه الذكي (SOR & Execution Gateway)' : 'Smart Order Router & Execution Gateway'}</span>
              <span className="text-slate-200">{health.pipelineLatency.orderDispatchUs} μs</span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full" style={{ width: '22%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Event Journal Log Stream */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'سجل أحداث المنظومة غير القابل للتعديل (Immutable Event Journal)' : 'Immutable Audit Event Journal'}</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {filteredEvents.length} / {events.length} Events Logged
            </span>
          </div>

          {/* Controls: Search, Filter, Export */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder={isAr ? 'بحث في السجلات...' : 'Search logs...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Severity Filter */}
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="ALL">ALL Severities</option>
              <option value="INFO">INFO</option>
              <option value="ORDER">ORDER</option>
              <option value="FILL">FILL</option>
              <option value="QUANTUM">QUANTUM</option>
              <option value="WARN">WARN</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Export JSON */}
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Scrolling Log Stream Table */}
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto font-mono text-xs pr-1">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-slate-500 italic">
              {isAr ? 'لا توجد أحداث مطابقة للبحث' : 'No matching events found'}
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:bg-slate-900/60 flex items-start gap-3 transition"
              >
                <span className="text-slate-500 text-[11px] whitespace-nowrap">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                </span>

                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${
                    evt.severity === 'CRITICAL'
                      ? 'bg-rose-950 text-rose-300 border border-rose-700'
                      : evt.severity === 'WARN'
                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                      : evt.severity === 'FILL'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : evt.severity === 'QUANTUM'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {evt.severity}
                </span>

                <span className="text-cyan-400 font-semibold text-[11px] whitespace-nowrap">
                  [{evt.source}]
                </span>

                <span className="text-slate-200 text-[11px] flex-1 break-all">
                  {evt.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
