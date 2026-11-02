import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Compass, LocateFixed, MapPin, Search } from 'lucide-react'
import { api, query, useApi } from '../api'
import { useWorkspace } from '../context'
import type { LocationResult } from '../types'
import {
  Button,
  Chip,
  Empty,
  Evidence,
  Field,
  InputError,
  Loading,
  Notice,
  number,
  PageTitle,
  Section,
} from '../components/ui'

interface SearchMetadata {
  source?: string
  attribution?: string
  retrieved_at?: string
  limitations?: string[]
}
type SearchResponse = LocationResult[] | ({ results: LocationResult[] } & SearchMetadata)
type DistrictResponse =
  | string[]
  | { name: string; [key: string]: unknown }[]
  | { districts: (string | { name: string })[]; source?: string; licence?: string; retrieved_at?: string }
export default function LocationPage() {
  const { activeLocation, setActiveLocation, notify } = useWorkspace()
  const [state, setState] = useState('Maharashtra')
  const [district, setDistrict] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<LocationResult[]>([])
  const [searchMetadata, setSearchMetadata] = useState<SearchMetadata | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const districts = useApi<DistrictResponse>(`/locations/districts?${query({ state })}`)
  const list = Array.isArray(districts.data) ? districts.data : (districts.data?.districts ?? [])
  const navigate = useNavigate()
  function choose(location: LocationResult) {
    setActiveLocation(location)
    notify(`Location selected: ${location.display_name}. Select a building before registering a property.`)
    navigate('/map')
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSearched(true)
    setGpsAccuracy(null)
    setSearchMetadata(null)
    try {
      const response = await api<SearchResponse>(
        `/locations/search?${query({ q: [searchTerm, district].filter(Boolean).join(', '), country: 'IN', state })}`,
      )
      setResults(Array.isArray(response) ? response : response.results)
      if (!Array.isArray(response))
        setSearchMetadata({
          source: response.source,
          attribution: response.attribution,
          retrieved_at: response.retrieved_at,
          limitations: response.limitations,
        })
    } catch (error) {
      setError((error as Error).message)
      setResults([])
    } finally {
      setBusy(false)
    }
  }
  async function resolveCoordinates(latitude: number, longitude: number) {
    const response = await api<LocationResult | { location: LocationResult }>(
      `/locations/reverse?${query({ latitude, longitude })}`,
    )
    return 'location' in response ? response.location : response
  }
  async function coordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setGpsAccuracy(null)
    setSearchMetadata(null)
    const values = new FormData(event.currentTarget)
    const latitude = Number(values.get('latitude'))
    const longitude = Number(values.get('longitude'))
    try {
      const location = await resolveCoordinates(latitude, longitude)
      setResults([location])
      setSearched(true)
    } catch (error) {
      coordinateFallback(latitude, longitude, 'User-entered coordinates')
      setError(
        `Address lookup unavailable: ${(error as Error).message}. Your entered coordinates remain available below with unverified administrative context.`,
      )
    } finally {
      setBusy(false)
    }
  }
  function coordinateFallback(latitude: number, longitude: number, source: string) {
    setResults([
      {
        id: `coordinate-${latitude}-${longitude}`,
        display_name: `${source}: ${number(latitude, 6)}, ${number(longitude, 6)}`,
        latitude,
        longitude,
        country: '',
        state: '',
        district: '',
        timezone: activeLocation?.timezone ?? 'Asia/Kolkata',
        source,
        attribution:
          'Coordinates supplied by the user or browser; country, address and administrative context are unverified. Reporting timezone is a user/pilot assumption.',
      },
    ])
    setSearched(true)
  }
  function gps() {
    if (!navigator.geolocation) {
      setError('GPS is unavailable in this browser. Enter coordinates instead.')
      return
    }
    setBusy(true)
    setError(null)
    setSearchMetadata(null)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setGpsAccuracy(position.coords.accuracy)
        try {
          const location = await resolveCoordinates(position.coords.latitude, position.coords.longitude)
          setResults([location])
          setSearched(true)
        } catch (error) {
          coordinateFallback(position.coords.latitude, position.coords.longitude, 'Browser GPS coordinates')
          setError(
            `Address lookup unavailable: ${(error as Error).message}. GPS coordinates remain available below; verify the actual building position.`,
          )
        } finally {
          setBusy(false)
        }
      },
      (error) => {
        setError(error.message)
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
  return (
    <>
      <PageTitle
        eyebrow="GEOGRAPHIC WORKSPACE"
        title="Start with the right place."
        description="Select a real locality, find its buildings and keep every source attached to the assessment."
        action={
          <Button variant="secondary" loading={busy} onClick={gps}>
            <LocateFixed size={16} />
            Use GPS location
          </Button>
        }
      />
      {activeLocation && (
        <Section
          title="Active location"
          subtitle="This geographic context guides the map and your next registration."
        >
          <div className="selected-location">
            <Compass size={24} />
            <div>
              <strong>{activeLocation.display_name}</strong>
              <small>
                {number(activeLocation.latitude, 6)}, {number(activeLocation.longitude, 6)} ·{' '}
                {activeLocation.timezone}
              </small>
            </div>
            <Chip tone="blue">{activeLocation.source}</Chip>
          </div>
          <Button variant="ghost" onClick={() => setActiveLocation(null)}>
            Clear selected context
          </Button>
        </Section>
      )}
      <div className="two-column">
        <Section
          title="Find a locality in Maharashtra"
          subtitle="District and locality results are supplied by configured real providers."
        >
          <form onSubmit={search} className="form-stack">
            <div className="form-grid">
              <Field label="State">
                <input
                  value={state}
                  onChange={(event) => {
                    setState(event.target.value)
                    setDistrict('')
                  }}
                  required
                  placeholder="Maharashtra"
                />
              </Field>
              <Field label="District">
                <select value={district} onChange={(event) => setDistrict(event.target.value)}>
                  <option value="">All districts / search by name</option>
                  {list.map((item) => {
                    const name = typeof item === 'string' ? item : item.name
                    return (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    )
                  })}
                </select>
              </Field>
            </div>
            <Field label="City, locality, address or postcode">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                required
                minLength={2}
                maxLength={250}
                placeholder="Enter a real place name or address"
              />
            </Field>
            {districts.loading && <span className="muted">Loading district directory…</span>}
            {districts.error && (
              <Notice tone="warning">
                District directory unavailable: {districts.error.message}. You can still search by locality
                name.
              </Notice>
            )}
            <Button type="submit" loading={busy}>
              <Search size={16} />
              Search actual locations
            </Button>
          </form>
        </Section>
        <Section
          title="Use coordinates"
          subtitle="Browser GPS needs your permission. Coordinates can also be entered manually."
        >
          <form onSubmit={coordinates} className="form-stack">
            <div className="form-grid">
              <Field label="Latitude">
                <input
                  name="latitude"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  required
                  defaultValue={activeLocation?.latitude ?? ''}
                />
              </Field>
              <Field label="Longitude">
                <input
                  name="longitude"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  required
                  defaultValue={activeLocation?.longitude ?? ''}
                />
              </Field>
            </div>
            <Button type="submit" loading={busy} variant="secondary">
              <MapPin size={16} />
              Resolve coordinates
            </Button>
          </form>
          <Notice title="Coordinates do not verify a roof">
            A place lookup identifies a location. Building geometry, effective catchment measurements and
            field evidence remain separate.
          </Notice>
        </Section>
      </div>
      <InputError error={error} />
      {busy && <Loading text="Retrieving actual geographic matches…" />}
      {gpsAccuracy != null && (
        <Notice title="Reported GPS accuracy">
          The browser reported approximately {number(gpsAccuracy)} m accuracy. Check the building position on
          the map before registration.
        </Notice>
      )}
      {searchMetadata && <Evidence title="Geographic search source & limitations" value={searchMetadata} />}
      {districts.data && !Array.isArray(districts.data) && (
        <Evidence
          title="District directory provenance"
          value={{
            source: districts.data.source,
            licence: districts.data.licence,
            retrieved_at: districts.data.retrieved_at,
          }}
        />
      )}
      <Section
        title="Location matches"
        subtitle="Select a result to move the map; no property record is created by a place lookup."
      >
        {busy ? (
          <Loading text="Loading geographic matches…" />
        ) : results.length ? (
          <div className="location-results">
            {results.map((location) => (
              <article className="location-result" key={location.id}>
                <span className="property-icon">
                  <MapPin size={20} />
                </span>
                <div>
                  <h3>{location.display_name}</h3>
                  <p>
                    {[location.locality, location.city, location.district, location.state, location.postcode]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="inline-actions">
                    <Chip tone="blue">{location.source}</Chip>
                    <span className="muted">
                      {number(location.latitude, 5)}, {number(location.longitude, 5)}
                    </span>
                  </div>
                  {(/osm|openstreetmap|nominatim|photon/i.test(location.source) ||
                    location.attribution_url) && (
                    <a
                      className="text-link location-attribution"
                      href={safeAttributionURL(location.attribution_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {location.attribution || '© OpenStreetMap contributors'}
                    </a>
                  )}
                  <Evidence
                    title="Geographic source & attribution"
                    value={{
                      source: location.source,
                      attribution: location.attribution,
                      timezone: location.timezone,
                      bbox: location.bbox,
                      administrative_ids: location.administrative_ids,
                    }}
                  />
                </div>
                <Button variant="secondary" onClick={() => choose(location)}>
                  Select place
                  <ArrowRight size={16} />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={searched ? 'No matching location loaded' : 'Choose your geographic starting point'}
            description={
              searched
                ? 'Try a more specific locality, address or postcode, or enter actual coordinates.'
                : 'Search a locality or resolve coordinates, then select an actual building on the map.'
            }
            icon="map"
          />
        )}
      </Section>
      <div className="location-next">
        <Building2 size={18} />
        <span>Place → building footprint → registered property → verified catchment → WaterTwin.</span>
      </div>
    </>
  )
}
function safeAttributionURL(value?: string) {
  const fallback = 'https://www.openstreetmap.org/copyright'
  try {
    const url = new URL(value ?? fallback)
    return url.protocol === 'https:' && ['www.openstreetmap.org', 'openstreetmap.org'].includes(url.hostname)
      ? url.href
      : fallback
  } catch {
    return fallback
  }
}
