# STASH Protocol — Mainnet Deployment Guide

Arc Mainnet (Chain ID: 5042) deployment checklist for STASH V2.

## Deployed Contracts

| Contract        | Address                                      |
|-----------------|----------------------------------------------|
| UsdcFeedAdapter | `0xac45fC9E7601fc0EEFCbeCC795083AeF0b5bcdd5` |
| Vault           | `0xB7a791DF22a3AaF0737d2459319cE51fF1C6566B` |
| Credit          | `0x1b25b47a6c2ccf6F2BE9948EfeF8dC5aa17a6818` |
| Router          | `0xFB055e2dDbFa92E3bc8e3cCC97D942e256e483bA` |
| Liquidation     | `0xcE8C533B0aA07AbCfcE5C9068D6Ec924C99d5665` |

Owner: `0xD92c969b709778241F89a208193F38AE5216d55d` (deployer EOA)

## Mainnet External Addresses

| Contract      | Address                                      |
|---------------|----------------------------------------------|
| Aave V4 Spoke | `0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d` |
| USDC          | `0x3600000000000000000000000000000000000000` |
| WETH          | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` |
| cirBTC        | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` |
| WETH/USD Feed | `0x2c7Dc3567b3490f53A8d32625d766834dd023F60` |
| BTC/USD Feed  | `0x7777547914e03BCbB04Ae034942765a0dbb26aE3` |
| USDC/USD Feed | `0x729cFd10FC10A908aE9F9b35245cB6Ee14D44D6B` (Capped) |

Reserve IDs: USDC=0, cirBTC=2, WETH=3

## Prerequisites

- Foundry toolchain installed (`forge`, `cast`)
- Ledger hardware wallet or encrypted keystore (for production key management)
- Access to Arc mainnet RPC: `https://rpc.mainnet.arc.io`

## Fresh Deployment Steps

### 1. Deploy Safe Multisigs (Optional)

Deploy two Safe multisig wallets on Arc mainnet for governance:

- **Admin Safe** — protocol ownership, parameter changes, unpausing
- **Guardian Safe** — emergency pause

### 2. Run Reserve Discovery

```bash
cd contracts
AAVE_V4_SPOKE=0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d \
  forge script script/DiscoverReserves.s.sol --rpc-url https://rpc.mainnet.arc.io
```

### 3. Configure Environment

```bash
cp contracts/.env.mainnet.example contracts/.env.mainnet
# Fill in DEPLOYER_PRIVATE_KEY, reserve IDs, Safe addresses
```

### 4. Deploy

```bash
bash setup-mainnet.sh --ledger
# or
bash setup-mainnet.sh --keystore /path/to/keystore.json
```

### 5. Verify Contracts

```bash
forge verify-contract <ADDRESS> <CONTRACT_PATH> --chain-id 5042 --etherscan-api-key $ETHERSCAN_API_KEY
```

### 6. Post-Deployment

1. Unpause all contracts
2. Configure aggregator routes (see below)
3. Transfer ownership to Safe + Timelock (when ready)

## Architecture Notes

### UsdcFeedAdapter

Arc's "Capped USDC/USD" feed only exposes `latestAnswer()`. The vault requires `latestRoundData()` for staleness checks. `UsdcFeedAdapter` wraps the capped feed, returning `block.timestamp` as `updatedAt` so the staleness check always passes for USDC (the capped adapter handles price safety internally).

### Aggregator Routes

The Router's `borrowAndSwap` requires whitelisted DEX aggregator contracts. LI.FI is the active aggregator on Arc, routing through KyberSwap.

**Current configuration:**

| Setting         | Address                                      |
|-----------------|----------------------------------------------|
| LI.FI Diamond   | `0xA4072583658Fae592A3506A42431cb6316a8d40b` |
| Approved Route  | `approvedRoute[diamond][diamond] = true`     |
| Allowed Outputs | WETH, cirBTC                                 |

**Commands used to configure:**

```bash
ROUTER=0xFB055e2dDbFa92E3bc8e3cCC97D942e256e483bA
LIFI=0xA4072583658Fae592A3506A42431cb6316a8d40b

cast send $ROUTER "configureRoute(address,address,bool)" $LIFI $LIFI true \
  --rpc-url https://rpc.mainnet.arc.io --private-key $KEY

cast send $ROUTER "configureOutput(address,bool)" 0x128cC466B61f542da60c70e3aA11c10e19B84EDB true \
  --rpc-url https://rpc.mainnet.arc.io --private-key $KEY

cast send $ROUTER "configureOutput(address,bool)" 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0 true \
  --rpc-url https://rpc.mainnet.arc.io --private-key $KEY
```

Set `ROUTING_PROVIDERS=lifi` in the backend `.env` (0x Protocol does not support Arc).

## Rollback

If issues are found post-deployment, the owner can `pause()` any module immediately. If ownership hasn't been transferred to a timelock yet, the deployer EOA can pause directly.
