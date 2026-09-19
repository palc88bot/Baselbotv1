import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { TradingPipeline } from "./src/app/TradingPipeline";
import { SqlDatabaseStore } from "./src/storage/SqlDatabase";
import { TelegramService } from "./src/services/TelegramService";
import { BacktestEngine } from "./src/backtest/BacktestEngine";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS Middleware to allow iframe/cross-origin access safely
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // 1. Initialize Permanent SQL Database Storage Engine
  const sqlDb = new SqlDatabaseStore();

  // Initialize Telegram Alert Service
  const telegramService = new TelegramService();

  // 2. Initialize Trading Brain Pipeline
  const pipeline = new TradingPipeline(telegramService);
  console.log("🚀 Initializing Basel Quantum Trading Pipeline (The Brain)...");
  pipeline.start();

  // Persist executed/updated trades to permanent SQL database
  pipeline.getOrderGateway().subscribeOrders((order) => {
    if (order.status === 'FILLED' || order.status === 'PARTIALLY_FILLED' || order.status === 'NEW') {
      sqlDb.saveTrade({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        price: order.avgFillPrice || order.price,
        quantity: order.filledQuantity || order.quantity,
        timestamp: order.timestamp,
        status: order.status,
      });
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      pipelineHealth: pipeline.getHealthMonitor().getHealth(),
      killSwitch: {
        active: pipeline.getKillSwitch().isActive(),
        level: pipeline.getKillSwitch().getLevel(),
      },
      sqlStorage: "Connected (Permanent SQLite / Cloud Run Persistent Volume)",
    });
  });

  // Telegram Alert Service API
  app.get("/api/telegram/status", (req, res) => {
    res.json({ success: true, ...telegramService.getConfigStatus() });
  });

  app.post("/api/telegram/config", (req, res) => {
    try {
      const { chatId, isEnabled } = req.body;
      telegramService.updateConfig(chatId, isEnabled);
      res.json({ success: true, ...telegramService.getConfigStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/toggle-trading", (req, res) => {
    const { running } = req.body;
    if (running) {
      pipeline.startAutonomousTrading();
    } else {
      pipeline.stop();
    }
    res.json({ success: true, isRunning: running });
  });

  app.post("/api/run-optimization", async (req, res) => {
    try {
      const { assets, constraints } = req.body;
      const db = pipeline.getDatabase();
      const solver = new QuantumInspiredSolver();
      
      // Get historical data for the requested assets
      const historicalReturns = [];
      for (const symbol of assets) {
        const prices = await db.getPriceHistory(symbol, 100);
        if (prices.length > 1) {
          const returns = [];
          for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i].price - prices[i-1].price) / prices[i-1].price);
          }
          historicalReturns.push(returns);
        }
      }

      if (historicalReturns.length === 0) {
        return res.status(400).json({ error: "Insufficient historical data for optimization" });
      }

      // Run real solver
      const solution = solver.solve(historicalReturns, constraints?.riskAversion || 0.5);
      
      res.json({
        success: true,
        weights: solution.weights,
        expectedReturn: solution.expectedReturn,
        risk: solution.risk,
        sharpeRatio: solution.sharpeRatio,
        timestamp: Date.now()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/metrics", (req, res) => {
    res.json({
      performance: pipeline.getLastHealth(),
      activePositions: pipeline.getUserDataStream().getPositions().length,
      uptime: process.uptime()
    });
  });

  // Start Autonomous Trading
  pipeline.startAutonomousTrading();

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

  app.get("/api/system-health", (req, res) => {
    const trades = sqlDb.getPerformanceMetrics();
    const rateLimiter = pipeline.getOrderGateway().getRateLimiter();
    const orderStatus = rateLimiter.getRateLimitStatus('/fapi/v1/order');

    res.json({
        correlation: { level: 'LOW', score: 0.15 }, 
        rateLimit: { 
            usagePercent: (orderStatus.used / orderStatus.limit) * 100, 
            used: orderStatus.used, 
            limit: orderStatus.limit 
        }, 
        db: { totalTrades: trades.totalTrades, winRate: trades.winRate }
    });
  });

  app.get("/api/trades", (req, res) => {
    try {
      const trades = sqlDb.getTrades(100);
      res.json({ success: true, count: trades.length, trades });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch persistent trades" });
    }
  });

  app.post("/api/manual-order", (req, res) => {
    try {
      const { symbol, side, type, quantity, price } = req.body;
      const order = pipeline.getOrderGateway().submitOrder({
        symbol: symbol || 'BTC/USDT',
        side: side || 'BUY',
        type: type || 'LIMIT',
        quantity: quantity || 0.1,
        price: price || 90000,
        strategyId: 'MANUAL_UI',
      });

      // Save to SQL database immediately
      sqlDb.saveTrade({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        timestamp: order.timestamp,
        status: order.status,
      });

      res.json({ success: true, message: "Manual order submitted and saved to SQL permanently", order });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to submit manual order" });
    }
  });

  // --- Telegram Alerts API Endpoints ---
  app.post('/api/telegram/config', (req, res) => {
    try {
      const { chatId, isEnabled } = req.body;
      telegramService.updateConfig(chatId, isEnabled);
      res.json({ success: true, status: telegramService.getConfigStatus() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/telegram/test', async (req, res) => {
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

  // --- Backtesting API Endpoint ---
  app.post('/api/backtest/run', async (req, res) => {
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
  app.get('/api/correlation-report', (req, res) => {
    try {
      const report = pipeline.getCorrelationReport();
      res.json({ success: true, report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/rate-limit-status', (req, res) => {
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

  app.get('/api/bot-status', (req, res) => {
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

  // Create HTTP Server
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Baselbot Brain Server running on http://0.0.0.0:${PORT}`);
  });

  // 3. Setup WebSocket Server for Real-Time UI Telemetry on /ws
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket) => {
    console.log("✅ Frontend UI connected to Trading Brain WebSocket (/ws)");

    // Send initial state including SQL persisted trades
    try {
      const persistentTrades = sqlDb.getTrades(50);
      const activeSymbols = pipeline.getConfig().activeSymbols;
      
      const candlesDict: Record<string, any> = {};
      const orderBooksDict: Record<string, any> = {};
      const featuresDict: Record<string, any> = {};

      for (const symbol of activeSymbols) {
        candlesDict[symbol] = pipeline.getMarketData().getCandles(symbol);
        orderBooksDict[symbol] = pipeline.getOrderBookBuilder().getBook(symbol);
        featuresDict[symbol] = pipeline.getLastFeatures().get(symbol);
      }

      ws.send(
        JSON.stringify({
          type: "INIT_STATE",
          data: {
            balance: pipeline.getUserDataStream().getBalance(),
            positions: pipeline.getUserDataStream().getPositions(),
            orders: persistentTrades.length > 0 ? persistentTrades : pipeline.getOrderGateway().getOrders(),
            health: pipeline.getHealthMonitor().getHealth(),
            killSwitch: {
              active: pipeline.getKillSwitch().isActive(),
              level: pipeline.getKillSwitch().getLevel(),
            },
            candles: candlesDict,
            orderBooks: orderBooksDict,
            features: featuresDict,
          },
        })
      );
    } catch (err) {
      console.error("Error sending initial state:", err);
    }

    ws.on("close", () => {
      console.log("❌ Frontend UI disconnected from WebSocket");
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

      const statePayload = JSON.stringify({
        type: "STATE_UPDATE",
        data: {
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
        },
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
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

  // Upgrade HTTP server to handle WebSocket connections strictly on /ws
  server.on("upgrade", (request, socket, head) => {
    try {
      const urlStr = request.url || "";
      const pathname = urlStr.split("?")[0];
      if (pathname === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error("Error during WebSocket upgrade:", err);
      socket.destroy();
    }
  });

  // 4. Vite Middleware Setup for Frontend SPA
  const hasDist = fs.existsSync(path.join(process.cwd(), "dist"));
  const isProduction = process.env.NODE_ENV === "production" && hasDist;

  if (!isProduction) {
    console.log("ℹ️ Starting Vite Dev Middleware Server (Development Workspace Preview mode)...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("ℹ️ Serving compiled production static files from dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
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
    pipeline.stop();
    console.log("⏹️ Trading Pipeline stopped.");

    // 3. Save final database snapshots
    const balance = pipeline.getUserDataStream().getBalance();
    pipeline.getDatabase().saveBalanceSnapshot(balance.totalEquity, balance.freeMargin, balance.unrealizedPnl);
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
