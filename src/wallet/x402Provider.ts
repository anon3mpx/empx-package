// ─── x402 RPC Provider Adapter ────────────────────────────────────────────────
//
// Wraps an ethers JsonRpcProvider with x402 HTTP payment middleware.
// Per FEE-STRUCTURE-AND-STRATEGY §10.2 / D2.
//
// FLOW (per Coinbase x402 spec + thirdweb implementation):
//
//   1. Client sends JSON-RPC request to the x402 endpoint
//   2. Server responds with HTTP 402 + `PAYMENT-REQUIRED` header
//      (base64-encoded JSON describing required payment)
//   3. Client signs an EIP-3009 USDC TransferWithAuthorization
//   4. Client retries the request with `PAYMENT-SIGNATURE` header
//      (base64-encoded JSON with the signature)
//   5. Server verifies + settles + returns the RPC result
//
// SUPPORTED ENDPOINTS:
//   - QuickNode x402 (https://www.quicknode.com/agents)
//   - thirdweb x402 (https://portal.thirdweb.com/x402)
//   - Any x402-compliant endpoint per the Coinbase reference
//   - Self-hosted (for ops to point at our own x402 endpoint when ready)
//
// EMPX MARKUP:
//   Per locked decision D2, EmpX takes a small flat markup per call
//   (~$0.0001) over the wholesale rate when the integrator uses our
//   bundled x402 endpoint.  When the integrator points at a third-party
//   endpoint directly, we take nothing (only the rail's per-call fee).
//   Markup is encoded into the EmpX-managed endpoint, NOT signed by the
//   user separately — they see a single PAYMENT-REQUIRED amount.

import { JsonRpcProvider, FetchRequest, type Signer } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Server-side payment requirement encoded in the `PAYMENT-REQUIRED` header.
 * Shape matches the x402 reference (Coinbase + thirdweb compatible).
 */
export interface PaymentRequirement {
  /** Scheme identifier — currently "eip3009" for USDC, "eip2612" for permit tokens. */
  scheme: "eip3009" | "eip2612";
  /** Chain ID for the payment settlement (often 8453 = Base for USDC). */
  chainId: number;
  /** Token contract address (USDC for eip3009). */
  asset: string;
  /** Token decimals (6 for USDC). */
  decimals: number;
  /** Required payment amount in raw token units (as a decimal string). */
  amount: string;
  /** Recipient (server's settlement address). */
  payTo: string;
  /** Authorization unique nonce (32-byte hex). */
  nonce: string;
  /** Authorization valid-after unix timestamp. */
  validAfter: number;
  /** Authorization valid-before unix timestamp. */
  validBefore: number;
  /** Server-issued payment context — echo back in the signature header. */
  context?: string;
}

/**
 * Client-side payload sent in the `PAYMENT-SIGNATURE` header on retry.
 */
export interface PaymentPayload {
  scheme: "eip3009" | "eip2612";
  from: string;                // payer
  signature: string;           // 0x-prefixed 65-byte sig
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
  };
  context?: string;
}

export interface CreateX402ProviderOptions {
  /** x402-enabled RPC endpoint.  See PRESET_X402_ENDPOINTS for presets. */
  endpoint: string;
  /** Wallet that signs payment authorisations.  Should hold sufficient USDC
   *  on the payment chain (Base by default) to cover the expected RPC spend. */
  paymentSigner: Signer;
  /** Maximum payment amount per call in raw token units.  Hard cap to
   *  prevent runaway spend if the endpoint quotes an unreasonable amount.
   *  Default: 1_000_000 raw = 1 USDC per call. */
  maxPaymentPerCallRaw?: bigint;
  /** Optional EmpX markup in raw token units added to display estimates only
   *  (not signed separately).  Pure telemetry / cost-disclosure aid. */
  empxMarkupRaw?: bigint;
  /** When true, parses 402 + logs the requirement but does NOT sign or retry.
   *  Useful for ops dry-runs before locking the production endpoint. */
  dryRun?: boolean;
  /** Optional handler invoked after each successful payment.  Used by
   *  integrators to track spend / emit telemetry. */
  onPayment?: (info: { endpoint: string; amount: string; scheme: string }) => void;
}

// ─── Endpoint presets ─────────────────────────────────────────────────────────

/**
 * Known x402-enabled RPC endpoint presets.  Update as partners come online.
 *
 * IMPORTANT: These URLs are illustrative — the canonical x402 endpoint URL
 * for each provider may differ at production time.  Configure the actual
 * endpoint via `endpoint` in CreateX402ProviderOptions.
 */
export const PRESET_X402_ENDPOINTS = Object.freeze({
  /** QuickNode x402 endpoint family — https://www.quicknode.com/agents */
  QUICKNODE: "https://api.quicknode.com/x402",
  /** thirdweb x402 endpoint — https://portal.thirdweb.com/x402 */
  THIRDWEB: "https://x402.thirdweb.com",
  /** EmpX-bundled endpoint (TBD; placeholder until ops locks production URL).
   *  When set, EmpX-managed markup is applied at the endpoint, transparent
   *  to the signer. */
  EMPX_MANAGED: "https://rpc.empx.network/x402",
}) satisfies Readonly<Record<string, string>>;

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build an ethers Provider that auto-pays x402 RPC requests.
 *
 * Returns a standard JsonRpcProvider; the x402 middleware is plumbed
 * into the FetchRequest layer.  All existing ethers operations
 * (provider.getBalance, contract calls, etc.) work transparently.
 *
 * @example
 *   import { Wallet } from "ethers";
 *   import { createX402Provider, PRESET_X402_ENDPOINTS } from "empx-swap-sdk";
 *
 *   const paymentSigner = new Wallet(process.env.X402_PAYMENT_KEY!);
 *   const provider = createX402Provider({
 *     endpoint: PRESET_X402_ENDPOINTS.QUICKNODE,
 *     paymentSigner,
 *     maxPaymentPerCallRaw: 1_000_000n,  // 1 USDC ceiling
 *   });
 *
 *   const router = createRouter(CHAIN_IDS.BASE, provider);
 *   await router.swap(amountIn, tokenIn, tokenOut, toAddress);
 */
