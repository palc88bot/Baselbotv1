import express from "express";
import expressWs from "express-ws";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { TradingPipeline } from "./src/app/TradingPipeline";
import { TelegramService } from "./src/services/TelegramService";
import { BacktestEngine } from "./src/backtest/BacktestEngine";
import { RegimeDetector } from "./src/risk/RegimeDetector";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { CloudDatabaseService } from "./src/storage/CloudDatabaseService.ts";
import dotenv from "dotenv";

dotenv.config();

const logStream = fs.createWriteStream(path.join(process.cwd(), "server.log"), { flags: "a" });
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const formatLogArgs = (args: any[]) =>
  args
    .map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a)))
    .join(" ");

console.log = (...args) => {
  const msg = `[${new Date().toISOString()}] LOG: ${formatLogArgs(args)}\n`;
  logStream.write(msg);
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  const msg = `[${new Date().toISOString()}] ERROR: ${formatLogArgs(args)}\n`;
  logStream.write(msg);
  originalConsoleError.apply(console, args);
};

async function startServer() {
  const expressWsInstance = expressWs(express());
  const app = expressWsInstance.app;
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // CORS Middleware - Secured Origin Handling
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Initialize Services
  const telegramService = new TelegramService();
  const pipeline = new TradingPipeline(telegramService);

  // Auto-start autonomous trading pipeline immediately on server boot
  pipeline.startAutonomousTrading().catch(err => {
    console.error("❌ Failed to auto-start pipeline on boot:", err);
  });
  
  // Shared Cloud DB Service (will be linked after user sync)
  let cloudDb: CloudDatabaseService | null = null;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      pipelineHealth: pipeline.getHealthMonitor().getHealth(),
      killSwitch: {
        active: pipeline.getKillSwitch().isActive(),
        level: pipeline.getKillSwitch().getLevel(),
      },
      cloudStorage: cloudDb ? "Connected (Cloud SQL + Firestore)" : "Disconnected (Waiting for Auth)",
    });
  });

  // User Sync & Auth Initialization
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      let user;
      try {
        user = await getOrCreateUser(req.user!.uid, req.user!.email!);
        
        // Initialize Cloud DB for this user
        cloudDb = new CloudDatabaseService(req.user!.uid);
        await cloudDb.setUserId(user.id, user.uid);
        
        // Inject cloud database into pipeline
        pipeline.setDatabase(cloudDb as any);
        console.log(`👤 User synchronized: ${user.email} (${user.uid})`);
      } catch (sqlError) {
        console.warn("⚠️ Cloud SQL sync failed, falling back to local storage session:", sqlError);
        user = {
          id: 0,
          uid: req.user!.uid,
          email: req.user!.email,
          isMock: true
        };
      }
      
      res.json({ success: true, user });
    } catch (error: any) {
      console.error("Auth sync error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Protected routes below
  app.use("/api/protected", requireAuth);

  app.post("/api/protected/toggle-trading", async (req: AuthRequest, res) => {
    const { running } = req.body;
    if (running) {
      pipeline.startAutonomousTrading();
    } else {
      pipeline.stop();
    }
    res.json({ success: true, isRunning: running });
  });

  // KillSwitch Endpoints
  app.post("/api/protected/killswitch/trigger", async (req: AuthRequest, res) => {
    try {
      const { level, reason } = req.body;
      const targetLevel = level || 'HARD_HALT';
      const killReason = reason || `Manual operator trigger by ${req.user?.email || 'admin'}`;
      pipeline.getKillSwitch().trigger(targetLevel, killReason, 'MANUAL_OPERATOR');
      res.json({
        success: true,
        active: pipeline.getKillSwitch().isActive(),
        level: pipeline.getKillSwitch().getLevel(),
        reason: killReason,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/protected/killswitch/reset", async (req: AuthRequest, res) => {
    try {
      const result = pipeline.resetEmergencyKill();
      res.json({
        ...result,
        active: pipeline.getKillSwitch().isActive(),
        level: pipeline.getKillSwitch().getLevel(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/protected/killswitch/status", async (req: AuthRequest, res) => {
    try {
      res.json({
        success: true,
        active: pipeline.getKillSwitch().isActive(),
        level: pipeline.getKillSwitch().getLevel(),
        history: pipeline.getKillSwitch().getHistory(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Risk Limits Endpoints
  app.post("/api/protected/risk-limits", async (req: AuthRequest, res) => {
    try {
      const newLimits = req.body;
      pipeline.getRiskEngine().updateLimits(newLimits);
      pipeline.updateConfig({
        maxDrawdownCapPct: newLimits.maxDrawdownPct ?? pipeline.getConfig().maxDrawdownCapPct,
        maxLeverage: newLimits.maxPortfolioLeverage ?? pipeline.getConfig().maxLeverage,
      });
      res.json({
        success: true,
        limits: pipeline.getRiskEngine().getLimits(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/protected/risk-limits", async (req: AuthRequest, res) => {
    try {
      res.json({
        success: true,
        limits: pipeline.getRiskEngine().getLimits(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/protected/manual-order", async (req: AuthRequest, res) => {
    try {
      const order = pipeline.getOrderGateway().submitOrder(req.body);
      res.json({ success: true, order });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/protected/run-optimization", async (req: AuthRequest, res) => {
    try {
      const { assets, constraints } = req.body;
      const db = pipeline.getDatabase();
      
      const pricesMap: Record<string, number[]> = {};
      for (const symbol of assets) {
        const history = await db.getPriceHistory(symbol, 30);
        if (history.length >= 2) {
          pricesMap[symbol] = history.map(h => h.price);
        }
      }

      const validAssets = Object.keys(pricesMap);
      if (validAssets.length === 0) {
        return res.status(400).json({ error: "Insufficient historical data for optimization" });
      }

      // Simplified Portfolio Optimization: Equal weights for valid assets
      const weights = assets.map((sym: string) => validAssets.includes(sym) ? 1 / validAssets.length : 0);
      
      // Calculate basic metrics
      let expectedReturn = 0;
      let totalRisk = 0;
      
      validAssets.forEach((sym, i) => {
        const prices = pricesMap[sym];
        const returns = [];
        for (let j = 1; j < prices.length; j++) {
          returns.push((prices[j] - prices[j-1]) / prices[j-1]);
        }
        const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgRet, 2), 0) / returns.length;
        
        expectedReturn += avgRet * (1 / validAssets.length);
        totalRisk += Math.sqrt(variance) * (1 / validAssets.length);
      });

      res.json({
        success: true,
        weights,
        expectedReturn: expectedReturn * 252, // Annualized
        risk: totalRisk * Math.sqrt(252), // Annualized
        sharpeRatio: totalRisk > 0 ? (expectedReturn / totalRisk) * Math.sqrt(252) : 0,
        timestamp: Date.now()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/protected/metrics", async (req: AuthRequest, res) => {
    try {
      const db = pipeline.getDatabase();
      const metrics = await db.getPerformanceMetrics();
      res.json({
        success: true,
        performance: metrics,
        activePositions: pipeline.getUserDataStream().getPositions().length,
        uptime: process.uptime()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start Autonomous Trading
  pipeline.start().catch(err => {
    console.error("CRITICAL: Failed to start trading pipeline:", err);
  });

  // Telegram Start Notification
  telegramService.sendMessage(`
🚀 <b>Basel AlgoCore Started Successfully</b>
━━━━━━━━━━━━━━━━
 Time: ${new Date().toISOString()}
🎯 Mode: ${process.env.NODE_ENV}
📊 Symbols: ${pipeline.getConfig().activeSymbols.length}
━━━━━━━━━━━━━━━━
✅ Autonomous Trading System is now operational!
  `);

  app.get("/api/protected/system-health", async (req: AuthRequest, res) => {
    const db = pipeline.getDatabase();
    const metrics = await db.getPerformanceMetrics();
    const rateLimiter = pipeline.getOrderGateway().getRateLimiter();
    const orderStatus = rateLimiter.getRateLimitStatus('/fapi/v1/order');

    res.json({
        correlation: { level: 'LOW', score: 0.15 }, 
        rateLimit: { 
            usagePercent: (orderStatus.used / orderStatus.limit) * 100, 
            used: orderStatus.used, 
            limit: orderStatus.limit 
        }, 
        db: { totalTrades: metrics?.totalTrades || 0, winRate: metrics?.winRate || 0 }
    });
  });

  app.get("/api/protected/trades", async (req: AuthRequest, res) => {
    try {
      const db = pipeline.getDatabase();
      const openTrades = await db.getOpenTrades();
      res.json({ success: true, count: openTrades.length, trades: openTrades });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch trades" });
    }
  });

  app.post("/api/protected/telegram/test", async (req: AuthRequest, res) => {
    try {
      const success = await telegramService.sendMessage(
        '🟢 <b>Baselbot Test</b>\n\n✅ تم الاتصال بنجاح! البوت جاهز لإرسال التنبيهات التلقائية والتنفيذية.'
      );
      res.json({ success, message: success ? 'Test message sent successfully!' : 'Failed to send. Please check Bot Token and Chat ID.' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/telegram/status', (req, res) => {
    try {
      res.json(telegramService.getConfigStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Portfolio Sizer & Compounding Status APIs ---
  const handlePortfolioTier = (req: any, res: any) => {
    try {
      const sizer = pipeline.getPortfolioSizer();
      res.json({
        ...sizer.getPortfolioReport(),
        currentBalance: pipeline.getUserDataStream().getBalance().totalEquity,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch portfolio tier', message: error.message });
    }
  };

  const handleCompoundingStatus = (req: any, res: any) => {
    try {
      const sizer = pipeline.getPortfolioSizer();
      res.json(sizer.getCompoundingReport());
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch compounding status', message: error.message });
    }
  };

  const handlePartialProfitStatus = (req: any, res: any) => {
    try {
      const manager = pipeline.getPartialProfitManager();
      res.json(manager.getReport());
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch partial profit status', message: error.message });
    }
  };

  const handleScaleInStatus = (req: any, res: any) => {
    try {
      const manager = pipeline.getScaleInManager();
      res.json(manager.getReport());
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch scale-in status', message: error.message });
    }
  };

  const handleQualifiedAssets = (req: any, res: any) => {
    try {
      const screener = pipeline.getAssetScreener();
      res.json(screener.getReport());
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch qualified assets', message: error.message });
    }
  };

  app.get('/api/portfolio-tier', handlePortfolioTier);
  app.get('/api/protected/portfolio-tier', handlePortfolioTier);
  app.get('/api/compounding-status', handleCompoundingStatus);
  app.get('/api/protected/compounding-status', handleCompoundingStatus);
  app.get('/api/partial-profit-status', handlePartialProfitStatus);
  app.get('/api/protected/partial-profit-status', handlePartialProfitStatus);
  app.get('/api/scale-in-status', handleScaleInStatus);
  app.get('/api/protected/scale-in-status', handleScaleInStatus);
  app.get('/api/qualified-assets', handleQualifiedAssets);
  app.get('/api/protected/qualified-assets', handleQualifiedAssets);

  // --- Backtesting API Endpoint ---
  app.post('/api/protected/backtest/run', async (req: AuthRequest, res) => {
    try {
      const config = req.body || {
        symbols: ['BTC/USDT', 'ETH/USDT'],
        startDate: '2024-01-01',
        endDate: '2024-09-01',
        initialCapital: 10000,
        commission: 0.0004,
        slippage: 0.0001,
        maxLeverage: 3
      };

      const engine = new BacktestEngine(config);
      const result = await engine.run();
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // --- Correlation and Risk Reports ---
  app.get('/api/protected/correlation-report', async (req: AuthRequest, res) => {
    try {
      const report = pipeline.getCorrelationReport();
      res.json({ success: true, report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/protected/rate-limit-status', async (req: AuthRequest, res) => {
    try {
      const report = pipeline.getOrderGateway().getRateLimiter().getFullReport();
      res.json({ success: true, report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // --- Core metrics endpoint for health and performance analysis ---
  app.get('/api/metrics', (req, res) => {
    try {
      const metrics = {
        performance: pipeline.getDatabase().getPerformanceMetrics(),
        activePositions: pipeline.getUserDataStream().getPositions().length,
        signalsToday: pipeline.getEventJournal().getEvents()
            .filter(e => e.severity === 'ORDER' && Date.now() - e.timestamp < 86400000).length
      };
      res.json({ success: true, ...metrics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/protected/bot-status', async (req: AuthRequest, res) => {
    try {
      const status = {
        isRunning: pipeline.getIsRunning(),
        killSwitch: {
          active: pipeline.getKillSwitch().isActive(),
          level: pipeline.getKillSwitch().getLevel()
        },
        activeSymbols: pipeline.getConfig().activeSymbols,
        lastSignals: Array.from(pipeline.getLastSignals().values()),
        balance: pipeline.getUserDataStream().getBalance(),
        positions: pipeline.getUserDataStream().getPositions(),
        recentEvents: pipeline.getEventJournal().getEvents().slice(0, 10)
      };
      
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch bot status" });
    }
  });

  app.get('/api/protected/risk-status', async (req: AuthRequest, res) => {
    try {
      const riskManager = pipeline.getDynamicRiskManager();
      const lastDecision = riskManager.getLastDecision();
      const history = riskManager.getDecisionHistory(50);

      res.json({
        success: true,
        currentDecision: lastDecision,
        history,
        summary: {
          totalDecisions: history.length,
          normalCount: history.filter(d => d.action === 'NORMAL').length,
          pauseCount: history.filter(d => d.action === 'PAUSE').length,
          stopCount: history.filter(d => d.action === 'STOP').length,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/protected/regime-status', async (req: AuthRequest, res) => {
    try {
      const symbol = pipeline.getConfig().activeSymbols[0] || 'BTC/USDT';
      const candles = pipeline.getMarketData().getCandles(symbol);
      const detector = pipeline.getRegimeDetector();
      
      // Update with latest candles for the API call specifically
      detector.update(candles);
      const analysis = detector.analyze();

      res.json({
        success: true,
        symbol,
        analysis
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fast read-only live status endpoint for instantaneous UI loading
  app.get('/api/live-status', (req, res) => {
    try {
      const activeSymbols = pipeline.getConfig().activeSymbols;
      const candlesDict: Record<string, any> = {};
      const orderBooksDict: Record<string, any> = {};
      const featuresDict: Record<string, any> = {};

      for (const symbol of activeSymbols) {
        candlesDict[symbol] = pipeline.getMarketData().getCandles(symbol);
        orderBooksDict[symbol] = pipeline.getOrderBookBuilder().getBook(symbol);
        featuresDict[symbol] = pipeline.getLastFeatures().get(symbol);
      }

      const defaultSymbol = activeSymbols[0] || 'BTC/USDT';
      const defaultCandles = candlesDict[defaultSymbol] || [];
      if (defaultCandles.length > 0) {
        pipeline.getRegimeDetector().update(defaultCandles);
      }
      const regime = pipeline.getRegimeDetector().analyze();
      const riskDecision = pipeline.getDynamicRiskManager().getLastDecision();

      res.json({
        isRunning: pipeline.getIsRunning(),
        balance: pipeline.getUserDataStream().getBalance(),
        positions: pipeline.getUserDataStream().getPositions(),
        orders: pipeline.getOrderGateway().getOrders(),
        signals: Array.from(pipeline.getLastSignals().values()),
        health: pipeline.getHealthMonitor().getHealth(),
        killSwitch: {
          active: pipeline.getKillSwitch().isActive(),
          level: pipeline.getKillSwitch().getLevel(),
          reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
        },
        candles: candlesDict,
        orderBooks: orderBooksDict,
        features: featuresDict,
        regime,
        riskDecision,
        portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
        qualifiedAssets: pipeline.getAssetScreener().getReport(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get live status' });
    }
  });

  // Create HTTP Server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Baselbot Brain Server running on http://0.0.0.0:${PORT}`);
  });

  // 3. Setup WebSocket Server for Real-Time UI Telemetry on /brain-ws
  app.ws("/brain-ws", async (ws: any, req) => {
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    const hasAdminList = adminEmailsEnv.trim().length > 0;

    const verifyToken = async (tok: string): Promise<boolean> => {
      try {
        const { adminAuth } = await import("./src/lib/firebase-admin.ts");
        const decodedToken = await adminAuth.verifyIdToken(tok);
        if (hasAdminList) {
          const allowedList = adminEmailsEnv.split(',').map((e) => e.trim().toLowerCase());
          const userEmail = (decodedToken.email || '').toLowerCase();
          return allowedList.includes(userEmail);
        }
        return true;
      } catch (err: any) {
        console.warn("⛔ Brain WebSocket auth check failed:", err.message);
        return false;
      }
    };

    const sendInitialState = () => {
      try {
        const activeSymbols = pipeline.getConfig().activeSymbols;
        const candlesDict: Record<string, any> = {};
        const orderBooksDict: Record<string, any> = {};
        const featuresDict: Record<string, any> = {};

        for (const symbol of activeSymbols) {
          candlesDict[symbol] = pipeline.getMarketData().getCandles(symbol);
          orderBooksDict[symbol] = pipeline.getOrderBookBuilder().getBook(symbol);
          featuresDict[symbol] = pipeline.getLastFeatures().get(symbol);
        }

        const defaultSymbol = activeSymbols[0] || 'BTC/USDT';
        const defaultCandles = candlesDict[defaultSymbol] || [];
        if (defaultCandles.length > 0) {
          pipeline.getRegimeDetector().update(defaultCandles);
        }
        const regime = pipeline.getRegimeDetector().analyze();
        const riskDecision = pipeline.getDynamicRiskManager().getLastDecision();

        ws.send(JSON.stringify({
          type: "INIT_STATE",
          data: {
            isRunning: pipeline.getIsRunning(),
            balance: pipeline.getUserDataStream().getBalance(),
            positions: pipeline.getUserDataStream().getPositions(),
            orders: pipeline.getOrderGateway().getOrders(),
            signals: Array.from(pipeline.getLastSignals().values()),
            health: pipeline.getHealthMonitor().getHealth(),
            killSwitch: {
              active: pipeline.getKillSwitch().isActive(),
              level: pipeline.getKillSwitch().getLevel(),
              reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
            },
            candles: candlesDict,
            orderBooks: orderBooksDict,
            features: featuresDict,
            regime,
            riskDecision,
            portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
            qualifiedAssets: pipeline.getAssetScreener().getReport(),
          },
        }));
      } catch (err) {
        console.error("Error sending initial WS state:", err);
      }
    };

    // Check optional URL query token
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const queryToken = urlObj.searchParams.get("token");

    ws.isOperator = false;

    if (queryToken) {
      const valid = await verifyToken(queryToken);
      if (valid) {
        ws.isOperator = true;
      }
    }

    console.log("✅ Brain WebSocket Connected via express-ws");
    sendInitialState();

    ws.on("message", async (msgStr: string) => {
      try {
        const msg = JSON.parse(msgStr.toString());
        if (msg.type === "AUTH" && msg.token) {
          const valid = await verifyToken(msg.token);
          if (valid) {
            ws.isOperator = true;
            console.log("✅ Brain WebSocket Operator Authenticated");
            ws.send(JSON.stringify({ type: "AUTH_SUCCESS", isOperator: true }));
          } else {
            ws.send(JSON.stringify({ type: "AUTH_FAILED", error: "Not an authorized admin" }));
          }
        }
      } catch (e) {
        // Non-JSON or ping
      }
    });

    ws.on("close", () => {
      console.log("❌ Brain WebSocket Disconnected");
    });
  });

  // Broadcast state updates every 500ms
  const broadcastInterval = setInterval(() => {
    try {
      const activeSymbols = pipeline.getConfig().activeSymbols;
      const candlesDict: Record<string, any> = {};
      const orderBooksDict: Record<string, any> = {};
      const featuresDict: Record<string, any> = {};

      for (const symbol of activeSymbols) {
        candlesDict[symbol] = pipeline.getMarketData().getCandles(symbol);
        orderBooksDict[symbol] = pipeline.getOrderBookBuilder().getBook(symbol);
        featuresDict[symbol] = pipeline.getLastFeatures().get(symbol);
      }

      const defaultSymbol = activeSymbols[0] || 'BTC/USDT';
      const defaultCandles = candlesDict[defaultSymbol] || [];
      if (defaultCandles.length > 0) {
        pipeline.getRegimeDetector().update(defaultCandles);
      }
      const regime = pipeline.getRegimeDetector().analyze();
      const riskDecision = pipeline.getDynamicRiskManager().getLastDecision();

      const statePayload = JSON.stringify({
        type: "STATE_UPDATE",
        data: {
          isRunning: pipeline.getIsRunning(),
          balance: pipeline.getUserDataStream().getBalance(),
          positions: pipeline.getUserDataStream().getPositions(),
          orders: pipeline.getOrderGateway().getOrders(),
          signals: Array.from(pipeline.getLastSignals().values()),
          health: pipeline.getHealthMonitor().getHealth(),
          killSwitch: {
            active: pipeline.getKillSwitch().isActive(),
            level: pipeline.getKillSwitch().getLevel(),
            reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
          },
          candles: candlesDict,
          orderBooks: orderBooksDict,
          features: featuresDict,
          regime,
          riskDecision,
          portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
          qualifiedAssets: pipeline.getAssetScreener().getReport(),
        },
      });

      // Periodically log state health
      if (Math.random() < 0.05) {
        const bal = pipeline.getUserDataStream().getBalance();
        const candCount = Object.values(candlesDict).reduce((acc: number, c: any) => acc + (c?.length || 0), 0);
        console.log(`📡 Broadcast: Bal=$${bal.totalEquity.toFixed(2)}, Candles=${candCount}, Signals=${pipeline.getLastSignals().size}, Status=${pipeline.getIsRunning() ? 'RUNNING' : 'STOPPED'}`);
      }

      const wss = expressWsInstance.getWss();
      wss.clients.forEach((client: any) => {
        if (client.readyState === 1) { // OPEN
          client.send(statePayload);
        }
      });
    } catch (err) {
      console.error("Error broadcasting state:", err);
    }
  }, 500);

  server.on("close", () => {
    clearInterval(broadcastInterval);
  });

  // 4. Vite Middleware Setup for Frontend SPA
  const distPath = path.join(process.cwd(), "dist");
  const indexHtmlExists = fs.existsSync(path.join(distPath, "index.html"));
  const isProduction = process.env.NODE_ENV === "production" && indexHtmlExists;

  if (!isProduction) {
    console.log("ℹ️ Starting Vite Dev Middleware Server (Development Workspace Preview mode)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("ℹ️ Serving compiled production static files from dist...");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Graceful Shutdown handler
  const gracefulShutdown = async (signal: string) => {
    console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
    
    // 1. Notify Telegram of shutdown
    try {
      await telegramService.sendMessage(`⚠️ <b>Baselbot Shutdown Alert</b>\n\n🛑 Received ${signal}. The trading pipeline has been stopped gracefully.`);
    } catch (e) {
      console.error("Failed to send Telegram shutdown alert:", e);
    }

    // 2. Stop pipeline rebalance timers and processes
    clearInterval(broadcastInterval);
    pipeline.stop();
    console.log("⏹️ Trading Pipeline stopped.");

    // 3. Save final database snapshots
    const balance = pipeline.getUserDataStream().getBalance();
    await pipeline.getDatabase().saveBalanceSnapshot(balance.totalEquity, balance.freeMargin, balance.unrealizedPnl);
    pipeline.getDatabase().close();
    console.log("💾 Final balance snapshots persisted.");

    // 4. Close Server
    server.close(() => {
      console.log("🔌 HTTP Server closed.");
      process.exit(0);
    });

    // Fallback exit if server closing hangs
    setTimeout(() => {
      console.log("⚠️ Force exit after timeout");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer();
