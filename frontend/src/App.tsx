import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { motion, MotionConfig } from 'framer-motion'
import {
  ArrowUpRight,
  Building2,
  ChartNoAxesCombined,
  CircleHelp,
  CloudRain,
  Droplets,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Waves,
  X,
} from 'lucide-react'
import { api, post, setCsrf, useApi } from './api'
import type { LocationResult, Property, Session } from './types'
import { WorkspaceContext } from './context'
import { Chip, date, ErrorState, Loading } from './components/ui'
import { AuthPage, LandingPage } from './pages/Auth'
import WorkspaceNavigation from './components/WorkspaceNavigation'
import { workspaceLabel } from './components/workspaceNavigationData'
import './features/demo/featureSandbox.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const PropertyPages = lazy(() => import('./pages/Property'))
const MapPage = lazy(() => import('./pages/Map'))
const WeatherPages = lazy(() => import('./pages/Weather'))
const ModelPages = lazy(() => import('./pages/Models'))
const InsightPages = lazy(() => import('./pages/Insights'))
const LocationPage = lazy(() => import('./pages/Location'))
const OperationsPages = lazy(() => import('./pages/Operations'))
const DemoPage = lazy(() => import('./pages/Demo'))
const DemoWorkspace = lazy(() => import('./pages/DemoWorkspace'))
const FeatureSandbox = lazy(() => import('./features/demo/FeatureSandbox'))

