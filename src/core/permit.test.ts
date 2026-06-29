import assert from "node:assert/strict";
import { ethers } from "ethers";
import { CHAIN_IDS, getChainConfig } from "../chains/index.js";
import type { PermitSignature, TradeInfo } from "../types.js";
import {
  getSwapToNativeWithPermitCalldata,
  getSwapWithPermitCalldata,
} from "./calldata.js";
import {
  buildPermitTypedData,
  splitPermitSignature,
} from "./permit.js";

const chainConfig = getChainConfig(CHAIN_IDS.ARBITRUM);
const recipient = "0x0000000000000000000000000000000000000001";
const tokenIn = "0x0000000000000000000000000000000000000002";
const tokenOut = "0x0000000000000000000000000000000000000003";
const adapter = "0x0000000000000000000000000000000000000004";

const tradeInfo: TradeInfo = {
  amountIn: "1000",
  amountOut: "900",
  fee: "28",
  affiliateFee: "0",
  totalFeeBps: "28",
  amounts: ["1000", "900"],
  path: [tokenIn, tokenOut],
  adapters: [adapter],
  gasEstimate: "1",
  quoteId: "quote",
  timestamp: Date.now(),
  validUntil: Date.now() + 30_000,
  sdkVersion: "test",
};

const permit: PermitSignature = {
  deadline: "999",
  v: 27,
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
};

const iface = new ethers.Interface(chainConfig.routerAbi as ethers.InterfaceAbi);

const permitCalldata = getSwapWithPermitCalldata(tradeInfo, recipient, chainConfig, "28", permit);
const decoded = iface.decodeFunctionData("swapNoSplitWithPermit", permitCalldata.data);
assert.equal(permitCalldata.to, chainConfig.ROUTER_ADDRESS);
assert.equal(permitCalldata.value, "0");
assert.equal(decoded[1], recipient);
assert.equal(decoded[2], 28n);
assert.equal(decoded[3], 999n);
assert.equal(decoded[4], 27n);
assert.equal(decoded[5], permit.r);
assert.equal(decoded[6], permit.s);

const toNativePermitCalldata = getSwapToNativeWithPermitCalldata(tradeInfo, recipient, chainConfig, "28", permit);
const toNativeDecoded = iface.decodeFunctionData(chainConfig.nativeSwapFns.toNative + "WithPermit", toNativePermitCalldata.data);
assert.equal(toNativeDecoded[3], 999n);

const typed = buildPermitTypedData({
  tokenName: "Mock Token",
  tokenVersion: "1",
  chainId: 42161,
  verifyingContract: tokenIn,
  owner: recipient,
  spender: chainConfig.ROUTER_ADDRESS,
  value: "1000",
  nonce: "5",
  deadline: "999",
});
assert.equal(typed.domain.name, "Mock Token");
assert.equal(typed.message.nonce, 5n);
assert.deepEqual(Object.keys(typed.types), ["Permit"]);

const split = splitPermitSignature(`0x${"11".repeat(32)}${"22".repeat(32)}1b`);
assert.equal(split.v, 27);
assert.equal(split.r, permit.r);
assert.equal(split.s, permit.s);

console.log("permit: calldata and typed-data tests passed");
