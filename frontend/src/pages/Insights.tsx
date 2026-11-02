import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Building2,
  CloudRain,
  Download,
  FileText,
  Gauge,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { patch, post, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Observation, Report, Source } from '../types'
import {
  Button,
  Chip,
  DataTable,
  date,
  Empty,
  ErrorState,
  Evidence,
  Field,
  humanise,
  InputError,
  Loading,
  Metric,
  Notice,
  number,
  PageTitle,
  PropertyNeeded,
  Section,
} from '../components/ui'

type Mode =
  'recommendations' | 'observations' | 'calibration' | 'assistant' | 'reports' | 'sources' | 'settings'
interface Recommendation {
  id: string
  property_id: string
  items: {
    type: string
    title: string
    reason: string
    status: string
    assumptions: unknown
    missing_information: unknown
  }[]
  readiness: unknown
  limitations: string[]
}
interface Calibration {
  observations: Observation[]
  accuracy: unknown
  eligibility: unknown
  records: unknown
  limitations: string[]
}
export default function InsightPages({ mode }: { mode: Mode }) {
  const { property } = useWorkspace()
  if (['recommendations', 'observations', 'calibration'].includes(mode) && !property)
    return (
      <>
        <PageTitle
          eyebrow="WATER INTELLIGENCE"
          title={humanise(mode)}
          description="Choose a genuine registered property to inspect its results and record field information."
        />
        <PropertyNeeded property={null} />
      </>
    )
  if (mode === 'recommendations') return <RecommendationPage key={property?.id} />
  if (mode === 'observations') return <ObservationPage key={property?.id} />
  if (mode === 'calibration') return <CalibrationPage key={property?.id} />
  if (mode === 'assistant') return <AssistantPage key={property?.id ?? 'workspace'} />
  if (mode === 'reports') return <ReportPage />
  if (mode === 'sources') return <SourcesPage />
  return <SettingsPage />
}
function RecommendationPage() {
  const { property, notify } = useWorkspace()
  const saved = useApi<Recommendation | null>(property ? `/recommendations/${property.id}` : null)
  const [generated, setGenerated] = useState<Recommendation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function generate() {
    setBusy(true)
    setError(null)
    try {
      setGenerated(await post<Recommendation>('/recommendations/generate', { property_id: property?.id }))
      notify('Explainable recommendations generated from available property inputs.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const data = generated ?? saved.data
  return (
    <>
      <PageTitle
        eyebrow="HARVESTING SYSTEM INTELLIGENCE"
        title="Recommendations with reasons."
        description={`${property?.name} · Available evidence, site constraints and missing information shape every recommendation.`}
        action={
          <Button loading={busy} onClick={generate}>
            <ShieldCheck size={16} />
            {data ? 'Refresh recommendations' : 'Generate recommendations'}
          </Button>
        }
      />
      <InputError error={error} />
      {saved.loading && <Loading text="Loading property recommendations…" />}
      {saved.error && <ErrorState error={saved.error} retry={saved.reload} />}
      <Notice title="Recharge is preliminary" tone="warning">
        Satellite imagery does not establish aquifer or soil suitability. Recharge structures require
        appropriate groundwater, soil, contamination and field-engineering assessment before design or
        installation.
      </Notice>
      {!data && !saved.loading && (
        <Section title="Start with your site's evidence">
          <Empty
            title="No recommendation generated yet"
            description="Generate a screening assessment using your registered catchment, tank, demand and available space. Missing data stays visible."
          />
        </Section>
      )}
      {data && (
        <>
          <div className="recommendation-grid">
            {data.items.map((item, index) => (
              <article className="recommendation-card" key={`${item.type}-${index}`}>
                <div className="recommendation-card-head">
                  <span className="recommendation-icon">
                    <ShieldCheck size={21} />
                  </span>
                  <Chip
                    tone={
                      item.status.includes('require') || item.status.includes('preliminary')
                        ? 'amber'
                        : 'blue'
                    }
                  >
                    {humanise(item.status)}
                  </Chip>
                </div>
                <h2>{item.title}</h2>
                <p>{item.reason}</p>
                <Evidence title="Engineering assumptions" value={item.assumptions} />
                <Evidence title="Information still needed" value={item.missing_information} />
              </article>
            ))}
          </div>
          <Evidence
            title="Rain readiness & assessment limitations"
            value={{ readiness: data.readiness, limitations: data.limitations }}
          />
        </>
      )}
      <div className="inline-actions">
        <Link to="/property" className="button secondary">
          Improve property inputs
          <ArrowRight size={16} />
        </Link>
        <Link to="/optimiser" className="button primary">
          Compare storage capacities
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  )
}
const localInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
function ObservationPage() {
  const { property, refreshProperties, notify } = useWorkspace()
  const history = useApi<Calibration>(property ? `/calibration/${property.id}` : null)
  const [kind, setKind] = useState('storage')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const interval = ['rainfall', 'collection', 'first_flush', 'overflow'].includes(kind)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(false)
    const values = new FormData(event.currentTarget)
    const unit = kind === 'rainfall' ? 'mm' : kind === 'maintenance' ? 'note' : 'L'
    const payload = {
      property_id: property?.id,
      kind,
      measured_at: new Date(String(values.get('measured_at'))).toISOString(),
      ...(interval
        ? {
            interval_start: new Date(String(values.get('interval_start'))).toISOString(),
            interval_end: new Date(String(values.get('interval_end'))).toISOString(),
          }
        : {}),
      value: kind === 'maintenance' ? null : Number(values.get('value')),
      unit,
      method: values.get('method'),
      reliability: values.get('reliability'),
      notes: values.get('notes'),
    }
    try {
      await post('/storage/observations', payload)
      setSuccess(true)
      history.reload()
      refreshProperties()
      notify('Field record saved with its measurement method and reliability.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="ACTUAL FIELD OBSERVATIONS"
        title="Close the loop with measurements."
        description={`${property?.name} · Record what happened, including the method and time period.`}
      />
      <div className="two-column">
        <Section
          title="Record an observation"
          subtitle="Estimates are allowed, but remain clearly labelled and cannot establish reliable calibration."
        >
          <form className="form-stack" onSubmit={save}>
            <div className="form-grid">
              <Field label="Observation type">
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value)
                    setSuccess(false)
                  }}
                >
                  <option value="storage">Tank storage volume</option>
                  <option value="rainfall">Rain-gauge rainfall</option>
                  <option value="collection">Collected water</option>
                  <option value="overflow">Overflow volume</option>
                  <option value="first_flush">First-flush diversion</option>
                  <option value="maintenance">System maintenance</option>
                </select>
              </Field>
              <Field label="Reliability">
                <select name="reliability" defaultValue="measured">
                  <option value="measured">Actual measurement</option>
                  <option value="estimated">User estimate</option>
                </select>
              </Field>
              {kind !== 'maintenance' && (
                <Field label={`Recorded amount (${kind === 'rainfall' ? 'mm' : 'L'})`}>
                  <input
                    name="value"
                    type="number"
                    min={0}
                    max={kind === 'storage' ? property?.tank_capacity_l : undefined}
                    step="any"
                    required
                  />
                </Field>
              )}
              <Field label="Record / reading date & time">
                <input name="measured_at" type="datetime-local" defaultValue={localInput()} required />
              </Field>
              {interval && (
                <>
                  <Field label="Measurement interval start">
                    <input name="interval_start" type="datetime-local" required />
                  </Field>
                  <Field label="Measurement interval end">
                    <input name="interval_end" type="datetime-local" required />
                  </Field>
                </>
              )}
            </div>
            <Field label="Measurement method">
              <input
                name="method"
                required
                maxLength={160}
                placeholder="Rain gauge, calibrated level sensor, flow meter, maintenance log…"
              />
            </Field>
            <Field label="Notes and conditions">
              <textarea
                name="notes"
                rows={3}
                required={kind === 'maintenance'}
                maxLength={3000}
                placeholder="Measurement evidence, consumption during interval, transfers, system conditions…"
              />
            </Field>
            <InputError error={error} />
            {success && (
              <Notice tone="success">
                Observation saved. The history below contains the actual registered record.
              </Notice>
            )}
            <Button loading={busy} type="submit">
              <Plus size={17} />
              Save field observation
            </Button>
          </form>
        </Section>
        <div className="form-stack">
          <Section title="Measure the right quantity">
            <div className="measurement-guide">
              <div>
                <Gauge size={22} />
                <h3>Tank level is one observation.</h3>
                <p>
                  A rise alone does not establish collected volume if water was consumed, transferred or lost
                  during the interval.
                </p>
              </div>
              <div>
                <CloudRain size={22} />
                <h3>Rainfall needs a rain measurement.</h3>
                <p>Record a gauge and its interval. Provider forecasts are stored separately.</p>
              </div>
              <div>
                <ShieldCheck size={22} />
                <h3>Reliable alignment enables learning.</h3>
                <p>
                  Enough trustworthy, matching observations are needed before collection efficiency can be
                  calibrated.
                </p>
              </div>
            </div>
          </Section>
          <Link to="/calibration" className="button secondary">
            Inspect performance history
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
      <Section title="Registered observation history" subtitle="No synthetic records are added.">
        {history.loading ? (
          <Loading />
        ) : history.error ? (
          <ErrorState error={history.error} retry={history.reload} />
        ) : history.data?.observations?.length ? (
          <ObservationTable observations={history.data.observations} timezone={property?.timezone} />
        ) : (
          <Empty
            title="No field observations yet"
            description="Your first saved reading will appear here with its measurement method and reliability."
          />
        )}
      </Section>
    </>
  )
}
function ObservationTable({ observations, timezone }: { observations: Observation[]; timezone?: string }) {
  return (
    <DataTable headings={['Type', 'Amount', 'Recorded at', 'Reliability', 'Method', 'Notes']}>
      {observations.map((item) => (
        <tr key={item.id}>
          <td>{humanise(item.kind)}</td>
          <td>{item.unit === 'note' ? 'Maintenance note' : `${number(item.value, 2)} ${item.unit}`}</td>
          <td>
            {date(item.measured_at, timezone)}
            {item.interval_start && (
              <small>
                From {date(item.interval_start, timezone)}
                <br />
                to {date(item.interval_end, timezone)}
              </small>
            )}
          </td>
          <td>
            <Chip tone={item.reliability === 'measured' ? 'green' : 'amber'}>
              {humanise(item.reliability)}
            </Chip>
          </td>
          <td>{item.method}</td>
          <td>{item.notes}</td>
        </tr>
      ))}
    </DataTable>
  )
}
function CalibrationPage() {
  const { property } = useWorkspace()
  const result = useApi<Calibration>(property ? `/calibration/${property.id}` : null)
  return (
    <>
      <PageTitle
        eyebrow="PROPERTY PERFORMANCE HISTORY"
        title="Learn from what actually happened."
        description={`${property?.name} · Forecast accuracy and collection performance need matching, reliable field observations.`}
        action={
          <Button variant="secondary" onClick={result.reload}>
            <RefreshCw size={16} />
            Refresh history
          </Button>
        }
      />
      {result.loading && <Loading />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      {result.data && (
        <>
          <div className="metrics-grid three">
            <Metric
              label="Registered field records"
              value={number(result.data.observations.length)}
              detail="Genuine user records only"
            />
            <Metric
              label="Measured records"
              value={number(
                result.data.observations.filter((item) => item.reliability === 'measured').length,
              )}
              detail="Estimates remain separate"
            />
            <Metric label="Learning basis" value="Field evidence" detail="No model training is claimed" />
          </div>
          <Notice title="Calibration eligibility">
            Efficiency is adjusted only after sufficient reliable, aligned observations. A manually changed
            coefficient is not a trained AI model.
          </Notice>
          <Section title="Eligibility and data quality">
            <Evidence title="Eligibility assessment" value={result.data.eligibility} />
            <Evidence title="Forecast versus measured performance" value={result.data.accuracy} />
            <Evidence title="Calibration history" value={result.data.records} />
            <Evidence title="Known limitations" value={result.data.limitations} />
          </Section>
          <Section title="Observation evidence">
            {result.data.observations.length ? (
              <ObservationTable observations={result.data.observations} timezone={property?.timezone} />
            ) : (
              <Empty
                title="Measurement history starts in the field"
                description="Record actual rainfall, collection and tank readings before interpreting accuracy."
                to="/observations"
                action="Record a field observation"
              />
            )}
          </Section>
        </>
      )}
      <Link className="button secondary" to="/observations">
        <Plus size={16} />
        Add actual observation
      </Link>
    </>
  )
}
interface AssistantReply {
  answer: string
  mode: 'deterministic' | 'ai_gateway'
  sources: unknown
  limitations: unknown
}
interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  reply?: AssistantReply
}
function AssistantPage() {
  const { property } = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!input.trim() || busy) return
    const question = input.trim()
    setMessages((current) => [...current, { role: 'user', text: question }])
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const reply = await post<AssistantReply>('/assistant/chat', {
        property_id: property?.id,
        message: question,
      })
      setMessages((current) => [...current, { role: 'assistant', text: reply.answer, reply }])
    } catch (error) {
      setError((error as Error).message)
      setInput(question)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GROUNDED WATER ASSISTANT"
        title="Ask about your water."
        description={
          property
            ? `${property.name} · Answers retrieve authorised property inputs and backend calculation results.`
            : 'Select a registered property for specific answers, or ask about available workspace information.'
        }
      />
      <div className="assistant-layout">
        <section className="panel chat-panel">
          <div className="chat-context">
            <span className="assistant-avatar">
              <Bot size={23} />
            </span>
            <div>
              <strong>VARSHIQ water assistant</strong>
              <span>Calculations come from deterministic backend services.</span>
            </div>
            <Chip tone="blue">Grounded context</Chip>
          </div>
          <div className="chat-messages" aria-live="polite">
            {!messages.length && (
              <div className="chat-empty">
                <MessageSquare size={38} />
                <h2>Start with a real water question.</h2>
                <p>Answers identify missing measurements and available evidence.</p>
                <div className="suggested-prompts">
                  {[
                    'How much could this roof collect tomorrow?',
                    'Will my tank overflow?',
                    'Which inputs still need verification?',
                    'Explain the storage recommendation.',
                  ].map((prompt) => (
                    <button key={prompt} onClick={() => setInput(prompt)}>
                      {prompt}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                <span className="message-avatar">
                  {message.role === 'assistant' ? <Bot size={18} /> : 'You'}
                </span>
                <div>
                  <p>{message.text}</p>
                  {message.reply && (
                    <>
                      <Chip tone="blue">
                        {message.reply.mode === 'ai_gateway'
                          ? 'AI explanation · backend grounded'
                          : 'Deterministic explanation'}
                      </Chip>
                      <Evidence title="Retrieved sources" value={message.reply.sources} />
                      <Evidence title="Answer limitations" value={message.reply.limitations} />
                    </>
                  )}
                </div>
              </div>
            ))}
            {busy && <Loading text="Retrieving authorised water intelligence…" />}
          </div>
          <InputError error={error} />
          <form className="chat-input" onSubmit={send}>
            <label className="sr-only" htmlFor="assistant-message">
              Message to water assistant
            </label>
            <textarea
              id="assistant-message"
              rows={2}
              maxLength={2000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about forecasts, storage or missing inputs…"
              required
            />
            <Button loading={busy} type="submit" aria-label="Send message">
              <Send size={18} />
              <span className="send-label">Send</span>
            </Button>
          </form>
        </section>
        <aside className="assistant-sidebar">
          <Section title="How answers are grounded">
            <div className="measurement-guide">
              <div>
                <BuildingIcon />
                <h3>Authorised property context</h3>
                <p>Only property information you can access is retrieved.</p>
              </div>
              <div>
                <Gauge size={21} />
                <h3>Backend calculations</h3>
                <p>Rainfall, catchment, inflow and storage results come from the application services.</p>
              </div>
              <div>
                <ShieldCheck size={21} />
                <h3>Transparent limitations</h3>
                <p>Missing measurements stay missing. AI can be disconnected while core tools operate.</p>
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </>
  )
}
function BuildingIcon() {
  return <Building2 size={21} />
}
function ReportPage() {
  const { property, properties, notify } = useWorkspace()
  const reports = useApi<Report[]>('/reports')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function generate() {
    setBusy(true)
    setError(null)
    try {
      await post('/reports', { property_id: property?.id })
      reports.reload()
      notify('Property assessment report created with available inputs, results and provenance.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="DOWNLOADABLE ASSESSMENTS"
        title="A report with its evidence attached."
        description="Export property inputs, forecast snapshots, calculations, assumptions and material limitations."
        action={
          <Button loading={busy} disabled={!property} onClick={generate}>
            <FileText size={17} />
            Create property assessment
          </Button>
        }
      />
      <InputError error={error} />
      {!property && <Notice>Select or register a property before generating its assessment.</Notice>}
      <Section title="Private property reports" subtitle="Downloads require your authorised session.">
        {reports.loading ? (
          <Loading />
        ) : reports.error ? (
          <ErrorState error={reports.error} retry={reports.reload} />
        ) : reports.data?.length ? (
          <DataTable headings={['Property', 'Created', 'Report', 'Downloads']}>
            {reports.data.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>
                    {report.property_name ??
                      properties.find((item) => item.id === report.property_id)?.name ??
                      report.property_id}
                  </strong>
                </td>
                <td>
                  {date(
                    report.created_at,
                    properties.find((item) => item.id === report.property_id)?.timezone,
                  )}
                </td>
                <td>
                  <Chip tone="blue">Assessment</Chip>
                </td>
                <td>
                  <div className="inline-actions">
                    <a
                      className="button secondary small"
                      href={`/api/v1/reports/${report.id}/download?format=pdf`}
                      download
                    >
                      <Download size={14} />
                      PDF
                    </a>
                    <a
                      className="button ghost small"
                      href={`/api/v1/reports/${report.id}/download?format=html`}
                      download
                    >
                      <Download size={14} />
                      HTML
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty
            title="No assessments generated yet"
            description="Create a report for the selected property. Missing inputs and unavailable results will be explicitly recorded."
          />
        )}
      </Section>
      <Notice title="For field and engineering review">
        Forecast collection is potential water, not an actual harvesting record. Recharge and structural
        recommendations need the appropriate professional assessment.
      </Notice>
      <Link className="text-link" to="/community">
        Review locality-level property comparison
        <ArrowRight size={15} />
      </Link>
    </>
  )
}
type SourceResponse = Source[] | { sources?: Source[]; providers?: Source[] }
function SourcesPage() {
  const result = useApi<SourceResponse>('/data-sources/status')
  const sources = Array.isArray(result.data)
    ? result.data
    : (result.data?.sources ?? result.data?.providers ?? [])
  return (
    <>
      <PageTitle
        eyebrow="TRANSPARENT DATA PROVIDERS"
        title="Know where the information comes from."
        description="Provider availability, configuration and usage conditions are visible. Missing connections stay explicit."
        action={
          <Button variant="secondary" onClick={result.reload}>
            <RefreshCw size={16} />
            Refresh source status
          </Button>
        }
      />
      {result.loading && <Loading text="Checking configured data-source status…" />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      <div className="source-grid">
        {sources.map((source, index) => {
          const name = source.name ?? source.provider ?? source.id ?? `Provider ${index + 1}`
          const connected = ['connected', 'healthy', 'ok'].includes(source.status)
          return (
            <article className="source-card" key={`${name}-${index}`}>
              <div className="source-card-head">
                <span className="source-icon">
                  <CloudRain size={23} />
                </span>
                <Chip tone={connected ? 'green' : 'amber'}>{humanise(source.status)}</Chip>
              </div>
              <h2>{humanise(name)}</h2>
              <p>
                {source.message ??
                  source.detail ??
                  'Inspect the source details for configuration and access requirements.'}
              </p>
              {source.last_success && <small>Last successful retrieval: {date(source.last_success)}</small>}
              <Evidence title="Provider details & provenance" value={source} />
            </article>
          )
        })}
      </div>
      {!sources.length && result.data && (
        <Notice>No provider entries were returned. Check backend provider configuration.</Notice>
      )}
      <Notice title="Data and access conditions">
        Code licences and dataset licences are separate. IMD observations, Microsoft footprints, OpenStreetMap
        data and optional geospatial services retain their own access, attribution and redistribution
        conditions.
      </Notice>
    </>
  )
}
interface SettingsResponse {
  role?: string
  settings?: Record<string, unknown>
  [key: string]: unknown
}
function SettingsPage() {
  const { user, notify } = useWorkspace()
  const settings = useApi<SettingsResponse>('/admin/settings')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const admin = user?.role === 'admin'
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    try {
      await patch('/admin/settings', {
        pilot_locality: values.get('pilot_locality'),
        pilot_timezone: values.get('pilot_timezone'),
        pilot_latitude: Number(values.get('pilot_latitude')),
        pilot_longitude: Number(values.get('pilot_longitude')),
      })
      settings.reload()
      notify('Allowed pilot settings updated.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE & ADMINISTRATION"
        title="Keep the pilot configurable."
        description="Account access, source configuration and allowed administrative settings."
      />
      <div className="two-column">
        <Section title="Your account">
          <div className="account-profile">
            <span className="avatar large">{user?.name.charAt(0)}</span>
            <div>
              <h2>{user?.name}</h2>
              <p>{user?.email}</p>
              <Chip tone="blue">{humanise(user?.role ?? '')}</Chip>
            </div>
          </div>
          <Notice title="Private by default">
            Property records are scoped to their organisation. Municipal sharing is an explicit property-level
            choice.
          </Notice>
          <Link className="button secondary" to="/property">
            Review property sharing
          </Link>
        </Section>
        <Section
          title="Administrative pilot settings"
          subtitle="Administrative changes require an administrator role."
        >
          {!admin && (
            <Notice tone="warning" title="Administrator access required">
              Your account can manage its properties. Pilot-wide provider and deployment settings are
              restricted to authorised administrators.
            </Notice>
          )}
          {settings.loading && <Loading />}
          {settings.error && <ErrorState error={settings.error} retry={settings.reload} />}
          {admin && settings.data && (
            <form key={JSON.stringify(settings.data)} onSubmit={save} className="form-stack">
              <Field label="Default pilot locality">
                <input
                  name="pilot_locality"
                  required
                  defaultValue={String(settings.data.pilot_locality ?? '')}
                />
              </Field>
              <Field label="Default reporting timezone">
                <input
                  name="pilot_timezone"
                  required
                  defaultValue={String(settings.data.pilot_timezone ?? '')}
                />
              </Field>
              <div className="form-grid">
                <Field label="Pilot map latitude">
                  <input
                    name="pilot_latitude"
                    required
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    defaultValue={String(settings.data.pilot_latitude ?? '')}
                  />
                </Field>
                <Field label="Pilot map longitude">
                  <input
                    name="pilot_longitude"
                    required
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    defaultValue={String(settings.data.pilot_longitude ?? '')}
                  />
                </Field>
              </div>
              <InputError error={error} />
              <Button loading={busy} type="submit">
                <Settings size={16} />
                Save allowed settings
              </Button>
            </form>
          )}
        </Section>
      </div>
      {settings.data && <Evidence title="Non-secret runtime configuration" value={settings.data} />}
      <Section title="Provider credentials">
        <Notice>
          API credentials are configured on the server through deployment environment variables. They are
          never collected into or displayed by the frontend.
        </Notice>
        <Link className="text-link" to="/sources">
          Inspect provider connection status
          <ArrowRight size={16} />
        </Link>
      </Section>
    </>
  )
}
