import { decodeFunctionData } from "viem";
import type { Abi, Hex } from "viem";

import { DIRECT_TRANSFER_INPUT_ABI } from "@/constants";
import type { SwapDetails } from "@/types";
import { normalizeAddress } from "@/utils/hex";

export function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

export function toBigIntFromString(value: string | null): bigint | null {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function getNamedOrIndexedArg(args: unknown, key: string, index: number): unknown {
  const record = getRecord(args);
  if (record && key in record) return record[key];
  if (Array.isArray(args) && index < args.length) return args[index];
  return null;
}

export function getFirstPresentArg(args: unknown, keys: string[], fallbackIndex: number): unknown {
  const record = getRecord(args);
  if (record) {
    for (const key of keys) {
      if (key in record) return record[key];
    }
  }

  if (Array.isArray(args) && fallbackIndex < args.length) {
    return args[fallbackIndex];
  }

  return null;
}

export function extractErc20AmountRaw(args: unknown): string | null {
  const value = toBigInt(getFirstPresentArg(args, ["value", "wad", "amount"], 2));
  return value ? value.toString() : null;
}

export function extractNftTokenIdRaw(eventName: string | null, args: unknown): string | null {
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

export function extractSwapDetails(eventName: string | null, args: unknown): SwapDetails | null {
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

export function extractTransferFromAddress(eventName: string | null, args: unknown): Hex | null {
  if (eventName === "Transfer") {
    return normalizeAddress(getFirstPresentArg(args, ["from", "src"], 0));
  }

  if (eventName === "TransferSingle" || eventName === "TransferBatch") {
    return normalizeAddress(getFirstPresentArg(args, ["from"], 1));
  }

  return null;
}

export function eventAbiFromUnknown(abiLike: unknown): Abi {
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

export function decodeDirectTransferMethod(input: Hex): "transfer" | "transferFrom" | null {
  try {
    const decoded = decodeFunctionData({
      abi: DIRECT_TRANSFER_INPUT_ABI,
      data: input,
    });

    if (decoded.functionName === "transfer" || decoded.functionName === "transferFrom") {
      return decoded.functionName;
    }

    return null;
  } catch {
    return null;
  }
}
