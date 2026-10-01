import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Address } from 'viem';
import { OraclePrice } from '../database/entities';
import { BlockchainService } from '../blockchain/blockchain.service';

const WETH_ADDRESS = '0x128cC466B61f542da60c70e3aA11c10e19B84EDB';
const CIRBTC_ADDRESS = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';
const WETH_PRICE_FEED = '0x2c7Dc3567b3490f53A8d32625d766834dd023F60';
const CIRBTC_PRICE_FEED = '0x7777547914e03BCbB04Ae034942765a0dbb26aE3';

const CHAINLINK_DECIMALS = 8;

const PRICE_FEEDS: Record<string, { feedAddress: Address; assetAddress: string; symbol: string }> = {
  WETH: {
    feedAddress: WETH_PRICE_FEED as Address,
    assetAddress: WETH_ADDRESS,
    symbol: 'WETH',
  },
  cirBTC: {
    feedAddress: CIRBTC_PRICE_FEED as Address,
    assetAddress: CIRBTC_ADDRESS,
    symbol: 'cirBTC',
  },
};

const AGGREGATOR_ABI = [
  {
    type: 'function' as const,
    name: 'latestRoundData' as const,
    inputs: [],
    outputs: [
      { name: 'roundId' as const, type: 'uint80' as const },
      { name: 'answer' as const, type: 'int256' as const },
      { name: 'startedAt' as const, type: 'uint256' as const },
      { name: 'updatedAt' as const, type: 'uint256' as const },
      { name: 'answeredInRound' as const, type: 'uint80' as const },
    ],
    stateMutability: 'view' as const,
  },
] as const;

/** How old a cached price can be before we re-fetch (5 minutes) */
const PRICE_STALENESS_MS = 5 * 60 * 1000;

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  constructor(
    @InjectRepository(OraclePrice)
    private readonly oraclePriceRepo: Repository<OraclePrice>,
    private readonly blockchainService: BlockchainService,
  ) {}

  /**
   * Returns the latest USD price for an asset symbol.
   * Falls back to on-chain fetch if the DB price is stale or missing.
   */
  async getPrice(assetSymbol: string): Promise<number> {
    // Try DB first
    const cached = await this.oraclePriceRepo.findOne({
      where: { assetSymbol },
      order: { createdAt: 'DESC' },
    });

    if (cached) {
      const age = Date.now() - cached.createdAt.getTime();
      if (age < PRICE_STALENESS_MS) {
        return Number(cached.priceUsd);
      }
    }

    // Fetch fresh price from chain
    await this.fetchAndStorePrices();

    const fresh = await this.oraclePriceRepo.findOne({
      where: { assetSymbol },
      order: { createdAt: 'DESC' },
    });

    return fresh ? Number(fresh.priceUsd) : 0;
  }

  /**
   * Fetches WETH and cirBTC prices from Aave V4 oracle price feeds
   * and stores them in the oracle_prices table.
   */
  async fetchAndStorePrices(): Promise<void> {
    const client = this.blockchainService.getClient();

    for (const [symbol, feed] of Object.entries(PRICE_FEEDS)) {
      try {
        const result = await client.readContract({
          address: feed.feedAddress,
          abi: AGGREGATOR_ABI,
          functionName: 'latestRoundData',
        });

        // result is a tuple: [roundId, answer, startedAt, updatedAt, answeredInRound]
        const answer = result[1];
        const priceUsd = Number(answer) / 10 ** CHAINLINK_DECIMALS;

        const oraclePrice = this.oraclePriceRepo.create({
          assetSymbol: symbol,
          assetAddress: feed.assetAddress,
          priceUsd: priceUsd.toFixed(8),
          source: 'aave-v4-oracle',
        });

        await this.oraclePriceRepo.save(oraclePrice);

        this.logger.log(`Fetched ${symbol} price: $${priceUsd.toFixed(2)}`);
      } catch (error) {
        this.logger.error(
          `Failed to fetch price for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Returns the latest prices for all tracked assets.
   */
  async getAllPrices(): Promise<Record<string, { priceUsd: number; updatedAt: Date }>> {
    const prices: Record<string, { priceUsd: number; updatedAt: Date }> = {};

    for (const symbol of Object.keys(PRICE_FEEDS)) {
      const latest = await this.oraclePriceRepo.findOne({
        where: { assetSymbol: symbol },
        order: { createdAt: 'DESC' },
      });

      if (latest) {
        const age = Date.now() - latest.createdAt.getTime();
        if (age < PRICE_STALENESS_MS) {
          prices[symbol] = {
            priceUsd: Number(latest.priceUsd),
            updatedAt: latest.createdAt,
          };
          continue;
        }
      }
    }

    // If any prices are missing or stale, fetch fresh
    const allSymbols = Object.keys(PRICE_FEEDS);
    const missingOrStale = allSymbols.filter((s) => !prices[s]);

    if (missingOrStale.length > 0) {
      await this.fetchAndStorePrices();

      for (const symbol of missingOrStale) {
        const fresh = await this.oraclePriceRepo.findOne({
          where: { assetSymbol: symbol },
          order: { createdAt: 'DESC' },
        });

        if (fresh) {
          prices[symbol] = {
            priceUsd: Number(fresh.priceUsd),
            updatedAt: fresh.createdAt,
          };
        }
      }
    }

    return prices;
  }
}
