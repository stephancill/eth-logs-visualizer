import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { PublicClient } from "viem";

import type { BlockItem, BlockTimeInfo, DecodedLogItem } from "@/types";
import { toBigIntFromString } from "@/utils/decode";

type Params = {
  publicClient: PublicClient | undefined;
  sortedDecodedLogs: DecodedLogItem[];
  blocks: BlockItem[];
};

export function useBlockTimes({ publicClient, sortedDecodedLogs, blocks }: Params) {
  const blockNumbersForTime = useMemo(() => {
    const unique = new Set<string>();
    const result: string[] = [];

    for (const log of sortedDecodedLogs) {
      const key = log.blockNumber;
      if (unique.has(key)) continue;
      unique.add(key);
      result.push(log.blockNumber);
    }

    return result;
  }, [sortedDecodedLogs]);

  const blockTimeQueries = useQueries({
    queries: blockNumbersForTime.map((blockNumber) => ({
      queryKey: ["block-time", blockNumber.toString()],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60,
      queryFn: async (): Promise<BlockTimeInfo | null> => {
        if (!publicClient) throw new Error("Missing public client");

        const normalized = toBigIntFromString(blockNumber);
        if (normalized === null) return null;

        try {
          const block = await publicClient.getBlock({ blockNumber: normalized });
          return {
            blockNumber,
            timestampMs: Number(block.timestamp) * 1000,
          };
        } catch {
          return null;
        }
      },
    })),
  });

  const blockTimeByNumber = useMemo(() => {
    const map = new Map<string, number>();

    for (const [index, query] of blockTimeQueries.entries()) {
      const blockNumber = blockNumbersForTime[index];
      if (!blockNumber) continue;

      if (query.data) {
        map.set(blockNumber, query.data.timestampMs);
        continue;
      }

      const fallbackBlock = blocks.find((item) => item.number === blockNumber);
      if (fallbackBlock) {
        map.set(blockNumber, fallbackBlock.timestamp);
      }
    }

    return map;
  }, [blockNumbersForTime, blockTimeQueries, blocks]);

  return { blockTimeByNumber };
}
