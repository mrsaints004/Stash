/** Loan-to-Value thresholds */
export const LTV = {
  /** Maximum LTV before position is at risk */
  MAX: 0.75,
  /** LTV at which warnings are triggered */
  WARNING: 0.65,
  /** LTV at which liquidation can be triggered */
  LIQUIDATION: 0.80,
} as const;

/** Protocol fee in basis points (1 bp = 0.01%) */
export const PROTOCOL_FEE_BPS = 30; // 0.3%

/** Maximum slippage tolerance in basis points */
export const MAX_SLIPPAGE_BPS = 500; // 5%

/** Default slippage tolerance in basis points */
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/** Risk check interval in milliseconds */
export const RISK_CHECK_INTERVAL_MS = 10_000;
