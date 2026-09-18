/**
 * Basel Quantum Algorithmic Trading System
 * Merged Codebase Files Registry & Code Exporter
 */

export interface SourceFileMetadata {
  path: string;
  category: 'DOMAIN' | 'MARKET_DATA' | 'FEATURES' | 'STRATEGY' | 'QUANTUM' | 'RISK' | 'EXECUTION' | 'SIMULATION' | 'STORAGE' | 'MONITORING' | 'APP' | 'TESTS';
  descriptionEn: string;
  descriptionAr: string;
}

export const MERGED_FILES_REGISTRY: SourceFileMetadata[] = [
  {
    path: 'src/domain/types.ts',
    category: 'DOMAIN',
    descriptionEn: 'Core domain contracts, market models, QUBO/QAOA structures, and risk limits',
    descriptionAr: 'أنواع البيانات الأساسية، عقود السوق، هياكل QUBO/QAOA وحدود المخاطر',
  },
  {
    path: 'src/market-data/OrderBookBuilder.ts',
    category: 'MARKET_DATA',
    descriptionEn: 'L2/L3 order book reconstructor with microprice and depth imbalance',
    descriptionAr: 'إعادة بناء دفتر الطلبات L2/L3 وحساب السعر المجهري واختلال السيولة',
  },
  {
    path: 'src/market-data/ExchangeMarketData.ts',
    category: 'MARKET_DATA',
    descriptionEn: 'Multi-asset real-time feed with Hawkes volatility clustering & jump-diffusion',
    descriptionAr: 'تغذية الأسعار المتعددة مع محاكاة قفزات الأسعار وعناقيد هوكس للتقلبات',
  },
  {
    path: 'src/features/FeatureEngine.ts',
    category: 'FEATURES',
    descriptionEn: 'Ornstein-Uhlenbeck parameters, Hurst exponent, RSI, and microstructure noise',
    descriptionAr: 'معاملات أورنشتاين-أولنبيك، أس هيرست، مؤشر القوة النسبية والضوضاء المجهرية',
  },
  {
    path: 'src/strategies/MeanReversionStrategy.ts',
    category: 'STRATEGY',
    descriptionEn: 'Statistical arbitrage strategy with dynamic half-life & z-score triggers',
    descriptionAr: 'استراتيجية المراجحة الإحصائية والارتداد للمتوسط مع عمر النصف الديناميكي',
  },
  {
    path: 'src/portfolio/QuboPortfolio.ts',
    category: 'QUANTUM',
    descriptionEn: 'Markowitz mean-variance & cardinality to QUBO Hamiltonian matrix formulation',
    descriptionAr: 'صياغة هاميلتونيان QUBO لمحفظة ماركويتز مع قيود عدد الأصول والميزانية',
  },
  {
    path: 'src/portfolio/ClassicalBaseline.ts',
    category: 'QUANTUM',
    descriptionEn: 'Classical benchmarks (Markowitz QP, Inverse Volatility, Equal Weight)',
    descriptionAr: 'المقاييس المرجعية التقليدية (ماركويتز، مقلوب التقلب، التوزيع المتساوي)',
  },
  {
    path: 'src/quantum/QuantumInspiredSolver.ts',
    category: 'QUANTUM',
    descriptionEn: 'Quantum Simulated Annealing (QSA), Thermal SA, and Tabu Search solvers',
    descriptionAr: 'محاكاة التلدين الكمي (QSA) والتلدين الحراري والبحث المحظور',
  },
  {
    path: 'src/quantum/QAOAAdapter.ts',
    category: 'QUANTUM',
    descriptionEn: 'QAOA variational quantum circuit statevector simulator & expectation value',
    descriptionAr: 'محاكي الدائرة الكمومية التغيرية QAOA وحساب القيمة المتوقعة والحالات',
  },
  {
    path: 'src/risk/RiskEngine.ts',
    category: 'RISK',
    descriptionEn: 'Real-time VaR (95%/99%), CVaR, Drawdown watermark, and pre-trade checks',
    descriptionAr: 'محرك المخاطر اللحظي: حساب القيمة المعرضة للخطر VaR/CVaR ومراقبة التراجع',
  },
  {
    path: 'src/risk/KillSwitch.ts',
    category: 'RISK',
    descriptionEn: 'Autonomous 5-tier safety circuit breaker and emergency liquidation',
    descriptionAr: 'مفتاح إيقاف الطوارئ الذاتي خماسي المستويات وقاطع الدورة الآلي',
  },
  {
    path: 'src/execution/OrderStateMachine.ts',
    category: 'EXECUTION',
    descriptionEn: 'Finite State Machine enforcing strict valid order state transitions',
    descriptionAr: 'آلة الحالات المحدودة لضبط التحولات الصارمة لحالات الأوامر',
  },
  {
    path: 'src/execution/UserDataStream.ts',
    category: 'EXECUTION',
    descriptionEn: 'Account balances, margin calculations, position tracking, and fill updates',
    descriptionAr: 'أرصدة الحساب، حسابات الهامش، تتبع المراكز المفتوحة وسجل التنفيذات',
  },
  {
    path: 'src/execution/OrderGateway.ts',
    category: 'EXECUTION',
    descriptionEn: 'Smart Order Router (SOR), TWAP/VWAP slicing, latency & slippage matching',
    descriptionAr: 'بوابة التوجيه الذكي للأوامر (SOR) وتجزئة الأوامر الكبيرة ومطابقة الانزلاق',
  },
  {
    path: 'src/execution/ReconciliationService.ts',
    category: 'EXECUTION',
    descriptionEn: 'Real-time inventory reconciliation preventing position and cash drift',
    descriptionAr: 'خدمة المطابقة اللحظية بين الأرصدة الداخلية وبيانات منصات التداول',
  },
  {
    path: 'src/execution/ExchangeAdapters.ts',
    category: 'EXECUTION',
    descriptionEn: 'Unified multi-exchange connectors (Binance, Bybit, Coinbase, Mock Sandbox)',
    descriptionAr: 'المحولات الموحدة لمنصات التداول (بينانس، بايبت، كوينبيس، المحاكي فائق السرعة)',
  },
  {
    path: 'src/storage/EventJournal.ts',
    category: 'STORAGE',
    descriptionEn: 'Append-only event journal and immutable audit trail with replay capability',
    descriptionAr: 'سجل الأحداث غير القابل للتعديل لتدقيق كافة الصفقات وإشارات التداول',
  },
  {
    path: 'src/monitoring/HealthMonitor.ts',
    category: 'MONITORING',
    descriptionEn: 'Microsecond latency telemetry, throughput monitoring, and pipeline health',
    descriptionAr: 'مراقبة زمن الاستجابة بالميكروثانية والإنتاجية وصحة خط المعالجة',
  },
  {
    path: 'src/simulation/Backtest.ts',
    category: 'SIMULATION',
    descriptionEn: 'High-fidelity historical backtesting engine with fee & slippage modeling',
    descriptionAr: 'محرك الاختبار التاريخي عالي الدقة مع نمذجة الرسوم والانزلاق السعري',
  },
  {
    path: 'src/validation/WalkForward.ts',
    category: 'SIMULATION',
    descriptionEn: 'Walk-forward rolling out-of-sample matrix for overfitting detection',
    descriptionAr: 'مصفوفة التحقق الأمامي واختبار العينات الخارجية لمنع فرط التخصيص',
  },
  {
    path: 'src/validation/StressScenarios.ts',
    category: 'SIMULATION',
    descriptionEn: 'Catalog of severe financial crisis and liquidity drain scenarios',
    descriptionAr: 'كتالوج سيناريوهات الأزمات المالية ونضوب السيولة المفاجئ',
  },
  {
    path: 'src/app/TradingPipeline.ts',
    category: 'APP',
    descriptionEn: 'Master trading orchestrator uniting all quantum, risk, and execution modules',
    descriptionAr: 'المنسق الرئيسي لخط التداول الذي يربط كافة الوحدات الكمومية والتنفيذية',
  },
  {
    path: 'src/app/IntegrationBootstrap.ts',
    category: 'APP',
    descriptionEn: 'Bootstrapping engine running system-wide diagnostics and green checks',
    descriptionAr: 'وحدة الإقلاع والتحقق الشامل من تكامل الأنظمة وصحة عملها',
  },
  {
    path: 'src/tests/testSuite.ts',
    category: 'TESTS',
    descriptionEn: 'Unit and integration test suite with automated verification assertions',
    descriptionAr: 'حزمة الاختبارات الشاملة للتحقق من دقة الخوارزميات وصحة النتائج',
  },
];
