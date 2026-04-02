// ─── Calldata Builders ────────────────────────────────────────────────────────
// Encodes transaction calldata for each swap type.
//
// Native swap function names differ by chain:
//   PulseChain → swapNoSplitFromPLS / swapNoSplitToPLS
//   All others → swapNoSplitFromETH / swapNoSplitToETH
//
// All functions that touch the router accept `chainConfig` so they can read
// chainConfig.routerAbi and chainConfig.nativeSwapFns — no names hard-coded here.

const { ethers, isAddress } = require("ethers");
const { ERC20_ABI } = require("./abi");

// Default protocol fee configuration (all chains)
const DEFAULT_PROTOCOL_FEE_BPS = BigInt(28); // 0.28%
const MIN_PROTOCOL_FEE_BPS = BigInt(9);      // router MIN_FEE

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateAddress(address, name) {
    if (!isAddress(address)) {
        throw new Error(`Invalid ${name}: "${address}" is not a valid Ethereum address`);
    }
}

function validateTradeInfo(trade) {
    if (!trade || typeof trade !== "object") throw new Error("tradeInfo must be an object");
    if (trade.amountIn == null) throw new Error("tradeInfo.amountIn is required");
    if (trade.amountOut == null) throw new Error("tradeInfo.amountOut is required");
    if (!Array.isArray(trade.path) || trade.path.length < 2)
        throw new Error("tradeInfo.path must be an array with at least 2 addresses");
    if (!Array.isArray(trade.adapters) || trade.adapters.length < 1)
        throw new Error("tradeInfo.adapters must be a non-empty array");
}

function validateChainConfig(chainConfig) {
    if (!chainConfig?.routerAbi) throw new Error("chainConfig.routerAbi is required");
    if (!chainConfig?.nativeSwapFns) throw new Error("chainConfig.nativeSwapFns is required");
    if (!chainConfig?.ROUTER_ADDRESS) throw new Error("chainConfig.ROUTER_ADDRESS is required");
}

function resolveProtocolFeeBps(tradeInfo, protocolFeeBps) {
    const feeRaw = protocolFeeBps ?? tradeInfo?.fee ?? DEFAULT_PROTOCOL_FEE_BPS;

    let fee;
    try {
        fee = BigInt(feeRaw);
    } catch {
        throw new Error(`Invalid protocol fee: "${feeRaw}"`);
    }

    if (fee < MIN_PROTOCOL_FEE_BPS) {
        throw new Error(
            `protocol fee cannot be below router min fee (${MIN_PROTOCOL_FEE_BPS.toString()}). Received: ${fee.toString()}`
        );
    }

    return fee;
}

/**
 * Low-level ABI encoder. Encodes a contract function call into raw calldata.
 *
 * @param {object[]} abi         - Contract ABI
 * @param {string}   address     - Contract address
 * @param {string}   funcName    - Function name
 * @param {any[]}    args        - Function arguments
 * @param {string}   [value="0"] - ETH value (for payable calls)
 * @returns {{ to: string, data: string, value: string }}
 */
function encodeCalldata(abi, address, funcName, args, value = "0") {
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData(funcName, args);
    return { to: address, data, value: value.toString() };
}

// ─── Trade struct builder ─────────────────────────────────────────────────────

function buildTradeStruct(trade) {
    return [
        BigInt(trade.amountIn),
        BigInt(trade.amountOut),
        trade.path,
        trade.adapters,
    ];
}

// ─── ERC-20 → ERC-20 ─────────────────────────────────────────────────────────

/**
 * Builds calldata for a standard ERC-20 to ERC-20 swap (swapNoSplit).
 * Function name is identical on every chain — no chain-specific logic needed.
 * Caller must have approved router to spend tokenIn before calling.
 *
 * @param {object} tradeInfo   - { amountIn, amountOut, path, adapters }
 * @param {string} toAddress   - Recipient address
 * @param {object} chainConfig - Chain config (provides routerAbi + ROUTER_ADDRESS)
 * @param {string|number|bigint} [protocolFeeBps] - Router fee arg. Defaults to tradeInfo.fee or 28.
 * @returns {{ to: string, data: string, value: string }}
 */
function getSwapCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps) {
    validateTradeInfo(tradeInfo);
    validateAddress(toAddress, "toAddress");
    validateChainConfig(chainConfig);
    const fee = resolveProtocolFeeBps(tradeInfo, protocolFeeBps);

    return encodeCalldata(
        chainConfig.routerAbi,
        chainConfig.ROUTER_ADDRESS,
        "swapNoSplit",
        [buildTradeStruct(tradeInfo), toAddress, fee]
    );
}

// ─── Native → ERC-20 ─────────────────────────────────────────────────────────

