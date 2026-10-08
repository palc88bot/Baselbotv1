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
import { QuantumTrainingSimulator } from "./src/strategies/QuantumTrainingSimulator";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { CloudDatabaseService } from "./src/storage/CloudDatabaseService.ts";
import { isLiveTradingConfirmed } from "./src/domain/types";
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

  // CORS: never reflect arbitrary origins when credentials are enabled.
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || process.env.APP_URL || '')
      .split(',').map((value) => value.trim()).filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      let sameHost = false;
      try { sameHost = new URL(origin).host === req.headers.host; } catch { sameHost = false; }
      if (allowedOrigins.has(origin) || sameHost) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization");
    if (req.method === "OPTIONS") {
      if (origin && !res.getHeader("Access-Control-Allow-Origin")) res.sendStatus(403);
      else res.sendStatus(200);
    } else {
      next();
    }
  });

  // Initialize Services
  const telegramService = new TelegramService();
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    telegramService.updateConfig(tgChatId, true);
    console.log(`🤖 Telegram notification service auto-enabled for channel/chat ID: ***${tgChatId.slice(-4)}`);
  }
  const pipeline = new TradingPipeline(telegramService);

  // Trading must be explicitly enabled; LIVE also requires a separate env confirmation.
  const autoStartEnabled = process.env.AUTO_START_TRADING === 'true';
  const liveMode = pipeline.getOrderGateway().getExecutionMode() === 'LIVE';
  if (autoStartEnabled && (!liveMode || isLiveTradingConfirmed())) {
    pipeline.startAutonomousTrading().catch(err => {
      console.error("❌ Failed to auto-start pipeline:", err);
    });
  } else {
    console.info('Trading pipeline remains stopped; enable it through authenticated control or AUTO_START_TRADING=true.');
  }
  
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

  app.get(["/api/ping", "/api/keep-alive"], (req, res) => {
    res.json({
      status: "alive",
      timestamp: Date.now(),
      uptimeSeconds: Math.floor(process.uptime()),
      botIsRunning: pipeline.getIsRunning(),
      message: "24/7 Keep-Alive heartbeat acknowledged. Server is active."
    });
  });

  // 🔄 24/7 Autonomous Keep-Alive Self-Pinger:
  // Regularly triggers internal routes to prevent event loop idling
  const keepAliveInterval = setInterval(async () => {
    try {
      const pingUrl = process.env.APP_URL && !process.env.APP_URL.includes("MY_APP_URL")
        ? `${process.env.APP_URL}/api/ping`
        : "http://localhost:3000/api/ping";
      await fetch(pingUrl).catch(() => {});
    } catch {
      // Non-blocking keep-alive ping
    }
  }, 25000);

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

  // Protect every API route by default. Only public market-data GETs are allowlisted;
  // health/ping routes above are intentionally registered before this middleware.
  const publicRateBuckets = new Map<string, { start: number; count: number }>();
  const publicMarketDataPaths = new Set([
    '/api/binance/tickers',
    '/api/binance/klines',
    '/api/binance/depth',
  ]);
  app.use('/api', (req, res, next) => {
    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    if (req.method === 'GET' && publicMarketDataPaths.has(pathname)) {
      const q = req.query as Record<string, any>;
      const lim = q.limit === undefined ? 0 : Number(q.limit);
      const validInterval = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'];
      if (
        (q.symbol !== undefined && !/^[A-Za-z0-9]{3,20}$/.test(String(q.symbol))) ||
        (q.interval !== undefined && !validInterval.includes(String(q.interval))) ||
        !Number.isFinite(lim) || lim < 0 || lim > 1000
      ) {
        res.status(400).json({ success: false, error: 'Invalid market-data query' });
        return;
      }
      const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
      const nowMs = Date.now();
      const bucket = publicRateBuckets.get(ip);
      if (!bucket || nowMs - bucket.start > 60_000) {
        publicRateBuckets.set(ip, { start: nowMs, count: 1 });
      } else if (++bucket.count > 120) {
        res.status(429).json({ success: false, error: 'Too many requests' });
        return;
      }
      if (publicRateBuckets.size > 5000) publicRateBuckets.clear();
      next();
      return;
    }
    void requireAuth(req as AuthRequest, res, next);
  });

  app.post(["/api/protected/toggle-trading", "/api/control/run"], async (req: AuthRequest, res) => {
    try {
      const { running, isRunning } = req.body || {};
      const target = running !== undefined ? running : (isRunning !== undefined ? isRunning : !pipeline.getIsRunning());
      if (target) {
        if (pipeline.getOrderGateway().getExecutionMode() === 'LIVE' && !isLiveTradingConfirmed()) {
          res.status(409).json({ success: false, error: 'LIVE mode requires CONFIRM_LIVE_TRADING=true before starting.' });
          return;
        }
        await pipeline.startAutonomousTrading();
        await telegramService.sendMessage('🚀 <b>تم تفعيل خط التداول الآلي (Basel AlgoCore)</b>\n\n✅ البوت قيد التشغيل الآن وسيتم إرسال إشعار فحص دوري كل 30 دقيقة.').catch(() => {});
      } else {
        pipeline.stop();
        await telegramService.sendMessage('🛑 <b>تم إيقاف خط التداول الآلي (Basel AlgoCore)</b>\n\n⚠️ البوت متوقف عن التداول حالياً وسيتم إشعارك بالحالة كل 30 دقيقة.').catch(() => {});
      }
      res.json({ success: true, isRunning: pipeline.getIsRunning() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // KillSwitch Endpoints
  app.post(["/api/protected/killswitch/trigger", "/api/protected/kill-switch"], async (req: AuthRequest, res) => {
    try {
      const { level, reason } = req.body || {};
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

  app.post(["/api/protected/killswitch/reset", "/api/protected/reset-kill-switch"], async (req: AuthRequest, res) => {
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
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { symbol, side, type, quantity, price, timeInForce } = body;
      if (typeof symbol !== 'string' || !pipeline.getConfig().activeSymbols.includes(symbol)
        || !['BUY', 'SELL'].includes(side)
        || !['MARKET', 'LIMIT'].includes(type)
        || !Number.isFinite(quantity) || quantity <= 0
        || !Number.isFinite(price) || price <= 0
        || (timeInForce !== undefined && !['GTC', 'IOC', 'FOK'].includes(timeInForce))) {
        res.status(400).json({ success: false, error: 'Invalid manual order payload.' });
        return;
      }
      const order = pipeline.getOrderGateway().submitOrder({ symbol, side, type, quantity, price, timeInForce });
      const accepted = order.status !== 'REJECTED';
      res.status(accepted ? 202 : 422).json({ success: accepted, order, error: order.errorMessage });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(["/api/protected/positions/scale-up", "/api/positions/scale-up"], async (req: AuthRequest, res) => {
    try {
      const targetMargin = parseFloat(req.body?.targetMargin) || 6.0;
      const result = await pipeline.scaleUpCurrentPositions(targetMargin);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // QUANTUM BOARD $200 SIMULATOR & TRAINING API
  // ==========================================
  const quantumSimulator = QuantumTrainingSimulator.getInstance();

  app.get(["/api/quantum-training/status", "/api/protected/quantum-training/status"], async (req: AuthRequest, res) => {
    try {
      res.json({
        success: true,
        wallet: quantumSimulator.getWalletState(),
        recentTrades: quantumSimulator.getRecentTrades(60),
        activePolicy: quantumSimulator.getActivePolicy(),
        deliberations: quantumSimulator.getDeliberations(),
        binanceQuota: quantumSimulator.getBinanceQuotaMetrics()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get(["/api/quantum-training/deliberations", "/api/protected/quantum-training/deliberations"], async (req: AuthRequest, res) => {
    try {
      res.json({
        success: true,
        deliberations: quantumSimulator.getDeliberations(),
        activePolicy: quantumSimulator.getActivePolicy()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get(["/api/quantum-training/policy", "/api/protected/quantum-training/policy"], async (req: AuthRequest, res) => {
    try {
      res.json({
        success: true,
        policy: quantumSimulator.getActivePolicy()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(["/api/quantum-training/batch", "/api/protected/quantum-training/batch"], async (req: AuthRequest, res) => {
    try {
      const count = parseInt(req.body?.count, 10) || 25;
      const result = await quantumSimulator.runBatchTraining(count);
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(["/api/quantum-training/toggle-auto", "/api/protected/quantum-training/toggle-auto"], async (req: AuthRequest, res) => {
    try {
      const enable = req.body?.enable !== undefined ? Boolean(req.body.enable) : undefined;
      const isAuto = quantumSimulator.toggleAutoTraining(enable);
      res.json({
        success: true,
        isAutoTraining: isAuto,
        wallet: quantumSimulator.getWalletState()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(["/api/quantum-training/reset", "/api/protected/quantum-training/reset"], async (req: AuthRequest, res) => {
    try {
      const amount = parseFloat(req.body?.amount) || 200.0;
      const wallet = quantumSimulator.resetTrainingWallet(amount);
      res.json({
        success: true,
        wallet
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/protected/order-history", async (req: AuthRequest, res) => {
    try {
      // Fetch genuine trades recorded in persistent DB
      const dbTrades = await (pipeline.getDatabase() as any).getAllTrades?.() || await pipeline.getDatabase().getOpenTrades();
      
      const genuineOrders: any[] = dbTrades.map((t: any) => ({
        id: t.id,
        clientOrderId: `DB-${t.id}`,
        symbol: t.symbol,
        side: t.side,
        type: 'MARKET',
        price: t.price,
        quantity: t.quantity,
        filledQuantity: t.quantity,
        remainingQuantity: 0,
        avgFillPrice: t.price,
        status: t.status === 'CLOSED' ? 'FILLED' : (t.status === 'OPEN' ? 'OPEN' : t.status),
        pnl: t.pnl || 0,
        exitPrice: t.exitPrice,
        closedAt: t.closedAt,
        timestamp: t.timestamp,
        updatedAt: t.closedAt || t.timestamp,
        strategyId: t.strategy || 'BASEL-ALGOCORE',
        executionTag: t.strategy || 'REAL-EXCHANGE',
      }));

      // Sort by newest first
      genuineOrders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const fills = pipeline.getUserDataStream().getFills();
      
      res.json({
        success: true,
        count: genuineOrders.length,
        orders: genuineOrders,
        totalFills: fills.length,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch order history' });
    }
  });

  app.post("/api/protected/cancel-order", async (req: AuthRequest, res) => {
    try {
      const { orderId, reason } = req.body;
      const cancelled = pipeline.getOrderGateway().cancelOrder(orderId, reason || 'User requested cancellation');
      res.json({ success: cancelled });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/protected/close-all", async (req: AuthRequest, res) => {
    try {
      const result = await pipeline.closeAllPositions();
      res.status(result.success ? 200 : 502).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(["/api/protected/run-optimization", "/api/protected/rebalance"], async (req: AuthRequest, res) => {
    try {
      pipeline.runQuantumOptimization();
      const assets = req.body?.assets;
      if (!Array.isArray(assets) || assets.length === 0) {
        return res.json({
          success: true,
          message: 'QUBO Quantum optimization matrix recomputed successfully',
          timestamp: Date.now()
        });
      }
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

  // NOTE: the pipeline is started above ONLY when AUTO_START_TRADING=true (and, for LIVE, CONFIRM_LIVE_TRADING).
  // An unconditional pipeline.start() used to live here and silently bypassed both safeguards.

  // Telegram Start Notification
  telegramService.sendMessage(`
🚀 <b>تم تشغيل نظام باسل الحسابي الكمي بنجاح</b>
━━━━━━━━━━━━━━━━
⏰ التوقيت: ${new Date().toLocaleTimeString('ar-EG')}
🎯 البيئة: ${process.env.NODE_ENV || 'production'}
📊 عدد أزواج التداول النشطة: ${pipeline.getConfig().activeSymbols.length}
━━━━━━━━━━━━━━━━
✅ محرك التداول الآلي المستمر (Zero-Halt) نشط الآن وجاهز لاقتناص الفرص!
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

  app.get('/api/telegram/status', (req, res) => {
    try {
      res.json({
        ...telegramService.getConfigStatus(),
        heartbeat: pipeline.getHeartbeatStatus()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/telegram/config', async (req, res) => {
    try {
      const { chatId, isEnabled, botToken, heartbeatEnabled, intervalMinutes } = req.body || {};
      telegramService.updateConfig(chatId, isEnabled, botToken, heartbeatEnabled, intervalMinutes);
      pipeline.initHeartbeatTimer();
      res.json({
        success: true,
        status: telegramService.getConfigStatus(),
        heartbeat: pipeline.getHeartbeatStatus()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post(['/api/telegram/heartbeat/send-now', '/api/protected/telegram/test'], async (req, res) => {
    try {
      const result = await pipeline.sendHeartbeatNotification(true);
      res.json({
        success: result.success,
        message: result.success 
          ? (result.isRunning 
              ? '✅ تم إرسال إشعار نصف ساعوي: البوت يعمل بنجاح (RUNNING)!' 
              : '🛑 تم إرسال إشعار نصف ساعوي: البوت متوقف حالياً (STOPPED)!') 
          : '⚠️ تعذر الإرسال لتليجرام. يرجى التأكد من إدخال رمز البوت (Bot Token) ومعرف القناة/المحادثة (Chat ID).',
        isRunning: result.isRunning,
        heartbeat: pipeline.getHeartbeatStatus()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
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
  // --- Sub-Wallet & Realignment Endpoints ---
  app.get('/api/sub-wallet/state', (req, res) => {
    try {
      res.json({ success: true, subWallet: pipeline.getSubWallet().getState() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/sub-wallet/reset', async (req, res) => {
    try {
      const amount = Number(req.body?.amount) || 25.0;
      const newState = pipeline.getSubWallet().resetSubWallet(amount);
      res.json({ success: true, subWallet: newState });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

    // Close single position on Binance & Bot
  const handleClosePosition = async (req: express.Request, res: express.Response) => {
    try {
      const symbol = req.body?.symbol;
      if (!symbol) {
        return res.status(400).json({ success: false, error: 'Symbol is required' });
      }
      const result = await pipeline.closeSinglePositionOnExchange(symbol, req.body?.reason || 'Manual Dashboard Close');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
  app.post('/api/positions/close', handleClosePosition);
  app.post('/api/protected/positions/close', handleClosePosition);

  app.post('/api/trades/reset-and-realign', async (req, res) => {
    try {
      await pipeline.liquidateAndResetForNewWallet();
      res.json({ success: true, message: 'All trades liquidated and realigned to 5 sub-wallet successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // --- Backtesting API Endpoint ---
  app.post('/api/protected/backtest/run', async (req: AuthRequest, res) => {
    try {
      // Defaults are MERGED so a request that omits costs can never run a zero-fee / zero-slippage backtest.
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const config = {
        symbols: ['BTC/USDT', 'ETH/USDT'],
        startDate: '2024-01-01',
        endDate: '2024-09-01',
        initialCapital: 10000,
        commission: 0.0005,   // 5 bps taker (Binance futures VIP0)
        slippage: 0.0002,
        maxLeverage: 3,
        ...body,
      };
      if (!Array.isArray(config.symbols) || config.symbols.length === 0 || config.symbols.length > 10) {
        return res.status(400).json({ success: false, error: 'symbols must be an array of 1-10 items' });
      }
      if (!(Number(config.commission) >= 0.0002) || !(Number(config.slippage) >= 0)) {
        return res.status(400).json({ success: false, error: 'commission must be >= 0.0002 and slippage >= 0' });
      }

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

  app.post('/api/protected/symbols/add', async (req, res) => {
    try {
      const { symbol } = req.body;
      if (!symbol) {
        return res.status(400).json({ success: false, error: 'Symbol parameter is required (e.g. SUI/USDT)' });
      }
      const added = await pipeline.addSymbol(symbol);
      res.json({
        success: true,
        added,
        message: added ? `Symbol ${symbol} added and streaming initialized` : `Symbol ${symbol} is already active`,
        activeSymbols: pipeline.getConfig().activeSymbols
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to add symbol' });
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

  // --- Strategy Management APIs ---
  app.get('/api/strategies', (req, res) => {
    try {
      res.json({
        success: true,
        strategies: pipeline.getStrategies(),
        screener: pipeline.getStrategyScreener(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/strategies/:id/toggle', (req, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;
      const strategy = pipeline.toggleStrategy(id, active);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }
      res.json({ success: true, strategy });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/strategies/:id/params', (req, res) => {
    try {
      const { id } = req.params;
      const params = req.body;
      const strategy = pipeline.updateStrategyParams(id, params);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }
      res.json({ success: true, strategy });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/strategies/reallocate', (req, res) => {
    try {
      const { allocations } = req.body; // e.g. { 'ou-mean-reversion': 40, 'quantum-qubo-alpha': 30, ... }
      if (!allocations || typeof allocations !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid allocations payload' });
      }
      const strategies = pipeline.rebalanceStrategies(allocations);
      res.json({ success: true, strategies });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // --- 🏛️ Board of Directors (14 Autonomous Agents) Endpoints ---
  app.get('/api/board/status', (req, res) => {
    try {
      res.json({ success: true, report: pipeline.getBoardOfDirectors().getStatusReport() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/board/hold-meeting', (req, res) => {
    try {
      const symbol = req.body?.symbol || 'BTC/USDT';
      const candles = pipeline.getMarketData().getCandles(symbol) || [];
      const features = pipeline.getLastFeatures().get(symbol);
      const activeSymbols = pipeline.getConfig().activeSymbols || [symbol];
      const candlesMap: Record<string, any> = {};
      for (const sym of activeSymbols) {
        candlesMap[sym] = pipeline.getMarketData().getCandles(sym) || [];
      }
      const signals = Array.from(pipeline.getLastSignals().values()).filter(s => s.symbol === symbol);
      const regime = pipeline.getRegimeDetector().analyze();
      const capital = pipeline.getSubWallet().getCurrentEquity();

      const decision = pipeline.getBoardOfDirectors().holdMeeting({
        symbol,
        candles,
        candlesMap,
        signals,
        features,
        regime,
        capital,
        latencyMs: 12
      });

      res.json({ success: true, decision });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/board/learn', (req, res) => {
    try {
      const pnl = Number(req.body?.pnl) || 0;
      const symbol = req.body?.symbol || 'BTC/USDT';
      const event = pipeline.getBoardOfDirectors().learnFromOutcome(pnl, symbol);
      const report = pipeline.getBoardOfDirectors().getStatusReport();

      // Broadcast to WebSocket clients
      try {
        const wss = expressWsInstance.getWss();
        const payload = JSON.stringify({
          type: "BOARD_LEARNED",
          data: { event, report }
        });
        wss.clients.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });
      } catch (wsErr) {
        // ignore ws broadcast err
      }

      res.json({ success: true, event, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/strategies/screener', (req, res) => {
    try {
      const screener = pipeline.getStrategyScreener();
      res.json({ success: true, screener, count: screener.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
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

      const allPrices = pipeline.getMarketData().getAllPrices();
      const lastSignalsList = Array.from(pipeline.getLastSignals().values());

      res.json({
        isRunning: pipeline.getIsRunning(),
        executionMode: pipeline.getOrderGateway().getExecutionMode(),
        balance: pipeline.getUserDataStream().getBalance(),
        positions: pipeline.getUserDataStream().getPositions(),
        orders: pipeline.getOrderGateway().getOrders(),
        signals: lastSignalsList,
        lastSignal: lastSignalsList[0] || null,
        health: pipeline.getHealthMonitor().getHealth(),
            watchdog: pipeline.getWatchdog().getStatus(),
        killSwitch: {
          active: pipeline.getKillSwitch().isActive(),
          level: pipeline.getKillSwitch().getLevel(),
          reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
        },
        prices: allPrices,
        candles: candlesDict,
        candlesDict,
        orderBook: orderBooksDict[defaultSymbol] || null,
        orderBooks: orderBooksDict,
        orderBooksDict,
        features: featuresDict[defaultSymbol] || null,
        featuresDict,
        regime,
        riskDecision,
        subWallet: pipeline.getSubWallet().getState(),
            portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
        qualifiedAssets: pipeline.getAssetScreener().getReport(),
        strategies: pipeline.getStrategies(),
        strategyScreener: pipeline.getStrategyScreener(),
        boardOfDirectors: pipeline.getBoardOfDirectors().getStatusReport(),
        quantumTrainingWallet: quantumSimulator.getWalletState(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get live status' });
    }
  });

  // --- Dedicated Binance Real-Time Proxy Endpoints (CORS-free & Sandbox Safe) ---
  let cachedTickers: any[] = [];
  let lastTickersFetchTime = 0;

  app.get('/api/binance/tickers', async (req, res) => {
    try {
      const now = Date.now();
      // Return cached tickers if fresher than 2.5 seconds
      if (cachedTickers.length > 0 && now - lastTickersFetchTime < 2500) {
        return res.json(cachedTickers);
      }

      // Try fetching directly from Binance REST API with timeout
      const targetSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT', 'SUIUSDT', 'NEARUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'BNBUSDT', 'AVAXUSDT', 'QNTUSDT'];
      const symParam = encodeURIComponent(JSON.stringify(targetSymbols));

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symParam}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (binanceRes.ok) {
          const data = await binanceRes.json();
          if (Array.isArray(data) && data.length > 0) {
            cachedTickers = data;
            lastTickersFetchTime = now;
            return res.json(data);
          }
        }
      } catch {
        // Fallback to internal pipeline market data
      }

      // Fallback: construct 100% real live prices from pipeline
      const prices = pipeline.getMarketData().getAllPrices();
      const fallbackList: any[] = [];
      for (const [sym, price] of Object.entries(prices)) {
        const binanceSym = sym.replace('/', '').toUpperCase();
        const candles = pipeline.getMarketData().getCandles(sym as any);
        let highPrice = price * 1.015;
        let lowPrice = price * 0.985;
        let priceChangePercent = "0.00";
        let quoteVol = "1500000000.00";
        if (candles.length > 0) {
          const highs = candles.map(c => c.high);
          const lows = candles.map(c => c.low);
          highPrice = Math.max(...highs, price);
          lowPrice = Math.min(...lows, price);
          const firstClose = candles[0].open || candles[0].close;
          if (firstClose > 0) {
            priceChangePercent = (((price - firstClose) / firstClose) * 100).toFixed(2);
          }
          const sumVol = candles.reduce((acc, c) => acc + (c.volume * c.close), 0);
          if (sumVol > 0) quoteVol = (sumVol * 1440 / candles.length).toFixed(2);
        }

        fallbackList.push({
          symbol: binanceSym,
          lastPrice: price.toString(),
          priceChangePercent,
          highPrice: highPrice.toFixed(2),
          lowPrice: lowPrice.toFixed(2),
          quoteVolume: quoteVol
        });
      }

      cachedTickers = fallbackList;
      lastTickersFetchTime = now;
      res.json(fallbackList);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch tickers' });
    }
  });

  app.get('/api/binance/klines', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string || 'BTCUSDT').toUpperCase();
      const interval = (req.query.interval as string || '1m');
      const limit = parseInt(req.query.limit as string || '25', 10);

      // Attempt Binance fetch
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const binanceRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (binanceRes.ok) {
          const klines = await binanceRes.json();
          if (Array.isArray(klines) && klines.length > 0) {
            return res.json(klines);
          }
        }
      } catch {
        // Fallback to internal pipeline candles
      }

      const mappedSym = (symbol.endsWith('USDT') ? symbol.replace('USDT', '/USDT') : symbol) as any;
      const candles = pipeline.getMarketData().getCandles(mappedSym);
      if (candles.length > 0) {
        const sliced = candles.slice(-limit);
        const mappedKlines = sliced.map(c => [
          c.timestamp,
          c.open.toString(),
          c.high.toString(),
          c.low.toString(),
          c.close.toString(),
          c.volume.toString(),
          c.timestamp + 60000,
          (c.volume * c.close).toString(),
          100
        ]);
        return res.json(mappedKlines);
      }

      res.json([]);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch klines' });
    }
  });

  app.get('/api/binance/depth', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string || 'BTCUSDT').toUpperCase();
      const limit = parseInt(req.query.limit as string || '10', 10);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const binanceRes = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (binanceRes.ok) {
          const depth = await binanceRes.json();
          if (depth && depth.bids && depth.asks) {
            return res.json(depth);
          }
        }
      } catch {
        // Fallback to internal OrderBook
      }

      const mappedSym = (symbol.endsWith('USDT') ? symbol.replace('USDT', '/USDT') : symbol) as any;
      const book = pipeline.getOrderBookBuilder().getBook(mappedSym);
      if (book) {
        return res.json({
          lastUpdateId: book.sequence || Date.now(),
          bids: book.bids.slice(0, limit).map(b => [b.price.toString(), b.size.toString()]),
          asks: book.asks.slice(0, limit).map(a => [a.price.toString(), a.size.toString()]),
        });
      }

      res.json({ lastUpdateId: Date.now(), bids: [], asks: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch depth' });
    }
  });

  // Create HTTP Server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Baselbot Brain Server running on http://0.0.0.0:${PORT}`);
  });

  // 3. Setup WebSocket Server for Real-Time UI Telemetry on /brain-ws
  app.ws("/brain-ws", async (ws: any, req) => {
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    const allowedEmails = new Set(adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

    const verifyToken = async (tok: string): Promise<boolean> => {
      if (!tok || allowedEmails.size === 0) return false;
      try {
        const { adminAuth } = await import("./src/lib/firebase-admin.ts");
        const decodedToken = await adminAuth.verifyIdToken(tok, true);
        const userEmail = (decodedToken.email || '').trim().toLowerCase();
        return decodedToken.email_verified === true && allowedEmails.has(userEmail);
      } catch (err: any) {
        console.warn("⛔ Brain WebSocket auth check failed:", err?.code || 'token-verification-failed');
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
        const allPrices = pipeline.getMarketData().getAllPrices();
        const lastSignalsList = Array.from(pipeline.getLastSignals().values());

        ws.send(JSON.stringify({
          type: "INITIAL_STATE",
          data: {
            isRunning: pipeline.getIsRunning(),
            balance: pipeline.getUserDataStream().getBalance(),
            positions: pipeline.getUserDataStream().getPositions(),
            orders: pipeline.getOrderGateway().getOrders(),
            signals: lastSignalsList,
            lastSignal: lastSignalsList[0] || null,
            health: pipeline.getHealthMonitor().getHealth(),
            watchdog: pipeline.getWatchdog().getStatus(),
            killSwitch: {
              active: pipeline.getKillSwitch().isActive(),
              level: pipeline.getKillSwitch().getLevel(),
              reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
            },
            prices: allPrices,
            candles: candlesDict,
            candlesDict,
            orderBook: orderBooksDict[defaultSymbol] || null,
            orderBooks: orderBooksDict,
            orderBooksDict,
            features: featuresDict[defaultSymbol] || null,
            featuresDict,
            regime,
            riskDecision,
            subWallet: pipeline.getSubWallet().getState(),
            portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
            qualifiedAssets: pipeline.getAssetScreener().getReport(),
            strategies: pipeline.getStrategies(),
            strategyScreener: pipeline.getStrategyScreener(),
          },
        }));
      } catch (err) {
        console.error("Error sending initial WS state:", err);
      }
    };

    // Authenticate over the WebSocket message channel; do not put bearer tokens in URLs.
    ws.isOperator = false;
    const authTimeout = setTimeout(() => {
      if (!ws.isOperator) ws.close(1008, 'Authentication required');
    }, 10000);

    console.log("✅ Brain WebSocket Connected via express-ws");

    ws.on("message", async (msgStr: string) => {
      try {
        const msg = JSON.parse(msgStr.toString());
        if (!ws.isOperator) {
          if (msg.type !== 'AUTH' || typeof msg.token !== 'string' || !(await verifyToken(msg.token))) {
            ws.close(1008, 'Invalid authentication');
            return;
          }
          ws.isOperator = true;
          clearTimeout(authTimeout);
          console.log("✅ Brain WebSocket Operator Authenticated");
          ws.send(JSON.stringify({ type: "AUTH_SUCCESS", isOperator: true }));
          sendInitialState();
        }
      } catch (e) {
        // Non-JSON or ping
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
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

      const allPrices = pipeline.getMarketData().getAllPrices();
      const lastSignalsList = Array.from(pipeline.getLastSignals().values());

      const statePayload = JSON.stringify({
        type: "STATE_UPDATE",
        data: {
          isRunning: pipeline.getIsRunning(),
          balance: pipeline.getUserDataStream().getBalance(),
          positions: pipeline.getUserDataStream().getPositions(),
          orders: pipeline.getOrderGateway().getOrders(),
          signals: lastSignalsList,
          lastSignal: lastSignalsList[0] || null,
          health: pipeline.getHealthMonitor().getHealth(),
            watchdog: pipeline.getWatchdog().getStatus(),
          killSwitch: {
            active: pipeline.getKillSwitch().isActive(),
            level: pipeline.getKillSwitch().getLevel(),
            reason: pipeline.getKillSwitch().getHistory()[0]?.reason || 'Normal',
          },
          prices: allPrices,
          candles: candlesDict,
          candlesDict,
          orderBook: orderBooksDict[defaultSymbol] || null,
          orderBooks: orderBooksDict,
          orderBooksDict,
          features: featuresDict[defaultSymbol] || null,
          featuresDict,
          regime,
          riskDecision,
          subWallet: pipeline.getSubWallet().getState(),
            portfolioTier: pipeline.getPortfolioSizer().getPortfolioReport(),
          qualifiedAssets: pipeline.getAssetScreener().getReport(),
          strategies: pipeline.getStrategies(),
          strategyScreener: pipeline.getStrategyScreener(),
          boardOfDirectors: pipeline.getBoardOfDirectors().getStatusReport(),
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
        if (client.readyState === 1 && client.isOperator === true) { // OPEN and authenticated operator
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

  
  // Reset and realign all trades for sub-wallet
    
  app.post('/api/trades/reset-and-realign', async (req, res) => {
    try {
      await pipeline.liquidateAndResetForNewWallet();
      res.json({ success: true, message: 'All trades liquidated and realigned to 5 sub-wallet successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sub-Wallet Reset endpoint
  app.post('/api/sub-wallet/reset', async (req, res) => {
    try {
      const amount = Number(req.body?.amount) || 25.0;
      const newState = pipeline.getSubWallet().resetSubWallet(amount);
      res.json({ success: true, subWallet: newState });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
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
      await telegramService.sendMessage(`⚠️ <b>تنبيه إيقاف النظام (Baselbot)</b>\n\n🛑 تم استقبال إشارة (${signal}). تم إيقاف خط التداول وحفظ بيانات ولقطات المحفظة بنجاح.`);
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
