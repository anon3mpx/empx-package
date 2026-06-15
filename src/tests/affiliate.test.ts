// ─── Dual Affiliate Model Integration Test ────────────────────────────────────
// Tests both on-chain (integratorId) and off-chain (affiliate config) models.
// Requires RPC: process.env.RPC_URL or default Arbitrum
// Usage: npx tsx src/tests/affiliate.test.ts

import {
  createRouter, createAffiliateRouter, CHAIN_IDS,
  EmpxError, ERROR_CODES,
  buildFeeBreakdown, buildSplitAggregateTradeInfo,
} from "../index.js";

const RPC_URL = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
const CHAIN = CHAIN_IDS.ARBITRUM;
const RECIPIENT = process.env.RECIPIENT || "0x" + "cd".repeat(20);

const TOKENS = {
  USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
};
const AMOUNT = "1000000"; // 1 USDC (6 decimals)

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ FAIL: ${name}`);
}

async function main() {
  console.log("\n─── Dual Affiliate Model Test ───");
  console.log(`Chain: Arbitrum (${CHAIN}) | Token: USDC → USDT | Amount: ${AMOUNT}`);

  const INTEGRATOR_ID = "0x" + "aa".repeat(32);
  const AFFILIATE_WALLET = "0x" + "bb".repeat(20);

  // ── 1. No affiliate (baseline) ─────────────────────────────────────────────

  console.log("\n── 1. Baseline (no affiliate) ──");
  const base = createRouter(CHAIN, RPC_URL);
  assert(base.affiliate === undefined, "No affiliate");
  assert(base.integratorId === undefined, "No integratorId");

  const tradeInfo = await base.getTradeInfo(AMOUNT, TOKENS.USDC, TOKENS.USDT, 3, 100);
  assert(!!tradeInfo.quoteId, "TradeInfo has quoteId");
  assert(tradeInfo.integratorId === undefined, "No integratorId in TradeInfo");
  assert(tradeInfo.affiliateFee === "0", "affiliateFee is 0");

  console.log(`  TradeInfo: amountOut=${tradeInfo.amountOut}, fee=${tradeInfo.fee}, affiliateFee=${tradeInfo.affiliateFee}`);

  // ── 2. On-chain affiliate (integratorId) ──────────────────────────────────

  console.log("\n── 2. On-chain integratorId ──");
  const onchain = createRouter(CHAIN, RPC_URL, { integratorId: INTEGRATOR_ID });
  assert(onchain.integratorId === INTEGRATOR_ID, "Router has integratorId");
  assert(onchain.affiliate === undefined, "No off-chain affiliate");

  const onchainTradeInfo = await onchain.getTradeInfo(AMOUNT, TOKENS.USDC, TOKENS.USDT, 3, 100);
  assert(onchainTradeInfo.integratorId === INTEGRATOR_ID, "TradeInfo has integratorId");

  // Build swap calldata — should use integrator ABI with _integratorId param
  const onchainCalldata = onchain.getSwapCalldata(onchainTradeInfo, RECIPIENT);
  assert(!!onchainCalldata.data, "On-chain calldata has data");
  assert(onchainCalldata.data.length > 100, "Calldata is non-trivial");

  console.log(`  TradeInfo: amountOut=${onchainTradeInfo.amountOut}, integratorId present`);
  console.log(`  Calldata length: ${onchainCalldata.data.length} chars`);

  // ── 3. Off-chain affiliate (revenue share) ─────────────────────────────────

  console.log("\n── 3. Off-chain affiliate (revenue share) ──");
  const offchain = createRouter(CHAIN, RPC_URL, {
    affiliate: { address: AFFILIATE_WALLET, feeBps: 2000 } // 20% of protocol fee
  });
  assert(!!offchain.affiliate, "Router has affiliate config");
  assert(offchain.affiliate!.feeBps === 2000, "Affiliate feeBps = 2000");
  assert(offchain.integratorId === undefined, "No on-chain integratorId");

  const offchainTradeInfo = await offchain.getTradeInfo(AMOUNT, TOKENS.USDC, TOKENS.USDT, 3, 100);
  assert(offchainTradeInfo.affiliateFee !== "0", "affiliateFee is non-zero");
  assert(offchainTradeInfo.totalFeeBps === offchainTradeInfo.fee, "totalFeeBps == protocol fee");

  // Off-chain calldata should NOT have integratorId — just standard router
  const offchainCalldata = offchain.getSwapCalldata(offchainTradeInfo, RECIPIENT);
  assert(!!offchainCalldata.data, "Off-chain calldata has data");

  // Estimate affiliate earning
  const earning = await offchain.estimateAffiliateEarning(TOKENS.USDC, AMOUNT);
  assert(earning !== null, "estimateAffiliateEarning returns non-null with affiliate");
  assert(earning!.affiliateAddress === AFFILIATE_WALLET, "Earning has correct address");
  assert(earning!.affiliateFeeBps === 2000, "Earning has correct feeBps");
  assert(typeof earning!.affiliateAmountRaw === "string", "Earning has raw amount");
  assert(earning!.affiliateAmountHuman > 0, "Earning has positive human amount");

  console.log(`  TradeInfo: amountOut=${offchainTradeInfo.amountOut}, affiliateFee=${offchainTradeInfo.affiliateFee}`);
  console.log(`  Affiliate earning: ${earning!.affiliateAmountHuman} USDC (raw: ${earning!.affiliateAmountRaw})`);

  // ── 4. Both models simultaneously ──────────────────────────────────────────

  console.log("\n── 4. Both models (integratorId + affiliate) ──");
  const dual = createRouter(CHAIN, RPC_URL, {
    integratorId: INTEGRATOR_ID,
    affiliate: { address: AFFILIATE_WALLET, feeBps: 2500 }
  });
  assert(dual.integratorId === INTEGRATOR_ID, "Dual router has integratorId");
  assert(!!dual.affiliate, "Dual router has affiliate");
  assert(dual.affiliate!.feeBps === 2500, "Dual affiliate feeBps = 2500");

  const dualTradeInfo = await dual.getTradeInfo(AMOUNT, TOKENS.USDC, TOKENS.USDT, 3, 100);
  assert(dualTradeInfo.integratorId === INTEGRATOR_ID, "Dual TradeInfo has integratorId");
  assert(dualTradeInfo.affiliateFee !== "0", "Dual TradeInfo has non-zero affiliateFee");

  // Calldata should have BOTH: integrator ABI with _integratorId AND fee
  const dualCalldata = dual.getSwapCalldata(dualTradeInfo, RECIPIENT);
  assert(!!dualCalldata.data, "Dual calldata has data");

  const dualEarning = await dual.estimateAffiliateEarning(TOKENS.USDC, AMOUNT);
  assert(dualEarning !== null, "Dual router has affiliate earning");

  console.log(`  TradeInfo: fee=${dualTradeInfo.fee}, affiliateFee=${dualTradeInfo.affiliateFee}, integratorId present`);
  console.log(`  Dual affiliate earning: ${dualEarning!.affiliateAmountHuman} USDC`);

  // ── 5. createAffiliateRouter() wrapper ─────────────────────────────────────

  console.log("\n── 5. createAffiliateRouter() wrapper (V1 compat) ──");
  const v1compat = createAffiliateRouter(CHAIN, INTEGRATOR_ID, RPC_URL);
  assert(v1compat.integratorId === INTEGRATOR_ID, "V1 compat router has integratorId");
  assert(v1compat.affiliate === undefined, "V1 compat has no off-chain affiliate");

  const v1TradeInfo = await v1compat.getTradeInfo(AMOUNT, TOKENS.USDC, TOKENS.USDT, 3, 100);
  const v1Calldata = v1compat.getSwapCalldata(v1TradeInfo, RECIPIENT);
  assert(!!v1Calldata.data, "V1 compat calldata generated");

  console.log(`  V1 compat TradeInfo had integratorId: ${v1TradeInfo.integratorId === INTEGRATOR_ID}`);

  // ── 6. Fee breakdown ───────────────────────────────────────────────────────

  console.log("\n── 6. Fee breakdown ──");
  const breakdown = buildFeeBreakdown(
    BigInt(28),
    { address: AFFILIATE_WALLET, feeBps: 2000 }
  );
  assert(breakdown.protocolFeeBps === "28", "Fee breakdown protocolFeeBps");
  assert(breakdown.affiliateFeeBps === "2000", "Fee breakdown affiliateFeeBps");
  assert(breakdown.totalFeeBps === "28", "Fee breakdown totalFeeBps (user pays unchanged)");
  console.log(`  Breakdown: protocol=${breakdown.protocolFeeBps}, affiliate=${breakdown.affiliateFeeBps}, total=${breakdown.totalFeeBps}`);

  // ── 7. Error handling ─────────────────────────────────────────────────────

  console.log("\n── 7. Error handling ──");
  try {
    createRouter(CHAIN, RPC_URL, {
      integratorId: "not-bytes32"
    });
    assert(false, "Should reject invalid integratorId");
  } catch (err) {
    assert(err instanceof EmpxError, "Invalid integratorId throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.INVALID_INPUT, "Error code INVALID_INPUT");
  }

  try {
    createRouter(CHAIN, RPC_URL, {
      affiliate: { address: "bad-address", feeBps: 2000 }
    });
    assert(false, "Should reject invalid affiliate address");
  } catch (err) {
    assert(err instanceof EmpxError, "Invalid affiliate throws EmpxError");
    assert((err as EmpxError).code === ERROR_CODES.INVALID_AFFILIATE, "Error code INVALID_AFFILIATE");
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
