import { zeroAddress } from "viem";
import type { Hex } from "viem";

import type { Erc20RowWithUsd, TxDirectCallInfo } from "@/types";
import type { usePaginatedScroll } from "@/hooks/usePaginatedScroll";
import { etherscanAddressUrl, etherscanTxUrl, lowerHex, shortenHex } from "@/utils/hex";
import { formatRelativeTime } from "@/utils/format";

type Erc20TransferListProps = {
  rows: Erc20RowWithUsd[];
  pagination: ReturnType<typeof usePaginatedScroll<Erc20RowWithUsd>>;
  transferTxInfoByHash: Map<Hex, TxDirectCallInfo>;
  blockTimeByNumber: Map<string, number>;
};

export function Erc20TransferList({
  rows,
  pagination,
  transferTxInfoByHash,
  blockTimeByNumber,
}: Erc20TransferListProps) {
  return (
    <article className="min-h-0 border-b pt-2 pb-0 flex flex-col">
      <h2 className="px-2">ERC20 Transfers</h2>
      <ul
        className="min-h-0 overflow-auto m-0 list-none p-0"
        onScroll={pagination.onScroll}
      >
        {rows.length === 0 ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">
            No ERC20 transfers captured yet...
          </li>
        ) : (
          pagination.visibleItems.map(({ log, symbol, amountLabel, usdValueLabel }) => {
            const txInfo = log.transactionHash
              ? transferTxInfoByHash.get(lowerHex(log.transactionHash))
              : null;
            const isDirect = Boolean(txInfo?.method && txInfo.to === lowerHex(log.address));
            const hasUsdAmount = Boolean(usdValueLabel);

            return (
              <li
                key={log.id}
                className="relative border -mt-px first:mt-0 last:-mb-px p-2 pr-20"
              >
                <p className="absolute right-2 top-2 text-gray-500">
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
                <p className="break-words">
                  {log.transferFrom === zeroAddress ? <span>+ </span> : isDirect ? <span>→ </span> : null}
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
                  {hasUsdAmount ? (
                    <span className="group/amount inline">
                      <span className="group-hover/amount:hidden">{usdValueLabel}</span>
                      <span className="hidden group-hover/amount:inline">{amountLabel}</span>
                    </span>
                  ) : (
                    <span>{amountLabel}</span>
                  )}
                </p>
                {symbol === "?" ? (
                  <p>
                    token:{" "}
                    <a
                      href={etherscanAddressUrl(log.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortenHex(log.address)}
                    </a>
                  </p>
                ) : null}
              </li>
            );
          })
        )}
        {pagination.hasMore ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">Scroll to load more...</li>
        ) : null}
      </ul>
    </article>
  );
}
