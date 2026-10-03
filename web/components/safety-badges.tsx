"use client";

import { Lock, Percent, ShieldCheck, Coins, Timer } from "lucide-react";
import { useT } from "@/lib/i18n";

export function SafetyBadges({ feeBps = 100 }: { feeBps?: number }) {
  const { t } = useT();
  const items = [
    { icon: Lock, title: t("safety.locked"), desc: t("safety.lockedDesc") },
    { icon: Coins, title: t("safety.supply"), desc: t("safety.supplyDesc") },
    { icon: ShieldCheck, title: t("safety.noTax"), desc: t("safety.noTaxDesc") },
    {
      icon: Percent,
      title: t("safety.fee"),
      desc: t("safety.feeDesc").replace("1%", `${feeBps / 100}%`),
    },
    { icon: Timer, title: t("safety.antiSnipe"), desc: t("safety.antiSnipeDesc") },
  ];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">{t("safety.title")}</p>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-buy/15 text-buy">
              <it.icon className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-medium">{it.title}</p>
              <p className="text-xs text-muted-foreground">{it.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
