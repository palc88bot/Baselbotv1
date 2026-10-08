const assert = require('assert');
const { OrderGateway } = require('./dist/src/execution/OrderGateway');
const { UserDataStream } = require('./dist/src/execution/UserDataStream');
const { OrderBookBuilder } = require('./dist/src/market-data/OrderBookBuilder');
const { RiskEngine } = require('./dist/src/risk/RiskEngine');

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`PASS  ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL  ${name}\n      ${e.message}`);
  }
}

// ---- scripted fetch mock ----
let calls = [];
let script = [];
function setFetch() {
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const params = Object.fromEntries(u.searchParams.entries());
    const rec = { method: opts.method || 'GET', path: u.pathname, params };
    calls.push(rec);
    if (opts.signal && opts.signal.aborted) throw new Error('aborted');
    const h = script.find(s => s.match(rec));
    if (!h) return mkRes(404, { msg: 'no mock for ' + rec.method + ' ' + rec.path });
    if (h.hang) {
      return new Promise((_, rej) => {
        if (opts.signal) opts.signal.addEventListener('abort', () => rej(new Error('aborted')));
      });
    }
    const r = h.respond(rec);
    return mkRes(r.status, r.body);
  };
}
function mkRes(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}
const is = (m, p) => (rec) => rec.method === m && rec.path === p;
const newGw = () => {
  const uds = new UserDataStream(0);
  const gw = new OrderGateway(uds, new OrderBookBuilder(), { executionMode: 'TESTNET', apiKey: 'k', apiSecret: 's', apiBaseUrl: 'https://testnet.test' });
  return { gw, uds };
};
const reset = () => { calls = []; script = []; setFetch(); };

