import { LOGS_PAGE_SIZE } from "@/constants";
import { useBlockStream } from "@/hooks/useBlockStream";
import { useBlockTimes } from "@/hooks/useBlockTimes";
import { useErc20Metadata } from "@/hooks/useErc20Metadata";
import { useEventAbis } from "@/hooks/useEventAbis";
import { useLogClassification } from "@/hooks/useLogClassification";
import { useNftData } from "@/hooks/useNftData";
import { usePaginatedScroll } from "@/hooks/usePaginatedScroll";
import { useSwapRows } from "@/hooks/useSwapRows";
import { useTransferBlockInfo } from "@/hooks/useTransferBlockInfo";
import { EventCountPanel } from "@/components/EventCountPanel";
import { Erc20TransferList } from "@/components/Erc20TransferList";
import { LogListSection } from "@/components/LogListSection";
import { NftTransferList } from "@/components/NftTransferList";
import { StatusIndicator } from "@/components/StatusIndicator";
import { SwapList } from "@/components/SwapList";

function App() {
  const { publicClient, blocks, logs, blocksProcessedCount, indicatorMode, error } =
    useBlockStream();

  const { eventAbiByAddress, abiCached, abiTotal } = useEventAbis({ publicClient, logs });

  const {
    sortedDecodedLogs,
    erc20Transfers,
    nftTransfers,
    otherLogs,
    swapLogs,
    swapPairTokensByAddress,
    swapTokenAddresses,
    eventCountRows,
  } = useLogClassification({ publicClient, logs, eventAbiByAddress });

  const { erc20MetadataByAddress } = useErc20Metadata({
    publicClient,
    erc20Transfers,
    swapTokenAddresses,
  });

  const { swapRowsWithUsd, erc20RowsWithUsd } = useSwapRows({
    swapLogs,
    erc20Transfers,
    swapPairTokensByAddress,
    erc20MetadataByAddress,
  });

  const { nftRows } = useNftData({ publicClient, nftTransfers });

  const { blockTimeByNumber } = useBlockTimes({ publicClient, sortedDecodedLogs, blocks });

  const erc20Pagination = usePaginatedScroll(erc20RowsWithUsd, LOGS_PAGE_SIZE);
  const nftPagination = usePaginatedScroll(nftRows, LOGS_PAGE_SIZE);

  const { transferTxInfoByHash } = useTransferBlockInfo({
    publicClient,
    visibleErc20Items: erc20Pagination.visibleItems,
    visibleNftItems: nftPagination.visibleItems,
  });

  return (
    <main className="h-screen overflow-hidden">
      <div className="grid box-border h-full gap-0 p-3 lg:grid-cols-2">
        <section className="grid min-h-0 min-w-0 gap-0 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <EventCountPanel eventCountRows={eventCountRows} />
          <SwapList swapRowsWithUsd={swapRowsWithUsd} blockTimeByNumber={blockTimeByNumber} />
          <div className="-mt-px min-h-0 overflow-hidden">
            <LogListSection
              title="Other Logs"
              logs={otherLogs}
              emptyText="No other logs captured yet..."
              blockTimeByNumber={blockTimeByNumber}
            />
          </div>
        </section>

        <section className="grid min-h-0 min-w-0 gap-0 lg:-ml-px lg:grid-rows-2">
          <Erc20TransferList
            rows={erc20RowsWithUsd}
            pagination={erc20Pagination}
            transferTxInfoByHash={transferTxInfoByHash}
            blockTimeByNumber={blockTimeByNumber}
          />
          <NftTransferList
            rows={nftRows}
            pagination={nftPagination}
            transferTxInfoByHash={transferTxInfoByHash}
            blockTimeByNumber={blockTimeByNumber}
          />
        </section>
      </div>

      <StatusIndicator
        mode={indicatorMode}
        error={error}
        chainName={publicClient?.chain?.name ?? "unknown chain"}
        blocksInMemory={blocks.length}
        latestBlockNumber={blocks[0]?.number ?? null}
        blocksProcessedCount={blocksProcessedCount}
        abiCached={abiCached}
        abiTotal={abiTotal}
      />
    </main>
  );
}

export default App;
