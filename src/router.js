// ─── Router Factory ───────────────────────────────────────────────────────────
// createRouter(chainId, providerOrRpc?) returns a fully-bound router instance.

const { ethers } = require("ethers");
const { getChainConfig } = require("./chains");
const { applyAffiliateChainOverrides } = require("./affiliate/chains");
const { findBestPath } = require("./core/pathfinder");
const { getProtocolFeeBps } = require("./core/protocolFee");
const {
    getSwapCalldata,
    getSwapFromNativeCalldata,
    getSwapToNativeCalldata,
    getAffiliateSwapCalldata,
    getAffiliateSwapFromNativeCalldata,
    getAffiliateSwapToNativeCalldata,
    getWrapCalldata,
    getUnwrapCalldata,
    getApprovalCalldata,
} = require("./core/calldata");
const {
    getTokenPriceUSD,
    getQuoteUSD,
    getMultipleTokenPricesUSD,
    getTokenDecimals,
    getTokenSymbol,
} = require("./core/quotes");
const { ERC20_ABI } = require("./core/abi");
const { EmpxError, ERROR_CODES } = require("./core/errors");
const {
    validateTradeParams,
    assertQuoteNotExpired,
} = require("./core/validators");

const SDK_VERSION = require("./package.json").version;

function safeRandomUUID() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        try {
            return globalThis.crypto.randomUUID();
        } catch {
            // Fall through to the local fallback if the runtime exposes
            // `crypto` but blocks `randomUUID()` in the current context.
        }
    }

    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Quote TTL ────────────────────────────────────────────────────────────────
const QUOTE_TTL_MS = 30_000; // 30 seconds

// ─── Affiliate validation ─────────────────────────────────────────────────────

function validateIntegratorId(integratorId) {
    if (typeof integratorId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(integratorId)) {
        throw new EmpxError(
            ERROR_CODES.INVALID_INPUT,
            `integratorId must be a bytes32 hex string, got: ${integratorId}`,
            false,
            { integratorId }
        );
    }

    return integratorId;
}

// ─── Shared router builder ────────────────────────────────────────────────────
// Used by both createRouter(...) and createAffiliateRouter(...).

