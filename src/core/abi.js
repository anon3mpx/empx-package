// ─── ABIs ─────────────────────────────────────────────────────────────────────
//
// Three router ABI variants:
//   BASE_ROUTER_ABI   — shared functions present on every chain
//   PLS_ROUTER_ABI    — PulseChain: adds swapNoSplitFromPLS / swapNoSplitToPLS
//   ETH_ROUTER_ABI    — all other chains: adds swapNoSplitFromETH / swapNoSplitToETH
//
// Each chain config declares which ABI variant it uses via `routerAbi`.
// calldata.js reads native swap function names from chainConfig.nativeSwapFns
// so no swap logic ever hard-codes a function name.

// ─── Shared trade tuple (reused across all swap functions) ───────────────────

const TRADE_TUPLE = {
    name: "_trade",
    internalType: "struct Trade",
    type: "tuple",
    components: [
        { name: "amountIn", internalType: "uint256", type: "uint256" },
        { name: "amountOut", internalType: "uint256", type: "uint256" },
        { name: "path", internalType: "address[]", type: "address[]" },
        { name: "adapters", internalType: "address[]", type: "address[]" },
    ],
};

// ─── BASE ABI (identical on every chain) ─────────────────────────────────────

const BASE_ROUTER_ABI = [
    // ── constructor ───────────────────────────────────────────────────────────
    {
        inputs: [
            { internalType: "address[]", name: "_adapters", type: "address[]" },
            { internalType: "address[]", name: "_trustedTokens", type: "address[]" },
            { internalType: "address", name: "_feeClaimer", type: "address" },
            { internalType: "address", name: "_wrapped_native", type: "address" },
        ],
        stateMutability: "nonpayable",
        type: "constructor",
    },

    // ── events ────────────────────────────────────────────────────────────────
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "address", name: "_asset", type: "address" },
            { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
        ],
        name: "Recovered",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "bytes32", name: "role", type: "bytes32" },
            { indexed: true, internalType: "bytes32", name: "previousAdminRole", type: "bytes32" },
            { indexed: true, internalType: "bytes32", name: "newAdminRole", type: "bytes32" },
        ],
        name: "RoleAdminChanged",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "bytes32", name: "role", type: "bytes32" },
            { indexed: true, internalType: "address", name: "account", type: "address" },
            { indexed: true, internalType: "address", name: "sender", type: "address" },
        ],
        name: "RoleGranted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "bytes32", name: "role", type: "bytes32" },
            { indexed: true, internalType: "address", name: "account", type: "address" },
            { indexed: true, internalType: "address", name: "sender", type: "address" },
        ],
        name: "RoleRevoked",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [{ indexed: false, internalType: "address[]", name: "_newAdapters", type: "address[]" }],
        name: "UpdatedAdapters",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: false, internalType: "address", name: "_oldFeeClaimer", type: "address" },
            { indexed: false, internalType: "address", name: "_newFeeClaimer", type: "address" },
        ],
        name: "UpdatedFeeClaimer",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: false, internalType: "uint256", name: "_oldMinFee", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "_newMinFee", type: "uint256" },
        ],
        name: "UpdatedMinFee",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [{ indexed: false, internalType: "address[]", name: "_newTrustedTokens", type: "address[]" }],
        name: "UpdatedTrustedTokens",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, internalType: "address", name: "_tokenIn", type: "address" },
            { indexed: true, internalType: "address", name: "_tokenOut", type: "address" },
            { indexed: false, internalType: "uint256", name: "_amountIn", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "_amountOut", type: "uint256" },
        ],
        name: "EmpXSwap",
        type: "event",
    },

    // ── view / pure functions ─────────────────────────────────────────────────
    {
        inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        name: "ADAPTERS",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "DEFAULT_ADMIN_ROLE",
        outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "FEE_CLAIMER",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "FEE_DENOMINATOR",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "MAINTAINER_ROLE",
        outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "MIN_FEE",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "NAME",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "NATIVE",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        name: "TRUSTED_TOKENS",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "WNATIVE",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "adaptersCount",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "trustedTokensCount",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },

    // ── findBestPath ──────────────────────────────────────────────────────────
    {
        inputs: [
            { internalType: "uint256", name: "_amountIn", type: "uint256" },
            { internalType: "address", name: "_tokenIn", type: "address" },
            { internalType: "address", name: "_tokenOut", type: "address" },
            { internalType: "uint256", name: "_maxSteps", type: "uint256" },
        ],
        name: "findBestPath",
        outputs: [
            {
                internalType: "struct FormattedOffer",
                name: "",
                type: "tuple",
                components: [
                    { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
                    { internalType: "address[]", name: "adapters", type: "address[]" },
                    { internalType: "address[]", name: "path", type: "address[]" },
                    { internalType: "uint256", name: "gasEstimate", type: "uint256" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },

    // ── findBestPathWithGas ───────────────────────────────────────────────────
    {
        inputs: [
            { internalType: "uint256", name: "_amountIn", type: "uint256" },
            { internalType: "address", name: "_tokenIn", type: "address" },
            { internalType: "address", name: "_tokenOut", type: "address" },
            { internalType: "uint256", name: "_maxSteps", type: "uint256" },
            { internalType: "uint256", name: "_gasPrice", type: "uint256" },
        ],
        name: "findBestPathWithGas",
        outputs: [
            {
                internalType: "struct FormattedOffer",
                name: "",
                type: "tuple",
                components: [
                    { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
                    { internalType: "address[]", name: "adapters", type: "address[]" },
                    { internalType: "address[]", name: "path", type: "address[]" },
                    { internalType: "uint256", name: "gasEstimate", type: "uint256" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },

    // ── queryNoSplit (overload 1 — with options) ──────────────────────────────
    {
        inputs: [
            { internalType: "uint256", name: "_amountIn", type: "uint256" },
            { internalType: "address", name: "_tokenIn", type: "address" },
            { internalType: "address", name: "_tokenOut", type: "address" },
            { internalType: "uint8[]", name: "_options", type: "uint8[]" },
        ],
        name: "queryNoSplit",
        outputs: [
            {
                internalType: "struct Query",
                name: "",
                type: "tuple",
                components: [
                    { internalType: "address", name: "adapter", type: "address" },
                    { internalType: "address", name: "tokenIn", type: "address" },
                    { internalType: "address", name: "tokenOut", type: "address" },
                    { internalType: "uint256", name: "amountOut", type: "uint256" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },

    // ── queryNoSplit (overload 2 — no options) ────────────────────────────────
    {
        inputs: [
            { internalType: "uint256", name: "_amountIn", type: "uint256" },
            { internalType: "address", name: "_tokenIn", type: "address" },
            { internalType: "address", name: "_tokenOut", type: "address" },
        ],
        name: "queryNoSplit",
        outputs: [
            {
                internalType: "struct Query",
                name: "",
                type: "tuple",
                components: [
                    { internalType: "address", name: "adapter", type: "address" },
                    { internalType: "address", name: "tokenIn", type: "address" },
                    { internalType: "address", name: "tokenOut", type: "address" },
                    { internalType: "uint256", name: "amountOut", type: "uint256" },
                ],
            },
        ],
        stateMutability: "view",
        type: "function",
    },

    // ── queryAdapter ──────────────────────────────────────────────────────────
    {
        inputs: [
            { internalType: "uint256", name: "_amountIn", type: "uint256" },
            { internalType: "address", name: "_tokenIn", type: "address" },
            { internalType: "address", name: "_tokenOut", type: "address" },
            { internalType: "uint8", name: "_index", type: "uint8" },
        ],
        name: "queryAdapter",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },

    // ── swapNoSplit (ERC-20 → ERC-20, shared on all chains) ──────────────────
    {
        inputs: [TRADE_TUPLE, { internalType: "address", name: "_to", type: "address" }, { internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "swapNoSplit",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },

    // ── swapNoSplitWithPermit ─────────────────────────────────────────────────
    {
        inputs: [
            TRADE_TUPLE,
            { internalType: "address", name: "_to", type: "address" },
            { internalType: "uint256", name: "_fee", type: "uint256" },
            { internalType: "uint256", name: "_deadline", type: "uint256" },
            { internalType: "uint8", name: "_v", type: "uint8" },
            { internalType: "bytes32", name: "_r", type: "bytes32" },
            { internalType: "bytes32", name: "_s", type: "bytes32" },
        ],
        name: "swapNoSplitWithPermit",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },

    // ── swapNoSplitToETHWithPermit ────────────────────────────────────────────
    {
        inputs: [
            TRADE_TUPLE,
            { internalType: "address", name: "_to", type: "address" },
            { internalType: "uint256", name: "_fee", type: "uint256" },
            { internalType: "uint256", name: "_deadline", type: "uint256" },
            { internalType: "uint8", name: "_v", type: "uint8" },
            { internalType: "bytes32", name: "_r", type: "bytes32" },
            { internalType: "bytes32", name: "_s", type: "bytes32" },
        ],
        name: "swapNoSplitToETHWithPermit",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },

    // ── admin / role functions ────────────────────────────────────────────────
    {
        inputs: [{ internalType: "address", name: "addedMaintainer", type: "address" }],
        name: "addMaintainer",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "removedMaintainer", type: "address" }],
        name: "removeMaintainer",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address[]", name: "_adapters", type: "address[]" }],
        name: "setAdapters",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address[]", name: "_trustedTokens", type: "address[]" }],
        name: "setTrustedTokens",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "_wnative", type: "address" }],
        name: "setAllowanceForWrapping",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "_claimer", type: "address" }],
        name: "setFeeClaimer",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "setMinFee",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
        name: "transferOwnership",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }, { internalType: "address", name: "account", type: "address" }],
        name: "grantRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }, { internalType: "address", name: "account", type: "address" }],
        name: "revokeRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }, { internalType: "address", name: "account", type: "address" }],
        name: "renounceRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }],
        name: "renounceRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }, { internalType: "address", name: "account", type: "address" }],
        name: "hasRole",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "bytes32", name: "role", type: "bytes32" }],
        name: "getRoleAdmin",
        outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },

    // ── recovery ──────────────────────────────────────────────────────────────
    {
        inputs: [
            { internalType: "address", name: "_tokenAddress", type: "address" },
            { internalType: "uint256", name: "_tokenAmount", type: "uint256" },
        ],
        name: "recoverERC20",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "_amount", type: "uint256" }],
        name: "recoverNative",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },

    // ── supportsInterface ─────────────────────────────────────────────────────
    {
        inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
        name: "supportsInterface",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },

    // ── receive ───────────────────────────────────────────────────────────────
    { stateMutability: "payable", type: "receive" },
];

// ─── PulseChain ABI (swapNoSplitFromPLS / swapNoSplitToPLS) ──────────────────

const PLS_ROUTER_ABI = [
    ...BASE_ROUTER_ABI,
    {
        inputs: [TRADE_TUPLE, { internalType: "address", name: "_to", type: "address" }, { internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "swapNoSplitFromPLS",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [TRADE_TUPLE, { internalType: "address", name: "_to", type: "address" }, { internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "swapNoSplitToPLS",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
];

// ─── ETH-native ABI (swapNoSplitFromETH / swapNoSplitToETH) ──────────────────
// Used by: BSC, Arbitrum, Base, Polygon, Avalanche, Optimism

const ETH_ROUTER_ABI = [
    ...BASE_ROUTER_ABI,
    {
        inputs: [TRADE_TUPLE, { internalType: "address", name: "_to", type: "address" }, { internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "swapNoSplitFromETH",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [TRADE_TUPLE, { internalType: "address", name: "_to", type: "address" }, { internalType: "uint256", name: "_fee", type: "uint256" }],
        name: "swapNoSplitToETH",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
];

// ─── ERC-20 ABI ───────────────────────────────────────────────────────────────

const ERC20_ABI = [
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
    },
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
    },
    {
        name: "decimals",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }],
    },
    {
        name: "symbol",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "string" }],
    },
    // WETH / WNATIVE
    {
        name: "deposit",
        type: "function",
        stateMutability: "payable",
        inputs: [],
        outputs: [],
    },
    {
        name: "withdraw",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "amount", type: "uint256" }],
        outputs: [],
    },
];

module.exports = { BASE_ROUTER_ABI, PLS_ROUTER_ABI, ETH_ROUTER_ABI, ERC20_ABI };