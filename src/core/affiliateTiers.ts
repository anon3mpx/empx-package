// ─── Affiliate Share Tiers ────────────────────────────────────────────────────
//
// Locked tier presets per FEE-STRUCTURE-AND-STRATEGY (user-confirmed 2026-06-06):
//
//   STANDARD          — 10% of protocol fee  (any integrator, opt-in default)
//   VOLUME_COMMITTED  — 25% of protocol fee  ($1M/mo for 6+ months)
//   STRATEGIC         — 50% of protocol fee  (governance / token swap deal)
//
// NO 100% PROMO TIER — explicit user decision.  We don't bootstrap acquisition
// via 100% rebates; the value prop is breadth + tooling + the SDK pitch.
//
// Affiliate share is expressed in basis points of the PROTOCOL fee (NOT of
// the swap).  The user's effective fee is unchanged regardless of tier — this
// only splits how the protocol revenue is shared.
//
// Example: trade pays 28 bps protocol fee.
//   - STANDARD (10%):         affiliate gets 10% of 28 bps = 280/10000 = 2.8 bps absolute
//   - VOLUME_COMMITTED (25%): affiliate gets 25% of 28 bps = 700/10000 = 7.0 bps absolute
//   - STRATEGIC (50%):        affiliate gets 50% of 28 bps = 1400/10000 = 14.0 bps absolute
//
// To upgrade an affiliate's tier: ops creates a new AffiliateConfig with the
// higher feeBps and the integrator swaps it in at createRouter().  No on-chain
// state, no migration — just a config change on next router instantiation.

import type { AffiliateConfig } from "../types.js";

// ─── Tier table ───────────────────────────────────────────────────────────────

/** Named tier identifier — explicit enum-style strings for telemetry/logging. */
export type AffiliateTier = "STANDARD" | "VOLUME_COMMITTED" | "STRATEGIC";

/** Share of the protocol fee (in bps out of 10_000) per tier. */
export const AFFILIATE_TIER_BPS: Readonly<Record<AffiliateTier, number>> = Object.freeze({
  STANDARD: 1_000,          // 10.00% of protocol fee
  VOLUME_COMMITTED: 2_500,  // 25.00% of protocol fee
  STRATEGIC: 5_000,         // 50.00% of protocol fee
});

/** Human-readable label for each tier (for UI / docs / receipts). */
export const AFFILIATE_TIER_LABEL: Readonly<Record<AffiliateTier, string>> = Object.freeze({
  STANDARD: "Standard (10%)",
  VOLUME_COMMITTED: "Volume Committed (25%)",
  STRATEGIC: "Strategic (50%)",
});

/** Eligibility hints — informational only; SDK does not enforce. */
export const AFFILIATE_TIER_ELIGIBILITY: Readonly<Record<AffiliateTier, string>> = Object.freeze({
  STANDARD: "Any integrator — default share, no commitment.",
  VOLUME_COMMITTED: "Sustained $1M/month volume for 6+ months — ops review.",
  STRATEGIC: "Strategic partner — governance vote, token swap, or BD agreement.",
});

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Builds an AffiliateConfig from a tier preset.
 *
 * Validates that the address looks like an EVM address.  Does NOT validate
 * eligibility — that's an ops concern handled at BD time.  Picking
 * STRATEGIC without authorisation just splits more protocol revenue away;
 * EmpX absorbs the cost.
 *
 * @example
 *   const affiliate = makeAffiliateConfig({
 *     address: "0xPartnerWallet",
 *     tier: "VOLUME_COMMITTED",
 *   });
 *   const router = createRouter(CHAIN_IDS.ARBITRUM, provider, { affiliate });
 */
export function makeAffiliateConfig(input: {
  address: string;
  tier: AffiliateTier;
}): AffiliateConfig {
  if (!isHexAddress(input.address)) {
    throw new Error(
      `makeAffiliateConfig: invalid address "${input.address}" — must be 0x-prefixed 40-char hex.`,
    );
  }
  const feeBps = AFFILIATE_TIER_BPS[input.tier];
  if (feeBps === undefined) {
    throw new Error(`makeAffiliateConfig: unknown tier "${input.tier}".`);
  }
  return { address: input.address, feeBps };
}

/**
 * Identifies which tier a given AffiliateConfig matches, or null if it has
 * a custom feeBps value not in the standard tiers.  Useful for telemetry +
 * UI labels.
 */
export function classifyAffiliateTier(config: AffiliateConfig): AffiliateTier | null {
  for (const [tier, bps] of Object.entries(AFFILIATE_TIER_BPS) as Array<[AffiliateTier, number]>) {
    if (config.feeBps === bps) return tier;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isHexAddress(value: string): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}
