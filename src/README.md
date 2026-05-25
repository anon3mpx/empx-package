# empx-swap-sdk-beta

Multi-chain DEX router package. Finds optimal no-split swap paths, builds transaction calldata, and returns USD price quotes from a single unified API.

---

## AI Agent Integration

This SDK is designed to be **AI-agent native**: deterministic, schema-defined, side-effect-free, and structured for reliable orchestration pipelines.

### Agent Playbook (Standard Swap Workflow)

```
1.            router.getTradeInfo(...)   → get route + tradeInfo with quoteId + validUntil
2. [if ERC-20] router.checkAllowance(...)  → check if approval is needed
   [if needed] router.getApprovalCalldata(...) → build approval calldata → return to signer
3.            router.getSwapCalldata(...)  → build swap calldata (validates validUntil)
4.            RETURN calldata to signer    → DO NOT execute transactions from within the agent
```

Or use the all-in-one shortcut:

```
1.            router.swap(...)           → getTradeInfo + calldata in one call
2.            RETURN calldata to signer
```

### Recommended Output Payload

```json
{
  "chainId": 143,
  "swapType": "ERC20ToERC20",
  "tradeInfo": {
    "amountIn": "1000000000000000000",
    "amountOut": "960400000000000000",
    "fee": "28",
    "quoteId": "a3f2c1d4-...",
    "validUntil": 1712345678000,
    "sdkVersion": "1.0.0"
  },
  "calldata": { "to": "0x...", "data": "0x...", "value": "0" }
}
```

> **Important for agents:** Always check `tradeInfo.validUntil > Date.now()` before building calldata.
> Quotes expire after **30 seconds**. If expired, re-call `getTradeInfo()` (retryable).

### Plug-and-play with OpenAI / LangChain / AI Agents

```javascript
const { TOOL_SCHEMAS } = require("empx-swap-sdk-beta");

// OpenAI Agents SDK
const openAiTool = {
  type: "function",
  function: {
    name:        TOOL_SCHEMAS.getTradeInfo.name,
    description: TOOL_SCHEMAS.getTradeInfo.description,
    parameters:  TOOL_SCHEMAS.getTradeInfo.inputSchema,
  },
};
```

## Supported Chains

| Chain       | Chain ID | Native Token |
|-------------|----------|--------------|
| PulseChain  | 369      | PLS          |
| BSC         | 56       | BNB          |
| Arbitrum    | 42161    | ETH          |
| Base        | 8453     | ETH          |
| Polygon     | 137      | POL          |
| Avalanche   | 43114    | AVAX         |
| Optimism    | 10       | ETH          |
| Monad       | 143      | MON          |
| Sonic       | 146      | S            |
| Sei         | 1329     | SEI          |
| Berachain   | 80094    | BERA         |
| Rootstock   | 30       | RBTC         |
| EthPOW      | 10001    | ETHW         |
| HyperEVM    | 999      | HYPE         |


---

## Installation

```sh
npm install empx-swap-sdk-beta
```

---

## Quick Start

```javascript
const { createRouter, CHAIN_IDS, getProtocolFeeBps } = require("empx-swap-sdk-beta");

// Create a router scoped to a chain
const router = createRouter(CHAIN_IDS.PULSECHAIN);

// Read current SDK protocol fee (bps)
console.log(getProtocolFeeBps()); // "28"

// Find best path + get tradeInfo in one call
const tradeInfo = await router.getTradeInfo(
    "1000000000000000000", // 1 token (18 decimals)
    "0xTokenInAddress",
    "0xTokenOutAddress",
    3,   // maxSteps (1–4, recommend 3)
    200  // slippage in basis points (200 = 2%)
);

// Build swap calldata
const calldata = router.getSwapCalldata(tradeInfo, "0xYourWalletAddress");

// Send with ethers.js
const tx = await signer.sendTransaction({
    to:    calldata.to,
    data:  calldata.data,
    value: calldata.value,
});
```

---

## createRouter(chainId, provider?)

The main entry point. Returns a router instance bound to a specific chain.

```javascript
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk-beta");

// Uses the chain's default public RPC
const router = createRouter(CHAIN_IDS.ARBITRUM);

// Custom RPC URL
const router = createRouter(CHAIN_IDS.BSC, "https://my-bsc-node.com");

// Existing ethers.js provider
const router = createRouter(CHAIN_IDS.POLYGON, myProvider);
```

## createAffiliateRouter(chainId, integratorId, provider?)

Affiliate / integrator entry point. Returns a router bound to a single `integratorId`, and all router swap calldata methods encode the affiliate router ABI variant automatically.

