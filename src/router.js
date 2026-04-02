// ─── Router Factory ───────────────────────────────────────────────────────────
// createRouter(chainId, providerOrRpc?) returns a fully-bound router instance.

const { ethers } = require("ethers");
const { getChainConfig } = require("./chains");
const { findBestPath } = require("./core/pathfinder");
const {
    getSwapCalldata,
    getSwapFromNativeCalldata,
    getSwapToNativeCalldata,
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

const DEFAULT_PROTOCOL_FEE_BPS = BigInt(28); // 0.28%
const MIN_PROTOCOL_FEE_BPS = BigInt(9);      // router MIN_FEE

/**
 * Creates a router instance scoped to a specific chain.
 *
 * @param {number}                  chainId    - Chain ID (e.g. 369, 56, 42161…)
 * @param {string|ethers.Provider}  [provider] - RPC URL or ethers Provider.
 *                                               Omit to use the chain's default RPC.
 * @returns {EmpSealRouter}
 *
 * @example
 * const router = createRouter(369);                        // PulseChain, default RPC
 * const router = createRouter(56, "https://my-rpc.com");  // BSC, custom RPC
 * const router = createRouter(42161, existingProvider);   // Arbitrum, injected provider
 */
function createRouter(chainId, provider) {
    const chainConfig = getChainConfig(chainId);

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

    /**
     * Wraps a raw findBestPath result in a tradeInfo object with slippage applied.
     * gasEstimate is passed through from the on-chain router response.
     */
    function normalizeProtocolFee(protocolFeeBps) {
        const fee = BigInt(protocolFeeBps ?? DEFAULT_PROTOCOL_FEE_BPS);
        if (fee < MIN_PROTOCOL_FEE_BPS) {
            throw new Error(
                `protocol fee cannot be below router min fee (${MIN_PROTOCOL_FEE_BPS.toString()}). Received: ${fee.toString()}`
            );
        }
        return fee.toString();
    }

    function applyProtocolFee(amountIn, protocolFeeBps) {
        const amount = BigInt(amountIn);
        const fee = BigInt(protocolFeeBps);
        return (amount * (BigInt(10000) - fee)) / BigInt(10000);
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
        const primary = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, maxSteps);
        if (!hasTokenCycle(primary.path)) return primary;

        for (let steps = maxSteps - 1; steps >= 1; steps--) {
            try {
                const candidate = await findBestPath(_provider, chainConfig, amountIn, tokenIn, tokenOut, steps);
                if (!hasTokenCycle(candidate.path)) {
                    return candidate;
                }
            } catch {
                // Keep trying with fewer steps.
            }
        }

        return primary;
    }

    function buildTradeInfo(pathResult, slippageBps, protocolFeeBps, originalAmountIn) {
        const rawAmountOut = BigInt(pathResult.amounts[pathResult.amounts.length - 1]);
        const amountOut    = (rawAmountOut * BigInt(10000 - slippageBps)) / BigInt(10000);
        return {
            amountIn:    originalAmountIn.toString(),
            amountOut:   amountOut.toString(),
            fee:         normalizeProtocolFee(protocolFeeBps),
            amounts:     pathResult.amounts,
            path:        pathResult.path,
            adapters:    pathResult.adapters,
            gasEstimate: pathResult.gasEstimate,
        };
    }

    /**
     * Reads the current ERC-20 allowance the owner has granted to the router.
     */
    async function checkAllowance(tokenAddress, ownerAddress, requiredAmount) {
        const token     = new ethers.Contract(tokenAddress, ERC20_ABI, _provider);
        const allowance = await token.allowance(ownerAddress, chainConfig.ROUTER_ADDRESS);
        return {
            approved:  allowance >= BigInt(requiredAmount),
            allowance: allowance.toString(),
        };
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    return {

        // ── Metadata ──────────────────────────────────────────────────────────

        /** The chain config this router is scoped to. */
        chain: chainConfig,

        /** The underlying ethers.js provider. */
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
         * Ready to pass directly into any calldata builder or swap().
         *
         * @param {string|bigint} amountIn
         * @param {string}        tokenIn
         * @param {string}        tokenOut
         * @param {number}        [maxSteps=3]
         * @param {number}        [slippageBps=200]  - 200 = 2%
         * @param {string|number|bigint} [protocolFeeBps=28] - 28 = 0.28%
         * @returns {Promise<{
         *   amountIn:    string,
         *   amountOut:   string,
         *   fee:         string,
         *   amounts:     string[],
         *   path:        string[],
         *   adapters:    string[],
         *   gasEstimate: string
         * }>}
         */
        async getTradeInfo(amountIn, tokenIn, tokenOut, maxSteps = 3, slippageBps = 200, protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS) {
            const normalizedFee = normalizeProtocolFee(protocolFeeBps);
            const effectiveAmountIn = applyProtocolFee(amountIn, normalizedFee);

            if (effectiveAmountIn <= BigInt(0)) {
                throw new Error("amountIn is too small after protocol fee deduction");
            }

            const pathResult = await findBestPathPreferAcyclic(
                effectiveAmountIn, tokenIn, tokenOut, maxSteps
            );
            return buildTradeInfo(pathResult, slippageBps, normalizedFee, amountIn);
        },

        // ── Allowance ─────────────────────────────────────────────────────────

        /**
         * Checks whether an address has approved the router to spend at least
         * requiredAmount of a token. Call this before building ERC-20 swap
         * calldata to determine whether an approval transaction is needed first.
         *
         * @param {string}        tokenAddress
         * @param {string}        ownerAddress
         * @param {string|bigint} requiredAmount  - Typically tradeInfo.amountIn
         * @returns {Promise<{ approved: boolean, allowance: string }>}
         *
         * @example
         * const { approved } = await router.checkAllowance(tokenIn, userAddress, tradeInfo.amountIn);
         * if (!approved) await signer.sendTransaction(router.getApprovalCalldata(tokenIn));
         */
        checkAllowance(tokenAddress, ownerAddress, requiredAmount) {
            return checkAllowance(tokenAddress, ownerAddress, requiredAmount);
        },

        // ── Calldata builders ─────────────────────────────────────────────────

        /**
         * Calldata for ERC-20 → ERC-20 swap (swapNoSplit).
         * Ensure the router is approved to spend tokenIn before submitting.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @param {string|number|bigint} [protocolFeeBps=28]
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapCalldata(tradeInfo, toAddress, protocolFeeBps) {
            return getSwapCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps);
        },

        /**
         * Calldata for Native → ERC-20 swap.
         *   PulseChain   → swapNoSplitFromPLS
         *   Other chains → swapNoSplitFromETH
         *
         * Attach calldata.value as msg.value when sending the transaction.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @param {string|number|bigint} [protocolFeeBps=28]
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapFromNativeCalldata(tradeInfo, toAddress, protocolFeeBps) {
            return getSwapFromNativeCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps);
        },

        /**
         * Calldata for ERC-20 → Native swap.
         *   PulseChain   → swapNoSplitToPLS
         *   Other chains → swapNoSplitToETH
         *
         * Ensure the router is approved to spend tokenIn before submitting.
         *
         * @param {object} tradeInfo
         * @param {string} toAddress
         * @param {string|number|bigint} [protocolFeeBps=28]
         * @returns {{ to: string, data: string, value: string }}
         */
        getSwapToNativeCalldata(tradeInfo, toAddress, protocolFeeBps) {
            return getSwapToNativeCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps);
        },

        /**
         * Calldata to wrap native currency (e.g. PLS → WPLS, ETH → WETH).
         *
         * @param {{ amountIn: string }} tradeInfo
         * @returns {{ to: string, data: string, value: string }}
         */
        getWrapCalldata(tradeInfo) {
            return getWrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
        },

        /**
         * Calldata to unwrap native currency (e.g. WPLS → PLS, WETH → ETH).
         *
         * @param {{ amountIn: string }} tradeInfo
         * @returns {{ to: string, data: string, value: string }}
         */
        getUnwrapCalldata(tradeInfo) {
            return getUnwrapCalldata(tradeInfo, chainConfig.WRAPPED_NATIVE);
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
         *
         * @param {string|bigint} amountIn
         * @param {string}        tokenIn       - Use chain.NATIVE_ADDRESS for native
         * @param {string}        tokenOut      - Use chain.NATIVE_ADDRESS for native
         * @param {string}        toAddress     - Recipient of output tokens
         * @param {number}        [maxSteps=3]
         * @param {number}        [slippageBps=200]
         * @param {string|number|bigint} [protocolFeeBps=28]
         * @returns {Promise<{
         *   tradeInfo: object,
         *   calldata:  { to: string, data: string, value: string },
         *   swapType:  "WrapNative" | "UnwrapNative" | "NativeToERC20" | "ERC20ToNative" | "ERC20ToERC20"
         * }>}
         */
        async swap(amountIn, tokenIn, tokenOut, toAddress, maxSteps = 3, slippageBps = 200, protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS) {
            const isNativeIn  = tokenIn.toLowerCase()  === chainConfig.NATIVE_ADDRESS.toLowerCase();
            const isNativeOut = tokenOut.toLowerCase() === chainConfig.NATIVE_ADDRESS.toLowerCase();
            const isWrappedIn = tokenIn.toLowerCase()  === chainConfig.WRAPPED_NATIVE.toLowerCase();
            const isWrappedOut = tokenOut.toLowerCase() === chainConfig.WRAPPED_NATIVE.toLowerCase();

            if (isNativeIn && isWrappedOut) {
                const tradeInfo = {
                    amountIn: amountIn.toString(),
                    amountOut: amountIn.toString(),
                    fee: "0",
                    amounts: [amountIn.toString(), amountIn.toString()],
                    path: [chainConfig.NATIVE_ADDRESS, chainConfig.WRAPPED_NATIVE],
                    adapters: [],
                    gasEstimate: "0",
                };
                return {
                    tradeInfo,
                    calldata: this.getWrapCalldata({ amountIn: tradeInfo.amountIn }),
                    swapType: "WrapNative",
                };
            }

            if (isWrappedIn && isNativeOut) {
                const tradeInfo = {
                    amountIn: amountIn.toString(),
                    amountOut: amountIn.toString(),
                    fee: "0",
                    amounts: [amountIn.toString(), amountIn.toString()],
                    path: [chainConfig.WRAPPED_NATIVE, chainConfig.NATIVE_ADDRESS],
                    adapters: [],
                    gasEstimate: "0",
                };
                return {
                    tradeInfo,
                    calldata: this.getUnwrapCalldata({ amountIn: tradeInfo.amountIn }),
                    swapType: "UnwrapNative",
                };
            }

            const tradeInfo = await this.getTradeInfo(
                amountIn,
                tokenIn,
                tokenOut,
                maxSteps,
                slippageBps,
                protocolFeeBps
            );

            let calldata, swapType;

            if (isNativeIn && !isNativeOut) {
                calldata = this.getSwapFromNativeCalldata(tradeInfo, toAddress);
                swapType = "NativeToERC20";
            } else if (!isNativeIn && isNativeOut) {
                calldata = this.getSwapToNativeCalldata(tradeInfo, toAddress);
                swapType = "ERC20ToNative";
            } else {
                calldata = this.getSwapCalldata(tradeInfo, toAddress);
                swapType = "ERC20ToERC20";
            }

            return { tradeInfo, calldata, swapType };
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
}

module.exports = { createRouter };