function buildRouter(chainId, provider, integratorId) {
    const baseChainConfig = getChainConfig(chainId);
    const chainConfig = integratorId == null
        ? baseChainConfig
        : applyAffiliateChainOverrides(baseChainConfig);

    // ─── Resolve provider ─────────────────────────────────────────────────────
    let _provider;
    if (!provider) {
        _provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    } else if (typeof provider === "string") {
        _provider = new ethers.JsonRpcProvider(provider);
    } else {
        _provider = provider;
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function applyProtocolFee(amountIn, protocolFeeBps) {
        const amount = BigInt(amountIn);
        const fee = BigInt(protocolFeeBps);
        return (amount * (10000n - fee)) / 10000n;
    }

    function hasTokenCycle(path) {
        const seen = new Set();
        for (const token of path) {
            const normalized = token.toLowerCase();
            if (seen.has(normalized)) return true;
            seen.add(normalized);
        }
        return false;
    }

    async function findBestPathPreferAcyclic(amountIn, tokenIn, tokenOut, maxSteps) {
        try {
            const primary = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps);
            if (!hasTokenCycle(primary.path)) return primary;

            for (let steps = maxSteps - 1; steps >= 1; steps--) {
                try {
                    const candidate = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, steps);
                    if (!hasTokenCycle(candidate.path)) return candidate;
                } catch {
                    // Keep trying with fewer steps.
                }
            }

            return primary;
        } catch (err) {
            // Wrap RPC-level errors in structured EmpxError
            if (err instanceof EmpxError) throw err;
            throw new EmpxError(
                ERROR_CODES.NO_ROUTE_FOUND,
                err.message || "Failed to find a swap route",
                true,
                { tokenIn, tokenOut, maxSteps }
            );
        }
    }

    function buildTradeInfo(pathResult, slippageBps, protocolFeeBps, originalAmountIn) {
        const rawAmountOut = BigInt(pathResult.amounts[pathResult.amounts.length - 1]);
        const amountOut = (rawAmountOut * BigInt(10000 - slippageBps)) / 10000n;
        const now = Date.now();

        return {
            amountIn: originalAmountIn.toString(),
            amountOut: amountOut.toString(),
            fee: protocolFeeBps.toString(),
            amounts: pathResult.amounts,
            path: pathResult.path,
            adapters: pathResult.adapters,
            gasEstimate: pathResult.gasEstimate,
            // ── Idempotency / reproducibility ────────────────────────────────
            quoteId: safeRandomUUID(),
            timestamp: now,
            validUntil: now + QUOTE_TTL_MS,
            sdkVersion: SDK_VERSION,
        };
    }

    // Wrap / unwrap paths still produce synthetic tradeInfo payloads so callers
    // receive the same shape as routed swaps.
    function buildWrapTradeInfo(amountIn, path) {
        const now = Date.now();
        return {
            amountIn: amountIn.toString(),
            amountOut: amountIn.toString(),
            fee: "0",
            amounts: [amountIn.toString(), amountIn.toString()],
            path,
            adapters: [],
            gasEstimate: "0",
            quoteId: safeRandomUUID(),
            timestamp: now,
            validUntil: now + QUOTE_TTL_MS,
            sdkVersion: SDK_VERSION,
        };
    }

    async function checkAllowanceInternal(tokenAddress, ownerAddress, requiredAmount) {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, _provider);
        const allowance = await token.allowance(ownerAddress, chainConfig.ROUTER_ADDRESS);
        return {
            approved: allowance >= BigInt(requiredAmount),
            allowance: allowance.toString(),
        };
    }

    function buildSwapCalldata(tradeInfo, toAddress) {
        assertQuoteNotExpired(tradeInfo);
        return integratorId == null
            ? getSwapCalldata(tradeInfo, toAddress, chainConfig)
            : getAffiliateSwapCalldata(tradeInfo, toAddress, integratorId, chainConfig);
    }

    function buildSwapFromNativeCalldata(tradeInfo, toAddress) {
        assertQuoteNotExpired(tradeInfo);
        return integratorId == null
            ? getSwapFromNativeCalldata(tradeInfo, toAddress, chainConfig)
            : getAffiliateSwapFromNativeCalldata(tradeInfo, toAddress, integratorId, chainConfig);
    }

    function buildSwapToNativeCalldata(tradeInfo, toAddress) {
        assertQuoteNotExpired(tradeInfo);
        return integratorId == null
            ? getSwapToNativeCalldata(tradeInfo, toAddress, chainConfig)
            : getAffiliateSwapToNativeCalldata(tradeInfo, toAddress, integratorId, chainConfig);
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    const router = {
        // ── Metadata ──────────────────────────────────────────────────────────
        chain: chainConfig,
        provider: _provider,

        // ── Path finding ──────────────────────────────────────────────────────

        /**
         * Finds the best swap path for a token pair.
         * Returns raw path data including gasEstimate from the on-chain router.
         *
         * @param {string|bigint} amountIn
         * @param {string}        tokenIn    - Use chain.NATIVE_ADDRESS for native currency
         * @param {string}        tokenOut   - Use chain.NATIVE_ADDRESS for native currency
         * @param {number}        [maxSteps=3]
         * @returns {Promise<{ amounts: string[], path: string[], adapters: string[], gasEstimate: string }>}
         */
        findBestPath(amountIn, tokenIn, tokenOut, maxSteps = 3) {
            return findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps);
        },

        /**
         * Finds best path and returns a tradeInfo object with slippage applied.
         * Routing is computed using the fee-adjusted input amount and prefers
         * non-cyclic token paths when available.
         *
         * TradeInfo includes:
         * - `quoteId`    — unique ID for traceability
         * - `validUntil` — TTL timestamp (30s); validate before building calldata
         * - `sdkVersion` — SDK version that produced this quote
         *
         * @param {string|bigint} amountIn
         * @param {string}        tokenIn
         * @param {string}        tokenOut
         * @param {number}        [maxSteps=3]
         * @param {number}        [slippageBps=200]  - 200 = 2%
         * @returns {Promise<TradeInfo>}
         */
        async getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps = 3, slippageBps = 200) {
            // ── Validate inputs ───────────────────────────────────────────────
            validateTradeParams({
                amountIn,
                tokenIn,
                tokenOut,
                maxSteps,
                slippageBps,
                nativeAddress: chainConfig.NATIVE_ADDRESS,
            });

            const normalizedFee = getProtocolFeeBps();
            const effectiveAmountIn = applyProtocolFee(amountIn, normalizedFee);

            if (effectiveAmountIn <= 0n) {
                throw new EmpxError(
                    ERROR_CODES.AMOUNT_TOO_SMALL,
                    "amountIn is too small after protocol fee deduction",
                    false,
                    { amountIn: amountIn.toString(), fee: normalizedFee }
                );
            }

            const pathResult = await findBestPathPreferAcyclic(effectiveAmountIn, tokenIn, tokenOut, maxSteps);
            return buildTradeInfo(pathResult, slippageBps, normalizedFee, amountIn);
        },

        // ── Allowance ─────────────────────────────────────────────────────────

        /**
         * Checks whether an address has approved the router to spend at least
         * requiredAmount of a token.
         *
         * @param {string}        tokenAddress
         * @param {string}        ownerAddress
         * @param {string|bigint} requiredAmount  - Typically tradeInfo.amountIn
         * @returns {Promise<{ approved: boolean, allowance: string }>}
         */
        checkAllowance(tokenAddress, ownerAddress, requiredAmount) {
            return checkAllowanceInternal(tokenAddress, ownerAddress, requiredAmount);
        },

        // ── Calldata builders ─────────────────────────────────────────────────

        /**
         * Calldata for ERC-20 → ERC-20 swap.
         * In affiliate mode, encodes the integrator-aware ABI variant automatically.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapCalldata(tradeInfo, toAddress) {
            return buildSwapCalldata(tradeInfo, toAddress);
        },

        /**
         * Calldata for Native → ERC-20 swap.
         * PulseChain uses `swapNoSplitFromPLS`; other chains use `swapNoSplitFromETH`.
         * In affiliate mode, the bound integratorId is appended as the final argument.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapFromNativeCalldata(tradeInfo, toAddress) {
            return buildSwapFromNativeCalldata(tradeInfo, toAddress);
        },

        /**
         * Calldata for ERC-20 → Native swap.
         * PulseChain uses `swapNoSplitToPLS`; other chains use `swapNoSplitToETH`.
         * In affiliate mode, the bound integratorId is appended as the final argument.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapToNativeCalldata(tradeInfo, toAddress) {
            return buildSwapToNativeCalldata(tradeInfo, toAddress);
        },

        /**
         * Calldata to approve the router to spend an ERC-20 token.
         *
         * @param {string}        tokenAddress
         * @param {string|bigint} [amount]      - Defaults to MaxUint256 (unlimited)
         * @returns {{ to: string, data: string, value: string }}
         */
        getApprovalCalldata(tokenAddress, amount) {
            return getApprovalCalldata(tokenAddress, chainConfig.ROUTER_ADDRESS, amount);
        },

        // ── All-in-one swap ───────────────────────────────────────────────────

        /**
         * Finds best path and returns the correct calldata for the swap type
         * (WrapNative, UnwrapNative, NativeToERC20, ERC20ToNative, or ERC20ToERC20)
         * in a single call.
         *
         * Does NOT submit the transaction — returns calldata for the caller to send.
         * For ERC-20 input, call checkAllowance() first and send an approval if needed.
         * Affiliate routers automatically encode the integrator-aware router ABI.
         *
         * @param {string|bigint} amountIn
         * @param {string}        tokenIn       - Use chain.NATIVE_ADDRESS for native
         * @param {string}        tokenOut      - Use chain.NATIVE_ADDRESS for native
         * @param {string}        toAddress     - Recipient of output tokens
         * @param {number}        [maxSteps=3]
         * @param {number}        [slippageBps=200]
         * @returns {Promise<{ tradeInfo: object, calldata: { to, data, value }, swapType: string }>}
         */
        async swap(amountIn, tokenIn, tokenOut, toAddress, maxSteps = 3, slippageBps = 200) {
            validateTradeParams({
                amountIn,
                tokenIn,
                tokenOut,
                maxSteps,
                slippageBps,
                nativeAddress: chainConfig.NATIVE_ADDRESS,
            });

            const isNativeIn = tokenIn.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase();
            const isNativeOut = tokenOut.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase();
            const isWrappedIn = tokenIn.toLowerCase() === chainConfig.WRAPPED_NATIVE.toLowerCase();
            const isWrappedOut = tokenOut.toLowerCase() === chainConfig.WRAPPED_NATIVE.toLowerCase();

            if (isNativeIn && isWrappedOut) {
                const tradeInfo = buildWrapTradeInfo(amountIn, [
                    chainConfig.NATIVE_ADDRESS,
                    chainConfig.WRAPPED_NATIVE,
                ]);

                return {
                    tradeInfo,
                    calldata: getWrapCalldata({ amountIn: tradeInfo.amountIn }, chainConfig.WRAPPED_NATIVE),
                    swapType: "WrapNative",
                };
            }

            if (isWrappedIn && isNativeOut) {
                const tradeInfo = buildWrapTradeInfo(amountIn, [
                    chainConfig.WRAPPED_NATIVE,
                    chainConfig.NATIVE_ADDRESS,
                ]);

                return {
                    tradeInfo,
                    calldata: getUnwrapCalldata({ amountIn: tradeInfo.amountIn }, chainConfig.WRAPPED_NATIVE),
                    swapType: "UnwrapNative",
                };
            }

            const tradeInfo = await this.getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps, slippageBps);

            if (isNativeIn) {
                return {
                    tradeInfo,
                    calldata: buildSwapFromNativeCalldata(tradeInfo, toAddress),
                    swapType: "NativeToERC20",
                };
            }

            if (isNativeOut) {
                return {
                    tradeInfo,
                    calldata: buildSwapToNativeCalldata(tradeInfo, toAddress),
                    swapType: "ERC20ToNative",
                };
            }

            return {
                tradeInfo,
                calldata: buildSwapCalldata(tradeInfo, toAddress),
                swapType: "ERC20ToERC20",
            };
        },

        // ── USD price quotes ──────────────────────────────────────────────────

        /**
         * Returns the USD price per 1 full unit of a token.
         *
         * @param {string} tokenAddress
         * @param {number} [maxSteps=3]
         * @returns {Promise<number>}
         */
        getTokenPriceUSD(tokenAddress, maxSteps = 3) {
            return getTokenPriceUSD(_provider, chainConfig, tokenAddress, maxSteps);
        },

        /**
         * Returns the USD value of a raw token amount.
         *
         * @param {string}        tokenAddress
         * @param {string|bigint} rawAmount
         * @param {number}        [maxSteps=3]
         * @returns {Promise<{ usd: number, pricePerToken: number, decimals: number, humanAmount: number }>}
         */
        getQuoteUSD(tokenAddress, rawAmount, maxSteps = 3) {
            return getQuoteUSD(_provider, chainConfig, tokenAddress, rawAmount, maxSteps);
        },

        /**
         * Returns USD prices for multiple tokens in a parallel batch.
         *
         * @param {string[]} tokenAddresses
         * @param {number}   [maxSteps=3]
         * @returns {Promise<Record<string, number>>}
         */
        getMultipleTokenPricesUSD(tokenAddresses, maxSteps = 3) {
            return getMultipleTokenPricesUSD(_provider, chainConfig, tokenAddresses, maxSteps);
        },

        // ── Token helpers ─────────────────────────────────────────────────────

        /**
         * Returns token decimals. Returns native decimals for NATIVE_ADDRESS.
         * @param {string} tokenAddress
         * @returns {Promise<number>}
         */
        getTokenDecimals(tokenAddress) {
            return getTokenDecimals(_provider, chainConfig, tokenAddress);
        },

        /**
         * Returns token symbol. Returns native symbol for NATIVE_ADDRESS.
         * @param {string} tokenAddress
         * @returns {Promise<string>}
         */
        getTokenSymbol(tokenAddress) {
            return getTokenSymbol(_provider, chainConfig, tokenAddress);
        },
    };

    // Only the base router exposes standalone wrap / unwrap builders.
    if (integratorId == null) {
        router.getWrapCalldata = function getWrapRouterCalldata(tradeInfo) {
            return getWrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
        };

        router.getUnwrapCalldata = function getUnwrapRouterCalldata(tradeInfo) {
            return getUnwrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
        };
    }

    return router;
}

/**
 * Creates a router instance scoped to a specific chain.
 *
 * @param {number}                  chainId    - Chain ID (e.g. 369, 56, 42161…)
 * @param {string|ethers.Provider}  [provider] - RPC URL or ethers Provider.
 *                                               Omit to use the chain's default RPC.
 * @returns {EmpxRouter}
 */
function createRouter(chainId, provider) {
    return buildRouter(chainId, provider);
}

/**
 * Creates an affiliate-aware router instance bound to a single integratorId.
 *
 * @param {number}                  chainId
 * @param {string}                  integratorId - bytes32 hex string
 * @param {string|ethers.Provider}  [provider]
 * @returns {EmpxAffiliateRouter}
 */
function createAffiliateRouter(chainId, integratorId, provider) {
    return buildRouter(chainId, provider, validateIntegratorId(integratorId));
}

module.exports = { createRouter, createAffiliateRouter };
