/**
 * Check if a string is a valid Ethereum address.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Check if an amount string is a valid positive number.
 */
export function isValidAmount(amount: string): boolean {
  if (!amount || amount.trim() === '') return false;
  const num = Number(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

/**
 * Check if a slippage value (in bps) is within acceptable range.
 */
export function isValidSlippage(bps: number): boolean {
  return Number.isInteger(bps) && bps > 0 && bps <= 5000;
}
