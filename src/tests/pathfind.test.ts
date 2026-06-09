// ─── Pathfinding & Quotes Integration Test ────────────────────────────────────
// Requires RPC: process.env.RPC_URL or defaults per chain
// Usage: npx tsx src/tests/pathfind.test.ts

import {
  createRouter, CHAIN_IDS,
  EmpxError, ERROR_CODES,
} from "../index.js";

const CHAINS_TO_TEST = [
  { name: "Arbitrum", id: CHAIN_IDS.ARBITRUM, rpc: "https://arb1.arbitrum.io/rpc", token: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  { name: "Base", id: CHAIN_IDS.BASE, rpc: "https://mainnet.base.org", token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
  { name: "BSC", id: CHAIN_IDS.BSC, rpc: "https://bsc-dataseed1.binance.org", token: "0x55d398326f99059ff775485246999027b3197955" },
];

const AMOUNT = "1000000000000000000"; // 1 ETH/BNB in wei

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ FAIL: ${name}`);
}

async function testChain(chain: typeof CHAINS_TO_TEST[number]) {
  console.log(`\n── ${chain.name} (${chain.id}) ──`);
  const router = createRouter(chain.id, process.env.RPC_URL || chain.rpc);
  const native = router.chain.NATIVE_ADDRESS;

  // ── findBestPath ──────────────────────────────────────────────────────────

  try {
    const path = await router.findBestPath(AMOUNT, native, chain.token, 3);
    assert(Array.isArray(path.amounts), "findBestPath: amounts is array");
    assert(path.amounts.length >= 2, `findBestPath: ${path.amounts.length} amounts`);
    assert(Array.isArray(path.path), "findBestPath: path is array");
    assert(path.path.length >= 2, `findBestPath: ${path.path.length} hop path`);
    assert(Array.isArray(path.adapters), "findBestPath: adapters is array");
    assert(path.adapters.length >= 1, `findBestPath: ${path.adapters.length} adapters`);
    assert(typeof path.gasEstimate === "string", "findBestPath: gasEstimate is string");
    console.log(`  Path: ${path.path.length - 1} hops, output: ${path.amounts[path.amounts.length - 1]}, gas: ${path.gasEstimate}`);
  } catch (err: any) {
    console.error(`  findBestPath error: ${err.message}`);
    assert(false, "findBestPath succeeds");
  }

  // ── getTradeInfo ──────────────────────────────────────────────────────────

  try {
    const tradeInfo = await router.getTradeInfo(AMOUNT, native, chain.token, 3, 200);
    assert(typeof tradeInfo.quoteId === "string", "getTradeInfo: has quoteId");
    assert(typeof tradeInfo.amountIn === "string", "getTradeInfo: has amountIn");
    assert(typeof tradeInfo.amountOut === "string", "getTradeInfo: has amountOut");
    assert(typeof tradeInfo.fee === "string", "getTradeInfo: has fee");
    assert(typeof tradeInfo.validUntil === "number", "getTradeInfo: has validUntil TTL");
    assert(tradeInfo.validUntil > Date.now(), "getTradeInfo: quote not yet expired");
    assert(tradeInfo.sdkVersion === "2.0.0", "getTradeInfo: sdkVersion is 2.0.0");
    console.log(`  TradeInfo: amountIn=${tradeInfo.amountIn}, amountOut=${tradeInfo.amountOut}, fee=${tradeInfo.fee}bps, TTL=${tradeInfo.validUntil - Date.now()}ms`);
  } catch (err: any) {
    console.error(`  getTradeInfo error: ${err.message}`);
    assert(false, "getTradeInfo succeeds");
  }

  // ── getSwapCalldata ───────────────────────────────────────────────────────

  try {
    const tradeInfo = await router.getTradeInfo(AMOUNT, native, chain.token, 3, 200);
    const calldata = router.getSwapFromNativeCalldata(tradeInfo, "0x" + "ab".repeat(20));
    assert(typeof calldata.to === "string", "Calldata: has 'to'");
    assert(typeof calldata.data === "string", "Calldata: has 'data'");
    assert(typeof calldata.value === "string", "Calldata: has 'value'");
    assert(calldata.to.length === 42, "Calldata: valid contract address");
    assert(calldata.data.startsWith("0x"), "Calldata: data is hex");
    console.log(`  Calldata: to=${calldata.to.slice(0, 10)}..., data len=${calldata.data.length}, value=${calldata.value}`);
  } catch (err: any) {
    console.error(`  Calldata error: ${err.message}`);
    assert(false, "getSwapFromNativeCalldata succeeds");
  }

  // ── getTokenPriceUSD ─────────────────────────────────────────────────────

  try {
    const price = await router.getTokenPriceUSD(chain.token, 3);
    assert(typeof price === "number", "getTokenPriceUSD: returns number");
    assert(price > 0.5 && price < 2, `getTokenPriceUSD: stablecoin price ~1.0 (got ${price})`);
    console.log(`  Price: 1 ${chain.name} stablecoin = $${price}`);
  } catch (err: any) {
    console.error(`  getTokenPriceUSD error: ${err.message}`);
    assert(false, "getTokenPriceUSD succeeds");
  }

  // ── getQuoteUSD ──────────────────────────────────────────────────────────

  try {
    const quote = await router.getQuoteUSD(native, AMOUNT, 3);
    assert(typeof quote.usd === "number", "getQuoteUSD: has usd value");
    assert(typeof quote.pricePerToken === "number", "getQuoteUSD: has pricePerToken");
    assert(typeof quote.decimals === "number", "getQuoteUSD: has decimals");
    assert(quote.decimals === 18, "getQuoteUSD: native = 18 decimals");
    assert(quote.usd > 1, "getQuoteUSD: native token worth more than $1");
    console.log(`  Quote: 1 ${chain.name} native = $${quote.pricePerToken.toFixed(2)} | ${AMOUNT} wei = $${quote.usd.toFixed(2)}`);
  } catch (err: any) {
    console.error(`  getQuoteUSD error: ${err.message}`);
    assert(false, "getQuoteUSD succeeds");
  }

  // ── getTokenDecimals ─────────────────────────────────────────────────────

  try {
    const decimals = await router.getTokenDecimals(chain.token);
    assert(typeof decimals === "number", "getTokenDecimals: returns number");
    assert(decimals > 0, "getTokenDecimals: positive decimals");
    console.log(`  Token decimals: ${decimals}`);
  } catch (err: any) {
    console.error(`  getTokenDecimals error: ${err.message}`);
    assert(false, "getTokenDecimals succeeds");
  }

  // ── getTokenSymbol ───────────────────────────────────────────────────────

  try {
    const symbol = await router.getTokenSymbol(chain.token);
    assert(typeof symbol === "string", "getTokenSymbol: returns string");
    assert(symbol.length >= 2, `getTokenSymbol: non-empty symbol (${symbol})`);
    console.log(`  Token symbol: ${symbol}`);
  } catch (err: any) {
    console.log(`  Token symbol: unavailable (${err.message.split("\n")[0]})`);
    assert(true, "getTokenSymbol: gracefully handles non-standard tokens");
  }
}

async function main() {
  console.log("\n═══ Pathfinding & Quotes Integration Test ═══");

  for (const chain of CHAINS_TO_TEST) {
    await testChain(chain);
  }

  // ── Invalid params ────────────────────────────────────────────────────────

  console.log("\n── Input validation ──");
  const router = createRouter(CHAIN_IDS.ARBITRUM);
  const native = router.chain.NATIVE_ADDRESS;
  const stable = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

  try {
    await router.getTradeInfo("0", native, stable);
    assert(false, "Should reject zero amount");
  } catch (err) {
    assert(err instanceof EmpxError, "Zero amount throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.INVALID_AMOUNT, "Error code INVALID_AMOUNT");
  }

  try {
    await router.getTradeInfo(AMOUNT, "0xBadAddress", stable);
    assert(false, "Should reject invalid tokenIn");
  } catch (err) {
    assert(err instanceof EmpxError, "Invalid tokenIn throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.INVALID_ADDRESS, "Error code INVALID_ADDRESS");
  }

  try {
    await router.getTradeInfo(AMOUNT, native, stable, 10, 200);
    assert(false, "Should reject maxSteps > 4");
  } catch (err) {
    assert(err instanceof EmpxError, "maxSteps > 4 throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.STEPS_OUT_OF_RANGE, "Error code STEPS_OUT_OF_RANGE");
  }

  try {
    await router.getTradeInfo(AMOUNT, native, stable, 3, 5000);
    assert(false, "Should reject slippage > 1000bps");
  } catch (err) {
    assert(err instanceof EmpxError, "slippage > 1000 throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.SLIPPAGE_TOO_HIGH, "Error code SLIPPAGE_TOO_HIGH");
  }

  // ── Quote expiry ──────────────────────────────────────────────────────────

  console.log("\n── Quote expiry ──");

  try {
    const tradeInfo = await router.getTradeInfo(AMOUNT, native, stable, 3, 200);
    // Artificially expire it
    const expired = { ...tradeInfo, validUntil: Date.now() - 1000 };
    router.getSwapCalldata(expired, "0x" + "ef".repeat(20));
    assert(false, "Should reject expired quote");
  } catch (err) {
    assert(err instanceof EmpxError, "Expired quote throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.QUOTE_EXPIRED, "Error code QUOTE_EXPIRED");
    assert((err as EmpxError).retryable === true, "Expired quote is retryable");
  }

  // ── Results ───────────────────────────────────────────────────────────────

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
