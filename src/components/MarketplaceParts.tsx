import type { MouseEvent } from 'react'
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
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

/** Page links for the marketplace grid. Renders nothing for a single page. */
export function MarketPagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount < 2) return null
  const jump = (next: number) => (event: MouseEvent) => { event.preventDefault(); onPage(next) }
  const atEdge = (inactive: boolean) => inactive ? 'pagination-disabled' : ''

  return <Pagination className="market-pagination"><PaginationContent>
    <PaginationItem><PaginationPrevious href="#" className={atEdge(page === 1)} onClick={jump(page - 1)} /></PaginationItem>
    {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <PaginationItem key={number}>
      <PaginationLink href="#" isActive={number === page} onClick={jump(number)}>{number}</PaginationLink>
    </PaginationItem>)}
    <PaginationItem><PaginationNext href="#" className={atEdge(page === pageCount)} onClick={jump(page + 1)} /></PaginationItem>
  </PaginationContent></Pagination>
}
