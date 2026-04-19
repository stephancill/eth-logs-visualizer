import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import type { Abi, Hex, PublicClient } from "viem";

import { MAX_SWAP_PAIR_QUERIES, UNISWAP_V2_PAIR_ABI } from "@/constants";
import type { DecodedLogItem, LogItem, SwapPairTokens } from "@/types";
import {
  extractErc20AmountRaw,
  extractNftTokenIdRaw,
  extractSwapDetails,
  extractTransferFromAddress,
  toBigIntFromString,
} from "@/utils/decode";
import { formatDecodedArgLines } from "@/utils/format";
import { lowerHex } from "@/utils/hex";
import {
  buildSwapTransferKey,
  compareLogsReverseChronological,
  isApprovalLog,
  isErc20TransferLog,
  isNftTransferLog,
  isSwapLog,
} from "@/utils/log";

type Params = {
  publicClient: PublicClient | undefined;
  logs: LogItem[];
  eventAbiByAddress: Map<Hex, Abi>;
};

export function useLogClassification({ publicClient, logs, eventAbiByAddress }: Params) {
  const decodedLogs = useMemo<DecodedLogItem[]>(
    () =>
      logs.map((log) => {
        const abi = eventAbiByAddress.get(lowerHex(log.address));

        if (!abi || abi.length === 0) {
          return {
            ...log,
            decodeStatus: "ABI not loaded",
            eventName: null,
            decodedArgLines: null,
            erc20AmountRaw: null,
            nftTokenIdRaw: null,
            swapDetails: null,
            transferFrom: null,
          };
        }

        try {
          const topics = [...log.topics] as [] | [Hex, ...Hex[]];

          const decoded = decodeEventLog({
            abi,
            data: log.data,
            topics,
            strict: false,
          });

          return {
            ...log,
            decodeStatus: "decoded",
            eventName: decoded.eventName ?? null,
            decodedArgLines: formatDecodedArgLines(decoded.args),
            erc20AmountRaw: extractErc20AmountRaw(decoded.args),
            nftTokenIdRaw: extractNftTokenIdRaw(decoded.eventName ?? null, decoded.args),
            swapDetails: extractSwapDetails(decoded.eventName ?? null, decoded.args),
            transferFrom: extractTransferFromAddress(decoded.eventName ?? null, decoded.args),
          };
        } catch {
          return {
            ...log,
            decodeStatus: "No matching event signature",
            eventName: null,
            decodedArgLines: null,
            erc20AmountRaw: null,
            nftTokenIdRaw: null,
            swapDetails: null,
            transferFrom: null,
          };
        }
      }),
    [eventAbiByAddress, logs],
  );

  const sortedDecodedLogs = useMemo(
    () => [...decodedLogs].sort(compareLogsReverseChronological),
    [decodedLogs],
  );

  const erc20TransferLogs = useMemo(
    () => sortedDecodedLogs.filter((log) => isErc20TransferLog(log)),
    [sortedDecodedLogs],
  );

  const nftTransfers = useMemo(
    () => sortedDecodedLogs.filter((log) => isNftTransferLog(log)),
    [sortedDecodedLogs],
  );

  const swapLogs = useMemo(
    () => sortedDecodedLogs.filter((log) => isSwapLog(log)),
    [sortedDecodedLogs],
  );

  const otherLogs = useMemo(
    () =>
      sortedDecodedLogs.filter(
        (log) =>
          log.decodeStatus === "decoded" &&
          !isErc20TransferLog(log) &&
          !isNftTransferLog(log) &&
          !isSwapLog(log) &&
          !isApprovalLog(log),
      ),
    [sortedDecodedLogs],
  );

  const swapPairAddresses = useMemo(() => {
    const unique = new Set<Hex>();

    for (const log of swapLogs) {
      if (unique.size >= MAX_SWAP_PAIR_QUERIES) break;
      unique.add(lowerHex(log.address));
    }

    return Array.from(unique);
  }, [swapLogs]);

  const swapPairTokenQueries = useQueries({
    queries: swapPairAddresses.map((pairAddress) => ({
      queryKey: ["swap-pair-tokens", pairAddress],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      queryFn: async (): Promise<SwapPairTokens | null> => {
        if (!publicClient) throw new Error("Missing public client");

        try {
          const [token0, token1] = await Promise.all([
            publicClient.readContract({
              address: pairAddress,
              abi: UNISWAP_V2_PAIR_ABI,
              functionName: "token0",
            }),
            publicClient.readContract({
              address: pairAddress,
              abi: UNISWAP_V2_PAIR_ABI,
              functionName: "token1",
            }),
          ]);

          return {
            token0: lowerHex(token0),
            token1: lowerHex(token1),
          };
        } catch {
          return null;
        }
      },
    })),
  });

  const swapPairTokensByAddress = useMemo(() => {
    const map = new Map<Hex, SwapPairTokens>();

    for (const [index, query] of swapPairTokenQueries.entries()) {
      const pairAddress = swapPairAddresses[index];
      if (!pairAddress || !query.data) continue;
      map.set(pairAddress, query.data);
    }

    return map;
  }, [swapPairAddresses, swapPairTokenQueries]);

  const swapTransferMatchCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const swapLog of swapLogs) {
      if (!swapLog.transactionHash) continue;
      if (!swapLog.swapDetails) continue;

      const pairTokens = swapPairTokensByAddress.get(lowerHex(swapLog.address));
      if (!pairTokens) continue;

      const txHash = swapLog.transactionHash;
      const details = swapLog.swapDetails;

      const candidates: Array<{ token: Hex; amountRaw: string }> = [
        { token: pairTokens.token0, amountRaw: details.amount0InRaw },
        { token: pairTokens.token1, amountRaw: details.amount1InRaw },
        { token: pairTokens.token0, amountRaw: details.amount0OutRaw },
        { token: pairTokens.token1, amountRaw: details.amount1OutRaw },
      ];

      for (const item of candidates) {
        const amount = toBigIntFromString(item.amountRaw) ?? 0n;
        if (amount <= 0n) continue;

        const key = buildSwapTransferKey(txHash, item.token, item.amountRaw);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [swapLogs, swapPairTokensByAddress]);

  const erc20Transfers = useMemo(() => {
    const remainingMatches = new Map(swapTransferMatchCounts);

    return erc20TransferLogs.filter((log) => {
      if (!log.transactionHash) return true;

      const amountRaw = log.erc20AmountRaw ?? "0";
      const key = buildSwapTransferKey(log.transactionHash, log.address, amountRaw);
      const count = remainingMatches.get(key) ?? 0;
      if (count <= 0) return true;

      remainingMatches.set(key, count - 1);
      return false;
    });
  }, [erc20TransferLogs, swapTransferMatchCounts]);

  const swapTokenAddresses = useMemo(() => {
    const unique = new Set<Hex>();

    for (const pairTokens of swapPairTokensByAddress.values()) {
      unique.add(pairTokens.token0);
      unique.add(pairTokens.token1);
    }

    return Array.from(unique);
  }, [swapPairTokensByAddress]);

  const eventCountRows = useMemo(() => {
    const counts = new Map<string, number>();

    for (const log of sortedDecodedLogs) {
      if (log.decodeStatus !== "decoded" || !log.eventName) continue;
      counts.set(log.eventName, (counts.get(log.eventName) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([eventName, count]) => ({ eventName, count }))
      .filter((item) => item.count >= 10)
      .sort(
        (left, right) => right.count - left.count || left.eventName.localeCompare(right.eventName),
      )
      .slice(0, 10);
  }, [sortedDecodedLogs]);

  return {
    sortedDecodedLogs,
    erc20Transfers,
    nftTransfers,
    otherLogs,
    swapLogs,
    swapPairTokensByAddress,
    swapTokenAddresses,
    eventCountRows,
  };
}
