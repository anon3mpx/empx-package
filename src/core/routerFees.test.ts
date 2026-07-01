import assert from "node:assert/strict";
import { getChainConfig } from "../chains/index.js";
import { setProtocolFeeBps } from "./fees.js";
import { disablePairTypeFees, enablePairTypeFees } from "./feeTiers.js";
import { createFeeResolver } from "./routerFees.js";

const chain = getChainConfig(42161);
const volatile = chain.WRAPPED_NATIVE;
const stableA = chain.STABLE_TOKENS[0];
const stableB = chain.STABLE_TOKENS[1];

function resetGlobals() {
  setProtocolFeeBps(28);
  disablePairTypeFees();
}

resetGlobals();

setProtocolFeeBps(30);
const globalResolver = createFeeResolver({}, chain);
assert.equal(globalResolver({}, volatile, stableA).toString(), "30");

const lowFeeRouter = createFeeResolver({ protocolFeeBps: 28 }, chain);
const highFeeRouter = createFeeResolver({ protocolFeeBps: 99 }, chain);
setProtocolFeeBps(55);
assert.equal(lowFeeRouter({}, volatile, stableA).toString(), "28");
assert.equal(highFeeRouter({}, volatile, stableA).toString(), "99");

const pairRouter = createFeeResolver({
  pairTypeFees: {
    volatileVolatileBps: 44,
    volatileStableBps: 22,
    stableStableBps: 9,
  },
}, chain);
assert.equal(pairRouter({}, volatile, stableA).toString(), "22");
assert.equal(pairRouter({}, stableA, stableB).toString(), "9");
assert.equal(pairRouter({ pairType: "V/V" }, stableA, stableB).toString(), "44");

enablePairTypeFees({ volatileVolatileBps: 80, volatileStableBps: 40, stableStableBps: 20 });
const disabledPairRouter = createFeeResolver({ pairTypeFees: false, protocolFeeBps: 33 }, chain);
assert.equal(disabledPairRouter({}, stableA, stableB).toString(), "33");

resetGlobals();
console.log("routerFees: instance-scoped fee tests passed");
