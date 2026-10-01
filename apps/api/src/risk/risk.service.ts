import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RiskSnapshot,
  CreditPosition,
  CollateralPosition,
} from '../database/entities';
import { OracleService } from '../oracle/oracle.service';
import { CreditService } from '../credit/credit.service';

const LTV_WARNING = 0.65;
const LTV_MAX = 0.75;
const LTV_LIQUIDATION = 0.80;

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

export type RiskLevel = 'safe' | 'warning' | 'danger' | 'liquidation';

@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(RiskSnapshot)
    private readonly riskSnapshotRepo: Repository<RiskSnapshot>,
    @InjectRepository(CreditPosition)
    private readonly creditRepo: Repository<CreditPosition>,
    @InjectRepository(CollateralPosition)
    private readonly collateralRepo: Repository<CollateralPosition>,
    private readonly oracleService: OracleService,
    private readonly creditService: CreditService,
  ) {}

  async checkRisk(userId: string): Promise<RiskSnapshot> {
    // Calculate total collateral USD
    const positions = await this.collateralRepo.find({
      where: { userId },
    });

    let totalCollateralUsd = 0;
    for (const position of positions) {
      const symbol = ASSET_SYMBOLS[position.assetAddress.toLowerCase()];
      if (!symbol) continue;
      const decimals = ASSET_DECIMALS[position.assetAddress.toLowerCase()];
      if (decimals === undefined) continue;
      const priceUsd = await this.oracleService.getPrice(symbol);
      const amount = Number(BigInt(position.amount)) / 10 ** decimals;
      totalCollateralUsd += amount * priceUsd;
    }

    // Get debt
    const creditPosition =
      await this.creditService.getOrCreateCreditPosition(userId);
    const totalDebtUsd = Number(creditPosition.debtAmount);

    // Calculate LTV
    const ltv =
      totalCollateralUsd > 0 ? totalDebtUsd / totalCollateralUsd : 0;

    // Determine risk level
    const riskLevel = this.determineRiskLevel(ltv);

    // Create risk snapshot
    const snapshot = this.riskSnapshotRepo.create({
      userId,
      totalCollateralUsd: totalCollateralUsd.toFixed(2),
      totalDebtUsd: totalDebtUsd.toFixed(2),
      ltv: ltv.toFixed(6),
      riskLevel,
    });
    await this.riskSnapshotRepo.save(snapshot);

    return snapshot;
  }

  async getRiskHistory(userId: string, limit?: number): Promise<RiskSnapshot[]> {
    return this.riskSnapshotRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit ?? 20,
    });
  }

  async checkAllPositions(): Promise<RiskSnapshot[]> {
    // Find all credit positions with non-zero debt
    const creditPositions = await this.creditRepo
      .createQueryBuilder('cp')
      .where('CAST(cp.debtAmount AS DECIMAL) > 0')
      .getMany();

    const atRiskSnapshots: RiskSnapshot[] = [];

    for (const creditPosition of creditPositions) {
      const snapshot = await this.checkRisk(creditPosition.userId);
      if (
        snapshot.riskLevel === 'warning' ||
        snapshot.riskLevel === 'danger' ||
        snapshot.riskLevel === 'liquidation'
      ) {
        atRiskSnapshots.push(snapshot);
      }
    }

    return atRiskSnapshots;
  }

  private determineRiskLevel(ltv: number): RiskLevel {
    if (ltv >= LTV_LIQUIDATION) return 'liquidation';
    if (ltv >= LTV_MAX) return 'danger';
    if (ltv >= LTV_WARNING) return 'warning';
    return 'safe';
  }
}
