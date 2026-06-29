import { ethers } from "ethers";
import type { Provider, Signer } from "ethers";
import type { PermitSignature } from "../types.js";

const ERC2612_PERMIT_METADATA_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
] as const;

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

export interface PermitMetadataInput {
  provider: Provider;
  tokenAddress: string;
  owner: string;
}

export interface PermitMetadata {
  tokenName: string;
  tokenVersion: string;
  nonce: bigint;
}

export interface SignPermitInput {
  signer: Signer;
  owner: string;
  spender: string;
  tokenAddress: string;
  value: string | bigint;
  chainId: number | bigint;
  deadline: string | bigint;
  tokenName?: string;
  tokenVersion?: string;
  nonce?: string | bigint;
  provider?: Provider;
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

export async function readPermitMetadata(input: PermitMetadataInput): Promise<PermitMetadata> {
  const token = new ethers.Contract(
    input.tokenAddress,
    ERC2612_PERMIT_METADATA_ABI,
    input.provider,
  );

  const tokenName = await token["name"]();
  let tokenVersion = "1";
  try {
    tokenVersion = await token["version"]();
  } catch {
    tokenVersion = "1";
  }
  const nonce = await token["nonces"](input.owner);

  return {
    tokenName,
    tokenVersion,
    nonce: BigInt(nonce),
  };
}

export async function signPermit(input: SignPermitInput): Promise<PermitSignature> {
  const needsMetadata = input.tokenName == null || input.nonce == null;
  const metadata = needsMetadata
    ? await readPermitMetadata({
      provider: input.provider ?? input.signer.provider!,
      tokenAddress: input.tokenAddress,
      owner: input.owner,
    })
    : undefined;

  const tokenName = input.tokenName ?? metadata!.tokenName;
  const tokenVersion = input.tokenVersion ?? metadata?.tokenVersion ?? "1";
  const nonce = input.nonce ?? metadata!.nonce;
  const typed = buildPermitTypedData({
    tokenName,
    tokenVersion,
    chainId: input.chainId,
    verifyingContract: input.tokenAddress,
    owner: input.owner,
    spender: input.spender,
    value: input.value,
    nonce,
    deadline: input.deadline,
  });

  const signature = await input.signer.signTypedData(
    typed.domain,
    typed.types,
    typed.message,
  );
  return splitPermitSignature(signature, input.deadline);
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
