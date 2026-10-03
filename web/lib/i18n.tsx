"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useLocalPref } from "./local-pref";

export type Language = "en" | "ro";

const en = {
  "nav.home": "Explore",
  "nav.create": "Create coin",
  "nav.profile": "My profile",
  "nav.how": "How it works",
  "nav.navigation": "Navigation",

  "home.title": "Launch a coin in 30 seconds.",
  "home.subtitle": "Earn 50% of every trading fee, forever. Liquidity is locked by code — no rugs.",
  "home.cta": "Create a coin",
  "home.learn": "How it works",
  "home.trending": "Trending",
  "home.new": "New",
  "home.top": "Top market cap",
  "home.active": "Last trade",
  "home.search": "Search name, ticker or address",
  "home.empty": "No coins yet on this chain. Be the first!",
  "home.live": "Live trades",
  "home.liveOn": "Live on",
  "ticker.bought": "bought",
  "ticker.sold": "sold",
  "ticker.of": "of",

  "stats.tokens": "Coins launched",
  "stats.volume": "Total volume",
  "stats.creatorFees": "Paid to creators",

  "token.mcap": "Market cap",
  "token.volume24h": "24h volume",
  "token.holders": "Holders",
  "token.created": "Created",
  "token.creator": "Creator",
  "token.ath": "All-time high",
  "token.trades": "Trades",
  "token.topHolders": "Top holders",
  "token.contract": "Contract",
  "token.share": "Share",
  "token.devBuy": "Creator bought at launch",
  "token.notFound": "Coin not found (yet). If you just created it, give the indexer a few seconds.",
  "token.fees": "Trading fees generated",

  "trade.buy": "Buy",
  "trade.sell": "Sell",
  "trade.amount": "Amount",
  "trade.youReceive": "You receive (estimated)",
  "trade.slippage": "Slippage",
  "trade.connect": "Connect wallet",
  "trade.wrongChain": "Switch network",
  "trade.balance": "Balance",
  "trade.fee": "1% fee (half goes to the creator)",
  "trade.placeBuy": "Buy",
  "trade.placeSell": "Sell",
  "trade.signing": "Sign in wallet…",
  "trade.pending": "Confirming…",
  "trade.success": "Trade confirmed",

  "create.title": "Create a new coin",
  "create.subtitle": "Free to launch. You earn 50% of the 1% trading fee on every trade, paid in ETH.",
  "create.image": "Image",
  "create.imageHint": "PNG, JPG, GIF or WEBP — max 2 MB",
  "create.name": "Name",
  "create.symbol": "Ticker",
  "create.description": "Description",
  "create.website": "Website",
  "create.twitter": "X / Twitter",
  "create.telegram": "Telegram",
  "create.devBuy": "Buy at launch (optional)",
  "create.devBuyHint": "Be the first buyer. Max 5% of supply.",
  "create.submit": "Launch coin",
  "create.uploading": "Uploading image…",
  "create.confirming": "Confirm in wallet…",
  "create.mining": "Launching…",
  "create.summary": "What you get",
  "create.optional": "optional",

  "safety.title": "Safety checks",
  "safety.locked": "Liquidity locked forever",
  "safety.lockedDesc": "The launch contract has no function to remove liquidity.",
  "safety.supply": "Fixed supply: 1,000,000,000",
  "safety.supplyDesc": "No mint function. Nobody can create more tokens.",
  "safety.noTax": "No taxes, blacklist or pause",
  "safety.noTaxDesc": "Plain ERC-20. Holders can always sell.",
  "safety.fee": "Fee capped by code",
  "safety.feeDesc": "This pool charges 1%. The contract can never exceed 2%, and existing pools never change.",
  "safety.antiSnipe": "Fair launch protection",
  "safety.antiSnipeDesc": "Max 1% of supply per wallet in the first minute.",

  "profile.title": "Profile",
  "profile.claimable": "Claimable fees",
  "profile.claim": "Claim ETH",
  "profile.earned": "Lifetime creator earnings",
  "profile.created": "Coins created",
  "profile.holdings": "Holdings",
  "profile.transfer": "Transfer fee rights",
  "profile.transferHint": "Send this coin's future creator fees to another wallet (e.g. a community takeover). Fees already earned stay with you.",
  "profile.connectPrompt": "Connect your wallet to see your profile.",
  "profile.nothing": "Nothing here yet.",

  "referral.yourLink": "Your referral link",
  "referral.title": "Referrals",
  "referral.hint":
    "Traders who arrive through your link and haven't been referred before stay linked to you for good: you earn {share}% of the platform fee ({volume}% of their volume) on every trade they make, in ETH. They pay nothing extra.",
  "referral.traders": "Referred traders",
  "referral.earned": "Referral earnings",
  "referral.earnedHint": "Added to your claimable fees",
  "referral.copied": "Referral link copied",
  "referral.copyFailed": "Couldn't copy. Select the link and copy it manually.",

  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.viewExplorer": "View on explorer",
  "common.ago": "ago",
} as const;

type Key = keyof typeof en;

