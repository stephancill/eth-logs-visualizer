import { useMemo } from "react";
import { formatUnits } from "viem";
import type { Hex } from "viem";

import type {
  DecodedLogItem,
  Erc20ContractMetadata,
  Erc20RowWithUsd,
  SwapPairTokens,
  SwapRowWithUsd,
  SwapTokenItem,
} from "@/types";
import { toBigIntFromString } from "@/utils/decode";
import { average, formatAmountForDisplay, formatTokenAmount } from "@/utils/format";
import { lowerHex, shortenHex } from "@/utils/hex";
import { getKnownTokenDecimals, getKnownTokenSymbol } from "@/utils/log";

type Params = {
  swapLogs: DecodedLogItem[];
  erc20Transfers: DecodedLogItem[];
  swapPairTokensByAddress: Map<Hex, SwapPairTokens>;
  erc20MetadataByAddress: Map<Hex, Erc20ContractMetadata>;
};

export function useSwapRows({
  swapLogs,
  erc20Transfers,
  swapPairTokensByAddress,
  erc20MetadataByAddress,
}: Params) {
  const erc20Rows = useMemo(
    () =>
      erc20Transfers.map((log) => {
        const metadata = erc20MetadataByAddress.get(lowerHex(log.address));
        const amount = toBigIntFromString(log.erc20AmountRaw);
        const decimals = metadata?.decimals ?? 18;

        return {
          log,
          symbol: metadata?.symbol ?? "?",
          amountLabel: amount === null ? "n/a" : formatTokenAmount(amount, decimals),
        };
      }),
    [erc20MetadataByAddress, erc20Transfers],
  );

  const swapRows = useMemo(
    () =>
      swapLogs.map((log) => {
        const pairTokens = swapPairTokensByAddress.get(lowerHex(log.address)) ?? null;
        const details = log.swapDetails;

        const buildTokenAmount = (tokenAddress: Hex | null, amountRaw: string): SwapTokenItem => {
          const amount = toBigIntFromString(amountRaw) ?? 0n;
          const metadata = tokenAddress ? erc20MetadataByAddress.get(tokenAddress) : undefined;

          if (tokenAddress) {
            const knownSymbol = getKnownTokenSymbol(tokenAddress);
            const knownDecimals = getKnownTokenDecimals(tokenAddress);

            return {
              tokenAddress,
              symbol: knownSymbol ?? metadata?.symbol ?? shortenHex(tokenAddress),
              amountLabel: formatTokenAmount(amount, knownDecimals ?? metadata?.decimals ?? 18),
              amountRaw,
            };
          }

          return {
            tokenAddress: null,
            symbol: "?",
            amountLabel: formatTokenAmount(amount, 18),
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

  const swapRates = useMemo(() => {
    const wethAddress = lowerHex("0xc02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2" as Hex);
    const usdcAddress = lowerHex("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex);
    const usdtAddress = lowerHex("0xdAC17F958D2ee523a2206206994597C13D831ec7" as Hex);

    const usdcRates: number[] = [];
    const usdtRates: number[] = [];

    for (const row of swapRows) {
      const combined = [...row.inItems, ...row.outItems];
      const wethItem = combined.find((item) => item.tokenAddress === wethAddress);
      if (!wethItem) continue;

      const wethAmountRaw = toBigIntFromString(wethItem.amountRaw) ?? 0n;
      if (wethAmountRaw <= 0n) continue;
      const wethAmount = Number(formatUnits(wethAmountRaw, 18));
      if (!Number.isFinite(wethAmount) || wethAmount <= 0) continue;

      const usdcItem = combined.find((item) => item.tokenAddress === usdcAddress);
      if (usdcItem && usdcRates.length < 10) {
        const stableRaw = toBigIntFromString(usdcItem.amountRaw) ?? 0n;
        const stableAmount = Number(formatUnits(stableRaw, 6));
        if (Number.isFinite(stableAmount) && stableAmount > 0) {
          usdcRates.push(stableAmount / wethAmount);
        }
      }

      const usdtItem = combined.find((item) => item.tokenAddress === usdtAddress);
      if (usdtItem && usdtRates.length < 10) {
        const stableRaw = toBigIntFromString(usdtItem.amountRaw) ?? 0n;
        const stableAmount = Number(formatUnits(stableRaw, 6));
        if (Number.isFinite(stableAmount) && stableAmount > 0) {
          usdtRates.push(stableAmount / wethAmount);
        }
      }

      if (usdcRates.length >= 10 && usdtRates.length >= 10) break;
    }

    const wethUsdcRate = average(usdcRates);
    const wethUsdtRate = average(usdtRates);
    const availableRates = [wethUsdcRate, wethUsdtRate].filter(
      (value): value is number => value !== null,
    );
    const ethUsdRate = availableRates.length > 0 ? average(availableRates) : null;

    return { wethUsdcRate, wethUsdtRate, ethUsdRate };
  }, [swapRows]);

  const tokenUsdRateByAddress = useMemo(() => {
    const wethAddress = lowerHex("0xc02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2" as Hex);
    const usdcAddress = lowerHex("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Hex);
    const usdtAddress = lowerHex("0xdAC17F958D2ee523a2206206994597C13D831ec7" as Hex);

    const rates = new Map<Hex, number>();
    rates.set(usdcAddress, 1);
    rates.set(usdtAddress, 1);
    if (swapRates.ethUsdRate !== null) {
      rates.set(wethAddress, swapRates.ethUsdRate);
    }

    const samples = new Map<Hex, number[]>();

    const addSample = (address: Hex, value: number) => {
      if (!Number.isFinite(value) || value <= 0) return;
      const current = samples.get(address) ?? [];
      if (current.length >= 10) return;
      samples.set(address, [...current, value]);
    };

    const getAmount = (tokenAddress: Hex, amountRaw: string): number | null => {
      const amount = toBigIntFromString(amountRaw) ?? 0n;
      if (amount <= 0n) return null;
      const decimals =
        getKnownTokenDecimals(tokenAddress) ??
        erc20MetadataByAddress.get(tokenAddress)?.decimals ??
        18;
      const value = Number(formatUnits(amount, decimals));
      if (!Number.isFinite(value) || value <= 0) return null;
      return value;
    };

    for (const row of swapRows) {
      const inPrimary = row.inItems[0];
      const outPrimary = row.outItems[0];
      if (!inPrimary?.tokenAddress || !outPrimary?.tokenAddress) continue;

      const inToken = lowerHex(inPrimary.tokenAddress);
      const outToken = lowerHex(outPrimary.tokenAddress);
      const inAmount = getAmount(inToken, inPrimary.amountRaw);
      const outAmount = getAmount(outToken, outPrimary.amountRaw);
      if (inAmount === null || outAmount === null) continue;

      const inRate = rates.get(inToken);
      const outRate = rates.get(outToken);

      if (inRate !== undefined && outRate === undefined) {
        addSample(outToken, (inRate * inAmount) / outAmount);
      } else if (outRate !== undefined && inRate === undefined) {
        addSample(inToken, (outRate * outAmount) / inAmount);
      }
    }

    for (const [address, values] of samples.entries()) {
      const avg = average(values);
      if (avg !== null) rates.set(address, avg);
    }

    return rates;
  }, [erc20MetadataByAddress, swapRates.ethUsdRate, swapRows]);

  const swapRowsWithUsd = useMemo((): SwapRowWithUsd[] => {
    const getUsdFromToken = (tokenAddress: Hex, amountRaw: string, rates: Map<Hex, number>) => {
      const rate = rates.get(lowerHex(tokenAddress));
      if (rate === undefined) return null;

      const amount = toBigIntFromString(amountRaw) ?? 0n;
      if (amount <= 0n) return null;

      const decimals =
        getKnownTokenDecimals(tokenAddress) ??
        erc20MetadataByAddress.get(lowerHex(tokenAddress))?.decimals ??
        18;

      const tokenAmount = Number(formatUnits(amount, decimals));
      if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;

      const usdValue = tokenAmount * rate;
      if (!Number.isFinite(usdValue)) return null;

      return usdValue;
    };

    return swapRows.map((row) => {
      const combined = [...row.inItems, ...row.outItems];

      for (const item of combined) {
        if (!item.tokenAddress) continue;
        const usdValue = getUsdFromToken(item.tokenAddress, item.amountRaw, tokenUsdRateByAddress);
        if (usdValue === null) continue;

        return {
          ...row,
          usdValueLabel: `$${formatAmountForDisplay(String(usdValue))}`,
        };
      }

      return { ...row, usdValueLabel: null };
    });
  }, [erc20MetadataByAddress, swapRows, tokenUsdRateByAddress]);

  const erc20RowsWithUsd = useMemo((): Erc20RowWithUsd[] =>
    erc20Rows.map((row) => {
      const tokenAddress = lowerHex(row.log.address);
      const rate = tokenUsdRateByAddress.get(tokenAddress);
      if (rate === undefined) return { ...row, usdValueLabel: null };

      const amountRaw = row.log.erc20AmountRaw;
      if (!amountRaw) return { ...row, usdValueLabel: null };

      const amount = toBigIntFromString(amountRaw) ?? 0n;
      if (amount <= 0n) return { ...row, usdValueLabel: null };

      const decimals =
        getKnownTokenDecimals(tokenAddress) ??
        erc20MetadataByAddress.get(tokenAddress)?.decimals ??
        18;

      const tokenAmount = Number(formatUnits(amount, decimals));
      if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return { ...row, usdValueLabel: null };

      const usdValue = tokenAmount * rate;
      if (!Number.isFinite(usdValue)) return { ...row, usdValueLabel: null };

      return { ...row, usdValueLabel: `$${formatAmountForDisplay(String(usdValue))}` };
    }),
  [erc20MetadataByAddress, erc20Rows, tokenUsdRateByAddress]);

  return { swapRowsWithUsd, erc20RowsWithUsd, tokenUsdRateByAddress };
}
