import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Hex, PublicClient } from "viem";

import {
  ERC1155_METADATA_ABI,
  ERC721_METADATA_ABI,
  MAX_NFT_CONTRACT_QUERIES,
  MAX_NFT_TOKEN_QUERIES,
} from "@/constants";
import type {
  DecodedLogItem,
  NftContractMetadata,
  NftRenderableMetadata,
  NftRow,
  NftTokenCandidate,
  NftTokenUriMetadata,
} from "@/types";
import { toBigIntFromString } from "@/utils/decode";
import { sanitizeTokenSymbol } from "@/utils/format";
import { lowerHex } from "@/utils/hex";
import { buildErc1155MetadataUrl, resolveContentUrl } from "@/utils/url";

type Params = {
  publicClient: PublicClient | undefined;
  nftTransfers: DecodedLogItem[];
};

export function useNftData({ publicClient, nftTransfers }: Params) {
  const nftAddresses = useMemo(() => {
    const unique = new Set<Hex>();

    for (const log of nftTransfers) {
      if (unique.size >= MAX_NFT_CONTRACT_QUERIES) break;
      unique.add(lowerHex(log.address));
    }

    return Array.from(unique);
  }, [nftTransfers]);

  const nftContractMetadataQueries = useQueries({
    queries: nftAddresses.map((address) => ({
      queryKey: ["nft-contract-symbol", address],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      queryFn: async (): Promise<NftContractMetadata> => {
        if (!publicClient) throw new Error("Missing public client");

        try {
          const symbol = await publicClient.readContract({
            address,
            abi: ERC721_METADATA_ABI,
            functionName: "symbol",
          });
          return { symbol: sanitizeTokenSymbol(symbol) };
        } catch {
          return { symbol: "?" };
        }
      },
    })),
  });

  const nftContractMetadataByAddress = useMemo(() => {
    const map = new Map<Hex, NftContractMetadata>();

    for (const [index, query] of nftContractMetadataQueries.entries()) {
      const address = nftAddresses[index];
      if (!address || !query.data) continue;
      map.set(address, query.data);
    }

    return map;
  }, [nftAddresses, nftContractMetadataQueries]);

  const nftTokenCandidates = useMemo(() => {
    const unique = new Set<string>();
    const candidates: NftTokenCandidate[] = [];

    for (const log of nftTransfers) {
      if (candidates.length >= MAX_NFT_TOKEN_QUERIES) break;

      const tokenId = log.nftTokenIdRaw;
      if (!tokenId) continue;

      const address = lowerHex(log.address);
      const key = `${address}:${tokenId}`;
      if (unique.has(key)) continue;

      unique.add(key);
      candidates.push({ address, tokenId });
    }

    return candidates;
  }, [nftTransfers]);

  const nftTokenUriQueries = useQueries({
    queries: nftTokenCandidates.map((item) => ({
      queryKey: ["nft-token-uri", item.address, item.tokenId.toString()],
      enabled: Boolean(publicClient),
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      queryFn: async (): Promise<NftTokenUriMetadata | null> => {
        if (!publicClient) throw new Error("Missing public client");

        const tokenId = toBigIntFromString(item.tokenId);
        if (tokenId === null) return null;

        try {
          const tokenUri = await publicClient.readContract({
            address: item.address,
            abi: ERC721_METADATA_ABI,
            functionName: "tokenURI",
            args: [tokenId],
          });

          if (tokenUri.length > 0) {
            return {
              url: tokenUri,
              resolvedUrl: resolveContentUrl(tokenUri),
            };
          }
        } catch {
          // noop
        }

        try {
          const metadataUri = await publicClient.readContract({
            address: item.address,
            abi: ERC1155_METADATA_ABI,
            functionName: "uri",
            args: [tokenId],
          });

          if (metadataUri.length > 0) {
            const concrete = buildErc1155MetadataUrl(metadataUri, item.tokenId);
            return {
              url: concrete,
              resolvedUrl: resolveContentUrl(concrete),
            };
          }
        } catch {
          // noop
        }

        return null;
      },
    })),
  });

  const nftTokenUriByKey = useMemo(() => {
    const map = new Map<string, NftTokenUriMetadata>();

    for (const [index, query] of nftTokenUriQueries.entries()) {
      const candidate = nftTokenCandidates[index];
      if (!candidate || !query.data) continue;
      map.set(`${candidate.address}:${candidate.tokenId}`, query.data);
    }

    return map;
  }, [nftTokenCandidates, nftTokenUriQueries]);

  const metadataUrls = useMemo(() => {
    const urls = new Set<string>();

    for (const entry of nftTokenUriByKey.values()) {
      urls.add(entry.resolvedUrl);
    }

    return Array.from(urls);
  }, [nftTokenUriByKey]);

  const nftMetadataQueries = useQueries({
    queries: metadataUrls.map((url) => ({
      queryKey: ["nft-metadata-json", url],
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: 1,
      queryFn: async (): Promise<NftRenderableMetadata | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) return null;

          const metadata = await response.json();
          if (!metadata || typeof metadata !== "object") return null;

          const metadataRecord = metadata as Record<string, unknown>;
          const name = typeof metadataRecord.name === "string" ? metadataRecord.name : null;
          const description =
            typeof metadataRecord.description === "string" ? metadataRecord.description : null;
          const rawImage = typeof metadataRecord.image === "string" ? metadataRecord.image : null;

          return {
            name,
            description,
            imageUrl: rawImage ? resolveContentUrl(rawImage) : null,
          };
        } catch {
          return null;
        }
      },
    })),
  });

  const nftMetadataByUrl = useMemo(() => {
    const map = new Map<string, NftRenderableMetadata>();

    for (const [index, query] of nftMetadataQueries.entries()) {
      const url = metadataUrls[index];
      if (!url || !query.data) continue;
      map.set(url, query.data);
    }

    return map;
  }, [metadataUrls, nftMetadataQueries]);

  const nftRows = useMemo(
    (): NftRow[] =>
      nftTransfers.map((log) => {
        const address = lowerHex(log.address);
        const tokenId = log.nftTokenIdRaw;
        const tokenKey = tokenId ? `${address}:${tokenId}` : null;
        const tokenUriMetadata = tokenKey ? (nftTokenUriByKey.get(tokenKey) ?? null) : null;
        const renderableMetadata = tokenUriMetadata
          ? (nftMetadataByUrl.get(tokenUriMetadata.resolvedUrl) ?? null)
          : null;

        return {
          log,
          symbol: nftContractMetadataByAddress.get(address)?.symbol ?? "?",
          tokenId,
          metadata: renderableMetadata,
        };
      }),
    [nftContractMetadataByAddress, nftMetadataByUrl, nftTokenUriByKey, nftTransfers],
  );

  return { nftRows };
}
