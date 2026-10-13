import { ConfigService } from '@nestjs/config';
import { defineChain, type Address, parseAbi } from 'viem';

export function protocolChain(config: ConfigService) {
  const id = Number(config.get<string>('CHAIN_ID', '5042002'));
  if (![5042, 5042002].includes(id)) throw new Error('Stash supports Arc only');
  const rpcUrl = config.getOrThrow<string>('RPC_URL');
  return defineChain({ id, name: config.get<string>('CHAIN_NAME', id === 5042 ? 'Arc' : 'Arc Testnet'),
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }, testnet: id === 5042002 });
}
export function contractAddress(config: ConfigService, name: string): Address {
  const value = config.getOrThrow<string>(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new Error(`${name} must be a nonzero address`);
  return value as Address;
}
export const VAULT_V2_ABI = parseAbi([
  'function version() view returns (uint256)',
  'function lendingAdapter() view returns (bytes32)',
  'function usdc() view returns (address)',
  'function usdcReserveId() view returns (uint256)',
  'function pool() view returns (address)',
  'function stashCredit() view returns (address)',
  'function accounts(address user) view returns (address)',
  'function assets(uint256 index) view returns (address)',
  'function assetCount() view returns (uint256)',
  'function assetRisk(address asset) view returns (uint256 reserveId, address feed, uint8 decimals, uint16 factorBps, uint32 maxAge, bool depositsEnabled)',
  'function priceUsd6(address asset) view returns (uint256)',
  'function balanceOf(address user, address asset) view returns (uint256)',
  'function borrowingCapacity(address user) view returns (uint256)',
  'function deposit(address asset, uint256 amount)',
  'function withdraw(address asset, uint256 amount)',
  'function lendingHealth(address user) view returns (uint256 collateralUsd8, uint256 debtUsd8, uint256 availableUsd8, uint256 liquidationThresholdBps, uint256 ltvBps, uint256 healthFactor)',
]);
export const CREDIT_V2_ABI = parseAbi([
  'function version() view returns (uint256)',
  'function stashRouter() view returns (address)',
  'function maximumCredit() view returns (uint256)',
  'function debtOf(address user) view returns (uint256)',
  'function availableCredit(address user) view returns (uint256)',
  'function borrow(uint256 amount)',
  'function repay(uint256 amount)',
]);
export const ROUTER_V2_ABI = parseAbi([
  'function version() view returns (uint256)',
  'function protocolFeeBps() view returns (uint256)',
  'function approvedRoute(address target, address spender) view returns (bool)',
  'function allowedOutput(address token) view returns (bool)',
  'function borrowAndSwap((address tokenOut, uint256 amountIn, uint256 minimumOut, uint256 deadline, address target, address spender, bytes routeData) trade) returns (uint256)',
]);
