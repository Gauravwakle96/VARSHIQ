import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Droplets,
  Loader2,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api'
import type { Property } from '../types'

export const number = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
export const date = (value: string | undefined | null, timezone = 'Asia/Kolkata', includeTime = true) => {
  if (!value) return 'Not recorded'
  // Provider calendar dates must retain their supplied date rather than acquire a browser-zone offset.
  const calendarOnly = !includeTime && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/.test(value)
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: calendarOnly ? 'UTC' : timezone,
    }).format(new Date(calendarOnly ? `${value.slice(0, 10)}T12:00:00Z` : value))
  } catch {
    return value
  }
}
export const humanise = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export const modelReady = (property: Property | null) =>
  Boolean(
    property &&
    property.effective_catchment_m2 != null &&
    property.effective_catchment_m2 > 0 &&
    property.runoff_coefficient != null &&
    property.coefficient_source,
  )

export function Button({
  children,
  loading,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  return (
    <button {...props} className={`button ${variant} ${className}`} disabled={props.disabled || loading}>
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  )
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  )
}
export function Section({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  const id = useId()
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small id={id}>{hint}</small>}
    </label>
  )
}
export function Notice({
  children,
  tone = 'info',
  title,
}: {
  children: ReactNode
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: string
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={18} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}
export function Metric({
  label,
  value,
  unit,
  detail,
  tone = '',
}: {
  label: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  tone?: string
}) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      {detail && <div className="metric-detail">{detail}</div>}
    </div>
  )
}
export function Chip({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`chip ${tone}`}>{children}</span>
}
export function Verification({ property }: { property: Property }) {
  return (
    <Chip tone={property.measurement_status === 'field_verified' ? 'green' : 'amber'}>
      {property.measurement_status === 'field_verified' ? (
        <ShieldCheck size={12} />
      ) : (
        <AlertCircle size={12} />
      )}
      {property.measurement_status === 'field_verified'
        ? 'Field measurement recorded'
        : humanise(property.measurement_status)}
    </Chip>
  )
}
export function Empty({
  title,
  description,
  to,
  action = 'Register a property',
  icon = 'water',
}: {
  title: string
  description: string
  to?: string
  action?: string
  icon?: 'water' | 'map'
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon === 'map' ? <MapPin size={27} /> : <Droplets size={27} />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {to && (
        <Link className="button primary" to={to}>
          {action}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  )
}
export function Loading({ text = 'Loading your workspace…' }: { text?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={24} />
      <span>{text}</span>
    </div>
  )
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Notice
      tone="error"
      title={
        error instanceof ApiError && error.status === 403
          ? 'Access requires permission'
          : 'This request could not be completed'
      }
    >
      <p>{error.message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </Notice>
  )
}
export function PropertyNeeded({
  property,
  modelling = false,
}: {
  property: Property | null
  modelling?: boolean
}) {
  if (!property)
    return (
      <Empty
        title="Choose a real property"
        description="Register a property, then select it from the workspace header to use this tool."
        to="/register"
      />
    )
  if (modelling && !modelReady(property))
    return (
      <Notice tone="warning" title="A few inputs are needed">
        Record the effective rooftop catchment area and an explicit runoff coefficient with its source before
        modelling water.
        <div className="inline-actions">
          <Link to="/verify" className="button secondary">
            Record roof measurement
          </Link>
          <Link to="/property" className="button secondary">
            Edit model inputs
          </Link>
        </div>
      </Notice>
    )
  return null
}
export function Evidence({ title = 'Evidence & assumptions', value }: { title?: string; value: unknown }) {
  if (value == null) return null
  return (
    <details className="evidence">
      <summary>
        {title}
        <ChevronDown size={15} />
      </summary>
      <div className="evidence-content">
        <EvidenceValue value={value} />
      </div>
    </details>
  )
}
function EvidenceValue({ value }: { value: unknown }) {
  if (value == null) return <span className="muted">Not available</span>
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          <li key={index}>
            <EvidenceValue value={item} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="muted">No records yet</span>
    )
  if (typeof value === 'object')
    return (
      <dl className="evidence-list">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{humanise(key)}</dt>
            <dd>
              <EvidenceValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    )
  return <span>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>
}
export function InputError({ error }: { error: string | null }) {
  return error ? <Notice tone="error">{error}</Notice> : null
}
export function DataTable({ headings, children }: { headings: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
