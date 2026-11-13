import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowUpRight, BadgeCheck, ChevronDown, ChevronLeft, CircleUserRound,
  Heart, Leaf, Menu, MessageCircle, Search, ShieldCheck, SlidersHorizontal, X
} from 'lucide-react'
import './App.css'
import { cattle, districts, formatLkr, photoCredits, type Cattle } from './data'
import { getAccount, saveAccount, sendPasswordReset, syncSupabaseAccount, updatePassword, useAccount } from './auth'
import { Dashboard } from './Dashboard'
import { supabase } from './lib/supabase'
import { fetchApprovedCattle, fetchSellerContact, searchApprovedCattle } from './services/cattle'
import { toggleFavourite } from './services/marketplace'
import { PageTransition } from './components/PageTransition'
import { SearchableDropdown } from './components/FormControls'
import { Badge } from './components/lightswind/badge'
import { Card } from './components/lightswind/card'
import { Button } from './components/lightswind/button'
import { Alert, AlertDescription, AlertTitle } from './components/lightswind/alert'
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from './components/lightswind/pagination'
import { Skeleton } from './components/lightswind/skeleton'
import { Toaster } from './components/lightswind/toaster'
import { Tooltip } from './components/lightswind/tooltip'
import { toast } from './hooks/use-toast'

function Logo() {
  return <Link to="/" className="logo" aria-label="Pasu home"><span className="logo-mark"><Leaf size={17} strokeWidth={2.5} /></span><span>Pasu</span></Link>
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const account = useAccount()
  return <header className="nav-wrap">
    <nav className="nav container">
      <Logo />
      <div className={`nav-links ${open ? 'is-open' : ''}`}>
        <Link className={location.pathname === '/' ? 'active' : ''} to="/">Home</Link>
        <Link className={location.pathname.startsWith('/marketplace') ? 'active' : ''} to="/marketplace">Browse cattle</Link>
        <Link to="/how-it-works">How it works</Link>
        <Link to="/about">About</Link>
        <div className="nav-mobile-actions"><Link to="/login" className="button button-light">Log in</Link><Link to="/register" className="button button-dark">Register</Link></div>
      </div>
      <div className="nav-actions">{account ? <Link to={account.role === 'admin' ? '/admin' : '/dashboard'} className="nav-login">My workspace</Link> : <Link to="/login" className="nav-login">Log in</Link>}<Link to={account ? (account.role === 'admin' ? '/admin' : '/dashboard') : '/register'} className="button button-dark">{account ? 'Open dashboard' : 'Register'}</Link></div>
      <button className="icon-button mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X size={21} /> : <Menu size={21} />}</button>
    </nav>
  </header>
}

function Footer() {
  return <footer className="footer"><div className="container footer-grid">
    <div><Logo /><p className="footer-copy">A clearer way to find the right cattle<br />for your dairy business.</p><span className="footer-note">Made for Sri Lankan farmers</span></div>
    <div><p className="footer-heading">Explore</p><Link to="/marketplace">Browse cattle</Link><Link to="/how-it-works">How it works</Link><Link to="/about">About Pasu</Link></div>
    <div><p className="footer-heading">For your peace of mind</p><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms & conditions</Link><Link to="/credits">Photo credits</Link><a href="mailto:hello@pasu.lk">Contact us</a></div>
    <div className="footer-contact"><p className="footer-heading">Have a question?</p><p>We’re here on weekdays,<br />8.30am–5.30pm.</p><a href="mailto:hello@pasu.lk">hello@pasu.lk <ArrowUpRight size={14} /></a></div>
  </div><div className="container footer-bottom"><span>© 2025 Pasu Marketplace</span><span>Colombo · Sri Lanka</span></div></footer>
}

function TrustStrip() {
  return <div className="trust-strip"><div className="container trust-items"><div><ShieldCheck size={20} /><span><b>Verified listings</b><small>Every detail checked</small></span></div><div><MessageCircle size={20} /><span><b>Talk directly</b><small>No middlemen, no runaround</small></span></div><div><Leaf size={20} /><span><b>Built for dairy</b><small>Information that matters</small></span></div></div></div>
}

