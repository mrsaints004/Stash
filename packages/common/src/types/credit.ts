export interface CreditPosition {
  id: string;
  userId: string;
  /** Total Stash Power (USDC trading capacity) available */
  stashPower: string;
  /** USDC already used for trades */
  usedCredit: string;
  /** Outstanding USDC debt */
  debtAmount: string;
  /** Current LTV ratio (0–1) */
  ltv: number;
  updatedAt: string;
}

export interface RepayRequest {
  /** USDC amount to repay (6 decimal string) */
  amount: string;
}
