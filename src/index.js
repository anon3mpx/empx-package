// ─── empx-sdk ─────────────────────────────────────────────────────────────────
// Multi-chain DEX router: PulseChain, BSC, Arbitrum, Base, Polygon, Avalanche, Optimism

const { createRouter } = require("./router");
const {
    getChainConfig: getChainConfigInternal,
    getAllChains: getAllChainsInternal,
    getSupportedChainIds,
    CHAINS,
} = require("./chains");
const { BASE_ROUTER_ABI, PLS_ROUTER_ABI, ETH_ROUTER_ABI, ERC20_ABI } = require("./core/abi");
const { getProtocolFeeBps } = require("./core/protocolFee");

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

    // ── ABIs (for integrators who need raw contract access) ───────────────────
    // BASE_ROUTER_ABI  — shared functions present on every chain
    // PLS_ROUTER_ABI   — PulseChain: includes swapNoSplitFromPLS / swapNoSplitToPLS
    // ETH_ROUTER_ABI   — all other chains: includes swapNoSplitFromETH / swapNoSplitToETH
    BASE_ROUTER_ABI,
    PLS_ROUTER_ABI,
    ETH_ROUTER_ABI,
    ERC20_ABI,
};
