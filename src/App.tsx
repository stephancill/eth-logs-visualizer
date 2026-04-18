import { useQueries } from "@tanstack/react-query";
import { whatsabi } from "@shazow/whatsabi";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, formatUnits } from "viem";
import type { Abi, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { z } from "zod";

const MAX_BLOCKS = 20;
const MAX_LOGS = 10_000;
const MAX_DECODE_ADDRESSES = 1_000;
const MAX_ERC20_METADATA_QUERIES = 80;
const MAX_NFT_CONTRACT_QUERIES = 80;
const MAX_NFT_TOKEN_QUERIES = 100;
const MAX_SWAP_PAIR_QUERIES = 80;

const ERC20_METADATA_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const ERC721_METADATA_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

const ERC1155_METADATA_ABI = [
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

const UNISWAP_V2_PAIR_ABI = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const envSchema = z.object({
  VITE_ETHERSCAN_API_KEY: z.string().min(1).optional(),
});

const env = envSchema.parse(import.meta.env);

type BlockItem = {
  number: string;
  hash: Hex | null;
  logCount: number;
  timestamp: number;
};

type LogItem = {
  id: string;
  blockNumber: string;
  transactionHash: Hex | null;
  logIndex: number | null;
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
};

type DecodedLogItem = LogItem & {
  decodeStatus: string;
  eventName: string | null;
  decodedArgLines: string[] | null;
  erc20AmountRaw: string | null;
  nftTokenIdRaw: string | null;
  swapDetails: SwapDetails | null;
};

type SwapDetails = {
  sender: Hex | null;
  to: Hex | null;
  amount0InRaw: string;
  amount1InRaw: string;
  amount0OutRaw: string;
  amount1OutRaw: string;
};

type Erc20ContractMetadata = {
  symbol: string;
  decimals: number;
};

type NftContractMetadata = {
  symbol: string;
};

type NftTokenCandidate = {
  address: Hex;
  tokenId: string;
};

type NftTokenUriMetadata = {
  url: string;
  resolvedUrl: string;
};

type NftRenderableMetadata = {
  name: string | null;
  imageUrl: string | null;
  description: string | null;
};

type BlockTimeInfo = {
  blockNumber: string;
  timestampMs: number;
};

type SwapPairTokens = {
  token0: Hex;
  token1: Hex;
};

function mergeUniqueLogs(nextLogs: LogItem[], previousLogs: LogItem[]): LogItem[] {
  const seen = new Set<string>();
  const merged: LogItem[] = [];

  for (const log of [...nextLogs, ...previousLogs]) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    merged.push(log);
    if (merged.length >= MAX_LOGS) break;
  }

  return merged;
}

function shortenHex(value: Hex | null, visibleChars = 6): string {
  if (!value) return "n/a";
  return `${value.slice(0, visibleChars + 2)}...${value.slice(-visibleChars)}`;
}

function etherscanAddressUrl(address: Hex): string {
  return `https://etherscan.io/address/${address}`;
}

function etherscanTxUrl(txHash: Hex | null): string | null {
  if (!txHash) return null;
  return `https://etherscan.io/tx/${txHash}`;
}

function toDisplayString(value: unknown): string {
  try {
    return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
  } catch {
    return String(value);
  }
}

function formatDecodedArgLines(args: unknown): string[] | null {
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

function eventAbiFromUnknown(abiLike: unknown): Abi {
  if (!Array.isArray(abiLike)) return [];

  return abiLike.filter((item) => {
    if (!item || typeof item !== "object") return false;

    const abiItem = item as {
      type?: unknown;
      inputs?: unknown;
    };

    return abiItem.type === "event" && Array.isArray(abiItem.inputs);
  }) as Abi;
}

function lowerHex(value: Hex): Hex {
  return value.toLowerCase() as Hex;
}

function isNftTransferLog(log: DecodedLogItem): boolean {
  if (log.eventName === "TransferSingle" || log.eventName === "TransferBatch") return true;
  if (log.eventName !== "Transfer") return false;
  return log.topics.length >= 4;
}

function isErc20TransferLog(log: DecodedLogItem): boolean {
  return log.eventName === "Transfer" && log.topics.length === 3;
}

function compareLogsReverseChronological(a: DecodedLogItem, b: DecodedLogItem): number {
  const leftBlockNumber = BigInt(a.blockNumber);
  const rightBlockNumber = BigInt(b.blockNumber);
  if (leftBlockNumber !== rightBlockNumber) return leftBlockNumber > rightBlockNumber ? -1 : 1;

  const leftLogIndex = a.logIndex ?? -1;
  const rightLogIndex = b.logIndex ?? -1;
  if (leftLogIndex !== rightLogIndex) return rightLogIndex - leftLogIndex;

  return b.id.localeCompare(a.id);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function toBigIntFromString(value: string | null): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function normalizeAddress(value: unknown): Hex | null {
  if (typeof value !== "string") return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return lowerHex(value as Hex);
}

function getNamedOrIndexedArg(args: unknown, key: string, index: number): unknown {
  const record = getRecord(args);
  if (record && key in record) return record[key];
  if (Array.isArray(args) && index < args.length) return args[index];
  return null;
}

function extractErc20AmountRaw(args: unknown): string | null {
  const value = toBigInt(getNamedOrIndexedArg(args, "value", 2));
  return value ? value.toString() : null;
}

function extractNftTokenIdRaw(eventName: string | null, args: unknown): string | null {
  if (eventName === "Transfer") {
    const value = toBigInt(getNamedOrIndexedArg(args, "tokenId", 2));
    return value ? value.toString() : null;
  }

  if (eventName === "TransferSingle") {
    const value = toBigInt(getNamedOrIndexedArg(args, "id", 3));
    return value ? value.toString() : null;
  }

  if (eventName === "TransferBatch") {
    const ids = getNamedOrIndexedArg(args, "ids", 3);
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const value = toBigInt(ids[0]);
    return value ? value.toString() : null;
  }

  return null;
}

function extractSwapDetails(eventName: string | null, args: unknown): SwapDetails | null {
  if (eventName !== "Swap") return null;

  const sender = normalizeAddress(getNamedOrIndexedArg(args, "sender", 0));
  const to =
    normalizeAddress(getNamedOrIndexedArg(args, "to", 5)) ??
    normalizeAddress(getNamedOrIndexedArg(args, "to", 1)) ??
    normalizeAddress(getNamedOrIndexedArg(args, "recipient", 1));

  // Uniswap V2-style Swap(sender, amount0In, amount1In, amount0Out, amount1Out, to)
  const amount0InV2 = toBigInt(getNamedOrIndexedArg(args, "amount0In", 1));
  const amount1InV2 = toBigInt(getNamedOrIndexedArg(args, "amount1In", 2));
  const amount0OutV2 = toBigInt(getNamedOrIndexedArg(args, "amount0Out", 3));
  const amount1OutV2 = toBigInt(getNamedOrIndexedArg(args, "amount1Out", 4));

  if (
    amount0InV2 !== null ||
    amount1InV2 !== null ||
    amount0OutV2 !== null ||
    amount1OutV2 !== null
  ) {
    return {
      sender,
      to,
      amount0InRaw: (amount0InV2 ?? 0n).toString(),
      amount1InRaw: (amount1InV2 ?? 0n).toString(),
      amount0OutRaw: (amount0OutV2 ?? 0n).toString(),
      amount1OutRaw: (amount1OutV2 ?? 0n).toString(),
    };
  }

  // Uniswap V3-style Swap(sender, recipient, amount0, amount1, ...)
  // Positive amount means token sent in to pool, negative means token sent out from pool.
  const amount0V3 = toBigInt(getNamedOrIndexedArg(args, "amount0", 2));
  const amount1V3 = toBigInt(getNamedOrIndexedArg(args, "amount1", 3));

  if (amount0V3 !== null || amount1V3 !== null) {
    const amount0In = amount0V3 && amount0V3 > 0n ? amount0V3 : 0n;
    const amount1In = amount1V3 && amount1V3 > 0n ? amount1V3 : 0n;
    const amount0Out = amount0V3 && amount0V3 < 0n ? -amount0V3 : 0n;
    const amount1Out = amount1V3 && amount1V3 < 0n ? -amount1V3 : 0n;

    return {
      sender,
      to,
      amount0InRaw: amount0In.toString(),
      amount1InRaw: amount1In.toString(),
      amount0OutRaw: amount0Out.toString(),
      amount1OutRaw: amount1Out.toString(),
    };
  }

  return null;
}

function isSwapLog(log: DecodedLogItem): boolean {
  return log.eventName === "Swap" && log.swapDetails !== null;
}

function isApprovalLog(log: DecodedLogItem): boolean {
  return log.eventName === "Approval" || log.eventName === "ApprovalForAll";
}

function sanitizeTokenSymbol(symbol: string | null): string {
  if (!symbol) return "?";
  const value = symbol.split("\u0000").join("").trim();
  return value.length > 0 ? value : "?";
}

function resolveContentUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }

  if (trimmed.startsWith("ipns://")) {
    return `https://ipfs.io/ipns/${trimmed.slice("ipns://".length)}`;
  }

  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }

  return trimmed;
}

