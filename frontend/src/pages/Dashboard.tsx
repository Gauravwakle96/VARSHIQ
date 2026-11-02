import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Check,
  CloudRain,
  Download,
  Droplets,
  MapPin,
  Plus,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import { query, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Community, Property } from '../types'
import {
  Button,
  Chip,
  DataTable,
  ErrorState,
  Evidence,
  Field,
  Loading,
  Metric,
  modelReady,
  Notice,
  number,
  PageTitle,
  Section,
  Verification,
} from '../components/ui'

export default function Dashboard({
  mode = 'overview',
}: {
  mode?: 'overview' | 'commercial' | 'municipal' | 'community'
}) {
  const { user, properties, property, propertiesLoading, propertiesAvailable, selectProperty } =
    useWorkspace()
  const [locality, setLocality] = useState('')
  const [propertyType, setPropertyType] = useState(mode === 'commercial' ? 'commercial' : '')
  const navigate = useNavigate()
  const municipal = mode === 'municipal'
  const municipalAllowed = ['municipal', 'admin'].includes(user?.role ?? '')
  const summary = useApi<Community>(
    municipal && !municipalAllowed
      ? null
      : `/dashboard/${municipal ? 'municipal' : 'locality'}?${query({ locality, property_type: propertyType })}`,
  )
  const data = summary.error ? null : summary.data
  const visible = (data?.properties ?? (municipal ? [] : properties)).filter(
    (item) =>
      (!propertyType || item.property_type === propertyType) && (!locality || item.locality === locality),
  )
  const hasRecordBasis = Boolean(data || (!municipal && propertiesAvailable))
  const count = hasRecordBasis ? (data?.registered_count ?? visible.length) : null
  const verifiedArea = hasRecordBasis
    ? (data?.verified_rooftop_m2 ??
      visible
        .filter((item) => item.measurement_status === 'field_verified')
        .reduce((total, item) => total + (item.effective_catchment_m2 ?? 0), 0))
    : null
  const totalCapacity = hasRecordBasis
    ? (data?.storage_capacity_l ?? visible.reduce((total, item) => total + item.tank_capacity_l, 0))
    : null
  const typeDetail = hasRecordBasis
    ? `${data?.residential_count ?? visible.filter((item) => item.property_type === 'residential').length} residential · ${data?.commercial_count ?? visible.filter((item) => item.property_type === 'commercial').length} commercial · ${data?.apartment_count ?? visible.filter((item) => item.property_type === 'apartment').length} apartment · ${data?.community_count ?? visible.filter((item) => item.property_type === 'community').length} community`
    : 'Registered totals are unavailable'
  function open(item: Property) {
    selectProperty(item.id)
    navigate('/property')
  }
  const title =
    mode === 'community'
      ? 'Your locality, connected.'
      : municipal
        ? 'Municipal water intelligence'
        : mode === 'commercial'
          ? 'Commercial property intelligence'
          : `A clearer view of your water.`
  if (municipal && !municipalAllowed)
    return (
      <>
        <PageTitle
          eyebrow="COMMUNITY WATER NETWORK"
          title={title}
          description="Review consented community aggregates with their measurement and forecast limitations."
        />
        <Notice title="Municipal access required" tone="info">
          An authorised municipal or administrator role is required to view consented aggregates. Your private
          property records remain available in your workspace.
        </Notice>
        <Link to="/" className="button secondary">
          Return to your overview
          <ArrowRight size={17} />
        </Link>
      </>
    )
  return (
    <>
      <PageTitle
        eyebrow={
          mode === 'overview'
            ? `WELCOME BACK, ${user?.name.split(' ')[0].toUpperCase()}`
            : 'COMMUNITY WATER NETWORK'
        }
        title={title}
        description={
          mode === 'overview'
            ? 'From your rooftop to your tank. Understand rainfall, plan storage and record what happens in the field.'
            : municipal
              ? 'Review consented community aggregates with their measurement and forecast limitations.'
              : 'Understand harvesting opportunities across your genuine registered properties.'
        }
        action={
          <Link to="/register" className="button primary">
            <Plus size={17} />
            Register property
          </Link>
        }
      />
      <div className="metrics-grid">
        <Metric label="Registered properties" value={number(count)} detail={typeDetail} />
        <Metric
          label="Verified catchment"
          value={number(verifiedArea, 1)}
          unit="m²"
          detail="Field measurements recorded"
        />
        <Metric
          label="Existing storage"
          value={number(totalCapacity)}
          unit="L"
          detail="From registered tank inputs"
        />
        <Metric
          label="Forecast collection potential"
          value={number(data?.forecast_potential_l)}
          unit="L"
          detail={
            data?.forecast_potential_l == null
              ? 'Run property WaterTwins to calculate'
              : 'Model estimate · see source assumptions'
          }
          tone="teal"
        />
      </div>
      {summary.error && <ErrorState error={summary.error} retry={summary.reload} />}
      {summary.error && !municipal && propertiesAvailable && (
        <Notice title="Registered-record snapshot" tone="warning">
          Property counts, verified catchment and tank inputs use the available workspace records. Forecast
          aggregates require a successful refresh.
        </Notice>
      )}
      {municipal && (
        <Notice title="Aggregate access" tone="info">
          Municipal views require an authorised municipal or administrator role. Only properties that consent
          to aggregate sharing contribute; private geometry and owner details are excluded.
        </Notice>
      )}
      {mode !== 'overview' && (
        <div className="filter-bar">
          <Field label="Locality">
            <select value={locality} onChange={(event) => setLocality(event.target.value)}>
              <option value="">All available localities</option>
              {Array.from(new Set(properties.map((item) => item.locality))).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Property type">
            <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
              <option value="">All property types</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="apartment">Apartment society</option>
              <option value="community">Community</option>
            </select>
          </Field>
          <Button variant="secondary" onClick={summary.reload}>
            Refresh aggregate
          </Button>
        </div>
      )}
      {propertiesLoading || summary.loading ? (
        <Loading text="Loading registered property intelligence…" />
      ) : !hasRecordBasis ? (
        <Notice title="Property intelligence is unavailable" tone="warning">
          Refresh the data request to establish registered totals. Missing records do not establish an empty
          community.
        </Notice>
      ) : municipal ? (
        <Section title={count ? 'Consented community summary' : 'No consented properties in this scope'}>
          <Notice>
            {count
              ? 'The totals above include participating properties. Individual property details are private and are excluded from this municipal view.'
              : 'Only registered properties that consent to municipal aggregation contribute. Choose another locality or ask participating owners to review their sharing preference.'}
          </Notice>
          <div className="metrics-grid three">
            <Metric
              label="Properties needing verification"
              value={number(data?.unverified_count)}
              detail="Prioritise recorded catchment evidence"
            />
            <Metric
              label="Forecast overflow"
              value={number(data?.overflow_l)}
              unit="L"
              detail="From fresh WaterTwin snapshots"
            />
            <Metric
              label="Aggregation basis"
              value="Consented"
              detail="Registered properties that permit aggregate sharing"
            />
          </div>
        </Section>
      ) : !visible.length ? (
        <div className="dashboard-empty">
          <div className="welcome-water">
            <span className="eyebrow">YOUR FIRST WATER CONNECTION</span>
            <h2>
              Start with a roof.
              <br />
              <em>Build a complete water picture.</em>
            </h2>
            <p>
              Register a real building, record its effective catchment area and connect it to a live rainfall
              forecast.
            </p>
            <div className="water-path">
              <span>
                <Building2 size={20} />
                Property
              </span>
              <ArrowRight size={17} />
              <span>
                <CloudRain size={20} />
                Forecast
              </span>
              <ArrowRight size={17} />
              <span>
                <Waves size={20} />
                WaterTwin
              </span>
            </div>
            <Link to="/map" className="button primary">
              <MapPin size={17} />
              Find your building on the map
            </Link>
            <Link to="/register" className="text-link">
              Enter property details manually <ArrowRight size={15} />
            </Link>
          </div>
          <div className="getting-started">
            <div className="section-heading">
              <h2>Your setup checklist</h2>
              <Chip tone="blue">0 / 4</Chip>
            </div>
            {[
              { title: 'Register a real property', detail: 'Coordinates, property type and source.' },
              { title: 'Record catchment evidence', detail: 'Measure the roof connected to harvesting.' },
              { title: 'Add tank and demand inputs', detail: 'Capacity, current level and intended use.' },
              { title: 'Run your first WaterTwin', detail: 'Live forecast and transparent water balance.' },
            ].map((step, index) => (
              <div className="setup-step" key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
            <p className="setup-footnote">
              <ShieldCheck size={15} />
              Your workspace starts with zero properties. Every record comes from a real registration.
            </p>
          </div>
        </div>
      ) : (
        <>
          {mode === 'overview' && property && (
            <div className="dashboard-upper">
              <section className="water-banner">
                <div>
                  <span className="eyebrow light">VARSHIQ WATERTWIN</span>
                  <h2>
                    What could the next
                    <br />
                    rainfall mean for {property.name}?
                  </h2>
                  <p>Connect the latest forecast to your catchment, tank and demand.</p>
                  <div className="inline-actions">
                    <Link to="/twin" className="button light">
                      Open WaterTwin
                      <ArrowRight size={17} />
                    </Link>
                    <Link to="/forecast" className="banner-link">
                      View rainfall forecast
                    </Link>
                  </div>
                </div>
                <div className="banner-drop">
                  <Droplets size={86} strokeWidth={1} />
                  <span>RAIN → ROOF → TANK</span>
                </div>
              </section>
              <Section title="Property readiness" subtitle={property.name}>
                <div className="readiness-list">
                  {[
                    { label: 'Property registered', ok: true },
                    { label: 'Catchment measurement', ok: property.effective_catchment_m2 != null },
                    {
                      label: 'Coefficient source recorded',
                      ok: Boolean(property.coefficient_source && property.runoff_coefficient != null),
                    },
                    { label: 'Tank inputs entered', ok: property.tank_capacity_l > 0 },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className={`check-circle ${item.ok ? 'done' : ''}`}>
                        {item.ok && <Check size={12} />}
                      </span>
                      {item.label}
                    </div>
                  ))}
                </div>
                <Link className="text-link" to={modelReady(property) ? '/twin' : '/property'}>
                  {modelReady(property) ? 'Run a water forecast' : 'Complete property inputs'}
                  <ArrowRight size={15} />
                </Link>
              </Section>
            </div>
          )}
          <Section
            title={mode === 'overview' ? 'Your property network' : 'Registered property comparison'}
            subtitle="Measurements and estimates remain clearly distinguished."
            action={
              <Link className="text-link" to="/map">
                Explore map
                <ArrowRight size={15} />
              </Link>
            }
          >
            <DataTable
              headings={['Property', 'Catchment / footprint', 'Measurement status', 'Storage', 'Type', '']}
            >
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="table-property" onClick={() => open(item)}>
                      <span className="property-icon">
                        <Building2 size={19} />
                      </span>
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.property_code} · {item.locality}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <strong>{number(item.effective_catchment_m2, 1)} m²</strong>
                    <small>Footprint: {number(item.footprint_area_m2, 1)} m²</small>
                  </td>
                  <td>
                    <Verification property={item} />
                  </td>
                  <td>
                    {number(item.tank_capacity_l)} L
                    <small>
                      Current: {number(item.current_storage_l)} L · {item.storage_status}
                    </small>
                  </td>
                  <td>
                    <Chip>{item.property_type}</Chip>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${item.name}`}
                      onClick={() => open(item)}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
          {mode !== 'overview' && (
            <div className="metrics-grid three">
              <Metric
                label="Properties needing verification"
                value={number(
                  data?.unverified_count ??
                    visible.filter((item) => item.measurement_status !== 'field_verified').length,
                )}
                detail="Prioritise field catchment measurements"
              />
              <Metric
                label="Forecast overflow"
                value={number(data?.overflow_l)}
                unit="L"
                detail="Requires current WaterTwin snapshots"
              />
              <Metric
                label="Aggregation basis"
                value="Registered"
                detail="Private workspace or consented municipal scope"
              />
            </div>
          )}
        </>
      )}
      {data?.limitations?.length ? (
        <Evidence title="Aggregation sources & limitations" value={data.limitations} />
      ) : (
        <Notice title="What these totals represent">
          Catchment totals include field-verified measurements only. Forecast capture and overflow appear when
          supported by saved model results; missing results stay unavailable.
        </Notice>
      )}
      {mode !== 'overview' && (!municipal || ['municipal', 'admin'].includes(user?.role ?? '')) && (
        <div className="inline-actions">
          <a
            className="button secondary"
            href={`/api/v1/reports/locality/download?${query({ locality, property_type: propertyType, format: 'pdf', municipal: municipal ? true : undefined })}`}
            download
          >
            <Download size={16} />
            Download locality report (PDF)
          </a>
          <a
            className="button ghost"
            href={`/api/v1/reports/locality/download?${query({ locality, property_type: propertyType, format: 'html', municipal: municipal ? true : undefined })}`}
            download
          >
            <Download size={16} />
            HTML assessment
          </a>
        </div>
      )}
      {mode === 'overview' && (
        <div className="quick-tools">
          <Link to="/forecast">
            <CloudRain size={21} />
            <div>
              <strong>Rainfall intelligence</strong>
              <span>Tomorrow, hourly forecasts and history</span>
            </div>
            <ArrowRight size={17} />
          </Link>
          <Link to="/observations">
            <GaugeIcon />
            <div>
              <strong>Close the loop in the field</strong>
              <span>Record measured collection and tank levels</span>
            </div>
            <ArrowRight size={17} />
          </Link>
          <Link to="/reports">
            <ShieldCheck size={21} />
            <div>
              <strong>An assessment you can share</strong>
              <span>Inputs, assumptions and data provenance</span>
            </div>
            <ArrowRight size={17} />
          </Link>
        </div>
      )}
    </>
  )
}
function GaugeIcon() {
  return <Waves size={21} />
}
