type EventCountPanelProps = {
  eventCountRows: { eventName: string; count: number }[];
};

export function EventCountPanel({ eventCountRows }: EventCountPanelProps) {
  return (
    <article className="border-b pt-2 pb-0">
      <h2 className="px-2">Events</h2>
      <ol className="-ml-px -mb-px m-0 flex max-h-32 flex-wrap gap-0 overflow-auto p-0 list-none">
        {eventCountRows.length === 0 ? (
          <li className="border p-2">None yet...</li>
        ) : (
          eventCountRows.map((item) => (
            <li key={item.eventName} className="-mr-px -mb-px border px-2 py-1">
              {item.eventName}: {item.count}
            </li>
          ))
        )}
      </ol>
    </article>
  );
}
