"use client";

import { useQuery } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { explainRevert, launchRouterAbi, poolKeyFor } from "@app1/shared";
import { deploymentFor } from "./config";

export const SLIPPAGE_OPTIONS = [1, 3, 5, 10] as const;

export function minOut(amount: bigint, slippagePct: number) {
  return (amount * BigInt(Math.round((100 - slippagePct) * 100))) / 10_000n;
}

export function deadlineIn(seconds: number) {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}

export function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`);
}

/** Human-readable message for any wallet / contract error. */
export function describeError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Request rejected in wallet.";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | null;
    if (reverted) {
      return explainRevert(reverted.raw as Hex | undefined) ?? reverted.data?.errorName ?? reverted.shortMessage;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * Live quote through LaunchRouter.quote (an eth_call that simulates the real swap, so fees and the
 * anti-snipe rule for the connected wallet are applied exactly).
 */
export function useQuote(
  chainId: number,
  token: `0x${string}` | undefined,
  isBuy: boolean,
  amountIn: bigint | undefined,
  account: `0x${string}` | undefined,
) {
  const client = usePublicClient({ chainId });
  const d = deploymentFor(chainId);
  return useQuery({
    queryKey: ["quote", chainId, token, isBuy, amountIn?.toString(), account],
    enabled: Boolean(client && d && token && amountIn && amountIn > 0n),
    refetchInterval: 4_000,
    retry: false,
    queryFn: async () => {
      try {
        const { result } = await client!.simulateContract({
          address: d!.router,
          abi: launchRouterAbi,
          functionName: "quote",
          args: [poolKeyFor(token!, d!.hook), isBuy, amountIn!],
          account: account ?? "0x000000000000000000000000000000000000dEaD",
        });
        return result;
      } catch (e) {
        throw new Error(describeError(e));
      }
    },
  });
}

export const permit2DomainAbi = [
  { type: "function", name: "DOMAIN_SEPARATOR", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
] as const;

export const permit2DomainTypes = [
  { name: "name", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export const permit2Types = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;
