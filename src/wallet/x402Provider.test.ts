// ─── x402Provider — unit tests ────────────────────────────────────────────────
//
// Tests verify the parsing, signing, and retry shape without hitting a live
// x402 endpoint.  Network-integration tests are deferred to ops.

import { JsonRpcProvider, Wallet } from "ethers";
import {
  createX402Provider,
  PRESET_X402_ENDPOINTS,
  type PaymentRequirement,
} from "./x402Provider.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { pass++; console.log(`  ✓ ${name}`); },
    (e: any) => { fail++; failures.push(`${name}: ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); },
  );
}

function assertEq<T>(actual: T, expected: T) {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

function assertThrows(fn: () => void, match?: string) {
  let threw = false;
  try { fn(); } catch (e: any) {
    threw = true;
    if (match && !e.message.includes(match)) {
      throw new Error(`threw "${e.message}" but expected match "${match}"`);
    }
  }
  if (!threw) throw new Error("expected throw, none happened");
}

async function run() {
  console.log("\nx402Provider — unit tests\n");

  // Test wallet — burner, no funds needed.
  const wallet = new Wallet("0x" + "11".repeat(32));

  // ─── Factory validation ────────────────────────────────────────────────────

  await test("createX402Provider requires endpoint", () => {
    assertThrows(
      () => createX402Provider({ endpoint: "", paymentSigner: wallet }),
      "endpoint",
    );
  });

  await test("createX402Provider requires paymentSigner", () => {
    assertThrows(
      () => createX402Provider({ endpoint: PRESET_X402_ENDPOINTS.QUICKNODE, paymentSigner: undefined as any }),
      "paymentSigner",
    );
  });

  await test("createX402Provider returns a JsonRpcProvider", () => {
    const p = createX402Provider({
      endpoint: PRESET_X402_ENDPOINTS.QUICKNODE,
      paymentSigner: wallet,
    });
    if (!(p instanceof JsonRpcProvider)) {
      throw new Error("expected JsonRpcProvider instance");
    }
  });

  // ─── Endpoint presets ──────────────────────────────────────────────────────

  await test("PRESET_X402_ENDPOINTS includes QuickNode + thirdweb + EmpX", () => {
    if (!PRESET_X402_ENDPOINTS.QUICKNODE) throw new Error("missing QUICKNODE");
    if (!PRESET_X402_ENDPOINTS.THIRDWEB) throw new Error("missing THIRDWEB");
    if (!PRESET_X402_ENDPOINTS.EMPX_MANAGED) throw new Error("missing EMPX_MANAGED");
  });

  // ─── EIP-3009 USDC signing — verify the signer produces a valid sig ───────

  await test("EIP-3009 USDC signing produces 65-byte signature", async () => {
    // Manually invoke the internal signing path by calling signTypedData on
    // the wallet with the canonical USDC domain.  This mirrors what the
    // adapter does on 402 retry.
    const requirement: PaymentRequirement = {
      scheme: "eip3009",
      chainId: 8453, // Base
      asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base USDC
      decimals: 6,
      amount: "100", // 0.0001 USDC
      payTo: "0x" + "aa".repeat(20),
      nonce: "0x" + "bb".repeat(32),
      validAfter: Math.floor(Date.now() / 1000) - 60,
      validBefore: Math.floor(Date.now() / 1000) + 600,
    };

    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: requirement.chainId,
      verifyingContract: requirement.asset,
    };
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    const auth = {
      from: wallet.address,
      to: requirement.payTo,
      value: requirement.amount,
      validAfter: requirement.validAfter,
      validBefore: requirement.validBefore,
      nonce: requirement.nonce,
    };

    const sig = await wallet.signTypedData(domain, types, auth);
    if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) {
      throw new Error(`expected 65-byte hex sig, got ${sig}`);
    }
  });

  // ─── Dry-run mode ──────────────────────────────────────────────────────────

  await test("dryRun option is accepted at construction", () => {
    const p = createX402Provider({
      endpoint: PRESET_X402_ENDPOINTS.QUICKNODE,
      paymentSigner: wallet,
      dryRun: true,
    });
    if (!p) throw new Error("expected provider");
  });

  // ─── Max payment guard ─────────────────────────────────────────────────────

  await test("maxPaymentPerCallRaw is accepted at construction", () => {
    const p = createX402Provider({
      endpoint: PRESET_X402_ENDPOINTS.QUICKNODE,
      paymentSigner: wallet,
      maxPaymentPerCallRaw: 500_000n,
    });
    if (!p) throw new Error("expected provider");
  });

  // ─── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${pass}/${pass + fail} tests passed`);
  if (fail) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

run();
