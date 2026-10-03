import { decodeErrorResult, type Hex } from "viem";
import { feeHookAbi, launchFactoryAbi, launchRouterAbi } from "./abis";

/** Errors raised by the Uniswap v4 PoolManager itself (hook reverts arrive wrapped in WrappedError). */
export const poolManagerErrorsAbi = [
  {
    type: "error",
    name: "WrappedError",
    inputs: [
      { name: "target", type: "address" },
      { name: "selector", type: "bytes4" },
      { name: "reason", type: "bytes" },
      { name: "details", type: "bytes" },
    ],
  },
  { type: "error", name: "HookCallFailed", inputs: [] },
  { type: "error", name: "CurrencyNotSettled", inputs: [] },
  { type: "error", name: "PriceLimitAlreadyExceeded", inputs: [{ name: "sqrtPriceCurrentX96", type: "uint160" }, { name: "sqrtPriceLimitX96", type: "uint160" }] },
] as const;

const allErrorsAbi = [...poolManagerErrorsAbi, ...feeHookAbi, ...launchRouterAbi, ...launchFactoryAbi];

const friendly: Record<string, string> = {
  AntiSnipeLimit: "Launch protection: max 1% of supply per wallet during the first minute. Try a smaller buy.",
  LaunchLocked: "Trading opens one second after launch. Try again.",
  TooLittleReceived: "Price moved more than your slippage. Try again or raise slippage.",
  DeadlineExpired: "Transaction expired. Try again.",
  DevBuyTooLarge: "Creator buy is too large (max 5% of supply).",
  DevBuySlippage: "Price moved during launch. Try again.",
  InsufficientCreationFee: "Not enough ETH for the creation fee.",
  LaunchesArePaused: "New launches are temporarily paused.",
  InvalidName: "Name must be 1–32 characters.",
  InvalidSymbol: "Ticker must be 1–12 characters.",
  NothingToClaim: "Nothing to claim yet.",
  NotFeeRecipient: "Only the current fee recipient can do this.",
  ZeroAmount: "Enter an amount.",
};

/** Turn raw revert data into a short human message (unwraps PoolManager.WrappedError). */
export function explainRevert(data: Hex | undefined): string | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeErrorResult({ abi: allErrorsAbi, data });
    if (decoded.errorName === "WrappedError") {
      const [, , reason] = decoded.args as readonly [string, string, Hex, Hex];
      return explainRevert(reason) ?? "Swap rejected by the pool.";
    }
    return friendly[decoded.errorName] ?? decoded.errorName;
  } catch {
    return undefined;
  }
}
