"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ActiveChainProvider } from "@/lib/active-chain";
import { defaultChainId } from "@/lib/config";
import { LanguageProvider } from "@/lib/i18n";
import { wagmiConfig } from "@/lib/wagmi";

function ThemedRainbowKit({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const accent = { accentColor: "hsl(245 70% 64%)", accentColorForeground: "white", borderRadius: "medium" } as const;
  return (
    <RainbowKitProvider
      initialChain={defaultChainId}
      theme={resolvedTheme === "light" ? lightTheme(accent) : darkTheme(accent)}
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, refetchOnWindowFocus: false } } }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <LanguageProvider>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <ThemedRainbowKit>
              <ActiveChainProvider>
                <TooltipProvider>
                  {children}
                  <Toaster richColors position="bottom-right" />
                </TooltipProvider>
              </ActiveChainProvider>
            </ThemedRainbowKit>
          </QueryClientProvider>
        </WagmiProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
