/**
 * USDC Decimal Conversion Utilities
 *
 * CRITICAL: On Arc, USDC has dual representations:
 * - Native (msg.value): 18 decimals
 * - ERC-20 (balanceOf, transfer): 6 decimals
 *
 * A 10^12 error means catastrophic fund loss. Always use these helpers.
 */

const USDC_ERC20_DECIMALS = 6;
const USDC_NATIVE_DECIMALS = 18;
const DECIMAL_DIFFERENCE = BigInt(10 ** (USDC_NATIVE_DECIMALS - USDC_ERC20_DECIMALS)); // 10^12

/**
 * Convert USDC from ERC-20 (6 decimals) to native (18 decimals).
 * Example: 1_000_000n (1 USDC ERC-20) -> 1_000_000_000_000_000_000n (1 USDC native)
 */
export function usdcToNative(erc20Amount: bigint): bigint {
  return erc20Amount * DECIMAL_DIFFERENCE;
}

/**
 * Convert USDC from native (18 decimals) to ERC-20 (6 decimals).
 * Truncates any sub-ERC20-unit remainder.
 * Example: 1_000_000_000_000_000_000n (1 USDC native) -> 1_000_000n (1 USDC ERC-20)
 */
export function usdcToErc20(nativeAmount: bigint): bigint {
  return nativeAmount / DECIMAL_DIFFERENCE;
}

/**
 * Parse a human-readable amount string to the smallest unit for the given decimals.
 * Example: parseUnits("1.5", 6) -> 1_500_000n
 */
export function parseUnits(amount: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  const paddedFraction = fraction.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole + paddedFraction);
}

/**
 * Format a smallest-unit bigint to a human-readable string with the given decimals.
 * Example: formatUnits(1_500_000n, 6) -> "1.5"
 */
export function formatUnits(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const fractionStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

/**
 * Parse a human-readable USDC amount to ERC-20 units (6 decimals).
 * Example: parseUsdcErc20("100.50") -> 100_500_000n
 */
export function parseUsdcErc20(amount: string): bigint {
  return parseUnits(amount, USDC_ERC20_DECIMALS);
}

/**
 * Parse a human-readable USDC amount to native units (18 decimals).
 * Example: parseUsdcNative("100.50") -> 100_500_000_000_000_000_000n
 */
export function parseUsdcNative(amount: string): bigint {
  return parseUnits(amount, USDC_NATIVE_DECIMALS);
}

/**
 * Format ERC-20 USDC (6 decimals) to human-readable string.
 * Example: formatUsdcErc20(100_500_000n) -> "100.5"
 */
export function formatUsdcErc20(amount: bigint): string {
  return formatUnits(amount, USDC_ERC20_DECIMALS);
}

/**
 * Format native USDC (18 decimals) to human-readable string.
 * Example: formatUsdcNative(100_500_000_000_000_000_000n) -> "100.5"
 */
export function formatUsdcNative(amount: bigint): string {
  return formatUnits(amount, USDC_NATIVE_DECIMALS);
}

export {
  USDC_ERC20_DECIMALS,
  USDC_NATIVE_DECIMALS,
  DECIMAL_DIFFERENCE,
};
