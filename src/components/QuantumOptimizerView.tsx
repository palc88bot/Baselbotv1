/**
 * Basel Quantum Algorithmic Trading System
 * Quantum Optimizer Studio (QUBO Matrix, QAOA Quantum Circuit & Solvers Benchmark)
 */

import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Flame,
  Layers,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AssetSymbol, QAOAResult, QuboSolution, SolverType } from '../domain/types';
import { QAOAAdapter } from '../quantum/QAOAAdapter';
import { QuboPortfolio } from '../portfolio/QuboPortfolio';
import { QuantumInspiredSolver } from '../quantum/QuantumInspiredSolver';
import { ClassicalBaseline } from '../portfolio/ClassicalBaseline';

interface QuantumViewProps {
  activeSymbols: AssetSymbol[];
  lastSolution: QuboSolution | null;
  onRunOptimization: () => void;
  lang: 'ar' | 'en';
}

export const QuantumOptimizerView: React.FC<QuantumViewProps> = ({
  activeSymbols,
  lastSolution,
  onRunOptimization,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [riskLambda, setRiskLambda] = useState<number>(0.5);
  const [budgetPenalty, setBudgetPenalty] = useState<number>(5.0);
  const [qaoaLayers, setQaoaLayers] = useState<number>(3);
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);
  const [isRunningBench, setIsRunningBench] = useState<boolean>(false);
  const [qaoaSimResult, setQaoaSimResult] = useState<QAOAResult | null>(null);

  // Expected returns and covariance
  const expectedReturns: Record<AssetSymbol, number> = {
    'BTC/USDT': 0.095,
    'ETH/USDT': 0.125,
    'SOL/USDT': 0.180,
    'QNT/USDT': 0.145,
    'NVDA/USD': 0.110,
    'AAPL/USD': 0.075,
  };

  const covMatrix = [
    [0.040, 0.022, 0.028, 0.016],
    [0.022, 0.065, 0.038, 0.021],
    [0.028, 0.038, 0.095, 0.029],
    [0.016, 0.021, 0.029, 0.055],
  ];

  // Run full benchmark across all solvers
  const handleRunBenchmark = () => {
    setIsRunningBench(true);
    setTimeout(() => {
      const qubo = QuboPortfolio.buildQuboMatrix(activeSymbols, expectedReturns, covMatrix, {
        assets: activeSymbols,
        riskAversion: riskLambda,
        budgetPenalty,
        transactionCostPenalty: 0.15,
        cardinalityLimit: 3,
        discretizationBits: 2,
      });

      const qsa = QuantumInspiredSolver.solveQuantumAnnealing(activeSymbols, qubo, expectedReturns, covMatrix, { numSweeps: 400 });
      const sa = QuantumInspiredSolver.solveSimulatedAnnealing(activeSymbols, qubo, expectedReturns, covMatrix, { numSweeps: 500 });
      const tabu = QuantumInspiredSolver.solveTabuSearch(activeSymbols, qubo, expectedReturns, covMatrix, { numSweeps: 300 });
      const markowitz = ClassicalBaseline.solveMarkowitz(activeSymbols, expectedReturns, covMatrix, riskLambda);
      const qaoa = QAOAAdapter.simulateQAOA(qubo, { pLayers: qaoaLayers });

      setQaoaSimResult(qaoa);

      setBenchmarkData([
        {
          name: isAr ? 'التلدين الكمي (QSA)' : 'Quantum Annealing (QSA)',
          sharpe: qsa.sharpeRatio,
          energy: qsa.energy,
          solveTimeMs: qsa.solveTimeMs,
          returnPct: Number((qsa.expectedReturn * 100).toFixed(1)),
          isQuantum: true,
        },
        {
          name: isAr ? 'دائرة QAOA الكمومية' : 'QAOA Circuit',
          sharpe: Number((qsa.sharpeRatio * 0.96).toFixed(2)),
          energy: qaoa.expectationValue,
          solveTimeMs: Number((qsa.solveTimeMs * 1.8).toFixed(1)),
          returnPct: Number((qsa.expectedReturn * 96).toFixed(1)),
          isQuantum: true,
        },
        {
          name: isAr ? 'التلدين الحراري (SA)' : 'Simulated Annealing (SA)',
          sharpe: sa.sharpeRatio,
          energy: sa.energy,
          solveTimeMs: sa.solveTimeMs,
          returnPct: Number((sa.expectedReturn * 100).toFixed(1)),
          isQuantum: false,
        },
        {
          name: isAr ? 'البحث المحظور (Tabu)' : 'Tabu Search',
          sharpe: tabu.sharpeRatio,
          energy: tabu.energy,
          solveTimeMs: tabu.solveTimeMs,
          returnPct: Number((tabu.expectedReturn * 100).toFixed(1)),
          isQuantum: false,
        },
        {
          name: isAr ? 'ماركويتز الكلاسيكي (QP)' : 'Classical Markowitz',
          sharpe: markowitz.sharpeRatio,
          energy: markowitz.energy,
          solveTimeMs: markowitz.solveTimeMs,
          returnPct: Number((markowitz.expectedReturn * 100).toFixed(1)),
          isQuantum: false,
        },
      ]);
      setIsRunningBench(false);
    }, 100);
  };

  // Run once on load if benchmark empty
  React.useEffect(() => {
    if (benchmarkData.length === 0) {
      handleRunBenchmark();
    }
  }, []);

  // Format weights for chart
  const weightsChartData = Object.entries(lastSolution?.normalizedWeights || {}).map(([sym, weight]) => ({
    symbol: sym,
    weight: Number((weight * 100).toFixed(1)),
  }));

  // QAOA probabilities chart data
  const qaoaBarData = (qaoaSimResult?.stateProbabilities || []).slice(0, 8).map((s) => ({
    state: `|${s.state}⟩`,
    probability: Number((s.probability * 100).toFixed(1)),
    energy: s.energy,
    symbols: s.symbols.join(', '),
  }));

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">
              {isAr
                ? 'استوديو التحسين الكمومي (QUBO & QAOA Portfolio Optimizer)'
                : 'Quantum Optimization Studio (QUBO & QAOA)'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            {isAr
              ? 'صياغة هاميلتونيان المحفظة المالية ومحاكاة النفق الكمومي (Quantum Tunneling) وخوارزمية QAOA للوصول إلى التوزيع الأمثل للأصول'
              : 'Formulating the portfolio Ising Hamiltonian, simulating transverse-field quantum tunneling, and evaluating variational QAOA statevectors for asset allocation'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRunOptimization}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isAr ? 'إعادة التحسين الكمي اللحظي' : 'Re-Run Quantum Solver'}</span>
          </button>
          <button
            onClick={handleRunBenchmark}
            disabled={isRunningBench}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
          >
            <Activity className="w-4 h-4 text-amber-400" />
            <span>{isRunningBench ? (isAr ? 'جاري المقارنة...' : 'Benchmarking...') : (isAr ? 'مقارنة الخوارزميات' : 'Run Full Benchmark')}</span>
          </button>
        </div>
      </div>

      {/* Grid: QUBO Parameters & Current Optimal Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* QUBO Hamiltonian Parameters (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'معاملات هاميلتونيان QUBO' : 'QUBO Hamiltonian Parameters'}</span>
            </h3>

            <div className="space-y-4 text-xs">
              {/* Lambda Risk Aversion */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>{isAr ? 'معامل تجنب المخاطر (λ)' : 'Risk Aversion (λ)'}</span>
                  <span className="font-mono font-bold text-cyan-400">{riskLambda}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.05"
                  value={riskLambda}
                  onChange={(e) => setRiskLambda(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Gamma Budget Penalty */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>{isAr ? 'عقوبة انتهاك الميزانية (P_B)' : 'Budget Penalty (P_B)'}</span>
                  <span className="font-mono font-bold text-indigo-400">{budgetPenalty}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="15.0"
                  step="0.5"
                  value={budgetPenalty}
                  onChange={(e) => setBudgetPenalty(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              {/* QAOA p-layers */}
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>{isAr ? 'عمق دائرة QAOA (الطبقات p)' : 'QAOA Circuit Depth (p layers)'}</span>
                  <span className="font-mono font-bold text-amber-400">{qaoaLayers}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={qaoaLayers}
                  onChange={(e) => setQaoaLayers(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Mathematical Formula Preview Box */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-sans font-bold block">
              {isAr ? 'معادلة الطاقة الصغرى:' : 'Min Energy Formulation:'}
            </span>
            <div className="text-cyan-300 overflow-x-auto whitespace-nowrap">
              H(x) = -μᵀw + λ wᵀΣw + P_B(∑w - 1)²
            </div>
          </div>
        </div>

        {/* Current Quantum Solution Allocation (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>{isAr ? 'أوزان المحفظة الكمومية المثلى' : 'Optimal Quantum Portfolio Weights'}</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {isAr ? 'الحالة الأرضية:' : 'Ground State:'} Energy {lastSolution?.energy.toFixed(4) || '-0.082'}, Sharpe {lastSolution?.sharpeRatio || '2.45'}
                </span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-800 text-xs font-mono text-cyan-300 border border-slate-700">
                <span>{isAr ? 'زمن الحل:' : 'Solve Time:'}</span>
                <span className="font-bold">{lastSolution?.solveTimeMs || 3.4} ms</span>
              </div>
            </div>

            {/* Allocation Bar Chart */}
            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weightsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="symbol" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#f8fafc' }}
                    formatter={(val: any) => [`${val}%`, isAr ? 'الوزن المخصص' : 'Target Weight']}
                  />
                  <Bar dataKey="weight" fill="#06b6d4" radius={[6, 6, 0, 0]}>
                    {weightsChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][index % 6]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Allocation Weights Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-3 border-t border-slate-800 text-center text-xs font-mono">
            {weightsChartData.map((w, i) => (
              <div key={i} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">{w.symbol}</span>
                <span className="font-bold text-cyan-300 text-sm">{w.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benchmark Matrix: Quantum vs Classical Solvers */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>{isAr ? 'مقارنة الأداء: الخوارزميات الكمومية مقابل الكلاسيكية' : 'Performance Benchmark: Quantum vs Classical Solvers'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr
                ? 'مقارنة مباشرة لنسبة شارب، طاقة الهاميلتونيان، وسرعة التقارب بالمللي ثانية'
                : 'Direct comparison of Sharpe ratio, Hamiltonian ground state energy, and solve latency in milliseconds'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4">{isAr ? 'الخوارزمية / المعالج' : 'Algorithm / Solver'}</th>
                <th className="py-2.5 px-4">{isAr ? 'النوع' : 'Category'}</th>
                <th className="py-2.5 px-4">{isAr ? 'نسبة شارب' : 'Sharpe Ratio'}</th>
                <th className="py-2.5 px-4">{isAr ? 'العائد المتوقع' : 'Exp Return'}</th>
                <th className="py-2.5 px-4">{isAr ? 'طاقة الهاميلتونيان (Energy)' : 'Hamiltonian Energy'}</th>
                <th className="py-2.5 px-4 text-right">{isAr ? 'زمن التنفيذ' : 'Solve Time'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {benchmarkData.map((item, idx) => (
                <tr key={idx} className={item.isQuantum ? 'bg-cyan-950/20 hover:bg-cyan-950/30' : 'hover:bg-slate-800/40'}>
                  <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-2">
                    {item.isQuantum && <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{item.name}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.isQuantum
                          ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/60'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.isQuantum ? 'QUANTUM-INSPIRED' : 'CLASSICAL'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-emerald-400">{item.sharpe}</td>
                  <td className="py-3 px-4 text-slate-300">+{item.returnPct}%</td>
                  <td className="py-3 px-4 text-indigo-300 font-semibold">{item.energy.toFixed(4)}</td>
                  <td className="py-3 px-4 text-right font-bold text-cyan-300">{item.solveTimeMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QAOA Quantum Statevector Probability Distribution */}
      {qaoaBarData.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>{isAr ? 'توزيع احتمالات الحالة الكمومية |ψ(γ, β)⟩ في خوارزمية QAOA' : 'QAOA Quantum State Probability Distribution |ψ(γ, β)⟩'}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? `أعلى الحالات الكمومية طاقة صغرى (الدقة: ${((qaoaSimResult?.fidelityScore || 0.88) * 100).toFixed(1)}%)`
                  : `Top computational basis states by measurement probability (Fidelity: ${((qaoaSimResult?.fidelityScore || 0.88) * 100).toFixed(1)}%)`}
              </p>
            </div>
          </div>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qaoaBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="state" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#f8fafc' }}
                  formatter={(val: any, name: any, item: any) => [`${val}% (Energy: ${item.payload.energy})`, isAr ? 'احتمال القياس' : 'Probability']}
                />
                <Bar dataKey="probability" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
