import type { CalldataResult } from "../types.js";

export interface WagmiTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

export function toWagmiTransaction(calldata: CalldataResult): WagmiTransactionRequest {
  return {
    to: calldata.to as `0x${string}`,
    data: calldata.data as `0x${string}`,
    value: BigInt(calldata.value),
  };
}
