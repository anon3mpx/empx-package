// ─── Sei (Chain ID: 1329) ──────────────────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 1329,
  name: "Sei",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },

  rpcUrl: "https://evm-rpc.sei-apis.com",

  ROUTER_ADDRESS: "0xb0e99628d884b3f45a312BCFD7A2505Cd711b657",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7", // Wsei

  // Price feed: stable reference token (used for USD quotes)
  USD_STABLE: "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392", // USDC on Sei
  USD_STABLE_DECIMALS: 6,

  // Known stablecoins for pathfinding (includes USD_STABLE)
  STABLE_TOKENS: [
    "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392", // USDC
    "0xb75d0b03c06a926e488e2659df1a861f860bd3d1", // USDT
    "0x37a4dd9ced2b19cfe8fac251cd727b5787e45269", // fastusd
  ],

  TRUSTED_TOKENS: [
    "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392",
    "0xb75d0b03c06a926e488e2659df1a861f860bd3d1",
    "0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7",
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
    "0x160345fc359604fc6e70e3c5facbde5f7a9342d8",
    "0x37a4dd9ced2b19cfe8fac251cd727b5787e45269",
    "0x5f0e07dfee5832faa00c63f2d33a0d79150e8598",
  ],

  ADAPTERS: [
    "0x93ae3552B154431316F6160d07C3f7204b44f1cF",
    "0x1E965F231380986e11E989beEbe864Ae41881D69",
    "0xee4AB587A566675Afad2D5Cd7703096982cC1FE5",
    "0xEab30C23A015942BDc8204bD8dcA2780a5957a8c",
    "0xA285098184932DA9AAa8F8B4895B93FdeeeC07a2",
  ],
};
