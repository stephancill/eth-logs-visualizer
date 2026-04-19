import { zeroAddress } from "viem";
import type { Hex } from "viem";

import type { NftRow, TxDirectCallInfo } from "@/types";
import type { usePaginatedScroll } from "@/hooks/usePaginatedScroll";
import { etherscanAddressUrl, etherscanTxUrl, lowerHex, shortenHex } from "@/utils/hex";
import { formatRelativeTime } from "@/utils/format";

type NftTransferListProps = {
  rows: NftRow[];
  pagination: ReturnType<typeof usePaginatedScroll<NftRow>>;
  transferTxInfoByHash: Map<Hex, TxDirectCallInfo>;
  blockTimeByNumber: Map<string, number>;
};

export function NftTransferList({
  rows,
  pagination,
  transferTxInfoByHash,
  blockTimeByNumber,
}: NftTransferListProps) {
  return (
    <article className="min-h-0 border-b pt-2 pb-0 flex flex-col">
      <h2 className="px-2">NFT Transfers</h2>
      <ul
        className="min-h-0 overflow-auto m-0 list-none p-0"
        onScroll={pagination.onScroll}
      >
        {rows.length === 0 ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">
            No NFT transfers captured yet...
          </li>
        ) : (
          pagination.visibleItems.map(({ log, symbol, tokenId, metadata }) => {
            const txInfo = log.transactionHash
              ? transferTxInfoByHash.get(lowerHex(log.transactionHash))
              : null;
            const isDirect = Boolean(txInfo?.method && txInfo.to === lowerHex(log.address));

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
                      <span>#{tokenId ?? "n/a"}</span>
                    </p>
                    {metadata?.description ? (
                      <p className="break-words line-clamp-2">{metadata.description}</p>
                    ) : null}
                    {metadata?.name ? (
                      <p className="break-words">name: {metadata.name}</p>
                    ) : null}
                  </div>
                </div>
                {symbol === "?" ? (
                  <p>
                    contract:{" "}
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
