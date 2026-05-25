// ─── Test: findBestPath ───────────────────────────────────────────────────────
// node tests/testPathFind.js

const { createRouter, getAllChains, getChainConfig, CHAIN_IDS } = require("..");

async function main() {
    // ── PulseChain: PLSX → DAI ────────────────────────────────────────────────
    console.log("\n=== PulseChain: PLSX → DAI ===");
    const pulse = createRouter(CHAIN_IDS.PULSECHAIN);

    const amountIn  = "100000000000000000000000"; // 1 PLSX (18 decimals)
    const tokenIn   = "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab"; // PLSX
    const tokenOut  = "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07"; // DAI

    try {
        const path = await pulse.findBestPath(amountIn, tokenIn, tokenOut);
        console.log("Path result:", JSON.stringify(path, null, 2));

        const tradeInfo = await pulse.getTradeInfo(amountIn, tokenIn, tokenOut, 3, 200);
        console.log("TradeInfo (2% slippage):", JSON.stringify(tradeInfo, null, 2));
    } catch (err) {
        console.error("PulseChain test failed:", err.message);
    }

    // ── BSC: Native BNB → USDT ────────────────────────────────────────────────
    console.log("\n=== BSC: Native BNB → USDT ===");
    const bsc = createRouter(CHAIN_IDS.BSC);

    try {
        const result = await bsc.swap(
            "1000000000000000000", // 1 BNB
            bsc.chain.NATIVE_ADDRESS,
            "0x55d398326f99059ff775485246999027b3197955", // USDT
            "", // recipient
        );
        console.log("Swap type:", result.swapType);
        console.log("TradeInfo:", JSON.stringify(result.tradeInfo, null, 2));
        console.log("Calldata:", JSON.stringify(result.calldata, null, 2));
    } catch (err) {
        console.error("BSC test failed:", err.message);
    }

    console.log("\n Get all chains");
    const chains = getAllChains();
    console.log("Chains:", JSON.stringify(chains, null, 2));

    // console.log("\n Get chain config for BSC");
    // const bscConfig = getChainConfig(CHAIN_IDS.BSC);
    // console.log("BSC Config:", JSON.stringify(bscConfig, null, 2));
    
}

main();
