import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, client, desc, eq, graphql, gt, ilike, or, replaceBigInts, sql } from "ponder";

const { token, trade, candle, holder, feeClaim, referral, referralFee } = schema;
const app = new Hono();

app.use("*", cors());
app.use("/sql/*", client({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

/** bigint -> string so responses are valid JSON. */
const json = <T>(c: { json: (v: unknown) => Response }, value: T) =>
  c.json(replaceBigInts(value, (v) => v.toString()));

const intParam = (v: string | undefined, def: number, max: number) =>
  Math.min(Math.max(Number.parseInt(v ?? "", 10) || def, 0), max);

const addr = (v: string) => v.toLowerCase() as `0x${string}`;

/**
 * GET /tokens?chainId=84532&sort=new|trending|mcap|active&q=pepe&limit=30&offset=0
 * "trending" = most ETH volume in the last 24h.
 */
app.get("/tokens", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  const sort = c.req.query("sort") ?? "new";
  const q = c.req.query("q")?.trim();
  const limit = intParam(c.req.query("limit"), 30, 100);
  const offset = intParam(c.req.query("offset"), 0, 10_000);

  const filters = [eq(token.chainId, chainId)];
  if (q) {
    const like = `%${q}%`;
    filters.push(
      or(ilike(token.name, like), ilike(token.symbol, like), eq(token.address, q.toLowerCase() as `0x${string}`))!,
    );
  }

  if (sort === "trending") {
    const since = BigInt(Math.floor(Date.now() / 1000) - 86_400);
    const vol = db
      .select({
        token: trade.token,
        volume24h: sql<string>`sum(${trade.ethAmount})`.as("volume24h"),
        trades24h: sql<number>`count(*)`.as("trades24h"),
      })
      .from(trade)
      .where(and(eq(trade.chainId, chainId), gt(trade.timestamp, since)))
      .groupBy(trade.token)
      .as("vol");
    const rows = await db
      .select({ token, volume24h: vol.volume24h, trades24h: vol.trades24h })
      .from(token)
      .innerJoin(vol, eq(vol.token, token.address))
      .where(and(...filters))
      .orderBy(desc(vol.volume24h))
      .limit(limit)
      .offset(offset);
    return json(
      c,
      rows.map((r) => ({ ...r.token, volume24hEth: Number(r.volume24h) / 1e18, trades24h: Number(r.trades24h) })),
    );
  }

  const order =
    sort === "mcap" ? desc(token.marketCapEth) : sort === "active" ? desc(token.lastTradeAt) : desc(token.createdAt);
  const rows = await db
    .select()
    .from(token)
    .where(and(...filters))
    .orderBy(order)
    .limit(limit)
    .offset(offset);
  return json(c, rows);
});

app.get("/tokens/:chainId/:address", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const id = `${chainId}:${addr(c.req.param("address"))}`;
  const rows = await db.select().from(token).where(eq(token.id, id)).limit(1);
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  const since = BigInt(Math.floor(Date.now() / 1000) - 86_400);
  const [stats] = await db
    .select({
      volume24h: sql<string>`coalesce(sum(${trade.ethAmount}), 0)`,
      trades24h: sql<number>`count(*)`,
    })
    .from(trade)
    .where(and(eq(trade.chainId, chainId), eq(trade.token, rows[0]!.address), gt(trade.timestamp, since)));
  return json(c, { ...rows[0], volume24hEth: Number(stats?.volume24h ?? 0) / 1e18, trades24h: Number(stats?.trades24h ?? 0) });
});

app.get("/tokens/:chainId/:address/trades", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const limit = intParam(c.req.query("limit"), 50, 200);
  const rows = await db
    .select()
    .from(trade)
    .where(and(eq(trade.chainId, chainId), eq(trade.token, addr(c.req.param("address")))))
    .orderBy(desc(trade.timestamp), desc(trade.id))
    .limit(limit);
  return json(c, rows);
});

app.get("/tokens/:chainId/:address/candles", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const interval = intParam(c.req.query("interval"), 300, 86_400);
  const rows = await db
    .select()
    .from(candle)
    .where(
      and(eq(candle.chainId, chainId), eq(candle.token, addr(c.req.param("address"))), eq(candle.interval, interval)),
    )
    .orderBy(desc(candle.bucket))
    .limit(1000);
  return json(c, rows.reverse());
});

