import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollateralPosition } from '../database/entities';
import { OracleService } from '../oracle/oracle.service';
import { CreditService } from '../credit/credit.service';

const WETH_ADDRESS = '0x128cC466B61f542da60c70e3aA11c10e19B84EDB';
const CIRBTC_ADDRESS = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0';

const ASSET_SYMBOLS: Record<string, string> = {
  [WETH_ADDRESS.toLowerCase()]: 'WETH',
  [CIRBTC_ADDRESS.toLowerCase()]: 'cirBTC',
};

const ASSET_DECIMALS: Record<string, number> = {
  [WETH_ADDRESS.toLowerCase()]: 18,
  [CIRBTC_ADDRESS.toLowerCase()]: 8,
};

const LTV_SAFE = 0.65;
const LTV_WARNING = 0.75;
const LTV_DANGER = 0.80;

export interface PortfolioSummary {
  totalCollateralUsd: string;
  totalDebtUsd: string;
  stashPower: string;
  availableCredit: string;
  usedCredit: string;
  ltv: string;
  riskLevel: string;
  collateralPositions: CollateralPositionView[];
  tradePositions: any[];
}

export interface CollateralPositionView {
  assetSymbol: string;
  assetAddress: string;
  amount: string;
  usdValue: string;
}

function computeRiskLevel(ltv: number): string {
  if (ltv <= 0) return 'none';
  if (ltv < LTV_SAFE) return 'safe';
  if (ltv < LTV_WARNING) return 'warning';
  if (ltv < LTV_DANGER) return 'danger';
  return 'liquidation';
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(CollateralPosition)
    private readonly collateralRepo: Repository<CollateralPosition>,
    private readonly oracleService: OracleService,
    private readonly creditService: CreditService,
  ) {}

  async getSummary(userId: string): Promise<PortfolioSummary> {
    // Fetch collateral positions
    const positions = await this.collateralRepo.find({
      where: { userId },
    });

    // Build collateral position views with current USD values
    const collateralPositions: CollateralPositionView[] = [];
    let totalCollateralUsd = 0;

    for (const position of positions) {
      const symbol = ASSET_SYMBOLS[position.assetAddress.toLowerCase()];
      if (!symbol) continue;

      const decimals = ASSET_DECIMALS[position.assetAddress.toLowerCase()];
      if (decimals === undefined) continue;

      const priceUsd = await this.oracleService.getPrice(symbol);
      const amount = Number(BigInt(position.amount)) / 10 ** decimals;
      const usdValue = amount * priceUsd;
      totalCollateralUsd += usdValue;

      collateralPositions.push({
        assetSymbol: symbol,
        assetAddress: position.assetAddress,
        amount: position.amount,
        usdValue: usdValue.toFixed(2),
      });
    }

    // Calculate Stash Power from CreditService
    const stashPowerResult =
      await this.creditService.calculateStashPower(userId);

    const ltv = stashPowerResult.ltv;
    const riskLevel = computeRiskLevel(ltv);

    return {
      totalCollateralUsd: totalCollateralUsd.toFixed(2),
      totalDebtUsd: stashPowerResult.debtAmount.toFixed(2),
      stashPower: stashPowerResult.stashPower.toFixed(2),
      availableCredit: stashPowerResult.availableCredit.toFixed(2),
      usedCredit: stashPowerResult.usedCredit.toFixed(2),
      ltv: ltv.toFixed(6),
      riskLevel,
      collateralPositions,
      tradePositions: [],
    };
  }
}
