import type { CalldataResult } from "../types.js";

export interface Eip5792Call {
  to: string;
  data?: string;
  value?: string;
}

export interface Eip5792SendCallsParams {
  version: "2.0.0";
  chainId: string;
  from: string;
  calls: Eip5792Call[];
  capabilities?: Record<string, unknown>;
}

export interface Eip1193RequestProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface WalletCapabilitiesSummary {
  raw: unknown;
  chainCapabilities: Record<string, unknown> | null;
  canBatch: boolean;
}

export function calldataToWalletCall(calldata: CalldataResult): Eip5792Call {
  const value = BigInt(calldata.value);
  return {
    to: calldata.to,
    data: calldata.data,
    ...(value === 0n ? {} : { value: `0x${value.toString(16)}` }),
  };
}

export async function getWalletCapabilities(
  provider: Eip1193RequestProvider,
  address: string,
  chainIdHex: string,
): Promise<unknown> {
  return provider.request({
    method: "wallet_getCapabilities",
    params: [address, [chainIdHex]],
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isSupportedCapability(value: unknown): boolean {
  if (value === true) return true;
  const obj = asRecord(value);
  if (!obj) return false;
  return obj.supported === true || obj.status === "supported";
}

export function parseWalletCapabilities(
  capabilities: unknown,
  chainIdHex?: string,
): WalletCapabilitiesSummary {
  const root = asRecord(capabilities);
  const normalizedChainId = chainIdHex?.toLowerCase();
  const chainCapabilities = root && normalizedChainId
    ? asRecord(root[chainIdHex!]) ?? asRecord(root[normalizedChainId])
    : root;

  const canBatch = Boolean(
    chainCapabilities && (
      isSupportedCapability(chainCapabilities.atomicBatch)
      || isSupportedCapability(chainCapabilities.wallet_sendCalls)
      || isSupportedCapability(chainCapabilities.sendCalls)
    )
  );

  return {
    raw: capabilities,
    chainCapabilities,
    canBatch,
  };
}

export async function canSendWalletCalls(
  provider: Eip1193RequestProvider,
  address: string,
  chainIdHex: string,
): Promise<boolean> {
  try {
    const capabilities = await getWalletCapabilities(provider, address, chainIdHex);
    return parseWalletCapabilities(capabilities, chainIdHex).canBatch;
  } catch {
    return false;
  }
}

export async function sendWalletCalls(
  provider: Eip1193RequestProvider,
  params: Eip5792SendCallsParams,
): Promise<unknown> {
  return provider.request({
    method: "wallet_sendCalls",
    params: [params],
  });
}
