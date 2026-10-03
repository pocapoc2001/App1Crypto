import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { APP_NAME, SITE_URL } from "@/lib/config";
import { ReferralCapture } from "@/lib/referral";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${APP_NAME} — launch a coin, earn 50% of fees`, template: `%s · ${APP_NAME}` },
  description:
    "One-click token launches on Base and Robinhood Chain. Liquidity locked by code, fixed supply, and creators earn 50% of every trading fee in ETH.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <Providers>
          {/* Saves ?ref=0x… from any page. Suspense keeps the rest of each page statically prerendered. */}
          <Suspense fallback={null}>
            <ReferralCapture />
          </Suspense>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
