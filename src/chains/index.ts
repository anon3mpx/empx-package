// ─── Chain Registry ───────────────────────────────────────────────────────────
import type { ChainConfig, ChainInfo } from "../types.js";
import { ETH_ROUTER_ABI, PLS_ROUTER_ABI } from "../core/abi.js";
import { EmpxError } from "../core/errors.js";
import { ERROR_CODES } from "../types.js";
import { applyAffiliateChainOverrides } from "../affiliate/chains.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rawChainData = require("./all_chains.json") as Record<string, Record<string, unknown>>;

export const CHAIN_IDS = {
  PULSECHAIN: 369, BSC: 56, ARBITRUM: 42161, BASE: 8453, POLYGON: 137,
  AVALANCHE: 43114, OPTIMISM: 10, MONAD: 143, SONIC: 146, SEI: 1329,
  BERACHAIN: 80094, ROOTSTOCK: 30, HYPEREVM: 999, ETHW: 10001,
} as const;

export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export const CHAINS: Record<number, ChainConfig> = {};
for (const raw of Object.values(rawChainData)) {
  const cfg: ChainConfig = {
    ...(raw as unknown as ChainInfo),
    routerAbi: raw["usesPLS"] ? PLS_ROUTER_ABI : ETH_ROUTER_ABI,
  };
  CHAINS[cfg.chainId] = cfg;
}

export function getChainConfig(chainId: number, integratorId?: string): ChainConfig {
  const config = CHAINS[chainId];
  if (!config) {
    throw new EmpxError(
      ERROR_CODES.INVALID_CHAIN,
      `Unsupported chainId: ${chainId}. Supported: ${Object.keys(CHAINS).join(", ")}`,
      false,
      { chainId, supported: Object.keys(CHAINS).map(Number) }
    );
  }
  return integratorId != null ? applyAffiliateChainOverrides(config) : config;
}

export function getAllChains(): ChainConfig[] {
  return Object.values(CHAINS);
}

export function getSupportedChainIds(): number[] {
  return Object.keys(CHAINS).map(Number);
}

export function stripRouterAbi(cfg: ChainConfig): ChainInfo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { routerAbi: _abi, ...info } = cfg;
  return info as ChainInfo;
}
