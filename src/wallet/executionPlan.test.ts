import assert from "node:assert/strict";
import { ethers } from "ethers";
import type {
  AllowanceResult,
  CalldataResult,
  EmpxRouter,
  SwapResult,
  TradeInfo,
} from "../types.js";
import {
  canSendWalletCalls,
  parseWalletCapabilities,
} from "./eip5792.js";
import {
  prepareWalletSwap,
} from "./executionPlan.js";

const account = "0x00000000000000000000000000000000000000aa";
const recipient = "0x00000000000000000000000000000000000000bb";
const tokenIn = "0x0000000000000000000000000000000000000001";
const tokenOut = "0x0000000000000000000000000000000000000002";
const routerAddress = "0x00000000000000000000000000000000000000cc";
const native = "0x0000000000000000000000000000000000000000";

const tradeInfo: TradeInfo = {
  amountIn: "1000",
  amountOut: "900",
  fee: "28",
  affiliateFee: "0",
  totalFeeBps: "28",
  amounts: ["1000", "900"],
  path: [tokenIn, tokenOut],
  adapters: ["0x0000000000000000000000000000000000000003"],
  gasEstimate: "1",
  quoteId: "quote",
  timestamp: Date.now(),
  validUntil: Date.now() + 30_000,
  sdkVersion: "test",
};

const swapCalldata: CalldataResult = {
  to: routerAddress,
  data: "0x1234",
  value: "0",
};

function createMockRouter(options: {
  swapType?: SwapResult["swapType"];
  approved?: boolean;
  permitFails?: boolean;
} = {}): EmpxRouter {
  const swapType = options.swapType ?? "ERC20ToERC20";
  return {
    chain: {
      chainId: 42161,
      name: "Mock",
      nativeSwapFns: { fromNative: "swapNoSplitFromETH", toNative: "swapNoSplitToETH" },
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrl: "https://example.invalid",
      ROUTER_ADDRESS: routerAddress,
      NATIVE_ADDRESS: native,
      WRAPPED_NATIVE: "0x0000000000000000000000000000000000000004",
      USD_STABLE: tokenOut,
      USD_STABLE_DECIMALS: 6,
      STABLE_TOKENS: [tokenOut],
      TRUSTED_TOKENS: [tokenIn, tokenOut],
      ADAPTERS: ["0x0000000000000000000000000000000000000003"],
    },
    provider: {} as any,
    affiliate: undefined,
    isSplitAvailable: () => false,
    findBestPath: async () => ({ amounts: [], path: [], adapters: [], gasEstimate: "0" }),
    getTradeInfo: async () => tradeInfo,
    checkAllowance: async (): Promise<AllowanceResult> => ({
      approved: options.approved ?? false,
      allowance: options.approved ? "1000" : "0",
    }),
    getSwapCalldata: () => swapCalldata,
    getSwapFromNativeCalldata: () => ({ ...swapCalldata, value: "1000" }),
    getSwapToNativeCalldata: () => swapCalldata,
    getSwapWithPermitCalldata: () => {
      if (options.permitFails) throw new Error("permit unavailable");
      return { ...swapCalldata, data: "0xpermit" };
    },
    getSwapToNativeWithPermitCalldata: () => {
      if (options.permitFails) throw new Error("permit unavailable");
      return { ...swapCalldata, data: "0xpermitnative" };
    },
    getWrapCalldata: () => swapCalldata,
    getUnwrapCalldata: () => swapCalldata,
    getApprovalCalldata: () => ({ to: tokenIn, data: "0xapprove", value: "0" }),
    getApprovalCalldataForAmount: () => ({ to: tokenIn, data: "0xapproveexact", value: "0" }),
    swap: async (): Promise<SwapResult> => ({ tradeInfo, calldata: swapCalldata, swapType }),
    prepareSwap: async (): Promise<SwapResult> => ({ tradeInfo, calldata: swapCalldata, swapType }),
    executeSwap: async () => ({ tradeInfo, calldata: swapCalldata, swapType, hash: "0xhash", receipt: {} }),
    getTokenPriceUSD: async () => 1,
    getQuoteUSD: async () => ({ usd: 1, pricePerToken: 1, decimals: 18, humanAmount: 1 }),
    getMultipleTokenPricesUSD: async () => ({}),
    getTokenDecimals: async () => 18,
    getTokenSymbol: async () => "MOCK",
    estimateAffiliateEarning: async () => null,
  };
}

async function run() {
  assert.equal(
    parseWalletCapabilities({ "0xa4b1": { atomicBatch: { supported: true } } }, "0xa4b1").canBatch,
    true,
  );
  assert.equal(
    parseWalletCapabilities({ "0xa4b1": { atomicBatch: { supported: false } } }, "0xa4b1").canBatch,
    false,
  );

  const capabilityProvider = {
    request: async () => ({ "0xa4b1": { atomicBatch: { supported: true } } }),
  };
  assert.equal(await canSendWalletCalls(capabilityProvider, account, "0xa4b1"), true);

  const swapOnly = await prepareWalletSwap({
    router: createMockRouter({ swapType: "NativeToERC20" }),
    account,
    amountIn: "1000",
    tokenIn: native,
    tokenOut,
    recipient,
  });
  assert.equal(swapOnly.strategy, "swap-only");
  assert.equal(swapOnly.approval, undefined);
  assert.equal(swapOnly.walletCalls, undefined);

  const batch = await prepareWalletSwap({
    router: createMockRouter(),
    account,
    amountIn: "1000",
    tokenIn,
    tokenOut,
    recipient,
    eip1193Provider: capabilityProvider,
    preferBatch: true,
  });
  assert.equal(batch.strategy, "batch");
  assert.equal(batch.walletCalls?.length, 2);
  assert.equal(batch.approval?.data, "0xapproveexact");

  const fallback = await prepareWalletSwap({
    router: createMockRouter(),
    account,
    amountIn: "1000",
    tokenIn,
    tokenOut,
    recipient,
    eip1193Provider: { request: async () => ({ "0xa4b1": { atomicBatch: { supported: false } } }) },
    preferBatch: true,
  });
  assert.equal(fallback.strategy, "approval-then-swap");
  assert.match(fallback.warnings.join("\n"), /does not support wallet_sendCalls batching/);

  const signer = ethers.Wallet.createRandom();
  const permit = await prepareWalletSwap({
    router: createMockRouter(),
    account: await signer.getAddress(),
    amountIn: "1000",
    tokenIn,
    tokenOut,
    recipient,
    preferPermit: true,
    permit: {
      signer,
      tokenName: "Mock Token",
      tokenVersion: "1",
      nonce: "0",
      deadline: "999",
    },
  });
  assert.equal(permit.strategy, "permit");
  assert.equal(permit.permit?.deadline, "999");
  assert.equal(permit.swap.data, "0xpermit");
  assert.equal(permit.approval, undefined);

  console.log("executionPlan: wallet execution planning tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
