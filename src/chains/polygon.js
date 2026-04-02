// ─── Polygon (Chain ID: 137) ──────────────────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 137,
  name: "Polygon",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },

  rpcUrl: "https://polygon.drpc.org",

  ROUTER_ADDRESS: "0x165C3410fC91EF562C50559f7d2289fEbed552d9",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC

  // Price feed: stable reference token (used for USD quotes)
  USD_STABLE: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  USD_STABLE_DECIMALS: 6,

  // Known stablecoins for pathfinding (includes USD_STABLE)
  STABLE_TOKENS: [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC.e
  ],

  TRUSTED_TOKENS: [
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
  ],

  ADAPTERS: [
    "0x050c6C2555c2d54AbA01420FBc02fF0F1d10E8dF",
    "0xDb403792c55bFE26beaeF235986D4F106E40Ee6F",
    "0xC92551f405F5741b6BC98f8FAd5E488923C4b063",
    "0x227fD8AAf5e86a96881e2CCE3393F53247537b34",
    "0x845Cd50644A9592de43BCAC0212656480744AAcA",
    "0xFE4D69f3fb00AEd81003212904BEa55487daeff0",
    "0x0bBB52AC247943d70F75EDD21DFA864652Db2e04",
    "0x6AeC9Ab81A6D66Cae61B1F11c9A5c3d06020bfCB",
  ],
};
