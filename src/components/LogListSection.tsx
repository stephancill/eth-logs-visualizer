import { LOGS_PAGE_SIZE } from "@/constants";
import { usePaginatedScroll } from "@/hooks/usePaginatedScroll";
import type { DecodedLogItem } from "@/types";
import { etherscanAddressUrl, etherscanTxUrl, shortenHex } from "@/utils/hex";
import { formatRelativeTime } from "@/utils/format";

type LogListSectionParams = {
  title: string;
  logs: DecodedLogItem[];
  emptyText: string;
  blockTimeByNumber: Map<string, number>;
};

export function LogListSection({ title, logs, emptyText, blockTimeByNumber }: LogListSectionParams) {
  const otherLogsPagination = usePaginatedScroll(logs, LOGS_PAGE_SIZE);

  return (
    <article className="h-full min-h-0 min-w-0 overflow-hidden border-b pt-2 pb-0 flex flex-col">
      <h2 className="px-2">{title}</h2>
      <ul
        className="min-h-0 min-w-0 flex-1 overflow-auto m-0 list-none p-0"
        onScroll={otherLogsPagination.onScroll}
      >
        {logs.length === 0 ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">{emptyText}</li>
        ) : (
          otherLogsPagination.visibleItems.map((log) => (
            <li key={log.id} className="min-w-0 border -mt-px first:mt-0 last:-mb-px p-2">
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
        {otherLogsPagination.hasMore ? (
          <li className="border -mt-px first:mt-0 last:-mb-px p-2">Scroll to load more...</li>
        ) : null}
      </ul>
    </article>
  );
}
