export function validateEnvironment(env: Record<string, unknown>) {
  const secret = String(env.JWT_SECRET ?? '');
  if (secret.length < 32 || /changeme|example|dev-secret/i.test(secret)) throw new Error('JWT_SECRET must contain at least 32 characters');
  const confirmations = Number(env.TX_CONFIRMATIONS ?? 2);
  if (!Number.isInteger(confirmations) || confirmations < 1) throw new Error('TX_CONFIRMATIONS must be a positive integer');
  const chainId = Number(env.CHAIN_ID ?? 5042002);
  if (![5042, 5042002].includes(chainId)) throw new Error('CHAIN_ID must be Arc mainnet (5042) or Arc testnet (5042002)');
  if (env.NODE_ENV === 'production') {
    for (const key of ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD',
      'RPC_URL', 'CORS_ORIGIN', 'SIWE_DOMAIN', 'SIWE_URI', 'STASH_VAULT_ADDRESS', 'STASH_CREDIT_ADDRESS', 'STASH_ROUTER_ADDRESS', 'STASH_LIQUIDATION_ADDRESS']) {
      if (!env[key]) throw new Error(`${key} is required in production`);
    }
    for (const key of ['STASH_VAULT_ADDRESS', 'STASH_CREDIT_ADDRESS', 'STASH_ROUTER_ADDRESS', 'STASH_LIQUIDATION_ADDRESS']) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(env[key])) || /^0x0{40}$/.test(String(env[key]))) throw new Error(`${key} must be a deployed nonzero address`);
    }
    for (const key of ['CORS_ORIGIN', 'SIWE_URI']) {
      if (new URL(String(env[key])).protocol !== 'https:') throw new Error(`${key} must use HTTPS in production`);
    }
  }
  return env;
}
