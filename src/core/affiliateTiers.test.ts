// ─── affiliateTiers — unit tests ──────────────────────────────────────────────

import {
  makeAffiliateConfig,
  classifyAffiliateTier,
  AFFILIATE_TIER_BPS,
  AFFILIATE_TIER_LABEL,
  type AffiliateTier,
} from "./affiliateTiers.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

function assertEq<T>(actual: T, expected: T) {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

function assertThrows(fn: () => void, match?: string) {
  let threw = false;
  try { fn(); } catch (e: any) {
    threw = true;
    if (match && !e.message.includes(match)) {
      throw new Error(`threw "${e.message}" but expected match "${match}"`);
    }
  }
  if (!threw) throw new Error("expected throw, none happened");
}

console.log("\naffiliateTiers — unit tests\n");

const VALID_ADDR = "0xabcdef1234567890abcdef1234567890abcdef12";

// ─── Tier table ──────────────────────────────────────────────────────────────

test("STANDARD = 10% (1000 bps share of protocol fee)", () => {
  assertEq(AFFILIATE_TIER_BPS.STANDARD, 1000);
});

test("VOLUME_COMMITTED = 25% (2500 bps)", () => {
  assertEq(AFFILIATE_TIER_BPS.VOLUME_COMMITTED, 2500);
});

test("STRATEGIC = 50% (5000 bps)", () => {
  assertEq(AFFILIATE_TIER_BPS.STRATEGIC, 5000);
});

test("No PROMO tier exists (locked decision)", () => {
  // PROMO would be 10_000 bps (100%) — explicitly excluded per user instruction.
  assertEq("PROMO" in AFFILIATE_TIER_BPS, false);
  assertEq("PROMO" in AFFILIATE_TIER_LABEL, false);
});

test("All tier labels are populated", () => {
  for (const tier of ["STANDARD", "VOLUME_COMMITTED", "STRATEGIC"] as AffiliateTier[]) {
    if (!AFFILIATE_TIER_LABEL[tier]) throw new Error(`Missing label for ${tier}`);
  }
});

// ─── Factory ──────────────────────────────────────────────────────────────────

test("makeAffiliateConfig builds STANDARD correctly", () => {
  const cfg = makeAffiliateConfig({ address: VALID_ADDR, tier: "STANDARD" });
  assertEq(cfg.address, VALID_ADDR);
  assertEq(cfg.feeBps, 1000);
});

test("makeAffiliateConfig builds VOLUME_COMMITTED correctly", () => {
  const cfg = makeAffiliateConfig({ address: VALID_ADDR, tier: "VOLUME_COMMITTED" });
  assertEq(cfg.feeBps, 2500);
});

test("makeAffiliateConfig builds STRATEGIC correctly", () => {
  const cfg = makeAffiliateConfig({ address: VALID_ADDR, tier: "STRATEGIC" });
  assertEq(cfg.feeBps, 5000);
});

test("makeAffiliateConfig rejects invalid address", () => {
  assertThrows(
    () => makeAffiliateConfig({ address: "not-an-address", tier: "STANDARD" }),
    "invalid address",
  );
});

test("makeAffiliateConfig rejects empty address", () => {
  assertThrows(
    () => makeAffiliateConfig({ address: "", tier: "STANDARD" }),
    "invalid address",
  );
});

test("makeAffiliateConfig rejects unknown tier", () => {
  assertThrows(
    () => makeAffiliateConfig({ address: VALID_ADDR, tier: "PROMO" as any }),
    "unknown tier",
  );
});

// ─── Classification ──────────────────────────────────────────────────────────

test("classifyAffiliateTier recognises STANDARD", () => {
  assertEq(classifyAffiliateTier({ address: VALID_ADDR, feeBps: 1000 }), "STANDARD");
});

test("classifyAffiliateTier recognises VOLUME_COMMITTED", () => {
  assertEq(classifyAffiliateTier({ address: VALID_ADDR, feeBps: 2500 }), "VOLUME_COMMITTED");
});

test("classifyAffiliateTier recognises STRATEGIC", () => {
  assertEq(classifyAffiliateTier({ address: VALID_ADDR, feeBps: 5000 }), "STRATEGIC");
});

test("classifyAffiliateTier returns null for custom feeBps", () => {
  assertEq(classifyAffiliateTier({ address: VALID_ADDR, feeBps: 1500 }), null);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${pass}/${pass + fail} tests passed`);
if (fail) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
