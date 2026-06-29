import { ethers } from "ethers";
import type { PermitSignature } from "../types.js";

export interface PermitTypedDataInput {
  tokenName: string;
  tokenVersion?: string;
  chainId: number | bigint;
  verifyingContract: string;
  owner: string;
  spender: string;
  value: string | bigint;
  nonce: string | bigint;
  deadline: string | bigint;
}

export function buildPermitTypedData(input: PermitTypedDataInput) {
  return {
    domain: {
      name: input.tokenName,
      version: input.tokenVersion ?? "1",
      chainId: Number(input.chainId),
      verifyingContract: input.verifyingContract,
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner: input.owner,
      spender: input.spender,
      value: BigInt(input.value),
      nonce: BigInt(input.nonce),
      deadline: BigInt(input.deadline),
    },
  };
}

export function splitPermitSignature(signature: string, deadline?: string | bigint): PermitSignature {
  const split = ethers.Signature.from(signature);
  return {
    deadline: deadline ?? 0n,
    v: split.v,
    r: split.r,
    s: split.s,
  };
}
