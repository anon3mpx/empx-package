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

export async function sendWalletCalls(
  provider: Eip1193RequestProvider,
  params: Eip5792SendCallsParams,
): Promise<unknown> {
  return provider.request({
    method: "wallet_sendCalls",
    params: [params],
  });
}
