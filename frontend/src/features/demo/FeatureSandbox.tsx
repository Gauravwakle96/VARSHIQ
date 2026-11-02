import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Download, FlaskConical, RotateCcw } from 'lucide-react'
import {
  Button,
  Chip,
  DataTable,
  Evidence,
  Field,
  Loading,
  Metric,
  Notice,
  number,
  Section,
} from '../../components/ui'
import { defaults, profiles, type DemoInputs, type DemoResult } from './data'
import { previewFeature } from './featureCatalogue'
import { useDemo } from './useDemo'
import DemoMap from './DemoMap'
import WaterScene from './WaterScene'
import './demo.css'
import './featureSandbox.css'

type Inputs = DemoInputs & { annual_rainfall_mm: number }
const workspaceDefaults: Inputs = {
  ...defaults,
  capacity_l: 2000,
  initial_storage_pct: 25,
  annual_rainfall_mm: 1500,
}

export default function FeatureSandbox({ featurePath, compact = false }: { featurePath: string; compact?: boolean }) {
  const feature = previewFeature(featurePath)
  const [inputs, setInputs] = useState<Inputs>(workspaceDefaults)
  const [revision, setRevision] = useState(0)
  const { result, error } = useDemo(inputs, revision, true)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const reduced = useReducedMotion()
  const waterControls = !['/locations', '/map', '/quality', '/groundwater', '/sources'].includes(feature.path)
  async function download() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const response = await fetch('/api/v1/demo/report', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf'))
        throw new Error('The simulated report could not be generated. Please retry.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'VARSHIQ-SIMULATED-assessment.pdf'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setDownloadError((error as Error).message)
    } finally {
      setDownloading(false)
    }
  }
  return (
    <section className="feature-sandbox" aria-label={`${feature.name} simulation`}>
      <div className="feature-sandbox-heading">
        <div>
          <span className="eyebrow">{compact ? 'TRY IT WITH SIMULATED DATA' : 'SIMULATED FEATURE WORKSPACE'}</span>
          <h1>{feature.name}</h1>
          <p>{feature.purpose}</p>
        </div>
        <Chip tone="amber">
          <FlaskConical size={14} /> Fictional data · no records saved
        </Chip>
      </div>
      {compact ? (
        <details className="friendly-details panel">
          <summary>About this example and what you need for real use</summary>
          <p>{feature.benefit}</p><p>{feature.liveNeeds}</p>
        </details>
      ) : <Notice title="Who this helps">{feature.benefit}</Notice>}
      {waterControls && (
        <>
          <div className="feature-controls panel">
            <Field label="Illustrative building profile">
              <select
                value={inputs.profile}
                onChange={(event) => {
                  const profile = profiles.find((item) => item.id === event.currentTarget.value)!
                  setInputs((current) => ({
                    ...current,
                    profile: profile.id,
                    area_m2: profile.area_m2,
                    capacity_l: profile.id === 'home' ? 2000 : profile.capacity_l,
                    daily_demand_l: profile.daily_demand_l,
                  }))
                }}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Synthetic rainfall pattern">
              <select
                value={inputs.weather}
                onChange={(event) => {
                  const weather = event.currentTarget.value as DemoInputs['weather']
                  setInputs((current) => ({
                    ...current,
                    weather,
                    rainfall_mm: weather === 'dry' ? 0 : current.rainfall_mm || 36,
                  }))
                }}
              >
                <option value="bursts">Two rain events</option>
                <option value="steady">One steady event</option>
                <option value="dry">Dry period</option>
              </select>
            </Field>
            <NumberControl
              label="Synthetic 48-hour rain (mm)"
              field="rainfall_mm"
              min={0}
              max={120}
              inputs={inputs}
              setInputs={setInputs}
            />
            <NumberControl
              label="Assumed catchment (m²)"
              field="area_m2"
              min={10}
              max={5000}
              inputs={inputs}
              setInputs={setInputs}
            />
            <NumberControl
              label="Example tank capacity (L)"
              field="capacity_l"
              min={100}
              max={50000}
              inputs={inputs}
              setInputs={setInputs}
            />
            <NumberControl
              label="Example demand (L/day)"
              field="daily_demand_l"
              min={0}
              max={30000}
              inputs={inputs}
              setInputs={setInputs}
            />
            <div className="feature-control-actions">
              <Button variant="ghost" onClick={() => setInputs({ ...workspaceDefaults })}>
                <RotateCcw size={15} /> Reset example
              </Button>
            </div>
          </div>
          <details className="feature-assumption-controls">
            <summary>Collection, starting storage and annual assumptions</summary>
            <div className="form-grid">
              <NumberControl
                label="Assumed runoff coefficient"
                field="runoff_coefficient"
                min={0}
                max={1}
                step={0.01}
                inputs={inputs}
                setInputs={setInputs}
              />
              <NumberControl
                label="Assumed first flush (mm/event)"
                field="first_flush_mm"
                min={0}
                max={5}
                inputs={inputs}
                setInputs={setInputs}
              />
              <NumberControl
                label="Assumed collection efficiency"
                field="collection_efficiency"
                min={0}
                max={1}
                step={0.01}
                inputs={inputs}
                setInputs={setInputs}
              />
              <NumberControl
                label="Assumed starting storage (%)"
                field="initial_storage_pct"
                min={0}
                max={100}
                inputs={inputs}
                setInputs={setInputs}
              />
              <NumberControl
                label="Invented annual rainfall (mm)"
                field="annual_rainfall_mm"
                min={0}
                max={5000}
                inputs={inputs}
                setInputs={setInputs}
              />
              <NumberControl
                label="Illustrative community budget (₹)"
                field="budget_inr"
                min={0}
                max={200000}
                inputs={inputs}
                setInputs={setInputs}
              />
            </div>
          </details>
        </>
      )}
      {!compact && <Notice title="What the real page needs" tone="warning">
        {feature.liveNeeds}
      </Notice>}
      {error ? (
        <Notice tone="warning" title="Simulation unavailable">
          <p>{error}</p>
          <div>
            <Button onClick={() => setRevision((value) => value + 1)}>Retry simulation</Button>
          </div>
        </Notice>
      ) : !result ? (
        <Loading text="Calculating the fictional feature example…" />
      ) : (
        <motion.div
          className="feature-result"
          key={feature.path}
          initial={reduced ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <FeatureBody key={feature.path} path={feature.path} result={result} inputs={inputs} />
          {feature.path === '/reports' && (
            <Section title="Export the example assessment">
              <p>
                The PDF is prominently labelled SIMULATED and includes sources, losses and a storage balance.
                It is not an assessment of an actual property.
              </p>
              <Button loading={downloading} onClick={download}>
                <Download size={16} /> Download simulated PDF
              </Button>
              {downloadError && <Notice tone="warning">{downloadError}</Notice>}
            </Section>
          )}
          <Evidence
            title="Simulation source, model assumptions and limitations"
            value={{
              data_kind: result.data_kind,
              persisted: result.persisted,
              rainfall_source: result.rainfall_source,
              assumptions: result.assumptions,
              limitations: result.workspace?.limitations,
            }}
          />
        </motion.div>
      )}
    </section>
  )
}

function NumberControl({
  label,
  field,
  min,
  max,
  step = 'any',
  inputs,
  setInputs,
}: {
  label: string
  field: keyof Inputs
  min: number
  max: number
  step?: number | 'any'
  inputs: Inputs
  setInputs: Dispatch<SetStateAction<Inputs>>
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={inputs[field]}
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          setInputs((current) => ({
            ...current,
            [field]: value,
            ...(field === 'rainfall_mm'
              ? {
                  weather:
                    value === 0
                      ? ('dry' as const)
                      : current.weather === 'dry'
                        ? ('bursts' as const)
                        : current.weather,
                }
              : {}),
          }))
        }}
      />
    </Field>
  )
}

