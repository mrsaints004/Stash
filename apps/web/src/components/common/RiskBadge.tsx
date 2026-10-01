"use client";

import type { RiskLevel } from "@stash/common";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; bg: string; text: string; dot: string; pulse?: boolean }
> = {
  safe: {
    label: "Safe",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  warning: {
    label: "Warning",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    dot: "bg-yellow-400",
  },
  danger: {
    label: "At Risk",
    bg: "bg-red-500/10",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  liquidation: {
    label: "Liquidation",
    bg: "bg-red-500/20",
    text: "text-red-300",
    dot: "bg-red-400",
    pulse: true,
  },
};

export function RiskBadge({ level, className = "" }: RiskBadgeProps) {
  const config = RISK_CONFIG[level] ?? RISK_CONFIG.safe;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.dot} ${
          config.pulse ? "animate-pulse" : ""
        }`}
      />
      {config.label}
    </span>
  );
}
