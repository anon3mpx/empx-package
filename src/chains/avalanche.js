// ─── Avalanche C-Chain (Chain ID: 43114) ──────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 43114,
  name: "Avalanche",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },

  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",

  ROUTER_ADDRESS: "0xf4e53aAe1D9f27851B03842007D0a8a023317cD2",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX

  USD_STABLE: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC on Avalanche
  USD_STABLE_DECIMALS: 6,


  STABLE_TOKENS: [
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
    "0x00000000efe302beaa2b3e6e1b18d08d69a9012a", // AUSD
  ],

  TRUSTED_TOKENS: [
    "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
    "0x152b9d0fdc40c096757f570a51e494bd4b943e50",
    "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
    "0xcd94a87696fac69edae3a70fe5725307ae1c43f6",
    "0x00000000efe302beaa2b3e6e1b18d08d69a9012a",
  ],

  ADAPTERS: [
    "0x7F76c13d61AB4F9F7902c255A52a1Dae6c434afB",
    "0xbBB3F1c913343CA3D1aB0Fc346fbF09dd1e2f681",
    "0xD4F0A5a29cCe8a1cdbadbf8D6c328640Ab984F1D",
    "0x95bbb8985062F2c02D077f0F8F788b7CAa2c2f08",
    "0xC827913F0556a74BF9589d7ba7434cfE1Be2a62b",
    "0x62698059A5305C7f31Cd28A28AC035568C858b9f",
    "0x1c2BDa495534a45469D08F35d68D95D5132EC5Ac",
    "0x79313D4e44615250A0fA41cdA0CFc3A45d3561Be",
    "0x686c652d079A370eC97F93B2b4805Ee06aE25d04",
    "0xae0aF43cf60640C1b08CCDE447F231Af02770C88",
  ],
};
