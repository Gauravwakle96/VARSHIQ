import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Beaker, ClipboardCheck, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { post, useApi } from '../api'
import { useWorkspace } from '../context'
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
import { WeatherAttribution } from './Weather'

type Mode = 'sources' | 'consumption' | 'maintenance' | 'quality' | 'budget' | 'groundwater'
interface WaterRecord {
  id: string
  source_type?: string
  use_type?: string
  volume_l: number
  interval_start: string
  interval_end: string
  method: string
  reliability: string
  notes: string
}
interface WaterLedger {
  sources: WaterRecord[]
  consumption: WaterRecord[]
  totals: { supply_l: number; consumption_l: number }
  by_source: Record<string, number>
  by_use: Record<string, number>
  period_start: string
  limitations: string[]
}
interface MaintenanceRecord {
  id: string
  task: string
  performed_at: string
  condition: string
  notes: string
  next_due_at?: string
}
interface ReadinessCheck {
  task: string
  title: string
  status: string
  last_performed_at?: string
  next_due_at?: string
}
interface MaintenanceAlert {
  code: string
  title: string
  status: string
  message: string
  [key: string]: unknown
}
interface PreparationForecast {
  expected_inflow_l: number
  available_capacity_l: number
  potential_overflow_l: number
  actions: unknown[]
  status: string
  limitations: string[]
}
interface Maintenance {
  records: MaintenanceRecord[]
  alerts: MaintenanceAlert[]
  readiness: {
    checks: ReadinessCheck[]
    limitations: string[]
    forecast: PreparationForecast | null
    available_capacity_l: number
    storage_status: string
  }
}
interface QualityRecord {
  id: string
  tested_at: string
  ph?: number | null
  tds_mg_l?: number | null
  turbidity_ntu?: number | null
  laboratory: string
  method: string
  treatment_status: string
  notes: string
}
interface Quality {
  records: QualityRecord[]
  limitations: string[]
}
interface Groundwater {
  groundwater: unknown[]
  soil: unknown[]
  status: string
  limitations: string[]
}
const localInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const sources = ['municipal', 'rainwater', 'borewell', 'tanker', 'greywater']
const uses = ['drinking_cooking', 'cleaning', 'gardening', 'toilets', 'commercial', 'industrial', 'other']

