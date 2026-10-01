export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  message: string;
  code: string;
  success: false;
}

export interface AuthChallenge {
  message: string;
  nonce: string;
  expiresAt: string;
}

export interface AuthToken {
  accessToken: string;
  expiresAt: string;
}

export interface PortfolioSummary {
  totalCollateralUsd: string;
  totalDebtUsd: string;
  stashPower: string;
  usedCredit: string;
  availableCredit: string;
  ltv: number;
  riskLevel: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  database: boolean;
  redis: boolean;
  rpc: boolean;
  timestamp: string;
}
