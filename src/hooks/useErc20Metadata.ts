import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Hex, PublicClient } from "viem";

import { ERC20_METADATA_ABI, MAX_ERC20_METADATA_QUERIES } from "@/constants";
import type { DecodedLogItem, Erc20ContractMetadata } from "@/types";
import { sanitizeTokenSymbol } from "@/utils/format";
import { lowerHex } from "@/utils/hex";

type Params = {
  publicClient: PublicClient | undefined;
  erc20Transfers: DecodedLogItem[];
  swapTokenAddresses: Hex[];
};

export function useErc20Metadata({ publicClient, erc20Transfers, swapTokenAddresses }: Params) {
  const erc20Addresses = useMemo(() => {
    const unique = new Set<Hex>();

    for (const log of erc20Transfers) {
      if (unique.size >= MAX_ERC20_METADATA_QUERIES) break;
      unique.add(lowerHex(log.address));
    }

    for (const tokenAddress of swapTokenAddresses) {
      if (unique.size >= MAX_ERC20_METADATA_QUERIES) break;
      unique.add(tokenAddress);
    }

    return Array.from(unique);
  }, [erc20Transfers, swapTokenAddresses]);

  const erc20MetadataQueries = useQueries({
    queries: erc20Addresses.map((address) => ({
      queryKey: ["erc20-metadata", address],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      queryFn: async (): Promise<Erc20ContractMetadata> => {
        if (!publicClient) throw new Error("Missing public client");

        let symbol = "?";
        let decimals = 18;

        try {
          const symbolResult = await publicClient.readContract({
            address,
            abi: ERC20_METADATA_ABI,
            functionName: "symbol",
          });
          symbol = sanitizeTokenSymbol(symbolResult);
        } catch {
          symbol = "?";
        }

        try {
          const decimalsResult = await publicClient.readContract({
            address,
            abi: ERC20_METADATA_ABI,
            functionName: "decimals",
          });
          decimals = Number(decimalsResult);
        } catch {
          decimals = 18;
        }

        return { symbol, decimals };
      },
    })),
  });

  const erc20MetadataByAddress = useMemo(() => {
    const map = new Map<Hex, Erc20ContractMetadata>();

    for (const [index, query] of erc20MetadataQueries.entries()) {
      const address = erc20Addresses[index];
      if (!address || !query.data) continue;
      map.set(address, query.data);
    }

    return map;
  }, [erc20Addresses, erc20MetadataQueries]);

  return { erc20MetadataByAddress };
}
