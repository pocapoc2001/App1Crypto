/** Every LaunchToken has the same fixed supply. */
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const TICK_SPACING = 200;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const Q96 = 2n ** 96n;

/** Price of one whole token in ETH (as a JS number) from a pool's sqrtPriceX96.
 * Pools are (currency0 = ETH, currency1 = token), so sqrtPrice encodes tokens-per-ETH. */
export function priceEthFromSqrt(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;
  // ETH per token = 2^192 / sqrtP^2, computed in 1e36 fixed point to keep precision for tiny prices.
  const scaled = (Q96 * Q96 * 10n ** 36n) / (sqrtPriceX96 * sqrtPriceX96);
  return Number(scaled) / 1e36;
}

/** Fully-diluted market cap in ETH. */
export function marketCapEthFromSqrt(sqrtPriceX96: bigint): number {
  return priceEthFromSqrt(sqrtPriceX96) * 1_000_000_000;
}

/** Pool key for a launched token (deterministic). */
export function poolKeyFor(token: `0x${string}`, hook: `0x${string}`) {
  return {
    currency0: ZERO_ADDRESS,
    currency1: token,
    fee: 0,
    tickSpacing: TICK_SPACING,
    hooks: hook,
  } as const;
}

/**
 * Theoretical FDV after a buy of `ethIn` (net of fee) when the single launch position is the only
 * liquidity: FDV' = F · (1 + Δ/F)². Useful for UI previews of the curve.
 */
export function fdvAfterBuy(startFdvEth: number, ethInNet: number) {
  return startFdvEth * (1 + ethInNet / startFdvEth) ** 2;
}

export function formatEth(x: number, maxDecimals = 4): string {
  if (x === 0) return "0";
  if (x < 0.0001) return x.toExponential(2);
  return x.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function formatCompact(x: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(x);
}