function CattleCard({ cow }: { cow: Cattle }) {
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const toggleSaved = async () => {
    setSaveError('')
    const previous = saved
    setSaved(!previous)
    try {
      await toggleFavourite(cow.id, previous)
      toast({ title: previous ? 'Removed from saved' : 'Saved to your list', description: cow.title, variant: 'success', duration: 3000 })
    } catch (error) {
      setSaved(previous)
      const message = error instanceof Error ? error.message : 'Unable to save this listing.'
      setSaveError(message)
      toast({ title: 'Could not update saved cattle', description: message, variant: 'destructive' })
    }
  }
  return <Card className="cattle-card" hoverable={false} bordered={false}>
    <Link to={`/cattle/${cow.id}`} className="card-image-wrap">{cow.image ? <img src={cow.image} alt={cow.title} /> : <span className="card-image-placeholder"><Leaf size={26} /><small>Photos coming soon</small></span>}{cow.sellerVerified && <Badge className="verified-badge" variant="unstyled" size="unstyled" shape="unstyled"><BadgeCheck size={14} /> Verified</Badge>}</Link>
    <Tooltip asChild content={saved ? 'Remove from saved' : 'Save this listing'} side="left"><button className={`save-button ${saved ? 'saved' : ''}`} onClick={toggleSaved} aria-label={saved ? 'Remove from saved' : 'Save listing'}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button></Tooltip>{saveError && <span className="card-save-error" role="alert">{saveError}</span>}
    <div className="card-content"><div className="card-location">{cow.district} · {cow.city}</div><Link to={`/cattle/${cow.id}`}><h3>{cow.title}</h3></Link><div className="card-specs"><span>{cow.breed}</span><span>{cow.gender}</span><span>{cow.age} yrs</span></div><div className="card-footer"><div><span className="milk-yield">{cow.dailyYield}L</span><small>daily milk</small></div><strong>{formatLkr(cow.price)}</strong></div></div>
  </Card>
}

function Home() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [featured, setFeatured] = useState<Cattle[]>([])
  const [featuredError, setFeaturedError] = useState('')
  useEffect(() => {
    fetchApprovedCattle().then(rows => setFeatured((rows ?? cattle).slice(0, 3))).catch(reason => setFeaturedError(reason instanceof Error ? reason.message : 'Featured cattle could not be loaded.'))
  }, [])
  return <><Navbar /><main>
    <section className="hero"><div className="container hero-grid"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" /> Sri Lanka’s cattle marketplace</p><h1>Find the right cattle.<br /><em>Grow your dairy.</em></h1><p className="hero-lede">Discover quality dairy cattle across Sri Lanka. Compare clearly, connect directly with farmers, and make your next good decision.</p><form className="hero-search" onSubmit={event => { event.preventDefault(); navigate(`/marketplace${search ? `?q=${encodeURIComponent(search)}` : ''}`) }}><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by breed, district or name" /><button aria-label="Search cattle"><ArrowUpRight size={17} /></button></form><div className="hero-actions"><Link className="button button-accent" to="/marketplace">Browse cattle <ArrowUpRight size={17} /></Link><Link className="text-link" to="/register">Sell your cattle <ArrowUpRight size={16} /></Link></div><div className="hero-proof"><div className="avatar-stack"><span>R</span><span>M</span><span>S</span></div><span><b>1,200+ farmers</b><small>already finding better matches</small></span></div></div><div className="hero-visual">{featured[0]?.image ? <img src={featured[0].image} alt={featured[0].title} /> : <div className="hero-image-empty"><Leaf size={42} /><span>{featuredError || 'Approved cattle will appear here as listings are published.'}</span></div>}<div className="hero-note"><span className="note-line" /><span><b>Selected with care</b><small>Verified listings from Pasu</small></span></div><div className="hero-stamp"><span>PA</span><small>SU</small></div></div></div></section>
    <TrustStrip />
    <section className="section"><div className="container"><div className="section-head"><div><p className="eyebrow">A good place to start</p><h2>Find your next<br /><em>best herd member.</em></h2></div><Link className="text-link" to="/marketplace">See all cattle <ArrowUpRight size={16} /></Link></div>{featured.length ? <div className="cattle-grid">{featured.map(cow => <CattleCard key={cow.id} cow={cow} />)}</div> : <div className="empty-state"><Search size={28} /><h3>No approved cattle yet</h3><p>New listings will appear here after administrator review.</p><Link className="button button-dark" to="/marketplace">Browse marketplace</Link></div>}</div></section>
    <section className="district-section"><div className="container district-grid"><div><p className="eyebrow">From farm to farm</p><h2>Good cattle,<br /><em>close to home.</em></h2><p className="body-copy">Pasu brings together farmers and buyers from every corner of the island, so you can find cattle that fit your land, your climate, and your plans.</p><Link className="text-link" to="/marketplace">Explore by district <ArrowUpRight size={16} /></Link></div><div className="district-list">{['Kurunegala', 'Kandy', 'Nuwara Eliya', 'Anuradhapura', 'Matale', 'Badulla'].map((district, i) => <Link to={`/marketplace?district=${district}`} key={district}><span>0{i + 1}</span><b>{district}</b><ArrowUpRight size={16} /></Link>)}</div></div></section>
    <section className="how-section"><div className="container"><div className="section-head"><div><p className="eyebrow">A better way to buy</p><h2>From looking<br /><em>to knowing.</em></h2></div><p className="body-copy">The details are here, the seller is one click away,<br />and the decision stays yours.</p></div><div className="steps"><div><span>01</span><h3>Discover</h3><p>Search verified cattle by the things that matter to your farm.</p></div><div><span>02</span><h3>Compare</h3><p>See health, yield, age and price side by side.</p></div><div><span>03</span><h3>Connect</h3><p>Speak directly with the farmer on WhatsApp.</p></div><div><span>04</span><h3>Decide</h3><p>Arrange an inspection and make it your own.</p></div></div></div></section>
  </main><Footer /></>
}

