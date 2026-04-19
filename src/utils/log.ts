import type { Hex } from "viem";

import { TRANSFER_TOPIC0, USDC_ADDRESS, USDT_ADDRESS, WETH_ADDRESS } from "@/constants";
import type { DecodedLogItem, LogItem } from "@/types";
import { lowerHex } from "@/utils/hex";

export function mergeUniqueLogs(nextLogs: LogItem[], previousLogs: LogItem[]): LogItem[] {
  const seen = new Set<string>();
  const merged: LogItem[] = [];

  for (const log of [...nextLogs, ...previousLogs]) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    merged.push(log);
  }

  return merged;
}

export function buildSwapTransferKey(txHash: Hex, tokenAddress: Hex, amountRaw: string): string {
  return `${txHash.toLowerCase()}:${lowerHex(tokenAddress)}:${amountRaw}`;
}

export function isNftTransferLog(log: DecodedLogItem): boolean {
  if (log.eventName === "TransferSingle" || log.eventName === "TransferBatch") return true;
  if (log.eventName !== "Transfer") return false;
  return log.topics.length === 4 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC0;
}

export function isErc20TransferLog(log: DecodedLogItem): boolean {
  return (
    log.eventName === "Transfer" &&
    log.topics.length === 3 &&
    log.topics[0]?.toLowerCase() === TRANSFER_TOPIC0
  );
}

export function isSwapLog(log: DecodedLogItem): boolean {
  return log.eventName === "Swap" && log.swapDetails !== null;
}

export function isApprovalLog(log: DecodedLogItem): boolean {
  return log.eventName === "Approval" || log.eventName === "ApprovalForAll";
}

export function compareLogsReverseChronological(a: DecodedLogItem, b: DecodedLogItem): number {
  const leftBlockNumber = BigInt(a.blockNumber);
  const rightBlockNumber = BigInt(b.blockNumber);
  if (leftBlockNumber !== rightBlockNumber) return leftBlockNumber > rightBlockNumber ? -1 : 1;

  const leftLogIndex = a.logIndex ?? -1;
  const rightLogIndex = b.logIndex ?? -1;
  if (leftLogIndex !== rightLogIndex) return rightLogIndex - leftLogIndex;

  return b.id.localeCompare(a.id);
}

export function getKnownTokenSymbol(address: Hex): string | null {
  const normalized = lowerHex(address);
  if (normalized === lowerHex(WETH_ADDRESS)) return "WETH";
  if (normalized === lowerHex(USDC_ADDRESS)) return "USDC";
  if (normalized === lowerHex(USDT_ADDRESS)) return "USDT";
  return null;
}

export function getKnownTokenDecimals(address: Hex): number | null {
  const normalized = lowerHex(address);
  if (normalized === lowerHex(WETH_ADDRESS)) return 18;
  if (normalized === lowerHex(USDC_ADDRESS)) return 6;
  if (normalized === lowerHex(USDT_ADDRESS)) return 6;
  return null;
}
