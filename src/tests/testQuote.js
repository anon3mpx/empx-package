// ─── Test: USD price quotes ───────────────────────────────────────────────────
// node tests/testQuote.js

const { createRouter, CHAIN_IDS } = require("..");

async function main() {
    // ── PulseChain: price of WPLS in USD ──────────────────────────────────────
    console.log("\n=== PulseChain: WPLS price in USD ===");
    const pulse = createRouter(CHAIN_IDS.PULSECHAIN);

    try {
        const price = await pulse.getTokenPriceUSD(pulse.chain.WRAPPED_NATIVE);
        console.log(`WPLS price: $${price}`);

        const quote = await pulse.getQuoteUSD(
            pulse.chain.WRAPPED_NATIVE,
            "5000000000000000000" // 5 WPLS
        );
        console.log("Quote for 5 WPLS:", quote);
    } catch (err) {
        console.error("PulseChain quote failed:", err.message);
    }

    // ── Arbitrum: price of WETH in USD ────────────────────────────────────────
    console.log("\n=== Arbitrum: WETH price in USD ===");
    const arb = createRouter(CHAIN_IDS.ARBITRUM);

    try {
        const price = await arb.getTokenPriceUSD(arb.chain.WRAPPED_NATIVE);
        console.log(`WETH price on Arbitrum: $${price}`);
    } catch (err) {
        console.error("Arbitrum quote failed:", err.message);
    }

    // ── BSC: multi-token price lookup ─────────────────────────────────────────
    console.log("\n=== BSC: multi-token prices ===");
    const bsc = createRouter(CHAIN_IDS.BSC);

    try {
        const prices = await bsc.getMultipleTokenPricesUSD(bsc.chain.TRUSTED_TOKENS);
        console.log("Token prices (USD):", prices);
    } catch (err) {
        console.error("BSC multi-price failed:", err.message);
    }
}

main();