type MarketFilters = {
  query: string
  district: string
  breed: string
  gender: string
  minPrice: string
  maxPrice: string
  minYield: string
  maxAge: string
}

const emptyMarketFilters: MarketFilters = { query: '', district: '', breed: '', gender: '', minPrice: '', maxPrice: '', minYield: '', maxAge: '' }

function numberOrUndefined(value: string) {
  const parsed = Number(value)
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined
}

function matchesMarketFilters(cow: Cattle, filters: MarketFilters) {
  const query = filters.query.trim().toLowerCase()
  if (query && !`${cow.title} ${cow.breed} ${cow.city} ${cow.district}`.toLowerCase().includes(query)) return false
  if (filters.district && cow.district !== filters.district) return false
  if (filters.breed && cow.breed !== filters.breed) return false
  if (filters.gender && cow.gender !== filters.gender) return false
  if (filters.minPrice && cow.price < Number(filters.minPrice)) return false
  if (filters.maxPrice && cow.price > Number(filters.maxPrice)) return false
  if (filters.minYield && cow.dailyYield < Number(filters.minYield)) return false
  if (filters.maxAge && cow.age > Number(filters.maxAge)) return false
  return true
}

// Every applied filter becomes a chip the buyer can remove on its own, the way
// the reference explore page does it.
function marketFilterChips(filters: MarketFilters) {
  const chips: { key: keyof MarketFilters; label: string }[] = []
  if (filters.query.trim()) chips.push({ key: 'query', label: `Search: ${filters.query.trim()}` })
  if (filters.district) chips.push({ key: 'district', label: filters.district })
  if (filters.breed) chips.push({ key: 'breed', label: filters.breed })
  if (filters.gender) chips.push({ key: 'gender', label: filters.gender })
  if (filters.minPrice) chips.push({ key: 'minPrice', label: `From ${formatLkr(Number(filters.minPrice))}` })
  if (filters.maxPrice) chips.push({ key: 'maxPrice', label: `Up to ${formatLkr(Number(filters.maxPrice))}` })
  if (filters.minYield) chips.push({ key: 'minYield', label: `${filters.minYield}L+ milk a day` })
  if (filters.maxAge) chips.push({ key: 'maxAge', label: `Up to ${filters.maxAge} years` })
  return chips
}