function FeatureBody({ path, result, inputs }: { path: string; result: DemoResult; inputs: Inputs }) {
  const data = result.workspace!
  const calculation = result.calculation
  const onFrame = useCallback(() => undefined, [])
  const [checks, setChecks] = useState<string[]>([])
  const [quality, setQuality] = useState({ ph: 7.2, tds: 220, turbidity: 3.5 })
  const [structure, setStructure] = useState('Recharge pit')
  const [question, setQuestion] = useState('collection')
  if (path === '/map' || path === '/locations')
    return (
      <>
        <Notice title="Real public geography">
          The basemap and available OSM outlines are real. The example’s catchment, equipment and ownership
          remain fictional. Use the map controls to select a place and retrieve outlines.
        </Notice>
        <DemoMap water={null} />
      </>
    )
  if (['/register', '/property', '/verify'].includes(path))
    return (
      <Section
        title={path === '/verify' ? 'Practise catchment correction' : 'Illustrative property information'}
      >
        <div className="metrics-grid three">
          <Metric
            label="Example catchment"
            value={number(inputs.area_m2)}
            unit="m²"
            detail="Illustrative · never field verified"
          />
          <Metric
            label="Example tank"
            value={number(inputs.capacity_l)}
            unit="L"
            detail="Assumed capacity"
          />
          <Metric
            label="Example demand"
            value={number(inputs.daily_demand_l)}
            unit="L/day"
            detail="Assumed non-potable demand"
          />
        </div>
        <p>
          Adjust the profile and area controls above to practise the workflow. This browser exercise cannot
          register a building, upload evidence or verify a real rooftop.
        </p>
        <PropertySamples result={result} />
      </Section>
    )
  if (path === '/water-sources' || path === '/consumption') {
    const rows =
      path === '/water-sources'
        ? data.supply.map((item) => ({ label: item.source, volume: item.volume_l }))
        : data.consumption.map((item) => ({ label: item.use, volume: item.volume_l }))
    return (
      <Section
        title={
          path === '/water-sources'
            ? 'Illustrative 48-hour supply mix'
            : 'Fictional 48-hour demand allocation'
        }
      >
        <Metric
          label="Example demand"
          value={number(calculation.demand_l)}
          unit="L"
          detail="Two synthetic days; no actual ledger"
        />
        <DataTable headings={['Simulated source / use', 'Volume', 'Evidence']}>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{number(row.volume)} L</td>
              <td>
                <Chip tone="amber">Fictional example</Chip>
              </td>
            </tr>
          ))}
        </DataTable>
        <p>
          Tank supply comes from the model. Municipal fallback and the consumption split are invented
          assumptions; no delivery or water-use record is created.
        </p>
      </Section>
    )
  }
  if (path === '/maintenance')
    return (
      <Section title="Practice monsoon readiness">
        <div className="metrics-grid three">
          <Metric label="Example harvestable inflow" value={number(calculation.net_inflow_l)} unit="L" />
          <Metric
            label="Initial available capacity"
            value={number(calculation.capacity_l - calculation.initial_storage_l)}
            unit="L"
          />
          <Metric label="Example overflow" value={number(calculation.overflow_l)} unit="L" />
        </div>
        <p>
          These checkboxes are a practice exercise. No inspection date, performed task or confirmed fault is
          saved.
        </p>
        <div className="feature-checklist">
          {[
            'Roof cleaning',
            'Drain inspection',
            'Filter inspection',
            'Tank cleaning',
            'First-flush readiness',
            'Safe overflow route',
          ].map((task) => (
            <label key={task}>
              <input
                type="checkbox"
                checked={checks.includes(task)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setChecks((current) =>
                    checked ? [...current, task] : current.filter((item) => item !== task),
                  )
                }}
              />
              {task}
              <Chip tone="amber">Practice only</Chip>
            </label>
          ))}
        </div>
        <p role="status">
          {checks.length} of 6 practice checks selected. Real maintenance status is unconfirmed.
        </p>
      </Section>
    )
  if (path === '/quality')
    return (
      <Section title="Illustrative test record">
        <div className="form-grid">
          {[
            { field: 'ph' as const, label: 'Simulated pH', max: 14 },
            { field: 'tds' as const, label: 'Simulated TDS (mg/L)', max: 100000 },
            { field: 'turbidity' as const, label: 'Simulated turbidity (NTU)', max: 100000 },
          ].map((item) => (
            <Field key={item.field} label={item.label}>
              <input
                type="number"
                min={0}
                max={item.max}
                step="any"
                value={quality[item.field]}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  setQuality((current) => ({ ...current, [item.field]: value }))
                }}
              />
            </Field>
          ))}
        </div>
        <DataTable headings={['Parameter', 'Fictional value', 'Verification']}>
          <tr>
            <td>pH</td>
            <td>{quality.ph}</td>
            <td>Not a laboratory result</td>
          </tr>
          <tr>
            <td>TDS</td>
            <td>{quality.tds} mg/L</td>
            <td>Not a laboratory result</td>
          </tr>
          <tr>
            <td>Turbidity</td>
            <td>{quality.turbidity} NTU</td>
            <td>Not a laboratory result</td>
          </tr>
        </DataTable>
        <Notice tone="warning" title="Suitability remains unestablished">
          Changing sample values does not certify drinking-water safety or suitability for a particular
          non-potable use. Microbiological/chemical testing, intended use and treatment still require
          professional assessment.
        </Notice>
      </Section>
    )
  if (path === '/groundwater')
    return (
      <Section title="Recharge screening stops at missing evidence">
        <Field label="Structure to discuss with a professional">
          <select value={structure} onChange={(event) => setStructure(event.currentTarget.value)}>
            {['Recharge pit', 'Recharge well', 'Recharge trench', 'Percolation system'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Notice title={`${structure}: field assessment required`} tone="warning">
          Groundwater depth and soil infiltration remain unavailable. The simulator does not invent them.
        </Notice>
        <ul>
          <li>Field infiltration and site dimensions</li>
          <li>Groundwater depth, quality and aquifer conditions</li>
          <li>Contamination risks and foundation setbacks</li>
          <li>Permissions and structural constraints</li>
        </ul>
        <Evidence title="Backend screening outcome" value={data.groundwater} />
      </Section>
    )
  if (path === '/historical')
    return (
      <Section title="Invented annual rainfall distribution">
        <p>
          This is a synthetic {data.historical.year} example totalling{' '}
          {number(data.historical.annual_rainfall_mm)} mm. It does not describe any actual Indian location.
        </p>
        <DataTable headings={['Example month', 'Invented rainfall']}>
          {data.historical.monthly.map((item) => (
            <tr key={item.month}>
              <td>
                {
                  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
                    item.month - 1
                  ]
                }
              </td>
              <td>{number(item.rainfall_mm, 1)} mm</td>
            </tr>
          ))}
        </DataTable>
        <p>
          Adjust “Invented annual rainfall” in the assumption controls to compare the pattern. Live historical
          views use separately retrieved provider data.
        </p>
      </Section>
    )
  if (path === '/forecast')
    return (
      <Section title="Synthetic hourly rainfall">
        <p>
          This is an invented 48-hour event pattern, not a live forecast or dynamically calculated tomorrow.
        </p>
        <DataTable headings={['Example hour', 'Synthetic rain', 'Modelled net inflow']}>
          {calculation.hourly.map((hour, index) => (
            <tr key={hour.time}>
              <td>{index + 1}</td>
              <td>{number(hour.rainfall_mm, 2)} mm</td>
              <td>{number(hour.net_inflow_l, 1)} L</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    )
  if (path === '/twin')
    return (
      <>
        <div className="metrics-grid three">
          <Metric label="Modelled inflow" value={number(calculation.net_inflow_l)} unit="L" />
          <Metric label="Modelled overflow" value={number(calculation.overflow_l)} unit="L" />
          <Metric label="Balance residual" value={number(calculation.balance_error_l, 5)} unit="L" />
        </div>
        <WaterScene key={JSON.stringify(inputs)} simulation={calculation} onFrame={onFrame} />
      </>
    )
  if (path === '/optimiser')
    return (
      <Section title="Annual storage comparison on synthetic rainfall">
        <DataTable headings={['Capacity', 'Modelled supply', 'Overflow', 'Unmet demand', 'Cost']}>
          {data.annual_sizing.comparisons.map((item) => (
            <tr key={item.capacity_l}>
              <td>{number(item.capacity_l)} L</td>
              <td>{number(item.simulation.water_supplied_l)} L</td>
              <td>{number(item.simulation.overflow_l)} L</td>
              <td>{number(item.simulation.unmet_demand_l)} L</td>
              <td>Quotation unavailable</td>
            </tr>
          ))}
        </DataTable>
        <Evidence
          title="Candidate-relative range and limitations"
          value={{
            recommended_range_l: data.annual_sizing.recommended_range_l,
            reasons: data.annual_sizing.reasons,
            limitations: data.annual_sizing.limitations,
          }}
        />
      </Section>
    )
  if (path === '/community-budget')
    return (
      <Section title="Fictional budget-constrained investment">
        <div className="metrics-grid three">
          <Metric
            label="Illustrative selected cost"
            value={number(result.community.total_cost_inr)}
            unit="₹"
          />
          <Metric
            label="Additional 48-hour supplied water"
            value={number(result.community.period_benefit_l)}
            unit="L"
          />
          <Metric
            label="Remaining example budget"
            value={number(result.community.budget_remaining_inr)}
            unit="₹"
          />
        </div>
        {result.community.selected.length ? (
          <DataTable headings={['Fictional property', 'Tank', 'Indicative cost', 'Additional supply']}>
            {result.community.selected.map((item) => (
              <tr key={item.property_id}>
                <td>{item.property_name}</td>
                <td>{number(item.capacity_l)} L</td>
                <td>₹{number(item.cost_inr)}</td>
                <td>{number(item.period_benefit_l)} L</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Notice title="No beneficial affordable upgrade in this example">
            Adjust the illustrative budget or rainfall. The solver does not invent a positive benefit when the
            inputs show none.
          </Notice>
        )}
        <Evidence
          title="Objective and alternatives"
          value={{ method: result.community.method, alternatives: result.community.alternatives }}
        />
      </Section>
    )
  if (['/observations', '/calibration'].includes(path))
    return (
      <Section title="Fictional prediction-versus-reading exercise">
        <Metric
          label="Sample mean absolute error"
          value={number(data.performance.mae_l, 1)}
          unit="L"
          detail="Synthetic pairs only · not actual forecast accuracy"
        />
        {data.performance.pairs.length ? (
          <DataTable headings={['Sample', 'Predicted volume', 'Simulated reading']}>
            {data.performance.pairs.map((item) => (
              <tr key={item.sample}>
                <td>Fictional {item.sample}</td>
                <td>{number(item.predicted_l, 1)} L</td>
                <td>{number(item.simulated_reading_l, 1)} L</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Notice>
            No wet sample pairs exist under this example’s net inflow. Actual observations remain
            unavailable.
          </Notice>
        )}
        <Notice title="Actual calibration is blocked" tone="warning">
          {data.performance.reason} No measurement, calibration record or trained model is created.
        </Notice>
      </Section>
    )
  if (['/community', '/commercial', '/municipal'].includes(path))
    return (
      <Section title={path === '/municipal' ? 'Fictional municipal view' : 'Fictional property comparison'}>
        <div className="metrics-grid three">
          <Metric
            label="Fictional buildings"
            value={number(data.community.fictional_count)}
            detail="Zero actual registrations created"
          />
          <Metric label="Verified rooftop area" value="0" unit="m²" detail="Example areas are assumptions" />
          <Metric label="Modelled combined inflow" value={number(data.community.net_inflow_l)} unit="L" />
        </div>
        <PropertySamples result={result} />
        {path === '/municipal' && (
          <Notice title="Preview does not grant municipal access">
            The real municipal dashboard requires an authorised role and sharing consent. This public
            fictional comparison contains no private records.
          </Notice>
        )}
      </Section>
    )
  if (path === '/assistant') {
    const answers: Record<string, string> = {
      collection: `The backend example calculates ${number(calculation.net_inflow_l)} L of net harvestable inflow after ${number(calculation.first_flush_l)} L of first flush and ${number(calculation.collection_loss_l)} L of collection losses.`,
      overflow: `The backend water balance estimates ${number(calculation.overflow_l)} L of overflow and ${number(calculation.final_storage_l)} L of ending storage for this fictional tank.`,
      limits:
        'Roof area, rainfall, tank state, demand and the annual seasonal shape are fictional. No quality, aquifer, inspection or field-verification facts are established.',
    }
    return (
      <Section title="Ask about this simulated example">
        <Field label="Question for the example assistant">
          <select value={question} onChange={(event) => setQuestion(event.currentTarget.value)}>
            <option value="collection">How much water could be collected?</option>
            <option value="overflow">Could the tank overflow?</option>
            <option value="limits">Which inputs still need verification?</option>
          </select>
        </Field>
        <div className="feature-assistant-answer" role="status">
          {answers[question]}
          <p>Source: deterministic demo backend. Fictional input data; no paid LLM required.</p>
        </div>
      </Section>
    )
  }
  if (path === '/sources')
    return (
      <Section title="Understand the source boundaries">
        <DataTable headings={['Source', 'Purpose', 'Preview status']}>
          {[
            [
              'OpenStreetMap',
              'Basemap and building outlines',
              'Real public geography when requested on the map',
            ],
            ['Open-Meteo', 'Coordinate-specific weather', 'Live workspace only; rainfall here is synthetic'],
            [
              'Open-Meteo Archive / approved IMD',
              'Regional historical context',
              'This preview uses an invented annual pattern',
            ],
            [
              'Owner measurements',
              'Catchment, storage and actual collected water',
              'Absent from this fictional example',
            ],
            ['Groundwater and soil', 'Professional recharge screening', 'No values invented'],
            ['Optional AI', 'Explain backend facts', 'Not required for this preview'],
          ].map((row) => (
            <tr key={row[0]}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </DataTable>
        <p>
          The actual data-source status page reports configured connections and failures. This explanatory
          table is not a live provider health check.
        </p>
      </Section>
    )
  if (path === '/settings')
    return (
      <Section title="Configuration practice">
        <p>
          Use the profile, rainfall, catchment, storage and collection controls above. Reset restores this
          browser example. Production locality, provider credentials, permissions and records are never
          modified.
        </p>
        <Evidence title="Current illustrative configuration" value={inputs} />
      </Section>
    )
  return (
    <Section
      title={path === '/recommendations' ? 'Explainable example actions' : 'Every litre accounted for'}
    >
      <div className="metrics-grid three">
        <Metric label="Example gross runoff" value={number(calculation.gross_runoff_l)} unit="L" />
        <Metric label="Example first flush" value={number(calculation.first_flush_l)} unit="L" />
        <Metric label="Example net inflow" value={number(calculation.net_inflow_l)} unit="L" />
      </div>
      <DataTable headings={['Water-balance item', 'Modelled volume']}>
        {[
          ['Initial storage', calculation.initial_storage_l],
          ['Net inflow', calculation.net_inflow_l],
          ['Supplied demand', calculation.water_supplied_l],
          ['Overflow', calculation.overflow_l],
          ['Ending storage', calculation.final_storage_l],
          ['Balance residual', calculation.balance_error_l],
        ].map(([label, volume]) => (
          <tr key={String(label)}>
            <td>{label}</td>
            <td>{number(Number(volume), 2)} L</td>
          </tr>
        ))}
      </DataTable>
      {path === '/recommendations' && (
        <Notice title="Preliminary next steps">
          Compare annual tank examples, measure connected catchment, inspect drains and filters, and obtain
          installation quotations.{' '}
          {calculation.overflow_l > 0
            ? 'This simulated event also shows overflow: discuss a safe overflow route.'
            : 'No overflow appears in this example; that is not a guarantee about future rainfall.'}{' '}
          Recharge and structural suitability require field engineering.
        </Notice>
      )}
    </Section>
  )
}

function PropertySamples({ result }: { result: DemoResult }) {
  return (
    <DataTable headings={['Fictional property', 'Assumed area', 'Assumed tank', 'Modelled inflow', 'Status']}>
      {result.workspace!.properties.map((item) => (
        <tr key={item.id}>
          <td>{item.name}</td>
          <td>{number(item.area_m2)} m²</td>
          <td>{number(item.current_capacity_l)} L</td>
          <td>{number(item.net_inflow_l)} L</td>
          <td>
            <Chip tone="amber">Not registered · unverified</Chip>
          </td>
        </tr>
      ))}
    </DataTable>
  )
}
