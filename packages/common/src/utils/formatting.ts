/**
 * Format a USD value for display.
 * Example: formatUsd("1234.56") -> "$1,234.56"
 */
export function formatUsd(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a percentage for display.
 * Example: formatPercent(0.7523) -> "75.23%"
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate an Ethereum address for display.
 * Example: truncateAddress("0x1234...abcd") -> "0x1234...abcd"
 */
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
