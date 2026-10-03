"use client";

import { Check, ChevronDown } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveChain } from "@/lib/active-chain";
import { chainName, enabledDeployments } from "@/lib/config";

const dot: Record<number, string> = {
  8453: "bg-blue-500",
  84532: "bg-blue-400",
  4663: "bg-lime-400",
  46630: "bg-lime-300",
  1337: "bg-amber-400",
  1: "bg-slate-400",
};

export function ChainSwitcher() {
  const { chainId, setChainId } = useActiveChain();
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  if (enabledDeployments.length <= 1) {
    return (
      <span className="hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground md:inline-flex">
        <span className={`size-2 rounded-full ${dot[chainId] ?? "bg-primary"}`} />
        {chainName(chainId)}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className={`size-2 rounded-full ${dot[chainId] ?? "bg-primary"}`} />
          <span className="hidden md:inline">{chainName(chainId)}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Network</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {enabledDeployments.map((d) => (
          <DropdownMenuItem
            key={d.chainId}
            onClick={() => {
              setChainId(d.chainId);
              if (isConnected) switchChain({ chainId: d.chainId });
            }}
          >
            <span className={`size-2 rounded-full ${dot[d.chainId] ?? "bg-primary"}`} />
            {chainName(d.chainId)}
            {d.chainId === chainId && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