(async () => {
  // ───────── close position ─────────
  await test('close: long position -> reduce-only SELL FIRST, SL/TP cancelled only AFTER confirmed', async () => {
    reset();
    script = [
      { match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 200, body: [{ symbol: 'BTCUSDT', positionAmt: '0.003' }] }) },
      { match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 200, body: { orderId: 1, status: 'FILLED' } }) },
      { match: is('DELETE', '/fapi/v1/allOpenOrders'), respond: () => ({ status: 200, body: { code: 200 } }) },
    ];
    const { gw } = newGw();
    const r = await gw.closePositionDirectlyOnBinance('BTC/USDT', 0.003);
    assert.strictEqual(r.success, true);
    const order = calls.find(c => c.path === '/fapi/v1/order');
    assert.strictEqual(order.params.side, 'SELL');
    assert.strictEqual(order.params.reduceOnly, 'true');
    assert.strictEqual(order.params.quantity, '0.003');
    const iOrder = calls.findIndex(c => c.path === '/fapi/v1/order');
    const iCancel = calls.findIndex(c => c.path === '/fapi/v1/allOpenOrders');
    assert.ok(iOrder >= 0 && iCancel > iOrder, 'cancel must come after the close order');
    assert.ok(order.params.timestamp && order.params.recvWindow === '5000' && order.params.signature);
  });

  await test('close: short position -> BUY with absolute quantity', async () => {
    reset();
    script = [
      { match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 200, body: [{ symbol: 'ETHUSDT', positionAmt: '-0.5' }] }) },
      { match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 200, body: { orderId: 2, status: 'FILLED' } }) },
      { match: is('DELETE', '/fapi/v1/allOpenOrders'), respond: () => ({ status: 200, body: {} }) },
    ];
    const { gw } = newGw();
    const r = await gw.closePositionDirectlyOnBinance('ETH/USDT');
    const order = calls.find(c => c.path === '/fapi/v1/order');
    assert.strictEqual(r.success, true);
    assert.strictEqual(order.params.side, 'BUY');
    assert.strictEqual(order.params.quantity, '0.5');
  });

  await test('close: exchange REJECTS -> success=false and the protective stop is NOT cancelled', async () => {
    reset();
    script = [
      { match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 200, body: [{ symbol: 'BTCUSDT', positionAmt: '0.003' }] }) },
      { match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 400, body: { code: -2019, msg: 'Margin is insufficient.' } }) },
    ];
    const { gw } = newGw();
    const r = await gw.closePositionDirectlyOnBinance('BTC/USDT', 0.003);
    assert.strictEqual(r.success, false);
    assert.ok(!calls.some(c => c.method === 'DELETE'), 'no DELETE may be sent when the close failed');
  });

  await test('close: order accepted but NOT filled and position still open -> success=false', async () => {
    reset();
    script = [
      { match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 200, body: [{ symbol: 'BTCUSDT', positionAmt: '0.003' }] }) },
      { match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 200, body: { orderId: 3, status: 'NEW' } }) },
    ];
    const { gw } = newGw();
    const r = await gw.closePositionDirectlyOnBinance('BTC/USDT', 0.003);
    assert.strictEqual(r.success, false);
    assert.ok(!calls.some(c => c.method === 'DELETE'));
  });

  await test('close: already flat on exchange -> success, no order sent', async () => {
    reset();
    script = [{ match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 200, body: [{ symbol: 'BTCUSDT', positionAmt: '0.000' }] }) }];
    const { gw } = newGw();
    const r = await gw.closePositionDirectlyOnBinance('BTC/USDT', 0.003);
    assert.strictEqual(r.success, true);
    assert.ok(!calls.some(c => c.method === 'POST'));
  });

  await test('closeAll: reports exactly which symbol failed', async () => {
    reset();
    let n = 0;
    script = [
      { match: is('GET', '/fapi/v2/positionRisk'), respond: (rec) => {
          const all = [{ symbol: 'BTCUSDT', positionAmt: '0.003' }, { symbol: 'ETHUSDT', positionAmt: '0.5' }, { symbol: 'SOLUSDT', positionAmt: '0' }];
          return { status: 200, body: rec.params.symbol ? all.filter(p => p.symbol === rec.params.symbol) : all };
        } },
      { match: is('POST', '/fapi/v1/order'), respond: (rec) => rec.params.symbol === 'ETHUSDT'
          ? { status: 400, body: { code: -2022, msg: 'ReduceOnly Order is rejected.' } }
          : { status: 200, body: { orderId: ++n, status: 'FILLED' } } },
      { match: is('DELETE', '/fapi/v1/allOpenOrders'), respond: () => ({ status: 200, body: {} }) },
    ];
    const { gw } = newGw();
    const r = await gw.closeAllPositionsOnExchange();
    assert.strictEqual(r.closed, 1);
    assert.deepStrictEqual(r.failed, ['ETHUSDT']);
  });

  await test('closeAll: cannot read account -> reported as failure (never "success")', async () => {
    reset();
    script = [{ match: is('GET', '/fapi/v2/positionRisk'), respond: () => ({ status: 500, body: { msg: 'down' } }) }];
    const { gw } = newGw();
    const r = await gw.closeAllPositionsOnExchange();
    assert.deepStrictEqual(r.failed, ['ACCOUNT_READ_FAILED']);
  });

  // ───────── protective orders ─────────
  await test('protect: valid BUY entry -> STOP_MARKET + TAKE_PROFIT_MARKET reduce-only, slOk=true', async () => {
    reset();
    let id = 100;
    script = [{ match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 200, body: { orderId: ++id } }) }];
    const { gw } = newGw();
    const r = await gw.sendProtectiveOrders('BTC/USDT', 'BUY', 0.003, 60000, 59000, 61500, 'ORD-ABC-123');
    assert.strictEqual(r.slOk, true);
    const orders = calls.filter(c => c.method === 'POST' && c.path === '/fapi/v1/order');
    const types = orders.map(c => c.params.type).sort();
    assert.deepStrictEqual(types, ['STOP_MARKET', 'TAKE_PROFIT_MARKET']);
    assert.ok(orders.every(c => c.params.reduceOnly === 'true' && c.params.side === 'SELL'));
    assert.ok(orders.every(c => c.params.newClientOrderId.length <= 36));
  });

  await test('protect: stop on the WRONG side of entry is refused locally -> slOk=false, no SL request', async () => {
    reset();
    script = [{ match: is('POST', '/fapi/v1/order'), respond: () => ({ status: 200, body: { orderId: 1 } }) }];
    const { gw } = newGw();
    const r = await gw.sendProtectiveOrders('BTC/USDT', 'BUY', 0.003, 60000, 61000 /* above entry */, 61500, 'X1');
    assert.strictEqual(r.slOk, false);
    assert.ok(!calls.some(c => c.params.type === 'STOP_MARKET'));
  });

  await test('protect: exchange REJECTS the stop -> slOk=false (caller must close the position)', async () => {
    reset();
    script = [{ match: is('POST', '/fapi/v1/order'), respond: (rec) => rec.params.type === 'STOP_MARKET'
        ? { status: 400, body: { code: -2021, msg: 'Order would immediately trigger.' } }
        : { status: 200, body: { orderId: 7 } } }];
    const { gw } = newGw();
    const r = await gw.sendProtectiveOrders('BTC/USDT', 'SELL', 0.003, 60000, 61000, 58000, 'X2');
    assert.strictEqual(r.slOk, false);
    assert.strictEqual(r.slId, undefined);
  });

  // ───────── transport ─────────
  await test('transport: -1021 clock error -> time re-sync then ONE successful retry', async () => {
    reset();
    let tries = 0;
    script = [
      { match: is('GET', '/fapi/v1/time'), respond: () => ({ status: 200, body: { serverTime: Date.now() + 1500 } }) },
      { match: is('GET', '/fapi/v2/positionRisk'), respond: () => (++tries === 1)
          ? { status: 400, body: { code: -1021, msg: 'Timestamp outside of recvWindow' } }
          : { status: 200, body: [{ symbol: 'BTCUSDT', positionAmt: '0' }] } },
    ];
    const { gw } = newGw();
    const r = await gw.signedRequest('GET', '/fapi/v2/positionRisk', { symbol: 'BTCUSDT' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(tries, 2);
    assert.ok(calls.some(c => c.path === '/fapi/v1/time'), 'time must be re-synced');
  });

  await test('transport: hung request is aborted by the timeout (no infinite wait)', async () => {
    reset();
    script = [{ match: () => true, hang: true }];
    const { gw } = newGw();
    const t0 = Date.now();
    const r = await gw.signedRequest('GET', '/fapi/v2/account', {}, 80);
    assert.strictEqual(r.ok, false);
    assert.ok(Date.now() - t0 < 1000);
  });

  // ───────── fills: no double counting ─────────
  const mkOrder = (id) => ({ id, symbol: 'BTC/USDT', side: 'BUY', type: 'MARKET', quantity: 0.003, price: 60000, filledQuantity: 0, remainingQuantity: 0.003, status: 'NEW', createdAt: Date.now(), updatedAt: Date.now(), exchangeOrderId: '999' });
  await test('fills: partial + final TRADE events -> ONE processFill with the SUM of commissions', async () => {
    reset();
    const { gw, uds } = newGw();
    const fills = []; const orig = uds.processFill.bind(uds);
    uds.processFill = (f, p) => { fills.push(f); return orig(f, p); };
    gw.orders.set('ORD-1', mkOrder('ORD-1')); gw.exchangeIdMap.set('999', 'ORD-1');
    gw.applyExchangeUpdate({ i: 999, c: 'ORD-1', X: 'PARTIALLY_FILLED', x: 'TRADE', t: 1, n: '0.010', N: 'USDT', z: '0.001', ap: '60000' });
    gw.applyExchangeUpdate({ i: 999, c: 'ORD-1', X: 'PARTIALLY_FILLED', x: 'TRADE', t: 2, n: '0.020', N: 'USDT', z: '0.002', ap: '60000' });
    gw.applyExchangeUpdate({ i: 999, c: 'ORD-1', X: 'FILLED', x: 'TRADE', t: 3, n: '0.030', N: 'USDT', z: '0.003', ap: '60000', T: Date.now() });
    gw.applyExchangeUpdate({ i: 999, c: 'ORD-1', X: 'FILLED', x: 'TRADE', t: 3, n: '0.030', N: 'USDT', z: '0.003', ap: '60000' }); // duplicate delivery
    assert.strictEqual(fills.length, 1);
    assert.strictEqual(fills[0].quantity, 0.003);
    assert.ok(Math.abs(fills[0].commission - 0.06) < 1e-9, 'commission was ' + fills[0].commission);
  });

  await test('fills: REST fallback after the stream already delivered -> NOT processed again', async () => {
    reset();
    const { gw, uds } = newGw();
    let count = 0; const orig = uds.processFill.bind(uds);
    uds.processFill = (f, p) => { count++; return orig(f, p); };
    const o = mkOrder('ORD-2'); gw.orders.set('ORD-2', o); gw.exchangeIdMap.set('999', 'ORD-2');
    gw.applyExchangeUpdate({ i: 999, c: 'ORD-2', X: 'FILLED', x: 'TRADE', t: 1, n: '0.03', N: 'USDT', z: '0.003', ap: '60000' });
    gw.recordFallbackFill(o);
    assert.strictEqual(count, 1);
  });

  await test('fills: stream silent -> REST fallback records the fill exactly once', async () => {
    reset();
    const { gw, uds } = newGw();
    let count = 0; const orig = uds.processFill.bind(uds);
    uds.processFill = (f, p) => { count++; return orig(f, p); };
    const o = mkOrder('ORD-3'); o.filledQuantity = 0.003; o.avgFillPrice = 60000; gw.orders.set('ORD-3', o);
    gw.recordFallbackFill(o); gw.recordFallbackFill(o);
    assert.strictEqual(count, 1);
  });

  await test('UserDataStream: TESTNET processFill does NOT mutate size/cash (ACCOUNT_UPDATE is authoritative)', async () => {
    const uds = new UserDataStream(0);
    uds.executionMode = 'TESTNET';
    uds.processFill({ fillId: 'f1', orderId: 'o', symbol: 'BTC/USDT', side: 'BUY', price: 60000, quantity: 0.003, commission: 0.1, commissionAsset: 'USDT', timestamp: Date.now(), isMaker: false }, 60000);
    assert.strictEqual(uds.getPositions().length, 0);
    assert.strictEqual(uds.getBalance().availableCash, 0);
  });

  await test('UserDataStream: PAPER processFill still builds the simulated position', async () => {
    const uds = new UserDataStream(1000); uds.executionMode = 'PAPER';
    uds.processFill({ fillId: 'f2', orderId: 'o', symbol: 'BTC/USDT', side: 'BUY', price: 60000, quantity: 0.003, commission: 0.1, commissionAsset: 'USDT', timestamp: Date.now(), isMaker: false }, 60000);
    assert.strictEqual(uds.getPositions().length, 1);
    assert.strictEqual(uds.getPositions()[0].size, 0.003);
  });

  // ───────── RiskEngine ─────────
  const bal = (eq) => ({ totalEquity: eq, availableCash: eq, usedMargin: 0, marginLevel: 999, freeMargin: eq, unrealizedPnl: 0, realizedPnl: 0, dailyPnl: 0 });
  await test('RiskEngine: <10 real returns -> Sharpe/Sortino are null (not the old fake 1.85/2.45) and beta absent', async () => {
    const re = new RiskEngine();
    const r = re.evaluateRisk(bal(1000), [], 'NORMAL');
    assert.strictEqual(r.metrics.sharpeRatio, null);
    assert.strictEqual(r.metrics.sortinoRatio, null);
    assert.strictEqual(r.metrics.portfolioBeta, undefined);
    assert.strictEqual(r.metrics.varSource, 'ASSUMED');
  });
  await test('RiskEngine: with real returns -> numeric ratios, HISTORICAL VaR', async () => {
    const re = new RiskEngine();
    [0.01, -0.02, 0.015, -0.005, 0.02, -0.01, 0.005, 0.012, -0.015, 0.008, 0.01, -0.004].forEach(x => re.recordReturn(x));
    const r = re.evaluateRisk(bal(1000), [], 'NORMAL');
    assert.ok(Number.isFinite(r.metrics.sharpeRatio) && Number.isFinite(r.metrics.sortinoRatio));
    assert.strictEqual(r.metrics.varSource, 'HISTORICAL');
    assert.strictEqual(r.metrics.returnsSampleSize, 12);
  });
  await test('RiskEngine: resetPeakEquity prevents the stale peak from re-triggering the drawdown breach', async () => {
    const re = new RiskEngine();
    re.evaluateRisk(bal(1000), [], 'NORMAL');
    const before = re.evaluateRisk(bal(700), [], 'NORMAL');
    assert.ok(before.metrics.currentDrawdownPct >= 29);
    re.resetPeakEquity(700);
    const after = re.evaluateRisk(bal(700), [], 'NORMAL');
    assert.strictEqual(after.metrics.currentDrawdownPct, 0);
    assert.strictEqual(after.metrics.dailyLossPct, 0);
  });
  await test('RiskEngine: setDailyStartEquity rolls the daily baseline', async () => {
    const re = new RiskEngine();
    re.evaluateRisk(bal(1000), [], 'NORMAL');
    assert.ok(re.evaluateRisk(bal(950), [], 'NORMAL').metrics.dailyLossPct >= 4.9);
    re.setDailyStartEquity(950);
    assert.strictEqual(re.evaluateRisk(bal(950), [], 'NORMAL').metrics.dailyLossPct, 0);
  });

  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