function FilterBar({ filters, setFilter, breedOptions, panelOpen, setPanelOpen, onSearch, onClear }: {
  filters: MarketFilters
  setFilter: (key: keyof MarketFilters, value: string) => void
  breedOptions: string[]
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  onSearch: () => void
  onClear: () => void
}) {
  const chips = marketFilterChips(filters)
  return <Card className="market-filter-card" bordered>
    <form className="filter-bar" onSubmit={event => { event.preventDefault(); onSearch() }}>
      <div className="search-field"><Search size={19} /><input value={filters.query} onChange={event => setFilter('query', event.target.value)} placeholder="What are you looking for?" aria-label="Search cattle" /></div>
      <SearchableDropdown placeholder="District" value={filters.district} options={districts} onChange={value => setFilter('district', value === filters.district ? '' : value)} />
      <SearchableDropdown placeholder="Breed" value={filters.breed} options={breedOptions} onChange={value => setFilter('breed', value === filters.breed ? '' : value)} />
      <Button type="submit" variant="unstyled" size="unstyled" className="button button-dark filter-search">Search</Button>
      <Button type="button" variant="unstyled" size="unstyled" className="filter-button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}><SlidersHorizontal size={17} /> Filters{chips.length ? ` (${chips.length})` : ''}</Button>
    </form>
    {panelOpen && <div className="filter-panel">
      <label>Minimum price (LKR)<input type="number" min="0" inputMode="numeric" value={filters.minPrice} onChange={event => setFilter('minPrice', event.target.value)} placeholder="Any" /></label>
      <label>Maximum price (LKR)<input type="number" min="0" inputMode="numeric" value={filters.maxPrice} onChange={event => setFilter('maxPrice', event.target.value)} placeholder="Any" /></label>
      <label>Milk a day (litres)<input type="number" min="0" step="0.5" inputMode="decimal" value={filters.minYield} onChange={event => setFilter('minYield', event.target.value)} placeholder="Any" /></label>
      <label>Oldest age (years)<input type="number" min="0" inputMode="numeric" value={filters.maxAge} onChange={event => setFilter('maxAge', event.target.value)} placeholder="Any" /></label>
      <label>Gender<select value={filters.gender} onChange={event => setFilter('gender', event.target.value)}><option value="">Any</option><option value="Female">Female</option><option value="Male">Male</option></select></label>
      <div className="filter-panel-actions"><button type="button" className="text-link" onClick={onClear}>Clear all</button><Button type="button" variant="unstyled" size="unstyled" className="button button-light" onClick={() => setPanelOpen(false)}>Done</Button></div>
    </div>}
    {chips.length > 0 && <div className="filter-chips">{chips.map(chip => <span className="filter-chip" key={chip.key}>{chip.label}<button type="button" aria-label={`Remove ${chip.label}`} onClick={() => setFilter(chip.key, '')}><X size={12} /></button></span>)}<button type="button" className="filter-clear" onClick={onClear}>Clear all filters</button></div>}
  </Card>
}

