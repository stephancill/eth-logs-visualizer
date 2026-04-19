import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { whatsabi } from "@shazow/whatsabi";
import type { Abi, Hex } from "viem";
import type { PublicClient } from "viem";

import { env, MAX_DECODE_ADDRESSES } from "@/constants";
import type { LogItem } from "@/types";
import { eventAbiFromUnknown } from "@/utils/decode";
import { lowerHex } from "@/utils/hex";

type Params = {
  publicClient: PublicClient | undefined;
  logs: LogItem[];
};

export function useEventAbis({ publicClient, logs }: Params) {
  const [abiDecodeCursor, setAbiDecodeCursor] = useState(0);

  const addressesToDecode = useMemo(() => {
    const uniqueAddresses = new Set<Hex>();

    for (const log of logs) {
      if (uniqueAddresses.size >= MAX_DECODE_ADDRESSES) break;
      uniqueAddresses.add(lowerHex(log.address));
    }

    return Array.from(uniqueAddresses);
  }, [logs]);

  const abiQueries = useQueries({
    queries: addressesToDecode.map((address, index) => ({
      queryKey: ["whatsabi-event-abi", address],
      enabled: Boolean(publicClient) && index < abiDecodeCursor,
      staleTime: 1000 * 60 * 60,
      gcTime: 1000 * 60 * 60 * 24,
      queryFn: async () => {
        if (!publicClient) throw new Error("Missing public client");

        try {
          if (env.VITE_ETHERSCAN_API_KEY) {
            const result = await whatsabi.autoload(address, {
              provider: publicClient,
              followProxies: true,
              onError: () => {
                // noop
              },
              ...whatsabi.loaders.defaultsWithEnv({
                CHAIN_ID: 1,
                ETHERSCAN_API_KEY: env.VITE_ETHERSCAN_API_KEY,
              }),
            });

            return eventAbiFromUnknown(result.abi);
          }

          const result = await whatsabi.autoload(address, {
            provider: publicClient,
            followProxies: true,
            onError: () => {
              // noop
            },
            abiLoader: new whatsabi.loaders.SourcifyABILoader(),
          });

          return eventAbiFromUnknown(result.abi);
        } catch {
          return [];
        }
      },
    })),
  });

  useEffect(() => {
    if (addressesToDecode.length === 0) {
      setAbiDecodeCursor(0);
      return;
    }

    setAbiDecodeCursor((current) => {
      if (current <= 0) return 1;
      return Math.min(current, addressesToDecode.length);
    });
  }, [addressesToDecode.length]);

  useEffect(() => {
    if (addressesToDecode.length === 0 || abiDecodeCursor <= 0) return;

    const currentQuery = abiQueries[abiDecodeCursor - 1];
    if (!currentQuery) return;
    if (currentQuery.isPending || currentQuery.isFetching) return;
    if (abiDecodeCursor >= addressesToDecode.length) return;

    setAbiDecodeCursor(abiDecodeCursor + 1);
  }, [abiDecodeCursor, abiQueries, addressesToDecode.length]);

  const eventAbiByAddress = useMemo(() => {
    const map = new Map<Hex, Abi>();

    for (const [index, query] of abiQueries.entries()) {
      const address = addressesToDecode[index];
      if (!address || !query.data || query.data.length === 0) continue;
      map.set(address, query.data);
    }

    return map;
  }, [abiQueries, addressesToDecode]);

  return {
    eventAbiByAddress,
    abiCached: eventAbiByAddress.size,
    abiTotal: addressesToDecode.length,
  };
}