const groups = [
  {
    label: 'Place & operations',
    links: [
      { to: '/locations', label: 'Select location', icon: Map },
      { to: '/water-sources', label: 'Water sources', icon: Droplets },
      { to: '/consumption', label: 'Water consumption', icon: Gauge },
      { to: '/maintenance', label: 'Maintenance & readiness', icon: ShieldCheck },
      { to: '/quality', label: 'Water quality', icon: CircleHelp },
      { to: '/groundwater', label: 'Groundwater & soil', icon: Waves },
      { to: '/community-budget', label: 'Community budget', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Workspace',
    links: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/map', label: 'Building map', icon: Map },
      { to: '/register', label: 'Register property', icon: Plus },
      { to: '/property', label: 'Property details', icon: Building2 },
      { to: '/verify', label: 'Roof verification', icon: ShieldCheck },
    ],
  },
  {
    label: 'Water intelligence',
    links: [
      { to: '/forecast', label: 'Rainfall forecast', icon: CloudRain },
      { to: '/historical', label: 'Historical rainfall', icon: ChartNoAxesCombined },
      { to: '/twin', label: 'WaterTwin', icon: Waves },
      { to: '/calculator', label: 'Rainwater calculator', icon: Droplets },
      { to: '/optimiser', label: 'Storage optimiser', icon: SlidersHorizontal },
      { to: '/recommendations', label: 'Recommendations', icon: CircleHelp },
    ],
  },
  {
    label: 'Field & community',
    links: [
      { to: '/observations', label: 'Field observations', icon: Gauge },
      { to: '/calibration', label: 'Performance history', icon: ChartNoAxesCombined },
      { to: '/community', label: 'Locality network', icon: Users },
      { to: '/commercial', label: 'Commercial', icon: Building2 },
      { to: '/municipal', label: 'Municipal', icon: Users },
    ],
  },
  {
    label: 'Tools',
    links: [
      { to: '/assistant', label: 'Water assistant', icon: MessageSquare },
      { to: '/reports', label: 'Assessment reports', icon: FileText },
      { to: '/sources', label: 'Data sources', icon: CloudRain },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function App() {
  const location = useLocation()
  if (location.pathname === '/demo/features')
    return (
      <Suspense fallback={<Loading text="Opening the simulated feature workspace…" />}>
        <DemoWorkspace />
      </Suspense>
    )
  if (location.pathname === '/demo')
    return (
      <Suspense fallback={<Loading text="Opening the illustrative WaterTwin demo…" />}>
        <DemoPage />
      </Suspense>
    )
  return <WorkspaceApp />
}

function WorkspaceApp() {
  const session = useApi<Session>('/auth/session')
  const user = session.data?.user ?? null
  const buildings = useApi<Property[]>(user ? '/buildings' : null)
  const [selectedId, setSelectedId] = useState('')
  const [activeLocation, setActiveLocation] = useState<LocationResult | null>(null)
  const selectProperty = (id: string) => {
    setSelectedId(id)
    setActiveLocation(null)
    setSimulationMode(false)
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [simulationMode, setSimulationMode] = useState(false)
  const location = useLocation()
  const properties = buildings.data ?? []
  const property = properties.find((item) => item.id === selectedId) ?? properties[0] ?? null
  useEffect(() => {
    if (session.data?.csrf_token) setCsrf(session.data.csrf_token)
  }, [session.data])
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.activeElement as HTMLElement | null
    const navigation = document.getElementById('primary-navigation')
    const visibleControls = () => navigation
      ? Array.from(navigation.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')).filter(
          (element) => element.getClientRects().length > 0,
        )
      : []
    const controls = visibleControls()
    const firstNavigationLink = navigation?.querySelector<HTMLElement>('nav a[href]') ?? controls[0]
    // Wait for the mobile drawer's visible style before moving focus; reset retained menu scroll.
    const focusFrame = window.requestAnimationFrame(() => {
      const nav = navigation?.querySelector('nav')
      if (nav) nav.scrollTop = 0
      firstNavigationLink?.focus()
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.key !== 'Tab' || !controls.length) return
      const currentControls = Array.from(navigation?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),summary') ?? [])
        .filter(element => element.getClientRects().length > 0)
      if (event.shiftKey && document.activeElement === currentControls[0]) {
        event.preventDefault()
        currentControls[currentControls.length - 1]?.focus()
      } else if (!event.shiftKey && document.activeElement === currentControls[currentControls.length - 1]) {
        event.preventDefault()
        currentControls[0]?.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [menuOpen])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(timeout)
  }, [toast])
  const refreshSession = async () => {
    const next = await api<Session>('/auth/session')
    setCsrf(next.csrf_token)
    session.setData(next)
  }
  const logout = async () => {
    try {
      await post('/auth/logout', {})
      setCsrf('')
      session.setData({ user: null, csrf_token: '' })
      session.reload()
      setSelectedId('')
      setActiveLocation(null)
      setSimulationMode(false)
    } catch (error) {
      setToast((error as Error).message)
    }
  }
  if (location.pathname === '/landing') return <LandingPage user={user} />
  if (session.loading)
    return (
      <div className="boot-screen">
        <Brand />
        <Loading text="Connecting to your private workspace…" />
      </div>
    )
  if (session.error)
    return (
      <div className="boot-screen">
        <Brand />
        <div className="boot-error">
          <ErrorState error={session.error} retry={session.reload} />
          <p className="muted">Start the VARSHIQ API and retry. Your property data stays on the server.</p>
          <Link to="/landing" className="text-link">
            Explore VARSHIQ <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    )
  if (!user)
    return (
      <AuthPage
        key={location.pathname}
        initialMode={location.pathname === '/register' ? 'register' : 'login'}
        onAuthenticated={refreshSession}
      />
    )
  return (
    <MotionConfig reducedMotion="user">
      <WorkspaceContext.Provider
        value={{
          user,
          properties,
          property,
          propertiesLoading: buildings.loading,
          refreshProperties: buildings.reload,
          selectProperty,
          notify: setToast,
          activeLocation,
          setActiveLocation,
          propertiesAvailable: buildings.data !== null,
          propertiesError: buildings.error,
        }}
      >
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault()
            document.getElementById('main-content')?.focus()
          }}
        >
          Skip to main content
        </a>
        <div className="app-shell">
          {menuOpen && (
            <button
              className="nav-backdrop"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
            />
          )}
          <aside
            id="primary-navigation"
            className={`sidebar ${menuOpen ? 'open' : ''}`}
            aria-label="Main navigation"
          >
            <div className="sidebar-brand">
              <Brand />
              <button
                className="icon-button mobile-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
              >
                <X size={21} />
              </button>
            </div>
            <div className="workspace-badge">
              <span className="status-dot" />
              <div>
                My water workspace<small>Your properties, kept private</small>
              </div>
            </div>
            {user.role === 'owner' ? <WorkspaceNavigation /> : <nav>
              {groups.map((group) => (
                <div className="nav-group" key={group.label}>
                  <div className="nav-label">{group.label}</div>
                  {group.links.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      end={to === '/'}
                      to={to}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={17} />
                      <span>{label}</span>
                      {label === 'WaterTwin' && <span className="nav-new">TWIN</span>}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>}
            <div className="sidebar-bottom">
              <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
              <div className="user-detail">
                <strong>{user.name}</strong>
                <small>{user.role.replaceAll('_', ' ')}</small>
              </div>
              <button className="icon-button" onClick={logout} aria-label="Sign out">
                <LogOut size={17} />
              </button>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div className="topbar-left">
                <button
                  className="icon-button menu-button"
                  aria-label="Open navigation"
                  aria-expanded={menuOpen}
                  aria-controls="primary-navigation"
                  onClick={() => setMenuOpen(true)}
                >
                  <Menu size={22} />
                </button>
                <span className="breadcrumb">
                  Workspace <span>/</span>{' '}
                  <strong>
                    {(user.role === 'owner' ? workspaceLabel(location.pathname) :
                      groups.flatMap((group) => group.links).find((link) => link.to === location.pathname)?.label)
                      ?? 'My water'}
                  </strong>
                </span>
              </div>
              <div className="topbar-right">
                <label className="property-picker">
                  <Building2 size={15} />
                  <span className="sr-only">Active property</span>
                  <select
                    value={property?.id ?? ''}
                    onChange={(event) => selectProperty(event.target.value)}
                    aria-label="Active property"
                  >
                    {!properties.length && <option value="">No registered properties</option>}
                    {properties.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Link to="/sources" className="topbar-source">
                  <ShieldCheck size={15} />
                  <span>Data sources</span>
                </Link>
              </div>
            </header>
            <main id="main-content" className="content" tabIndex={-1}>
              <div className="workspace-context">
                <span>
                  <span className="tiny-dot" />
                  {activeLocation &&
                  ['/locations', '/map', '/register', '/forecast', '/historical'].includes(location.pathname)
                    ? activeLocation.locality || activeLocation.city || activeLocation.display_name
                    : (property?.locality ?? 'Select a location')}{' '}
                  <span className="context-divider">·</span>{' '}
                  {date(
                    new Date().toISOString(),
                    activeLocation && ['/forecast', '/historical'].includes(location.pathname)
                      ? activeLocation.timezone
                      : property?.timezone,
                    false,
                  )}
                </span>
                <Chip tone="blue">
                  {activeLocation && ['/forecast', '/historical'].includes(location.pathname)
                    ? 'Unregistered place preview'
                    : property
                      ? property.property_code
                      : 'Ready for your first property'}
                </Chip>
              </div>
              {buildings.error && <ErrorState error={buildings.error} retry={buildings.reload} />}
              {property?.measurement_status === 'planning_assumptions' && (
                <section className={`planning-bar ${simulationMode ? 'example-active' : ''}`} aria-label="Data status">
                  <div className="planning-bar-copy">
                    <strong>{simulationMode ? 'Example mode · simulated data' : 'Using estimated property details'}</strong>
                    <p>{simulationMode ? 'Try the controls to see how this works. No property records are saved.' :
                      'Roof size, tank level and daily use are estimates. Rain forecasts use your property’s real location.'}</p>
                    <details>
                      <summary>What does this mean?</summary>
                      <p>These roof, collection, tank and daily-use inputs have not been measured. Check them before
                        planning an installation. Example mode uses made-up rainfall and equipment values; it is
                        separate from your property’s real forecast and saved details.</p>
                      <Link to={`/demo/features?feature=${encodeURIComponent(location.pathname)}`}
                        className="text-link">Explore the public demo <ArrowUpRight size={14} /></Link>
                    </details>
                  </div>
                  <div className="planning-bar-action">
                    <button className="button secondary" onClick={() => setSimulationMode(value => !value)}>
                      {simulationMode ? 'Back to my property' : 'Try an example'}
                    </button>
                  </div>
                </section>
              )}
              <Suspense fallback={<Loading text="Opening water intelligence…" />}>
                {simulationMode && property?.measurement_status === 'planning_assumptions' ? (
                  <FeatureSandbox featurePath={location.pathname} compact />
                ) : (
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/owner" element={<Dashboard />} />
                  <Route path="/commercial" element={<Dashboard mode="commercial" />} />
                  <Route path="/municipal" element={<Dashboard mode="municipal" />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/locations" element={<LocationPage />} />
                  <Route path="/water-sources" element={<OperationsPages mode="sources" />} />
                  <Route path="/consumption" element={<OperationsPages mode="consumption" />} />
                  <Route path="/maintenance" element={<OperationsPages mode="maintenance" />} />
                  <Route path="/quality" element={<OperationsPages mode="quality" />} />
                  <Route path="/groundwater" element={<OperationsPages mode="groundwater" />} />
                  <Route path="/community-budget" element={<OperationsPages mode="budget" />} />
                  <Route path="/register" element={<PropertyPages mode="register" />} />
                  <Route path="/property" element={<PropertyPages mode="details" />} />
                  <Route path="/verify" element={<PropertyPages mode="verify" />} />
                  <Route path="/forecast" element={<WeatherPages mode="forecast" />} />
                  <Route path="/historical" element={<WeatherPages mode="historical" />} />
                  <Route path="/calculator" element={<ModelPages mode="calculator" />} />
                  <Route path="/twin" element={<ModelPages mode="twin" />} />
                  <Route path="/optimiser" element={<ModelPages mode="optimiser" />} />
                  <Route path="/recommendations" element={<InsightPages mode="recommendations" />} />
                  <Route path="/observations" element={<InsightPages mode="observations" />} />
                  <Route path="/calibration" element={<InsightPages mode="calibration" />} />
                  <Route path="/community" element={<Dashboard mode="community" />} />
                  <Route path="/assistant" element={<InsightPages mode="assistant" />} />
                  <Route path="/reports" element={<InsightPages mode="reports" />} />
                  <Route path="/sources" element={<InsightPages mode="sources" />} />
                  <Route path="/settings" element={<InsightPages mode="settings" />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                )}
              </Suspense>
              <footer className="footer">
                <span>
                  VARSHIQ <span className="footer-divider">/</span> Predict the Rain. Harvest Every Drop.
                </span>
                <span>Forecasts are estimates. Measurements carry their own evidence.</span>
              </footer>
            </main>
          </div>
        </div>
        <div aria-live="polite" aria-atomic="true" className="toast-region">
          {toast && (
            <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <ShieldCheck size={18} />
              <span>{toast}</span>
              <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}>
                <X size={16} />
              </button>
            </motion.div>
          )}
        </div>
      </WorkspaceContext.Provider>
    </MotionConfig>
  )
}
export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <Droplets size={23} />
      </span>
      <span>
        VARSHIQ<small>BUILDING & COMMUNITY WATER INTELLIGENCE</small>
      </span>
    </Link>
  )
}