function Marketplace() {
  const params = new URLSearchParams(window.location.search)
  const initialFilters: MarketFilters = { ...emptyMarketFilters, query: params.get('q') || '', district: params.get('district') || '' }
  const [filters, setFilters] = useState<MarketFilters>(initialFilters)
  // `applied` is what the query actually runs with. Typing updates the input
  // immediately while the request waits for a short pause, so a search for
  // "Friesian" fires one query instead of eight.
  const [applied, setApplied] = useState<MarketFilters>(initialFilters)
  const [panelOpen, setPanelOpen] = useState(false)
  const [catalog, setCatalog] = useState<Cattle[] | null>(() => (supabase ? null : cattle))
  const [catalogError, setCatalogError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [sort, setSort] = useState('newest')
  const [visible, setVisible] = useState(6)

  const setFilter = (key: keyof MarketFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }))

  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300)
    return () => clearTimeout(timer)
  }, [filters])

  const runSearch = () => { setApplied(filters); setVisible(6); setPanelOpen(false) }

  // Approved listings only, filtered in the database when Supabase is
  // configured and against the preview catalogue otherwise. Earlier results stay
  // on screen while a new query runs so the grid never flashes empty.
  useEffect(() => {
    setVisible(6)
    if (!supabase) {
      setCatalog(cattle.filter(cow => matchesMarketFilters(cow, applied)))
      return
    }
    let active = true
    setRefreshing(true)
    searchApprovedCattle({
      query: applied.query.trim() || undefined,
      district: applied.district || undefined,
      breed: applied.breed || undefined,
      gender: applied.gender || undefined,
      minPrice: numberOrUndefined(applied.minPrice),
      maxPrice: numberOrUndefined(applied.maxPrice),
      minYield: numberOrUndefined(applied.minYield),
      maxAgeMonths: applied.maxAge ? Number(applied.maxAge) * 12 : undefined,
    })
      .then(rows => {
        if (!active) return
        setCatalog(rows || [])
        setCatalogError('')
      })
      .catch(() => {
        if (!active) return
        setCatalog(previous => previous ?? [])
        setCatalogError('Search is temporarily unavailable. Your last results are still shown.')
      })
      .finally(() => { if (active) setRefreshing(false) })
    return () => { active = false }
  }, [applied])

  const breedOptions = useMemo(() => [...new Set([...cattle.map(cow => cow.breed), ...(catalog || []).map(cow => cow.breed)])].sort(), [catalog])
  const sorted = useMemo(() => [...(catalog || [])].sort((a, b) => sort === 'price-low' ? a.price - b.price : sort === 'price-high' ? b.price - a.price : sort === 'milk' ? b.dailyYield - a.dailyYield : 0), [catalog, sort])
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.floor((visible - 1) / pageSize) + 1))
  const goToPage = (next: number) => setVisible(Math.min(pageCount, Math.max(1, next)) * pageSize)
  const shown = sorted.slice((page - 1) * pageSize, page * pageSize)
  const chips = marketFilterChips(applied)
  const loading = catalog === null

  return <><Navbar /><main className="marketplace-page"><div className="container">
    <div className="market-hero"><div><p className="eyebrow">The Pasu marketplace</p><h1>Explore cattle.<br /><em>Find your next one.</em></h1></div><p className="market-intro">Every approved listing in one place. Search by district, breed, price, age or daily milk yield, then message the farmer directly inside Pasu.</p></div>
    {catalogError && <Alert className="catalog-alert"><AlertTitle>Search is temporarily unavailable</AlertTitle><AlertDescription>{catalogError}</AlertDescription></Alert>}
    <FilterBar filters={filters} setFilter={setFilter} breedOptions={breedOptions} panelOpen={panelOpen} setPanelOpen={setPanelOpen} onSearch={runSearch} onClear={() => { setFilters({ ...emptyMarketFilters }); setApplied({ ...emptyMarketFilters }); setPanelOpen(false) }} />
    <div className="results-head" aria-busy={refreshing}>
      <span>{loading ? 'Loading approved cattle…' : <><b>{sorted.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, sorted.length)}</b> of {sorted.length} cattle shown{chips.length ? '' : ' across all districts and breeds'}{refreshing && <em className="results-refreshing">Updating…</em>}</>}</span>
      <label>Sort by <select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="price-low">Lowest price</option><option value="price-high">Highest price</option><option value="milk">Highest milk yield</option></select><ChevronDown size={15} /></label>
    </div>
    {loading ? <div className="cattle-grid marketplace-grid" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div className="cattle-card skeleton-card" key={index}><Skeleton className="skeleton-image" /><div className="card-content"><Skeleton className="skeleton-line skeleton-line-lg" /><Skeleton className="skeleton-line skeleton-line-sm" /><div className="card-footer"><Skeleton className="skeleton-line skeleton-line-sm" /><Skeleton className="skeleton-line skeleton-line-md" /></div></div></div>)}</div> : sorted.length ? <>
      <div className="cattle-grid marketplace-grid">{shown.map(cow => <CattleCard key={cow.id} cow={cow} />)}</div>
      {pageCount > 1 && <Pagination className="market-pagination"><PaginationContent>
        <PaginationItem><PaginationPrevious href="#" className={page === 1 ? 'pagination-disabled' : ''} onClick={event => { event.preventDefault(); goToPage(page - 1) }} /></PaginationItem>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <PaginationItem key={number}><PaginationLink href="#" isActive={number === page} onClick={event => { event.preventDefault(); goToPage(number) }}>{number}</PaginationLink></PaginationItem>)}
        <PaginationItem><PaginationNext href="#" className={page === pageCount ? 'pagination-disabled' : ''} onClick={event => { event.preventDefault(); goToPage(page + 1) }} /></PaginationItem>
      </PaginationContent></Pagination>}
    </> : <Card className="empty-state marketplace-empty" bordered><Badge variant="info" withDot dotColor="#c86d4d">Live catalog</Badge><Search size={28} /><h3>{chips.length ? 'No cattle match these filters' : 'No approved cattle yet'}</h3><p>{chips.length ? 'Try removing a filter or widening your price and milk range.' : 'Approved listings will appear here after an administrator checks the details.'}</p><Button variant="unstyled" size="unstyled" className="button button-light" onClick={() => { setFilters({ ...emptyMarketFilters }); setApplied({ ...emptyMarketFilters }); setPanelOpen(false) }}>Clear filters</Button></Card>}
  </div></main><Footer /></>
}

