import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Chart, registerables } from 'chart.js'
import {
  ArrowUpRight, BadgeCheck, BarChart3, Bell, Check, ChevronDown, CircleUserRound, ClipboardCheck,
  FilePlus2, Heart, LayoutDashboard, Leaf, LogOut, Menu, MessageCircle,
  Search, Settings, ShieldCheck, Store, Users as UsersIcon, X
} from 'lucide-react'
import { cattle, districts, formatLkr } from './data'
import { getAccount, isProfileComplete, signOutAccount, syncSupabaseAccount, updateProfile, type AccountRole } from './auth'
import { supabase } from './lib/supabase'
import { createListing, toggleFavourite } from './services/marketplace'
import { getDashboardSummary, getMyEnquiries, getMyListings, getMyTransactions, getNotifications, getSavedListings, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead, type DashboardSummary, type ListingRow } from './services/dashboard'
import { searchApprovedCattle } from './services/cattle'
import { getAdminListings, getAdminOverview, getAdminTransactions, getAdminUsers, getCommissionSettings, reviewListing, reviewSellerVerification, setSellerVerification, setUserSuspension, type AdminListing } from './services/admin'
import { getMyVerificationState, listVerificationRequests, requestVerification, sellerOf, verificationNote, type MyVerificationState, type VerificationRequest } from './services/verification'
import { SearchableDropdown } from './components/FormControls'
import {
  blockConversation, broadcastTyping, createConversation, getAttachmentUrl, getCurrentUserId, getMessages, getUnreadCount, handoverConversation, listConversations,
  markMessageRead, reportConversation, sendMessage, subscribeToConversation, subscribeToTyping, updateAiSettings, updatePresence,
  type Conversation, type Message,
} from './services/messaging'

Chart.register(...registerables)

const marketplaceMenu = [
    { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Browse cattle', path: '/dashboard/browse', icon: Store },
    { label: 'Saved listings', path: '/dashboard/saved', icon: Heart },
    { label: 'My listings', path: '/dashboard/listings', icon: Store },
    { label: 'Add new cattle', path: '/dashboard/add-listing', icon: FilePlus2 },
    { label: 'My enquiries', path: '/dashboard/enquiries', icon: MessageCircle },
    { label: 'Messages', path: '/dashboard/messages', icon: MessageCircle },
    { label: 'Transactions', path: '/dashboard/transactions', icon: ClipboardCheck },
    { label: 'Get verified', path: '/dashboard/verification', icon: BadgeCheck },
]

const menu: Record<AccountRole, { label: string; path: string; icon: typeof LayoutDashboard }[]> = {
  user: marketplaceMenu,
  admin: [
    { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Listing approvals', path: '/dashboard/approvals', icon: ClipboardCheck },
    { label: 'Seller verification', path: '/dashboard/verifications', icon: BadgeCheck },
    { label: 'Cattle management', path: '/dashboard/listings', icon: Store },
    { label: 'User management', path: '/dashboard/users', icon: UsersIcon },
    { label: 'Transactions', path: '/dashboard/transactions', icon: BarChart3 },
    { label: 'Commission settings', path: '/dashboard/commission', icon: Settings },
  ],
}

function DashboardShell({ children }: { children: ReactNode }) {
  const account = getAccount()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobile, setMobile] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  useEffect(() => { if (account) getUnreadNotificationCount().then(setUnreadNotifications).catch(() => undefined) }, [account, location.pathname])
  if (!account) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const links = menu[account.role]
  return <div className="dashboard-app">
    <aside className={`dashboard-sidebar ${mobile ? 'open' : ''}`}>
      <div className="dashboard-brand"><Link to="/" className="logo"><span className="logo-mark"><Leaf size={17} /></span><span>Pasu</span></Link><button className="dashboard-close" onClick={() => setMobile(false)}><X size={20} /></button></div>
      <div className="workspace-label">{account.role === 'admin' ? 'Owner workspace' : `${account.role} workspace`}</div>
      <nav className="dashboard-nav">{links.map(item => { const Icon = item.icon; return <Link key={item.path} className={location.pathname === item.path ? 'active' : ''} to={item.path} onClick={() => setMobile(false)}><Icon size={18} />{item.label}</Link> })}</nav>
      <div className="sidebar-bottom"><Link to="/dashboard/profile"><CircleUserRound size={18} /> Profile settings</Link><button onClick={async () => { await signOutAccount(); navigate('/'); }}><LogOut size={18} /> Sign out</button></div>
    </aside>
    <div className="dashboard-main"><header className="dashboard-topbar"><button className="dashboard-menu" onClick={() => setMobile(true)}><Menu size={21} /></button><div className="dashboard-search"><Search size={17} /><input placeholder="Search your workspace" /></div><div className="topbar-actions"><Link className="notification-button" aria-label="Notifications" to="/dashboard/notifications"><Bell size={19} />{unreadNotifications > 0 && <span>{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}</Link><div className="account-chip"><span className="account-avatar">{account.name.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.role === 'admin' ? 'Administrator' : 'Marketplace user'}</small></span><ChevronDown size={15} /></div></div></header><main className="dashboard-content">{account.role !== 'admin' && !isProfileComplete(account) && <div className="profile-reminder"><div><b>Complete your profile to unlock selling.</b><span>{[account.name, account.email, account.phone, account.district, account.city].filter(Boolean).length}/5 required details complete. Add your district and city so buyers can trust your listings.</span></div><Link to="/dashboard/profile" className="button button-dark">Complete profile</Link></div>}{children}</main></div>
  </div>
}

function PageHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="dashboard-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{action}</div>
}

function Stat({ label, value, detail, tone = '', path }: { label: string; value: string; detail: string; tone?: string; path?: string }) {
  const content = <><span>{label}</span><strong>{value}</strong><small>{detail}</small></>
  return path ? <Link to={path} className={`dashboard-stat ${tone}`}>{content}</Link> : <div className={`dashboard-stat ${tone}`}>{content}</div>
}

function ActivityChart({ labels, values, title }: { labels: string[]; values: number[]; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: '#c8df71',
          borderColor: '#214535',
          borderWidth: 1,
          borderRadius: 2,
          maxBarThickness: 42,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#758078', font: { size: 10 } },
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(...values, 1),
            ticks: { precision: 0, color: '#758078', font: { size: 10 } },
            grid: { color: '#e8ebe1' },
            border: { display: false },
          },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [labels, title, values])

  return <section className="dashboard-panel chart-panel"><div className="panel-heading"><div><p className="panel-kicker">Live activity</p><h2>{title}</h2></div><span className="status-pill approved">Supabase</span></div><div className="dashboard-chart"><canvas ref={canvasRef} /></div></section>
}

