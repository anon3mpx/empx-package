// ─── Test: findBestPath with gasEstimate ──────────────────────────────────────
// No-split router behavior checks.
// node tests/testNoSplit.js

const { createRouter, CHAIN_IDS } = require("..");

async function main() {
    // ── PulseChain: large trade, check gasEstimate is returned ────────────────
    console.log("\n=== PulseChain: findBestPath with gasEstimate ===");
    const pulse = createRouter(CHAIN_IDS.PULSECHAIN);

    const largeAmount = "1000000000000000000000"; // 1000 PLSX
    const tokenIn     = "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab"; // PLSX
    const tokenOut    = "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07"; // DAI

    try {
        const path = await pulse.findBestPath(largeAmount, tokenIn, tokenOut);
        console.log("amounts:",     path.amounts);
        console.log("path:",        path.path);
        console.log("adapters:",    path.adapters);
        console.log("gasEstimate:", path.gasEstimate);
    } catch (err) {
        console.error("PulseChain gasEstimate test failed:", err.message);
    }

    // ── getTradeInfo: gasEstimate should be preserved after slippage ──────────
    console.log("\n=== PulseChain: getTradeInfo preserves gasEstimate ===");
    try {
        const tradeInfo = await pulse.getTradeInfo(largeAmount, tokenIn, tokenOut, 3, 200);
        console.log("amountIn:   ", tradeInfo.amountIn);
        console.log("amountOut:  ", tradeInfo.amountOut, "(slippage adjusted)");
        console.log("gasEstimate:", tradeInfo.gasEstimate);
    } catch (err) {
        console.error("getTradeInfo test failed:", err.message);
    }

    // ── Polygon: checkAllowance ───────────────────────────────────────────────
    console.log("\n=== Polygon: checkAllowance ===");
    const poly = createRouter(CHAIN_IDS.POLYGON);

    try {
        const result = await poly.checkAllowance(
            "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
            "0x0000000000000000000000000000000000000001", // dummy address (zero allowance)
            "1000000" // 1 USDT
        );
        console.log("approved:", result.approved);   // expect false
        console.log("allowance:", result.allowance); // expect "0"
    } catch (err) {
        console.error("checkAllowance test failed:", err.message);
    }
}

main();