const ro: Record<Key, string> = {
  "nav.home": "Explorează",
  "nav.create": "Creează monedă",
  "nav.profile": "Profilul meu",
  "nav.how": "Cum funcționează",
  "nav.navigation": "Navigare",

  "home.title": "Lansează o monedă în 30 de secunde.",
  "home.subtitle": "Câștigi 50% din fiecare comision de tranzacționare, pentru totdeauna. Lichiditatea e blocată prin cod — fără rug pull.",
  "home.cta": "Creează o monedă",
  "home.learn": "Cum funcționează",
  "home.trending": "În trend",
  "home.new": "Noi",
  "home.top": "Capitalizare mare",
  "home.active": "Ultima tranzacție",
  "home.search": "Caută nume, simbol sau adresă",
  "home.empty": "Nicio monedă pe această rețea. Fii primul!",
  "home.live": "Tranzacții live",
  "home.liveOn": "Live pe",
  "ticker.bought": "a cumpărat",
  "ticker.sold": "a vândut",
  "ticker.of": "",

  "stats.tokens": "Monede lansate",
  "stats.volume": "Volum total",
  "stats.creatorFees": "Plătit creatorilor",

  "token.mcap": "Capitalizare",
  "token.volume24h": "Volum 24h",
  "token.holders": "Deținători",
  "token.created": "Creată",
  "token.creator": "Creator",
  "token.ath": "Maxim istoric",
  "token.trades": "Tranzacții",
  "token.topHolders": "Top deținători",
  "token.contract": "Contract",
  "token.share": "Distribuie",
  "token.devBuy": "Creatorul a cumpărat la lansare",
  "token.notFound": "Moneda nu a fost găsită (încă). Dacă tocmai ai creat-o, așteaptă câteva secunde.",
  "token.fees": "Comisioane generate",

  "trade.buy": "Cumpără",
  "trade.sell": "Vinde",
  "trade.amount": "Sumă",
  "trade.youReceive": "Primești (estimat)",
  "trade.slippage": "Slippage",
  "trade.connect": "Conectează portofelul",
  "trade.wrongChain": "Schimbă rețeaua",
  "trade.balance": "Sold",
  "trade.fee": "Comision 1% (jumătate merge la creator)",
  "trade.placeBuy": "Cumpără",
  "trade.placeSell": "Vinde",
  "trade.signing": "Semnează în portofel…",
  "trade.pending": "Se confirmă…",
  "trade.success": "Tranzacție confirmată",

  "create.title": "Creează o monedă nouă",
  "create.subtitle": "Lansarea e gratuită. Câștigi 50% din comisionul de 1% la fiecare tranzacție, plătit în ETH.",
  "create.image": "Imagine",
  "create.imageHint": "PNG, JPG, GIF sau WEBP — max. 2 MB",
  "create.name": "Nume",
  "create.symbol": "Simbol",
  "create.description": "Descriere",
  "create.website": "Website",
  "create.twitter": "X / Twitter",
  "create.telegram": "Telegram",
  "create.devBuy": "Cumpără la lansare (opțional)",
  "create.devBuyHint": "Fii primul cumpărător. Maxim 5% din total.",
  "create.submit": "Lansează moneda",
  "create.uploading": "Se încarcă imaginea…",
  "create.confirming": "Confirmă în portofel…",
  "create.mining": "Se lansează…",
  "create.summary": "Ce primești",
  "create.optional": "opțional",

  "safety.title": "Verificări de siguranță",
  "safety.locked": "Lichiditate blocată pentru totdeauna",
  "safety.lockedDesc": "Contractul de lansare nu are nicio funcție de retragere a lichidității.",
  "safety.supply": "Ofertă fixă: 1.000.000.000",
  "safety.supplyDesc": "Fără funcție de mint. Nimeni nu poate crea alte monede.",
  "safety.noTax": "Fără taxe, blacklist sau pauză",
  "safety.noTaxDesc": "ERC-20 simplu. Deținătorii pot vinde oricând.",
  "safety.fee": "Comision limitat prin cod",
  "safety.feeDesc": "Acest pool are 1%. Contractul nu poate depăși niciodată 2%, iar pool-urile existente nu se schimbă.",
  "safety.antiSnipe": "Protecție la lansare",
  "safety.antiSnipeDesc": "Maxim 1% din total per portofel în primul minut.",

  "profile.title": "Profil",
  "profile.claimable": "Comisioane disponibile",
  "profile.claim": "Retrage ETH",
  "profile.earned": "Câștiguri totale ca creator",
  "profile.created": "Monede create",
  "profile.holdings": "Dețineri",
  "profile.transfer": "Transferă drepturile de comision",
  "profile.transferHint": "Trimite comisioanele viitoare ale acestei monede către alt portofel (ex. preluare de comunitate). Comisioanele deja câștigate rămân ale tale.",
  "profile.connectPrompt": "Conectează portofelul pentru a vedea profilul.",
  "profile.nothing": "Nimic aici încă.",

  "referral.yourLink": "Linkul tău de recomandare",
  "referral.title": "Recomandări",
  "referral.hint":
    "Cei care ajung prin linkul tău și nu au mai fost recomandați de altcineva rămân legați de tine pentru totdeauna: câștigi {share}% din comisionul platformei ({volume}% din volumul lor) la fiecare tranzacție, în ETH. Ei nu plătesc nimic în plus.",
  "referral.traders": "Traderi recomandați",
  "referral.earned": "Câștiguri din recomandări",
  "referral.earnedHint": "Se adaugă la comisioanele disponibile",
  "referral.copied": "Link de recomandare copiat",
  "referral.copyFailed": "Nu s-a putut copia. Selectează linkul și copiază-l manual.",

  "common.cancel": "Anulează",
  "common.confirm": "Confirmă",
  "common.copy": "Copiază",
  "common.copied": "Copiat",
  "common.viewExplorer": "Vezi în explorer",
  "common.ago": "în urmă",
};

const dictionaries: Record<Language, Record<Key, string>> = { en, ro };

type Ctx = { language: Language; setLanguage: (l: Language) => void; t: (key: Key) => string };
const LanguageContext = createContext<Ctx | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [saved, save] = useLocalPref("lang", "en");
  const language: Language = saved === "ro" ? "ro" : "en";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((l: Language) => save(l), [save]);

  const t = useCallback((key: Key) => dictionaries[language][key] ?? en[key], [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside LanguageProvider");
  return ctx;
}
