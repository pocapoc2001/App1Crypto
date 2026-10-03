import { index, onchainTable } from "ponder";

/** Ids are `${chainId}:${...}` strings so one database can index several chains. */

export const token = onchainTable(
  "token",
  (t) => ({
    id: t.text().primaryKey(), // chainId:address
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),
    poolId: t.hex().notNull(),
    creator: t.hex().notNull(),
    feeRecipient: t.hex().notNull(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    metadataURI: t.text().notNull(),
    feeBps: t.integer().notNull(),
    creatorShareBps: t.integer().notNull(),
    createdAt: t.bigint().notNull(),
    createdBlock: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    sqrtPriceX96: t.bigint().notNull(),
    priceEth: t.doublePrecision().notNull(),
    marketCapEth: t.doublePrecision().notNull(),
    athMarketCapEth: t.doublePrecision().notNull(),
    volumeEth: t.doublePrecision().notNull(),
    feesEth: t.doublePrecision().notNull(),
    buyCount: t.integer().notNull(),
    sellCount: t.integer().notNull(),
    holderCount: t.integer().notNull(),
    devBuyEth: t.doublePrecision().notNull(),
    devBuyTokens: t.bigint().notNull(),
    lastTradeAt: t.bigint().notNull(),
  }),
  (table) => ({
    chainCreatedIdx: index().on(table.chainId, table.createdAt),
    chainMcapIdx: index().on(table.chainId, table.marketCapEth),
    creatorIdx: index().on(table.creator),
    poolIdx: index().on(table.chainId, table.poolId),
  }),
);

/** poolId -> token lookup used by FeeHook events. */
export const pool = onchainTable("pool", (t) => ({
  id: t.text().primaryKey(), // chainId:poolId
  token: t.hex().notNull(),
}));

export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(), // chainId:txHash:logIndex
    chainId: t.integer().notNull(),
    token: t.hex().notNull(),
    trader: t.hex().notNull(),
    isBuy: t.boolean().notNull(),
    ethAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    feeEth: t.bigint().notNull(),
    priceEth: t.doublePrecision().notNull(),
    marketCapEth: t.doublePrecision().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenTimeIdx: index().on(table.chainId, table.token, table.timestamp),
    chainTimeIdx: index().on(table.chainId, table.timestamp),
    traderIdx: index().on(table.trader),
  }),
);

export const candle = onchainTable(
  "candle",
  (t) => ({
    id: t.text().primaryKey(), // chainId:token:interval:bucket
    chainId: t.integer().notNull(),
    token: t.hex().notNull(),
    interval: t.integer().notNull(), // seconds
    bucket: t.bigint().notNull(), // bucket start (unix seconds)
    open: t.doublePrecision().notNull(),
    high: t.doublePrecision().notNull(),
    low: t.doublePrecision().notNull(),
    close: t.doublePrecision().notNull(),
    volumeEth: t.doublePrecision().notNull(),
    trades: t.integer().notNull(),
  }),
  (table) => ({
    seriesIdx: index().on(table.chainId, table.token, table.interval, table.bucket),
  }),
);

export const holder = onchainTable(
  "holder",
  (t) => ({
    id: t.text().primaryKey(), // chainId:token:account
    chainId: t.integer().notNull(),
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    balance: t.bigint().notNull(),
  }),
  (table) => ({
    tokenBalanceIdx: index().on(table.chainId, table.token, table.balance),
    accountIdx: index().on(table.account),
  }),
);

export const feeClaim = onchainTable(
  "fee_claim",
  (t) => ({
    id: t.text().primaryKey(), // chainId:txHash:logIndex
    chainId: t.integer().notNull(),
    recipient: t.hex().notNull(),
    amount: t.bigint().notNull(),
    isProtocol: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    recipientIdx: index().on(table.recipient),
  }),
);

/** Sticky referral bindings (FeeHook.ReferrerSet): at most one per trader, never changed. */
export const referral = onchainTable(
  "referral",
  (t) => ({
    id: t.text().primaryKey(), // chainId:trader
    chainId: t.integer().notNull(),
    trader: t.hex().notNull(),
    referrer: t.hex().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    referrerIdx: index().on(table.chainId, table.referrer),
  }),
);

/** Referral cuts of the platform fee (FeeHook.ReferralFeeAccrued), claimable by the referrer. */
export const referralFee = onchainTable(
  "referral_fee",
  (t) => ({
    id: t.text().primaryKey(), // chainId:txHash:logIndex
    chainId: t.integer().notNull(),
    poolId: t.hex().notNull(),
    referrer: t.hex().notNull(),
    trader: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    referrerIdx: index().on(table.chainId, table.referrer),
  }),
);