```javascript
const { createAffiliateRouter, CHAIN_IDS } = require("empx-swap-sdk-beta");

const affiliateRouter = createAffiliateRouter(
    CHAIN_IDS.BASE,
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);

const tradeInfo = await affiliateRouter.getTradeInfo(
    "1000000000000000000",
    "0xTokenIn",
    "0xTokenOut"
);

const calldata = affiliateRouter.getSwapCalldata(tradeInfo, "0xRecipient");
```

`integratorId` must be a `bytes32` hex string. The SDK validates it at router creation time and throws if it is invalid.

## Registration Process

To register as an integrator and obtain your `integratorId`, contact the EmpX team with the following details:

- Protocol Name: name of your project
- Contact Details: email, Discord, X (Twitter), Telegram, and website

Registration contacts:

- Telegram: `t.me/EmpXEmpseal`
- X (Twitter): `@EmpXio`

> **Note:** Affiliate support is currently available only on **PulseChain**, **Sonic**, **Base**, and **Monad**.



### CHAIN_IDS

```javascript
CHAIN_IDS.PULSECHAIN  // 369
CHAIN_IDS.BSC         // 56
CHAIN_IDS.ARBITRUM    // 42161
CHAIN_IDS.BASE        // 8453
CHAIN_IDS.POLYGON     // 137
CHAIN_IDS.AVALANCHE   // 43114
CHAIN_IDS.OPTIMISM    // 10
CHAIN_IDS.MONAD       // 143
CHAIN_IDS.SONIC       // 146
CHAIN_IDS.SEI         // 1329
CHAIN_IDS.BERACHAIN   // 80094
CHAIN_IDS.ROOTSTOCK   // 30
CHAIN_IDS.ETHW        // 10001
CHAIN_IDS.HYPEREVM    // 999
```

### Protocol Fee (Read-Only)

Protocol fee is managed inside the SDK and applied automatically during trade building and calldata generation.

```javascript
const { getProtocolFeeBps } = require("empx-swap-sdk-beta");

console.log(getProtocolFeeBps()); // "28"
```

---

## Path Finding

### router.findBestPath(amountIn, tokenIn, tokenOut, maxSteps?)

Queries the on-chain router for the best single swap path.

```javascript
const result = await router.findBestPath(
    "1000000000000000000", // amountIn (raw, 18 decimals = 1 token)
    "0xTokenIn",
    "0xTokenOut",
    3 // maxSteps: 1–4
);

// result:
// {
//   amounts:  ["1000000000000000000", "980000000000000000"],
//   path:     ["0xTokenIn", "0xTokenOut"],
//   adapters: ["0xAdapterAddress"]
// }
```

Use `router.chain.NATIVE_ADDRESS` (`0x000...000`) for native currency (PLS, ETH, BNB, etc.):

```javascript
const result = await router.findBestPath(
    "1000000000000000000",
    router.chain.NATIVE_ADDRESS, // native in
    "0xTokenOut"
);
```

### router.getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps?, slippageBps?)

Finds best path and returns a `tradeInfo` object with slippage already applied — ready to pass directly into calldata builders.

```javascript
const tradeInfo = await router.getTradeInfo(
    "1000000000000000000",
    "0xTokenIn",
    "0xTokenOut",
    3,   // maxSteps (default: 3)
    200  // slippageBps (default: 200 = 2%)
);

// tradeInfo:
// {
//   amountIn:  "1000000000000000000",
//   amountOut: "960400000000000000",  // amountOut after 2% slippage buffer
//   fee:       "28",
//   amounts:   [...], // amounts[0] is fee-adjusted input used for routing
//   path:      [...],
//   adapters:  [...]
// }
```

---

## Calldata Builders

All calldata functions return `{ to, data, value }` — pass directly to `signer.sendTransaction()`.

### ERC-20 → ERC-20

```javascript
// Step 1: approve router to spend tokenIn
const approval = router.getApprovalCalldata("0xTokenIn");
await signer.sendTransaction(approval);

// Step 2: swap
const tradeInfo = await router.getTradeInfo(amountIn, "0xTokenIn", "0xTokenOut");
const calldata  = router.getSwapCalldata(tradeInfo, "0xRecipient");
await signer.sendTransaction(calldata);
```

### Native → ERC-20

```javascript
const tradeInfo = await router.getTradeInfo(
    amountIn,
    router.chain.NATIVE_ADDRESS,
    "0xTokenOut"
);
const calldata = router.getSwapFromNativeCalldata(tradeInfo, "0xRecipient");

// calldata.value contains the ETH/BNB/PLS to attach
await signer.sendTransaction(calldata);
```

