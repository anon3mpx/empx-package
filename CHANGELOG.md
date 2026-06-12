# empx-swap-sdk — Changelog

All notable changes to this SDK are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **RPC fallback providers** — `createRouter()` now accepts ordered RPC URL arrays and builds an ethers `FallbackProvider` with `quorum: 1`.
- **Batch router factories** — added `createRouters()` for explicit multi-chain router creation and `getAllChainRouters()` for all supported chains.
- **Agent schema coverage** — added `TOOL_SCHEMAS.createRouters` and `TOOL_SCHEMAS.getAllChainRouters` for multi-chain agent workflows.

### Changed

- **Batch validation** — `createRouters()` now rejects empty chain lists, duplicate chain IDs, and provider override keys outside the requested chain set.
- **README examples** — documented RPC fallback, batch router usage, all-chain router usage, and multi-chain agent guidance.

---

## [2.0.0] — 2026-06-09

### Added

- **Dual affiliate model** — `createRouter()` now accepts both `integratorId` (on-chain bytes32 attribution via integrator router ABIs) and `affiliate` (off-chain revenue share via `AffiliateConfig`). Both can coexist. `createAffiliateRouter()` retained as a convenience wrapper.
- **Wallet connectivity module** — Agent wallets (`createBurnerWallet`, `fromPrivateKey`, `fromMnemonic`) and browser/human wallets (`connectMetaMask`, `connectRabby`, `connectInjected`, `connectPrivy`, `connectWagmi`) with `./wallet` sub-entry point.
- **x402 RPC adapter** — `createX402Provider` for HTTP 402 pay-per-call RPC with EIP-3009 USDC signing. Supports QuickNode, thirdweb, EmpX-managed, and self-hosted endpoints.
- **Split routing** — `findBestSplitRouting` off-chain solver + `buildSplitMultiSwapCalldata` for `EmpsealMulticallRouter.multiSwap()` execution.
- **Pair-type fee resolver** (`enablePairTypeFees`, `resolveTieredFeeBps`, `classifyPair`, `isStableToken`, `DEFAULT_PAIR_TYPE_FEES`). Production-locked rates: V/V=28bps, V/S=15bps, S/S=9bps. Auto-classifies from `chainConfig.STABLE_TOKENS`.
- **Affiliate share tier presets** (`makeAffiliateConfig`, `classifyAffiliateTier`, `AFFILIATE_TIER_BPS`, `AFFILIATE_TIER_LABEL`, `AFFILIATE_TIER_ELIGIBILITY`). Named tiers: STANDARD (10%), VOLUME_COMMITTED (25%), STRATEGIC (50%).
- **Enhanced agent schemas** — 14 tool schemas + OpenAI/Claude/LangChain formatters. Three entry points: `.` (full SDK), `./wallet` (wallet only), `./agent` (schemas only).
- **Chain config consolidated into JSON** — Single `all_chains.json` with 14 chains, auto-resolved ABIs via `usesPLS` flag.
- **Improved TradeInfo** — New fields: `affiliateFee`, `totalFeeBps`, `integratorId` (when applicable).
- **Comprehensive test suite** — 379 tests across 5 test files: smoke (149, no RPC), pathfind (100, 3 chains), affiliate (38, dual model), split (15, solver + calldata), unit (77).

### Changed

- **Language: TypeScript** — migrated from CommonJS JavaScript to TypeScript with `tsc` build step. CJS output maintained for backward compat.
- **Package name**: `empx-swap-sdk-beta` → `empx-swap-sdk`.
- **Build system**: `tsc` + `scripts/copy-assets.mjs` → `dist/`.
- **6 ABI variants exported**: `BASE_ROUTER_ABI`, `PLS_ROUTER_ABI`, `ETH_ROUTER_ABI`, `BASE_INTEGRATOR_ROUTER_ABI`, `PLS_INTEGRATOR_ROUTER_ABI`, `ETH_INTEGRATOR_ROUTER_ABI`, `ERC20_ABI`.
- **Fee system**: protocol fee management moved to `core/fees.ts` with `applyProtocolFee`, `calculateAffiliateAmount`, `affiliateAbsoluteBps`, `buildFeeBreakdown`.
- **EmpsealMulticallRouter.sol**: updated with full `IEmpsealRouter` interface (ETH + PLS swap variants) and `usesPLS` constructor flag for correct native swap dispatch per chain.

### Retained from v1.x

- `createAffiliateRouter()` — convenience wrapper for `createRouter()` with `integratorId`.
- All 6 ABI variants including integrator router ABIs.
- On-chain affiliate tracking via `_integratorId` (bytes32) in swap calldata.
- Affiliate chain overrides for PulseChain (369), Sonic (146), Base (8453), Monad (143).
- All 14 supported chains with full token registries.

---

## [1.0.2] (pre-merge, as empx-swap-sdk-beta)

Original multi-chain DEX router SDK with on-chain integrator tracking.
