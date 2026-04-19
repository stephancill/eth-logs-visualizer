import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";

import { MAX_BLOCKS } from "@/constants";
import type { BlockItem, LogItem } from "@/types";
import { mergeUniqueLogs } from "@/utils/log";

export function useBlockStream() {
  const publicClient = usePublicClient({ chainId: 1 });
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [blocksProcessedCount, setBlocksProcessedCount] = useState(0);
  const [indicatorMode, setIndicatorMode] = useState<
    "connecting" | "processing" | "listening" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) {
      setIndicatorMode("connecting");
      return;
    }

    let isMounted = true;

    const unwatch = publicClient.watchBlocks({
      blockTag: "latest",
      emitOnBegin: true,
      onBlock: async (block) => {
        if (!isMounted || block.number === null) return;

        setIndicatorMode("processing");
        setError(null);

        try {
          const blockLogs = await publicClient.getLogs({
            fromBlock: block.number,
            toBlock: block.number,
          });

          if (!isMounted) return;

          const nextBlock: BlockItem = {
            number: block.number.toString(),
            hash: block.hash ?? null,
            logCount: blockLogs.length,
            timestamp: Date.now(),
          };

          setBlocks((previousBlocks) => {
            const withoutCurrent = previousBlocks.filter(
              (item) => item.number !== nextBlock.number,
            );
            return [nextBlock, ...withoutCurrent].slice(0, MAX_BLOCKS);
          });

          const nextLogs: LogItem[] = blockLogs.map((item) => ({
            id: `${item.blockHash}-${item.transactionHash}-${item.logIndex}`,
            blockNumber: (item.blockNumber ?? block.number).toString(),
            transactionHash: item.transactionHash ?? null,
            logIndex: item.logIndex ?? null,
            address: item.address,
            topics: item.topics,
            data: item.data,
          }));

          setLogs((previousLogs) => mergeUniqueLogs(nextLogs, previousLogs));
          setBlocksProcessedCount((count) => count + 1);
          setIndicatorMode("listening");
        } catch (watchError) {
          if (!isMounted) return;

          const message =
            watchError instanceof Error ? watchError.message : "Unknown log stream error";

          setIndicatorMode("error");
          setError(message);
        }
      },
      onError: (watchError) => {
        if (!isMounted) return;

        const message =
          watchError instanceof Error ? watchError.message : "Unknown block watch connection error";

        setIndicatorMode("error");
        setError(message);
      },
    });

    return () => {
      isMounted = false;
      unwatch();
    };
  }, [publicClient]);

  return { publicClient, blocks, logs, blocksProcessedCount, indicatorMode, error };
}
