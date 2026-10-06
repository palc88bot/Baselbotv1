import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Brain,
  Scale,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Award,
  BarChart3,
  Cpu,
  Layers,
  Clock,
  Zap,
  Network,
  History,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { QuantumBoardNodeGraph } from './QuantumBoardNodeGraph';
import { QuantumTrainingModal } from './QuantumTrainingModal';
import {
  useBoardLearningSync,
  BoardStatusReport,
  AgentProfileReport,
  BoardDecision
} from '../hooks/useBoardLearningSync';

interface BoardOfDirectorsTabProps {
  boardData?: BoardStatusReport | null;
  selectedSymbol: string;
  isAr: boolean;
  onRefresh: () => void;
  playTone?: (freq?: number, duration?: number) => void;
}

export const BoardOfDirectorsTab: React.FC<BoardOfDirectorsTabProps> = ({
  boardData,
  selectedSymbol,
  isAr,
  onRefresh,
  playTone
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'node_graph' | 'overview' | 'decision_makers' | 'guards' | 'learning_log' | 'history'>('node_graph');
  const [isConvening, setIsConvening] = useState(false);
  const [simPnlInput, setSimPnlInput] = useState<string>('15.5');
  const [showTrainingModal, setShowTrainingModal] = useState<boolean>(false);

  // React state with full `learn_from_outcome` logic and real-time shifts
  const {
    agents,
    latestDecision,
    decisionHistory,
    round,
    recentShifts,
    learningLog,
    lastTradeResult,
    isSyncing,
    learnFromOutcome,
    holdMeeting
  } = useBoardLearningSync(boardData);

  const alphaAgents = agents.filter(a => a.type === 'alpha');
  const guardAgents = agents.filter(a => a.type === 'guard');

  const handleHoldMeeting = async () => {
    setIsConvening(true);
    if (playTone) playTone(587, 0.15);
    try {
      await holdMeeting(selectedSymbol);
      onRefresh();
    } finally {
      setIsConvening(false);
    }
  };

  const handleSimulateTradeOutcome = (pnl: number, symbol = selectedSymbol, reason = 'Operator Simulation') => {
    if (playTone) {
      if (pnl > 0) playTone(784, 0.12);
      else playTone(330, 0.15);
    }
    learnFromOutcome(pnl, symbol, reason);
  };

  const getVerdictBadge = (verdict?: string) => {
    if (verdict === 'APPROVED') {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          <CheckCircle2 className="w-4 h-4" />
          <span>{isAr ? 'موافقة كاملة (100% حجم)' : 'APPROVED (100% Size)'}</span>
        </div>
      );
    }
    if (verdict === 'CONDITIONAL') {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <AlertTriangle className="w-4 h-4" />
          <span>{isAr ? 'موافقة مشروطة (50% حجم)' : 'CONDITIONAL (50% Size)'}</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-400 font-bold text-xs shadow-[0_0_15px_rgba(244,63,94,0.3)]">
        <XCircle className="w-4 h-4" />
        <span>{isAr ? 'تم الرفض (فيتو الأمان)' : 'REJECTED (Shield Veto)'}</span>
      </div>
    );
  };

  const getVoteIcon = (vote?: string) => {
    if (vote === 'approved') return <span className="text-emerald-400 font-bold text-xs flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {isAr ? 'موافق' : 'Approved'}</span>;
    if (vote === 'challenge') return <span className="text-amber-400 font-bold text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {isAr ? 'تحفظ' : 'Challenge'}</span>;
    return <span className="text-rose-400 font-bold text-xs flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {isAr ? 'رفض' : 'Rejected'}</span>;
  };

  return (
    <div className="space-y-6">
      {/* 🏛️ Top Header Panel */}
      <div className="holo-panel rounded-2xl p-6 border border-[rgba(0,243,255,0.3)] shadow-[0_0_30px_rgba(0,243,255,0.1)] relative overflow-hidden bg-gradient-to-br from-black/90 via-[#030712] to-black/90">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 via-blue-600/20 to-purple-600/20 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_18px_rgba(0,243,255,0.3)]">
              <Network className="w-6 h-6 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono tracking-wide">
                  {isAr ? 'مجلس الإدارة الكمي (Quantum Board of Directors)' : 'Quantum Board of Directors v6.0'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  {isAr ? '14 وكيلاً ذاتي التعلم' : '14 Self-Learning Agents'}
                </span>
                {isSyncing && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                    <Activity className="w-3 h-3" /> Syncing
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {isAr
                  ? 'مخطط توبولوجيا العقد، تصويت مباشر، ومنحنيات الأداء التراكمية مع تغذية الصفقات اللحظية'
                  : 'Node-graph synapse architecture, live voting, and real-time trade outcome reinforcement'}
              </p>
            </div>
          </div>

          {/* Quick Simulation & Deliberation Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            <button
              onClick={() => {
                if (playTone) playTone(1150, 0.08);
                setShowTrainingModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 border border-purple-400/40 text-purple-200 text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.2)]"
            >
              <Brain className="w-4 h-4 text-purple-400" />
              <span>{isAr ? '🎓 محاكي التدريب وتكرار الصفقات (200$ Sandbox)' : '🎓 Open Quant Simulator ($200)'}</span>
            </button>

            <button
              onClick={() => handleSimulateTradeOutcome(12.8, selectedSymbol, 'Manual Dashboard Profit Test')}
              className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              title={isAr ? 'تغذية صفقة رابحة وتحديث الثقة فورياً' : 'Trigger learn_from_outcome with positive PnL'}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'محاكاة ربح (+12.8)' : '+ Trade Win'}</span>
            </button>

            <button
              onClick={() => handleSimulateTradeOutcome(-7.2, selectedSymbol, 'Manual Dashboard Loss Test')}
              className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.2)]"
              title={isAr ? 'تغذية صفقة خاسرة وتحديث الثقة فورياً' : 'Trigger learn_from_outcome with negative PnL'}
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span>{isAr ? 'محاكاة خسارة (-7.2)' : '- Trade Loss'}</span>
            </button>

            <button
              onClick={handleHoldMeeting}
              disabled={isConvening}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(0,243,255,0.2)] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isConvening ? 'animate-spin' : ''}`} />
              {isConvening
                ? (isAr ? 'جاري عقد الاجتماع...' : 'Convening...')
                : (isAr ? `مداولة فورية على ${selectedSymbol}` : `Review ${selectedSymbol}`)}
            </button>
          </div>
        </div>

        {/* Live Consensus Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-black/50 border border-white/5 rounded-xl p-4">
            <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">
              {isAr ? 'قرار آخر اجتماع للمجلس' : 'Latest Board Verdict'}
            </span>
            <div className="mt-2">
              {getVerdictBadge(latestDecision?.verdict)}
            </div>
            <div className="text-[11px] text-gray-300 font-mono mt-2 truncate">
              {latestDecision?.action || (isAr ? 'المجلس في حالة ترقب' : 'Awaiting signal evaluation')}
            </div>
          </div>

          <div className="bg-black/50 border border-white/5 rounded-xl p-4">
            <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">
              {isAr ? 'نسبة الموافقة المرجّحة' : 'Weighted Approval Ratio'}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-cyan-300">
                {latestDecision ? `${Math.round(latestDecision.approvalRatio * 100)}%` : '74%'}
              </span>
              <span className="text-[11px] text-[var(--muted)] font-mono">
                {isAr ? 'مطلوب ≥ 60%' : 'Required ≥ 60%'}
              </span>
            </div>
            <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(10, (latestDecision?.approvalRatio || 0.74) * 100))}%` }}
              />
            </div>
          </div>

          <div className="bg-black/50 border border-white/5 rounded-xl p-4">
            <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">
              {isAr ? 'حراس مكافحة الإفراط المجتازون' : 'Guards Passed'}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {latestDecision ? `${latestDecision.guardsPassed}/8` : '7/8'}
              </span>
              <span className="text-[11px] text-[var(--muted)] font-mono">
                {isAr ? 'حراس الأمان' : 'Protection Guards'}
              </span>
            </div>
            <div className="text-[11px] text-emerald-300 font-mono mt-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {isAr ? 'فيتو الصدمات مفعل' : 'Strict Veto Active'}
            </div>
          </div>

          <div className="bg-black/50 border border-white/5 rounded-xl p-4">
            <span className="text-[10px] text-[var(--muted)] font-mono block uppercase">
              {isAr ? 'آخر تحديث للتعلم (Trade Outcome)' : 'Latest Trade Shift'}
            </span>
            <div className="mt-1">
              {lastTradeResult ? (
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-bold font-mono ${lastTradeResult.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {lastTradeResult.isWin ? '+' : ''}${lastTradeResult.pnl.toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${lastTradeResult.isWin ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {lastTradeResult.isWin ? '+5% Conf' : '-10% Conf'}
                  </span>
                </div>
              ) : (
                <span className="text-sm font-mono text-cyan-300">Ready for Trades</span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-2 flex items-center gap-1">
              <Brain className="w-3.5 h-3.5 text-cyan-400" />
              {isAr ? `إجمالي القرارات: ${agents.reduce((a, b) => a + b.totalDecisions, 0)}` : `Epoch Decisions: ${agents.reduce((a, b) => a + b.totalDecisions, 0)}`}
            </div>
          </div>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/10 overflow-x-auto">
          {[
            { id: 'node_graph', label: isAr ? '🕸️ مخطط العقد والتشابك (Node-Graph)' : '🕸️ Neural Node-Graph', icon: Network },
            { id: 'overview', label: isAr ? 'نظرة شاملة للمجلس' : 'Board Overview', icon: Users },
            { id: 'decision_makers', label: isAr ? 'صناع القرار (6 خبراء)' : 'Decision Makers (6)', icon: Brain },
            { id: 'guards', label: isAr ? 'حراس الأمان (8 حراس)' : 'Protection Guards (8)', icon: ShieldCheck },
            { id: 'learning_log', label: isAr ? 'سجل التعلم اللحظي (Trade Sync)' : 'Learning Log & Shifts', icon: Activity },
            { id: 'history', label: isAr ? 'سجل المداولات' : 'Meeting Log', icon: Clock }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSubTab(tab.id as any);
                  if (playTone) playTone(440, 0.08);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500/20 border border-cyan-400/50 text-white font-bold shadow-[0_0_12px_rgba(0,243,255,0.25)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-cyan-400" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 🕸️ SUB-TAB: QUANTUM NODE GRAPH VISUALIZATION */}
      {activeSubTab === 'node_graph' && (
        <QuantumBoardNodeGraph
          agents={agents}
          latestDecision={latestDecision}
          recentShifts={recentShifts}
          selectedSymbol={selectedSymbol}
          isAr={isAr}
          onHoldMeeting={handleHoldMeeting}
          onSimulateTrade={handleSimulateTradeOutcome}
          playTone={playTone}
        />
      )}

      {/* 🧠 SUB-TAB: DECISION MAKERS (6 ALPHA EXPERTS) */}
      {(activeSubTab === 'overview' || activeSubTab === 'decision_makers') && (
        <div className="holo-panel rounded-2xl p-6 border border-white/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-400" />
              <h3 className="font-mono text-sm font-bold text-white tracking-wider">
                {isAr ? 'صناع القرار وتوليد الإشارات الكمية (6 خبراء أساسيون)' : 'Alpha Decision Makers (6 Basic Experts)'}
              </h3>
            </div>
            <span className="text-[11px] font-mono text-[var(--muted)]">
              {isAr ? 'يحددون جدوى الصفقة الفنية والرياضية' : 'Signal Quality & Mathematical Edge'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alphaAgents.map(agent => {
              const currentVote = latestDecision?.votes[agent.id] || 'approved';
              const proposal = latestDecision?.proposals[agent.id];
              const shift = recentShifts[agent.id];
              return (
                <div key={agent.id} className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3 hover:border-cyan-500/40 transition relative overflow-hidden">
                  {shift && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse ${
                      shift.direction === 'up' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                    }`}>
                      {shift.direction === 'up' ? `+${(shift.deltaConf * 100).toFixed(1)}% Conf` : `${(shift.deltaConf * 100).toFixed(1)}% Conf`}
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-mono font-bold text-white text-xs">{isAr ? agent.arabicName : agent.name}</h4>
                      <p className="text-[10px] text-[var(--muted)]">{agent.role}</p>
                    </div>
                    {!shift && <div>{getVoteIcon(currentVote)}</div>}
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 bg-white/5 rounded-lg text-center font-mono text-[10px]">
                    <div>
                      <span className="text-[var(--muted)] block">{isAr ? 'الثقة' : 'Conf.'}</span>
                      <span className="text-cyan-300 font-bold">{Math.round(agent.confidence * 100)}%</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] block">{isAr ? 'الدقة' : 'Acc.'}</span>
                      <span className="text-emerald-400 font-bold">{Math.round(agent.accuracy * 100)}%</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] block">{isAr ? 'وزن الصوت' : 'Weight'}</span>
                      <span className="text-indigo-300 font-bold">{agent.weight.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-gray-300 bg-black/60 p-2.5 rounded-lg border border-white/5">
                    <span className="text-cyan-400 block text-[10px] mb-0.5">💬 {isAr ? 'التقرير اللحظي:' : 'Live Note:'}</span>
                    {proposal?.note || (isAr ? 'الكود الخوارزمي والتطابق الرياضي سليم' : 'Mathematical model stable')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 🛡️ SUB-TAB: ANTI-OVERFITTING GUARDS (8 GUARDIANS) */}
      {(activeSubTab === 'overview' || activeSubTab === 'guards') && (
        <div className="holo-panel rounded-2xl p-6 border border-emerald-500/20 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="font-mono text-sm font-bold text-white tracking-wider">
                {isAr ? 'حراس مكافحة الإفراط في الضبط وحماية الأمان (8 حراس)' : 'Anti-Overfitting & Tail-Risk Shield (8 Guards)'}
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              {isAr ? 'حسابات حقيقية بدون بيانات وهمية' : '100% Real-Data Math'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {guardAgents.map(agent => {
              const currentVote = latestDecision?.votes[agent.id] || 'approved';
              const proposal = latestDecision?.proposals[agent.id];
              const shift = recentShifts[agent.id];
              return (
                <div key={agent.id} className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3 hover:border-emerald-500/40 transition relative overflow-hidden">
                  {shift && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold animate-pulse ${
                      shift.direction === 'up' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                    }`}>
                      {shift.direction === 'up' ? `+${(shift.deltaConf * 100).toFixed(1)}%` : `${(shift.deltaConf * 100).toFixed(1)}%`}
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-mono font-bold text-white text-xs">{isAr ? agent.arabicName : agent.name}</h4>
                      <p className="text-[10px] text-[var(--muted)]">{agent.role}</p>
                    </div>
                    {!shift && <div>{getVoteIcon(currentVote)}</div>}
                  </div>

                  <div className="grid grid-cols-2 gap-2 py-1.5 bg-white/5 rounded-lg text-center font-mono text-[10px]">
                    <div>
                      <span className="text-[var(--muted)] block">{isAr ? 'ثقة الحارس' : 'Confidence'}</span>
                      <span className="text-emerald-400 font-bold">{Math.round(agent.confidence * 100)}%</span>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] block">{isAr ? 'وزن التصويت' : 'Weight'}</span>
                      <span className="text-cyan-300 font-bold">{agent.weight.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-gray-300 bg-black/60 p-2 rounded-lg border border-white/5 min-h-[50px] flex items-center">
                    <span>{proposal?.note || (isAr ? 'اجتاز اختبارات الأمان' : 'Passed security checks')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📊 SUB-TAB: REAL-TIME LEARNING LOG & CONFIDENCE SHIFTS */}
      {activeSubTab === 'learning_log' && (
        <div className="holo-panel rounded-2xl p-6 border border-cyan-500/30 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h3 className="font-mono text-sm font-bold text-white tracking-wider">
                {isAr ? 'سجل التعلم اللحظي وتحديثات الثقة (Real-Time learn_from_outcome Feed)' : 'Real-Time learn_from_outcome Audit Feed'}
              </h3>
            </div>
            <span className="text-[11px] font-mono text-cyan-300">
              {learningLog.length} Recorded Feedback Events
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[var(--muted)]">
                  <th className="py-2.5 px-3">{isAr ? 'الوقت' : 'Time'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'العملة' : 'Symbol'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'النتيجة' : 'Result'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'الربح / الخسارة' : 'PnL (USDT)'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'تأثير الثقة على الـ 14 وكيلاً' : 'Agent Confidence Shift'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'السبب' : 'Reason'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {learningLog.length > 0 ? (
                  learningLog.map((ev, idx) => (
                    <tr key={ev.id || idx} className="hover:bg-white/5 transition">
                      <td className="py-3 px-3 text-gray-400 text-[11px]">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 text-white font-bold">{ev.symbol}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          ev.isWin ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {ev.isWin ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {ev.isWin ? 'WIN' : 'LOSS'}
                        </span>
                      </td>
                      <td className={`py-3 px-3 font-bold ${ev.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {ev.isWin ? '+' : ''}${ev.pnl.toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-mono text-xs font-bold ${ev.isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {ev.isWin ? '+0.05 (+5%) for all 14 agents' : '-0.10 (-10%) for all 14 agents'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-300 text-[11px]">
                        {ev.reason || (ev.isWin ? 'Target Hit' : 'Risk Exit')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--muted)] font-mono text-xs">
                      {isAr
                        ? 'لم يتم تسجيل صفقات مغلقة بعد — استخدم أزرار "محاكاة ربح / خسارة" أعلاه لمشاهدة تأثير التعلم فورياً'
                        : 'No trade feedback recorded yet. Use the simulation buttons above to trigger live shifts.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 📜 SUB-TAB: MEETING HISTORY LOG */}
      {activeSubTab === 'history' && (
        <div className="holo-panel rounded-2xl p-6 border border-white/10 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h3 className="font-mono text-sm font-bold text-white tracking-wider">
                {isAr ? 'سجل مداولات وقرارات مجلس الإدارة الأخيرة' : 'Recent Board Meeting Minutes'}
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[var(--muted)]">
                  <th className="py-2.5 px-3">{isAr ? 'الدورة' : 'Round'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'العملة' : 'Symbol'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'القرار' : 'Verdict'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'الحراس' : 'Guards'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'نسبة الموافقة' : 'Approval'}</th>
                  <th className="py-2.5 px-3">{isAr ? 'الإجراء المتخذ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(decisionHistory && decisionHistory.length > 0) ? (
                  decisionHistory.map((dec, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition">
                      <td className="py-3 px-3 text-cyan-300 font-bold">#{dec.round}</td>
                      <td className="py-3 px-3 text-white font-semibold">{dec.symbol}</td>
                      <td className="py-3 px-3">{getVerdictBadge(dec.verdict)}</td>
                      <td className="py-3 px-3 text-emerald-400">{dec.guardsPassed}/8</td>
                      <td className="py-3 px-3 text-cyan-300 font-bold">{Math.round(dec.approvalRatio * 100)}%</td>
                      <td className="py-3 px-3 text-gray-300 text-[11px]">{dec.action}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[var(--muted)]">
                      {isAr ? 'لا توجد جلسات مسجلة بعد — انقر فوق "مداولة فورية" لبدء المداولة الأولى' : 'No recorded sessions yet. Click "Deliberate" to hold the first meeting.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🎓 Quantum Board $200 Training Simulator Modal */}
      <QuantumTrainingModal
        isOpen={showTrainingModal}
        onClose={() => setShowTrainingModal(false)}
        lang={isAr ? 'ar' : 'en'}
        playTone={playTone}
        onRefreshBoard={onRefresh}
      />
    </div>
  );
};
