// ─── Price Quotes ─────────────────────────────────────────────────────────────
// Estimates USD value of tokens using on-chain path routing to a stable reference.

const { ethers } = require("ethers");
const { findBestPath } = require("./pathfinder");
const { ERC20_ABI } = require("./abi");

// Cache token decimals to avoid repeat RPC calls within a session
const _decimalsCache = new Map();

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
    const stableAddress = chainConfig.USD_STABLE;
    const stableDecimals = chainConfig.USD_STABLE_DECIMALS;

    // If the token IS the stable, price = $1.00
    if (tokenAddress.toLowerCase() === stableAddress.toLowerCase()) {
        return 1.0;
    }

    const tokenDecimals = await getTokenDecimals(provider, chainConfig, tokenAddress);
    const oneUnit = BigInt(10) ** BigInt(tokenDecimals); // 1 full token in raw units

    const path = await findBestPath(
        provider,
        chainConfig,
        oneUnit.toString(),
        tokenAddress,
        stableAddress,
        maxSteps
    );

    const rawOut = BigInt(path.amounts[path.amounts.length - 1]);
    const priceUSD = Number(rawOut) / 10 ** stableDecimals;

    return priceUSD;
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
    const pricePerToken = await getTokenPriceUSD(provider, chainConfig, tokenAddress, maxSteps);

    const humanAmount = Number(BigInt(rawAmount)) / 10 ** decimals;
    const usd = humanAmount * pricePerToken;

    return {
        usd: parseFloat(usd.toFixed(6)),
        pricePerToken: parseFloat(pricePerToken.toFixed(6)),
        decimals,
        humanAmount: parseFloat(humanAmount.toFixed(decimals)),
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
