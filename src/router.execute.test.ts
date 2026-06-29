import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createRouter, CHAIN_IDS } from "./index.js";

const router = createRouter(CHAIN_IDS.ARBITRUM);
const amountIn = "1000000000000000";
const recipient = "0x0000000000000000000000000000000000000001";

async function run() {
  const prepared = await router.prepareSwap(
    amountIn,
    router.chain.NATIVE_ADDRESS,
    router.chain.WRAPPED_NATIVE,
    recipient,
  );
  const legacy = await router.swap(
    amountIn,
    router.chain.NATIVE_ADDRESS,
    router.chain.WRAPPED_NATIVE,
    recipient,
  );

  assert.equal(prepared.swapType, legacy.swapType);
  assert.deepEqual(prepared.calldata, legacy.calldata);
  assert.equal(prepared.tradeInfo.sdkVersion, "2.1.0");

  await assert.rejects(
    () => router.executeSwap(
      amountIn,
      router.chain.NATIVE_ADDRESS,
      router.chain.WRAPPED_NATIVE,
      recipient,
    ),
    /executeSwap requires createRouter\(\.\.\., signer\)/
  );

  const signer = ethers.Wallet.createRandom();
  let sentTransaction: ethers.TransactionRequest | null = null;
  (signer as any).sendTransaction = async (tx: ethers.TransactionRequest) => {
    sentTransaction = tx;
    return {
      hash: "0xabc",
      wait: async () => ({ status: 1, hash: "0xabc" }),
    };
  };

  const executionRouter = createRouter(CHAIN_IDS.ARBITRUM, signer);
  const executed = await executionRouter.executeSwap(
    amountIn,
    executionRouter.chain.NATIVE_ADDRESS,
    executionRouter.chain.WRAPPED_NATIVE,
    recipient,
  );

  assert.equal(executed.hash, "0xabc");
  assert.equal((executed.receipt as any).status, 1);
  assert.deepEqual(sentTransaction, executed.calldata);

  console.log("router.execute: prepare and execute tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
