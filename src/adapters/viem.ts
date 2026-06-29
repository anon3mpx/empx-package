import type { CalldataResult } from "../types.js";

export interface ViemWalletClientLike {
  account?: { address: string };
  chain?: { id: number };
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface ViemTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

export function toViemTransaction(calldata: CalldataResult): ViemTransactionRequest {
  return {
    to: calldata.to as `0x${string}`,
    data: calldata.data as `0x${string}`,
    value: BigInt(calldata.value),
  };
}
