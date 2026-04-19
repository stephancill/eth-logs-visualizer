import { useCallback, useEffect, useMemo, useState } from "react";
import type { UIEvent } from "react";

export function usePaginatedScroll<T>(items: T[], pageSize: number) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount((current) => {
      if (items.length === 0) return pageSize;
      return Math.min(items.length, Math.max(pageSize, current));
    });
  }, [items.length, pageSize]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      const target = event.currentTarget;
      if (target.scrollTop + target.clientHeight < target.scrollHeight - 120) return;

      setVisibleCount((current) => {
        if (current >= items.length) return current;
        return Math.min(items.length, current + pageSize);
      });
    },
    [items.length, pageSize],
  );

  const visibleItems = useMemo(
    () => items.slice(0, Math.min(items.length, visibleCount)),
    [items, visibleCount],
  );

  return {
    visibleItems,
    onScroll,
    hasMore: visibleCount < items.length,
  };
}
