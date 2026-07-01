import assert from "node:assert/strict";
import { toViemTransaction } from "./viem.js";

const tx = toViemTransaction({
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: "16",
});

assert.deepEqual(tx, {
  to: "0x0000000000000000000000000000000000000001",
  data: "0x1234",
  value: 16n,
});

console.log("viem adapter: transaction conversion tests passed");
