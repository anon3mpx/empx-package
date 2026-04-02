// ─── Berachain (Chain ID: 80094) ──────────────────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 80094,
  name: "Berachain",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "Berachain", symbol: "BERA", decimals: 18 },

  rpcUrl: "https://berachain.drpc.org",

  ROUTER_ADDRESS: "0x365Ac3b1aB01e34339E3Ff1d94934bFEcB7933e0",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0x6969696969696969696969696969696969696969",

  // Price feed: stable reference token (used for USD quotes)
  USD_STABLE: "0x549943e04f40284185054145c6e4e9568c1d3241", // USDC.e on Berachain
  USD_STABLE_DECIMALS: 6,

  STABLE_TOKENS: [
    "0x549943e04f40284185054145c6e4e9568c1d3241", // usdc.e
  ],

  TRUSTED_TOKENS: [
    "0x6969696969696969696969696969696969696969",
    "0xfcbd14dc51f0a4d49d5e53c2e0950e0bc26d0dce",
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
    "0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590",
    "0x549943e04f40284185054145c6e4e9568c1d3241",
    "0xac03caba51e17c86c921e1f6cbfbdc91f8bb2e6b",
  ],

  ADAPTERS: [
    "0xcD05Ae7369e14D0Fd232F0D3C025D9703B779d80",
    "0x2F21FF788e14A531847E6658aFBD725555757da5",
    "0xc1Bb27E7AE8af9164Cb6B5D3A465478415EdEbB7",
    "0x6cE282F748514Df878C396d3d1a024BD5Bb26871",
    "0xce032ac88ad11E6f8374B3760F5a98a77c6584f0",
  ],
};
