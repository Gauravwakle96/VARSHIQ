import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CloudRain, Droplets, Eye, EyeOff, ShieldCheck, Waves } from 'lucide-react'
import { motion, MotionConfig, useReducedMotion } from 'framer-motion'
import { post, setCsrf, useApi } from '../api'
import type { Community, Session, User } from '../types'
import { Button, ErrorState, Field, InputError, Loading, Metric, number } from '../components/ui'

export function AuthPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [register, setRegister] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    try {
      const response = await post<Session>(register ? '/auth/register' : '/auth/login', {
        ...(register ? { name: values.get('name') } : {}),
        email: values.get('email'),
        password: values.get('password'),
      })
      setCsrf(response.csrf_token)
      await onAuthenticated()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Link className="brand" to="/landing">
          <span className="brand-mark">
            <Droplets size={24} />
          </span>
          <span>
            VARSHIQ<small>BUILDING & COMMUNITY WATER INTELLIGENCE</small>
          </span>
        </Link>
        <div className="auth-story-content">
          <div className="eyebrow light">A clearer picture of your water</div>
          <h1>
            Every roof.
            <br />
            Every rainfall.
            <br />
            <em>Every drop accounted for.</em>
          </h1>
          <p>Connect your property to live rainfall forecasts and an explainable water model.</p>
          <div className="auth-flow">
            <span>
              <Building2 size={20} /> Real property
            </span>
            <i />
            <span>
              <CloudRain size={20} /> Rain forecast
            </span>
            <i />
            <span>
              <Waves size={20} /> WaterTwin
            </span>
          </div>
          <div className="auth-note">
            <ShieldCheck size={19} />
            <span>
              Your records stay in your private workspace. You control whether they contribute to community
              aggregates.
            </span>
          </div>
        </div>
        <div className="auth-stamp">Predict the Rain. Harvest Every Drop.</div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form">
          <span className="eyebrow">YOUR WATER WORKSPACE</span>
          <h2>{register ? 'Start with your real property.' : 'Welcome to VARSHIQ.'}</h2>
          <p>
            {register
              ? 'Create an account, register a building and document your measurements.'
              : 'Sign in to manage properties, forecasts and harvesting assessments.'}
          </p>
          <div className="segmented">
            <button
              className={!register ? 'selected' : ''}
              onClick={() => {
                setRegister(false)
                setError(null)
              }}
            >
              Sign in
            </button>
            <button
              className={register ? 'selected' : ''}
              onClick={() => {
                setRegister(true)
                setError(null)
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit}>
            {register && (
              <Field label="Your name">
                <input name="name" required maxLength={100} autoComplete="name" placeholder="Full name" />
              </Field>
            )}
            <Field label="Email address">
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            </Field>
            <Field
              label="Password"
              hint={
                register ? 'Use at least 12 characters. Your password is hashed on the server.' : undefined
              }
            >
              <div className="password-input">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  required
                  minLength={register ? 12 : undefined}
                  maxLength={128}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'At least 12 characters' : 'Your password'}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? 'Hide password' : 'Show password'}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <InputError error={error} />
            <Button loading={busy} className="full-width" type="submit">
              {register ? 'Create private workspace' : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-footnote">
            <ShieldCheck size={15} />
            No sample properties are added to your account.
          </div>
          <Link className="text-link" to="/landing">
            About VARSHIQ <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function LandingPage({ user }: { user?: User | null }) {
  const reduced = useReducedMotion()
  const [moving, setMoving] = useState(true)
  const animate = moving && !reduced
  const aggregate = useApi<Community>(user ? '/dashboard/locality' : null)
  const entrance = (delay = 0) => ({
    initial: reduced ? (false as const) : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.55, delay: reduced ? 0 : delay },
  })
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing animated-landing">
        <motion.div
          className="landing-water-background"
          aria-hidden="true"
          animate={animate ? { x: [0, 18, 0], y: [0, -8, 0] } : { x: 0, y: 0 }}
          transition={animate ? { duration: 22, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
        />
        <header>
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Droplets size={24} />
            </span>
            <span>
              VARSHIQ<small>BUILDING & COMMUNITY WATER INTELLIGENCE</small>
            </span>
          </Link>
          <Link className="button secondary" to="/">
            Open workspace <ArrowRight size={16} />
          </Link>
        </header>
        <main>
          <motion.div className="landing-hero" {...entrance()}>
            <span className="eyebrow">BUILDING & COMMUNITY WATER INTELLIGENCE</span>
            <h1>
              Predict the rain.
              <br />
              <em>Harvest every drop.</em>
            </h1>
            <p>
              Connect real buildings, live rainfall and a transparent water balance. Plan harvesting, compare
              storage and help your community make informed water decisions.
            </p>
            <Link className="button primary" to="/">
              Start your property assessment <ArrowRight size={17} />
            </Link>
            <div className="landing-proof">
              <ShieldCheck size={17} />
              Real property inputs · Live forecasts · Explainable WaterTwin
            </div>
          </motion.div>
          <motion.section
            className="landing-twin-illustration"
            aria-label="Conceptual WaterTwin illustration"
            {...entrance(0.12)}
          >
            <div className="diagram-title">VARSHIQ WATERTWIN</div>
            <svg
              viewBox="0 0 360 300"
              className="tank-schematic"
              role="img"
              aria-label="Conceptual roof-to-tank water flow. This illustration contains no measured rainfall or tank readings."
            >
              <defs>
                <clipPath id="concept-tank-clip">
                  <rect x="230" y="166" width="85" height="95" rx="8" />
                </clipPath>
              </defs>
              <path d="M18 265h324" stroke="#87af9b" strokeWidth="1" strokeDasharray="4 7" opacity="0.55" />
              <path
                d="m50 138 69-46 70 46"
                fill="#77b69e22"
                stroke="#b6e0c9"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <path d="M65 139v123h109V139" fill="#77b69e0d" stroke="#91c4ac" strokeWidth="2" />
              <path
                d="M96 211h39v51M147 157h14v23H147M80 157h14v23H80"
                fill="none"
                stroke="#91c4ac"
                strokeWidth="2"
              />
              <path
                d="M188 139h18v58h23"
                fill="none"
                stroke="#b9d9c9"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <motion.path
                d="M188 139h18v58h23"
                fill="none"
                stroke="#76d9b0"
                strokeWidth="2"
                strokeDasharray="4 10"
                animate={animate ? { strokeDashoffset: [0, -28] } : { strokeDashoffset: 0 }}
                transition={animate ? { duration: 2, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
              />
              <rect
                x="228"
                y="163"
                width="89"
                height="100"
                rx="10"
                fill="#9cdab611"
                stroke="#b9d9c9"
                strokeWidth="2"
              />
              <g clipPath="url(#concept-tank-clip)">
                <motion.path
                  d="M212 219q17-7 34 0t34 0t34 0t34 0v60H212Z"
                  fill="#76d9b040"
                  animate={animate ? { x: [-8, 8, -8] } : { x: 0 }}
                  transition={
                    animate ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }
                  }
                />
                <motion.path
                  d="M212 223q17-5 34 0t34 0t34 0t34 0"
                  fill="none"
                  stroke="#98e7c9"
                  strokeWidth="2"
                  animate={animate ? { x: [8, -8, 8] } : { x: 0 }}
                  transition={
                    animate ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }
                  }
                />
              </g>
              <path d="M317 237h18v13" fill="none" stroke="#b9d9c9" strokeWidth="3" strokeLinecap="round" />
              {[60, 81, 102, 123, 144, 165].map((x, index) => (
                <motion.path
                  key={x}
                  d={`M${x} 28l-3 9`}
                  stroke="#a4ddc3"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  animate={animate ? { y: [0, 42], opacity: [0, 0.75, 0] } : { y: 0, opacity: 0.25 }}
                  transition={
                    animate
                      ? { duration: 1.8, repeat: Infinity, delay: index * 0.25, ease: 'linear' }
                      : { duration: 0 }
                  }
                />
              ))}
              <motion.path
                d="M271 56c-11 15-17 23-17 33a17 17 0 0 0 34 0c0-10-6-18-17-33Z"
                fill="#94e2bd"
                animate={animate ? { y: [0, -5, 0] } : { y: 0 }}
                transition={animate ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
              />
              <path d="M262 88q0 8 8 9" fill="none" stroke="#1b5141" strokeWidth="2" strokeLinecap="round" />
              <text x="85" y="284" fill="#bddaca" fontSize="11">
                Connected roof
              </text>
              <text x="235" y="284" fill="#bddaca" fontSize="11">
                Storage & demand
              </text>
            </svg>
            <div className="illustration-caption">
              <span>Concept illustration · no measured values</span>
              <Button
                variant="ghost"
                disabled={Boolean(reduced)}
                onClick={() => setMoving((value) => !value)}
                aria-pressed={!moving}
              >
                {reduced ? 'Motion reduced' : moving ? 'Pause illustration' : 'Resume illustration'}
              </Button>
            </div>
          </motion.section>
        </main>
        <section className="landing-features">
          {[
            {
              label: '01 / BUILDINGS',
              title: 'Measure what matters.',
              text: 'Keep footprint estimates separate from the rooftop area connected to harvesting.',
            },
            {
              label: '02 / RAINFALL',
              title: 'See tomorrow clearly.',
              text: 'Explore sourced hourly and daily forecasts and retain every retrieval timestamp.',
            },
            {
              label: '03 / COMMUNITY',
              title: 'Make shared decisions.',
              text: 'Compare storage, field observations and actual quoted investments across registered properties.',
            },
          ].map((feature, index) => (
            <motion.article
              key={feature.label}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : index * 0.08 }}
            >
              <span>{feature.label}</span>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </motion.article>
          ))}
        </section>
        {user && (
          <section className="landing-private-network">
            <span className="eyebrow">YOUR PRIVATE REGISTERED NETWORK</span>
            <p>These totals come from your authorised workspace. They are not public municipal statistics.</p>
            {aggregate.loading && <Loading text="Loading your genuine registered-property totals…" />}
            {aggregate.error && <ErrorState error={aggregate.error} retry={aggregate.reload} />}
            {aggregate.data && (
              <div className="metrics-grid three">
                <Metric
                  label="Registered properties"
                  value={number(aggregate.data.registered_count)}
                  detail="Actual private workspace records"
                />
                <Metric
                  label="Field-verified catchment"
                  value={number(aggregate.data.verified_rooftop_m2, 1)}
                  unit="m²"
                  detail="Recorded field measurements"
                />
                <Metric
                  label="Registered storage capacity"
                  value={number(aggregate.data.storage_capacity_l)}
                  unit="L"
                  detail="Owner-provided tank inputs"
                />
              </div>
            )}
          </section>
        )}
        <footer>
          <span>VARSHIQ · Building & Community Water Intelligence</span>
          <Link to="/">Predict the Rain. Harvest Every Drop.</Link>
        </footer>
      </div>
    </MotionConfig>
  )
}
