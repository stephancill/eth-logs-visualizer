import { memo } from "react";

type StatusIndicatorParams = {
  mode: "connecting" | "processing" | "listening" | "error";
  error: string | null;
  chainName: string;
  blocksInMemory: number;
  latestBlockNumber: string | null;
  blocksProcessedCount: number;
  abiCached: number;
  abiTotal: number;
};

export const StatusIndicator = memo(
  ({
    mode,
    error,
    chainName,
    blocksInMemory,
    latestBlockNumber,
    blocksProcessedCount,
    abiCached,
    abiTotal,
  }: StatusIndicatorParams) => {
    const indicatorToneClass = mode === "error" ? "text-red-700" : "text-green-700";
    const indicatorDotClass = mode === "error" ? "bg-red-600" : "bg-green-600";

    const indicatorLabel =
      mode === "error"
        ? "Error"
        : mode === "processing"
          ? "Processing block..."
          : mode === "connecting"
            ? "Connecting..."
            : `${blocksInMemory} blocks on ${chainName}`;

    return (
      <div className="group fixed bottom-4 right-4 z-50">
        <div className={`border bg-white p-2 ${indicatorToneClass}`}>
          <p className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${indicatorDotClass}`} />
            {indicatorLabel}
          </p>
          <div className="hidden h-28 w-72 overflow-auto text-xs group-hover:block">
            <p>Chain: {chainName}</p>
            <p>Latest Block: {latestBlockNumber ?? "n/a"}</p>
            <p>Blocks Processed: {blocksProcessedCount}</p>
            <p>
              ABI Cache: {abiCached}/{abiTotal}
            </p>
            {error ? <p>Error: {error}</p> : null}
          </div>
        </div>
      </div>
    );
  },
);
