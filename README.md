# empx-swap-sdk

TypeScript-native multi-chain DEX swap SDK for EVM chains. It finds swap paths,
builds transaction calldata, returns USD price quotes, supports affiliate routing,
and exposes schema-friendly helpers for AI agent workflows.

## Install

```sh
npm install empx-swap-sdk
```

## Package Entrypoints

```javascript
const sdk = require("empx-swap-sdk");
const wallet = require("empx-swap-sdk/wallet");
const agent = require("empx-swap-sdk/agent");
```

The package ships CommonJS output with TypeScript declarations.

## Quick Start

```javascript
const { createRouter, CHAIN_IDS, getProtocolFeeBps } = require("empx-swap-sdk");

const router = createRouter(CHAIN_IDS.ARBITRUM);

console.log(getProtocolFeeBps()); // "28"

const tradeInfo = await router.getTradeInfo(
  "1000000000000000000",
  "0xTokenIn",
  "0xTokenOut",
  3,
  200
);

const calldata = router.getSwapCalldata(tradeInfo, "0xRecipient");

// Give calldata to a wallet, backend signer, or transaction orchestration layer.
console.log(calldata);
```

## Core Flow

1. Create a router for one chain with `createRouter(chainId, provider?, config?)`.
2. Call `getTradeInfo()` to fetch a route, quote metadata, and slippage-adjusted output.
3. For ERC-20 input tokens, call `checkAllowance()` and build approval calldata if needed.
4. Build swap calldata with `getSwapCalldata()`, `getSwapFromNativeCalldata()`,
   `getSwapToNativeCalldata()`, or `swap()`.
5. Submit the returned `{ to, data, value }` through your own wallet or signer.

Quotes expire after 30 seconds. Check `tradeInfo.validUntil > Date.now()` before
building calldata, and refetch if the quote is stale.

## Supported Chains

| Chain | Chain ID | Native Token |
| --- | ---: | --- |
| PulseChain | 369 | PLS |
| BSC | 56 | BNB |
| Arbitrum | 42161 | ETH |
| Base | 8453 | ETH |
| Polygon | 137 | POL |
| Avalanche | 43114 | AVAX |
| Optimism | 10 | ETH |
| Monad | 143 | MON |
| Sonic | 146 | S |
| Sei | 1329 | SEI |
| Berachain | 80094 | BERA |
| Rootstock | 30 | RBTC |
| EthPOW | 10001 | ETHW |
| HyperEVM | 999 | HYPE |

## API Reference

### createRouter(chainId, provider?, config?)

Returns a router instance bound to one chain.

```javascript
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk");

const defaultRouter = createRouter(CHAIN_IDS.ARBITRUM);
const rpcRouter = createRouter(CHAIN_IDS.BASE, "https://mainnet.base.org");
const providerRouter = createRouter(CHAIN_IDS.POLYGON, ethersProvider);
const signerRouter = createRouter(CHAIN_IDS.BSC, ethersSigner);

const fallbackRouter = createRouter(CHAIN_IDS.ARBITRUM, [
  "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "https://arb1.arbitrum.io/rpc",
  "https://arbitrum.llamarpc.com",
]);
```

`provider` may be an RPC URL, an RPC URL array, an ethers provider, or an ethers
signer. RPC URL arrays use an ethers `FallbackProvider` with `quorum: 1`,
ordered priority, and a short stall timeout.

### createRouters(chainIds, config?)

Creates routers for an explicit chain list and returns a record keyed by chain ID.

```javascript
const { createRouters, CHAIN_IDS } = require("empx-swap-sdk");

const routers = createRouters([
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
  CHAIN_IDS.BSC,
]);

const routersWithProviders = createRouters([
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.BASE,
], {
  providers: {
    [CHAIN_IDS.ARBITRUM]: [
      "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
      "https://arb1.arbitrum.io/rpc",
    ],
    [CHAIN_IDS.BASE]: "https://mainnet.base.org",
  },
});
```

Use `providers` for batch usage because RPC URLs are usually chain-specific.
Batch validation rejects empty chain lists, duplicate chain IDs, invalid chain IDs,
provider overrides outside the requested chain list, and empty RPC fallback arrays.

### getAllChainRouters(config?)

Convenience wrapper around `createRouters(getSupportedChainIds(), config)`.

```javascript
const { getAllChainRouters } = require("empx-swap-sdk");

const routers = getAllChainRouters();
```

Use `getAllChainRouters()` only when the workflow truly needs every supported
chain. Prefer `createRouters()` for known subsets.

### createAffiliateRouter(chainId, integratorId, provider?)

Creates a router that encodes the on-chain affiliate router ABI variant for every
swap calldata call.

```javascript
const { createAffiliateRouter, CHAIN_IDS } = require("empx-swap-sdk");

const router = createAffiliateRouter(
  CHAIN_IDS.BASE,
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);
```

`integratorId` must be a `bytes32` hex string. Affiliate support is currently
available on PulseChain, Sonic, Base, and Monad.

To register as an integrator, contact EmpX with your protocol name and contact
details.

