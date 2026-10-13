const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../dist/config/environment');
const { validateOracleRound } = require('../dist/oracle/oracle.service');
const { BlockchainService } = require('../dist/blockchain/blockchain.service');
const { PROTOCOL_EVENTS } = require('../dist/blockchain/events');
const { encodeEventTopics, encodeAbiParameters } = require('viem');

const secret = 'a'.repeat(64);
test('rejects weak JWT secrets and unsupported networks', () => {
  assert.throws(() => validateEnvironment({ JWT_SECRET: 'stash-dev-secret' }));
  assert.throws(() => validateEnvironment({ JWT_SECRET: secret, CHAIN_ID: 8453 }));
  assert.doesNotThrow(() => validateEnvironment({ JWT_SECRET: secret }));
});
test('production cannot boot with missing settings or zero confirmations', () => {
  assert.throws(() => validateEnvironment({ JWT_SECRET: secret, NODE_ENV: 'production' }));
  assert.throws(() => validateEnvironment({ JWT_SECRET: secret, TX_CONFIRMATIONS: 0 }));
});
test('oracle validates round completeness, positivity, and freshness', () => {
  assert.equal(validateOracleRound([2n, 2000_00000000n, 800n, 900n, 2n], 8, 1000, 300).priceUsd, 2000);
  for (const round of [[2n, 1n, 0n, 699n, 2n], [2n, 0n, 0n, 900n, 2n],
    [2n, -1n, 0n, 900n, 2n], [2n, 1n, 0n, 1001n, 2n], [2n, 1n, 0n, 900n, 1n]]) {
    assert.throws(() => validateOracleRound(round, 8, 1000, 300));
  }
});
const wallet = '0x1111111111111111111111111111111111111111';
const contract = '0x2222222222222222222222222222222222222222';
const asset = '0x3333333333333333333333333333333333333333';
const hash = '0x' + 'a'.repeat(64);
function service(receipt) {
  const s = new BlockchainService({ get: (_, defaultValue) => defaultValue });
  s.client = { getTransactionReceipt: async () => receipt, getBlockNumber: async () => 11n, getBlock: async () => ({hash:'0x'+'b'.repeat(64)}) };
  return s;
}
const receipt = { status: 'success', from: wallet, to: contract, blockNumber: 10n, blockHash:'0x'+'b'.repeat(64), logs: [{
  address: contract,
  topics: encodeEventTopics({ abi: PROTOCOL_EVENTS, eventName: 'Deposited', args: { user: wallet, asset } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [100n]),
}] };
function verify(s, expected = { user: wallet, asset, amount: '100' }) {
  return s.verifyEvent(hash, wallet, contract, PROTOCOL_EVENTS, 'Deposited', expected);
}
test('accepts only a matching confirmed protocol event', async () => {
  assert.equal((await verify(service(receipt))).amount, 100n);
  await assert.rejects(verify(service(receipt), { user: wallet, asset, amount: '101' }));
});
test('rejects reverted, foreign, wrong-contract and missing-event receipts', async () => {
  for (const change of [{ status: 'reverted' }, { from: asset }, { to: asset }, { logs: [] }]) {
    await assert.rejects(verify(service({ ...receipt, ...change })));
  }
});
test('pending or underconfirmed receipts cannot change accounting', async () => {
  const pending = service(receipt);
  pending.client.getTransactionReceipt = async () => { throw new Error('not found'); };
  await assert.rejects(verify(pending), /pending/);
  await assert.rejects(verify(service({ ...receipt, blockNumber: 11n })), /awaiting confirmations/);
});

const { RateLimitGuard } = require('../dist/config/rate-limit.guard');
test('authentication endpoints have a shared fail-closed rate limit', async () => {
  const guard = new RateLimitGuard({ get: (_, defaultValue) => defaultValue });
  const context = { switchToHttp: () => ({ getRequest: () => ({ ip: '127.0.0.1', path: '/auth/challenge', method: 'POST' }) }) };
  guard.redis.eval = async () => 20;
  assert.equal(await guard.canActivate(context), true);
  guard.redis.eval = async () => 21;
  await assert.rejects(guard.canActivate(context), /Too many requests/);
  guard.redis.eval = async () => { throw new Error('Redis unavailable'); };
  await assert.rejects(guard.canActivate(context), /protection is unavailable/);
  guard.onModuleDestroy();
});

test('orphaned receipt cannot confirm financial accounting',async()=>{
 await assert.rejects(verify(service({...receipt,blockHash:'0x'+'c'.repeat(64)})),/reorganized/);
});
