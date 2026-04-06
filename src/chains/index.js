// ─── Chain Registry ───────────────────────────────────────────────────────────
// Maps chainId → chain config. Add new chains here.

const CHAINS = {
    369:   require("./pulsechain"),
    56:    require("./bsc"),
    42161: require("./arbitrum"),
    8453:  require("./base"),
    137:   require("./polygon"),
    43114: require("./avalanche"),
    10:    require("./optimism"),
    143:   require("./monad"),
    146:   require("./sonic"),
    1329:  require("./sei"),
    80094: require("./berachain"),
    30:    require("./rootstock"),
    999:   require("./hyperevm"),
    10001: require("./ethw"),
};

/**
 * Retrieves chain config by chainId.
 * @param {number} chainId
 * @returns {object}
 */
function getChainConfig(chainId) {
    const config = CHAINS[chainId];
    if (!config) {
        const supported = Object.keys(CHAINS).join(", ");
        throw new Error(`Unsupported chainId: ${chainId}. Supported chains: ${supported}`);
    }
    return config;
}

/**
 * Returns all supported chain configs.
 * @returns {object[]}
 */
function getAllChains() {
    return Object.values(CHAINS);
}

/**
 * Returns all supported chainIds.
 * @returns {number[]}
 */
function getSupportedChainIds() {
    return Object.keys(CHAINS).map(Number);
}

module.exports = { getChainConfig, getAllChains, getSupportedChainIds, CHAINS };