function AdminOverview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminOverview>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getAdminOverview().then(setData).catch(reason => setError(reason instanceof Error ? reason.message : 'Admin overview could not be loaded.')) }, [])
  if (error) return <div className="dashboard-error"><p>{error}</p></div>
  if (!data) return <div className="dashboard-loading">Loading marketplace operations...</div>
  return <><PageHeading eyebrow="Owner overview" title="The marketplace at a glance." /><div className="stats-grid"><Stat label="Registered users" value={String(data.users)} detail="All profiles" path="/dashboard/users" /><Stat label="Active listings" value={String(data.active)} detail={`${data.listings} total listings`} path="/dashboard/listings" /><Stat label="Pending approvals" value={String(data.pending)} detail="Needs review" path="/dashboard/approvals" /><Stat label="Sold cattle" value={String(data.sold)} detail="Marked sold" path="/dashboard/listings" /><Stat label="Transactions" value={String(data.transactions)} detail={`${data.completed} completed`} path="/dashboard/transactions" /><Stat label="Commission revenue" value={formatLkr(data.revenue)} detail="Completed transactions" path="/dashboard/commission" /><Stat label="Open reports" value={String(data.reports)} detail="Moderation queue" path="/dashboard/reports" /></div><div className="dashboard-chart-grid"><ActivityChart title="Marketplace records" labels={['Users', 'Listings', 'Active', 'Pending', 'Sold', 'Reports']} values={[data.users, data.listings, data.active, data.pending, data.sold, data.reports]} /><div className="dashboard-panel dashboard-empty-activity"><ShieldCheck size={20} /><div><h2>Operational controls are live.</h2><p>Review listings, monitor users, and keep marketplace decisions recorded in the audit trail.</p></div><Link to="/dashboard/approvals" className="button button-dark">Review approvals</Link></div></div></>
}

function Overview() {
  const account = getAccount()!
  const isAdmin = account.role === 'admin'
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { getDashboardSummary().then(setSummary).catch(reason => setError(reason instanceof Error ? reason.message : 'Dashboard data could not be loaded.')).finally(() => setLoading(false)) }, [])
  if (isAdmin) return <AdminOverview />
  const greeting = 'Welcome back'
  if (loading) return <div className="dashboard-loading">Loading your marketplace summary...</div>
  if (error) return <div className="dashboard-error"><p>{error}</p><button className="button button-light" onClick={() => window.location.reload()}>Try again</button></div>
  const data = summary || { favourites: 0, listings: 0, pendingListings: 0, openEnquiries: 0, unreadMessages: 0, activeTransactions: 0, completedTransactions: 0, completedValue: 0 }
  return <><PageHeading eyebrow={isAdmin ? 'Owner overview' : `${greeting}, ${account.name.split(' ')[0]}`} title={isAdmin ? 'The marketplace at a glance.' : 'Your marketplace, moving forward.'} action={!isAdmin && <div className="dashboard-heading-actions"><Link to="/dashboard/browse" className="button button-light"><Store size={17} /> Browse cattle</Link><Link to="/dashboard/add-listing" className="button button-dark"><FilePlus2 size={17} /> Add new cattle</Link></div>} /><div className="stats-grid">{isAdmin ? <><Stat label="Total users" value="—" detail="Admin analytics" path="/dashboard/users" /><Stat label="Active listings" value="—" detail="Open cattle management" path="/dashboard/listings" /><Stat label="Transactions" value="—" detail="View transaction records" path="/dashboard/transactions" /><Stat label="Commission" value="—" detail="View commission settings" path="/dashboard/commission" /></> : <><Stat label="Saved cattle" value={String(data.favourites)} detail="Your saved listings" tone="lime" path="/dashboard/saved" /><Stat label="My listings" value={String(data.listings)} detail="All listings you own" path="/dashboard/listings" /><Stat label="Pending approval" value={String(data.pendingListings)} detail="Waiting for review" path="/dashboard/listings" /><Stat label="Open enquiries" value={String(data.openEnquiries)} detail="Sent and received" path="/dashboard/enquiries" /><Stat label="Unread messages" value={String(data.unreadMessages)} detail="Private conversations" path="/dashboard/messages" /><Stat label="Active transactions" value={String(data.activeTransactions)} detail="Needs attention" path="/dashboard/transactions" /><Stat label="Completed transactions" value={String(data.completedTransactions)} detail="Successfully completed" path="/dashboard/transactions" /><Stat label="Completed value" value={formatLkr(data.completedValue)} detail="Agreed prices only" path="/dashboard/transactions" /></>}</div><div className="dashboard-chart-grid"><ActivityChart title="Your marketplace activity" labels={['Saved', 'Listings', 'Pending', 'Enquiries', 'Messages', 'Active deals', 'Completed']} values={[data.favourites, data.listings, data.pendingListings, data.openEnquiries, data.unreadMessages, data.activeTransactions, data.completedTransactions]} /><div className="dashboard-panel dashboard-empty-activity"><MessageCircle size={20} /><div><h2>Your real activity will appear here.</h2><p>Start by browsing cattle, saving a listing, or adding your own cattle to the marketplace.</p></div><Link to="/dashboard/browse" className="button button-light">Browse cattle</Link></div></div></>
}

