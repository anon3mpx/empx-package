// ─── Wallet Module ────────────────────────────────────────────────────────────
// Flexible wallet connectivity for AI agents and human users.
//
//  Agent wallets  → createBurnerWallet(), fromPrivateKey(), fromMnemonic()
//  Browser/human  → connectMetaMask(), connectRabby(), connectPrivy(), connectWagmi()
//  Universal      → connectInjected(eip1193), readOnly(rpcUrl)

import { ethers } from "ethers";
import type { Provider } from "ethers";
import { connectViaEip6963, KNOWN_WALLET_RDNS } from "./wallet/eip6963.js";
import type {
  WalletInfo, WalletType,
  BurnerWalletOptions, PrivateKeyWalletOptions, MnemonicWalletOptions,
} from "./types.js";

export type { WalletInfo, WalletType, BurnerWalletOptions, PrivateKeyWalletOptions, MnemonicWalletOptions };

const DEFAULT_RPC = "https://arb1.arbitrum.io/rpc";

// ─── Agent Wallets ────────────────────────────────────────────────────────────

/**
 * Creates a new ephemeral burner wallet for an AI agent.
 *
 * The agent gets its own on-chain identity, separate from any user wallet.
 * This allows clean separation: agent pays gas from its own funds, user
 * funds stay in their own wallet and are only touched via explicit approval.
 *
 * ⚠️  Save the returned `mnemonic` securely if you need the wallet to
 *    persist across sessions. It is NOT stored anywhere by the SDK.
 *
 * @example — Claude Code / Zo / any headless agent:
 *   const wallet = createBurnerWallet({ rpcUrl: "https://arb1.arbitrum.io/rpc" });
 *   console.log(`Fund me: ${wallet.address}`);
 *   const router = createRouter(42161, wallet.signer!);
 */
export function createBurnerWallet(options: BurnerWalletOptions = {}): WalletInfo {
  const provider: Provider = new ethers.JsonRpcProvider(options.rpcUrl ?? DEFAULT_RPC);

  let rawWallet: ethers.HDNodeWallet;
  if (options.mnemonic) {
    rawWallet = ethers.HDNodeWallet.fromPhrase(
      options.mnemonic,
      undefined,
      options.derivationPath ?? "m/44'/60'/0'/0/0"
    );
  } else {
    rawWallet = ethers.Wallet.createRandom() as ethers.HDNodeWallet;
  }

  const signer = rawWallet.connect(provider);

  return {
    type: "burner",
    address: rawWallet.address,
    isAgentWallet: true,
    isHumanWallet: false,
    mnemonic: rawWallet.mnemonic?.phrase,
    privateKey: rawWallet.privateKey,
    signer,
    provider,
  };
}

/**
 * Creates a wallet from a raw private key.
 * Suitable for server-side agents and CI/CD pipelines.
 *
 * @example
 *   const wallet = fromPrivateKey({ privateKey: process.env.AGENT_PK!, rpcUrl: "..." });
 */
export function fromPrivateKey(options: PrivateKeyWalletOptions): WalletInfo {
  const provider: Provider = new ethers.JsonRpcProvider(options.rpcUrl ?? DEFAULT_RPC);
  const signer = new ethers.Wallet(options.privateKey, provider);
  return {
    type: "privateKey",
    address: signer.address,
    isAgentWallet: true,
    isHumanWallet: false,
    signer,
    provider,
  };
}

/**
 * Creates a deterministic wallet from a BIP-39 mnemonic.
 * Same mnemonic always produces the same address — great for persistent agent identity.
 *
 * @example
 *   const wallet = fromMnemonic({ mnemonic: "word1 word2 ... word12" });
 */
export function fromMnemonic(options: MnemonicWalletOptions): WalletInfo {
  const provider: Provider = new ethers.JsonRpcProvider(options.rpcUrl ?? DEFAULT_RPC);
  const hdWallet = ethers.HDNodeWallet.fromPhrase(
    options.mnemonic,
    undefined,
    options.derivationPath ?? "m/44'/60'/0'/0/0"
  );
  const signer = hdWallet.connect(provider);
  return {
    type: "mnemonic",
    address: hdWallet.address,
    isAgentWallet: true,
    isHumanWallet: false,
    mnemonic: options.mnemonic,
    signer,
    provider,
  };
}

// ─── Browser / Human Wallets ──────────────────────────────────────────────────

/**
 * Connects to MetaMask (or any window.ethereum-compatible wallet).
 * Must be called in a browser context.
 *
 * @example
 *   const wallet = await connectMetaMask();
 *   const router = createRouter(42161, wallet.signer!);
 */
