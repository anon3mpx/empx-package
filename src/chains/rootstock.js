// ─── Rootstock (Chain ID: 30) ──────────────────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 30,
  name: "Rootstock",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "Rootstock", symbol: "rootstock", decimals: 18 },

  rpcUrl: "https://public-node.rsk.co",

  ROUTER_ADDRESS: "0x1fb42f76f101f8eb2ed7a12ac16b028500907f80",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0x542fda317318ebf1d3deaf76e0b632741a7e677d",

  // Price feed: stable reference token (used for USD quotes)
  USD_STABLE: "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0 on Rootstock
  USD_STABLE_DECIMALS: 6,

  // Known stablecoins for pathfinding (includes USD_STABLE)
  STABLE_TOKENS: [
    "0xef213441a85df4d7acbdae0cf78004e1e486bb96", // rUSDC
    "0x74c9f2b00581F1B11AA7ff05aa9F608B7389De67", // usdc.e
    "0xaf368c91793cb22739386dfcbbb2f1a9e4bcbebf", // USDT
    "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0
  ],

  TRUSTED_TOKENS: [
    "0x542fda317318ebf1d3deaf76e0b632741a7e677d",
    "0xaf368c91793cb22739386dfcbbb2f1a9e4bcbebf",
    "0x541fd749419ca806a8bc7da8ac23d346f2df8b77",
    "0xef213441a85df4d7acbdae0cf78004e1e486bb96",
  ],

  ADAPTERS: [
    "0xc14441CBD763FBad2Db823CCa77AFAdeCbcdd0c4",
    "0xe40c877e06095417557C3bB874F4e2e8D08f11Fd",
  ],
};
