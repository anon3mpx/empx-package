// ─── EIP-6963 — Multi Injected Provider Discovery ──────────────────────────────
import { ethers } from "ethers";
import type { WalletInfo } from "../types.js";

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: ethers.Eip1193Provider;
}

export const KNOWN_WALLET_RDNS = {
  METAMASK: "io.metamask",
  RABBY: "io.rabby",
  COINBASE: "com.coinbase.wallet",
  BRAVE: "com.brave.wallet",
  FRAME: "sh.frame",
  TRUST: "com.trustwallet.app",
  OKX: "com.okex.wallet",
  ZERION: "io.zerion.wallet",
} as const;

interface AnnounceEvent extends Event {
  detail: Eip6963ProviderDetail;
}

export function discoverInjectedProviders(timeoutMs = 300): Promise<Eip6963ProviderDetail[]> {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const byRdns = new Map<string, Eip6963ProviderDetail>();

    const onAnnounce = (event: Event) => {
      const detail = (event as AnnounceEvent).detail;
      if (detail?.info?.rdns && detail.provider) {
        byRdns.set(detail.info.rdns, detail);
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      resolve([...byRdns.values()]);
    }, timeoutMs);
  });
}

export async function getInjectedProviderByRdns(
  rdns: string,
  timeoutMs = 300,
): Promise<Eip6963ProviderDetail | null> {
  const found = await discoverInjectedProviders(timeoutMs);
  return found.find((detail) => detail.info.rdns === rdns) ?? null;
}

async function connectDiscoveredProvider(
  detail: Eip6963ProviderDetail,
): Promise<WalletInfo & { walletRdns: string; walletName: string }> {
  const browserProvider = new ethers.BrowserProvider(detail.provider);
  await browserProvider.send("eth_requestAccounts", []);
  const signer = await browserProvider.getSigner();
  return {
    type: "injected",
    address: await signer.getAddress(),
    isAgentWallet: false,
    isHumanWallet: true,
    signer,
    provider: browserProvider,
    walletRdns: detail.info.rdns,
    walletName: detail.info.name,
  };
}

export async function connectViaEip6963(
  rdns?: string,
  timeoutMs = 300,
): Promise<WalletInfo & { walletRdns: string; walletName: string }> {
  const found = await discoverInjectedProviders(timeoutMs);
  if (found.length === 0) {
    throw new Error("No EIP-6963 wallet discovered. Ensure an injected wallet is installed.");
  }

  const detail = rdns ? found.find((candidate) => candidate.info.rdns === rdns) : found[0];
  if (!detail) {
    const available = found.map((candidate) => candidate.info.rdns).join(", ") || "(none)";
    throw new Error(`Wallet "${rdns}" not found via EIP-6963. Available: ${available}`);
  }

  return connectDiscoveredProvider(detail);
}
