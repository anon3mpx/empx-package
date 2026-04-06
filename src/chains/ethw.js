// ─── ETHW (Chain ID: 10001) ───────────────────────────────────────────

const { ETH_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 10001,
  name: "EthereumPOW",

  routerAbi: ETH_ROUTER_ABI,

  nativeSwapFns: {
    fromNative: "swapNoSplitFromETH",
    toNative: "swapNoSplitToETH",
  },

  nativeCurrency: { name: "EthereumPOW", symbol: "ETHW", decimals: 18 },

  rpcUrl: "https://ethw.public-rpc.com",

  ROUTER_ADDRESS: "0x4bF29b3D063BE84a8206fb65050DA3E21239Ff12",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0x7Bf88d2c0e32dE92CdaF2D43CcDc23e8Edfd5990", // WETH

  USD_STABLE: "0x25DE68ef588cb0c2c8F3537861E828Ae699CD0DB", // USDC
  USD_STABLE_DECIMALS: 6,

  STABLE_TOKENS: [
    "0x25DE68ef588cb0c2c8F3537861E828Ae699CD0DB", // USDC
    "0x6b175474e89094c44da98b954eedeac495271d0f", // USDT
  ],

  TRUSTED_TOKENS: [
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "0x7Bf88d2c0e32dE92CdaF2D43CcDc23e8Edfd5990",
    "0x2ab0e9e4ee70fff1fb9d67031e44f6410170d00e",
    "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
    "0x45804880de22913dafe09f4980848ece6ecbaf78",
  ],

  ADAPTERS: [
    "0x2f21ff788e14a531847e6658afbd725555757da5",
    "0xc14441CBD763FBad2Db823CCa77AFAdeCbcdd0c4",
    "0x1FB42F76F101F8EB2ed7a12aC16b028500907F80",
    "0xcd05ae7369e14d0fd232f0d3c025d9703b779d80",
  ],
};
