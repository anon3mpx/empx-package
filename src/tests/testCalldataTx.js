// ─── Test: calldata + optional real transaction ──────────────────────────────
// Builds calldata by default. Sends real tx only when EXECUTE_TX=true.
//
// Usage:
//   node tests/testCalldataTx.js
//
// Optional env vars:
//   TARGET_CHAIN_ID="8453"               # default Base (8453)
//   RPC_URL="https://mainnet.base.org"   # optional custom RPC
//   TOKEN_IN="0x..."
//   TOKEN_OUT="0x..."
//   AMOUNT_IN_RAW="1000000"
//   RECIPIENT="0x..."
//   MAX_STEPS="3"
//   SLIPPAGE_BPS="200"
//   PROTOCOL_FEE_BPS="28"
//   EXECUTE_TX="false"
//   PRIVATE_KEY="0x..."
//   AUTO_APPROVE="false"

const fs = require("fs");
const path = require("path");
const { ethers, isAddress } = require("ethers");
const { createRouter, CHAIN_IDS } = require("..");

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const eqIndex = line.indexOf("=");
        if (eqIndex <= 0) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] == null) {
            process.env[key] = value;
        }
    }
}

// Load .env from repo root and package root (src/.env). src/.env overrides root .env.
loadEnvFile(path.resolve(__dirname, "../../.env"));
loadEnvFile(path.resolve(__dirname, "../.env"));

const TEST_CONFIG = {
    TOKEN_IN:         process.env.TOKEN_IN         || "0xTokenInAddressHere",
    TOKEN_OUT:        process.env.TOKEN_OUT        || "0xTokenOutAddressHere",
    AMOUNT_IN_RAW:    process.env.AMOUNT_IN_RAW    || "1000000",
    RECIPIENT:        process.env.RECIPIENT        || "0xRecipientAddressHere",
    MAX_STEPS:        Number(process.env.MAX_STEPS || 3),
    SLIPPAGE_BPS:     Number(process.env.SLIPPAGE_BPS || 200),
    PROTOCOL_FEE_BPS: process.env.PROTOCOL_FEE_BPS || "28",
};

const TARGET_CHAIN_ID = Number(process.env.TARGET_CHAIN_ID || CHAIN_IDS.BASE);
const CUSTOM_RPC_URL = process.env.RPC_URL || process.env.BASE_RPC_URL;
const EXECUTE_TX = parseBool(process.env.EXECUTE_TX, false);
const AUTO_APPROVE = parseBool(process.env.AUTO_APPROVE, false);
const PRIVATE_KEY = process.env.PRIVATE_KEY;

function parseBool(value, defaultValue) {
    if (value == null) return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function assertConfigured(config) {
    const required = [
        ["TOKEN_IN", config.TOKEN_IN],
        ["TOKEN_OUT", config.TOKEN_OUT],
        ["RECIPIENT", config.RECIPIENT],
        ["AMOUNT_IN_RAW", config.AMOUNT_IN_RAW],
    ];

    for (const [name, value] of required) {
        if (!value || String(value).includes("Here")) {
            throw new Error(`Set ${name} in file or env before running.`);
        }
    }

    if (!isAddress(config.TOKEN_IN)) throw new Error(`Invalid TOKEN_IN: ${config.TOKEN_IN}`);
    if (!isAddress(config.TOKEN_OUT)) throw new Error(`Invalid TOKEN_OUT: ${config.TOKEN_OUT}`);
    if (!isAddress(config.RECIPIENT)) throw new Error(`Invalid RECIPIENT: ${config.RECIPIENT}`);
}

async function main() {
    assertConfigured(TEST_CONFIG);

    const router = createRouter(TARGET_CHAIN_ID, CUSTOM_RPC_URL);
    const tokenIn = TEST_CONFIG.TOKEN_IN;
    const tokenOut = TEST_CONFIG.TOKEN_OUT;
    const amountIn = TEST_CONFIG.AMOUNT_IN_RAW;
    const recipient = TEST_CONFIG.RECIPIENT;

    const isNativeIn = tokenIn.toLowerCase() === router.chain.NATIVE_ADDRESS.toLowerCase();
    const isNativeOut = tokenOut.toLowerCase() === router.chain.NATIVE_ADDRESS.toLowerCase();

    console.log("\n=== Calldata TX Test ===");
    console.log("Chain:", router.chain.name, `(${router.chain.chainId})`);
    console.log("Router:", router.chain.ROUTER_ADDRESS);
    console.log("TokenIn:", tokenIn);
    console.log("TokenOut:", tokenOut);
    console.log("AmountIn(raw):", amountIn);
    console.log("Recipient:", recipient);
    console.log("Execute tx:", EXECUTE_TX);

    const tradeInfo = await router.getTradeInfo(
        amountIn,
        tokenIn,
        tokenOut,
        TEST_CONFIG.MAX_STEPS,
        TEST_CONFIG.SLIPPAGE_BPS,
        TEST_CONFIG.PROTOCOL_FEE_BPS
    );

    let calldata;
    let swapType;

    if (isNativeIn && !isNativeOut) {
        calldata = router.getSwapFromNativeCalldata(tradeInfo, recipient);
        swapType = "NativeToERC20";
    } else if (!isNativeIn && isNativeOut) {
        calldata = router.getSwapToNativeCalldata(tradeInfo, recipient);
        swapType = "ERC20ToNative";
    } else {
        calldata = router.getSwapCalldata(tradeInfo, recipient);
        swapType = "ERC20ToERC20";
    }

    console.log("SwapType:", swapType);
    console.log("TradeInfo:", JSON.stringify(tradeInfo, null, 2));
    console.log("Calldata:", JSON.stringify(calldata, null, 2));

    if (!EXECUTE_TX) {
        console.log("\nDry run complete. Set EXECUTE_TX=true to broadcast.");
        return;
    }

    if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY is required when EXECUTE_TX=true");
    }
    const wallet = new ethers.Wallet(PRIVATE_KEY, router.provider);
    console.log("Sender:", wallet.address);

    if (!isNativeIn) {
        let allowance = await router.checkAllowance(tokenIn, wallet.address, tradeInfo.amountIn);
        console.log("Allowance:", allowance.allowance, "Approved:", allowance.approved);

        if (!allowance.approved) {
            if (!AUTO_APPROVE) {
                throw new Error("Allowance is insufficient. Re-run with AUTO_APPROVE=true to send approval.");
            }

            const approvalTxData = router.getApprovalCalldata(tokenIn);
            console.log("Sending approval tx...");
            const approvalTx = await wallet.sendTransaction({
                to: approvalTxData.to,
                data: approvalTxData.data,
                value: BigInt(approvalTxData.value),
            });
            console.log("Approval hash:", approvalTx.hash);
            await approvalTx.wait();
            console.log("Approval confirmed.");

            allowance = await router.checkAllowance(tokenIn, wallet.address, tradeInfo.amountIn);
            console.log("Post-approval allowance:", allowance.allowance, "Approved:", allowance.approved);
        }
    }

    console.log("Sending swap tx...");
    const swapTx = await wallet.sendTransaction({
        to: calldata.to,
        data: calldata.data,
        value: BigInt(calldata.value),
    });
    console.log("Swap hash:", swapTx.hash);
    const receipt = await swapTx.wait();
    console.log("Swap confirmed. Status:", receipt.status, "Block:", receipt.blockNumber);
}

main().catch((err) => {
    console.error("Base calldata test failed:", err.message);
    process.exitCode = 1;
});
