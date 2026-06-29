import assert from "node:assert/strict";
import { toWagmiTransaction } from "./wagmi.js";

const tx = toWagmiTransaction({
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: "42",
});

assert.equal(tx.to, "0x0000000000000000000000000000000000000001");
assert.equal(tx.data, "0x1234");
assert.equal(tx.value, 42n);

console.log("wagmi adapter: transaction conversion tests passed");
