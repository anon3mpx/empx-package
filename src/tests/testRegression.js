// ─── Regression tests for precision and UUID compatibility ───────────────────
// node tests/testRegression.js

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { createRouter, CHAIN_IDS } = require("..");

function formatUnitsString(raw, decimals) {
    let value = BigInt(raw).toString();
    if (decimals === 0) return value;

    value = value.padStart(decimals + 1, "0");
    const whole = value.slice(0, -decimals);
    const fraction = value.slice(-decimals).replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole;
}

function loadQuotesWithMocks({ tokenDecimals, stableDecimals, priceRawOut }) {
    const modulePath = path.resolve(__dirname, "../core/quotes.js");
    const originalLoad = Module._load;

    class FakeContract {
        async decimals() {
            return tokenDecimals;
        }

        async symbol() {
            return "MOCK";
        }
    }

    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename === modulePath) {
            if (request === "ethers") {
                return {
                    ethers: { Contract: FakeContract },
                    formatUnits: formatUnitsString,
                };
            }
            if (request === "./pathfinder") {
                return {
                    findBestPath: async () => ({
                        amounts: ["0", priceRawOut],
                        path: ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"],
                        adapters: [],
                        gasEstimate: "0",
                    }),
                };
            }
            if (request === "./abi") {
                return { ERC20_ABI: [] };
            }
        }

        return originalLoad(request, parent, isMain);
    };

    delete require.cache[modulePath];

    const restore = () => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    };

    try {
        const quotes = require(modulePath);
        return { quotes, restore, stableDecimals };
    } catch (error) {
        restore();
        throw error;
    }
}

async function testGetTokenPriceUsdPreservesScaledPrecision() {
    const { quotes, restore, stableDecimals } = loadQuotesWithMocks({
        tokenDecimals: 18,
        stableDecimals: 15,
        priceRawOut: "846542479938781012",
    });

    try {
        const price = await quotes.getTokenPriceUSD(
            {},
            {
                chainId: 999,
                NATIVE_ADDRESS: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                USD_STABLE: "0x3333333333333333333333333333333333333333",
                USD_STABLE_DECIMALS: stableDecimals,
                nativeCurrency: { decimals: 18, symbol: "ETH" },
            },
            "0x1111111111111111111111111111111111111111",
            3
        );

        assert.equal(price, 846.542479938781);
    } finally {
        restore();
    }
}

async function testGetQuoteUsdUsesExactDecimalMath() {
    const { quotes, restore, stableDecimals } = loadQuotesWithMocks({
        tokenDecimals: 18,
        stableDecimals: 15,
        priceRawOut: "88273156129469000",
    });

    try {
        const quote = await quotes.getQuoteUSD(
            {},
            {
                chainId: 999,
                NATIVE_ADDRESS: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                USD_STABLE: "0x3333333333333333333333333333333333333333",
                USD_STABLE_DECIMALS: stableDecimals,
                nativeCurrency: { decimals: 18, symbol: "ETH" },
            },
            "0x1111111111111111111111111111111111111111",
            "6704914192741561254907745",
            3
        );

        assert.equal(quote.pricePerToken, 88.273156);
        assert.equal(quote.usd, 591863937.370568);
    } finally {
        restore();
    }
}

async function testSwapFallsBackWithoutCryptoRandomUuid() {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    try {
        Object.defineProperty(globalThis, "crypto", {
            value: undefined,
            configurable: true,
            writable: true,
        });

        const router = createRouter(CHAIN_IDS.BSC);
        const result = await router.swap(
            "1000",
            router.chain.NATIVE_ADDRESS,
            router.chain.WRAPPED_NATIVE,
            "0x4444444444444444444444444444444444444444"
        );

        assert.match(
            result.tradeInfo.quoteId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    } finally {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    }
}

async function main() {
    await testGetTokenPriceUsdPreservesScaledPrecision();
    await testGetQuoteUsdUsesExactDecimalMath();
    await testSwapFallsBackWithoutCryptoRandomUuid();
    console.log("Regression tests passed.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
