// ─── Affiliate chain overrides ───────────────────────────────────────────────
// Some affiliate-enabled chains route through a different router contract than
// the default SDK chain config. This module applies those overrides without
// changing the base chain registry.

const AFFILIATE_CHAIN_OVERRIDES = {
    369: {
        ROUTER_ADDRESS: "0x35D3dfC2Be97761b2D56ACb84B4Fc465b960fC47",
    },
    146: {
        ROUTER_ADDRESS: "0x0B53D47f69AAF1Ed56b7Dc9AA24f26e7AA37d261",
    },
    8453: {
        ROUTER_ADDRESS: "0x5A86AB81254e3D0Fc3b417a3409aF2180029cDfb",
    },
    143: {
        ROUTER_ADDRESS: "0x86B1b88B2BBFe49999fA9A415270997ed1Bfd803",
    },
};

function applyAffiliateChainOverrides(chainConfig) {
    const overrides = AFFILIATE_CHAIN_OVERRIDES[chainConfig.chainId];
    if (!overrides) return chainConfig;

    return {
        ...chainConfig,
        ...overrides,
    };
}

module.exports = {
    AFFILIATE_CHAIN_OVERRIDES,
    applyAffiliateChainOverrides,
};