- Telegram: `t.me/EmpXEmpseal`
- X: `@EmpXio`

## Router Methods

### Path Finding

```javascript
const result = await router.findBestPath(
  "1000000000000000000",
  "0xTokenIn",
  "0xTokenOut",
  3
);
```

Use `router.chain.NATIVE_ADDRESS` for native input or output tokens.

### Trade Info

```javascript
const tradeInfo = await router.getTradeInfo(
  "1000000000000000000",
  "0xTokenIn",
  "0xTokenOut",
  3,
  200
);
```

`tradeInfo` includes `amountIn`, `amountOut`, `fee`, `amounts`, `path`,
`adapters`, `quoteId`, `validUntil`, and `sdkVersion`.

### Allowance and Approval

```javascript
const allowance = await router.checkAllowance(
  "0xTokenIn",
  "0xOwner",
  tradeInfo.amountIn
);

if (!allowance.approved) {
  const approval = router.getApprovalCalldata("0xTokenIn", tradeInfo.amountIn);
  console.log(approval);
}
```

`getApprovalCalldata(tokenAddress)` builds unlimited approval calldata.
`getApprovalCalldata(tokenAddress, amount)` builds exact-amount approval calldata.

### Swap Calldata

```javascript
const erc20ToErc20 = router.getSwapCalldata(tradeInfo, "0xRecipient");
const nativeToErc20 = router.getSwapFromNativeCalldata(tradeInfo, "0xRecipient");
const erc20ToNative = router.getSwapToNativeCalldata(tradeInfo, "0xRecipient");
```

`swap()` fetches trade info and selects the correct calldata builder:

```javascript
const { tradeInfo, calldata, swapType } = await router.swap(
  amountIn,
  tokenIn,
  tokenOut,
  "0xRecipient",
  3,
  200
);
```

`swapType` is one of `WrapNative`, `UnwrapNative`, `ERC20ToERC20`,
`NativeToERC20`, or `ERC20ToNative`.

### Wrap and Unwrap

```javascript
const wrap = router.getWrapCalldata({ amountIn: "1000000000000000000" });
const unwrap = router.getUnwrapCalldata({ amountIn: "1000000000000000000" });
```

### USD Quotes

```javascript
const price = await router.getTokenPriceUSD(router.chain.WRAPPED_NATIVE);

const quote = await router.getQuoteUSD(
  "0xTokenAddress",
  "5000000000000000000"
);

const prices = await router.getMultipleTokenPricesUSD([
  "0xTokenA",
  "0xTokenB",
  router.chain.WRAPPED_NATIVE,
]);
```

### Token Helpers

```javascript
const decimals = await router.getTokenDecimals("0xTokenAddress");
const symbol = await router.getTokenSymbol("0xTokenAddress");
```

### Affiliate Earnings

```javascript
const earning = await router.estimateAffiliateEarning(
  "0xTokenIn",
  "1000000000000000000"
);
```

## Chain Helpers

```javascript
const {
  CHAIN_IDS,
  CHAINS,
  getChainConfig,
  getAllChains,
  getSupportedChainIds,
} = require("empx-swap-sdk");

const chain = getChainConfig(CHAIN_IDS.ARBITRUM);
const chains = getAllChains();
const chainIds = getSupportedChainIds();
```

Each router also exposes `router.chain`, including `chainId`, `name`,
`ROUTER_ADDRESS`, `NATIVE_ADDRESS`, `WRAPPED_NATIVE`, `USD_STABLE`,
`STABLE_TOKENS`, and `TRUSTED_TOKENS`.

## AI Agent Integration

The SDK is designed for deterministic, schema-defined, side-effect-controlled
agent workflows. Agents should build calldata and return it to a signer unless
the application explicitly grants transaction authority.

### Standard Agent Swap Workflow

1. Call `router.getTradeInfo(...)`.
2. If the input token is an ERC-20, call `router.checkAllowance(...)`.
3. If approval is needed, call `router.getApprovalCalldata(...)` and return the
   approval calldata to the signer.
4. Check `tradeInfo.validUntil > Date.now()`.
5. Call `router.getSwapCalldata(...)` or `router.swap(...)`.
6. Return calldata to the wallet, user, or signer.

Recommended agent response shape:

```json
{
  "chainId": 42161,
  "swapType": "ERC20ToERC20",
  "tradeInfo": {
    "amountIn": "1000000000000000000",
    "amountOut": "960400000000000000",
    "fee": "28",
    "quoteId": "a3f2c1d4-...",
    "validUntil": 1712345678000,
    "sdkVersion": "2.0.0"
  },
  "calldata": {
    "to": "0x...",
    "data": "0x...",
    "value": "0"
  }
}
```

### Tool Schemas

```javascript
const {
  TOOL_SCHEMAS,
  getOpenAITools,
  getClaudeTools,
  getLangChainSchemas,
} = require("empx-swap-sdk");

const openAiTools = getOpenAITools();
const claudeTools = getClaudeTools();
const langChainSchemas = getLangChainSchemas();

console.log(TOOL_SCHEMAS.getTradeInfo);
console.log(TOOL_SCHEMAS.createRouters);
console.log(TOOL_SCHEMAS.getAllChainRouters);
```

