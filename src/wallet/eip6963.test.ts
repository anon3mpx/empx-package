import assert from "node:assert/strict";
import {
  discoverInjectedProviders,
  getInjectedProviderByRdns,
  connectViaEip6963,
  KNOWN_WALLET_RDNS,
} from "./eip6963.js";

class FakeWindow extends EventTarget {
  announced: Array<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: any }> = [];

  dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    if (event.type === "eip6963:requestProvider") {
      for (const detail of this.announced) {
        super.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
      }
    }
    return result;
  }
}

function setFakeWindow(fakeWindow: FakeWindow | undefined): void {
  if (fakeWindow) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: fakeWindow,
    });
  } else {
    delete (globalThis as any).window;
  }
}

function provider(label: string) {
  return {
    label,
    request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      return null;
    },
  };
}

async function run() {
  setFakeWindow(undefined);
  assert.deepEqual(await discoverInjectedProviders(1), []);

  const fakeWindow = new FakeWindow();
  const metamask = {
    info: { uuid: "1", name: "MetaMask", icon: "data:", rdns: KNOWN_WALLET_RDNS.METAMASK },
    provider: provider("metamask-v1"),
  };
  const rabby = {
    info: { uuid: "2", name: "Rabby", icon: "data:", rdns: KNOWN_WALLET_RDNS.RABBY },
    provider: provider("rabby"),
  };
  const metamaskReplacement = {
    info: { uuid: "3", name: "MetaMask", icon: "data:", rdns: KNOWN_WALLET_RDNS.METAMASK },
    provider: provider("metamask-v2"),
  };
  fakeWindow.announced.push(metamask, rabby, metamaskReplacement);
  setFakeWindow(fakeWindow);

  const discovered = await discoverInjectedProviders(1);
  assert.equal(discovered.length, 2);
  assert.equal((discovered.find((d) => d.info.rdns === KNOWN_WALLET_RDNS.METAMASK)?.provider as any).label, "metamask-v2");
  assert.equal((discovered.find((d) => d.info.rdns === KNOWN_WALLET_RDNS.RABBY)?.provider as any).label, "rabby");

  const found = await getInjectedProviderByRdns(KNOWN_WALLET_RDNS.RABBY, 1);
  assert.equal(found?.info.name, "Rabby");

  await assert.rejects(
    () => connectViaEip6963("com.missing.wallet", 1),
    /Wallet "com\.missing\.wallet" not found via EIP-6963/
  );

  setFakeWindow(undefined);
  console.log("eip6963: discovery tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