/**
 * Builds calldata for a Native → ERC-20 swap.
 * Uses chainConfig.nativeSwapFns.fromNative for the correct function name:
 *   PulseChain  → "swapNoSplitFromPLS"
 *   Other chains → "swapNoSplitFromETH"
 *
 * The amountIn is attached as msg.value — pass calldata.value to sendTransaction.
 *
 * @param {object} tradeInfo
 * @param {string} toAddress
 * @param {object} chainConfig
 * @param {string|number|bigint} [protocolFeeBps] - Router fee arg. Defaults to tradeInfo.fee or 28.
 * @returns {{ to: string, data: string, value: string }}
 */
function getSwapFromNativeCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps) {
    validateTradeInfo(tradeInfo);
    validateAddress(toAddress, "toAddress");
    validateChainConfig(chainConfig);
    const fee = resolveProtocolFeeBps(tradeInfo, protocolFeeBps);

    return encodeCalldata(
        chainConfig.routerAbi,
        chainConfig.ROUTER_ADDRESS,
        chainConfig.nativeSwapFns.fromNative,
        [buildTradeStruct(tradeInfo), toAddress, fee],
        tradeInfo.amountIn  // attach as msg.value
    );
}

// ─── ERC-20 → Native ─────────────────────────────────────────────────────────

/**
 * Builds calldata for an ERC-20 → Native swap.
 * Uses chainConfig.nativeSwapFns.toNative for the correct function name:
 *   PulseChain  → "swapNoSplitToPLS"
 *   Other chains → "swapNoSplitToETH"
 *
 * Caller must have approved router to spend tokenIn before calling.
 *
 * @param {object} tradeInfo
 * @param {string} toAddress
 * @param {object} chainConfig
 * @param {string|number|bigint} [protocolFeeBps] - Router fee arg. Defaults to tradeInfo.fee or 28.
 * @returns {{ to: string, data: string, value: string }}
 */
function getSwapToNativeCalldata(tradeInfo, toAddress, chainConfig, protocolFeeBps) {
    validateTradeInfo(tradeInfo);
    validateAddress(toAddress, "toAddress");
    validateChainConfig(chainConfig);
    const fee = resolveProtocolFeeBps(tradeInfo, protocolFeeBps);

    return encodeCalldata(
        chainConfig.routerAbi,
        chainConfig.ROUTER_ADDRESS,
        chainConfig.nativeSwapFns.toNative,
        [buildTradeStruct(tradeInfo), toAddress, fee]
    );
}

// ─── Wrap / Unwrap (native ↔ wrapped) ────────────────────────────────────────

/**
 * Builds calldata to wrap native currency (e.g. PLS → WPLS, ETH → WETH).
 *
 * @param {object} tradeInfo   - Only amountIn is used
 * @param {string} wrappedAddr - WRAPPED_NATIVE address for this chain
 * @returns {{ to: string, data: string, value: string }}
 */
function getWrapCalldata(tradeInfo, wrappedAddr) {
    validateAddress(wrappedAddr, "wrappedAddr");
    if (tradeInfo?.amountIn == null) throw new Error("tradeInfo.amountIn is required");

    return encodeCalldata(
        ERC20_ABI,
        wrappedAddr,
        "deposit",
        [],
        tradeInfo.amountIn
    );
}

/**
 * Builds calldata to unwrap native currency (e.g. WPLS → PLS, WETH → ETH).
 *
 * @param {object} tradeInfo   - Only amountIn is used
 * @param {string} wrappedAddr - WRAPPED_NATIVE address for this chain
 * @returns {{ to: string, data: string, value: string }}
 */
function getUnwrapCalldata(tradeInfo, wrappedAddr) {
    validateAddress(wrappedAddr, "wrappedAddr");
    if (tradeInfo?.amountIn == null) throw new Error("tradeInfo.amountIn is required");

    return encodeCalldata(
        ERC20_ABI,
        wrappedAddr,
        "withdraw",
        [BigInt(tradeInfo.amountIn)]
    );
}

// ─── ERC-20 Approval ─────────────────────────────────────────────────────────

/**
 * Builds calldata to approve the router to spend a given ERC-20 token.
 *
 * @param {string}        tokenAddress   - ERC-20 token contract
 * @param {string}        spenderAddress - Router address
 * @param {string|bigint} [amount]       - Defaults to MaxUint256 (unlimited)
 * @returns {{ to: string, data: string, value: string }}
 */
function getApprovalCalldata(tokenAddress, spenderAddress, amount) {
    validateAddress(tokenAddress, "tokenAddress");
    validateAddress(spenderAddress, "spenderAddress");

    const approvalAmount = amount != null ? BigInt(amount) : ethers.MaxUint256;

    return encodeCalldata(
        ERC20_ABI,
        tokenAddress,
        "approve",
        [spenderAddress, approvalAmount]
    );
}

module.exports = {
    getSwapCalldata,
    getSwapFromNativeCalldata,
    getSwapToNativeCalldata,
    getWrapCalldata,
    getUnwrapCalldata,
    getApprovalCalldata,
};
