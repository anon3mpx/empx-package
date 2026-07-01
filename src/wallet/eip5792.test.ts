import assert from "node:assert/strict";
import {
  calldataToWalletCall,
  getWalletCapabilities,
  sendWalletCalls,
} from "./eip5792.js";

const zeroValue = calldataToWalletCall({
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: "0",
});
assert.deepEqual(zeroValue, {
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
});

const nonZeroValue = calldataToWalletCall({
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: "16",
});
assert.deepEqual(nonZeroValue, {
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: "0x10",
});

const calls: Array<{ method: string; params?: unknown[] }> = [];
const provider = {
  request: async (args: { method: string; params?: unknown[] }) => {
    calls.push(args);
    return { ok: true };
  },
};

async function run() {
  assert.deepEqual(await getWalletCapabilities(provider, "0xabc", "0x1"), { ok: true });
  assert.deepEqual(calls[0], {
    method: "wallet_getCapabilities",
    params: ["0xabc", ["0x1"]],
  });

  assert.deepEqual(await sendWalletCalls(provider, {
    version: "2.0.0",
    chainId: "0x1",
    from: "0xabc",
    calls: [nonZeroValue],
  }), { ok: true });
  assert.deepEqual(calls[1], {
    method: "wallet_sendCalls",
    params: [{
      version: "2.0.0",
      chainId: "0x1",
      from: "0xabc",
      calls: [nonZeroValue],
    }],
  });

  const rejectingProvider = {
    request: async () => {
      throw new Error("unsupported");
    },
  };
  await assert.rejects(
    () => sendWalletCalls(rejectingProvider, {
      version: "2.0.0",
      chainId: "0x1",
      from: "0xabc",
      calls: [nonZeroValue],
    }),
    /unsupported/
  );

  console.log("eip5792: batching helper tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