function Listings({ admin = false }: { admin?: boolean }) {
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState<ListingRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { (admin ? getAdminListings('') : getMyListings()).then(setRows as (value: ListingRow[] | AdminListing[] | null) => void).catch(reason => setError(reason instanceof Error ? reason.message : 'Listings could not be loaded.')) }, [admin])
  const visible = (rows || []).filter(row => !filter || `${row.title} ${row.breed} ${row.district}`.toLowerCase().includes(filter.toLowerCase()))
  return <><PageHeading eyebrow={admin ? 'Marketplace management' : 'Your cattle'} title={admin ? 'Keep every listing clear.' : 'Listings that tell the story.'} action={!admin && <Link to="/dashboard/add-listing" className="button button-dark"><FilePlus2 size={17} /> Add new cattle</Link>} /><div className="table-toolbar"><div className="table-search"><Search size={16} /><input placeholder="Search listings" value={filter} onChange={e => setFilter(e.target.value)} /></div></div>{error && <p className="form-error">{error}</p>}<div className="dashboard-panel data-table-wrap">{visible.length ? <table className="data-table"><thead><tr><th>Listing</th><th>Location</th><th>Price</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>{visible.map(row => { const image = row.cow_images?.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.image_url; return <tr key={row.id}><td><div className="table-listing">{image && <img src={image} alt="" />}<span><b>{row.title}</b><small>{row.breed} · {row.daily_yield_liters}L daily</small></span></div></td><td>{row.district}, {row.city}</td><td>{formatLkr(row.asking_price_lkr)}</td><td><span className={`status-pill ${row.listing_status === 'approved' ? 'approved' : 'pending'}`}>{row.listing_status}</span>{row.rejection_reason && <small className="table-muted">{row.rejection_reason}</small>}</td><td>{new Date(row.updated_at).toLocaleDateString('en-LK')}</td><td><Link className="more-button" to={`/cattle/${row.id}`} aria-label={`View ${row.title}`}><ArrowUpRight size={17} /></Link></td></tr> })}</tbody></table> : <div className="empty-state"><Store size={26} /><h3>{error ? 'Listings unavailable' : 'No listings yet'}</h3><p>Create your first cattle listing to see it here.</p>{!error && <Link to="/dashboard/add-listing" className="button button-dark">Add new cattle</Link>}</div>}</div></>
}

function Approvals() {
  const [rows, setRows] = useState<AdminListing[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { getAdminListings('pending').then(setRows).catch(reason => setError(reason instanceof Error ? reason.message : 'Approval queue could not be loaded.')) }, [])
  const decide = async (id: string, decision: 'approved' | 'rejected') => { const reason = decision === 'rejected' ? window.prompt('Reason for rejection') : undefined; if (decision === 'rejected' && !reason?.trim()) return; setBusy(id); try { await reviewListing(id, decision, reason || undefined); setRows(previous => previous.filter(row => row.id !== id)) } catch (issue) { setError(issue instanceof Error ? issue.message : 'Listing decision could not be saved.') } finally { setBusy('') } }
  return <><PageHeading eyebrow="Verification queue" title="Review with confidence." /><div className="approval-notice"><ClipboardCheck size={20} /><div><b>{rows.length} listings need your review</b><span>Decisions are stored with administrator identity, timestamp, and reason.</span></div></div>{error && <p className="form-error">{error}</p>}<div className="approval-grid">{rows.length ? rows.map(row => { const image = row.cow_images?.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.image_url; return <article className="approval-card" key={row.id}><img src={image || ''} alt="" /><div className="approval-card-copy"><div><span className="status-pill pending">Pending review</span><span className="card-location">{row.district}</span></div><h3>{row.title}</h3><p>{row.breed} · {row.daily_yield_liters}L daily · {formatLkr(row.asking_price_lkr)}</p><small>{row.profiles?.full_name || 'Unknown seller'} · {row.profiles?.is_verified ? 'Verified seller' : 'Seller not verified'}</small><div className="approval-actions"><button className="button button-dark" disabled={busy === row.id} onClick={() => decide(row.id, 'approved')}>{busy === row.id ? 'Saving...' : 'Approve listing'}</button><button className="button button-light" disabled={busy === row.id} onClick={() => decide(row.id, 'rejected')}>Reject</button></div></div></article> }) : <div className="empty-state"><Check size={27} /><h3>Approval queue is clear</h3><p>New pending listings will appear here.</p></div>}</div></>
}

