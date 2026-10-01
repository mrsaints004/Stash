export interface CollateralPosition {
  id: string;
  userId: string;
  walletAddress: string;
  assetSymbol: string;
  assetAddress: string;
  /** Amount in asset's native decimals (bigint string) */
  amount: string;
  /** USD value of collateral */
  usdValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepositRequest {
  assetAddress: string;
  /** Amount in asset's native decimals (bigint string) */
  amount: string;
}

export interface WithdrawRequest {
  assetAddress: string;
  /** Amount in asset's native decimals (bigint string) */
  amount: string;
}