function buildErc1155MetadataUrl(rawUrl: string, tokenIdRaw: string): string {
  const tokenIdHex = BigInt(tokenIdRaw).toString(16).padStart(64, "0");
  return rawUrl.replace("{id}", tokenIdHex);
}

function formatRelativeTime(timestampMs: number): string {
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

type LogListSectionParams = {
  title: string;
  logs: DecodedLogItem[];
  emptyText: string;
  blockTimeByNumber: Map<string, number>;
};

function LogListSection({ title, logs, emptyText, blockTimeByNumber }: LogListSectionParams) {
  return (
    <article className="min-h-0 min-w-0 border p-2 flex flex-col">
      <h2>{title}</h2>
      <ul className="space-y-2 min-h-0 min-w-0 overflow-auto">
        {logs.length === 0 ? (
          <li className="border p-2">{emptyText}</li>
        ) : (
          logs.map((log) => (
            <li key={log.id} className="min-w-0 border p-2">
              <details>
                <summary>
                  {log.eventName ?? (log.topics[0] ? shortenHex(log.topics[0]) : "n/a")} -{" "}
                  <a href={etherscanAddressUrl(log.address)} target="_blank" rel="noreferrer">
                    {shortenHex(log.address)}
                  </a>
                </summary>
                <div>
                  <p>
                    time:{" "}
                    {etherscanTxUrl(log.transactionHash) ? (
                      <a
                        href={etherscanTxUrl(log.transactionHash) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {blockTimeByNumber.has(log.blockNumber)
                          ? formatRelativeTime(blockTimeByNumber.get(log.blockNumber) ?? Date.now())
                          : "n/a"}
                      </a>
                    ) : blockTimeByNumber.has(log.blockNumber) ? (
                      formatRelativeTime(blockTimeByNumber.get(log.blockNumber) ?? Date.now())
                    ) : (
                      "n/a"
                    )}
                  </p>
                  {log.decodedArgLines && log.decodedArgLines.length > 0 ? (
                    <div>
                      <p>args:</p>
                      {log.decodedArgLines.map((line, index) => (
                        <p key={`${log.id}-arg-${index}`} className="min-w-0 break-all">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

function App() {
  const publicClient = usePublicClient({ chainId: 1 });
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [abiDecodeCursor, setAbiDecodeCursor] = useState(0);
  const [status, setStatus] = useState("Connecting to mainnet block stream...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) {
      setStatus("Waiting for public client...");
      return;
    }

    let isMounted = true;

    const unwatch = publicClient.watchBlocks({
      blockTag: "latest",
      emitOnBegin: true,
      onBlock: async (block) => {
        if (!isMounted || block.number === null) return;

        setStatus(`Processing block ${block.number.toString()}...`);
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
          setStatus(`Listening. Latest block: ${block.number.toString()}`);
        } catch (watchError) {
          if (!isMounted) return;

          const message =
            watchError instanceof Error ? watchError.message : "Unknown log stream error";

          setError(message);
          setStatus("Listening, but latest block fetch failed");
        }
      },
      onError: (watchError) => {
        if (!isMounted) return;

        const message =
          watchError instanceof Error ? watchError.message : "Unknown block watch connection error";

        setError(message);
        setStatus("Block stream disconnected");
      },
    });

    return () => {
      isMounted = false;
      unwatch();
    };
  }, [publicClient]);

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
          };
        }
      }),
    [eventAbiByAddress, logs],
  );

  const sortedDecodedLogs = useMemo(
    () => [...decodedLogs].sort(compareLogsReverseChronological),
    [decodedLogs],
  );

  const erc20Transfers = useMemo(
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

  const swapTokenAddresses = useMemo(() => {
    const unique = new Set<Hex>();

    for (const pairTokens of swapPairTokensByAddress.values()) {
      unique.add(pairTokens.token0);
      unique.add(pairTokens.token1);
    }

    return Array.from(unique);
  }, [swapPairTokensByAddress]);

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

  const erc20Rows = useMemo(
    () =>
      erc20Transfers.map((log) => {
        const metadata = erc20MetadataByAddress.get(lowerHex(log.address));
        const amount = toBigIntFromString(log.erc20AmountRaw);
        const decimals = metadata?.decimals ?? 18;

        return {
          log,
          symbol: metadata?.symbol ?? "?",
          amountLabel: amount === null ? "n/a" : formatUnits(amount, decimals),
        };
      }),
    [erc20MetadataByAddress, erc20Transfers],
  );

  const swapRows = useMemo(
    () =>
      swapLogs.map((log) => {
        const pairTokens = swapPairTokensByAddress.get(lowerHex(log.address)) ?? null;
        const details = log.swapDetails;

        const buildTokenAmount = (tokenAddress: Hex | null, amountRaw: string) => {
          const amount = toBigIntFromString(amountRaw) ?? 0n;
          const metadata = tokenAddress ? erc20MetadataByAddress.get(tokenAddress) : undefined;

          if (tokenAddress) {
            return {
              tokenAddress,
              symbol: metadata?.symbol ?? shortenHex(tokenAddress),
              amountLabel: formatUnits(amount, metadata?.decimals ?? 18),
              amountRaw,
            };
          }

          return {
            tokenAddress: null,
            symbol: "?",
            amountLabel: amountRaw,
            amountRaw,
          };
        };

        const inItems = [
          buildTokenAmount(pairTokens?.token0 ?? null, details?.amount0InRaw ?? "0"),
          buildTokenAmount(pairTokens?.token1 ?? null, details?.amount1InRaw ?? "0"),
        ].filter((item) => (toBigIntFromString(item.amountRaw) ?? 0n) > 0n);

        const outItems = [
          buildTokenAmount(pairTokens?.token0 ?? null, details?.amount0OutRaw ?? "0"),
          buildTokenAmount(pairTokens?.token1 ?? null, details?.amount1OutRaw ?? "0"),
        ].filter((item) => (toBigIntFromString(item.amountRaw) ?? 0n) > 0n);

        return {
          log,
          sender: details?.sender ?? null,
          to: details?.to ?? null,
          inItems,
          outItems,
        };
      }),
    [erc20MetadataByAddress, swapLogs, swapPairTokensByAddress],
  );

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
      );
  }, [sortedDecodedLogs]);

  const nftRows = useMemo(
    () =>
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

  const statsText = useMemo(() => {
    const latest = blocks[0];
    if (!latest) return "No blocks received yet.";
    return `Latest block ${latest.number} with ${latest.logCount} logs.`;
  }, [blocks]);

  const decodingCount = abiQueries.filter((query) => query.isFetching).length;

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

  return (
    <main className="h-screen">
      <div className="grid h-full gap-3 p-3 lg:grid-cols-2">
        <section className="grid min-h-0 min-w-0 gap-3 lg:grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <header className="border p-2">
            <p>Ethereum Mainnet</p>
            <h1>Live Transfer Stream</h1>
            <p>{status}</p>
            {error ? <p>{error}</p> : null}
            <p>{statsText}</p>
            <p>
              ABI cache: {eventAbiByAddress.size}/{addressesToDecode.length}
              {decodingCount > 0 ? ` (${decodingCount} loading)` : ""}
            </p>
            <p>
              Swaps: {swapRows.length} | ERC20: {erc20Transfers.length} | NFT: {nftTransfers.length}{" "}
              | Other: {otherLogs.length}
            </p>
          </header>

          <article className="border p-2">
            <h2>Event Leaderboard</h2>
            <ol className="columns-3">
              {eventCountRows.length === 0 ? (
                <li>None yet...</li>
              ) : (
                eventCountRows.map((item) => (
                  <li key={item.eventName} className="break-inside-avoid">
                    {item.eventName}: {item.count}
                  </li>
                ))
              )}
            </ol>
          </article>

          <article className="min-h-0 border p-2 flex flex-col">
            <h2>Swaps</h2>
            <ul className="space-y-2 min-h-0 overflow-auto">
              {swapRows.length === 0 ? (
                <li className="border p-2">No swaps captured yet...</li>
              ) : (
                swapRows.map(({ log, sender, to, inItems, outItems }) => (
                  <li key={log.id} className="relative border p-2 pr-20">
                    <p className="absolute right-2 top-2 text-gray-500">
                      {etherscanTxUrl(log.transactionHash) ? (
                        <a
                          href={etherscanTxUrl(log.transactionHash) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {blockTimeByNumber.has(log.blockNumber)
                            ? formatRelativeTime(
                                blockTimeByNumber.get(log.blockNumber) ?? Date.now(),
                              )
                            : "n/a"}
                        </a>
                      ) : blockTimeByNumber.has(log.blockNumber) ? (
                        formatRelativeTime(blockTimeByNumber.get(log.blockNumber) ?? Date.now())
                      ) : (
                        "n/a"
                      )}
                    </p>
                    <p>
                      in:{" "}
                      {inItems.length === 0
                        ? "none"
                        : inItems.map((item, index) => (
                            <span key={`${log.id}-in-${index}`}>
                              {index > 0 ? ", " : ""}
                              {item.tokenAddress ? (
                                <a
                                  href={etherscanAddressUrl(item.tokenAddress)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.symbol}
                                </a>
                              ) : (
                                item.symbol
                              )}{" "}
                              {item.amountLabel}
                            </span>
                          ))}
                    </p>
                    <p>
                      out:{" "}
                      {outItems.length === 0
                        ? "none"
                        : outItems.map((item, index) => (
                            <span key={`${log.id}-out-${index}`}>
                              {index > 0 ? ", " : ""}
                              {item.tokenAddress ? (
                                <a
                                  href={etherscanAddressUrl(item.tokenAddress)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {item.symbol}
                                </a>
                              ) : (
                                item.symbol
                              )}{" "}
                              {item.amountLabel}
                            </span>
                          ))}
                    </p>
                    {sender ? (
                      <p>
                        sender:{" "}
                        <a href={etherscanAddressUrl(sender)} target="_blank" rel="noreferrer">
                          {shortenHex(sender)}
                        </a>
                      </p>
                    ) : null}
                    {to ? (
                      <p>
                        to:{" "}
                        <a href={etherscanAddressUrl(to)} target="_blank" rel="noreferrer">
                          {shortenHex(to)}
                        </a>
                      </p>
                    ) : null}
                    <p>
                      pool:{" "}
                      <a href={etherscanAddressUrl(log.address)} target="_blank" rel="noreferrer">
                        {shortenHex(log.address)}
                      </a>
                    </p>
                  </li>
                ))
              )}
            </ul>
          </article>

          <LogListSection
            title="Other Logs"
            logs={otherLogs}
            emptyText="No other logs captured yet..."
            blockTimeByNumber={blockTimeByNumber}
          />
        </section>

        <section className="grid min-h-0 min-w-0 gap-3 lg:grid-rows-2">
          <article className="min-h-0 border p-2 flex flex-col">
            <h2>ERC20 Transfers</h2>
            <ul className="space-y-2 min-h-0 overflow-auto">
              {erc20Rows.length === 0 ? (
                <li className="border p-2">No ERC20 transfers captured yet...</li>
              ) : (
                erc20Rows.map(({ log, symbol, amountLabel }) => (
                  <li key={log.id} className="relative border p-2 pr-20">
                    <p className="absolute right-2 top-2 text-gray-500">
                      {etherscanTxUrl(log.transactionHash) ? (
                        <a
                          href={etherscanTxUrl(log.transactionHash) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {blockTimeByNumber.has(log.blockNumber)
                            ? formatRelativeTime(
                                blockTimeByNumber.get(log.blockNumber) ?? Date.now(),
                              )
                            : "n/a"}
                        </a>
                      ) : blockTimeByNumber.has(log.blockNumber) ? (
                        formatRelativeTime(blockTimeByNumber.get(log.blockNumber) ?? Date.now())
                      ) : (
                        "n/a"
                      )}
                    </p>
                    <p>
                      {symbol !== "?" ? (
                        <a href={etherscanAddressUrl(log.address)} target="_blank" rel="noreferrer">
                          {symbol}
                        </a>
                      ) : (
                        symbol
                      )}{" "}
                      <span>{amountLabel}</span>
                    </p>
                    {symbol === "?" ? (
                      <p>
                        token:{" "}
                        <a href={etherscanAddressUrl(log.address)} target="_blank" rel="noreferrer">
                          {shortenHex(log.address)}
                        </a>
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </article>

          <article className="min-h-0 border p-2 flex flex-col">
            <h2>NFT Transfers</h2>
            <ul className="space-y-2 min-h-0 overflow-auto">
              {nftRows.length === 0 ? (
                <li className="border p-2">No NFT transfers captured yet...</li>
              ) : (
                nftRows.map(({ log, symbol, tokenId, metadata }) => (
                  <li key={log.id} className="relative border p-2 pr-20">
                    <p className="absolute right-2 top-2 text-gray-500">
                      {etherscanTxUrl(log.transactionHash) ? (
                        <a
                          href={etherscanTxUrl(log.transactionHash) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {blockTimeByNumber.has(log.blockNumber)
                            ? formatRelativeTime(
                                blockTimeByNumber.get(log.blockNumber) ?? Date.now(),
                              )
                            : "n/a"}
                        </a>
                      ) : blockTimeByNumber.has(log.blockNumber) ? (
                        formatRelativeTime(blockTimeByNumber.get(log.blockNumber) ?? Date.now())
                      ) : (
                        "n/a"
                      )}
                    </p>
                    <div className="flex items-start gap-2">
                      {metadata?.imageUrl ? (
                        <img
                          src={metadata.imageUrl}
                          alt={metadata.name ?? `${symbol} #${tokenId ?? "n/a"}`}
                          loading="lazy"
                          className="h-16 w-16 shrink-0 object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 shrink-0 border" />
                      )}

                      <div className="min-w-0">
                        <p>
                          {symbol !== "?" ? (
                            <a
                              href={etherscanAddressUrl(log.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {symbol}
                            </a>
                          ) : (
                            symbol
                          )}{" "}
                          <span>#{tokenId ?? "n/a"}</span>
                        </p>
                        {metadata?.description ? (
                          <p className="break-words line-clamp-3">{metadata.description}</p>
                        ) : null}
                        {metadata?.name ? <p>name: {metadata.name}</p> : null}
                      </div>
                    </div>
                    {symbol === "?" ? (
                      <p>
                        contract:{" "}
                        <a href={etherscanAddressUrl(log.address)} target="_blank" rel="noreferrer">
                          {shortenHex(log.address)}
                        </a>
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}

export default App;
