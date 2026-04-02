# empx-sdk

Multi-chain DEX router package. Finds optimal no-split swap paths, builds transaction calldata, and returns USD price quotes from a single unified API.

## AI Automation Integration

Use this SDK in deterministic agent/automation flows:

1. Create router once per chain: `createRouter(chainId, providerOrRpc)`.
2. Build trade deterministically: `getTradeInfo(...)` (set explicit `maxSteps`, `slippageBps`).
3. Build calldata only: `swap(...)` or specific calldata builders.
4. Execute externally in your signer/runtime.

Recommended machine-output payload shape:

```json
{
  "chainId": 143,
  "swapType": "ERC20ToERC20",
  "tradeInfo": { "amountIn": "...", "amountOut": "...", "fee": "28" },
  "calldata": { "to": "0x...", "data": "0x...", "value": "0" }
}
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

---

## Installation

```sh
npm install empx-sdk
```

---

## Quick Start

```javascript
const { createRouter, CHAIN_IDS, getProtocolFeeBps } = require("empx-sdk");

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
const { createRouter, CHAIN_IDS } = require("empx-sdk");

// Uses the chain's default public RPC
const router = createRouter(CHAIN_IDS.ARBITRUM);

// Custom RPC URL
const router = createRouter(CHAIN_IDS.BSC, "https://my-bsc-node.com");

// Existing ethers.js provider
const router = createRouter(CHAIN_IDS.POLYGON, myProvider);
```

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
```

### Protocol Fee (Read-Only)

Protocol fee is managed inside the SDK and applied automatically during trade building and calldata generation.

```javascript
const { getProtocolFeeBps } = require("empx-sdk");

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
const { getChainConfig, getAllChains, getSupportedChainIds } = require("empx-sdk");

getChainConfig(369);       // PulseChain config object
getAllChains();            // All supported chain configs
getSupportedChainIds();    // All supported chain IDs
```

---

## Full Example: Multi-chain Price Dashboard

```javascript
const { createRouter, CHAIN_IDS } = require("empx-sdk");

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
const { createRouter, CHAIN_IDS } = require("empx-sdk");

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
