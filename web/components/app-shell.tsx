"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BookOpen, Compass, Menu, PlusCircle, Rocket, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChainSwitcher } from "@/components/chain-switcher";
import { LanguageToggle } from "@/components/language-toggle";
import { TestnetBanner } from "@/components/testnet-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function useNav() {
  const { t } = useT();
  const { address } = useAccount();
  return [
    { href: "/", label: t("nav.home"), icon: Compass },
    { href: "/create", label: t("nav.create"), icon: PlusCircle },
    { href: address ? `/profile/${address}` : "/profile", label: t("nav.profile"), icon: User },
    { href: "/how-it-works", label: t("nav.how"), icon: BookOpen },
  ];
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Rocket className="size-4" />
      </span>
      <span className="text-lg">{APP_NAME}</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav();
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Logo />
        <div>
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("nav.navigation")}
          </p>
          <NavLinks />
        </div>
        <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">50% to creators</p>
          <p className="mt-1">Every trade pays a 1% fee in ETH — half goes to the coin&apos;s creator.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TestnetBanner />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-lg">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="mb-6">
                <Logo />
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-6 flex gap-2 sm:hidden">
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/create">
                <PlusCircle /> {t("nav.create")}
              </Link>
            </Button>
            <ChainSwitcher />
            <div className="hidden gap-2 sm:flex">
              <LanguageToggle />
              <ThemeToggle />
            </div>
            <ConnectButton chainStatus="none" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