app.get("/tokens/:chainId/:address/holders", async (c) => {
  const chainId = Number(c.req.param("chainId"));
  const limit = intParam(c.req.query("limit"), 20, 100);
  const rows = await db
    .select()
    .from(holder)
    .where(and(eq(holder.chainId, chainId), eq(holder.token, addr(c.req.param("address"))), gt(holder.balance, 0n)))
    .orderBy(desc(holder.balance))
    .limit(limit);
  return json(c, rows);
});

/** Live feed of the latest trades on a chain (home page ticker). */
app.get("/trades/recent", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  const limit = intParam(c.req.query("limit"), 20, 100);
  const rows = await db
    .select({ trade, symbol: token.symbol, name: token.name, metadataURI: token.metadataURI })
    .from(trade)
    .innerJoin(token, and(eq(token.chainId, trade.chainId), eq(token.address, trade.token)))
    .where(eq(trade.chainId, chainId))
    .orderBy(desc(trade.timestamp), desc(trade.id))
    .limit(limit);
  return json(
    c,
    rows.map((r) => ({ ...r.trade, symbol: r.symbol, name: r.name, metadataURI: r.metadataURI })),
  );
});

/** Tokens created by an address + lifetime creator earnings. */
app.get("/creators/:address", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  const who = addr(c.req.param("address"));
  const created = await db
    .select()
    .from(token)
    .where(and(eq(token.chainId, chainId), eq(token.creator, who)))
    .orderBy(desc(token.createdAt));
  const claims = await db
    .select()
    .from(feeClaim)
    .where(and(eq(feeClaim.chainId, chainId), eq(feeClaim.recipient, who), eq(feeClaim.isProtocol, false)))
    .orderBy(desc(feeClaim.timestamp));
  const earnedEth = created.reduce((s, t) => s + (t.feesEth * t.creatorShareBps) / 10_000, 0);
  return json(c, { created, claims, earnedEth });
});

/**
 * GET /referrals/:address?chainId=84532
 * Traders bound to `address` as their (sticky) referrer, and the lifetime referral fees it earned.
 */
app.get("/referrals/:address", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  if (!Number.isInteger(chainId)) return c.json({ error: "chainId query parameter required" }, 400);
  const who = addr(c.req.param("address"));
  const [traders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(referral)
    .where(and(eq(referral.chainId, chainId), eq(referral.referrer, who)));
  const [fees] = await db
    .select({ total: sql<string>`coalesce(sum(${referralFee.amount}), 0)` })
    .from(referralFee)
    .where(and(eq(referralFee.chainId, chainId), eq(referralFee.referrer, who)));
  const earnedWei = BigInt(fees?.total ?? 0);
  return json(c, { referredTraders: Number(traders?.count ?? 0), earnedWei, earnedEth: Number(earnedWei) / 1e18 });
});

/** Token balances of an address (portfolio). */
app.get("/holdings/:address", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  const rows = await db
    .select({ holder, token })
    .from(holder)
    .innerJoin(token, and(eq(token.chainId, holder.chainId), eq(token.address, holder.token)))
    .where(and(eq(holder.chainId, chainId), eq(holder.account, addr(c.req.param("address"))), gt(holder.balance, 0n)))
    .orderBy(desc(holder.balance));
  return json(
    c,
    rows.map((r) => ({ ...r.token, balance: r.holder.balance })),
  );
});

app.get("/stats", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  const [s] = await db
    .select({
      tokens: sql<number>`count(*)`,
      volumeEth: sql<number>`coalesce(sum(${token.volumeEth}), 0)`,
      feesEth: sql<number>`coalesce(sum(${token.feesEth}), 0)`,
    })
    .from(token)
    .where(eq(token.chainId, chainId));
  return json(c, { tokens: Number(s?.tokens ?? 0), volumeEth: Number(s?.volumeEth ?? 0), feesEth: Number(s?.feesEth ?? 0) });
});

export default app;