function Detail() {
  const { id } = useParams()
  const [cow, setCow] = useState<Cattle | null>(null)
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  useEffect(() => { fetchApprovedCattle().then(rows => setCow((rows ?? cattle).find(item => item.id === id) || null)).catch(reason => setError(reason instanceof Error ? reason.message : 'This listing could not be loaded.')) }, [id])
  useEffect(() => { if (!supabase) return; let active = true; fetchSellerContact(id || '').then(row => { if (active) setContact(row) }).catch(() => { if (active) setContact(null) }); return () => { active = false } }, [id])
  if (!cow) return <><Navbar /><main className="simple-page"><div className="container"><p className="eyebrow">Cattle details</p><h1>{error || 'Listing not found'}</h1><p className="body-copy">This listing may no longer be approved or available.</p><Link className="button button-dark" to="/marketplace">Browse cattle</Link></div></main><Footer /></>
  return <><Navbar /><main className="detail-page"><div className="container"><button className="back-link" onClick={() => navigate(-1)}><ChevronLeft size={17} /> Back to marketplace</button><div className="detail-grid"><div className="detail-gallery"><img className="detail-image" src={cow.image} alt={cow.title} /><div className="detail-thumb-row"><img src={cow.image} alt="" /><div className="thumb-placeholder">+ 3 photos</div></div></div><div className="detail-copy"><div className="card-location">{cow.district} · {cow.city}</div><div className="detail-title-row"><h1>{cow.title}</h1>{cow.sellerVerified && <span className="verified-badge static"><BadgeCheck size={14} /> Verified</span>}</div><p className="detail-description">{cow.description}</p><div className="detail-price">{formatLkr(cow.price)}<small>asking price</small></div><div className="detail-spec-grid"><div><small>Breed</small><b>{cow.breed}</b></div><div><small>Gender</small><b>{cow.gender}</b></div><div><small>Age</small><b>{cow.age} years</b></div><div><small>Daily yield</small><b>{cow.dailyYield} litres</b></div><div><small>Health</small><b>{cow.health}</b></div><div><small>Vaccination</small><b>{cow.vaccination}</b></div></div><div className="seller-box"><div className="seller-avatar">{initials(cow.seller)}</div><div><small>Listed by</small><b>{cow.seller}</b>{cow.sellerVerified && <span><BadgeCheck size={13} /> Verified seller</span>}</div></div>{contact?.phone && <p className="seller-contact"><ShieldCheck size={14} /> Seller phone <b>{contact.phone}</b> · visible to the seller and Pasu admins only</p>}  <button className="button button-dark" onClick={() => getAccount() ? navigate(`/dashboard/enquiries?listing=${encodeURIComponent(cow.id)}`) : navigate('/login', { state: { from: `/cattle/${cow.id}` } })}><MessageCircle size={18} /> Message seller privately</button><p className="private-note"><ShieldCheck size={14} /> Your conversation stays inside Pasu. Phone numbers are not shared.</p></div></div></div></main><Footer /></>
}

function SimplePage({ title, children }: { title: ReactNode; children?: ReactNode }) { return <><Navbar /><main className="simple-page"><div className="container"><p className="eyebrow">Pasu</p><h1>{title}</h1>{children || <p className="body-copy">This page is ready for the next part of your marketplace journey.</p>}</div></main><Footer /></> }

function HowItWorks() {
  return <SimplePage title={<>A better way to<br /><em>buy and sell.</em></>}><div className="public-story-grid"><div><p className="body-copy">Pasu keeps the important parts close: real cattle details, private conversations, and a clear next step.</p><Link className="button button-dark" to="/marketplace">Start browsing <ArrowUpRight size={16} /></Link></div><div className="story-list">{[['Discover','Search by district, breed, yield and price.'],['Compare','Look at health, vaccination and seller details together.'],['Connect','Message the farmer securely inside Pasu.'],['Decide','Arrange an inspection before you commit.']].map(([title, copy], index) => <div key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div></div>)}</div></div></SimplePage>
}

function About() {
  return <SimplePage title={<>The marketplace<br /><em>with a human side.</em></>}><div className="about-story"><p className="body-copy">Pasu is built for the people who know cattle best: the farmers raising them, the families looking to buy them, and the field representatives who keep the details honest.</p><div className="about-values"><div><ShieldCheck size={21} /><b>Clear by default</b><span>Useful information before the first call.</span></div><div><MessageCircle size={21} /><b>Direct by design</b><span>Conversations belong to buyers and farmers.</span></div><div><Leaf size={21} /><b>Made for the island</b><span>Districts, LKR and farm realities included.</span></div></div></div></SimplePage>
}

function Contact() {
  const [sent, setSent] = useState(false)
  return <SimplePage title={<>Let’s talk about<br /><em>your next step.</em></>}><div className="contact-layout"><div><p className="body-copy">Need help finding cattle, listing one, or getting your account ready? Send us a note and our team will get back to you on weekdays.</p><a className="contact-email" href="mailto:hello@pasu.lk">hello@pasu.lk <ArrowUpRight size={15} /></a></div>{sent ? <div className="contact-success"><CheckMark /><h3>Message received.</h3><p>We’ll get back to you soon.</p></div> : <form className="contact-form" onSubmit={event => { event.preventDefault(); setSent(true) }}><label>Your name<input required placeholder="How should we address you?" /></label><label>Phone number<input required placeholder="+94 77 123 4567" /></label><label>How can we help?<textarea required placeholder="Tell us what you need..." /></label><button className="button button-dark">Send message <ArrowUpRight size={16} /></button></form>}</div></SimplePage>
}