### ERC-20 → Native

```javascript
// Approve first
await signer.sendTransaction(router.getApprovalCalldata("0xTokenIn"));

const tradeInfo = await router.getTradeInfo(
    amountIn,
    "0xTokenIn",
    router.chain.NATIVE_ADDRESS
);
const calldata = router.getSwapToNativeCalldata(tradeInfo, "0xRecipient");
await signer.sendTransaction(calldata);
```

### Auto-swap (recommended)

Detects native/wrapped/native-ERC20 cases automatically and returns the right calldata type:

```javascript
const { tradeInfo, calldata, swapType } = await router.swap(
    amountIn,
    tokenIn,
    tokenOut,
    "0xRecipient",
    3,    // maxSteps
    200   // slippageBps
);

console.log(swapType); // "WrapNative" | "UnwrapNative" | "ERC20ToERC20" | "NativeToERC20" | "ERC20ToNative"
await signer.sendTransaction(calldata);
```

### Wrap / Unwrap

```javascript
// Wrap: PLS → WPLS, ETH → WETH, etc.
const wrapCalldata = router.getWrapCalldata({ amountIn: "1000000000000000000" });
await signer.sendTransaction(wrapCalldata);

// Unwrap: WPLS → PLS, WETH → ETH, etc.
const unwrapCalldata = router.getUnwrapCalldata({ amountIn: "1000000000000000000" });
await signer.sendTransaction(unwrapCalldata);
```

### Approval

```javascript
// Unlimited approval (default)
const calldata = router.getApprovalCalldata("0xTokenAddress");

// Exact amount approval
const calldata = router.getApprovalCalldata("0xTokenAddress", tradeInfo.amountIn);

await signer.sendTransaction(calldata);
```

---

## USD Price Quotes

### router.getTokenPriceUSD(tokenAddress, maxSteps?)

Returns the USD price per 1 full unit of a token.

```javascript
const price = await router.getTokenPriceUSD(router.chain.WRAPPED_NATIVE);
console.log(`WETH: $${price}`); // e.g. "WETH: $3240.50"
```

### router.getQuoteUSD(tokenAddress, rawAmount, maxSteps?)

Returns the USD value of a raw token amount.

```javascript
const quote = await router.getQuoteUSD(
    "0xTokenAddress",
    "5000000000000000000" // 5 tokens (18 decimals)
);

// quote:
// {
//   usd:           16202.5,
//   pricePerToken: 3240.5,
//   decimals:      18,
//   humanAmount:   5
// }
```

### router.getMultipleTokenPricesUSD(tokenAddresses, maxSteps?)

Fetches prices for multiple tokens in parallel.

```javascript
const prices = await router.getMultipleTokenPricesUSD([
    "0xTokenA",
    "0xTokenB",
    router.chain.WRAPPED_NATIVE,
]);

// prices:
// {
//   "0xTokenA": 1.23,
//   "0xTokenB": 0.0045,
//   "0xWrappedNative": 3240.50
// }
```

---

## Token Helpers

```javascript
const decimals = await router.getTokenDecimals("0xTokenAddress"); // e.g. 6
const symbol   = await router.getTokenSymbol("0xTokenAddress");   // e.g. "USDC"
```

---

## Chain Config

Each router exposes its full chain config at `router.chain`:

```javascript
const router = createRouter(CHAIN_IDS.ARBITRUM);

router.chain.chainId          // 42161
router.chain.name             // "Arbitrum"
router.chain.ROUTER_ADDRESS   // "0x..."
router.chain.NATIVE_ADDRESS   // "0x000...000"
router.chain.WRAPPED_NATIVE   // "0x82aF..." (WETH on Arbitrum)
router.chain.USD_STABLE       // "0xaf88..." (USDC on Arbitrum)
router.chain.STABLE_TOKENS    // [...] stable references
router.chain.TRUSTED_TOKENS   // [...] routing tokens
```

You can also access chain configs directly:

```javascript
const { getChainConfig, getAllChains, getSupportedChainIds } = require("empx-swap-sdk-beta");

getChainConfig(369);       // PulseChain config object
getAllChains();            // All supported chain configs
getSupportedChainIds();    // All supported chain IDs
```

---

## Full Example: Multi-chain Price Dashboard