export default function OperationsPages({ mode }: { mode: Mode }) {
  const { property } = useWorkspace()
  if (mode === 'budget') return <BudgetPage />
  if (!property)
    return (
      <>
        <PageTitle
          eyebrow="PROPERTY WATER OPERATIONS"
          title={mode === 'sources' ? 'Water sources' : humanise(mode)}
          description="Select a genuine property to record its water information."
        />
        <PropertyNeeded property={null} />
      </>
    )
  if (mode === 'sources' || mode === 'consumption')
    return <WaterLedgerPage key={`${property.id}-${mode}`} consumption={mode === 'consumption'} />
  if (mode === 'maintenance') return <MaintenancePage key={property.id} />
  if (mode === 'quality') return <QualityPage key={property.id} />
  return <GroundwaterPage key={property.id} />
}
function WaterLedgerPage({ consumption }: { consumption: boolean }) {
  const { property, notify } = useWorkspace()
  const [days, setDays] = useState(30)
  const result = useApi<WaterLedger>(`/water-sources/${property?.id}?days=${days}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    const payload = {
      property_id: property?.id,
      volume_l: Number(values.get('volume_l')),
      interval_start: new Date(String(values.get('interval_start'))).toISOString(),
      interval_end: new Date(String(values.get('interval_end'))).toISOString(),
      method: values.get('method'),
      reliability: values.get('reliability'),
      notes: values.get('notes'),
      ...(consumption
        ? {
            use_type: values.get('use_type'),
            ...(values.get('source_type') ? { source_type: values.get('source_type') } : {}),
          }
        : { source_type: values.get('source_type') }),
    }
    try {
      await post(consumption ? '/consumption/records' : '/water-sources/records', payload)
      result.reload()
      notify(
        `${consumption ? 'Consumption' : 'Water source'} record saved with its measurement interval and method.`,
      )
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const records = consumption ? (result.data?.consumption ?? []) : (result.data?.sources ?? [])
  const distribution = consumption ? result.data?.by_use : result.data?.by_source
  const chart = Object.entries(distribution ?? {}).map(([name, volume]) => ({
    name: humanise(name),
    volume_l: volume,
  }))
  return (
    <>
      <PageTitle
        eyebrow="ACTUAL WATER LEDGER"
        title={consumption ? 'Understand where water is used.' : 'Know where your water comes from.'}
        description={`${property?.name} · Record measured or clearly labelled estimated volumes over actual past intervals.`}
        action={
          <Button variant="secondary" onClick={result.reload}>
            <RefreshCw size={16} />
            Refresh records
          </Button>
        }
      />
      <div className="filter-bar">
        <Field label="Reporting period">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </Field>
        <Link className="text-link" to={consumption ? '/water-sources' : '/consumption'}>
          {consumption ? 'Review supply sources' : 'Review consumption'}
        </Link>
      </div>
      {result.loading && <Loading />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      {result.data && (
        <div className="metrics-grid three">
          <Metric
            label="Recorded supply"
            value={number(result.data.totals.supply_l)}
            unit="L"
            detail={`User records · ${days}-day reporting window`}
          />
          <Metric
            label="Recorded consumption"
            value={number(result.data.totals.consumption_l)}
            unit="L"
            detail="Measured and estimated records stay labelled"
          />
          <Metric
            label={consumption ? 'Consumption records' : 'Supply records'}
            value={number(records.length)}
            detail="Actual registered records only"
          />
        </div>
      )}
      <div className="two-column">
        <Section
          title={consumption ? 'Record consumption' : 'Record water supplied'}
          subtitle="Save one actual interval; do not enter a forecast as supplied or consumed water."
        >
          <form onSubmit={save} className="form-stack">
            <div className="form-grid">
              {consumption && (
                <Field label="Water use">
                  <select name="use_type">
                    {uses.map((use) => (
                      <option value={use} key={use}>
                        {humanise(use)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label={consumption ? 'Supply source (optional)' : 'Water source'}>
                <select name="source_type">
                  {consumption && <option value="">Source not established</option>}
                  {sources.map((source) => (
                    <option value={source} key={source}>
                      {humanise(source)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Volume (L)">
                <input name="volume_l" type="number" min={0} step="any" required />
              </Field>
              <Field label="Reliability">
                <select name="reliability">
                  <option value="measured">Actual measurement</option>
                  <option value="estimated">User estimate</option>
                </select>
              </Field>
              <Field label="Interval start">
                <input type="datetime-local" name="interval_start" required max={localInput()} />
              </Field>
              <Field label="Interval end">
                <input type="datetime-local" name="interval_end" required max={localInput()} />
              </Field>
            </div>
            <Field label="Measurement method">
              <input
                name="method"
                required
                maxLength={160}
                placeholder="Meter reading, tanker receipt, flow measurement, recorded estimate…"
              />
            </Field>
            <Field label="Evidence / conditions">
              <textarea
                name="notes"
                rows={3}
                maxLength={3000}
                placeholder="Meter identifiers, receipt reference, transfers, measurement limits…"
              />
            </Field>
            <InputError error={error} />
            <Button loading={busy} type="submit">
              <Plus size={16} />
              Save {consumption ? 'consumption' : 'supply'} record
            </Button>
          </form>
        </Section>
        <div className="form-stack">
          <Section
            title={consumption ? 'Recorded water use' : 'Recorded supply mix'}
            subtitle="Only volumes returned by the ledger are charted."
          >
            {chart.length ? (
              <div
                className="chart"
                role="img"
                aria-label="Recorded water volume by category. Exact recorded entries appear in the ledger below."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ right: 12, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e7ece8" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis unit=" L" width={65} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => [`${number(Number(value))} L`, 'Recorded volume']} />
                    <Bar
                      dataKey="volume_l"
                      fill={consumption ? '#557fa5' : '#148877'}
                      radius={[5, 5, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="No category totals yet"
                description="Save an actual record to establish your source or consumption history."
              />
            )}
          </Section>
          <Notice title="Demand modelling remains explicit">
            Ledger entries describe recorded intervals. WaterTwin uses the property's declared daily demand
            until a documented demand input is updated; supply totals do not establish potable quality.
          </Notice>
        </div>
      </div>
      <Section
        title={consumption ? 'Consumption ledger' : 'Supply ledger'}
        subtitle="Intervals, evidence and reliability are retained."
      >
        {result.loading ? (
          <Loading text="Loading actual ledger records…" />
        ) : result.error ? (
          <Notice tone="warning">
            Ledger history is unavailable. Retry the source request to inspect existing records.
          </Notice>
        ) : records.length ? (
          <DataTable
            headings={[
              consumption ? 'Use / source' : 'Source',
              'Volume',
              'Measurement interval',
              'Reliability',
              'Method',
              'Notes',
            ]}
          >
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  {humanise(record.use_type ?? record.source_type ?? 'unknown')}
                  {record.use_type && record.source_type && <small>{humanise(record.source_type)}</small>}
                </td>
                <td>{number(record.volume_l, 1)} L</td>
                <td>
                  {date(record.interval_start, property?.timezone)}
                  <small>to {date(record.interval_end, property?.timezone)}</small>
                </td>
                <td>
                  <Chip tone={record.reliability === 'measured' ? 'green' : 'amber'}>
                    {humanise(record.reliability)}
                  </Chip>
                </td>
                <td>{record.method}</td>
                <td>{record.notes}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty
            title="No records in this period"
            description="Widen the reporting period or record actual measured information."
          />
        )}
      </Section>
      {result.data && (
        <Evidence
          title="Ledger period & limitations"
          value={{ period_start: result.data.period_start, limitations: result.data.limitations }}
        />
      )}
    </>
  )
}
function MaintenancePage() {
  const { property, notify } = useWorkspace()
  const result = useApi<Maintenance>(`/maintenance/${property?.id}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [task, setTask] = useState('roof_cleaning')
  const tasks = [
    'roof_cleaning',
    'drain_cleaning',
    'filter_cleaning',
    'tank_cleaning',
    'pipe_inspection',
    'first_flush',
    'overflow_inspection',
  ]
  function recordTask(nextTask: string) {
    if (tasks.includes(nextTask)) setTask(nextTask)
    document
      .getElementById('maintenance-record')
      ?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    document.querySelector<HTMLSelectElement>('#maintenance-record select[name="task"]')?.focus()
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    try {
      await post('/maintenance/records', {
        property_id: property?.id,
        task: values.get('task'),
        performed_at: new Date(String(values.get('performed_at'))).toISOString(),
        condition: values.get('condition'),
        notes: values.get('notes'),
        ...(values.get('next_due_at')
          ? { next_due_at: new Date(String(values.get('next_due_at'))).toISOString() }
          : {}),
      })
      result.reload()
      notify('Maintenance record saved with the actual task date and condition.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="RAIN-TO-ACTION OPERATIONS"
        title="Prepare the system before the rain."
        description={`${property?.name} · Document maintenance and inspect readiness against recorded evidence.`}
        action={
          <Button variant="secondary" onClick={result.reload}>
            <RefreshCw size={16} />
            Refresh readiness
          </Button>
        }
      />
      {result.loading && <Loading />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      <div className="two-column">
        <Section
          title="Record performed maintenance"
          subtitle="Record work that has actually happened; use the due date for future scheduling."
        >
          <form id="maintenance-record" onSubmit={save} className="form-stack">
            <div className="form-grid">
              <Field label="Task">
                <select name="task" value={task} onChange={(event) => setTask(event.target.value)}>
                  {tasks.map((value) => (
                    <option key={value} value={value}>
                      {humanise(value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Observed condition">
                <select name="condition" defaultValue="unknown">
                  <option value="good">Good</option>
                  <option value="needs_attention">Needs attention</option>
                  <option value="unknown">Unknown / not established</option>
                </select>
              </Field>
              <Field label="Performed at">
                <input
                  name="performed_at"
                  type="datetime-local"
                  required
                  defaultValue={localInput()}
                  max={localInput()}
                />
              </Field>
              <Field label="Next due at (optional)">
                <input name="next_due_at" type="datetime-local" />
              </Field>
            </div>
            <Field label="Work and evidence note">
              <textarea
                name="notes"
                rows={4}
                required
                maxLength={2000}
                placeholder="What was checked or cleaned, person responsible and observed problems…"
              />
            </Field>
            <InputError error={error} />
            <Button type="submit" loading={busy}>
              <ClipboardCheck size={17} />
              Save performed task
            </Button>
          </form>
        </Section>
        <Section
          title="Readiness and due alerts"
          subtitle="Missing inspections remain unknown; no automatic field verification is claimed."
        >
          {result.data ? (
            <>
              <div className="maintenance-checklist">
                {result.data.readiness.checks.map((check) => (
                  <div className="maintenance-check" key={check.task}>
                    <div>
                      <h3>{check.title}</h3>
                      <Chip tone={check.status === 'recorded_good' ? 'green' : 'amber'}>
                        {check.status === 'recorded_good'
                          ? 'Good condition recorded'
                          : check.status === 'unknown'
                            ? 'Not established'
                            : humanise(check.status)}
                      </Chip>
                      <p>Last performed: {date(check.last_performed_at, property?.timezone)}</p>
                      {check.next_due_at && <p>Next due: {date(check.next_due_at, property?.timezone)}</p>}
                    </div>
                    <Button type="button" variant="ghost" onClick={() => recordTask(check.task)}>
                      Record task
                    </Button>
                  </div>
                ))}
              </div>
              {result.data.alerts.map((alert) => (
                <Notice
                  key={alert.code}
                  title={alert.title}
                  tone={alert.status === 'recorded_good' ? 'info' : 'warning'}
                >
                  {alert.message}
                  <Evidence title="Alert evidence" value={alert} />
                </Notice>
              ))}
              <Evidence title="Readiness limitations" value={result.data.readiness.limitations} />
            </>
          ) : (
            <Notice>Load your maintenance records to review available readiness evidence.</Notice>
          )}
          <Link to="/twin" className="button secondary">
            Inspect forecast and overflow
          </Link>
        </Section>
      </div>
      {result.data && (
        <Section
          title="Prepare for the forecast rain"
          subtitle="Forecast estimates remain separate from maintenance observations."
        >
          {result.data.readiness.forecast ? (
            <>
              <div className="metrics-grid three">
                <Metric
                  label="Expected harvestable inflow"
                  value={number(result.data.readiness.forecast.expected_inflow_l)}
                  unit="L"
                  detail="Forecast model estimate"
                />
                <Metric
                  label="Available tank capacity"
                  value={number(result.data.readiness.forecast.available_capacity_l)}
                  unit="L"
                  detail={`${result.data.readiness.storage_status} storage input`}
                />
                <Metric
                  label="Potential overflow"
                  value={number(result.data.readiness.forecast.potential_overflow_l)}
                  unit="L"
                  detail="Inspect safe overflow routing"
                />
              </div>
              <PreparationActions actions={result.data.readiness.forecast.actions} />
              <Evidence
                title="Forecast preparation limitations"
                value={result.data.readiness.forecast.limitations}
              />
            </>
          ) : (
            <Notice title="No forecast preparation estimate available">
              Run WaterTwin for this registered property to connect its latest forecast with available
              storage.
              <div>
                <Link to="/twin" className="button secondary">
                  Run property WaterTwin
                </Link>
              </div>
            </Notice>
          )}
        </Section>
      )}
      <Section title="Maintenance history">
        {result.loading ? (
          <Loading text="Loading performed maintenance…" />
        ) : result.error ? (
          <Notice tone="warning">
            Maintenance history is unavailable. Existing inspection status cannot be established until the
            records load.
          </Notice>
        ) : result.data?.records.length ? (
          <DataTable headings={['Task', 'Performed', 'Condition', 'Next due', 'Notes']}>
            {result.data.records.map((record) => (
              <tr key={record.id}>
                <td>{humanise(record.task)}</td>
                <td>{date(record.performed_at, property?.timezone)}</td>
                <td>
                  <Chip tone={record.condition === 'good' ? 'green' : 'amber'}>
                    {humanise(record.condition)}
                  </Chip>
                </td>
                <td>{date(record.next_due_at, property?.timezone)}</td>
                <td>{record.notes}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Empty
            title="No maintenance history recorded"
            description="A missing record is not evidence that the system has been checked."
          />
        )}
      </Section>
    </>
  )
}
function PreparationActions({ actions }: { actions: unknown[] }) {
  return (
    <ul className="preparation-actions">
      {actions.map((action, index) => {
        const details = action && typeof action === 'object' ? (action as Record<string, unknown>) : null
        const text =
          typeof action === 'string' ? action : (details?.title ?? details?.message ?? details?.action)
        return (
          <li key={index}>
            <ClipboardCheck size={16} />
            {typeof text === 'string' ? (
              <span>{text}</span>
            ) : (
              <Evidence title="Preparation action details" value={action} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
function QualityPage() {
  const { property, notify } = useWorkspace()
  const result = useApi<Quality>(`/water-quality/${property?.id}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    const numeric = (key: string) => (values.get(key) === '' ? {} : { [key]: Number(values.get(key)) })
    if (['ph', 'tds_mg_l', 'turbidity_ntu'].every((key) => values.get(key) === '')) {
      setError('Record at least one actual measured parameter.')
      setBusy(false)
      return
    }
    try {
      await post('/water-quality/records', {
        property_id: property?.id,
        tested_at: new Date(String(values.get('tested_at'))).toISOString(),
        ...numeric('ph'),
        ...numeric('tds_mg_l'),
        ...numeric('turbidity_ntu'),
        laboratory: values.get('laboratory'),
        method: values.get('method'),
        treatment_status: values.get('treatment_status'),
        notes: values.get('notes'),
      })
      result.reload()
      notify('Measured water-quality record saved. This does not certify drinking-water suitability.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="MEASURED WATER QUALITY"
        title="Record tests. Keep suitability explicit."
        description={`${property?.name} · Laboratory or field test records with their method, time and treatment context.`}
      />
      <Notice title="A few parameters do not establish drinking safety" tone="warning">
        pH, TDS and turbidity alone cannot establish microbiological or chemical safety. These records are not
        a drinking-water certification. Intended use, treatment and appropriate professional testing remain
        necessary.
      </Notice>
      <div className="two-column">
        <Section
          title="Record measured parameters"
          subtitle="Leave unmeasured parameters blank. At least one measurement is required."
        >
          <form onSubmit={save} className="form-stack">
            <div className="form-grid">
              <Field label="Tested at">
                <input
                  name="tested_at"
                  type="datetime-local"
                  required
                  defaultValue={localInput()}
                  max={localInput()}
                />
              </Field>
              <Field label="pH">
                <input name="ph" type="number" min={0} max={14} step="any" placeholder="Not measured" />
              </Field>
              <Field label="TDS (mg/L)">
                <input name="tds_mg_l" type="number" min={0} step="any" placeholder="Not measured" />
              </Field>
              <Field label="Turbidity (NTU)">
                <input name="turbidity_ntu" type="number" min={0} step="any" placeholder="Not measured" />
              </Field>
            </div>
            <Field label="Laboratory / test provider">
              <input
                name="laboratory"
                required
                maxLength={160}
                placeholder="Actual lab or field test operator"
              />
            </Field>
            <Field label="Test method">
              <input
                name="method"
                required
                maxLength={160}
                placeholder="Instrument, protocol and sampling method"
              />
            </Field>
            <Field label="Treatment status">
              <input
                name="treatment_status"
                required
                maxLength={160}
                placeholder="Treatment performed, raw sample, or unknown"
              />
            </Field>
            <Field label="Sample and test notes">
              <textarea
                name="notes"
                rows={3}
                maxLength={3000}
                placeholder="Sample location, collection time, report reference and limitations…"
              />
            </Field>
            <InputError error={error} />
            <Button loading={busy} type="submit">
              <Beaker size={17} />
              Save actual test record
            </Button>
          </form>
        </Section>
        <Section title="Test history" subtitle="Units and missing measurements are retained.">
          {result.loading ? (
            <Loading />
          ) : result.error ? (
            <ErrorState error={result.error} retry={result.reload} />
          ) : result.data?.records.length ? (
            <DataTable headings={['Test date', 'pH', 'TDS', 'Turbidity', 'Provider / method']}>
              {result.data.records.map((record) => (
                <tr key={record.id}>
                  <td>{date(record.tested_at, property?.timezone)}</td>
                  <td>{number(record.ph, 2)}</td>
                  <td>{number(record.tds_mg_l, 1)} mg/L</td>
                  <td>{number(record.turbidity_ntu, 2)} NTU</td>
                  <td>
                    {record.laboratory}
                    <small>{record.method}</small>
                    <small>{record.treatment_status}</small>
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <Empty
              title="Water quality has not been established"
              description="No actual test records are registered yet. Unknown quality remains unknown."
            />
          )}
          {result.data && <Evidence title="Testing limitations" value={result.data.limitations} />}
        </Section>
      </div>
    </>
  )
}
function GroundwaterPage() {
  const { property } = useWorkspace()
  const result = useApi<Groundwater>(`/groundwater/${property?.id}`)
  return (
    <>
      <PageTitle
        eyebrow="GROUNDWATER & SOIL EVIDENCE"
        title="Screen recharge with real evidence."
        description={`${property?.name} · Source coverage, date, resolution and verification remain visible.`}
        action={
          <Button variant="secondary" onClick={result.reload}>
            <RefreshCw size={16} />
            Refresh source records
          </Button>
        }
      />
      {result.loading && <Loading />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      {result.data && (
        <>
          <Notice title={humanise(result.data.status)} tone="warning">
            Recharge suitability requires appropriate soil, groundwater, contamination and field-engineering
            evidence. Satellite imagery alone cannot establish aquifer suitability.
          </Notice>
          <div className="two-column">
            <Section title="Groundwater evidence">
              {result.data.groundwater.length ? (
                <Evidence title="Government / verified source records" value={result.data.groundwater} />
              ) : (
                <Empty
                  title="No groundwater record available"
                  description="No aquifer, depth or suitability value is invented when source evidence is missing."
                />
              )}
            </Section>
            <Section title="Soil evidence">
              {result.data.soil.length ? (
                <Evidence title="Soil source records" value={result.data.soil} />
              ) : (
                <Empty
                  title="Soil suitability is unverified"
                  description="A professional field assessment is required before recharge design."
                />
              )}
            </Section>
          </div>
          <Evidence title="Coverage & engineering limitations" value={result.data.limitations} />
        </>
      )}
    </>
  )
}
interface BudgetOption {
  key: string
  property_id: string
  capacity_l: string
  cost_inr: string
  quote_source: string
  installation_space_confirmed: boolean
}
interface Investment {
  property_id: string
  property_name?: string
  capacity_l?: number
  cost_inr?: number
  period_benefit_l?: number
  annualised_benefit_l?: number
  quote_source?: string
  reason?: string
}
interface BudgetResult {
  selected: Investment[]
  alternatives: Investment[]
  total_cost_inr: number
  annualised_benefit_l: number
  period_benefit_l: number
  budget_remaining_inr: number
  excluded: unknown[]
  evidence: unknown[]
  assumptions: unknown[]
}
function BudgetPage() {
  const { properties, notify } = useWorkspace()
  const [options, setOptions] = useState<BudgetOption[]>([])
  const [result, setResult] = useState<BudgetResult | null>(null)
  const [historicalProvider, setHistoricalProvider] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const year = new Date().getFullYear()
  function update(key: string, change: Partial<BudgetOption>) {
    setOptions((current) => current.map((option) => (option.key === key ? { ...option, ...change } : option)))
  }
  function add() {
    if (options.length >= 20) return
    setOptions((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        property_id: properties[0]?.id ?? '',
        capacity_l: '',
        cost_inr: '',
        quote_source: '',
        installation_space_confirmed: false,
      },
    ])
  }
  async function optimise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    const values = new FormData(event.currentTarget)
    if (!options.length) {
      setError('Add at least one actual property option with a quotation and confirmed installation space.')
      setBusy(false)
      return
    }
    if (options.some((option) => !option.installation_space_confirmed)) {
      setError(
        'Confirm installation-space evidence for each submitted option. Remove unconfirmed options before optimising.',
      )
      setBusy(false)
      return
    }
    try {
      setResult(
        await post<BudgetResult>('/community/optimise', {
          budget_inr: Number(values.get('budget_inr')),
          start_date: values.get('start_date'),
          end_date: values.get('end_date'),
          provider: values.get('provider'),
          options: options.map((option) => ({
            property_id: option.property_id,
            capacity_l: Number(option.capacity_l),
            cost_inr: Number(option.cost_inr),
            quote_source: option.quote_source,
            installation_space_confirmed: option.installation_space_confirmed,
          })),
        }),
      )
      setHistoricalProvider(String(values.get('provider')))
      notify(
        'Community budget comparison completed using property inputs, actual quoted costs and historical simulations.',
      )
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="COMMUNITY STORAGE INVESTMENT"
        title="Put the budget where water benefit is highest."
        description="Compare actual quoted tank options across registered properties under one budget and historical rainfall period."
      />
      {!properties.length ? (
        <Empty
          title="Register properties before comparing investments"
          description="Budget optimisation uses genuine registered property inputs and user-provided quotations."
          to="/register"
        />
      ) : (
        <form className="form-stack" onSubmit={optimise}>
          <Section title="Budget and rainfall assumptions">
            <div className="form-grid">
              <Field label="Available budget (₹)">
                <input
                  name="budget_inr"
                  type="number"
                  min={0}
                  step="any"
                  required
                  placeholder="Actual available investment budget"
                />
              </Field>
              <Field label="Historical provider">
                <select name="provider">
                  <option value="open_meteo">Open-Meteo reanalysis</option>
                  <option value="imd">Approved IMD observations</option>
                </select>
              </Field>
              <Field label="Historical start">
                <input name="start_date" type="date" required defaultValue={`${year - 3}-01-01`} />
              </Field>
              <Field label="Historical end">
                <input
                  name="end_date"
                  type="date"
                  required
                  defaultValue={`${year - 1}-12-31`}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </Field>
            </div>
            <Notice>
              Benefits are simulated additional water supplied compared with each property's current tank, not
              measured water savings. Annualised values depend on the historical period and assumptions.
            </Notice>
          </Section>
          <Section
            title="Actual property investment options"
            subtitle="Up to 20 options. Multiple alternatives for a property can be compared; provide actual quotation provenance."
            action={
              <Button type="button" variant="secondary" disabled={options.length >= 20} onClick={add}>
                <Plus size={16} />
                Add quoted option
              </Button>
            }
          >
            {!options.length && (
              <Empty
                title="Add your first quoted option"
                description="Choose a real property and enter a candidate capacity, actual quoted cost and installation-space evidence."
              />
            )}
            {options.map((option, index) => (
              <div className="budget-option" key={option.key}>
                <div className="budget-option-head">
                  <h3>Option {index + 1}</h3>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setOptions((current) => current.filter((item) => item.key !== option.key))}
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <Trash2 size={15} />
                    Remove
                  </Button>
                </div>
                <div className="form-grid">
                  <Field label="Registered property">
                    <select
                      value={option.property_id}
                      onChange={(event) => update(option.key, { property_id: event.target.value })}
                      required
                    >
                      {properties.map((property) => (
                        <option value={property.id} key={property.id}>
                          {property.name} · {property.property_code}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Candidate tank capacity (L)">
                    <input
                      value={option.capacity_l}
                      onChange={(event) => update(option.key, { capacity_l: event.target.value })}
                      type="number"
                      min={1}
                      step="any"
                      required
                    />
                  </Field>
                  <Field label="Actual quoted installation cost (₹)">
                    <input
                      value={option.cost_inr}
                      onChange={(event) => update(option.key, { cost_inr: event.target.value })}
                      type="number"
                      min={0}
                      step="any"
                      required
                    />
                  </Field>
                  <Field label="Quotation / installation-space evidence">
                    <input
                      value={option.quote_source}
                      onChange={(event) => update(option.key, { quote_source: event.target.value })}
                      required
                      maxLength={500}
                      placeholder="Vendor, quote date/reference and site-space check"
                    />
                  </Field>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    required
                    checked={option.installation_space_confirmed}
                    onChange={(event) =>
                      update(option.key, { installation_space_confirmed: event.target.checked })
                    }
                  />
                  <span>
                    <strong>Installation space is confirmed for this candidate</strong>
                    <small>
                      Confirmation is your documented field input; structural suitability still requires
                      appropriate assessment.
                    </small>
                  </span>
                </label>
              </div>
            ))}
          </Section>
          <InputError error={error} />
          <Button type="submit" loading={busy} disabled={!options.length}>
            <SlidersHorizontal size={17} />
            Optimise community budget
          </Button>
        </form>
      )}
      {busy && (
        <Loading text="Retrieving historical rainfall and comparing feasible investment combinations…" />
      )}
      {result && (
        <>
          <div className="metrics-grid">
            <Metric
              label="Selected option cost"
              value={`₹${number(result.total_cost_inr, 2)}`}
              detail="Actual user-provided quotation amounts"
            />
            <Metric
              label="Budget remaining"
              value={`₹${number(result.budget_remaining_inr, 2)}`}
              detail="Under the submitted budget"
            />
            <Metric
              label="Period additional supply"
              value={number(result.period_benefit_l)}
              unit="L"
              detail="Historical simulation estimate"
            />
            <Metric
              label="Annualised additional supply"
              value={number(result.annualised_benefit_l)}
              unit="L/year"
              detail="Model estimate, not measured savings"
            />
          </div>
          <Section
            title="Selected investments"
            subtitle="One storage upgrade per property, selected under the submitted budget."
          >
            {result.selected.length ? (
              <DataTable
                headings={[
                  'Property',
                  'Candidate tank',
                  'Quoted installed cost',
                  'Additional supply in period',
                  'Selection basis',
                ]}
              >
                {result.selected.map((option, index) => (
                  <tr key={`${option.property_id}-${index}`}>
                    <td>
                      <strong>{option.property_name ?? 'Property name unavailable'}</strong>
                      <small>{option.quote_source ?? 'Quotation reference unavailable'}</small>
                    </td>
                    <td>{number(option.capacity_l)} L</td>
                    <td>₹{number(option.cost_inr, 2)}</td>
                    <td>
                      {number(option.period_benefit_l)} L
                      <small>{number(option.annualised_benefit_l)} L/year annualised estimate</small>
                    </td>
                    <td>{option.reason ?? 'Selection reason unavailable'}</td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <Empty
                title="No investment selected for this budget"
                description="Review quotation costs, installation constraints, excluded options and simulated additional demand supplied."
              />
            )}
            <Evidence title="Selected property options" value={result.selected} />
            <Evidence title="Compared alternatives" value={result.alternatives} />
            <Evidence title="Excluded options and reasons" value={result.excluded} />
            <Evidence title="Historical sources and property evidence" value={result.evidence} />
            <Evidence title="Optimisation assumptions" value={result.assumptions} />
            <WeatherAttribution provider={historicalProvider} />
          </Section>
        </>
      )}
    </>
  )
}
