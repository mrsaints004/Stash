import { ConfigService } from '@nestjs/config';
import { ProtocolService } from '../protocol/protocol.service';
import { VAULT_V2_ABI, contractAddress } from '../config/protocol.config';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseAbi, type Address } from 'viem';
import { OraclePrice } from '../database/entities';
import { BlockchainService } from '../blockchain/blockchain.service';

const FEEDS: Record<string, { address: Address; asset: string; env: string }> = {
  WETH: { address: '0x2c7Dc3567b3490f53A8d32625d766834dd023F60',
    asset: '0x128cC466B61f542da60c70e3aA11c10e19B84EDB', env: 'WETH_PRICE_FEED' },
  cirBTC: { address: '0x7777547914e03BCbB04Ae034942765a0dbb26aE3',
    asset: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0', env: 'CIRBTC_PRICE_FEED' },
};
const ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

export function validateOracleRound(
  round: readonly [bigint, bigint, bigint, bigint, bigint], decimals: number,
  nowSeconds: number, maxAgeSeconds: number,
) {
  const [roundId, answer, , updatedAt, answeredInRound] = round;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 ||
    !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1 ||
    answer <= 0n || updatedAt <= 0n || updatedAt > BigInt(nowSeconds) ||
    BigInt(nowSeconds) - updatedAt > BigInt(maxAgeSeconds) || answeredInRound < roundId) {
    throw new ServiceUnavailableException('Oracle price is stale or invalid; new credit is unavailable');
  }
  const priceUsd = Number(answer) / 10 ** decimals;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new ServiceUnavailableException('Invalid oracle price');
  return { priceUsd, updatedAt: new Date(Number(updatedAt) * 1000) };
}

@Injectable()
export class OracleService {
  constructor(
    @InjectRepository(OraclePrice) private readonly oraclePriceRepo: Repository<OraclePrice>,
    private readonly blockchainService: BlockchainService,
    private readonly config: ConfigService,
    private readonly protocol: ProtocolService,
  ) {}
  async getPrice(symbol: string) {
    const configuration = await this.protocol.configuration();
    const asset = configuration.assets.find(item => item.symbol === symbol);
    if (!asset) throw new ServiceUnavailableException(`No approved collateral price for ${symbol}`);
    const value = await this.blockchainService.getClient().readContract({
      address: contractAddress(this.config, 'STASH_VAULT_ADDRESS'), abi: VAULT_V2_ABI,
      functionName: 'priceUsd6', args: [asset.address],
    });
    return Number(value) / 1e6;
  }
  async getAllPrices() {
    const configuration = await this.protocol.configuration();
    return Object.fromEntries(await Promise.all(configuration.assets.map(async asset =>
      [asset.symbol, { priceUsd: await this.getPrice(asset.symbol), updatedAt: new Date(Number((await this.blockchainService.getClient().readContract({ address: asset.feedAddress, abi: ABI, functionName: 'latestRoundData' }))[3])*1000) }] as const)));
  }
  async fetchAndStorePrices() {
    const configuration = await this.protocol.configuration();
    for (const asset of configuration.assets) {
      const price = await this.getPrice(asset.symbol);
      await this.oraclePriceRepo.save(this.oraclePriceRepo.create({ assetSymbol: asset.symbol,
        assetAddress: asset.address, priceUsd: price.toFixed(8), source: 'stash-v2-validated-oracle' }));
    }
  }
}
