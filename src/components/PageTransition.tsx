import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  // The dashboard shell holds a viewport-fixed sidebar on mobile, and a
  // transformed ancestor would re-anchor that drawer to the page, so the shell
  // fades in rather than sliding.
  const isShell = location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/')
  return (
    <div key={location.pathname} className={`page-transition${isShell ? ' page-transition-shell' : ''}`}>
      {children}
    </div>
  )
}
