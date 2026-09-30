import { useMemo, useState } from "react";

/**
 * Client-side pagination over `items`. `page` is 1-based and always clamped to
 * `1..pageCount`; an empty list still has one (empty) page. Whenever `resetKey`
 * changes (e.g. the active filter), the page goes back to 1.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  if (!Object.is(resetKey, lastResetKey)) {
    setLastResetKey(resetKey);
    setRequestedPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    pageCount,
    pageItems,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
    previous: () => setRequestedPage(Math.max(1, page - 1)),
    next: () => setRequestedPage(Math.min(pageCount, page + 1)),
  };
}
