"use client";

import { Coins, Rocket, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SafetyBadges } from "@/components/safety-badges";
import { APP_NAME } from "@/lib/config";
import { useT, type Language } from "@/lib/i18n";

const copy: Record<
  Language,
  {
    title: string;
    intro: string;
    steps: { title: string; body: string }[];
    feesTitle: string;
    feeRows: [string, string][];
    curveTitle: string;
    curveBody: string;
    faqTitle: string;
    faq: { q: string; a: string }[];
  }
> = {
  en: {
    title: "How it works",
    intro: `${APP_NAME} launches every coin straight into a Uniswap v4 pool. There is no presale and no bonding-curve migration: trading starts the second the coin exists.`,
    steps: [
      { title: "1. Launch", body: "Pick a name, ticker and image. The contract creates a fixed supply of 1 billion tokens and puts all of them into a Uniswap v4 pool, locked forever." },
      { title: "2. Trade", body: "Anyone can buy and sell instantly here, on Uniswap or through aggregators. Every trade pays a 1% fee in ETH." },
      { title: "3. Earn", body: "Half of every fee goes to the coin's creator, in ETH. Claim whenever you want from your profile — no expiry, no minimum." },
    ],
    feesTitle: "Fees",
    feeRows: [
      ["Swap fee (buy or sell)", "1% of the ETH amount"],
      ["Creator share", "50% of the fee"],
      ["Platform share", "50% of the fee"],
      ["Referrer share (if the trader was referred)", "20% of the platform share — the trader pays nothing extra"],
      ["Launching a coin", "Free (gas only)"],
      ["Hard cap in the contract", "2% — and existing pools can never change"],
    ],
    curveTitle: "Price curve",
    curveBody:
      "Each coin starts at a small market cap F (about 1.5 ETH). Because all liquidity sits in one range above the starting price, buying Δ ETH moves the market cap to roughly F × (1 + Δ/F)². Example: with F = 1.5 ETH, 1.5 ETH of buys makes it 4×.",
    faqTitle: "FAQ",
    faq: [
      { q: "Can the creator rug?", a: "They can't pull liquidity, mint, tax, blacklist or pause — none of those functions exist. A creator who bought at launch can still sell their own tokens like anyone else; the coin page shows exactly how much they bought (max 5%)." },
      { q: "Can the platform change the fee on my coin?", a: "No. Fee and creator share are written into the pool at launch. The owner can only change settings for future launches, and never above 2%." },
      { q: "What is launch protection?", a: "For the first 60 seconds each wallet can buy at most 1% of supply, and nobody except the creator can trade in the launch block. This slows down sniper bots." },
      { q: "Where do I see my earnings?", a: "On your profile. Fees from all your coins accumulate in one balance you can claim in ETH." },
      { q: "How do referral links work?", a: "Copy your link from your profile. The first time someone trades through a referral link, that referrer is attached to their wallet for good. The referrer then earns 20% of the platform's share of every fee that wallet pays, in ETH, claimable from the profile. Creators keep their full 50%, and the trader pays nothing extra." },
    ],
  },
  ro: {
    title: "Cum funcționează",
    intro: `${APP_NAME} lansează fiecare monedă direct într-un pool Uniswap v4. Fără presale și fără migrare de pe bonding curve: tranzacționarea începe în secunda în care moneda există.`,
    steps: [
      { title: "1. Lansare", body: "Alegi un nume, un simbol și o imagine. Contractul creează o ofertă fixă de 1 miliard de monede și le pune pe toate într-un pool Uniswap v4, blocat pentru totdeauna." },
      { title: "2. Tranzacționare", body: "Oricine poate cumpăra și vinde instant aici, pe Uniswap sau prin agregatoare. Fiecare tranzacție plătește un comision de 1% în ETH." },
      { title: "3. Câștig", body: "Jumătate din fiecare comision merge la creatorul monedei, în ETH. Retragi oricând din profil — fără expirare, fără minim." },
    ],
    feesTitle: "Comisioane",
    feeRows: [
      ["Comision de swap (cumpărare sau vânzare)", "1% din suma în ETH"],
      ["Partea creatorului", "50% din comision"],
      ["Partea platformei", "50% din comision"],
      ["Partea celui care recomandă (dacă traderul a fost recomandat)", "20% din partea platformei — traderul nu plătește nimic în plus"],
      ["Lansarea unei monede", "Gratuită (doar gas)"],
      ["Limită maximă în contract", "2% — iar pool-urile existente nu se pot schimba"],
    ],
    curveTitle: "Curba de preț",
    curveBody:
      "Fiecare monedă pornește de la o capitalizare mică F (aprox. 1,5 ETH). Pentru că toată lichiditatea e într-un singur interval peste prețul de start, cumpărarea a Δ ETH duce capitalizarea la aproximativ F × (1 + Δ/F)². Exemplu: cu F = 1,5 ETH, cumpărări de 1,5 ETH o înmulțesc cu 4.",
    faqTitle: "Întrebări frecvente",
    faq: [
      { q: "Poate creatorul să dea rug pull?", a: "Nu poate retrage lichiditatea, nu poate emite monede noi, pune taxe, bloca adrese sau opri tranzacționarea — aceste funcții nu există. Un creator care a cumpărat la lansare își poate vinde propriile monede ca oricine altcineva; pagina monedei arată exact cât a cumpărat (max. 5%)." },
      { q: "Poate platforma să schimbe comisionul monedei mele?", a: "Nu. Comisionul și partea creatorului sunt scrise în pool la lansare. Proprietarul poate schimba doar setările pentru lansări viitoare și niciodată peste 2%." },
      { q: "Ce este protecția la lansare?", a: "În primele 60 de secunde fiecare portofel poate cumpăra maxim 1% din total, iar în blocul de lansare nu poate tranzacționa nimeni în afară de creator. Asta încetinește boții." },
      { q: "Unde îmi văd câștigurile?", a: "În profil. Comisioanele de la toate monedele tale se adună într-un singur sold pe care îl retragi în ETH." },
      { q: "Cum funcționează linkurile de recomandare?", a: "Copiază linkul din profil. Prima dată când cineva tranzacționează printr-un link de recomandare, cel care l-a recomandat rămâne legat de portofelul lui pentru totdeauna. Acesta primește apoi 20% din partea platformei din fiecare comision plătit de acel portofel, în ETH, retras din profil. Creatorii își păstrează întregul 50%, iar traderul nu plătește nimic în plus." },
    ],
  },
};

export function HowItWorks() {
  const { language, t } = useT();
  const c = copy[language];
  const icons = [Rocket, TrendingUp, Coins];
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p className="mt-2 text-muted-foreground">{c.intro}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {c.steps.map((s, i) => {
          const Icon = icons[i]!;
          return (
            <div key={s.title} className="rounded-2xl border bg-card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" />
              </span>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-3 font-semibold">{c.feesTitle}</p>
          <dl className="divide-y text-sm">
            {c.feeRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <SafetyBadges />
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="font-semibold">{c.curveTitle}</p>
        <p className="mt-2 text-sm text-muted-foreground">{c.curveBody}</p>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="mb-3 font-semibold">{c.faqTitle}</p>
        <div className="space-y-4">
          {c.faq.map((f) => (
            <div key={f.q}>
              <p className="text-sm font-medium">{f.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Button asChild size="lg">
          <Link href="/create">{t("home.cta")}</Link>
        </Button>
      </div>
    </div>
  );
}
