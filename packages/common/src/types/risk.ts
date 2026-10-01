export type RiskLevel = 'safe' | 'warning' | 'danger' | 'liquidation';

export interface RiskSnapshot {
  id: string;
  userId: string;
  totalCollateralUsd: string;
  totalDebtUsd: string;
  ltv: number;
  riskLevel: RiskLevel;
  createdAt: string;
}
