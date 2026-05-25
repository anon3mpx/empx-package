// ─── Price Quotes ─────────────────────────────────────────────────────────────
// Estimates USD value of tokens using on-chain path routing to a stable reference.

const { ethers, formatUnits } = require("ethers");
const { findBestPath } = require("./pathfinder");
const { ERC20_ABI } = require("./abi");

// Cache token decimals to avoid repeat RPC calls within a session
const _decimalsCache = new Map();

function rawToDecimalString(raw, decimals) {
    return formatUnits(BigInt(raw), Number(decimals));
}

function parseDecimal(value) {
    const [whole, fraction = ""] = String(value).split(".");
    return {
        digits: BigInt(`${whole}${fraction}`),
        scale: fraction.length,
    };
}

function formatRoundedDecimal(digits, scale) {
    const negative = digits < 0n;
    const unsigned = negative ? -digits : digits;
    const value = unsigned.toString().padStart(scale + 1, "0");
    const whole = value.slice(0, -scale) || "0";
    const fraction = scale > 0 ? value.slice(-scale) : "";
    return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function roundDecimalString(value, targetScale) {
    const parsed = parseDecimal(value);
    if (parsed.scale <= targetScale) {
        return formatRoundedDecimal(
            parsed.digits * (10n ** BigInt(targetScale - parsed.scale)),
            targetScale
        );
    }

    const divisor = 10n ** BigInt(parsed.scale - targetScale);
    const quotient = parsed.digits / divisor;
    const remainder = parsed.digits % divisor;
    const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
    return formatRoundedDecimal(rounded, targetScale);
}

function decimalStringToNumber(value) {
    return Number(value);
}

function roundedDecimalToNumber(value, targetScale) {
    return decimalStringToNumber(roundDecimalString(value, targetScale));
}

function multiplyDecimalStrings(a, b, targetScale) {
    const left = parseDecimal(a);
    const right = parseDecimal(b);
    const product = left.digits * right.digits;
    return roundDecimalString(
        formatRoundedDecimal(product, left.scale + right.scale),
        targetScale
    );
}

async function getTokenPriceUSDExact(provider, chainConfig, tokenAddress, maxSteps = 3) {
    const stableAddress = chainConfig.USD_STABLE;
    const stableDecimals = chainConfig.USD_STABLE_DECIMALS;

    if (tokenAddress.toLowerCase() === stableAddress.toLowerCase()) {
        return "1";
    }

    const tokenDecimals = await getTokenDecimals(provider, chainConfig, tokenAddress);
    const oneUnit = BigInt(10) ** BigInt(tokenDecimals);

    const path = await findBestPath(
        provider,
        chainConfig,
        oneUnit.toString(),
        tokenAddress,
        stableAddress,
        maxSteps
    );

    return rawToDecimalString(path.amounts[path.amounts.length - 1], stableDecimals);
}

/**
 * Fetches decimals for a given token address.
 * Returns 18 for native currency.
 */
async function getTokenDecimals(provider, chainConfig, tokenAddress) {
    if (tokenAddress.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()) {
        return chainConfig.nativeCurrency.decimals;
    }

    const cacheKey = `${chainConfig.chainId}:${tokenAddress.toLowerCase()}`;
    if (_decimalsCache.has(cacheKey)) return _decimalsCache.get(cacheKey);

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await contract.decimals();
    _decimalsCache.set(cacheKey, Number(decimals));
    return Number(decimals);
}

/**
 * Fetches symbol for a given token address.
 * Returns native symbol for native currency.
 */
async function getTokenSymbol(provider, chainConfig, tokenAddress) {
    if (tokenAddress.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()) {
        return chainConfig.nativeCurrency.symbol;
    }
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return contract.symbol();
}

/**
 * Returns the USD price of 1 unit of tokenAddress on the given chain,
 * denominated using the chain's USD_STABLE reference.
 *
 * @param {ethers.Provider} provider
 * @param {object}          chainConfig
 * @param {string}          tokenAddress - Token to price (or NATIVE_ADDRESS)
 * @param {number}          [maxSteps=3]
 * @returns {Promise<number>} USD price per full token unit
 */
async function getTokenPriceUSD(provider, chainConfig, tokenAddress, maxSteps = 3) {
    const priceUSD = await getTokenPriceUSDExact(provider, chainConfig, tokenAddress, maxSteps);
    return decimalStringToNumber(priceUSD);
}

/**
 * Returns the USD value of a raw token amount.
 *
 * @param {ethers.Provider} provider
 * @param {object}          chainConfig
 * @param {string}          tokenAddress
 * @param {string|bigint}   rawAmount    - Amount in smallest units (wei, etc.)
 * @param {number}          [maxSteps=3]
 * @returns {Promise<{ usd: number, pricePerToken: number, decimals: number }>}
 */
async function getQuoteUSD(provider, chainConfig, tokenAddress, rawAmount, maxSteps = 3) {
    const decimals = await getTokenDecimals(provider, chainConfig, tokenAddress);
    const pricePerTokenExact = await getTokenPriceUSDExact(provider, chainConfig, tokenAddress, maxSteps);
    const humanAmountExact = rawToDecimalString(rawAmount, decimals);
    const usdExact = multiplyDecimalStrings(humanAmountExact, pricePerTokenExact, 6);

    return {
        usd: decimalStringToNumber(usdExact),
        pricePerToken: roundedDecimalToNumber(pricePerTokenExact, 6),
        decimals,
        humanAmount: roundedDecimalToNumber(humanAmountExact, Math.min(decimals, 18)),
    };
}

/**
 * Returns USD prices for multiple tokens in a single call (parallel queries).
 *
 * @param {ethers.Provider} provider
 * @param {object}          chainConfig
 * @param {string[]}        tokenAddresses
 * @param {number}          [maxSteps=3]
 * @returns {Promise<Record<string, number>>} map of address → USD price
 */
async function getMultipleTokenPricesUSD(provider, chainConfig, tokenAddresses, maxSteps = 3) {
    const entries = await Promise.allSettled(
        tokenAddresses.map(async addr => {
            const price = await getTokenPriceUSD(provider, chainConfig, addr, maxSteps);
            return [addr, price];
        })
    );

    return Object.fromEntries(
        entries
            .filter(r => r.status === "fulfilled")
            .map(r => r.value)
    );
}

module.exports = {
    getTokenPriceUSD,
    getQuoteUSD,
    getMultipleTokenPricesUSD,
    getTokenDecimals,
    getTokenSymbol,
};
