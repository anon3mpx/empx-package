// ─── empx-swap-sdk-beta ─────────────────────────────────────────────────────────────────
// Multi-chain DEX router: PulseChain, BSC, Arbitrum, Base, Polygon, Avalanche,
// Optimism, Monad, Sonic, Sei, Berachain, Rootstock, HyperEVM, ETHW

const { createRouter } = require("./router");
const {
    getChainConfig: getChainConfigInternal,
    getAllChains: getAllChainsInternal,
    getSupportedChainIds,
    CHAINS,
} = require("./chains");
const { BASE_ROUTER_ABI, PLS_ROUTER_ABI, ETH_ROUTER_ABI, ERC20_ABI } = require("./core/abi");
const { getProtocolFeeBps } = require("./core/protocolFee");
const { EmpxError, ERROR_CODES }  = require("./core/errors");
const { TOOL_SCHEMAS } = require("./agent/schemas");

// ─── Chain ID constants (named exports for convenience) ───────────────────────
const CHAIN_IDS = {
    PULSECHAIN: 369,
    BSC:        56,
    ARBITRUM:   42161,
    BASE:       8453,
    POLYGON:    137,
    AVALANCHE:  43114,
    OPTIMISM:   10,
    MONAD:      143,
    SONIC:      146,
    SEI:        1329,
    BERACHAIN:   80094,
    ROOTSTOCK:   30,
    HYPEREVM:    999,
    ETHW:        10001,
};

/**
 * Returns a public chain object without embedding the full router ABI.
 * This keeps response payloads compact for app-level metadata calls.
 */
function stripRouterAbi(chainConfig) {
    const { routerAbi, ...chainInfo } = chainConfig;
    return chainInfo;
}

function getChainConfig(chainId) {
    return stripRouterAbi(getChainConfigInternal(chainId));
}

function getAllChains() {
    return getAllChainsInternal().map(stripRouterAbi);
}

module.exports = {
    // ── Primary API ───────────────────────────────────────────────────────────
    createRouter,

    // ── Chain registry ────────────────────────────────────────────────────────
    getChainConfig,
    getAllChains,
    getSupportedChainIds,
    CHAIN_IDS,
    CHAINS,
    getProtocolFeeBps,

    // ── Agent / AI compatibility ─────────────────────────────────────────────
    /** JSON Schema definitions for core SDK methods */
    TOOL_SCHEMAS,
    /** Structured error class — catch and call .toJSON() for machine-readable error payloads */
    EmpxError,
    /** Error codes for branching on specific failure types */
    ERROR_CODES,

    // ── ABIs (for integrators who need raw contract access) ───────────────────
    // BASE_ROUTER_ABI  — shared functions present on every chain
    // PLS_ROUTER_ABI   — PulseChain: includes swapNoSplitFromPLS / swapNoSplitToPLS
    // ETH_ROUTER_ABI   — all other chains: includes swapNoSplitFromETH / swapNoSplitToETH
    BASE_ROUTER_ABI,
    PLS_ROUTER_ABI,
    ETH_ROUTER_ABI,
    ERC20_ABI,
};