function CheckMark() { return <span className="contact-check"><ShieldCheck size={23} /></span> }

function Auth({ register = false }: { register?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const loginState = location.state as { registered?: boolean; email?: string; notice?: string } | null
  const [identifierType, setIdentifierType] = useState<'email' | 'phone'>('email')
  const [identifier, setIdentifier] = useState(loginState?.email || '')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(loginState?.registered ? loginState.notice || 'Your account is ready. Log in with the details you used to register.' : '')
  const [submitting, setSubmitting] = useState(false)
  const normalizePhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.startsWith('94') ? `+${digits}` : `+94${digits.replace(/^0/, '')}` }
  useEffect(() => {
    if (!register && loginState?.registered) window.history.replaceState({}, document.title, window.location.pathname)
  }, [loginState?.registered, register])
  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setError('')
    setNotice('')
    if (register && (!fullName.trim() || !email.trim() || !phone.trim() || !district.trim() || !city.trim() || password !== confirmPassword)) {
      setError(password !== confirmPassword ? 'Passwords do not match.' : 'Complete every required account field.')
      return
    }
    const loginIdentifier = register ? email : identifier
    if (!loginIdentifier.trim() || password.length < 6) {
      setError(identifierType === 'email' ? 'Enter your email and a password with at least 6 characters.' : 'Enter your phone number and a password with at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      const credentials = identifierType === 'email' ? { email: loginIdentifier.trim(), password } : { phone: normalizePhone(loginIdentifier), password }
      if (supabase) {
        if (register) {
          const result = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/login`,
              data: { full_name: fullName.trim(), phone_number: normalizePhone(phone), district: district.trim(), city: city.trim(), role: 'user' },
            },
          })
          if (result.error) throw result.error
          navigate('/login', {
            replace: true,
            state: {
              registered: true,
              email: email.trim(),
              notice: result.data.session
                ? 'Account created. Log in with your new password to continue.'
                : 'Account created. Check your email if confirmation is enabled, then log in with your new password.',
            },
          })
          return
        }
        const result = await supabase.auth.signInWithPassword(credentials)
        if (result.error) throw result.error
        if (!result.data.session || !result.data.user) throw new Error('Your session could not be established. Please try again.')
        await syncSupabaseAccount(result.data.user.id)
      } else {
        if (register) {
          saveAccount({ name: fullName.trim(), email: email.trim(), phone: normalizePhone(phone), district: district.trim(), city: city.trim(), role: 'user' })
          navigate('/login', { replace: true, state: { registered: true, email: email.trim(), notice: 'Account created. Log in with your new password to continue.' } })
          return
        }
        saveAccount({ name: 'Pasu User', email: identifierType === 'email' ? identifier : '', phone: identifierType === 'phone' ? identifier : '', district, city, role: 'user' })
      }
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not complete that request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  const toast = submitting ? { tone: 'loading', message: register ? 'Creating your Pasu account...' : 'Checking your details securely...' } : error ? { tone: 'error', message: error } : notice ? { tone: 'success', message: notice } : null
  return <><Navbar /><main className="auth-page">{toast && <div className={`auth-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}><span className="auth-toast-mark">{toast.tone === 'loading' ? '…' : toast.tone === 'error' ? '!' : '✓'}</span><span>{toast.message}</span></div>}<div className="auth-card"><span className="auth-icon"><CircleUserRound size={25} /></span><p className="eyebrow">{register ? 'Join Pasu' : 'Welcome back'}</p><h1>{register ? 'One account. Every possibility.' : 'Good to see you.'}</h1><p className="auth-copy">{register ? 'Create one account to buy cattle, list cattle, and manage your farm.' : 'Log in to buy cattle, list cattle, and manage everything from one workspace.'}</p>{notice && <p className="auth-notice" role="status">{notice}</p>}<div className="auth-methods"><button type="button" className={identifierType === 'email' ? 'active' : ''} onClick={() => { setIdentifierType('email'); setError(''); setNotice('') }}>Email</button><button type="button" className={identifierType === 'phone' ? 'active' : ''} onClick={() => { setIdentifierType('phone'); setError(''); setNotice('') }}>Phone number</button></div><form onSubmit={submitCredentials}>{register && <><label>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" /></label><label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Phone number<input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+94 77 123 4567" /></label><div className="auth-two-col"><label>District<input required value={district} onChange={e => setDistrict(e.target.value)} placeholder="Kandy" /></label><label>City / town<input required value={city} onChange={e => setCity(e.target.value)} placeholder="Gampola" /></label></div></>}{!register && <label>{identifierType === 'email' ? 'Email address' : 'Phone number'}<input required type={identifierType === 'email' ? 'email' : 'tel'} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={identifierType === 'email' ? 'you@example.com' : '+94 77 123 4567'} /></label>}<label>Password<input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>{register && <label>Confirm password<input required type="password" minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" /></label>}<button className="button button-dark auth-submit" type="submit" disabled={submitting}>{submitting ? (register ? 'Creating account...' : 'Signing you in...') : register ? 'Create account' : 'Log in'} {!submitting && <ArrowUpRight size={16} />}</button>{error && <p className="form-error" role="alert">{error}</p>}{!register && <Link className="auth-forgot" to="/forgot-password">Forgot your password?</Link>}</form><p className="auth-foot">{register ? 'Already have an account? ' : 'New to Pasu? '}<Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create an account'}</Link></p></div></main></>
}

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'PS'
}

function Credits() {
  return <SimplePage title={<>Photo credits,<br /><em>given properly.</em></>}>
    <p className="body-copy credits-intro">The preview listings use freely licensed photographs from Wikimedia Commons, lightened for faster loading. They illustrate the sample listings and are not photos of the animals described. Each photograph remains the work of its photographer and is used under the licence shown.</p>
    <div className="credits-list">
      {photoCredits.map(item => <article className="credit-row" key={item.file}>
        <img src={item.file} alt="" loading="lazy" decoding="async" />
        <div><b>{item.photographer}</b><span>{item.licence}</span><a href={item.source} target="_blank" rel="noreferrer">View original <ArrowUpRight size={13} /></a></div>
      </article>)}
    </div>
    <p className="body-copy">Cattle listed by real sellers are photographed by the seller, and those images stay with the listing. Questions about an image? Write to <a className="text-link" href="mailto:hello@pasu.lk">hello@pasu.lk</a>.</p>
  </SimplePage>
}

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try {
      await sendPasswordReset(email)
      setStatus('If that address has a Pasu account, a reset link is on its way. Check your inbox and spam folder.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reset email could not be sent.')
    } finally { setBusy(false) }
  }
  return <><Navbar /><main className="auth-page"><div className="auth-card"><span className="auth-icon"><CircleUserRound size={25} /></span><p className="eyebrow">Password recovery</p><h1>Reset your password.</h1><p className="auth-copy">Enter the email address on your Pasu account and we will send a link to choose a new password.</p>{status && <p className="auth-notice" role="status">{status}</p>}<form onSubmit={submit}><label>Email address<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Sending reset link...' : 'Send reset link'}</button>{error && <p className="form-error" role="alert">{error}</p>}</form><p className="auth-foot"><Link to="/login">Back to log in</Link></p></div></main><Footer /></>
}

