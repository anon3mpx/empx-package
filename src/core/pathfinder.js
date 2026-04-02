// ─── Pathfinder ───────────────────────────────────────────────────────────────
// Queries the on-chain router for optimal swap paths.
//
// Uses chainConfig.routerAbi so the correct chain-specific ABI is always used.
// No global ABI import — this module is intentionally chain-agnostic.

const { ethers } = require("ethers");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Replaces NATIVE_ADDRESS with WRAPPED_NATIVE for path-finding.
 * The router resolves wrapped tokens internally; native address is only
 * meaningful at the swap execution layer.
 */
function resolveToken(address, chainConfig) {
    return address.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase()
        ? chainConfig.WRAPPED_NATIVE
        : address;
}

/**
 * Validates that maxSteps is within the allowed range [1, 4].
 */
function validateMaxSteps(maxSteps) {
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 4) {
        throw new Error(`maxSteps must be an integer between 1 and 4. Received: ${maxSteps}`);
    }
}

// ─── findBestPath ─────────────────────────────────────────────────────────────

/**
 * Finds the best swap path for a given token pair and amount.
 * Calls the on-chain router's findBestPath view function.
 *
 * @param {ethers.Provider} provider
 * @param {object}          chainConfig           - Must include routerAbi, ROUTER_ADDRESS, NATIVE_ADDRESS, WRAPPED_NATIVE
 * @param {string|bigint}   amountIn              - Raw amount in smallest units
 * @param {string}          tokenIn               - Token address (use NATIVE_ADDRESS for native)
 * @param {string}          tokenOut              - Token address (use NATIVE_ADDRESS for native)
 * @param {number}          [maxSteps=3]          - Max hops: 1–4
 * @returns {Promise<{
 *   amounts:     string[],   // amount at each hop, index 0 = amountIn, last = amountOut
 *   path:        string[],   // token addresses along the route
 *   adapters:    string[],   // DEX adapter used at each hop
 *   gasEstimate: string      // estimated gas for this route
 * }>}
 */
async function findBestPath(provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps = 3) {
    validateMaxSteps(maxSteps);

    if (!chainConfig.routerAbi) {
        throw new Error(`chainConfig for ${chainConfig.name} is missing routerAbi`);
    }

    const resolvedIn  = resolveToken(tokenIn,  chainConfig);
    const resolvedOut = resolveToken(tokenOut, chainConfig);
    const amount      = BigInt(amountIn);

    const router = new ethers.Contract(
        chainConfig.ROUTER_ADDRESS,
        chainConfig.routerAbi,   // ← chain-specific ABI, not a global import
        provider
    );

    try {
        const result = await router.findBestPath(amount, resolvedIn, resolvedOut, maxSteps);

        // FormattedOffer: { amounts, adapters, path, gasEstimate }
        return {
            amounts:     result.amounts.map(a => a.toString()),
            path:        [...result.path],
            adapters:    [...result.adapters],
            gasEstimate: result.gasEstimate.toString(),
        };
    } catch (err) {
        throw new Error(`findBestPath failed on ${chainConfig.name}: ${err.message}`);
    }
}

module.exports = { findBestPath };