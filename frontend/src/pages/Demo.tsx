import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, MotionConfig, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CloudRain,
  Droplets,
  FlaskConical,
  Info,
  RotateCcw,
  ShieldCheck,
  Users,
  Waves,
} from 'lucide-react'
import { Button, DataTable, Evidence, number } from '../components/ui'
import DemoMap from '../features/demo/DemoMap'
import WaterScene from '../features/demo/WaterScene'
import {
  defaults,
  profiles,
  tour,
  type DemoInputs,
  type DemoResult,
  type FlowFrame,
} from '../features/demo/data'
import { useDemo } from '../features/demo/useDemo'
import '../features/demo/demo.css'

export default function DemoPage() {
  const [inputs, setInputs] = useState<DemoInputs>(defaults)
  const [guided, setGuided] = useState(true)
  const [step, setStep] = useState(0)
  const [revision, setRevision] = useState(0)
  const [water, setWater] = useState<{ key: string; frame: FlowFrame } | null>(null)
  const story = useRef<HTMLHeadingElement>(null)
  const reduced = useReducedMotion()
  const { result, error, key } = useDemo(inputs, revision)
  const updateFrame = useCallback((frame: FlowFrame) => setWater({ key, frame }), [key])
  const calculation = result?.calculation
  const profile = profiles.find((item) => item.id === inputs.profile)!
  function update(name: keyof DemoInputs, value: number) {
    setInputs((current) => ({
      ...current,
      [name]: value,
      ...(name === 'rainfall_mm'
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
  }
  function selectProfile(id: DemoInputs['profile']) {
    const profile = profiles.find((item) => item.id === id)!
    setInputs((current) => ({
      ...current,
      profile: id,
      area_m2: profile.area_m2,
      capacity_l: profile.capacity_l,
      daily_demand_l: profile.daily_demand_l,
    }))
  }
  function advance(next: number) {
    setStep(next)
    window.setTimeout(() => story.current?.focus({ preventScroll: true }), 0)
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="demo-page">
        <a className="skip-link" href="#demo-main">
          Skip to demonstration
        </a>
        <header className="demo-header">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Droplets size={24} />
            </span>
            <span>
              VARSHIQ<small>BUILDING & COMMUNITY WATER INTELLIGENCE</small>
            </span>
          </Link>
          <div className="demo-header-actions">
            <span className="demo-status">
              <FlaskConical size={15} />
              Simulation mode
            </span>
            <Link to="/" className="button secondary">
              <ArrowLeft size={15} />
              Exit demo
            </Link>
          </div>
        </header>
        <div className="demo-disclosure" role="note">
          <FlaskConical size={17} />
          <span>
            <strong>Simulated demonstration data.</strong> The map and sourced building outlines are real.
            Rainfall, roof catchment, tanks, demand and costs are illustrative.
          </span>
        </div>
        <main id="demo-main" className="demo-main">
          <div className="demo-intro">
            <div>
              <span className="eyebrow">PREDICT THE RAIN. HARVEST EVERY DROP.</span>
              <h1>Real places. A water model you can explore.</h1>
              <p>
                Discover how VARSHIQ connects buildings, rain, storage and demand—without creating an account.
              </p>
            </div>
            <div className="segmented">
              <button
                aria-pressed={guided}
                className={guided ? 'selected' : ''}
                onClick={() => setGuided(true)}
              >
                Guided tour
              </button>
              <button
                aria-pressed={!guided}
                className={!guided ? 'selected' : ''}
                onClick={() => setGuided(false)}
              >
                Explore freely
              </button>
            </div>
          </div>
          <div className="inline-actions"><Link to="/demo/features" className="button secondary">Explore the workspace <ArrowRight size={15} /></Link></div>
          {guided && (
            <section className="demo-tour" aria-label="Guided introduction">
              <nav aria-label="Guided tour steps">
                {tour.map((item, index) => (
                  <button
                    key={item.title}
                    aria-current={step === index ? 'step' : undefined}
                    className={step === index ? 'active' : ''}
                    onClick={() => advance(index)}
                  >
                    <span>{index + 1}</span>
                    {item.title}
                  </button>
                ))}
              </nav>
              <motion.div
                className="demo-tour-story"
                key={step}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div>
                  <span className="eyebrow">{tour[step].label}</span>
                  <h2 ref={story} tabIndex={-1}>
                    {tour[step].heading}
                  </h2>
                  <p>{tour[step].text}</p>
                </div>
                <div className="demo-tour-takeaway">
                  <Info size={18} />
                  <p>{tour[step].takeaway}</p>
                  <div>
                    <Button variant="ghost" disabled={step === 0} onClick={() => advance(step - 1)}>
                      <ArrowLeft size={14} />
                      Previous
                    </Button>
                    {step < tour.length - 1 ? (
                      <Button variant="secondary" onClick={() => advance(step + 1)}>
                        Next step
                        <ArrowRight size={14} />
                      </Button>
                    ) : (
                      <Link className="button primary" to="/register">
                        Start with a real property
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            </section>
          )}
          <div className="demo-profile-bar">
            <span>Illustrative example</span>
            <div>
              {profiles.map((item) => (
                <button
                  className={inputs.profile === item.id ? 'active' : ''}
                  key={item.id}
                  aria-pressed={inputs.profile === item.id}
                  onClick={() => selectProfile(item.id)}
                >
                  {item.id === 'home' ? (
                    <Building2 size={16} />
                  ) : item.id === 'office' ? (
                    <Waves size={16} />
                  ) : (
                    <Users size={16} />
                  )}
                  {item.name}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setInputs({ ...defaults })}>
              <RotateCcw size={15} />
              Reset inputs
            </Button>
          </div>
          <div className="demo-workbench">
            <DemoMap water={result && water?.key === key ? water.frame : null} />
            <div className="demo-scene-column">
              <div className="demo-weather-presets" aria-label="Synthetic rainfall examples">
                <button
                  aria-pressed={inputs.weather === 'dry'}
                  onClick={() => setInputs((current) => ({ ...current, weather: 'dry', rainfall_mm: 0 }))}
                >
                  Dry spell
                </button>
                <button
                  aria-pressed={inputs.weather === 'steady'}
                  onClick={() => setInputs((current) => ({ ...current, weather: 'steady', rainfall_mm: 24 }))}
                >
                  Steady rain
                </button>
                <button
                  aria-pressed={inputs.weather === 'bursts' && inputs.rainfall_mm === 90}
                  onClick={() => setInputs((current) => ({ ...current, weather: 'bursts', rainfall_mm: 90 }))}
                >
                  <CloudRain size={15} />
                  Heavy bursts
                </button>
              </div>
              <div className="demo-model-status" data-testid="demo-model-status" role="status">
                {error
                  ? 'Simulation unavailable'
                  : result
                    ? 'Simulation ready · Python WaterTwin engine'
                    : 'Updating the simulated water balance…'}
              </div>
              {result ? (
                <WaterScene key={key} simulation={result.calculation} onFrame={updateFrame} />
              ) : (
                <div className="demo-scene-placeholder">
                  {error ? (
                    <>
                      <ShieldCheck size={32} />
                      <h2>The explanation is still available.</h2>
                      <p role="alert">{error}</p>
                      <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                        Retry simulation
                      </Button>
                    </>
                  ) : (
                    <>
                      <Droplets size={36} />
                      <h2>Calculating the example</h2>
                      <p>
                        Tracing runoff, diversion, demand and storage. Previous input results are hidden while
                        this updates.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <section className="demo-input-section" aria-labelledby="demo-input-title">
            <div className="demo-section-heading">
              <div>
                <span className="eyebrow">CHANGE AN ASSUMPTION. SEE WHAT HAPPENS.</span>
                <h2 id="demo-input-title">Make the example your own.</h2>
                <p>{profile.description} These settings do not verify the selected real building.</p>
              </div>
            </div>
            <div className="demo-controls-grid">
              <Control
                label="Synthetic rainfall over 48 hours"
                value={inputs.rainfall_mm}
                min={0}
                max={120}
                step={1}
                unit="mm"
                onChange={(value) => update('rainfall_mm', value)}
              />
              <Control
                label="Illustrative connected roof area"
                value={inputs.area_m2}
                min={10}
                max={5000}
                step={10}
                unit="m²"
                onChange={(value) => update('area_m2', value)}
              />
              <Control
                label="Example tank capacity"
                value={inputs.capacity_l}
                min={100}
                max={50000}
                step={100}
                unit="L"
                onChange={(value) => update('capacity_l', value)}
              />
              <Control
                label="Illustrative daily water demand"
                value={inputs.daily_demand_l}
                min={0}
                max={30000}
                step={50}
                unit="L/day"
                onChange={(value) => update('daily_demand_l', value)}
              />
              <Control
                label="Starting tank level assumption"
                value={inputs.initial_storage_pct}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(value) => update('initial_storage_pct', value)}
              />
              <div className="demo-assumption-note">
                <Info size={18} />
                <p>
                  Runoff coefficient <strong>{inputs.runoff_coefficient}</strong> · first flush{' '}
                  <strong>{inputs.first_flush_mm} mm/event</strong> · collection efficiency{' '}
                  <strong>{inputs.collection_efficiency * 100}%</strong>. Illustrative parameters; actual
                  sites need documented assumptions.
                </p>
              </div>
            </div>
          </section>
          {calculation && (
            <>
              <div className="demo-result-grid">
                <Result label="48-hour harvestable inflow" value={calculation.net_inflow_l} unit="L" />
                <Result label="Potential overflow" value={calculation.overflow_l} unit="L" />
                <Result label="Demand supplied in example" value={calculation.water_supplied_l} unit="L" />
                <Result label="Storage at hour 48" value={calculation.final_storage_l} unit="L" />
              </div>
              <div className="demo-balance">
                <Check size={18} />
                <span>
                  {number(calculation.initial_storage_l)} L start + {number(calculation.net_inflow_l)} L net
                  inflow = {number(calculation.final_storage_l)} L end +{' '}
                  {number(calculation.water_supplied_l)} L supplied + {number(calculation.overflow_l)} L
                  overflow
                </span>
                <small>Balance residual: {number(calculation.balance_error_l, 6)} L</small>
              </div>
              <section className="demo-breakdown">
                <h2>What happened before water reached storage?</h2>
                <div>
                  <p>
                    <span>Roof runoff</span>
                    <strong>{number(calculation.gross_runoff_l)} L</strong>
                  </p>
                  <p>
                    <span>First-flush diversion · {calculation.events.length} event(s)</span>
                    <strong>{number(calculation.first_flush_l)} L</strong>
                  </p>
                  <p>
                    <span>Filter / conveyance losses</span>
                    <strong>{number(calculation.collection_loss_l)} L</strong>
                  </p>
                  <p>
                    <span>Unmet demand</span>
                    <strong>{number(calculation.unmet_demand_l)} L</strong>
                  </p>
                </div>
                <p className="demo-action">
                  <strong>Action to consider:</strong>{' '}
                  {calculation.overflow_l > 0
                    ? 'Inspect the overflow route, check filters and compare storage before the event. More capacity still needs a site and cost assessment.'
                    : inputs.rainfall_mm === 0
                      ? 'A dry period draws down starting storage. Plan other authorised water sources for demand the tank cannot supply.'
                      : 'Check filters and the current tank reading before rain. This example does not establish actual water collection.'}
                </p>
              </section>
              <Storage result={result!} />
              <Community
                result={result!}
                budget={inputs.budget_inr}
                onBudget={(value) => update('budget_inr', value)}
              />
              <Evidence
                title="Inspect simulation inputs, event records and assumptions"
                value={{
                  inputs: result!.inputs,
                  source: result!.rainfall_source,
                  assumptions: result!.assumptions,
                  events: calculation.events,
                }}
              />
            </>
          )}
          <section className="demo-purpose" aria-labelledby="demo-purpose-title">
            <div>
              <span className="eyebrow">THE VALUE BEYOND A CALCULATOR</span>
              <h2 id="demo-purpose-title">Understand. Prepare. Measure. Improve.</h2>
              <ul>
                <li>See when storage may fill and prepare drains, filters and overflow routes.</li>
                <li>Compare useful water supply against intended demand and storage constraints.</li>
                <li>Learn from actual observations instead of treating a forecast as harvested water.</li>
                <li>Help communities compare evidence and priorities with a limited budget.</li>
              </ul>
            </div>
            <div>
              <span className="eyebrow">WHAT THE IDEA CANNOT PROMISE</span>
              <h2>Make the limits visible.</h2>
              <ul>
                <li>Forecasts are estimates; simulated rain here is not a live forecast.</li>
                <li>A real outline does not verify catchment area, tank readings or groundwater.</li>
                <li>
                  Site costs, structural loads, recharge and drinking-water safety need appropriate field and
                  professional checks.
                </li>
                <li>
                  Good software needs reliable measurements, maintenance and provider access. Calibration
                  requires enough trustworthy observations.
                </li>
              </ul>
            </div>
          </section>
          <div className="demo-next">
            <div>
              <h2>Ready to connect your actual roof?</h2>
              <p>Your private workspace starts empty. Demo inputs never become property records.</p>
            </div>
            <Link to="/register" className="button primary">
              Create your real water picture
              <ArrowRight size={17} />
            </Link>
          </div>
        </main>
        <footer className="demo-footer">
          <span>VARSHIQ · Predict the Rain. Harvest Every Drop.</span>
          <span>Real map · simulated water · transparent assumptions</span>
          <Link to="/">Return to Sign in</Link>
        </footer>
      </div>
    </MotionConfig>
  )
}
function Control({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="demo-control">
      <div>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {number(value)} <small>{unit}</small>
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${number(value)} ${unit}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="demo-range-bounds">
        <span>
          {number(min)} {unit}
        </span>
        <span>
          {number(max)} {unit}
        </span>
      </div>
    </div>
  )
}
function Result({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {number(value)} <small>{unit}</small>
      </strong>
      <p>Simulation estimate</p>
    </div>
  )
}
function Storage({ result }: { result: DemoResult }) {
  return (
    <section className="demo-storage">
      <div className="demo-section-heading">
        <div>
          <span className="eyebrow">STORAGE CHOICES</span>
          <h2>Compare the same rainfall with different tanks.</h2>
          <p>
            Each alternative starts empty. A 48-hour example explains behaviour; it does not replace seasonal
            sizing.
          </p>
        </div>
      </div>
      <DataTable
        label="Simulated storage comparisons"
        headings={['Tank capacity', 'Demand supplied', 'Overflow', 'Water remaining', 'Unmet demand']}
      >
        {result.storage_comparisons.map((option) => (
          <tr key={option.capacity_l}>
            <td>
              <strong>{number(option.capacity_l)} L</strong>
              {option.capacity_l === result.inputs.capacity_l && <small>Selected example capacity</small>}
            </td>
            <td>{number(option.water_supplied_l)} L</td>
            <td>{number(option.overflow_l)} L</td>
            <td>{number(option.final_storage_l)} L</td>
            <td>{number(option.unmet_demand_l)} L</td>
          </tr>
        ))}
      </DataTable>
    </section>
  )
}
function Community({
  result,
  budget,
  onBudget,
}: {
  result: DemoResult
  budget: number
  onBudget: (budget: number) => void
}) {
  return (
    <section className="demo-community">
      <div className="demo-section-heading">
        <div>
          <span className="eyebrow">FICTIONAL COMMUNITY · INDICATIVE COSTS</span>
          <h2>One budget. Three buildings. Explainable choices.</h2>
          <p>
            Uses the same synthetic rainfall, empty initial tanks and the real investment solver. These are
            fictional buildings, separate from mapped outlines.
          </p>
        </div>
      </div>
      <div className="demo-community-grid">
        <Control
          label="Illustrative community budget"
          value={budget}
          min={0}
          max={200000}
          step={1000}
          unit="₹"
          onChange={onBudget}
        />
        <div className="demo-budget-result">
          <span>Additional demand supplied over 48 hours</span>
          <strong>
            {number(result.community.period_benefit_l)} <small>L</small>
          </strong>
          <p>
            ₹{number(result.community.total_cost_inr)} selected · ₹
            {number(result.community.budget_remaining_inr)} remaining
          </p>
        </div>
      </div>
      <div className="demo-investment-buildings">
        {result.community.buildings.map((building) => {
          const selected = result.community.selected.find((item) => item.property_id === building.id)
          return (
            <article key={building.id} className={selected ? 'selected' : ''}>
              <div>
                <Building2 size={21} />
                <span>{selected ? 'Selected in this example' : 'No upgrade selected'}</span>
              </div>
              <h3>{building.name}</h3>
              <p>
                {number(building.area_m2)} m² assumed catchment · {number(building.daily_demand_l)} L/day
                assumed demand
              </p>
              {selected ? (
                <>
                  <strong>
                    {number(selected.capacity_l)} L candidate · ₹{number(selected.cost_inr)}
                  </strong>
                  <p>{number(selected.period_benefit_l)} L additional example supply</p>
                </>
              ) : (
                <p>
                  Existing {number(building.current_capacity_l)} L tank retained. Budget, additional benefit
                  and competing options determine selection.
                </p>
              )}
            </article>
          )
        })}
      </div>
      {!result.community.selected.length && (
        <p className="demo-inline-warning">
          No upgrade selected: the current rainfall/budget yields no eligible positive additional supply.
          Missing benefit is not replaced with an invented saving.
        </p>
      )}
      <Evidence
        title="Compared indicative options and exact selection method"
        value={{
          method: result.community.method,
          alternatives: result.community.alternatives,
          selected: result.community.selected,
        }}
      />
    </section>
  )
}