function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      await updatePassword(password)
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your password could not be updated. Open the newest link in your email and try again.')
    } finally { setBusy(false) }
  }
  return <><Navbar /><main className="auth-page"><div className="auth-card"><span className="auth-icon"><CircleUserRound size={25} /></span><p className="eyebrow">New password</p><h1>Choose a new password.</h1><p className="auth-copy">Pick something you have not used on Pasu before. You will be signed in once it is saved.</p><form onSubmit={submit}><label>New password<input required type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></label><label>Confirm new password<input required type="password" minLength={8} value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Repeat your new password" /></label><button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Saving password...' : 'Save new password'}</button>{error && <p className="form-error" role="alert">{error}</p>}</form><p className="auth-foot"><Link to="/login">Back to log in</Link></p></div></main><Footer /></>
}

function App() { return <BrowserRouter><PageTransition><Routes><Route path="/" element={<Home />} /><Route path="/marketplace" element={<Marketplace />} /><Route path="/browse" element={<Marketplace />} /><Route path="/cattle/:id" element={<Detail />} /><Route path="/login" element={<Auth />} /><Route path="/register" element={<Auth register />} /><Route path="/dashboard/*" element={<Dashboard />} /><Route path="/admin/*" element={<Dashboard />} /><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/reset-password" element={<ResetPassword />} /><Route path="/how-it-works" element={<HowItWorks />} /><Route path="/about" element={<About />} /><Route path="/contact" element={<Contact />} /><Route path="/credits" element={<Credits />} /><Route path="/privacy" element={<SimplePage title={<>Your privacy,<br /><em>kept simple.</em></>} />} /><Route path="/terms" element={<SimplePage title={<>Clear terms for<br /><em>clear decisions.</em></>} />} /><Route path="*" element={<SimplePage title="Page not found" />} /></Routes></PageTransition><Toaster position="top-right" /></BrowserRouter> }

export default App
