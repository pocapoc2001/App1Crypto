import { ponder } from "ponder:registry";
import schema from "ponder:schema";
import { deployments, marketCapEthFromSqrt, priceEthFromSqrt } from "@app1/shared";

const { candle, feeClaim, holder, pool, token, trade } = schema;
const CANDLE_INTERVALS = [60, 300, 900, 3600, 14400, 86400] as const;
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

const tokenId = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;
const toEth = (wei: bigint) => Number(wei) / 1e18;

/** Contracts whose token balances are not "holders" (pool liquidity, burn address, ...). */
function systemAddresses(chainId: number): Set<string> {
  const d = deployments[chainId];
  const list = [ZERO, DEAD];
  if (d) list.push(d.factory, d.hook, d.router, d.poolManager);
  return new Set(list.map((a) => a.toLowerCase()));
}
const systemCache = new Map<number, Set<string>>();
const isSystem = (chainId: number, account: string) => {
  if (!systemCache.has(chainId)) systemCache.set(chainId, systemAddresses(chainId));
  return systemCache.get(chainId)!.has(account.toLowerCase());
};

ponder.on("LaunchFactory:TokenLaunched", async ({ event, context }) => {
  const chainId = context.chain.id;
  const a = event.args;
  const price = priceEthFromSqrt(a.sqrtPriceX96);
  const mcap = marketCapEthFromSqrt(a.sqrtPriceX96);

  await context.db.insert(pool).values({ id: `${chainId}:${a.poolId}`, token: a.token });
  await context.db.insert(token).values({
    id: tokenId(chainId, a.token),
    chainId,
    address: a.token,
    poolId: a.poolId,
    creator: a.creator,
    feeRecipient: a.creator,
    name: a.name,
    symbol: a.symbol,
    metadataURI: a.metadataURI,
    feeBps: a.feeBps,
    creatorShareBps: a.creatorShareBps,
    createdAt: event.block.timestamp,
    createdBlock: event.block.number,
    txHash: event.transaction.hash,
    sqrtPriceX96: a.sqrtPriceX96,
    priceEth: price,
    marketCapEth: mcap,
    athMarketCapEth: mcap,
    volumeEth: 0,
    feesEth: 0,
    buyCount: 0,
    sellCount: 0,
    holderCount: 0,
    devBuyEth: 0,
    devBuyTokens: 0n,
    lastTradeAt: event.block.timestamp,
  });

  // Seed the chart with the launch price.
  for (const interval of CANDLE_INTERVALS) {
    const bucket = (event.block.timestamp / BigInt(interval)) * BigInt(interval);
    await context.db
      .insert(candle)
      .values({
        id: `${chainId}:${a.token.toLowerCase()}:${interval}:${bucket}`,
        chainId,
        token: a.token,
        interval,
        bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volumeEth: 0,
        trades: 0,
      })
      .onConflictDoNothing();
  }
});

ponder.on("LaunchFactory:DevBuy", async ({ event, context }) => {
  await context.db.update(token, { id: tokenId(context.chain.id, event.args.token) }).set({
    devBuyEth: toEth(event.args.ethIn),
    devBuyTokens: event.args.tokensOut,
  });
});

ponder.on("FeeHook:Trade", async ({ event, context }) => {
  const chainId = context.chain.id;
  const a = event.args;
  const p = await context.db.find(pool, { id: `${chainId}:${a.poolId}` });
  if (!p) return; // not one of our pools

  const price = priceEthFromSqrt(a.sqrtPriceX96);
  const mcap = marketCapEthFromSqrt(a.sqrtPriceX96);
  const ethAmount = toEth(a.ethAmount);
  const ts = event.block.timestamp;

  await context.db.insert(trade).values({
    id: `${chainId}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId,
    token: p.token,
    trader: a.trader,
    isBuy: a.isBuy,
    ethAmount: a.ethAmount,
    tokenAmount: a.tokenAmount,
    feeEth: a.feeEth,
    priceEth: price,
    marketCapEth: mcap,
    timestamp: ts,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });

  await context.db.update(token, { id: tokenId(chainId, p.token) }).set((row) => ({
    sqrtPriceX96: a.sqrtPriceX96,
    priceEth: price,
    marketCapEth: mcap,
    athMarketCapEth: Math.max(row.athMarketCapEth, mcap),
    volumeEth: row.volumeEth + ethAmount,
    feesEth: row.feesEth + toEth(a.feeEth),
    buyCount: row.buyCount + (a.isBuy ? 1 : 0),
    sellCount: row.sellCount + (a.isBuy ? 0 : 1),
    lastTradeAt: ts,
  }));

  for (const interval of CANDLE_INTERVALS) {
    const bucket = (ts / BigInt(interval)) * BigInt(interval);
    await context.db
      .insert(candle)
      .values({
        id: `${chainId}:${p.token.toLowerCase()}:${interval}:${bucket}`,
        chainId,
        token: p.token,
        interval,
        bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volumeEth: ethAmount,
        trades: 1,
      })
      .onConflictDoUpdate((row) => ({
        high: Math.max(row.high, price),
        low: Math.min(row.low, price),
        close: price,
        volumeEth: row.volumeEth + ethAmount,
        trades: row.trades + 1,
      }));
  }
});

ponder.on("FeeHook:FeeRecipientTransferred", async ({ event, context }) => {
  const chainId = context.chain.id;
  const p = await context.db.find(pool, { id: `${chainId}:${event.args.poolId}` });
  if (!p) return;
  await context.db.update(token, { id: tokenId(chainId, p.token) }).set({ feeRecipient: event.args.to });
});

ponder.on("FeeHook:FeesClaimed", async ({ event, context }) => {
  await context.db.insert(feeClaim).values({
    id: `${context.chain.id}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId: context.chain.id,
    recipient: event.args.recipient,
    amount: event.args.amount,
    isProtocol: false,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

ponder.on("FeeHook:ProtocolFeesClaimed", async ({ event, context }) => {
  await context.db.insert(feeClaim).values({
    id: `${context.chain.id}:${event.transaction.hash}:${event.log.logIndex}`,
    chainId: context.chain.id,
    recipient: event.args.treasury,
    amount: event.args.amount,
    isProtocol: true,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
});

ponder.on("LaunchToken:Transfer", async ({ event, context }) => {
  const chainId = context.chain.id;
  const tokenAddr = event.log.address;
  const { from, to, amount } = event.args;
  if (amount === 0n || from.toLowerCase() === to.toLowerCase()) return;

  let holderDelta = 0;
  if (!isSystem(chainId, from)) {
    const row = await context.db
      .update(holder, { id: `${chainId}:${tokenAddr.toLowerCase()}:${from.toLowerCase()}` })
      .set((r) => ({ balance: r.balance - amount }));
    if (row.balance === 0n) holderDelta -= 1;
  }
  if (!isSystem(chainId, to)) {
    const row = await context.db
      .insert(holder)
      .values({
        id: `${chainId}:${tokenAddr.toLowerCase()}:${to.toLowerCase()}`,
        chainId,
        token: tokenAddr,
        account: to,
        balance: amount,
      })
      .onConflictDoUpdate((r) => ({ balance: r.balance + amount }));
    if (row.balance === amount) holderDelta += 1;
  }
  if (holderDelta !== 0) {
    const id = tokenId(chainId, tokenAddr);
    if (await context.db.find(token, { id })) {
      await context.db.update(token, { id }).set((r) => ({ holderCount: r.holderCount + holderDelta }));
    }
  }
});
