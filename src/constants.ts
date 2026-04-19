import type { Hex } from "viem";
import { z } from "zod";

export const MAX_BLOCKS = 20;
export const MAX_DECODE_ADDRESSES = 1_000;
export const MAX_ERC20_METADATA_QUERIES = 80;
export const MAX_NFT_CONTRACT_QUERIES = 80;
export const MAX_NFT_TOKEN_QUERIES = 100;
export const MAX_SWAP_PAIR_QUERIES = 80;
export const LOGS_PAGE_SIZE = 15;

export const WETH_ADDRESS = "0xc02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2" as Hex;
export const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex;
export const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Hex;

// keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721.
// Other standards (e.g. ERC-6909) use a different signature and must be excluded.
export const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

export const ERC20_METADATA_ABI = [
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

export const ERC721_METADATA_ABI = [
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

export const ERC1155_METADATA_ABI = [
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

export const UNISWAP_V2_PAIR_ABI = [
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

export const DIRECT_TRANSFER_INPUT_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const envSchema = z.object({
  VITE_ETHERSCAN_API_KEY: z.string().min(1).optional(),
});

export const env = envSchema.parse(import.meta.env);
