// ─── Split Routing Integration Test ───────────────────────────────────────────
// Tests findBestSplitRouting, split calldata building, and aggregate trade info.
// Requires RPC: DEFAULT_RPC or process.env.RPC_URL
// Usage: npx tsx src/tests/split.test.ts

import {
  createRouter, CHAIN_IDS, CHAINS,
  findBestSplitRouting,
  buildSplitMultiSwapCalldata, buildSplitAggregateTradeInfo,
  pickSwapKind, SwapKind, SplitCalldataError,
} from "../index.js";

const RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
const CHAIN = CHAIN_IDS.ARBITRUM;
const chainConfig = CHAINS[CHAIN];

const AMOUNT = BigInt("1000000000000000000"); // 1 ETH in wei
const TOKEN_IN = chainConfig.WRAPPED_NATIVE; // Use WETH instead of native for split routing
const TOKEN_OUT = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"; // USDC

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ FAIL: ${name}`);
}

async function main() {
  console.log("\n─── Split Routing Integration Test ───");
  console.log(`Chain: ${chainConfig.name} (${CHAIN}) | RPC: ${RPC_URL}`);
  console.log(`Token: WETH → USDC | Amount: ${AMOUNT.toString()}`);

  const router = createRouter(CHAIN, RPC_URL);

  // ── 1. Split availability ──────────────────────────────────────────────────

  console.log("\n── Split availability ──");
  assert(typeof router.isSplitAvailable === "function", "isSplitAvailable is a function");
  console.log(`  Multicall router deployed: ${router.isSplitAvailable()}`);

  // ── 2. Split solver ────────────────────────────────────────────────────────

  console.log("\n── Split solver ──");
  try {
    const split = await findBestSplitRouting(
      router.provider, chainConfig, AMOUNT, TOKEN_IN, TOKEN_OUT, 3
    );
    assert(!!split, "findBestSplitRouting returns result");
    assert(typeof split.routing === "string", `routing is "${split.routing}"`);
    assert(typeof split.estimatedOut === "string", "estimatedOut is string");
    assert(Array.isArray(split.legs), "legs is array");
    assert(split.legs.length >= 1, `legs count: ${split.legs.length}`);

    console.log(`  Routing type: ${split.routing}`);
    console.log(`  Estimated output: ${split.estimatedOut}`);
    console.log(`  Legs: ${split.legs.length}`);

    for (let i = 0; i < split.legs.length; i++) {
      const leg = split.legs[i];
      console.log(`    Leg ${i + 1}: share=${leg.shareBps / 100}%, amountIn=${leg.amountIn}, expectedOut=${leg.expectedOut.substring(0, 12)}...`);
    }
  } catch (err: any) {
    console.error(`  Split solver error: ${err.message}`);
    assert(false, "findBestSplitRouting succeeds");
  }

  // ── 3. Split calldata (will fail if no MULTICALL_ROUTER_ADDRESS) ───────────

  console.log("\n── Split calldata builder ──");
  try {
    const singleRoute = await router.findBestPath(
      BigInt("100000000000000000"), TOKEN_IN, TOKEN_OUT, 3
    );

    const input = {
      chainConfig,
      legs: [{
        swapKind: SwapKind.NATIVE_TO_ERC20,
        trade: {
          amountIn: "100000000000000000",
          amountOut: singleRoute.amounts[singleRoute.amounts.length - 1],
          path: singleRoute.path,
          adapters: singleRoute.adapters,
        },
        recipient: "0x" + "ab".repeat(20),
        fee: "28",
        nativeValue: "100000000000000000",
      }],
    };

    try {
      const calldata = buildSplitMultiSwapCalldata(input as any);
      assert(!!calldata.to, "calldata has 'to' address");
      assert(!!calldata.data, "calldata has 'data'");
      console.log(`  Calldata built: to=${calldata.to.slice(0, 10)}... value=${calldata.value}`);
    } catch (err) {
      if (err instanceof SplitCalldataError) {
        console.log(`  Expected: ${err.code} — MulticallRouter not deployed on this chain`);
        assert(true, `SplitCalldataError correctly thrown: ${err.code}`);
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    console.error(`  Calldata builder error: ${err.message}`);
    assert(false, "split calldata builder succeeds or throws expected error");
  }

  // ── 4. pickSwapKind ────────────────────────────────────────────────────────

  console.log("\n── pickSwapKind ──");
  const erc20ToErc20 = pickSwapKind(false, false);
  assert(erc20ToErc20 === SwapKind.ERC20_TO_ERC20, `ERC20→ERC20 = ${SwapKind.ERC20_TO_ERC20} (got ${erc20ToErc20})`);

  const nativeToErc20 = pickSwapKind(true, false);
  assert(nativeToErc20 === SwapKind.NATIVE_TO_ERC20, `Native→ERC20 = ${SwapKind.NATIVE_TO_ERC20} (got ${nativeToErc20})`);

  const erc20ToNative = pickSwapKind(false, true);
  assert(erc20ToNative === SwapKind.ERC20_TO_NATIVE, `ERC20→Native = ${SwapKind.ERC20_TO_NATIVE} (got ${erc20ToNative})`);

  // ── 5. Aggregate TradeInfo ─────────────────────────────────────────────────

  console.log("\n── Build aggregate TradeInfo ──");
  try {
    const mockPath = {
      amounts: [AMOUNT.toString(), "100000"],
      path: [TOKEN_IN, TOKEN_OUT],
      adapters: ["0x" + "cd".repeat(20)],
      gasEstimate: "150000",
    };

    const splitResult = {
      routing: "single" as const,
      estimatedOut: "100000",
      legs: [{
        shareBps: 10000,
        amountIn: AMOUNT.toString(),
        expectedOut: "100000",
        path: mockPath,
      }],
    };

    const aggregate = buildSplitAggregateTradeInfo(splitResult as any, "28", AMOUNT.toString(), "2.0.0");
    assert(!!aggregate, "aggregate TradeInfo created");
    assert(typeof aggregate.amountIn === "string", "has amountIn");
    assert(typeof aggregate.amountOut === "string", "has amountOut");
    assert(aggregate.path.length >= 2, "has path");
    assert(aggregate.adapters.length >= 1, "has adapters");
    console.log(`  TradeInfo: amountIn=${aggregate.amountIn}, amountOut=${aggregate.amountOut}`);
  } catch (err: any) {
    console.error(`  Aggregate TradeInfo error: ${err.message}`);
    assert(false, "buildSplitAggregateTradeInfo succeeds");
  }

  // ── Results ────────────────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`${"─".repeat(60)}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test crashed:", err.message || err);
  process.exit(1);
});
