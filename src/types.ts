import type { Hex } from "viem";

export type BlockItem = {
  number: string;
  hash: Hex | null;
  logCount: number;
  timestamp: number;
};

export type LogItem = {
  id: string;
  blockNumber: string;
  transactionHash: Hex | null;
  logIndex: number | null;
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
};

export type SwapDetails = {
  sender: Hex | null;
  to: Hex | null;
  amount0InRaw: string;
  amount1InRaw: string;
  amount0OutRaw: string;
  amount1OutRaw: string;
};

export type DecodedLogItem = LogItem & {
  decodeStatus: string;
  eventName: string | null;
  decodedArgLines: string[] | null;
  erc20AmountRaw: string | null;
  nftTokenIdRaw: string | null;
  swapDetails: SwapDetails | null;
  transferFrom: Hex | null;
};

export type Erc20ContractMetadata = {
  symbol: string;
  decimals: number;
};

export type NftContractMetadata = {
  symbol: string;
};

export type NftTokenCandidate = {
  address: Hex;
  tokenId: string;
};

export type NftTokenUriMetadata = {
  url: string;
  resolvedUrl: string;
};

export type NftRenderableMetadata = {
  name: string | null;
  imageUrl: string | null;
  description: string | null;
};

export type BlockTimeInfo = {
  blockNumber: string;
  timestampMs: number;
};

export type TxDirectCallInfo = {
  to: Hex | null;
  method: "transfer" | "transferFrom" | null;
};

export type SwapPairTokens = {
  token0: Hex;
  token1: Hex;
};

export type SwapTokenItem = {
  tokenAddress: Hex | null;
  symbol: string;
  amountLabel: string;
  amountRaw: string;
};

export type SwapRowBase = {
  log: DecodedLogItem;
  sender: Hex | null;
  to: Hex | null;
  inItems: SwapTokenItem[];
  outItems: SwapTokenItem[];
};

export type SwapRowWithUsd = SwapRowBase & {
  usdValueLabel: string | null;
};

export type Erc20RowBase = {
  log: DecodedLogItem;
  symbol: string;
  amountLabel: string;
};

export type Erc20RowWithUsd = Erc20RowBase & {
  usdValueLabel: string | null;
};

export type NftRow = {
  log: DecodedLogItem;
  symbol: string;
  tokenId: string | null;
  metadata: NftRenderableMetadata | null;
};