export async function connectMetaMask(): Promise<WalletInfo> {
  try {
    const discovered = await connectViaEip6963(KNOWN_WALLET_RDNS.METAMASK);
    return { ...discovered, type: "metamask" };
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    if (!win?.ethereum) {
      throw new Error("MetaMask not found. Ensure you are in a browser with MetaMask installed.");
    }
    const browserProvider = new ethers.BrowserProvider(win.ethereum as ethers.Eip1193Provider);
    await browserProvider.send("eth_requestAccounts", []);
    const signer = await browserProvider.getSigner();
    return {
      type: "metamask",
      address: await signer.getAddress(),
      isAgentWallet: false,
      isHumanWallet: true,
      signer,
      provider: browserProvider,
    };
  }
}

/**
 * Connects to Rabby Wallet (uses window.ethereum like MetaMask).
 */
export async function connectRabby(): Promise<WalletInfo> {
  try {
    const discovered = await connectViaEip6963(KNOWN_WALLET_RDNS.RABBY);
    return { ...discovered, type: "rabby" };
  } catch {
    const info = await connectMetaMask();
    return { ...info, type: "rabby" };
  }
}

/**
 * Connects to any EIP-1193 injected provider (Trust Wallet, Coinbase Wallet, Frame, etc.).
 *
 * @example
 *   const wallet = await connectInjected(window.trustwallet);
 */
export async function connectInjected(
  eip1193Provider: ethers.Eip1193Provider
): Promise<WalletInfo> {
  const browserProvider = new ethers.BrowserProvider(eip1193Provider);
  await browserProvider.send("eth_requestAccounts", []);
  const signer = await browserProvider.getSigner();
  return {
    type: "injected",
    address: await signer.getAddress(),
    isAgentWallet: false,
    isHumanWallet: true,
    signer,
    provider: browserProvider,
  };
}

/**
 * Wraps a Privy embedded wallet signer.
 * Privy handles auth/key management — pass the wallet from useWallets().
 *
 * @example
 *   import { useWallets } from "@privy-io/react-auth";
 *   const { wallets } = useWallets();
 *   const wallet = await connectPrivy(wallets[0]);
 *   const router = createRouter(8453, wallet.signer!);
 */
export async function connectPrivy(privyWallet: {
  address: string;
  getEthereumProvider(): Promise<ethers.Eip1193Provider>;
}): Promise<WalletInfo> {
  const eip1193 = await privyWallet.getEthereumProvider();
  const browserProvider = new ethers.BrowserProvider(eip1193);
  const signer = await browserProvider.getSigner();
  return {
    type: "privy",
    address: privyWallet.address,
    isAgentWallet: false,
    isHumanWallet: true,
    signer,
    provider: browserProvider,
  };
}

/**
 * Wraps a wagmi wallet client / ethers signer.
 * Use wagmi's walletClientToSigner adapter to convert first.
 *
 * @example
 *   import { useWalletClient } from "wagmi";
 *   // convert wagmi walletClient → ethers signer using wagmi/ethers adapter
 *   const wallet = connectWagmi(signer, address);
 */
export function connectWagmi(signer: ethers.Signer, address: string, rpcUrl?: string): WalletInfo {
  const provider: Provider = new ethers.JsonRpcProvider(rpcUrl ?? DEFAULT_RPC);
  return {
    type: "wagmi",
    address,
    isAgentWallet: false,
    isHumanWallet: true,
    signer,
    provider,
  };
}

/**
 * Read-only provider — no signing, only queries.
 * Good for price checks and allowance lookups without wallet connection.
 *
 * @example
 *   const wallet = readOnly("https://mainnet.base.org");
 *   const router = createRouter(8453, wallet.provider);
 */
export function readOnly(rpcUrl: string): WalletInfo {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return {
    type: "readonly",
    address: ethers.ZeroAddress,
    isAgentWallet: false,
    isHumanWallet: false,
    signer: null,
    provider,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a safe string summary of a wallet for logging.
 * Never includes private keys or mnemonics.
 */
export function describeWallet(wallet: WalletInfo): string {
  return JSON.stringify({
    type: wallet.type,
    address: wallet.address,
    isAgentWallet: wallet.isAgentWallet,
    isHumanWallet: wallet.isHumanWallet,
  });
}

/**
 * Returns the native token balance (ETH, BNB, PLS…) of an address.
 *
 * @example
 *   const bal = await getNativeBalance(wallet, router.provider);
 *   console.log(`${bal.formatted} ETH`);
 */
export async function getNativeBalance(
  addressOrWallet: string | WalletInfo,
  provider: Provider
): Promise<{ raw: bigint; formatted: string }> {
  const address =
    typeof addressOrWallet === "string" ? addressOrWallet : addressOrWallet.address;
  const raw = await provider.getBalance(address);
  return { raw, formatted: ethers.formatEther(raw) };
}