function AddListing() {
  const account = getAccount()
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [district, setDistrict] = useState('Kandy')
  if (account?.role !== 'admin' && !isProfileComplete(account)) return <div className="profile-gate"><span><CircleUserRound size={25} /></span><p className="eyebrow">One more step</p><h1>Complete your profile<br /><em>before listing.</em></h1><p>Buyers need a little context. Add your full name, email, phone, district and city before submitting cattle.</p><Link to="/dashboard/profile" className="button button-dark">Complete profile <ArrowUpRight size={16} /></Link></div>
  if (submitted) return <div className="success-card"><span><Check size={25} /></span><p className="eyebrow">On its way</p><h1>Your listing is ready<br /><em>for review.</em></h1><p>Our team will check the details and get back to you within one business day.</p><Link to="/dashboard/listings" className="button button-dark">View my listings</Link></div>
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); setSubmitting(true); setFormError(''); const form = new FormData(e.currentTarget); const photos = Array.from(form.getAll('photos')).filter((item): item is File => item instanceof File && item.size > 0); try { await createListing({ title: String(form.get('title')), breed: String(form.get('breed')), gender: String(form.get('gender')) as 'Female' | 'Male', ageMonths: Number(form.get('age')) * 12, price: Number(form.get('price')), dailyYield: Number(form.get('yield')), district: String(form.get('district')), city: String(form.get('city') || ''), description: String(form.get('description')), health: String(form.get('health')), vaccination: String(form.get('vaccination')), pregnancy: String(form.get('pregnancy')) }, photos); setSubmitted(true) } catch (error) { setFormError(error instanceof Error ? error.message : 'The listing could not be submitted.'); } finally { setSubmitting(false) } }
  return <><PageHeading eyebrow="Seller workspace" title="Add a new cattle listing." /><form className="listing-form" onSubmit={submit}><section className="dashboard-panel form-section"><div className="form-section-heading"><span>01</span><div><h2>Tell us about the cattle</h2><p>The details buyers use to find a good match.</p></div></div><div className="form-grid"><label>Listing title<input name="title" required placeholder="e.g. Sudu Menike" /></label><label>Breed<select name="breed"><option>Jersey Cross</option><option>Ayrshire</option><option>Friesian Cross</option></select></label><label>Gender<select name="gender"><option>Female</option><option>Male</option></select></label><label>Age in years<input name="age" required type="number" min="0" placeholder="4" /></label><label>Asking price (LKR)<input name="price" required type="number" min="1" placeholder="385000" /></label><SearchableDropdown name="district" label="District" value={district} options={districts} onChange={setDistrict} required /><label>City / area<input name="city" required placeholder="Gampola" /></label><label className="wide">Description<textarea name="description" required placeholder="What makes this cattle a good choice?" /></label></div></section><section className="dashboard-panel form-section"><div className="form-section-heading"><span>02</span><div><h2>Production & health</h2><p>Clear information builds trust.</p></div></div><div className="form-grid"><label>Daily milk yield (litres)<input name="yield" required type="number" step=".1" placeholder="15" /></label><label>Health condition<select name="health"><option>Excellent</option><option>Good</option><option>Needs attention</option></select></label><label>Vaccination status<select name="vaccination"><option>Up to date</option><option>Partially complete</option><option>Not vaccinated</option></select></label><label>Pregnancy status<select name="pregnancy"><option>Not applicable</option><option>Pregnant</option><option>Not pregnant</option></select></label></div></section><section className="dashboard-panel form-section"><div className="form-section-heading"><span>03</span><div><h2>Add photographs</h2><p>Good photos help buyers feel closer to the farm.</p></div></div><div className="upload-box"><FilePlus2 size={25} /><b>Choose up to 5 photos</b><small>JPG or PNG · up to 10MB each</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /></div></section>{formError && <p className="form-error">{formError}</p>}<div className="form-actions"><Link to="/dashboard/listings" className="button button-light">Save as draft</Link><button className="button button-dark" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for review'} <Check size={16} /></button></div></form></>
}

function DashboardCattleCard({ cow }: { cow: typeof cattle[number] }) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const toggle = async () => { const next = !saved; setSaved(next); try { await toggleFavourite(cow.id, saved) } catch (reason) { setSaved(!next); setError(reason instanceof Error ? reason.message : 'This listing could not be saved.') } }
  return <article className="dashboard-cattle-card"><Link to={`/cattle/${cow.id}`}><img src={cow.image} alt={cow.title} /></Link><div><span className="card-location">{cow.district} · {cow.city}</span><h3><Link to={`/cattle/${cow.id}`}>{cow.title}</Link></h3><p>{cow.breed} · {cow.dailyYield}L daily</p><strong>{formatLkr(cow.price)}</strong>{error && <small className="form-error">{error}</small>}</div><button onClick={toggle} aria-label={saved ? 'Remove saved listing' : 'Save listing'}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button></article>
}

