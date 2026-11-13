import type { MouseEvent } from 'react'
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from './lightswind/pagination'
import { Skeleton } from './lightswind/skeleton'

/** Placeholder cards shaped like a real listing, so first paint does not jump. */
export function ListingSkeletonGrid({ count = 6 }: { count?: number }) {
  return <div className="cattle-grid marketplace-grid" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div className="cattle-card skeleton-card" key={index}>
      <Skeleton className="skeleton-image" />
      <div className="card-content">
        <Skeleton className="skeleton-line skeleton-line-lg" />
        <Skeleton className="skeleton-line skeleton-line-sm" />
        <div className="card-footer"><Skeleton className="skeleton-line skeleton-line-sm" /><Skeleton className="skeleton-line skeleton-line-md" /></div>
      </div>
    </div>)}
  </div>
}

// A phone has room for about five page links next to the arrows, so a catalogue
// with twenty pages shows the ends and the pages around the current one instead
// of a row that runs off the side of the screen.
function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const first = Math.max(2, page - 1)
  const last = Math.min(pageCount - 1, page + 1)
  return [
    1,
    ...(first > 2 ? ['gap' as const] : []),
    ...Array.from({ length: last - first + 1 }, (_, index) => first + index),
    ...(last < pageCount - 1 ? ['gap' as const] : []),
    pageCount,
  ]
}

/** Page links for the marketplace grid. Renders nothing for a single page. */
export function MarketPagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount < 2) return null
  const jump = (next: number) => (event: MouseEvent) => { event.preventDefault(); onPage(next) }
  const atEdge = (inactive: boolean) => inactive ? 'pagination-disabled' : ''

  return <Pagination className="market-pagination"><PaginationContent>
    <PaginationItem><PaginationPrevious href="#" className={atEdge(page === 1)} onClick={jump(page - 1)} /></PaginationItem>
    {/* On a phone the numbers would either wrap or run out of the column, so the
        row falls back to the arrows and this status line. */}
    <PaginationItem className="market-pagination-status">{page} of {pageCount}</PaginationItem>
    {pageItems(page, pageCount).map((item, index) => <PaginationItem
      key={item === 'gap' ? `gap-${index}` : item}
      className={item === 'gap' ? 'market-pagination-gap' : 'market-pagination-number'}
    >
      {item === 'gap'
        ? <PaginationEllipsis />
        : <PaginationLink href="#" isActive={item === page} aria-label={`Page ${item}`} onClick={jump(item)}>{item}</PaginationLink>}
    </PaginationItem>)}
    <PaginationItem><PaginationNext href="#" className={atEdge(page === pageCount)} onClick={jump(page + 1)} /></PaginationItem>
  </PaginationContent></Pagination>
}
