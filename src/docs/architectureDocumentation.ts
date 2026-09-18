/**
 * Basel Quantum Algorithmic Trading System
 * Technical Architecture & Quantum Mathematical Specifications
 */

export const BASEL_ARCHITECTURE_DOCS = {
  titleEn: 'Basel Integrated Quantum Algorithmic Trading Platform',
  titleAr: 'منظومة بازل المتكاملة للتداول الخوارزمي والهندسة الكمومية',
  version: '2.4.0-PROD-MERGED',
  lastUpdated: '2026-09-18',
  
  executiveSummaryEn: `Basel is a production-grade algorithmic trading system merging high-frequency market microstructure analytics with Quantum-Inspired Optimization (QSA, Simulated Annealing, Tabu Search) and Variational Quantum Algorithms (QAOA). It features Ornstein-Uhlenbeck statistical arbitrage, real-time Value-at-Risk (VaR/CVaR) risk limits, an autonomous 5-tier safety Kill Switch, Smart Order Routing (SOR), and walk-forward overfitting validation.`,
  
  executiveSummaryAr: `تعتبر منظومة "بازل" منصة برمجية وهندسية متقدمة من الدرجة المؤسسية تجمع بين التحليل المجهري عالي التردد لدفاتر الطلبات، وخوارزميات التحسين المستوحاة من فيزياء الكم (مثل Quantum Simulated Annealing و QAOA)، ونماذج المراجحة الإحصائية عبر معادلات Ornstein-Uhlenbeck، مع محرك إدارة مخاطر لحظي يراقب حدود الـ VaR ومفتاح إيقاف طوارئ ذاتي متعدد المستويات ونظام تحقق Out-of-Sample متقدم.`,

  mathematicalFoundations: [
    {
      titleEn: '1. QUBO Portfolio Hamiltonian Formulation',
      titleAr: '١. صياغة هاميلتونيان المحفظة بصيغة QUBO',
      formula: 'H(x) = - \\sum_i \\mu_i w_i(x) + \\lambda \\sum_{i,j} \\sigma_{ij} w_i(x) w_j(x) + P_B \\left( \\sum_i w_i(x) - 1 \\right)^2 + P_T \\sum_i c_i |w_i - w_0|',
      descriptionEn: 'Translates Markowitz mean-variance optimization with cardinality limits and budget penalties into an Ising-equivalent Quadratic Unconstrained Binary Optimization (QUBO) matrix suitable for quantum annealing and QAOA execution.',
      descriptionAr: 'تحويل معادلة ماركويتز للعائد والمخاطرة مع قيود الميزانية وقيود عدد الأصول وتكاليف التداول إلى مصفوفة تربيعية ثنائية غير مقيدة (QUBO) ملائمة للمعالجات الكمومية وخوارزميات المحاكاة الكمية.',
    },
    {
      titleEn: '2. Quantum Simulated Annealing (QSA) & Tunneling',
      titleAr: '٢. المحاكاة الكمومية للتلدين والنفق الكمي (QSA)',
      formula: 'H(t) = \\Gamma(t) \\sum_i \\sigma_i^x + (1 - \\Gamma(t)) H_{QUBO}, \\quad J_\\perp = -\\frac{1}{2} \\ln \\tanh \\left( \\frac{\\Gamma(t)}{P} \\right)',
      descriptionEn: 'Simulates quantum tunneling across high, narrow energy barriers via Suzuki-Trotter path-integral decomposition across P imaginary time replicas, outperforming classical thermal annealing in rugged loss landscapes.',
      descriptionAr: 'محاكاة عبور الحواجز الطاقية عبر النفق الكمي باستخدام تفكيك سوزوكي-تروتر على شرائح زمنية تخيلية، مما يتيح التغلب على المصائد الموضعية مقارنة بالتلدين الحراري التقليدي.',
    },
    {
      titleEn: '3. QAOA Variational Circuit Ansatz',
      titleAr: '٣. الدائرة الكمومية التغيرية لخوارزمية QAOA',
      formula: '|\\psi(\\vec{\\gamma}, \\vec{\\beta})\\rangle = \\prod_{l=1}^p e^{-i \\beta_l H_M} e^{-i \\gamma_l H_C} |+\\rangle^{\\otimes n}, \\quad H_M = \\sum_{i=1}^n X_i',
      descriptionEn: 'Applies alternating layers of Problem Hamiltonian unitary and Mixer Hamiltonian unitary on a uniform superposition state, optimizing variational parameters (gamma, beta) to maximize ground-state probability.',
      descriptionAr: 'تطبيق طبقات متناوبة من مؤثر الطور لمصفوفة المشكلة ومؤثر الخلط على حالة التراكب المتساوي لتقريب الحل الأمثل ورفع احتمال قياس الحالة الأرضية ذات الطاقة الأدنى.',
    },
    {
      titleEn: '4. Ornstein-Uhlenbeck Mean Reversion Estimation',
      titleAr: '٤. تقدير معاملات ارتداد أورنشتاين-أولنبيك',
      formula: 'd S_t = \\theta (\\mu - S_t) dt + \\sigma d W_t, \\quad \\tau_{1/2} = \\frac{\\ln(2)}{\\theta}, \\quad Z_t = \\frac{S_t - \\mu}{\\sigma}',
      descriptionEn: 'Continuous stochastic differential equation estimating mean reversion velocity (theta), long-term equilibrium (mu), and half-life (tau) to trigger high-probability statistical arbitrage entries.',
      descriptionAr: 'معادلة تفاضلية عشوائية مستمرة لتقدير سرعة ارتداد السعر إلى المتوسط التوازني وعمر النصف الزمني لتوليد إشارات الدخول عندما يتجاوز Z-Score الحدود الإحصائية.',
    },
    {
      titleEn: '5. High-Frequency Microprice & Order Flow Imbalance',
      titleAr: '٥. السعر المجهري واختلال تدفق الأوامر (OBI)',
      formula: 'P_{micro} = \\frac{P_a V_b + P_b V_a}{V_b + V_a}, \\quad OBI = \\frac{\\sum w_k V_{b,k} - \\sum w_k V_{a,k}}{\\sum w_k V_{b,k} + \\sum w_k V_{a,k}}',
      descriptionEn: 'Incorporates top-of-book and multi-level depth volumes with exponential decay weighting to detect instantaneous institutional order flow imbalances before visible price movement.',
      descriptionAr: 'حساب السعر المجهري المرجح بأحجام أفضل عروض الشراء والطلب، وقياس اختلال تدفق السيولة عبر المستويات المتعددة للتنبؤ باتجاه التحرك السعري اللحظي.',
    }
  ],

  subsystems: [
    { name: 'Market Data & Hawkes Generator', status: 'Active', latency: '42 μs' },
    { name: 'Feature Extraction & OU Alpha', status: 'Active', latency: '115 μs' },
    { name: 'Quantum QUBO Solver (QSA & QAOA)', status: 'Active', latency: '3.4 ms' },
    { name: 'Continuous Risk Engine (VaR/CVaR)', status: 'Active', latency: '55 μs' },
    { name: 'Autonomous 5-Tier KillSwitch', status: 'Active', latency: '12 μs' },
    { name: 'Smart Order Router (SOR) & FSM', status: 'Active', latency: '85 μs' },
    { name: 'Walk-Forward Validator & Stress Suite', status: 'Active', latency: '1.2 ms' },
    { name: 'Append-Only Event Journal', status: 'Active', latency: '18 μs' },
  ]
};