```javascript
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk-beta");

async function getPricesAcrossChains(tokensByChain) {
    const results = await Promise.allSettled(
        Object.entries(tokensByChain).map(async ([chainId, tokens]) => {
            const router = createRouter(Number(chainId));
            const prices = await router.getMultipleTokenPricesUSD(tokens);
            return { chain: router.chain.name, prices };
        })
    );

    return results
        .filter(r => r.status === "fulfilled")
        .map(r => r.value);
}

const prices = await getPricesAcrossChains({
    [CHAIN_IDS.ARBITRUM]: ["0xWETH", "0xUSDC"],
    [CHAIN_IDS.BSC]:      ["0xWBNB", "0xBUSD"],
    [CHAIN_IDS.POLYGON]:  ["0xWMATIC"],
});
```

---

## Full Example: Execute a Swap with ethers.js

```javascript
const { ethers } = require("ethers");
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk-beta");

const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const router = createRouter(CHAIN_IDS.ARBITRUM, provider);

async function executeSwap(tokenIn, tokenOut, amountIn, slippageBps = 200) {
    // 1. Get USD value of what we're swapping
    const quote = await router.getQuoteUSD(tokenIn, amountIn);
    console.log(`Swapping ~$${quote.usd} of ${await router.getTokenSymbol(tokenIn)}`);

    // 2. Approve router (skip if tokenIn is native)
    const isNative = tokenIn === router.chain.NATIVE_ADDRESS;
    if (!isNative) {
        const approval = router.getApprovalCalldata(tokenIn, amountIn);
        const approveTx = await signer.sendTransaction(approval);
        await approveTx.wait();
        console.log("Approved:", approveTx.hash);
    }

    // 3. Build and send swap
    const { calldata, swapType } = await router.swap(
        amountIn, tokenIn, tokenOut, signer.address, 3, slippageBps
    );
    console.log("Swap type:", swapType);

    const swapTx = await signer.sendTransaction(calldata);
    await swapTx.wait();
    console.log("Swap successful:", swapTx.hash);
}

executeSwap(
    router.chain.NATIVE_ADDRESS,              // ETH in
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC out
    "500000000000000000"                          // 0.5 ETH
);
```

---

## Structured Errors

All errors thrown by the SDK use `EmpxError` with a machine-readable `code` and `retryable` flag.

```javascript
const { EmpxError, ERROR_CODES } = require("empx-swap-sdk-beta");

try {
    await router.getTradeInfo(amountIn, tokenIn, tokenOut);
} catch (err) {
    if (err instanceof EmpxError) {
        console.log(err.code);      // e.g. "SLIPPAGE_TOO_HIGH"
        console.log(err.retryable); // true = agent may retry, false = fix the input
        console.log(err.toJSON());
        // { error: { code: "SLIPPAGE_TOO_HIGH", message: "...", retryable: false, context: {...} } }
    }
}
```

### Error Code Reference

| Code | Retryable | Description |
|------|-----------|-------------|
| `INVALID_INPUT` | No | Missing or malformed parameter |
| `INVALID_ADDRESS` | No | tokenIn/tokenOut is not a valid EVM address |
| `INVALID_AMOUNT` | No | amountIn is zero or not a valid integer |
| `SLIPPAGE_TOO_HIGH` | No | slippageBps exceeds 1000 (10%) |
| `STEPS_OUT_OF_RANGE` | No | maxSteps must be 1–4 |
| `AMOUNT_TOO_SMALL` | No | amountIn too small after protocol fee |
| `NO_ROUTE_FOUND` | **Yes** | No swap path found (may be transient RPC) |
| `QUOTE_EXPIRED` | **Yes** | tradeInfo.validUntil has passed — re-fetch |

---

## Retry & Rate-Limit Guidance

- **`NO_ROUTE_FOUND` and `QUOTE_EXPIRED`** are marked `retryable: true` — agents should re-call after a short delay.
- **All other errors** are `retryable: false` — fix the input, don't loop.
- **Recommended backoff**: 500ms → 1s → 2s (exponential, max 3 retries for retryable errors).
- **RPC rate limits**: Use a private/dedicated RPC endpoint for production agents. Public RPCs may throttle rapidly-retried calls.
- **Quote TTL**: Re-fetch `getTradeInfo()` every 30 seconds at most. Stale quotes will throw `QUOTE_EXPIRED`.
- **Parallelism**: `getMultipleTokenPricesUSD()` is already batched in parallel — prefer it over calling `getTokenPriceUSD()` in a loop.

---

## Testing

```sh
node tests/testPathFind.js   # path finding + calldata
node tests/testQuote.js      # USD price quotes
node tests/testNoSplit.js    # no-split swap behavior
node tests/testCalldataTx.js # calldata + optional real tx
```

---

## License

MIT
