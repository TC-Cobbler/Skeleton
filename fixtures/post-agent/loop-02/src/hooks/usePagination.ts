import { useState } from "react";

/**
 * Client-side pagination over `items`, `pageSize` per page. Pages are
 * 1-based. There is always at least one page (an empty list is "Page 1 of 1").
 * Whenever `resetKey` changes (e.g. the filter or search), it goes back to
 * page 1. If the list shrinks below the current page, it clamps to the last page.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setRequestedPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  const hasPrevious = page > 1;
  const hasNext = page < pageCount;

  const goToPrevious = () => setRequestedPage(Math.max(1, page - 1));
  const goToNext = () => setRequestedPage(Math.min(pageCount, page + 1));

  return { page, pageCount, pageItems, hasPrevious, hasNext, goToPrevious, goToNext };
}
