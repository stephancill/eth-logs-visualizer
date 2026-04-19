import { formatUnits } from "viem";

import { getRecord } from "@/utils/decode";

export function toDisplayString(value: unknown): string {
  try {
    return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
  } catch {
    return String(value);
  }
}

export function formatAmountForDisplay(value: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;

  return numericValue.toLocaleString("en-US", {
    maximumSignificantDigits: 6,
  });
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatAmountForDisplay(formatUnits(amount, decimals));
}

export function formatDecodedArgLines(args: unknown): string[] | null {
  if (args === null || args === undefined) return null;

  if (Array.isArray(args)) {
    if (args.length === 0) return ["(empty)"];
    return args.map((value, index) => `[${index}]: ${toDisplayString(value)}`);
  }

  const record = getRecord(args);
  if (record) {
    const entries = Object.entries(record);
    if (entries.length === 0) return ["(empty)"];
    return entries.map(([key, value]) => `${key}: ${toDisplayString(value)}`);
  }

  return [toDisplayString(args)];
}

export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const safeDiffMs = diffMs >= 0 ? diffMs : 0;

  const seconds = Math.floor(safeDiffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function sanitizeTokenSymbol(symbol: string | null): string {
  if (!symbol) return "?";
  const value = symbol.split("\u0000").join("").trim();
  return value.length > 0 ? value : "?";
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
