// ─── Test: affiliate router on Monad ─────────────────────────────────────────
// node tests/testAffiliateRouter.js
//
// Optional env vars:
//   INTEGRATOR_ID="0x..."
//   RPC_URL="https://rpc.monad.xyz"
//   RECIPIENT="0x..."
//   ERC20_AMOUNT_IN_RAW="1000000000000000000"
//   NATIVE_AMOUNT_IN_RAW="1000000000000000000"

const { createAffiliateRouter, CHAIN_IDS } = require("..");

const TEST_CONFIG = {
    INTEGRATOR_ID: process.env.INTEGRATOR_ID
        || "",
    RPC_URL: process.env.RPC_URL || process.env.MONAD_RPC_URL,
    RECIPIENT: process.env.RECIPIENT || "",
    ERC20_AMOUNT_IN_RAW: process.env.ERC20_AMOUNT_IN_RAW || "8000000000000000000", // 1 WMON
    NATIVE_AMOUNT_IN_RAW: process.env.NATIVE_AMOUNT_IN_RAW || "8000000000000000000", // 1 MON
};

const MONAD_TOKENS = {
    WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    // USDC: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    GMON: "0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081",
    // WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
};

const AFFILIATE_MONAD_ROUTER = "0x86B1b88B2BBFe49999fA9A415270997ed1Bfd803";

async function main() {
    console.log("\n=== Monad: affiliate router integration ===");

    const router = createAffiliateRouter(
        CHAIN_IDS.MONAD,
        TEST_CONFIG.INTEGRATOR_ID,
        TEST_CONFIG.RPC_URL
    );

    console.log("Chain:", router.chain.name, `(${router.chain.chainId})`);
    console.log("Router:", router.chain.ROUTER_ADDRESS);
    console.log("Expected affiliate router:", AFFILIATE_MONAD_ROUTER);
    console.log("Recipient:", TEST_CONFIG.RECIPIENT);
    console.log("Integrator ID:", TEST_CONFIG.INTEGRATOR_ID);

    console.log("\n=== Monad: WMON -> USDC path ===");
    try {
        const path = await router.findBestPath(
            TEST_CONFIG.ERC20_AMOUNT_IN_RAW,
            MONAD_TOKENS.WMON,
            MONAD_TOKENS.GMON,
            3
        );
        console.log("Path result:", JSON.stringify(path, null, 2));

        const tradeInfo = await router.getTradeInfo(
            TEST_CONFIG.ERC20_AMOUNT_IN_RAW,
            MONAD_TOKENS.WMON,
            MONAD_TOKENS.GMON,
            3,
            50
        );
        console.log("TradeInfo:", JSON.stringify(tradeInfo, null, 2));

        const approval = router.getApprovalCalldata(MONAD_TOKENS.WMON);
        console.log("Approval calldata:", JSON.stringify(approval, null, 2));

        const calldata = router.getSwapCalldata(tradeInfo, TEST_CONFIG.RECIPIENT);
        console.log("Affiliate ERC20 swap calldata:", JSON.stringify(calldata, null, 2));
    } catch (err) {
        console.error("Monad ERC20 affiliate test failed:", err.message);
    }

    // console.log("\n=== Monad: native MON -> USDC swap ===");
    // try {
    //     const result = await router.swap(
    //         TEST_CONFIG.NATIVE_AMOUNT_IN_RAW,
    //         router.chain.NATIVE_ADDRESS,
    //         MONAD_TOKENS.GMON,
    //         TEST_CONFIG.RECIPIENT,
    //         3,
    //         200
    //     );
    //     console.log("Swap type:", result.swapType);
    //     console.log("TradeInfo:", JSON.stringify(result.tradeInfo, null, 2));
    //     console.log("Affiliate native swap calldata:", JSON.stringify(result.calldata, null, 2));
    // } catch (err) {
    //     console.error("Monad native affiliate test failed:", err.message);
    // }
}

main().catch((err) => {
    console.error("Affiliate router test failed:", err.message);
    process.exitCode = 1;
});
