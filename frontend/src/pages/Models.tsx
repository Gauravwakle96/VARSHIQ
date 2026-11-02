import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowRight, Calculator, CloudRain, Play, RefreshCw, SlidersHorizontal, Waves } from 'lucide-react'
import { post, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Historical, Simulation, Twin } from '../types'
import {
  Button,
  Chip,
  DataTable,
  date,
  Empty,
  Evidence,
  Field,
  InputError,
  Loading,
  Metric,
  modelReady,
  Notice,
  number,
  PageTitle,
  PropertyNeeded,
  Section,
} from '../components/ui'
import { WeatherAttribution } from './Weather'

export default function ModelPages({ mode }: { mode: 'calculator' | 'twin' | 'optimiser' }) {
  const { property } = useWorkspace()
  if (mode === 'calculator') return <CalculatorPage key={property?.id ?? 'independent'} />
  if (!modelReady(property))
    return (
      <>
        <PageTitle
          eyebrow="VARSHIQ WATERTWIN"
          title={mode === 'twin' ? 'Your roof. Your rain. Your water model.' : 'Find the storage that fits.'}
          description="Transparent calculations require a connected catchment measurement and a documented runoff coefficient."
        />
        <PropertyNeeded property={property} modelling />
      </>
    )
  const inputFingerprint = JSON.stringify([
    property?.id,
    property?.latitude,
    property?.longitude,
    property?.timezone,
    property?.effective_catchment_m2,
    property?.measurement_status,
    property?.roof_area_provenance,
    property?.roof_material,
    property?.runoff_coefficient,
    property?.coefficient_source,
    property?.first_flush_mm,
    property?.collection_efficiency,
    property?.tank_capacity_l,
    property?.current_storage_l,
    property?.storage_measured_at,
    property?.storage_status,
    property?.daily_demand_l,
    property?.available_space_m2,
  ])
  return mode === 'twin' ? <TwinPage key={inputFingerprint} /> : <OptimiserPage key={inputFingerprint} />
}
interface Breakdown {
  rainfall_volume_l: number
  gross_runoff_l: number
  first_flush_l: number
  collection_loss_l: number
  net_inflow_l: number
  assumptions?: unknown
}
function CalculatorPage() {
  const { property } = useWorkspace()
  const [data, setData] = useState<Breakdown | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setData(null)
    const values = new FormData(event.currentTarget)
    try {
      setData(
        await post<Breakdown>('/rainwater/calculate', {
          area_m2: Number(values.get('area_m2')),
          rainfall_mm: Number(values.get('rainfall_mm')),
          runoff_coefficient: Number(values.get('runoff_coefficient')),
          first_flush_mm: Number(values.get('first_flush_mm')),
          collection_efficiency: Number(values.get('collection_efficiency')),
        }),
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
        eyebrow="RAINWATER CALCULATOR"
        title="How much rainwater could I collect?"
        description="Enter a rain amount to estimate collection. My water tank uses the real forecast for your property."
      />
      <div className="two-column">
        <Section
          title="Roof size and rainfall"
          subtitle="These are values you enter to try a calculation, not measured rainfall."
        >
          <form onSubmit={calculate} className="form-stack">
            <div className="form-grid">
              <Field label="Roof area for collection (m²)">
                <input
                  name="area_m2"
                  required
                  type="number"
                  min={0.01}
                  step="any"
                  defaultValue={property?.effective_catchment_m2 ?? ''}
                />
              </Field>
              <Field label="Rainfall amount (mm)">
                <input
                  name="rainfall_mm"
                  required
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Enter an event rainfall amount"
                />
              </Field>
              <Field label="Roof runoff factor (0–1)" hint="For example, 0.8 counts 80% of rain as roof runoff. Use a documented site value.">
                <input
                  name="runoff_coefficient"
                  required
                  type="number"
                  min={0}
                  max={1}
                  step="any"
                  defaultValue={property?.runoff_coefficient ?? ''}
                />
              </Field>
              <Field label="First rain diverted (mm)" hint="The initial runoff sent away to help clear roof dirt, once per rain event.">
                <input
                  name="first_flush_mm"
                  required
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={property?.first_flush_mm ?? 0}
                />
              </Field>
              <Field label="Filter and pipe efficiency (0–1)" hint="For example, 0.9 keeps 90% after the first rain is diverted.">
                <input
                  name="collection_efficiency"
                  required
                  type="number"
                  min={0}
                  max={1}
                  step="any"
                  defaultValue={property?.collection_efficiency ?? 1}
                />
              </Field>
            </div>
            {property?.coefficient_source && (
              <Notice title="Registered coefficient reference">{property.coefficient_source}</Notice>
            )}
            <InputError error={error} />
            <Button type="submit" loading={busy}>
              <Calculator size={17} />
              Calculate this rainfall event
            </Button>
          </form>
        </Section>
        <div className="form-stack">
          <Section title="The water balance">
            <div className="formula">
              <span>1 mm rainfall over 1 m² = 1 litre</span>
              <strong>Area × precipitation × runoff coefficient</strong>
              <span>Roof runoff − first flush − collection losses</span>
              <strong className="formula-result">Net harvestable inflow</strong>
            </div>
            <Notice>
              First flush is applied once for this event. Forecast WaterTwin groups rainfall events across
              hourly dry gaps.
            </Notice>
          </Section>
          {data ? (
            <Section
              title="Calculation breakdown"
              subtitle="Potential inflow under the supplied assumptions."
            >
              <RunoffBreakdown data={data} />
              <Evidence
                value={
                  data.assumptions ?? [
                    'First-flush depth represents rainfall-equivalent runoff diversion.',
                    'Collection losses apply after diversion.',
                    'No tank capacity or consumption is modelled by this event calculator.',
                  ]
                }
              />
            </Section>
          ) : (
            <Section title="From rainfall to usable inflow">
              <Empty
                title="Enter an event to calculate"
                description="The result will show rainfall volume, roof runoff, diversion and collection losses separately."
              />
            </Section>
          )}
        </div>
      </div>
      {data && (
        <div className="metrics-grid three">
          <Metric
            label="Roof runoff"
            value={number(data.gross_runoff_l)}
            unit="L"
            detail="After runoff coefficient"
          />
          <Metric
            label="Diverted + collection losses"
            value={number(data.first_flush_l + data.collection_loss_l)}
            unit="L"
            detail="No duplicated loss deductions"
          />
          <Metric
            label="Net harvestable inflow"
            value={number(data.net_inflow_l)}
            unit="L"
            detail="Estimate before tank overflow"
            tone="teal"
          />
        </div>
      )}
      <Link className="text-link" to="/twin">
        Connect real forecast rainfall to your tank
        <ArrowRight size={16} />
      </Link>
    </>
  )
}
export function RunoffBreakdown({ data }: { data: Breakdown }) {
  const entries = [
    {
      label: 'Rainfall volume on catchment',
      value: data.rainfall_volume_l,
      description: 'Area × precipitation',
    },
    { label: 'Gross roof runoff', value: data.gross_runoff_l, description: 'After runoff coefficient' },
    {
      label: 'First-flush diversion',
      value: data.first_flush_l,
      description: 'Applied per event',
      loss: true,
    },
    {
      label: 'Collection losses',
      value: data.collection_loss_l,
      description: 'After first-flush diversion',
      loss: true,
    },
    {
      label: 'Net harvestable inflow',
      value: data.net_inflow_l,
      description: 'Potential inflow before tank overflow',
      result: true,
    },
  ]
  return (
    <div className="runoff-breakdown">
      {entries.map((entry) => (
        <div className={entry.result ? 'result' : ''} key={entry.label}>
          <div>
            <strong>{entry.label}</strong>
            <small>{entry.description}</small>
          </div>
          <span>
            {entry.loss ? '− ' : ''}
            {number(entry.value, 1)} <small>L</small>
          </span>
        </div>
      ))}
    </div>
  )
}
function TwinPage() {
  const { property, notify } = useWorkspace()
  const history = useApi<Twin[]>(property ? `/rainwater/history/${property.id}` : null)
  const [result, setResult] = useState<Twin | null>(null)
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Twin | null>(null)
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [inspectedSnapshot, setInspectedSnapshot] = useState<Twin | null>(null)
  async function run() {
    setBusy(true)
    setError(null)
    try {
      const next = await post<Twin>('/rainwater/forecast', { property_id: property?.id, days })
      setResult(next)
      setScenario(null)
      history.reload()
      notify('WaterTwin calculation saved with its forecast and assumptions.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function runScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setScenarioBusy(true)
    setScenarioError(null)
    const values = new FormData(event.currentTarget)
    const capacity = Number(values.get('capacity_l'))
    if (capacity < (property?.current_storage_l ?? 0)) {
      setScenarioError(
        'A smaller capacity cannot contain the currently recorded stored volume. No tank discharge is assumed.',
      )
      setScenarioBusy(false)
      return
    }
    try {
      setScenario(
        await post<Twin>('/rainwater/scenario', {
          property_id: property?.id,
          days,
          capacity_l: capacity,
          daily_demand_l: Number(values.get('daily_demand_l')),
        }),
      )
      notify('Comparison ready. Your saved property details have not changed.')
    } catch (error) {
      setScenarioError((error as Error).message)
    } finally {
      setScenarioBusy(false)
    }
  }
  const matchingHistory =
    history.data?.filter((snapshot) => (snapshot.horizon_days ?? snapshot.forecast.daily.length) === days) ??
    []
  const refreshedResult = result
    ? (history.data?.find((snapshot) => snapshot.id === result.id) ?? result)
    : null
  const candidate = refreshedResult ?? matchingHistory.find((snapshot) => !snapshotStale(snapshot)) ?? null
  const twin = candidate && !snapshotStale(candidate) ? candidate : null
  const priorSnapshot =
    candidate && snapshotStale(candidate) ? candidate : (matchingHistory.find(snapshotStale) ?? null)
  const simulation = twin?.calculation
  const coverage = simulation?.demand_l ? (simulation.water_supplied_l / simulation.demand_l) * 100 : null
  return (
    <>
      <PageTitle
        eyebrow="VARSHIQ WATERTWIN"
        title="Will my tank have enough water?"
        description={`${property?.name} · See how forecast rain could fill your tank after daily water use.`}
        action={
          <Button loading={busy} onClick={run}>
            <Play size={16} />
            {twin ? 'Update my forecast' : 'Show my water forecast'}
          </Button>
        }
      />
      <div className="filter-bar">
        <Field label="How far ahead?">
          <select
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value))
              setResult(null)
              setScenario(null)
              setError(null)
              setInspectedSnapshot(null)
            }}
          >
            <option value={3}>Next 3 days</option>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
          </select>
        </Field>
        <Link to="/property" className="text-link">
          Edit roof, tank and water use
          <ArrowRight size={15} />
        </Link>
      </div>
      <InputError error={error} />
      {priorSnapshot && (
        <Notice tone="warning" title="A prior prediction needs updating">
          This saved prediction is stale or uses previous inputs. It is excluded from current
          water-availability metrics.
          <Evidence
            title="Why this snapshot is prior evidence"
            value={
              priorSnapshot.stale_reasons?.length
                ? priorSnapshot.stale_reasons
                : ['Provider forecast is stale, property inputs changed, or the snapshot needs refreshing.']
            }
          />
          <Button variant="secondary" onClick={() => setInspectedSnapshot(priorSnapshot)}>
            Inspect prior snapshot
          </Button>
        </Notice>
      )}
      {history.loading && !twin && <Loading text="Loading saved WaterTwin predictions…" />}
      {history.error && (
        <Notice tone="warning">
          Saved history could not be loaded: {history.error.message}. You can retry by running a new
          WaterTwin.
        </Notice>
      )}
      {!twin && !history.loading && (
        <Section title="Connect rain to your tank">
          <Empty
            title={
              history.data?.length
                ? 'Run a current WaterTwin for these inputs'
                : 'Your first WaterTwin is ready to run'
            }
            description="VARSHIQ will retrieve the property's live rainfall forecast, apply event-based losses and simulate storage against demand. Previous predictions remain historical evidence."
          />
          <div className="twin-chain">
            <span>Verified / entered roof</span>
            <ArrowRight size={15} />
            <span>Live forecast</span>
            <ArrowRight size={15} />
            <span>Runoff</span>
            <ArrowRight size={15} />
            <span>Tank & demand</span>
          </div>
          <Notice>
            Current storage is {number(property?.current_storage_l)} L ({property?.storage_status}). The
            result estimates future water availability; it does not record harvested water.
          </Notice>
        </Section>
      )}
      {twin && simulation && (
        <>
          <div className="twin-state-strip">
            <Chip tone="blue">Forecast estimate</Chip>
            <span>
              {twin.forecast.provider} · retrieved {date(twin.forecast.retrieved_at, property?.timezone)}
            </span>
            <WeatherAttribution provider={twin.forecast.provider} attribution={twin.forecast.attribution} />
          </div>
          <div className="metrics-grid">
            <Metric
              label="Forecast harvestable inflow"
              value={number(simulation.net_inflow_l)}
              unit="L"
              detail="After event diversion and losses"
            />
            <Metric
              label="Expected ending storage"
              value={number(simulation.final_storage_l)}
              unit="L"
              detail={`Capacity ${number(simulation.capacity_l)} L`}
              tone="teal"
            />
            <Metric
              label="Potential overflow"
              value={number(simulation.overflow_l)}
              unit="L"
              detail="Explicitly accounted for"
              tone={simulation.overflow_l > 0 ? 'amber' : ''}
            />
            <Metric
              label="Demand supplied"
              value={number(coverage, 1)}
              unit="%"
              detail={`${number(simulation.water_supplied_l)} L supplied · ${number(simulation.unmet_demand_l)} L unmet`}
            />
          </div>
          <details className="friendly-details twin-comparison">
            <summary>Try another tank size or daily water use</summary>
          <Section
            title="What if the tank or demand changed?"
            subtitle="Try different values without changing your saved property details."
            className="scenario-label"
          >
            <form onSubmit={runScenario} className="filter-bar">
              <Field label="Try a tank capacity (L)">
                <input
                  name="capacity_l"
                  type="number"
                  required
                  min={property?.current_storage_l ?? 0}
                  step="any"
                  defaultValue={property?.tank_capacity_l}
                />
              </Field>
              <Field label="Try daily water use (L/day)">
                <input
                  name="daily_demand_l"
                  type="number"
                  required
                  min={0}
                  step="any"
                  defaultValue={property?.daily_demand_l}
                />
              </Field>
              <Button loading={scenarioBusy} type="submit">
                <SlidersHorizontal size={16} />
                Compare these settings
              </Button>
            </form>
            <InputError error={scenarioError} />
            {scenario && (
              <div className="scenario-result">
                {snapshotStale(scenario) && (
                  <Notice title="This comparison needs fresh weather data" tone="warning">
                    This what-if result uses a stale forecast. Refresh WaterTwin and try these settings again before
                    using it for preparation.
                  </Notice>
                )}
                <Chip tone={snapshotStale(scenario) ? 'amber' : 'blue'}>
                  {snapshotStale(scenario)
                    ? 'Prior what-if estimate · stale forecast'
                    : 'What-if forecast estimate · not a saved measurement'}
                </Chip>
                <div className="metrics-grid three" style={{ marginTop: 16 }}>
                  <Metric
                    label="Water left with these settings"
                    value={number(scenario.calculation.final_storage_l)}
                    unit="L"
                    detail={`Candidate capacity ${number(scenario.calculation.capacity_l)} L`}
                  />
                  <Metric
                    label="Overflow with these settings"
                    value={number(scenario.calculation.overflow_l)}
                    unit="L"
                    detail="Compare with the registered-input result above"
                  />
                  <Metric
                    label="Water shortfall with these settings"
                    value={number(scenario.calculation.unmet_demand_l)}
                    unit="L"
                    detail="Based on the daily water use you entered"
                  />
                </div>
                <WeatherAttribution
                  provider={scenario.forecast.provider}
                  attribution={scenario.forecast.attribution}
                />
                <Evidence
                  title="Forecast and settings for this comparison"
                  value={{
                    retrieved_at: scenario.forecast.retrieved_at,
                    assumptions: scenario.assumptions,
                    confidence: scenario.confidence,
                  }}
                />
              </div>
            )}
          </Section>
          </details>
          <Section
            title="Forecast storage trajectory"
            subtitle="Starting from the recorded storage input; consumption is limited by water available."
          >
            <div
              className="chart"
              role="img"
              aria-label="Forecast tank storage, inflow and overflow. Exact values are available in the daily table."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simulation.daily} margin={{ top: 12, right: 15, left: 5, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e7ece8" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      date(`${value}T12:00:00`, property?.timezone, false).replace(/ \d{4}$/, '')
                    }
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    unit=" L"
                    width={68}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip formatter={(value, name) => [number(Number(value)), name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="stepAfter"
                    dataKey="storage_l"
                    name="Ending storage"
                    stroke="#148877"
                    fill="#cdeee5"
                    fillOpacity={0.65}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="net_inflow_l"
                    name="Harvestable inflow"
                    stroke="#557fa5"
                    fill="#e4edf5"
                    fillOpacity={0.22}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="overflow_l"
                    name="Overflow"
                    stroke="#c48b29"
                    fill="#f4e9cd"
                    fillOpacity={0.22}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <WeatherAttribution provider={twin.forecast.provider} attribution={twin.forecast.attribution} />
          </Section>
          <div className="two-column">
            <Section
              title="Every litre accounted for"
              subtitle="Calculation breakdown over the simulated forecast window."
            >
              <RunoffBreakdown data={simulation} />
              <div className="balance-statement">
                <strong>Storage balance</strong>
                <span>
                  {number(simulation.initial_storage_l)} L start + {number(simulation.net_inflow_l)} L inflow
                  = {number(simulation.final_storage_l)} L end + {number(simulation.water_supplied_l)} L
                  supplied + {number(simulation.overflow_l)} L overflow
                </span>
                <Chip tone={Math.abs(simulation.balance_error_l) < 0.1 ? 'green' : 'amber'}>
                  Balance residual: {number(simulation.balance_error_l, 4)} L
                </Chip>
              </div>
            </Section>
            <Section title="Rain-to-action readiness" subtitle="Preparation based on this forecast estimate.">
              <div className="action-readiness">
                <div>
                  <CloudRain size={21} />
                  <strong>{number(simulation.rainfall_mm, 1)} mm forecast precipitation</strong>
                </div>
                <p>Check roof drains, inspect filters and confirm the current tank level before the event.</p>
                <div className={`overflow-callout ${simulation.overflow_l > 0 ? 'warning' : ''}`}>
                  <strong>
                    {simulation.overflow_l > 0
                      ? `${number(simulation.overflow_l)} L potential overflow`
                      : 'No overflow in this simulation'}
                  </strong>
                  <span>
                    {simulation.overflow_l > 0
                      ? 'Inspect overflow routing and compare storage alternatives. Avoid discharge decisions without checking demand and site safety.'
                      : 'This depends on the forecast, starting storage and demand assumptions.'}
                  </span>
                </div>
                <Link className="button secondary" to="/optimiser">
                  <SlidersHorizontal size={16} />
                  Compare tank capacities
                </Link>
              </div>
              <Evidence title="Preparation context" value={twin.readiness} />
            </Section>
          </div>
          <Section title="Daily water balance">
            <DataTable
              headings={[
                'Date',
                'Rainfall',
                'Harvestable inflow',
                'Storage',
                'Supplied demand',
                'Unmet demand',
                'Overflow',
              ]}
            >
              {simulation.daily.map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{number(day.rainfall_mm, 1)} mm</td>
                  <td>{number(day.net_inflow_l)} L</td>
                  <td>{number(day.storage_l)} L</td>
                  <td>{number(day.water_supplied_l)} L</td>
                  <td>{number(day.unmet_demand_l)} L</td>
                  <td>{number(day.overflow_l)} L</td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Evidence
            title="Confidence, measurement status & assumptions"
            value={{
              confidence: twin.confidence,
              snapshot_assumptions: twin.assumptions,
              simulation_assumptions: simulation.assumptions,
              limitations: simulation.limitations,
              current_registered_storage_status: property?.storage_status,
              current_registered_storage_timestamp: property?.storage_measured_at,
              current_registered_coefficient_source: property?.coefficient_source,
            }}
          />
          <details className="data-details">
            <summary>Inspect event and hourly calculation records</summary>
            <Evidence title="Rainfall event breakdown" value={simulation.events} />
            <DataTable
              headings={[
                'Time',
                'Rainfall',
                'First flush',
                'Collection loss',
                'Net inflow',
                'Storage',
                'Overflow',
              ]}
            >
              {simulation.hourly.map((hour) => (
                <tr key={hour.time}>
                  <td>{date(hour.time, property?.timezone)}</td>
                  <td>{number(hour.rainfall_mm, 2)} mm</td>
                  <td>{number(hour.first_flush_l, 1)} L</td>
                  <td>{number(hour.collection_loss_l, 1)} L</td>
                  <td>{number(hour.net_inflow_l, 1)} L</td>
                  <td>{number(hour.storage_l, 1)} L</td>
                  <td>{number(hour.overflow_l, 1)} L</td>
                </tr>
              ))}
            </DataTable>
          </details>
          <div className="inline-actions">
            <Link to="/observations" className="button secondary">
              <Waves size={16} />
              Record field outcomes
            </Link>
            <Link to="/reports" className="button primary">
              Create assessment report
              <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
      {history.data?.length ? (
        <Section
          title="Saved prediction snapshots"
          subtitle="Stored calculations remain inspectable as prior evidence; only matching fresh snapshots can supply current metrics."
        >
          <DataTable headings={['Forecast retrieved', 'Window', 'Status', '']}>
            {history.data.map((snapshot) => (
              <tr key={snapshot.id}>
                <td>{date(snapshot.forecast.retrieved_at, snapshot.forecast.timezone)}</td>
                <td>{snapshot.horizon_days ?? snapshot.forecast.daily.length} days</td>
                <td>
                  <Chip tone={snapshotStale(snapshot) ? 'amber' : 'blue'}>
                    {snapshotStale(snapshot) ? 'Prior / stale snapshot' : 'Fresh matching inputs'}
                  </Chip>
                </td>
                <td>
                  <Button variant="ghost" onClick={() => setInspectedSnapshot(snapshot)}>
                    Inspect saved result
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>
      ) : null}
      {inspectedSnapshot && (
        <Section
          title="Prior snapshot inspection"
          subtitle="These are stored prediction values, not the current tank state or measured collected water."
          action={
            <Button variant="ghost" onClick={() => setInspectedSnapshot(null)}>
              Close inspection
            </Button>
          }
        >
          <Notice tone="warning">
            Keep the snapshot's forecast time, inputs and assumptions attached when interpreting this
            historical prediction.
          </Notice>
          <Evidence
            title="Stored forecast, calculation & assumptions"
            value={{
              forecast: inspectedSnapshot.forecast,
              calculation: inspectedSnapshot.calculation,
              assumptions: inspectedSnapshot.assumptions,
              confidence: inspectedSnapshot.confidence,
              stale: inspectedSnapshot.stale,
              stale_reasons: inspectedSnapshot.stale_reasons,
            }}
          />
        </Section>
      )}
    </>
  )
}
function snapshotStale(snapshot: Twin) {
  return Boolean(snapshot.stale || snapshot.inputs_changed || snapshot.forecast.stale)
}
interface Optimisation {
  historical: Historical
  comparisons: { capacity_l: number; cost_inr: number | null; simulation: Simulation }[]
  recommended_range_l: number[]
  reasons: string[]
  limitations: string[]
}
function OptimiserPage() {
  const { property } = useWorkspace()
  const [result, setResult] = useState<Optimisation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const year = new Date().getFullYear()
  const baseCapacity =
    property?.tank_capacity_l && property.tank_capacity_l > 0 ? property.tank_capacity_l : null
  async function optimise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    const values = new FormData(event.currentTarget)
    const capacities = String(values.get('capacities_l'))
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((value, index, all) => all.indexOf(value) === index)
    if (!capacities.length || capacities.some((item) => !Number.isFinite(item) || item <= 0)) {
      setError('Enter comma-separated positive tank capacities in litres.')
      setBusy(false)
      return
    }
    try {
      setResult(
        await post<Optimisation>('/storage/optimise', {
          property_id: property?.id,
          capacities_l: capacities,
          start_date: values.get('start_date'),
          end_date: values.get('end_date'),
          provider: values.get('provider'),
          ...(values.get('cost_per_l_inr') !== ''
            ? { cost_per_l_inr: Number(values.get('cost_per_l_inr')) }
            : {}),
        }),
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
        eyebrow="SMART STORAGE OPTIMISATION"
        title="Which tank size works for me?"
        description={`${property?.name} · Compare tanks under the same real historical rainfall and demand assumptions.`}
      />
      <Section
        title="Tank sizes to compare"
        subtitle="Compare a smaller tank, your current tank and a larger one using past rainfall."
      >
        <form onSubmit={optimise} className="form-stack">
          <div className="form-grid three">
            <Field
              label="Tank sizes (L)"
              hint="Comma-separated alternatives; include your current tank to compare."
            >
              <input
                name="capacities_l"
                required
                defaultValue={
                  baseCapacity
                    ? `${Math.round(baseCapacity / 2)}, ${baseCapacity}, ${Math.round(baseCapacity * 1.5)}`
                    : ''
                }
                placeholder="Enter smaller, current and larger capacities"
              />
            </Field>
            <Field
              label="Indicative cost per litre (₹/L)"
              hint="Optional user-supplied cost assumption, not an installer quote."
            >
              <input
                name="cost_per_l_inr"
                type="number"
                min={0}
                step="any"
                placeholder="Leave blank if unknown"
              />
            </Field>
            <Field label="Rainfall history provider">
              <select name="provider">
                <option value="open_meteo">Open-Meteo historical reanalysis</option>
                <option value="imd">IMD approved observations</option>
              </select>
            </Field>
            <Field label="Historical start date">
              <input type="date" name="start_date" required defaultValue={`${year - 3}-01-01`} />
            </Field>
            <Field label="Historical end date">
              <input
                type="date"
                name="end_date"
                required
                defaultValue={`${year - 1}-12-31`}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </div>
          <Notice>
            Daily historical rainfall cannot resolve individual storm gaps. The simulation will expose its
            event approximation. Installation feasibility requires tank dimensions, site constraints and
            structural assessment.
          </Notice>
          <InputError error={error} />
          <Button loading={busy} type="submit">
            <SlidersHorizontal size={17} />
            Compare storage capacities
          </Button>
        </form>
      </Section>
      {busy && <Loading text="Retrieving history and running daily water-balance comparisons…" />}
      {!result && !busy && (
        <Section title="Choose a capacity through evidence">
          <Empty
            title="Compare your storage options"
            description="See water supplied, overflow and unmet demand for each tank under one consistent rainfall history."
          />
        </Section>
      )}
      {result && (
        <>
          <div className="optimiser-recommendation">
            <span className="recommendation-icon">
              <SlidersHorizontal size={27} />
            </span>
            <div>
              <span className="eyebrow">SIMULATION-BASED CAPACITY RANGE</span>
              <h2>
                {result.recommended_range_l?.length
                  ? `${number(Math.min(...result.recommended_range_l))}–${number(Math.max(...result.recommended_range_l))} L`
                  : 'No recommendation established'}
              </h2>
              <p>
                The recommendation weighs water utilisation and diminishing benefits; review site suitability
                before installation.
              </p>
            </div>
          </div>
          <Section
            title="Capacity comparison"
            subtitle="All capacities use the same retrieved rainfall series and collection assumptions."
          >
            <div
              className="chart"
              role="img"
              aria-label="Comparison of supplied water and overflow by tank capacity, with exact values in the following table."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={result.comparisons.map((item) => ({
                    capacity: `${number(item.capacity_l)} L`,
                    supplied: item.simulation.water_supplied_l,
                    overflow: item.simulation.overflow_l,
                  }))}
                >
                  <CartesianGrid vertical={false} stroke="#e7ece8" />
                  <XAxis dataKey="capacity" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis unit=" L" width={74} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => `${number(Number(value))} L`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="supplied"
                    name="Water supplied"
                    fill="#259887"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="overflow"
                    name="Overflow"
                    fill="#d4a451"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              headings={[
                'Capacity',
                'Net inflow',
                'Water supplied',
                'Overflow',
                'Unmet demand',
                'Cost assumption',
              ]}
            >
              {result.comparisons.map((item) => (
                <tr key={item.capacity_l}>
                  <td>
                    <strong>{number(item.capacity_l)} L</strong>
                    {item.capacity_l === property?.tank_capacity_l && <Chip tone="blue">Current tank</Chip>}
                  </td>
                  <td>{number(item.simulation.net_inflow_l)} L</td>
                  <td>{number(item.simulation.water_supplied_l)} L</td>
                  <td>{number(item.simulation.overflow_l)} L</td>
                  <td>{number(item.simulation.unmet_demand_l)} L</td>
                  <td>{item.cost_inr == null ? 'Not provided' : `₹${number(item.cost_inr)}`}</td>
                </tr>
              ))}
            </DataTable>
            <WeatherAttribution
              provider={result.historical.provider}
              attribution={result.historical.attribution}
            />
          </Section>
          <Evidence title="Why this capacity range?" value={result.reasons} />
          <Evidence
            title="History, assumptions & installation limitations"
            value={{
              provider: result.historical.provider,
              data_kind: result.historical.data_kind,
              coverage: result.historical.coverage,
              spatial_resolution: result.historical.spatial_resolution,
              limitations: result.limitations,
              historical_limitations: result.historical.limitations,
            }}
          />
          <div className="inline-actions">
            <Link to="/recommendations" className="button primary">
              Review system recommendations
              <ArrowRight size={16} />
            </Link>
            <Link to="/property" className="button secondary">
              <RefreshCw size={16} />
              Update installation inputs
            </Link>
          </div>
        </>
      )}
    </>
  )
}