Use `createRouters()` for agent workflows that inspect a known set of networks.
Use `getAllChainRouters()` only for broad discovery or full network scans.

## Wallet Helpers

```javascript
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk");
const {
  createBurnerWallet,
  fromPrivateKey,
  fromMnemonic,
  readOnly,
  describeWallet,
  getNativeBalance,
} = require("empx-swap-sdk/wallet");

const wallet = createBurnerWallet({ rpcUrl: "https://arb1.arbitrum.io/rpc" });
const router = createRouter(CHAIN_IDS.ARBITRUM, wallet.signer);
```

Browser wallet helpers are also exported: `connectMetaMask`, `connectRabby`,
`connectInjected`, `connectPrivy`, and `connectWagmi`.

## x402 RPC Provider

```javascript
const {
  createRouter,
  CHAIN_IDS,
  createX402Provider,
  PRESET_X402_ENDPOINTS,
} = require("empx-swap-sdk");

const provider = createX402Provider({
  endpoint: PRESET_X402_ENDPOINTS.QUICKNODE,
  paymentSigner,
});

const router = createRouter(CHAIN_IDS.BASE, provider);
```

Use x402 when your RPC provider requires signed payment headers.

## Advanced Fees

```javascript
const {
  getProtocolFeeBps,
  setProtocolFeeBps,
  makeAffiliateConfig,
  classifyAffiliateTier,
  enablePairTypeFees,
  disablePairTypeFees,
} = require("empx-swap-sdk");
```

Protocol fee and affiliate helpers are exported for integrations that need
explicit fee reporting or tier classification. Pair-type fees are opt-in.

## Split Routing

Split routing helpers are exported as additive advanced APIs:

```javascript
const {
  findBestSplitRouting,
  buildSplitMultiSwapCalldata,
  buildSplitAggregateTradeInfo,
} = require("empx-swap-sdk");
```

Use the standard router methods for ordinary no-split swaps. Use split routing
only when your integration explicitly wants multi-leg route construction.

## Full Example: Execute With ethers.js

This example is for wallet or backend signer integrations. Agent-only workflows
should return calldata instead of sending transactions directly.

```javascript
const { ethers } = require("ethers");
const { createRouter, CHAIN_IDS } = require("empx-swap-sdk");

const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const router = createRouter(CHAIN_IDS.ARBITRUM, provider);

async function executeSwap(tokenIn, tokenOut, amountIn, recipient) {
  const isNative = tokenIn === router.chain.NATIVE_ADDRESS;

  if (!isNative) {
    const allowance = await router.checkAllowance(tokenIn, signer.address, amountIn);
    if (!allowance.approved) {
      const approval = router.getApprovalCalldata(tokenIn, amountIn);
      const approveTx = await signer.sendTransaction(approval);
      await approveTx.wait();
    }
  }

  const { calldata } = await router.swap(
    amountIn,
    tokenIn,
    tokenOut,
    recipient,
    3,
    200
  );

  const swapTx = await signer.sendTransaction(calldata);
  return swapTx.wait();
}
```

## Structured Errors

All SDK errors use `EmpxError` with a machine-readable `code`, `retryable` flag,
and optional context.

```javascript
const { EmpxError } = require("empx-swap-sdk");

try {
  await router.getTradeInfo(amountIn, tokenIn, tokenOut);
} catch (err) {
  if (err instanceof EmpxError) {
    console.log(err.code);
    console.log(err.retryable);
    console.log(err.toJSON());
  }
}
```

| Code | Retryable | Meaning |
| --- | --- | --- |
| `INVALID_INPUT` | No | Missing or malformed parameter |
| `INVALID_ADDRESS` | No | Invalid EVM address |
| `INVALID_AMOUNT` | No | Zero or invalid integer amount |
| `SLIPPAGE_TOO_HIGH` | No | Slippage exceeds 1000 bps |
| `STEPS_OUT_OF_RANGE` | No | `maxSteps` must be 1 through 4 |
| `AMOUNT_TOO_SMALL` | No | Input too small after protocol fee |
| `NO_ROUTE_FOUND` | Yes | No route found, possibly transient RPC state |
| `QUOTE_EXPIRED` | Yes | Quote TTL elapsed and trade info must be refetched |

## Retry and Rate Limits

- Retry only errors with `retryable: true`.
- Use short exponential backoff such as 500 ms, 1 s, then 2 s.
- Cap retries to avoid loops.
- Use private or dedicated RPC endpoints for production agents.
- Prefer `getMultipleTokenPricesUSD()` over calling `getTokenPriceUSD()` in a loop.

## Testing

```sh
npm test               # Smoke test, no RPC
npm run test:fast      # Smoke + unit tests, no RPC
npm run test:unit      # Unit tests only
npm run test:pathfind  # Pathfinding and quotes across selected chains
npm run test:affiliate # Affiliate model tests
npm run test:split     # Split routing tests
npm run test:all       # Full suite, requires RPC access
```

## License

MIT