function Notifications() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getNotifications().then(data => setRows((data || []) as Record<string, unknown>[])).catch(reason => setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.')) }, [])
  const markRead = async (id: string) => { try { await markNotificationRead(id); setRows(previous => previous.map(row => row.id === id ? { ...row, is_read: true } : row)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Notification could not be updated.') } }
  const markAll = async () => { try { await markAllNotificationsRead(); setRows(previous => previous.map(row => ({ ...row, is_read: true }))) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications could not be updated.') } }
  return <><PageHeading eyebrow="Notifications" title="What needs your attention." action={<button className="button button-light" onClick={markAll}>Mark all as read</button>} />{error && <p className="form-error">{error}</p>}<div className="dashboard-panel enquiry-list">{rows.length ? rows.map(row => <button className={`notification-row ${row.is_read ? '' : 'unread'}`} key={String(row.id)} onClick={() => markRead(String(row.id))}><span className="activity-icon green"><Bell size={16} /></span><span><b>{String(row.title)}</b><p>{String(row.message)}</p><small>{new Date(String(row.created_at)).toLocaleString('en-LK')}</small></span></button>) : <div className="empty-state"><Bell size={27} /><h3>No notifications</h3><p>New messages, listing updates, and transaction changes will appear here.</p></div>}</div></>
}

function BrowseDashboard() {
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [results, setResults] = useState<typeof cattle>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { setLoading(true); searchApprovedCattle({ query, district }).then(rows => setResults(rows || cattle.filter(c => (!district || c.district === district) && `${c.title} ${c.breed} ${c.city}`.toLowerCase().includes(query.toLowerCase())))).catch(reason => setError(reason instanceof Error ? reason.message : 'Cattle could not be loaded.')).finally(() => setLoading(false)) }, [query, district])
  return <><PageHeading eyebrow="Marketplace" title="Cattle worth a closer look." /><div className="buyer-tools dashboard-panel"><div className="table-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search breed, location or listing" /></div><select value={district} onChange={e => setDistrict(e.target.value)}><option value="">All districts</option>{districts.map(item => <option key={item}>{item}</option>)}</select></div><div className="buyer-context"><span><ShieldCheck size={17} /> Approved listings only</span><span><Store size={17} /> {loading ? 'Searching...' : `${results.length} available`}</span><span><Heart size={17} /> Save cattle to compare later</span></div>{error && <p className="form-error">{error}</p>}{!loading && <div className="dashboard-cattle-grid">{results.map(cow => <DashboardCattleCard key={cow.id} cow={cow} />)}</div>}{!loading && !results.length && <div className="empty-state"><Store size={27} /><h3>No cattle found</h3><p>Try a different search or district.</p></div>}</>
}

function SavedDashboard() {
  const [saved, setSaved] = useState<typeof cattle>([])
  const [error, setError] = useState('')
  useEffect(() => { getSavedListings().then(rows => { if (!rows) { setSaved([]); return } setSaved(rows.map(row => { const listing = row.cow_listings as unknown as Record<string, unknown>; return { id: String(listing.id), title: String(listing.title), breed: String(listing.breed), gender: String(listing.gender), age: Math.round(Number(listing.estimated_age_months || 0) / 12), district: String(listing.district), city: String(listing.city), dailyYield: Number(listing.daily_yield_liters), price: Number(listing.asking_price_lkr), health: String(listing.health_condition), vaccination: String(listing.vaccination_status), seller: 'Pasu seller', phone: '', image: String((listing.cow_images as { image_url: string }[] | undefined)?.[0]?.image_url || ''), description: String(listing.description || '') } })) }).catch(reason => setError(reason instanceof Error ? reason.message : 'Saved listings could not be loaded.')) }, [])
  return <><PageHeading eyebrow="Saved listings" title="Your shortlist." />{error && <p className="form-error">{error}</p>}{saved.length ? <div className="dashboard-cattle-grid">{saved.map(cow => <DashboardCattleCard key={cow.id} cow={cow} />)}</div> : <div className="empty-state"><Heart size={27} /><h3>Nothing saved yet</h3><p>Save cattle while browsing to build your shortlist.</p><Link to="/dashboard/browse" className="button button-dark">Browse cattle</Link></div>}</>
}

function Enquiries() {
  const location = useLocation()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<File>()
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [autoReply, setAutoReply] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [typingUser, setTypingUser] = useState('')
  const channelRef = useRef<ReturnType<typeof subscribeToConversation>>(null)
  const selected = conversations.find(conversation => conversation.id === selectedId)

  useEffect(() => {
    let active = true
    Promise.all([listConversations(), getCurrentUserId()]).then(([rows, userId]) => {
      if (!active) return
      setConversations(rows)
      setCurrentUserId(userId)
      if (userId) Promise.all(rows.map(async row => [row.id, await getUnreadCount(row.id, userId)] as const)).then(counts => setUnread(Object.fromEntries(counts))).catch(() => undefined)
      const listingId = new URLSearchParams(location.search).get('listing')
      if (listingId) {
        createConversation(listingId).then(async id => {
          const refreshed = await listConversations()
          setConversations(refreshed)
          setSelectedId(id)
        }).catch(reason => setError(reason instanceof Error ? reason.message : 'Conversation could not be started.'))
      } else if (rows[0]) setSelectedId(rows[0].id)
      updatePresence('online').catch(() => undefined)
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Conversations could not be loaded.'))
    return () => { active = false; updatePresence('offline').catch(() => undefined) }
  }, [location.search])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    getMessages(selectedId).then(rows => { if (active) setMessages(rows) }).catch(reason => setError(reason instanceof Error ? reason.message : 'Messages could not be loaded.'))
    const channel = subscribeToConversation(selectedId, incoming => {
      setMessages(previous => previous.some(message => message.id === incoming.id) ? previous : [...previous, incoming])
      if (incoming.sender_id && incoming.sender_id !== currentUserId) markMessageRead(incoming.id).catch(() => undefined)
    })
    channelRef.current = channel
    if (channel) subscribeToTyping(channel, (userId, isTyping) => {
      if (userId !== currentUserId) setTypingUser(isTyping ? 'The other participant is typing...' : '')
    })
    return () => { active = false; channelRef.current = null; if (channel) channel.unsubscribe() }
  }, [selectedId, currentUserId])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedId || (!draft.trim() && !attachment)) return
    setSending(true); setError('')
    try {
      const message = await sendMessage(selectedId, draft, attachment)
      setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message])
      setDraft(''); setAttachment(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message could not be sent.') }
    finally { setSending(false) }
  }

  const saveAiSettings = async () => {
    setSavingSettings(true); setError('')
    try { await updateAiSettings({ ai_assistant_enabled: aiEnabled, ai_auto_reply_enabled: autoReply, ai_reply_timeout_seconds: 300 }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'AI settings could not be saved.') }
    finally { setSavingSettings(false) }
  }

  return <><PageHeading eyebrow="Conversations" title="Keep the conversation inside Pasu." /><div className="messaging-layout">
    <aside className="dashboard-panel conversation-list">
      <div className="panel-heading"><div><p className="panel-kicker">Your inbox</p><h2>{conversations.length} conversations</h2></div><MessageCircle size={20} /></div>
      {conversations.length ? conversations.map(conversation => {
        const other = conversation.conversation_participants.find(participant => participant.user_id !== currentUserId)
        return <button className={`conversation-row ${conversation.id === selectedId ? 'active' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}><span className="enquiry-avatar">{(other?.profiles.full_name || 'P').slice(0, 1)}</span><span><b>{other?.profiles.full_name || 'Marketplace participant'}</b><small>{conversation.cow_listings.title}</small><em>{other?.profiles.availability_status === 'online' ? 'Online' : 'Usually replies later'}{unread[conversation.id] ? ` · ${unread[conversation.id]} unread` : ''}</em></span></button>
      }) : <p className="dashboard-helper">Start from an approved cattle listing to open your first private conversation.</p>}
    </aside>
    <section className="dashboard-panel chat-panel">
      {selected ? <><div className="chat-header"><div><p className="panel-kicker">Listing conversation</p><h2>{selected.cow_listings.title}</h2><small>{formatLkr(selected.cow_listings.asking_price_lkr)} · Private between participants</small></div><div className="chat-actions"><span className="status-pill">Protected</span><button className="more-button" title="Report conversation" onClick={() => reportConversation(selected.id, 'Reported by participant').catch(reason => setError(reason instanceof Error ? reason.message : 'Report could not be sent.'))}><ShieldCheck size={16} /></button><button className="more-button" title="Block conversation" onClick={() => blockConversation(selected.id).catch(reason => setError(reason instanceof Error ? reason.message : 'Conversation could not be blocked.'))}><X size={16} /></button></div></div><div className="message-stream">{messages.length ? messages.map(message => <div key={message.id} className={`message-bubble ${message.sender_type === 'ai' ? 'ai' : message.sender_id === currentUserId ? 'mine' : ''}`}><p>{message.body}</p>{message.attachment_path && <Attachment path={message.attachment_path} name={message.attachment_name || 'Attached image'} />}<small>{message.sender_type === 'ai' ? 'Automated AI response · ' : ''}{new Date(message.sent_at).toLocaleString()}</small></div>) : <div className="empty-state"><MessageCircle size={26} /><h3>Start with a useful question</h3><p>Ask about inspection, feeding, availability, or the listing details.</p></div>}{typingUser && <small className="typing-indicator">{typingUser}</small>}</div><form className="chat-composer" onSubmit={send}><label className="attachment-button" aria-label="Attach image"><input type="file" accept="image/*" onChange={event => setAttachment(event.target.files?.[0])} /><span>+</span></label><input value={draft} onChange={event => { setDraft(event.target.value); if (channelRef.current && currentUserId) broadcastTyping(channelRef.current, currentUserId, Boolean(event.target.value)).catch(() => undefined) }} placeholder={attachment ? attachment.name : 'Write a message...'} /><button className="button button-dark" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button></form><button className="handover-link" onClick={() => handoverConversation(selected.id).catch(reason => setError(reason instanceof Error ? reason.message : 'AI handover could not be stopped.'))}>Take over this conversation manually</button></> : <div className="empty-state"><MessageCircle size={28} /><h3>Your conversations will appear here</h3><p>Choose an approved listing to start a private conversation.</p></div>}
    </section>
  </div><section className="dashboard-panel ai-settings"><div><p className="panel-kicker">Availability & automatic replies</p><h2>Let Pasu help while you are away.</h2><p>AI replies only use verified listing information, identify themselves, and never negotiate or confirm a transaction.</p></div><div className="ai-controls"><label><input type="checkbox" checked={aiEnabled} onChange={event => setAiEnabled(event.target.checked)} /> Enable AI assistant</label><label><input type="checkbox" checked={autoReply} onChange={event => setAutoReply(event.target.checked)} disabled={!aiEnabled} /> Reply after I am unavailable</label><button className="button button-light" onClick={saveAiSettings} disabled={savingSettings}>{savingSettings ? 'Saving...' : 'Save reply settings'}</button></div></section>{error && <p className="form-error">{error}</p>}</>
}

function Attachment({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => { getAttachmentUrl(path).then(value => setUrl(value || '')).catch(() => undefined) }, [path])
  return url ? <a className="message-attachment" href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} /></a> : <small>Attachment unavailable</small>
}

function Transactions() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  const admin = getAccount()?.role === 'admin'
  useEffect(() => { (admin ? getAdminTransactions() : getMyTransactions()).then(data => setRows((data || []) as Record<string, unknown>[])).catch(reason => setError(reason instanceof Error ? reason.message : 'Transactions could not be loaded.')) }, [admin])
  return <><PageHeading eyebrow={admin ? 'Owner workspace' : 'Your records'} title={admin ? 'Monitor every transaction.' : 'Every step, in one place.'} />{error && <p className="form-error">{error}</p>}<div className="dashboard-panel data-table-wrap">{rows.length ? <table className="data-table"><thead><tr><th>Listing</th><th>{admin ? 'Parties' : 'Role'}</th><th>Agreed price</th><th>Status</th><th>Payment</th><th>Updated</th></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)}><td><b>{String((row.cow_listings as { title?: string } | null)?.title || 'Cattle transaction')}</b><small className="table-muted">Asking {formatLkr(Number(row.asking_price_lkr))}</small></td><td>{admin ? `${String((row.buyer as { full_name?: string } | null)?.full_name || 'Buyer')} / ${String((row.seller as { full_name?: string } | null)?.full_name || 'Seller')}` : 'Participant'}</td><td>{row.agreed_price_lkr ? formatLkr(Number(row.agreed_price_lkr)) : 'Not agreed'}</td><td><span className={`status-pill ${row.transaction_status === 'completed' ? 'approved' : 'pending'}`}>{String(row.transaction_status)}</span></td><td>{String(row.payment_status)}</td><td>{new Date(String(row.updated_at)).toLocaleDateString('en-LK')}</td></tr>)}</tbody></table> : <div className="empty-state"><ClipboardCheck size={27} /><h3>No transactions yet</h3><p>Transactions will appear here when a purchase or sale is started.</p></div>}</div></>
}

function EnquiriesList() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getMyEnquiries().then(data => setRows((data || []) as Record<string, unknown>[])).catch(reason => setError(reason instanceof Error ? reason.message : 'Enquiries could not be loaded.')) }, [])
  return <><PageHeading eyebrow="Enquiries" title="Questions with a clear next step." action={<Link to="/dashboard/messages" className="button button-dark"><MessageCircle size={17} /> Open messages</Link>} />{error && <p className="form-error">{error}</p>}<div className="dashboard-panel enquiry-list">{rows.length ? rows.map(row => { const listing = row.cow_listings as { title?: string; asking_price_lkr?: number } | null; const buyer = row.buyer as { full_name?: string } | null; const seller = row.seller as { full_name?: string } | null; return <div className="enquiry-row" key={String(row.id)}><div className="enquiry-avatar">{(String((buyer?.full_name || seller?.full_name || 'P'))).slice(0, 1)}</div><div><b>{String(listing?.title || 'Cattle enquiry')}</b><p>{String(row.message)}</p><small>{new Date(String(row.created_at)).toLocaleString('en-LK')} · {buyer?.full_name || seller?.full_name || 'Marketplace participant'}</small></div><span className={`status-pill ${row.enquiry_status === 'closed' ? '' : 'pending'}`}>{String(row.enquiry_status)}</span><Link className="more-button" to="/dashboard/messages" aria-label="Open messages"><MessageCircle size={17} /></Link></div> }) : <div className="empty-state"><MessageCircle size={27} /><h3>No enquiries yet</h3><p>Questions you send or receive about cattle will appear here.</p><Link to="/dashboard/browse" className="button button-dark">Browse cattle</Link></div>}</div></>
}

function Users() {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getAdminUsers(search).then(data => setRows((data || []) as Record<string, unknown>[])).catch(reason => setError(reason instanceof Error ? reason.message : 'Users could not be loaded.')) }, [search])
  const suspend = async (row: Record<string, unknown>) => { const next = !row.is_suspended; const reason = next ? window.prompt('Reason for suspension') : undefined; if (next && !reason?.trim()) return; try { await setUserSuspension(String(row.id), next, reason || undefined); setRows(previous => previous.map(item => item.id === row.id ? { ...item, is_suspended: next } : item)) } catch (issue) { setError(issue instanceof Error ? issue.message : 'Account status could not be updated.') } }
  const verify = async (row: Record<string, unknown>) => { const next = !row.is_verified; try { await setSellerVerification(String(row.id), next); setRows(previous => previous.map(item => item.id === row.id ? { ...item, is_verified: next } : item)) } catch (issue) { setError(issue instanceof Error ? issue.message : 'Seller verification could not be updated.') } }
  return <><PageHeading eyebrow="Owner workspace" title="People make the marketplace." /><div className="table-toolbar"><div className="table-search"><Search size={16} /><input placeholder="Search name, email or phone" value={search} onChange={event => setSearch(event.target.value)} /></div></div>{error && <p className="form-error">{error}</p>}<div className="dashboard-panel data-table-wrap">{rows.length ? <table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Location</th><th>Verification</th><th>Account</th><th /></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)}><td><div className="table-listing"><span className="table-avatar">{String(row.full_name || 'P').slice(0, 1)}</span><span><b>{String(row.full_name || 'Unnamed user')}</b><small>{String(row.email || row.phone_number || '')}</small></span></div></td><td>{String(row.role)}</td><td>{String(row.district || '—')}</td><td><span className="status-pill">{row.is_verified ? 'Verified' : 'Unverified'}</span> <button className="button button-light table-action" onClick={() => verify(row)}>{row.is_verified ? 'Remove' : 'Verify'}</button></td><td><span className={`status-pill ${row.is_suspended ? 'pending' : 'approved'}`}>{row.is_suspended ? 'Suspended' : 'Active'}</span></td><td><button className="button button-light" onClick={() => suspend(row)}>{row.is_suspended ? 'Reactivate' : 'Suspend'}</button></td></tr>)}</tbody></table> : <div className="empty-state"><UsersIcon size={27} /><h3>No users found</h3><p>Try a different search.</p></div>}</div></>
}

function Commission() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  useEffect(() => { getCommissionSettings().then(data => setRows((data || []) as Record<string, unknown>[])).catch(reason => setError(reason instanceof Error ? reason.message : 'Commission settings could not be loaded.')) }, [])
  return <><PageHeading eyebrow="Owner workspace" title="Keep the model transparent." />{error && <p className="form-error">{error}</p>}<div className="commission-layout"><section className="dashboard-panel"><div className="panel-heading"><div><p className="panel-kicker">Active commission brackets</p><h2>Rates shown at agreement</h2></div><span className="status-pill">Live</span></div>{rows.map(row => <div className="rate-row" key={String(row.id)}><span>{formatLkr(Number(row.minimum_price_lkr))} – {row.maximum_price_lkr ? formatLkr(Number(row.maximum_price_lkr)) : 'above'}</span><b>{String(row.commission_percentage)}%</b><span>{row.is_active ? 'Active' : 'Inactive'}</span></div>)}{!rows.length && <div className="empty-state"><Settings size={27} /><h3>No commission rules</h3><p>Configure commission rules in Supabase before using the transaction workflow.</p></div>}</section></div></>
}

function VerificationQueue() {
  const [rows, setRows] = useState<VerificationRequest[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { listVerificationRequests('pending').then(setRows).catch(reason => setError(reason instanceof Error ? reason.message : 'Verification requests could not be loaded.')) }, [])
  const decide = async (row: VerificationRequest, decision: 'approved' | 'rejected') => { const reason = decision === 'rejected' ? window.prompt('Reason for rejection') : undefined; if (decision === 'rejected' && !reason?.trim()) return; setBusy(row.id); try { await reviewSellerVerification(row.id, decision, reason || undefined); setRows(previous => previous.filter(item => item.id !== row.id)) } catch (issue) { setError(issue instanceof Error ? issue.message : 'Verification decision could not be saved.') } finally { setBusy('') } }
  return <><PageHeading eyebrow="Seller verification" title="Trust, checked in person." /><div className="approval-notice"><BadgeCheck size={20} /><div><b>{rows.length} sellers waiting for verification</b><span>Approving sets the verified badge on every listing that seller owns.</span></div></div>{error && <p className="form-error">{error}</p>}<div className="dashboard-panel verification-list">{rows.length ? rows.map(row => { const seller = sellerOf(row); const note = verificationNote(row.documents); return <div className="verification-row" key={row.id}><span className="verification-avatar">{(seller?.full_name || 'P').slice(0, 1)}</span><div className="verification-body"><div className="verification-head"><b>{seller?.full_name || 'Unnamed seller'}</b><span className="status-pill pending">{seller?.is_verified ? 'Already verified' : 'Pending'}</span></div><small className="table-muted">{seller?.email || 'No email on file'} · {seller?.district || 'Unknown district'} · requested {new Date(row.created_at).toLocaleDateString('en-LK')}</small>{note && <p className="verification-note">{note}</p>}<div className="verification-actions"><button className="button button-dark table-action" disabled={busy === row.id} onClick={() => decide(row, 'approved')}>{busy === row.id ? 'Saving...' : 'Approve seller'}</button><button className="button button-light table-action" disabled={busy === row.id} onClick={() => decide(row, 'rejected')}>Reject</button></div></div></div> }) : <div className="empty-state"><Check size={27} /><h3>No requests waiting</h3><p>Sellers who ask to be verified will appear here.</p></div>}</div></>
}

function MyVerification() {
  const [state, setState] = useState<MyVerificationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { getMyVerificationState().then(setState).catch(reason => setError(reason instanceof Error ? reason.message : 'Your verification status could not be loaded.')).finally(() => setLoading(false)) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await requestVerification(note); setNote(''); setState(await getMyVerificationState()) } catch (issue) { setError(issue instanceof Error ? issue.message : 'Your request could not be sent.') } finally { setBusy(false) } }
  const request = state?.request || null
  const verified = Boolean(state?.verified) || request?.status === 'approved'
  const pending = request?.status === 'pending' && !verified
  const rejected = request?.status === 'rejected' && !verified
  return <><PageHeading eyebrow="Seller verification" title="Get the verified badge." />
    <p className="body-copy verification-intro">Verified sellers show a badge on every listing. The owner checks your details before approving, so buyers know the cattle and the person behind them are real.</p>
    {error && <p className="form-error">{error}</p>}
    {loading ? <div className="dashboard-panel verification-state"><ShieldCheck size={22} /><div><h2>Checking your status</h2><p>One moment.</p></div></div> : <>
      {verified && <div className="dashboard-panel verification-state approved"><BadgeCheck size={22} /><div><h2>You are a verified seller</h2><p>Your listings carry the verified badge in the marketplace.</p></div></div>}
      {request && pending && <div className="dashboard-panel verification-state pending"><ShieldCheck size={22} /><div><h2>Your request is under review</h2><p>Sent {new Date(request.created_at).toLocaleDateString('en-LK')}. The owner will approve or reject it.</p>{verificationNote(request.documents) && <p className="table-muted">{verificationNote(request.documents)}</p>}</div></div>}
      {request && rejected && <div className="dashboard-panel verification-state rejected"><X size={22} /><div><h2>Your last request was not approved</h2><p>{request.rejection_reason || 'No reason was recorded.'}</p><p className="table-muted">You can send a new request once you have addressed it.</p></div></div>}
      {!verified && !pending && <form className="dashboard-panel verification-form" onSubmit={submit}><div className="panel-heading"><div><p className="panel-kicker">Request verification</p><h2>Tell the owner what to check</h2></div></div><label>Anything we should know?<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Farm name, veterinary records, years of experience, or the officer who can vouch for you." /></label><button className="button button-dark" disabled={busy}>{busy ? 'Sending...' : 'Request verification'}</button></form>}
    </>}
  </>
}

function Profile() {
  const account = getAccount()!
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await updateProfile({ name: String(data.get('name')), email: String(data.get('email')), phone: String(data.get('phone')), district: String(data.get('district')), city: String(data.get('city')) }); setSaved(true); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile could not be saved.') } }
  return <><PageHeading eyebrow="Account" title="Keep your details current." /><form className="dashboard-panel profile-form" onSubmit={save}><div className="profile-header"><span className="profile-large-avatar">{account.name.slice(0, 1)}</span><div><h2>{account.name}</h2><p>Marketplace account · {account.phone}</p></div><button type="button" className="button button-light">Change photo</button></div><div className="form-grid"><label>Full name<input name="name" required defaultValue={account.name} /></label><label>Email address<input name="email" required type="email" defaultValue={account.email} /></label><label>Phone number<input name="phone" required defaultValue={account.phone} /></label><label>District<input name="district" required defaultValue={account.district} /></label><label>City / area<input name="city" required defaultValue={account.city} placeholder="Your village or town" /></label><label className="wide">Address<textarea name="address" placeholder="Your farm or home address" /></label></div>{error && <p className="form-error">{error}</p>}<button className="button button-dark" type="submit">{saved ? 'Changes saved' : 'Save changes'}</button></form></>
}

export function Dashboard() {
  const path = useLocation().pathname
  const [account, setAccount] = useState(getAccount)
  const [authLoading, setAuthLoading] = useState(!account)
  useEffect(() => {
    if (account || !supabase) { setAuthLoading(false); return }
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error
      if (data.session?.user) {
        const restored = await syncSupabaseAccount(data.session.user.id)
        if (active) setAccount(restored)
      }
    }).catch(() => undefined).finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [account])
  if (authLoading) return <div className="dashboard-loading">Restoring your secure session...</div>
  if (!account) return <Navigate to="/login" replace />
  const admin = account.role === 'admin'
  let content: ReactNode = <Overview />
  if (path.includes('add-listing')) content = <AddListing />
  else if (path.includes('approvals')) content = admin ? <Approvals /> : <Overview />
  else if (path.includes('verifications')) content = admin ? <VerificationQueue /> : <Overview />
  else if (path.includes('verification')) content = <MyVerification />
  else if (path.includes('listings')) content = <Listings admin={admin} />
  else if (path.includes('browse')) content = <BrowseDashboard />
  else if (path.includes('saved')) content = <SavedDashboard />
  else if (path.includes('users')) content = admin ? <Users /> : <Overview />
  else if (path.includes('commission')) content = admin ? <Commission /> : <Overview />
  else if (path.includes('enquiries')) content = <EnquiriesList />
  else if (path.includes('messages')) content = <Enquiries />
  else if (path.includes('transactions')) content = <Transactions />
  else if (path.includes('notifications')) content = <Notifications />
  else if (path.includes('profile')) content = <Profile />
  return <DashboardShell>{content}</DashboardShell>
}
