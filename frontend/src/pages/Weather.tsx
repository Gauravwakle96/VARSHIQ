import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CloudRain, ExternalLink, RefreshCw } from 'lucide-react'
import { api, query, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Forecast, Historical } from '../types'
import {
  Button,
  Chip,
  DataTable,
  date,
  ErrorState,
  Evidence,
  Field,
  InputError,
  Loading,
  Metric,
  Notice,
  number,
  PageTitle,
  PropertyNeeded,
  Section,
} from '../components/ui'

export default function WeatherPages({ mode }: { mode: 'forecast' | 'historical' }) {
  const { property, activeLocation } = useWorkspace()
  if (!property && !activeLocation)
    return (
      <>
        <PageTitle
          eyebrow="RAINFALL INTELLIGENCE"
          title={
            mode === 'forecast' ? 'A forecast for your selected place.' : 'Understand the rainfall seasons.'
          }
          description="Select an actual place or registered property for coordinate-specific weather."
        />
        <Link to="/locations" className="button secondary">
          Select a real location
        </Link>
        <PropertyNeeded property={null} />
      </>
    )
  const contextKey = activeLocation
    ? `place-${activeLocation.id}-${activeLocation.latitude}-${activeLocation.longitude}-${activeLocation.timezone}`
    : `property-${property?.id}`
  return mode === 'forecast' ? <ForecastPage key={contextKey} /> : <HistoricalPage key={contextKey} />
}
function ForecastPage() {
  const { property, activeLocation, notify, selectProperty } = useWorkspace()
  const scope = activeLocation
    ? {
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
        timezone: activeLocation.timezone,
      }
    : { property_id: property?.id }
  const [days, setDays] = useState(7)
  const [range, setRange] = useState('tomorrow')
  const result = useApi<Forecast>(
    property || activeLocation ? `/weather/forecast?${query({ ...scope, days })}` : null,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  async function refresh() {
    if (!property && !activeLocation) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      result.setData(await api<Forecast>(`/weather/forecast?${query({ ...scope, days, refresh: true })}`))
      notify('Forecast refresh completed. Check the provider and retrieval timestamp.')
    } catch (error) {
      setRefreshError((error as Error).message)
    } finally {
      setRefreshing(false)
    }
  }
  const forecast = result.data
  const tomorrow = forecast?.tomorrow
  const hours = range === 'tomorrow' ? (tomorrow?.hourly ?? []) : (forecast?.hourly ?? [])
  const timeLabel = (value: string) =>
    date(value, forecast?.timezone ?? activeLocation?.timezone ?? property?.timezone, true)
      .split(',')
      .slice(-1)
      .join(',')
      .trim()
  return (
    <>
      <PageTitle
        eyebrow="LIVE RAINFALL FORECAST"
        title="Tomorrow, with a source."
        description={`${activeLocation?.display_name ?? property?.name} · Amounts and probabilities are shown separately; forecasts are estimates.`}
        action={
          <Button variant="secondary" loading={refreshing} onClick={refresh}>
            <RefreshCw size={16} />
            Refresh forecast
          </Button>
        }
      />
      <InputError error={refreshError} />
      {activeLocation && (
        <Notice title="Unregistered location preview">
          This forecast uses the selected place's coordinates and timezone. It does not create a property or
          verify a roof. WaterTwin calculations remain scoped to the registered property selected in the
          header.
          {property && (
            <div>
              <Button variant="secondary" onClick={() => selectProperty(property.id)}>
                Use {property.name}'s forecast
              </Button>
            </div>
          )}
        </Notice>
      )}
      <div className="filter-bar">
        <Field label="Forecast window">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={3}>Next 3 days</option>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
          </select>
        </Field>
        <Link className="text-link" to="/sources">
          Check provider status
          <ExternalLink size={14} />
        </Link>
      </div>
      {result.loading && <Loading text="Retrieving the real forecast for your property…" />}
      {result.error && <ErrorState error={result.error} retry={result.reload} />}
      {forecast && (
        <>
          {forecast.stale && (
            <Notice tone="warning" title="Cached forecast is stale">
              The live provider could not supply a current forecast. This saved response was retrieved{' '}
              {date(forecast.retrieved_at, forecast.timezone)}. Recheck its valid dates before making
              decisions.
            </Notice>
          )}
          <div className="forecast-hero">
            <div>
              <span className="eyebrow">
                TOMORROW ·{' '}
                {tomorrow ? date(`${tomorrow.date}T12:00:00`, forecast.timezone, false) : 'Not supplied'}
              </span>
              <h2>
                {number(tomorrow?.precipitation_mm, 1)}
                <span> mm</span>
              </h2>
              <p>Expected precipitation amount</p>
              <div className="forecast-chips">
                <Chip tone="blue">{forecast.provider}</Chip>
                <Chip>{forecast.timezone}</Chip>
                <Chip tone={forecast.stale ? 'amber' : 'green'}>
                  {forecast.stale ? 'Stale cache' : forecast.cache ? 'Recent cache' : 'Provider retrieval'}
                </Chip>
              </div>
            </div>
            <div className="forecast-rain-mark">
              <CloudRain size={82} strokeWidth={1.25} />
            </div>
            <div className="forecast-probability">
              <strong>
                {number(tomorrow?.probability_pct)}
                <span>%</span>
              </strong>
              <span>Maximum precipitation probability</span>
              <small>Probability does not multiply rainfall volume.</small>
            </div>
          </div>
          <div className="source-strip">
            <span>Retrieved {date(forecast.retrieved_at, forecast.timezone)}</span>
            <span>
              Forecast model location: {number(forecast.model_latitude, 4)},{' '}
              {number(forecast.model_longitude, 4)}
            </span>
            <WeatherAttribution provider={forecast.provider} attribution={forecast.attribution} />
          </div>
          <Section
            title="Hourly rainfall outlook"
            subtitle="Provider precipitation amounts in millimetres."
            action={
              <div className="segmented compact">
                <button
                  className={range === 'tomorrow' ? 'selected' : ''}
                  onClick={() => setRange('tomorrow')}
                >
                  Tomorrow
                </button>
                <button className={range === 'all' ? 'selected' : ''} onClick={() => setRange('all')}>
                  Full forecast
                </button>
              </div>
            }
          >
            {hours.length ? (
              <div
                className="chart"
                role="img"
                aria-label="Hourly forecast precipitation chart. Exact values are available in the table below."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hours} margin={{ top: 12, right: 16, bottom: 4, left: 2 }}>
                    <defs>
                      <linearGradient id="rainfall-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1a9888" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="#1a9888" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#e7ece8" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={timeLabel}
                      minTickGap={45}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      unit=" mm"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      labelFormatter={(label) => date(String(label), forecast.timezone)}
                      formatter={(value) => [number(Number(value), 2), 'Precipitation (mm)']}
                      contentStyle={{ borderRadius: 10, border: '1px solid #dce5e0', fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="precipitation_mm"
                      stroke="#148877"
                      strokeWidth={2.5}
                      fill="url(#rainfall-fill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Notice tone="warning">
                No hourly values are available for this date in the retrieved forecast.
              </Notice>
            )}
            <details className="data-details">
              <summary>View exact hourly forecast values</summary>
              <DataTable headings={['Local date & time', 'Precipitation', 'Rain', 'Showers', 'Probability']}>
                {hours.map((hour) => (
                  <tr key={hour.time}>
                    <td>{date(hour.time, forecast.timezone)}</td>
                    <td>{number(hour.precipitation_mm, 2)} mm</td>
                    <td>{number(hour.rain_mm, 2)} mm</td>
                    <td>{number(hour.showers_mm, 2)} mm</td>
                    <td>{number(hour.probability_pct)}%</td>
                  </tr>
                ))}
              </DataTable>
            </details>
            <WeatherAttribution provider={forecast.provider} attribution={forecast.attribution} />
          </Section>
          <Section title="Daily forecast" subtitle={`${days}-day request · dates supplied by the provider`}>
            <div className="forecast-days">
              {forecast.daily.map((day) => (
                <article className={day.date === tomorrow?.date ? 'tomorrow' : ''} key={day.date}>
                  <span>{date(`${day.date}T12:00:00`, forecast.timezone, false)}</span>
                  {day.date === tomorrow?.date && <small>Tomorrow</small>}
                  <CloudRain size={24} />
                  <strong>
                    {number(day.precipitation_mm, 1)}
                    <span> mm</span>
                  </strong>
                  <div>{number(day.probability_pct)}% probability</div>
                  <small>{number(day.precipitation_hours, 1)} precipitation hours</small>
                </article>
              ))}
            </div>
          </Section>
          <Evidence
            title="Forecast provenance & limitations"
            value={{
              provider: forecast.provider,
              retrieved_at: forecast.retrieved_at,
              issue_time: forecast.issue_time ?? 'Provider issue time is not supplied',
              requested_coordinates: `${forecast.latitude}, ${forecast.longitude}`,
              model_coordinates: `${forecast.model_latitude}, ${forecast.model_longitude}`,
              spatial_resolution: forecast.spatial_resolution,
              timezone: forecast.timezone,
              attribution: forecast.attribution,
              assumptions: [
                'Regional model forecasts are not exact rooftop rainfall measurements.',
                'Provider rainfall amounts are not multiplied by precipitation probability.',
              ],
            }}
          />
        </>
      )}
    </>
  )
}

function HistoricalPage() {
  const { property, activeLocation } = useWorkspace()
  const year = new Date().getFullYear()
  const [historical, setHistorical] = useState<Historical | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function fetchHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setHistorical(null)
    const values = new FormData(event.currentTarget)
    const scope = activeLocation
      ? {
          latitude: activeLocation.latitude,
          longitude: activeLocation.longitude,
          timezone: activeLocation.timezone,
        }
      : { property_id: property?.id }
    try {
      setHistorical(
        await api<Historical>(
          `/weather/historical?${query({ ...scope, start_date: String(values.get('start_date')), end_date: String(values.get('end_date')), provider: String(values.get('provider')) })}`,
        ),
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
        eyebrow="HISTORICAL RAINFALL"
        title="Understand the rainfall seasons."
        description={`${activeLocation?.display_name ?? property?.name} · Regional history for context and storage scenarios; separate from live forecasts.`}
      />
      {activeLocation && (
        <Notice title="Unregistered location preview">
          Historical rainfall is retrieved for the selected place coordinates. No rooftop or property
          measurement is inferred.
        </Notice>
      )}
      <Section
        title="Choose a genuine historical series"
        subtitle="IMD uses an approved configured dataset. Open-Meteo history is labelled reanalysis."
      >
        <form className="filter-bar" onSubmit={fetchHistory}>
          <Field label="Historical provider">
            <select name="provider">
              <option value="open_meteo">Open-Meteo historical reanalysis</option>
              <option value="imd">IMD approved gridded observations</option>
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" name="start_date" required defaultValue={`${year - 5}-01-01`} />
          </Field>
          <Field label="End date">
            <input
              type="date"
              name="end_date"
              required
              defaultValue={`${year - 1}-12-31`}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Button loading={busy} type="submit">
            Retrieve rainfall history
          </Button>
        </form>
        <InputError error={error} />
      </Section>
      {busy && <Loading text="Retrieving and aggregating the regional rainfall series…" />}
      {!historical && !busy && (
        <Notice title="Historical source matters">
          IMD observations and model reanalysis have different provenance. Both describe regional rainfall
          conditions; neither is an individual-rooftop measurement.
        </Notice>
      )}
      {historical && (
        <>
          <div className="metrics-grid three">
            <Metric label="Historical source" value={historical.provider} detail={historical.data_kind} />
            <Metric
              label="Daily records"
              value={number(historical.daily.length)}
              detail="Retrieved observations or reanalysis records"
            />
            <Metric
              label="Regional resolution"
              value={historical.spatial_resolution || 'See provenance'}
              detail="Regional climate context"
            />
          </div>
          <Section
            title="Annual rainfall totals"
            subtitle="Partial calendar years are labelled in the table."
          >
            {historical.annual.length ? (
              <div
                className="chart"
                role="img"
                aria-label="Annual historical rainfall chart with exact values in the following table."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historical.annual}>
                    <CartesianGrid vertical={false} stroke="#e7ece8" />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis unit=" mm" width={68} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => [number(Number(value), 1), 'Annual precipitation (mm)']} />
                    <Bar
                      dataKey="total_mm"
                      fill="#249785"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={65}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Notice>No annual aggregations are available for this coverage.</Notice>
            )}
            <DataTable headings={['Year', 'Total precipitation', 'Coverage status']}>
              {historical.annual.map((item) => (
                <tr key={item.year}>
                  <td>{item.year}</td>
                  <td>{number(item.total_mm, 1)} mm</td>
                  <td>
                    <Chip tone={item.complete ? 'green' : 'amber'}>
                      {item.complete ? 'Complete year' : 'Partial year'}
                    </Chip>
                  </td>
                </tr>
              ))}
            </DataTable>
            <WeatherAttribution provider={historical.provider} attribution={historical.attribution} />
          </Section>
          <Section
            title="Monthly rainfall pattern"
            subtitle="Monthly averages calculated from the retrieved coverage."
          >
            <div className="chart" role="img" aria-label="Monthly historical precipitation averages.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historical.monthly}>
                  <CartesianGrid vertical={false} stroke="#e7ece8" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(month) =>
                      new Date(2000, Number(month) - 1, 1).toLocaleString('en-IN', { month: 'short' })
                    }
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis unit=" mm" width={60} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => [number(Number(value), 1), 'Mean precipitation (mm)']} />
                  <Bar dataKey="mean_mm" fill="#557fa5" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <WeatherAttribution provider={historical.provider} attribution={historical.attribution} />
          </Section>
          <Evidence
            title="Historical coverage, seasons & limitations"
            value={{
              coverage: historical.coverage,
              seasonal: historical.seasonal,
              limitations: historical.limitations,
              attribution: historical.attribution,
            }}
          />
          <details className="data-details">
            <summary>View retrieved daily rainfall records</summary>
            <DataTable headings={['Date', 'Precipitation']}>
              {historical.daily.map((item) => (
                <tr key={item.date}>
                  <td>{item.date}</td>
                  <td>{number(item.precipitation_mm, 2)} mm</td>
                </tr>
              ))}
            </DataTable>
          </details>
        </>
      )}
    </>
  )
}
export function WeatherAttribution({ provider, attribution }: { provider?: string; attribution?: string }) {
  const openMeteo = !provider || provider.toLowerCase().replaceAll('-', '_').includes('open')
  return (
    <span className="weather-attribution">
      {openMeteo ? (
        <>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Weather data by Open-Meteo.com
          </a>
          <span> · </span>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
        </>
      ) : (
        attribution || provider
      )}
    </span>
  )
}
