# Deploying FlowPad (public testnet)

| Piece | Host | Config in repo |
| --- | --- | --- |
| Web app (Next.js) | **Vercel** | `web/vercel.json`, `web/.env.production.example` |
| Indexer (Ponder) + PostgreSQL | **Railway** | `indexer/railway.json`, `indexer/.env.production.example` |
| Contracts | already on Base Sepolia | `contracts/deployments/84532.json` |

Order matters: **Railway first** (you need the indexer URL), **then Vercel**. Both redeploy automatically on every push to `main`.

---

## 0. Accounts and keys (all free tiers)

1. **Alchemy** (reliable RPC). Go to [dashboard.alchemy.com](https://dashboard.alchemy.com) → **Create new app** → chain **Base**, network **Base Sepolia**. Create **two** apps:
   - `flowpad-indexer`: its HTTPS URL is used by Railway and stays server-side.
   - `flowpad-web`: its HTTPS URL is used by the browser. After launch, open the app's **Security** settings and add your site domain under **Allowlisted origins**.
2. **Pinata** (coin images, required). In [app.pinata.cloud](https://app.pinata.cloud):
   - **API Keys** → **New Key**, enable `pinFileToIPFS` and `pinJSONToIPFS` (or Admin), and copy the **JWT**.
   - **Gateways**: copy your gateway domain, for example `https://xyz.mypinata.cloud/ipfs/`.
3. **Reown / WalletConnect** (mobile wallets). In [cloud.reown.com](https://cloud.reown.com) → **Create project** → copy the **Project ID**. After launch, add your site domain to the project's **Domain allowlist**.

---

## 1. Railway: indexer and database

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**. Authorize the Railway GitHub app for `pocapoc2001/App1Crypto` and select it.
   > The first automatic deploy may fail. That's expected until steps 3–4 are done.
2. In the project canvas, click **+ Create** → **Database** → **Add PostgreSQL**.
3. Click the **App1Crypto** service (optionally rename it to `indexer`) → **Settings**:
   - **Source → Root Directory:** leave **empty**. The indexer needs the whole monorepo (`shared/`).
   - **Source → Branch:** `main`.
   - **Config-as-code → Railway Config File:** `/indexer/railway.json`.
   - This file sets the build command, the start command (`ponder start --schema $RAILWAY_DEPLOYMENT_ID`), the health check (`/ready`) and watch paths. Leave those fields alone.
4. Open the **Variables** tab of the same service and add:
   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Click **Add Reference** → Postgres → `DATABASE_URL`. It shows as `${{Postgres.DATABASE_URL}}` |
   | `PONDER_CHAINS` | `baseSepolia` |
   | `PONDER_RPC_URL_84532` | your `flowpad-indexer` Alchemy HTTPS URL |
   | `PORT` | `42069` |
5. **Settings → Networking → Generate Domain**, target port **42069**. Copy the URL, for example `https://app1crypto-production.up.railway.app`.
6. Click **Deploy** (or **Apply changes**). Under **Deployments → View logs**, wait for `Started returning 200 responses endpoint=/ready`.
7. Test in your browser:
   - `https://<railway-domain>/stats?chainId=84532` shows the coin count, volume and fees.
   - `https://<railway-domain>/tokens?chainId=84532` lists the coins (including FPTEST).

---

## 2. Vercel: web app

1. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository**. Grant the Vercel GitHub app access to `App1Crypto` → **Import**.
2. On the **Configure Project** screen:
   - **Root Directory:** **Edit** → choose `web` → **Continue**.
   - **Framework Preset:** Next.js (auto-detected).
   - **Build and Output Settings:** leave the defaults. `web/vercel.json` already sets `npm install --workspace=web` and `npm run build`.
   - **Environment Variables:** paste the contents of `web/.env.production.example` (Vercel accepts pasted `.env` text) and fill in:
     | Name | Value |
     | --- | --- |
     | `NEXT_PUBLIC_APP_NAME` | `FlowPad` (or your brand) |
     | `NEXT_PUBLIC_CHAINS` | `baseSepolia` |
     | `NEXT_PUBLIC_INDEXER_URL` | the Railway URL from step 1.5, with **no trailing slash** |
     | `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` (fix after the first deploy if the name differs) |
     | `NEXT_PUBLIC_RPC_84532` | your `flowpad-web` Alchemy HTTPS URL |
     | `NEXT_PUBLIC_WC_PROJECT_ID` | your Reown project ID |
     | `NEXT_PUBLIC_DEV_WALLET` | `0` |
     | `NEXT_PUBLIC_IPFS_GATEWAY` | your Pinata gateway, for example `https://xyz.mypinata.cloud/ipfs/` |
     | `PINATA_JWT` | your Pinata JWT (secret) |
3. Click **Deploy**. When it finishes, copy the production domain shown on the project page.
4. If the domain differs from `NEXT_PUBLIC_SITE_URL`: go to **Settings → Environment Variables**, update it, then **Deployments** → latest → **⋯** → **Redeploy**.
   > `NEXT_PUBLIC_*` values are baked in at build time. Always redeploy after changing one.
5. **Settings → Build and Deployment**, confirm:
   - **Root Directory → Include files outside the root directory in the Build Step** is **Enabled** (the default). Without it the app can't import `shared/`.
   - **Node.js Version:** 22.x or newer.
6. **Firewall** (project → **Firewall** → **Configure** → **+ New Rule**). Protects your Pinata quota from spam:
   - Name: `Upload rate limit`
   - If **Request Path** equals `/api/upload`
   - Then **Rate Limit**: 10 requests per 60 s, keyed by IP, action **Deny**
   - Then **Save** → **Publish**
7. Optional: **Analytics → Enable**, and **Settings → Domains** to add a custom domain. If you add one, update `NEXT_PUBLIC_SITE_URL` and the allowlists below, then redeploy.

---

## 3. After launch

1. Add your site domain to:
   - the Alchemy `flowpad-web` app → **Allowlisted origins**
   - the Reown project → **Domain allowlist**
2. Smoke test on the live site:
   - The amber **Testnet** banner is visible, and values are shown in ETH.
   - Connect MetaMask on **Base Sepolia**. Use the banner's faucet link if you need test ETH.
   - **Create coin** with an image. This proves Pinata works.
   - Buy, then sell. Check that the chart and trades update.
   - **Profile → Claim ETH** (creator fees).
   - Open `https://<site>/?ref=<another wallet>` in a private window, trade from that wallet, and check the referrer's profile.
3. Watch the logs: Railway → service → **Deployments → View logs**, and Vercel → project → **Logs**.

## Routine operations

- **Updating the app:** push to `main`. Vercel rebuilds the web app. Railway rebuilds only when `indexer/`, `shared/` or the lockfile changed, and each Railway deploy re-indexes into a fresh schema with no downtime.
- **New contract deployment:** deploy, run `npm run gen`, commit and push. Both services pick it up.
- **Cleaning old indexer schemas:** each Railway deploy leaves its previous schema behind. Every so often, from `indexer/`, run `npx ponder prune` with that service's `DATABASE_URL` (for example via `railway run npx ponder prune`).

## Costs and terms

- **Railway Hobby:** about $5/month, which includes $5 of usage. A small Ponder plus Postgres fits.
- **Vercel Hobby:** free, but **non-commercial use only**. Before a mainnet launch that earns fees, upgrade to **Pro**.
- Alchemy, Pinata and Reown free tiers are enough for a testnet launch.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Vercel build: `Cannot find module '@app1/shared'` | Root Directory must be `web`, with **Include files outside the root directory** enabled |
| Site says "Can't reach the indexer" | Check `NEXT_PUBLIC_INDEXER_URL` (https, no trailing slash) and that `/ready` returns 200, then **redeploy** |
| "Image storage is not configured" when creating a coin | Set `PINATA_JWT` in Vercel and redeploy |
| Railway deploy stuck on health check | Check the logs: a wrong `PONDER_RPC_URL_84532` or `DATABASE_URL` reference is the usual cause |
| Mobile wallet / QR code fails | Add the domain to the Reown allowlist and set `NEXT_PUBLIC_WC_PROJECT_ID` |
| Wallet reads fail in the browser | The Alchemy `flowpad-web` app's origin allowlist must include your domain |
