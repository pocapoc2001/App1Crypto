# Contracts

Foundry project for the launchpad. See the [root README](../README.md) for the full picture.

| Contract | Role |
| --- | --- |
| `LaunchToken` | Fixed-supply ERC-20 (1B). No owner, mint, tax, pause or blacklist. Pre-approves Permit2. |
| `LaunchFactory` | `launch()` deploys a token, creates the Uniswap v4 pool, deposits the whole supply as single-sided liquidity it owns forever (no removal function), optional creator buy. |
| `FeeHook` | Uniswap v4 hook: 1% fee in ETH on every swap, 50/50 creator/protocol split held as ERC-6909 claims, claimable any time. A trader's first referrer (from `hookData`) sticks and earns 20% of the protocol half. Anti-snipe window. Only the factory can create pools with it. |
| `LaunchRouter` | Minimal exact-input router (buy with ETH, sell with approve or Permit2 signature, each with an optional referrer passed as `hookData`) + revert-based `quote()`. |

```bash
forge build
forge test                                   # unit + fuzz + invariant tests
RUN_FORK_TESTS=true forge test --match-path "test/fork/*"   # against real Base Sepolia + Robinhood state
```

Deploy (writes `deployments/<chainId>.json`, then run `npm run gen` at the repo root):

```bash
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --private-key $PRIVATE_KEY
```
