import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseAbi, type Address } from 'viem';
import { BlockchainService } from '../blockchain/blockchain.service';
import { contractAddress, VAULT_V2_ABI, protocolChain } from '../config/protocol.config';

const TOKEN_ABI = parseAbi(['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)']);
@Injectable()
export class ProtocolService {
  private configCache: { data: { chainId: number; chainName: string; vaultAddress: Address; creditAddress: Address; routerAddress: Address; usdc: { address: Address; symbol: string; name: string; decimals: number }; assets: { address: Address; symbol: string; name: string; decimals: number; collateralFactorBps: number; depositsEnabled: boolean; feedAddress: Address; maxAgeSeconds: number }[] }; fetchedAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  constructor(private readonly config: ConfigService, private readonly blockchain: BlockchainService) {}
  async configuration() {
    if (this.configCache && Date.now() - this.configCache.fetchedAt < ProtocolService.CACHE_TTL_MS) {
      return this.configCache.data;
    }
    const client = this.blockchain.getClient(); const vault = contractAddress(this.config, 'STASH_VAULT_ADDRESS');
    const count = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'assetCount' });
    if (count > 16n) throw new Error('Invalid asset registry');
    const usdc = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'usdc' });
    const assets = await Promise.all(Array.from({ length: Number(count) }, async (_, i) => {
      const address = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'assets', args: [BigInt(i)] });
      const risk = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'assetRisk', args: [address] });
      return { ...await this.token(address), collateralFactorBps: risk[3], depositsEnabled: risk[5], feedAddress: risk[1], maxAgeSeconds: risk[4] };
    }));
    const result = { chainId: protocolChain(this.config).id, chainName: protocolChain(this.config).name,
      vaultAddress: vault, creditAddress: contractAddress(this.config, 'STASH_CREDIT_ADDRESS'),
      routerAddress: contractAddress(this.config, 'STASH_ROUTER_ADDRESS'),
      usdc: await this.token(usdc), assets: assets.filter(a => a.address.toLowerCase() !== usdc.toLowerCase()) };
    this.configCache = { data: result, fetchedAt: Date.now() };
    return result;
  }
  async lendingTerms(wallet?: Address) {
    const client = this.blockchain.getClient();
    const vault = contractAddress(this.config, 'STASH_VAULT_ADDRESS');
    const spoke = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'pool' });
    const reserveId = await client.readContract({ address: vault, abi: VAULT_V2_ABI, functionName: 'usdcReserveId' });
    const spokeAbi = parseAbi(['function getReserve(uint256 id) view returns((address underlying,address hub,uint16 assetId,uint8 decimals,uint24 collateralRisk,uint8 flags,uint32 dynamicConfigKey))', 'function getUserLastRiskPremium(address user) view returns(uint256)']);
    const reserve = await client.readContract({ address: spoke, abi: spokeAbi, functionName: 'getReserve', args: [reserveId] });
    const hubAbi = parseAbi(['function getAssetDrawnRate(uint256 id) view returns(uint256)', 'function getAsset(uint256 id) view returns((uint120 liquidity,uint120 realizedFees,uint8 decimals,uint120 addedShares,uint120 swept,int200 premiumOffsetRay,uint120 drawnShares,uint120 premiumShares,uint16 liquidityFee,uint120 drawnIndex,uint96 drawnRate,uint40 lastUpdateTimestamp,address underlying,address irStrategy,address reinvestmentController,address feeReceiver,uint200 deficitRay))']);
    const [rate, asset] = await Promise.all([
      client.readContract({address:reserve.hub,abi:hubAbi,functionName:'getAssetDrawnRate',args:[BigInt(reserve.assetId)]}),
      client.readContract({address:reserve.hub,abi:hubAbi,functionName:'getAsset',args:[BigInt(reserve.assetId)]}),
    ]);
    if(asset.underlying.toLowerCase()!==reserve.underlying.toLowerCase()||asset.decimals!==6)throw new Error('Invalid USDC lending reserve');
    let lastRiskPremiumBps: number | null = null;
    if(wallet){const account=await client.readContract({address:vault,abi:VAULT_V2_ABI,functionName:'accounts',args:[wallet]});if(!/^0x0{40}$/.test(account))lastRiskPremiumBps=Number(await client.readContract({address:spoke,abi:spokeAbi,functionName:'getUserLastRiskPremium',args:[account]}));}
    return { baseApr: Number(rate)/1e27, baseAprRay:rate.toString(), lastRiskPremiumBps, liquidityUsdcAtomic:asset.liquidity.toString(), sampledAt:new Date().toISOString(), note:'Variable base APR. Account risk premiums and rates can change when borrowing or updating collateral. Liquidity is shared across the Hub and is subject to Spoke caps.' };
  }
  private async token(address: Address) {
    const client = this.blockchain.getClient();
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address, abi: TOKEN_ABI, functionName: 'symbol' }),
      client.readContract({ address, abi: TOKEN_ABI, functionName: 'name' }),
      client.readContract({ address, abi: TOKEN_ABI, functionName: 'decimals' }),
    ]);
    return { address, symbol, name, decimals };
  }
}
