// ─── Test Runner ───────────────────────────────────────────────────────────────
// Runs all test suites sequentially.
// Usage: npm test (runs all) or npx tsx src/tests/run-all.ts

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const TSX = "npx tsx";

interface TestSuite {
  name: string;
  file: string;
  needsRpc: boolean;
  slow: boolean;
}

const SUITES: TestSuite[] = [
  { name: "Smoke (unit, no RPC)", file: "src/tests/smoke.test.ts", needsRpc: false, slow: false },
  { name: "Package Surface (unit)", file: "src/tests/package-surface.test.ts", needsRpc: false, slow: false },
  { name: "EIP-6963 Wallet Discovery (unit)", file: "src/wallet/eip6963.test.ts", needsRpc: false, slow: false },
  { name: "EIP-5792 Wallet Calls (unit)", file: "src/wallet/eip5792.test.ts", needsRpc: false, slow: false },
  { name: "Pathfind & Quotes", file: "src/tests/pathfind.test.ts", needsRpc: true, slow: true },
  { name: "Dual Affiliate", file: "src/tests/affiliate.test.ts", needsRpc: true, slow: true },
  { name: "Split Routing", file: "src/tests/split.test.ts", needsRpc: true, slow: true },
  { name: "Split Solver (unit)", file: "src/core/splitSolver.test.ts", needsRpc: false, slow: false },
  { name: "Split Calldata (unit)", file: "src/core/splitCalldata.test.ts", needsRpc: false, slow: false },
  { name: "Router Fees (unit)", file: "src/core/routerFees.test.ts", needsRpc: false, slow: false },
  { name: "Router Execute (unit)", file: "src/router.execute.test.ts", needsRpc: false, slow: false },
  { name: "Permit Calldata (unit)", file: "src/core/permit.test.ts", needsRpc: false, slow: false },
  { name: "Approval Modes (unit)", file: "src/core/approval.test.ts", needsRpc: false, slow: false },
  { name: "Viem Adapter (unit)", file: "src/adapters/viem.test.ts", needsRpc: false, slow: false },
  { name: "Wagmi Adapter (unit)", file: "src/adapters/wagmi.test.ts", needsRpc: false, slow: false },
  { name: "Fee Tiers (unit)", file: "src/core/feeTiers.test.ts", needsRpc: false, slow: false },
  { name: "Affiliate Tiers (unit)", file: "src/core/affiliateTiers.test.ts", needsRpc: false, slow: false },
  { name: "x402 Provider (unit)", file: "src/wallet/x402Provider.test.ts", needsRpc: false, slow: false },
];

const skipRpc = process.argv.includes("--no-rpc") || process.env.SKIP_RPC_TESTS === "1";
const skipSlow = process.argv.includes("--fast") || process.env.FAST === "1";

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;

console.log("═══ empx-swap-sdk v2.1.0 Test Suite ═══\n");

for (const suite of SUITES) {
  if (skipRpc && suite.needsRpc) {
    console.log(`⏭  SKIP (RPC tests disabled): ${suite.name}`);
    totalSkipped++;
    continue;
  }
  if (skipSlow && suite.slow) {
    console.log(`⏭  SKIP (slow tests disabled): ${suite.name}`);
    totalSkipped++;
    continue;
  }
  if (!existsSync(suite.file)) {
    console.log(`⏭  SKIP (file not found): ${suite.name} (${suite.file})`);
    totalSkipped++;
    continue;
  }

  const label = suite.needsRpc ? `${suite.name} (RPC)` : suite.name;
  const slowLabel = suite.slow ? " [slow]" : "";

  console.log(`─── ${label}${slowLabel} ───`);

  try {
    const result = execSync(`${TSX} ${suite.file}`, {
      stdio: "inherit",
      timeout: suite.slow ? 120_000 : 30_000,
    });
    console.log("  → PASS\n");
  } catch (err: any) {
    if (err.status !== 0 && err.stdout?.toString().includes("PASSED")) {
      // Some tests print results then exit non-zero — check stdout
      console.log("  → FAIL (non-zero exit)\n");
    }
    totalFailed++;
    continue;
  }
  totalPassed++;
}

console.log(`\n${"═".repeat(60)}`);
console.log(`Total suites: ${SUITES.length} | Passed: ${totalPassed} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);
console.log(`${"═".repeat(60)}`);

if (totalFailed > 0) process.exit(1);
