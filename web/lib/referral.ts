"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { SITE_URL } from "./config";

/** localStorage key of the referrer from the first `?ref=0x…` link this browser opened. */
const STORAGE_KEY = "referrer";

function parseReferrer(value: string | null | undefined): Address | undefined {
  if (!value || !isAddress(value)) return undefined;
  const address = getAddress(value);
  return address === zeroAddress ? undefined : address;
}

function storedReferrer(): Address | undefined {
  try {
    return parseReferrer(localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/**
 * Saves `?ref=0x…` from any page. First touch wins: once a referrer is saved it is never replaced.
 * Reads the URL with useSearchParams, so render it inside <Suspense>.
 */
export function ReferralCapture() {
  const ref = parseReferrer(useSearchParams().get("ref"));
  useEffect(() => {
    if (!ref || storedReferrer()) return;
    try {
      localStorage.setItem(STORAGE_KEY, ref);
    } catch {}
  }, [ref]);
  return null;
}

/**
 * Referrer to send with a trade by `trader`: the saved one, or the zero address (none). The FeeHook only keeps the
 * first valid referrer a wallet ever trades with and ignores self-referrals, so passing it on every trade is safe.
 */
export function referrerFor(trader: Address): Address {
  const ref = storedReferrer();
  return ref && ref !== getAddress(trader) ? ref : zeroAddress;
}

export function referralLink(address: Address) {
  return `${SITE_URL}/?ref=${getAddress(address)}`;
}