export function createX402Provider(opts: CreateX402ProviderOptions): JsonRpcProvider {
  if (!opts.endpoint) throw new Error("createX402Provider: `endpoint` is required");
  if (!opts.paymentSigner) throw new Error("createX402Provider: `paymentSigner` is required");

  const maxPay = opts.maxPaymentPerCallRaw ?? 1_000_000n; // 1 USDC default
  const dryRun = Boolean(opts.dryRun);

  const baseRequest = new FetchRequest(opts.endpoint);
  baseRequest.allowInsecureAuthentication = false;

  // Plumb the x402 retry logic into the request preflight.  ethers v6's
  // FetchRequest supports a getUrlFunc override — we use the response
  // processFunc pattern instead so we can read response headers post-flight.
  baseRequest.processFunc = async (request, response) => {
    if (response.statusCode !== 402) return response;

    const required = parseRequiredHeader(response);
    if (!required) {
      throw new Error("x402: server returned 402 without a parseable PAYMENT-REQUIRED header");
    }
    if (BigInt(required.amount) > maxPay) {
      throw new Error(
        `x402: server requested ${required.amount} but maxPaymentPerCallRaw is ${maxPay.toString()}`,
      );
    }

    if (dryRun) {
      // Surface the requirement to the caller and bail out — useful when
      // ops is validating that an endpoint produces the expected requirement
      // without committing real funds.
      throw new Error(
        `x402[dryRun]: would pay ${required.amount} of ${required.asset} on chain ${required.chainId}`,
      );
    }

    const payload = await signPaymentPayload(required, opts.paymentSigner);

    // Retry with the signature header.
    const retry = request.clone();
    retry.setHeader("PAYMENT-SIGNATURE", base64Encode(JSON.stringify(payload)));
    const retried = await retry.send();

    if (retried.statusCode === 402) {
      throw new Error("x402: payment was not accepted by the server (still 402 after retry)");
    }

    opts.onPayment?.({
      endpoint: opts.endpoint,
      amount: required.amount,
      scheme: required.scheme,
    });

    return retried;
  };

  return new JsonRpcProvider(baseRequest);
}

// ─── 402 parsing ─────────────────────────────────────────────────────────────

function parseRequiredHeader(response: { headers: Record<string, string> }): PaymentRequirement | null {
  const raw = response.headers["payment-required"] ?? response.headers["PAYMENT-REQUIRED"];
  if (!raw) return null;
  try {
    const decoded = base64Decode(raw);
    const parsed = JSON.parse(decoded);
    // Defensive shape check — refuse to sign if any field is missing.
    if (
      typeof parsed.scheme === "string" &&
      typeof parsed.chainId === "number" &&
      typeof parsed.asset === "string" &&
      typeof parsed.amount === "string" &&
      typeof parsed.payTo === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.validAfter === "number" &&
      typeof parsed.validBefore === "number"
    ) {
      return parsed as PaymentRequirement;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── EIP-3009 signing ────────────────────────────────────────────────────────

async function signPaymentPayload(req: PaymentRequirement, signer: Signer): Promise<PaymentPayload> {
  const from = await signer.getAddress();

  if (req.scheme === "eip3009") {
    return signEip3009(req, signer, from);
  }
  if (req.scheme === "eip2612") {
    // ERC-2612 permit path — most non-USDC stables.  Domain depends on the
    // specific token (name field).  Until we have a deterministic mapping
    // of token → domain.name across chains, defer to a future commit.
    throw new Error(
      "x402: EIP-2612 permit scheme not yet supported — use an eip3009 (USDC) endpoint or extend signPaymentPayload()",
    );
  }
  throw new Error(`x402: unknown scheme "${(req as PaymentRequirement).scheme}"`);
}

async function signEip3009(
  req: PaymentRequirement,
  signer: Signer,
  from: string,
): Promise<PaymentPayload> {
  // USDC TransferWithAuthorization EIP-712 domain.  Domain name = "USD Coin"
  // for native USDC on every chain; bridged USDC variants may differ — the
  // server-provided `asset` field is the canonical reference.
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: req.chainId,
    verifyingContract: req.asset,
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

  const authorization = {
    from,
    to: req.payTo,
    value: req.amount,
    validAfter: req.validAfter,
    validBefore: req.validBefore,
    nonce: req.nonce,
  };

  const signature = await signer.signTypedData(domain, types, authorization);

  return {
    scheme: "eip3009",
    from,
    signature,
    authorization,
    context: req.context,
  };
}

// ─── Base64 helpers (browser + node compatible) ──────────────────────────────

function base64Encode(input: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(input, "utf8").toString("base64");
  if (typeof btoa !== "undefined") return btoa(input);
  throw new Error("x402: no base64 encoder available in this runtime");
}

function base64Decode(input: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(input, "base64").toString("utf8");
  if (typeof atob !== "undefined") return atob(input);
  throw new Error("x402: no base64 decoder available in this runtime");
}
