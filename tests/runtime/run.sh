#!/usr/bin/env bash
# Runs the runtime tests against the project sources. Needs: node >= 18, typescript (tsc) on PATH.
# Usage: bash tests/runtime/run.sh   (from the project root)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; H="$(mktemp -d)"

# Ensure tsc is on PATH (either global or from project node_modules)
command -v tsc >/dev/null 2>&1 || export PATH="$ROOT/node_modules/.bin:$PATH"

mkdir -p "$H"/src/{execution,risk,domain,market-data,utils,config} "$H/node_modules/ws"
if [ -d "$ROOT/node_modules/@types" ]; then
  cp -r "$ROOT/node_modules/@types" "$H/node_modules/" 2>/dev/null || true
fi

cp "$ROOT"/src/execution/{OrderGateway,UserDataStream}.ts "$H/src/execution/"
cp "$ROOT"/src/risk/RiskEngine.ts "$H/src/risk/"; cp "$ROOT"/src/domain/types.ts "$H/src/domain/"
S="$ROOT/tests/runtime/stubs"
cp "$S/OrderBookBuilder.ts" "$S/AssetScreener.ts" "$H/src/market-data/"
cp "$S/OrderStateMachine.ts" "$H/src/execution/"; cp "$S/RateLimiter.ts" "$H/src/utils/"; cp "$S/execution.ts" "$H/src/config/"
echo 'module.exports = class WebSocket {};' > "$H/node_modules/ws/index.js"
echo '{"compilerOptions":{"target":"ES2022","module":"commonjs","rootDir":".","outDir":"dist","skipLibCheck":true,"esModuleInterop":true,"strict":false,"types":["node"],"noEmitOnError":false,"lib":["ES2022","DOM"]},"include":["src/**/*.ts"]}' > "$H/tsconfig.json"
cp "$ROOT"/tests/runtime/test.js "$H/test.js"
(cd "$H" && tsc -p . >/dev/null 2>&1 || true; node test.js)
