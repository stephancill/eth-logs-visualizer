import { LOGS_PAGE_SIZE } from "@/constants";
import { usePaginatedScroll } from "@/hooks/usePaginatedScroll";
import type { SwapRowWithUsd } from "@/types";
import { etherscanAddressUrl, etherscanTxUrl } from "@/utils/hex";
import { formatRelativeTime } from "@/utils/format";

type SwapListProps = {
  swapRowsWithUsd: SwapRowWithUsd[];
  blockTimeByNumber: Map<string, number>;
};

export function SwapList({ swapRowsWithUsd, blockTimeByNumber }: SwapListProps) {
  const swapPagination = usePaginatedScroll(swapRowsWithUsd, LOGS_PAGE_SIZE);

  return (
    <article className="min-h-0 border-b pt-2 pb-0 flex flex-col">
      <h2 className="px-2">Swaps</h2>
      <ul
        className="min-h-0 overflow-auto m-0 list-none p-0"
        onScroll={swapPagination.onScroll}
      >
        {swapRowsWithUsd.length === 0 ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">
            No swaps captured yet...
          </li>
        ) : (
          swapPagination.visibleItems.map(({ log, inItems, outItems, usdValueLabel }) => (
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
              <p>
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
                    ))}{" "}
                →{" "}
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
                {usdValueLabel ? <span> ({usdValueLabel})</span> : null}
              </p>
            </li>
          ))
        )}
        {swapPagination.hasMore ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">Scroll to load more...</li>
        ) : null}
      </ul>
    </article>
  );
}
