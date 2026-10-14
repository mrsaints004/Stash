# STASH

Collateral-backed lending on [Arc](https://arc.io) (Circle's EVM L1). Deposit WETH or cirBTC, borrow USDC against it, trade via DEX aggregators — all through Aave V4 on-chain.

## How it works

1. **Deposit** WETH or cirBTC into the Vault. Collateral is supplied to Aave V4 via per-user lending accounts.
2. **Borrow** USDC against your collateral up to the configured LTV. Debt is real Aave V4 variable-rate debt.
3. **Trade** (optional) — borrow and swap USDC to another asset atomically through a whitelisted DEX aggregator.
4. **Repay** USDC to reduce debt. **Withdraw** collateral as long as remaining backing covers outstanding debt.
5. **Liquidation** — undercollateralized positions can be liquidated by anyone, repaying debt and seizing collateral at a bonus.

Ownership flows through a Timelock with admin + guardian multisigs. All contracts deploy paused and must be explicitly unpaused.

## Architecture

```
contracts/           Solidity (Foundry) — V2 protocol contracts
  src/v2/
    StashVaultV2       Collateral deposits, per-user Aave V4 lending accounts, oracle pricing
    StashCreditV2      USDC borrowing against collateral, credit limits
    StashRouterV2      Atomic borrow+swap via DEX aggregators, fee collection
    StashLiquidationV2 Liquidation of undercollateralized positions
    StashTimelock      2-day delay for admin operations, guardian emergency pause
    StashLendingAccount  Per-user proxy that holds Aave V4 positions
    UsdcFeedAdapter    Wraps Arc's capped USDC/USD feed for latestRoundData()

apps/api/            NestJS backend — REST API, chain indexer, liquidation keeper
apps/web/            Next.js frontend — wallet connection, deposit/borrow/trade UI
packages/common/     Shared TypeScript types
packages/abis/       Contract ABIs
```

## Mainnet (Arc — Chain ID 5042)

| Contract    | Address                                      |
|-------------|----------------------------------------------|
| Vault       | `0xB7a791DF22a3AaF0737d2459319cE51fF1C6566B` |
| Credit      | `0x1b25b47a6c2ccf6F2BE9948EfeF8dC5aa17a6818` |
| Router      | `0xFB055e2dDbFa92E3bc8e3cCC97D942e256e483bA` |
| Liquidation | `0xcE8C533B0aA07AbCfcE5C9068D6Ec924C99d5665` |

See [MAINNET-DEPLOYMENT.md](./MAINNET-DEPLOYMENT.md) for full deployment details and operational runbook.

## Development

Requires: Node 20+, pnpm 9+, Foundry

```bash
pnpm install          # install all workspace deps
```

### Contracts

```bash
cd contracts
forge test            # 103 tests
forge build --sizes   # check contract sizes
```

### Backend

```bash
cp apps/api/.env.example apps/api/.env   # fill in values
pnpm --filter @stash/api dev             # http://localhost:3001
```

Needs PostgreSQL and Redis running locally (see `apps/api/.env.example`).

### Frontend

```bash
cp apps/web/.env.example apps/web/.env   # fill in values
pnpm --filter @stash/web dev             # http://localhost:3000
```

## Wallet Support

The frontend uses wagmi v2 with EIP-6963 auto-discovery and Coinbase Wallet SDK. No WalletConnect project ID needed.

Works with: MetaMask, Rabby, Coinbase Wallet, Trust Wallet, Phantom, and any EIP-6963 compatible wallet — desktop extensions and mobile in-app browsers.

## Stack

- **Contracts**: Solidity 0.8.28, Foundry, Aave V4 Spoke
- **Backend**: NestJS 11, TypeORM, PostgreSQL, BullMQ + Redis
- **Frontend**: Next.js 15, React 19, wagmi v2, viem, Tailwind CSS v4
- **Monorepo**: pnpm workspaces, Turborepo
