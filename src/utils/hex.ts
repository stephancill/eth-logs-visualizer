import type { Hex } from "viem";

export function lowerHex(value: Hex): Hex {
  return value.toLowerCase() as Hex;
}

export function normalizeAddress(value: unknown): Hex | null {
  if (typeof value !== "string") return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return lowerHex(value as Hex);
}

export function shortenHex(value: Hex | null, visibleChars = 6): string {
  if (!value) return "n/a";
  return `${value.slice(0, visibleChars + 2)}...${value.slice(-visibleChars)}`;
}

export function etherscanAddressUrl(address: Hex): string {
  return `https://etherscan.io/address/${address}`;
}

export function etherscanTxUrl(txHash: Hex | null): string | null {
  if (!txHash) return null;
  return `https://etherscan.io/tx/${txHash}`;
}
