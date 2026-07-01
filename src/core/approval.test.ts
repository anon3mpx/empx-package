import assert from "node:assert/strict";
import { ethers } from "ethers";
import { CHAIN_IDS, createRouter } from "../index.js";
import {
  getApprovalCalldata,
  getApprovalCalldataForAmount,
} from "./calldata.js";
import { ERC20_ABI } from "./abi.js";

const token = "0x0000000000000000000000000000000000000001";
const spender = "0x0000000000000000000000000000000000000002";
const iface = new ethers.Interface(ERC20_ABI as ethers.InterfaceAbi);

const legacyUnlimited = getApprovalCalldata(token, spender);
const legacyDecoded = iface.decodeFunctionData("approve", legacyUnlimited.data);
assert.equal(legacyDecoded[1], ethers.MaxUint256);

const exact = getApprovalCalldataForAmount(token, spender, { mode: "exact", amount: "123" });
const exactDecoded = iface.decodeFunctionData("approve", exact.data);
assert.equal(exactDecoded[1], 123n);

const explicitUnlimited = getApprovalCalldataForAmount(token, spender, { mode: "unlimited" });
const explicitDecoded = iface.decodeFunctionData("approve", explicitUnlimited.data);
assert.equal(explicitDecoded[1], ethers.MaxUint256);

assert.throws(
  () => getApprovalCalldataForAmount(token, spender, { mode: "exact" }),
  /Exact approval requires an amount/
);

const router = createRouter(CHAIN_IDS.ARBITRUM);
const routerExact = router.getApprovalCalldataForAmount(token, { mode: "exact", amount: "456" });
const routerDecoded = iface.decodeFunctionData("approve", routerExact.data);
assert.equal(routerDecoded[1], 456n);

console.log("approval: explicit amount mode tests passed");
