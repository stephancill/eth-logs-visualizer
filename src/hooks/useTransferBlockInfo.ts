import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Hex, PublicClient } from "viem";

import type { DecodedLogItem, TxDirectCallInfo } from "@/types";
import { decodeDirectTransferMethod, toBigIntFromString } from "@/utils/decode";
import { lowerHex } from "@/utils/hex";

type Params = {
  publicClient: PublicClient | undefined;
  visibleErc20Items: { log: DecodedLogItem }[];
  visibleNftItems: { log: DecodedLogItem }[];
};

export function useTransferBlockInfo({ publicClient, visibleErc20Items, visibleNftItems }: Params) {
  const visibleTransferBlockNumbers = useMemo(() => {
    const unique = new Set<string>();

    for (const row of [...visibleErc20Items, ...visibleNftItems]) {
      unique.add(row.log.blockNumber);
    }

    return Array.from(unique);
  }, [visibleErc20Items, visibleNftItems]);

  const transferBlockQueries = useQueries({
    queries: visibleTransferBlockNumbers.map((blockNumber) => ({
      queryKey: ["block-direct-transfer-txs", blockNumber],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 60,
      gcTime: 1000 * 60 * 60 * 24,
      queryFn: async (): Promise<Array<{ hash: Hex; info: TxDirectCallInfo }>> => {
        if (!publicClient) throw new Error("Missing public client");

        const normalized = toBigIntFromString(blockNumber);
        if (normalized === null) return [];

        try {
          const block = await publicClient.getBlock({
            blockNumber: normalized,
            includeTransactions: true,
          });

          const entries: Array<{ hash: Hex; info: TxDirectCallInfo }> = [];

          for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || !tx.input || tx.input === "0x") continue;

            const method = decodeDirectTransferMethod(tx.input);
            if (!method) continue;

            entries.push({
              hash: lowerHex(tx.hash),
              info: {
                to: lowerHex(tx.to),
                method,
              },
            });
          }

          return entries;
        } catch {
          return [];
        }
      },
    })),
  });

  const transferTxInfoByHash = useMemo(() => {
    const map = new Map<Hex, TxDirectCallInfo>();

    for (const query of transferBlockQueries) {
      if (!query.data) continue;

      for (const entry of query.data) {
        map.set(entry.hash, entry.info);
      }
    }

    return map;
  }, [transferBlockQueries]);

  return { transferTxInfoByHash };
}
