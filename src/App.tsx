import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowUpRight, BadgeCheck, ChevronDown, ChevronLeft, CircleUserRound,
  Heart, Leaf, Menu, MessageCircle, Search, ShieldCheck, SlidersHorizontal, X
} from 'lucide-react'
import './App.css'
import { cattle, districts, formatLkr, photoCredits, type Cattle } from './data'
import { getAccount, saveAccount, syncSupabaseAccount } from './auth'
import { Dashboard } from './Dashboard'
import { supabase } from './lib/supabase'
import { fetchApprovedCattle, fetchSellerContact } from './services/cattle'
import { toggleFavourite } from './services/marketplace'
import { PageTransition } from './components/PageTransition'
import { MultiSelectComboBox, SearchableDropdown } from './components/FormControls'
import { Badge } from './components/lightswind/badge'
import { Card } from './components/lightswind/card'
import { Button } from './components/lightswind/button'

function Logo() {
  return <Link to="/" className="logo" aria-label="Pasu home"><span className="logo-mark"><Leaf size={17} strokeWidth={2.5} /></span><span>Pasu</span></Link>
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
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
      <div className="nav-actions">{getAccount() ? <Link to="/dashboard" className="nav-login">My workspace</Link> : <Link to="/login" className="nav-login">Log in</Link>}<Link to={getAccount() ? "/dashboard" : "/register"} className="button button-dark">{getAccount() ? 'Open dashboard' : 'Register'}</Link></div>
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
  const toggleSaved = async () => { setSaveError(''); const previous = saved; setSaved(!previous); try { await toggleFavourite(cow.id, previous) } catch (error) { setSaved(previous); setSaveError(error instanceof Error ? error.message : 'Unable to save this listing.') } }
  return <Card className="cattle-card" hoverable={false} bordered={false}>
    <Link to={`/cattle/${cow.id}`} className="card-image-wrap"><img src={cow.image} alt={cow.title} /><Badge className="verified-badge" variant="unstyled" size="unstyled" shape="unstyled"><BadgeCheck size={14} /> Verified</Badge></Link>
    <button className={`save-button ${saved ? 'saved' : ''}`} onClick={toggleSaved} aria-label={saved ? 'Remove from saved' : 'Save listing'}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>{saveError && <span className="card-save-error" role="alert">{saveError}</span>}
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

function FilterBar({ query, setQuery, district, setDistrict, breeds, breedOptions, genders, setBreeds, setGenders }: { query: string; setQuery: (v: string) => void; district: string; setDistrict: (v: string) => void; breeds: string[]; breedOptions: string[]; genders: string[]; setBreeds: (v: string[]) => void; setGenders: (v: string[]) => void }) {
  return <Card className="market-filter-card" bordered><div className="filter-bar"><div className="search-field"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search breed, location or listing" /></div><SearchableDropdown placeholder="District" value={district} options={districts} onChange={setDistrict} /><MultiSelectComboBox label="Breeds" options={breedOptions} values={breeds} onChange={setBreeds} /><MultiSelectComboBox label="Gender" options={['Female', 'Male']} values={genders} onChange={setGenders} /><Button variant="unstyled" size="unstyled" className="filter-button"><SlidersHorizontal size={17} /> Filters</Button></div></Card>
}

function Marketplace() {
  const params = new URLSearchParams(window.location.search)
  const [catalog, setCatalog] = useState(cattle)
  const [catalogError, setCatalogError] = useState('')
  const [query, setQuery] = useState(params.get('q') || '')
  const [district, setDistrict] = useState(params.get('district') || '')
  const [breeds, setBreeds] = useState<string[]>([])
  const [genders, setGenders] = useState<string[]>([])
  const [sort, setSort] = useState('newest')
  const breedOptions = useMemo(() => [...new Set(catalog.map(cow => cow.breed))].sort(), [catalog])
  useEffect(() => { if (!supabase) return; fetchApprovedCattle().then(rows => { if (rows?.length) setCatalog(rows) }).catch(() => setCatalogError('Live listings are temporarily unavailable. Showing the latest available catalog.')) }, [])
  const filtered = useMemo(() => catalog.filter(c => !district || c.district === district).filter(c => !breeds.length || breeds.includes(c.breed)).filter(c => !genders.length || genders.includes(c.gender)).filter(c => `${c.title} ${c.breed} ${c.city}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'price-low' ? a.price - b.price : sort === 'price-high' ? b.price - a.price : sort === 'milk' ? b.dailyYield - a.dailyYield : 0), [catalog, district, query, sort, breeds, genders])
  return <><Navbar /><main className="marketplace-page"><div className="container"><div className="market-hero"><div><p className="eyebrow">The Pasu marketplace</p><h1>Find cattle that<br /><em>fit your farm.</em></h1></div><p className="market-intro">Every listing has a story. We help you see the useful parts first—so you can spend less time searching and more time deciding.</p></div>{catalogError && <p className="catalog-notice">{catalogError}</p>}<FilterBar {...{ query, setQuery, district, setDistrict, breeds, breedOptions, genders, setBreeds, setGenders }} /><div className="results-head"><span><b>{filtered.length}</b> cattle available</span><label>Sort by <select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="price-low">Lowest price</option><option value="price-high">Highest price</option><option value="milk">Highest milk yield</option></select><ChevronDown size={15} /></label></div>{filtered.length ? <div className="cattle-grid marketplace-grid">{filtered.map(cow => <CattleCard key={cow.id} cow={cow} />)}</div> : <Card className="empty-state marketplace-empty" bordered><Badge variant="info" withDot dotColor="#c86d4d">Live catalog</Badge><Search size={28} /><h3>No cattle found</h3><p>Approved listings will appear here after an administrator checks the details.</p><Button variant="unstyled" size="unstyled" className="button button-light" onClick={() => { setQuery(''); setDistrict(''); setBreeds([]); setGenders([]) }}>Clear filters</Button></Card>}</div></main><Footer /></>
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
  return <><Navbar /><main className="detail-page"><div className="container"><button className="back-link" onClick={() => navigate(-1)}><ChevronLeft size={17} /> Back to marketplace</button><div className="detail-grid"><div className="detail-gallery"><img className="detail-image" src={cow.image} alt={cow.title} /><div className="detail-thumb-row"><img src={cow.image} alt="" /><div className="thumb-placeholder">+ 3 photos</div></div></div><div className="detail-copy"><div className="card-location">{cow.district} · {cow.city}</div><div className="detail-title-row"><h1>{cow.title}</h1><span className="verified-badge static"><BadgeCheck size={14} /> Verified</span></div><p className="detail-description">{cow.description}</p><div className="detail-price">{formatLkr(cow.price)}<small>asking price</small></div><div className="detail-spec-grid"><div><small>Breed</small><b>{cow.breed}</b></div><div><small>Gender</small><b>{cow.gender}</b></div><div><small>Age</small><b>{cow.age} years</b></div><div><small>Daily yield</small><b>{cow.dailyYield} litres</b></div><div><small>Health</small><b>{cow.health}</b></div><div><small>Vaccination</small><b>{cow.vaccination}</b></div></div><div className="seller-box"><div className="seller-avatar">{initials(cow.seller)}</div><div><small>Listed by</small><b>{cow.seller}</b>{cow.sellerVerified && <span><BadgeCheck size={13} /> Verified seller</span>}</div></div>{contact?.phone && <p className="seller-contact"><ShieldCheck size={14} /> Seller phone <b>{contact.phone}</b> · visible to the seller and Pasu admins only</p>}  <button className="button button-dark" onClick={() => getAccount() ? navigate(`/dashboard/enquiries?listing=${encodeURIComponent(cow.id)}`) : navigate('/login', { state: { from: `/cattle/${cow.id}` } })}><MessageCircle size={18} /> Message seller privately</button><p className="private-note"><ShieldCheck size={14} /> Your conversation stays inside Pasu. Phone numbers are not shared.</p></div></div></div></main><Footer /></>
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
  return <><Navbar /><main className="auth-page">{toast && <div className={`auth-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}><span className="auth-toast-mark">{toast.tone === 'loading' ? '…' : toast.tone === 'error' ? '!' : '✓'}</span><span>{toast.message}</span></div>}<div className="auth-card"><span className="auth-icon"><CircleUserRound size={25} /></span><p className="eyebrow">{register ? 'Join Pasu' : 'Welcome back'}</p><h1>{register ? 'One account. Every possibility.' : 'Good to see you.'}</h1><p className="auth-copy">{register ? 'Create one account to buy cattle, list cattle, and manage your farm.' : 'Log in to buy cattle, list cattle, and manage everything from one workspace.'}</p>{notice && <p className="auth-notice" role="status">{notice}</p>}<div className="auth-methods"><button type="button" className={identifierType === 'email' ? 'active' : ''} onClick={() => { setIdentifierType('email'); setError(''); setNotice('') }}>Email</button><button type="button" className={identifierType === 'phone' ? 'active' : ''} onClick={() => { setIdentifierType('phone'); setError(''); setNotice('') }}>Phone number</button></div><form onSubmit={submitCredentials}>{register && <><label>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" /></label><label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Phone number<input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+94 77 123 4567" /></label><div className="auth-two-col"><label>District<input required value={district} onChange={e => setDistrict(e.target.value)} placeholder="Kandy" /></label><label>City / town<input required value={city} onChange={e => setCity(e.target.value)} placeholder="Gampola" /></label></div></>}{!register && <label>{identifierType === 'email' ? 'Email address' : 'Phone number'}<input required type={identifierType === 'email' ? 'email' : 'tel'} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={identifierType === 'email' ? 'you@example.com' : '+94 77 123 4567'} /></label>}<label>Password<input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>{register && <label>Confirm password<input required type="password" minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" /></label>}<button className="button button-dark auth-submit" type="submit" disabled={submitting}>{submitting ? (register ? 'Creating account...' : 'Signing you in...') : register ? 'Create account' : 'Log in'} {!submitting && <ArrowUpRight size={16} />}</button>{error && <p className="form-error" role="alert">{error}</p>}</form><p className="auth-foot">{register ? 'Already have an account? ' : 'New to Pasu? '}<Link to={register ? '/login' : '/register'}>{register ? 'Log in' : 'Create an account'}</Link></p></div></main></>
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

function App() { return <BrowserRouter><PageTransition><Routes><Route path="/" element={<Home />} /><Route path="/marketplace" element={<Marketplace />} /><Route path="/cattle/:id" element={<Detail />} /><Route path="/login" element={<Auth />} /><Route path="/register" element={<Auth register />} /><Route path="/dashboard/*" element={<Dashboard />} /><Route path="/how-it-works" element={<HowItWorks />} /><Route path="/about" element={<About />} /><Route path="/contact" element={<Contact />} /><Route path="/credits" element={<Credits />} /><Route path="/privacy" element={<SimplePage title={<>Your privacy,<br /><em>kept simple.</em></>} />} /><Route path="/terms" element={<SimplePage title={<>Clear terms for<br /><em>clear decisions.</em></>} />} /><Route path="*" element={<SimplePage title="Page not found" />} /></Routes></PageTransition></BrowserRouter> }

export default App
