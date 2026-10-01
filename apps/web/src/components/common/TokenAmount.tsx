"use client";

import { formatUnits } from "@stash/common";

interface TokenAmountProps {
  /** Raw amount as bigint string (e.g. "1500000000000000000") */
  amount: string;
  /** Number of decimals for the token */
  decimals: number;
  /** Token symbol (e.g. "WETH") */
  symbol: string;
  /** Optional CSS class name */
  className?: string;
  /** Whether to show the full precision or truncate to a reasonable number of decimal places */
  maxDisplayDecimals?: number;
}

export function TokenAmount({
  amount,
  decimals,
  symbol,
  className = "",
  maxDisplayDecimals,
}: TokenAmountProps) {
  let formatted: string;
  try {
    const raw = formatUnits(BigInt(amount), decimals);
    if (maxDisplayDecimals !== undefined && raw.includes(".")) {
      const [whole, frac] = raw.split(".");
      formatted = `${whole}.${frac.slice(0, maxDisplayDecimals)}`;
      // Remove trailing zeros after truncation
      formatted = formatted.replace(/\.?0+$/, "");
      if (formatted === "") formatted = "0";
    } else {
      formatted = raw;
    }
  } catch {
    formatted = "0";
  }

  return (
    <span className={className}>
      {formatted}{" "}
      <span className="text-stash-muted">{symbol}</span>
    </span>
  );
}
