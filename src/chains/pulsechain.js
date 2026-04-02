// ─── PulseChain (Chain ID: 369) ───────────────────────────────────────────────

const { PLS_ROUTER_ABI } = require("../core/abi");

module.exports = {
  chainId: 369,
  name: "PulseChain",

  // ABI variant for this chain's router contract
  routerAbi: PLS_ROUTER_ABI,

  // Chain-specific native swap function names
  nativeSwapFns: {
    fromNative: "swapNoSplitFromPLS", // payable: Native → ERC-20
    toNative: "swapNoSplitToPLS", // nonpayable: ERC-20 → Native
  },

  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },

  rpcUrl: "https://rpc.pulsechain.com",

  // Core contract addresses
  ROUTER_ADDRESS: "0x0Cf6D948Cf09ac83a6bf40C7AD7b44657A9F2A52",
  NATIVE_ADDRESS: "0x0000000000000000000000000000000000000000",
  WRAPPED_NATIVE: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27", // WPLS

  // Price feed: stable reference token (used for USD quotes)
  USD_STABLE: "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", // USDC on PulseChain
  USD_STABLE_DECIMALS: 6,

  // Known stablecoins for pathfinding (includes USD_STABLE)
  STABLE_TOKENS: [
    "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07",
    "0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f",
    "0xefd766ccb38eaf1dfd701853bfce31359239f305",
  ],

  // Known high-liquidity tokens for multi-hop path building
  TRUSTED_TOKENS: [
    "0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C",
    "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab",
    "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39",
    "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    "0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d",
    "0x7901a3569679AEc3501dbeC59399F327854a70fe",
    "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07",
    "0xefD766cCb38EaF1dfd701853BFCe31359239F305",
    "0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f",
    "0x57fde0a71132198BBeC939B98976993d8D89D225",
    "0x40b49a9e5B8E3CC137E9CA57A5F4382D1B3dF6FE",
    "0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719",
    "0xb17D901469B9208B17d916112988A3FeD19b5cA1",
    "0x8Da17Db850315A34532108f0f5458fc0401525f6",
    "0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC",
    "0x9663c2d75ffd5F4017310405fCe61720aF45B829",
    "0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F",
    "0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11",
  ],

  // Adapter whitelist (DEXs on PulseChain)
  ADAPTERS: [
    "0x842e05D2cAF940B25d7B7Db291ABDc88748d7F90",
    "0xb6a9140DaeBE265708785B093C0Ef561eEf26159",
    "0x0F1cffE422EF2C85f5983Fb0B015c781BAb8A74f",
    "0x34FD3c37c2A40e925744e102d2Cae83635CC64C3",
    "0xa5ab0aF6eE886770B31Fb9350f7FC8F433dC2C59",
    "0xf586000c24e2b640a0478dcf51de856df5e3328a",
    "0xcfE09D7f35131DAfebD12356C4f52b17f65Da2E5",
    "0x8fb6314678a9287f9B47B96e54122444e43dDE1F",
    "0x0f5416Efd26E2EbFAB6DdCcD58859B6cfD7Df556",
    "0x5fdd3f245ae060953dcC3C89Da8Dd4c6c26629c0",
  ],
};
