import { useEffect, useId, useRef, useState } from 'react'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import { Building2, MapPin, Search } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import type { Feature } from '../../types'
import { Button, date, number } from '../../components/ui'
import type { FlowFrame } from './data'

interface Lookup {
  data_kind: 'real_public_geography'
  water_inputs: 'simulated_unverified'
  persisted: false
  features: Feature[]
  provider: string
  retrieved_at: string
  limitations: string[]
  attribution: string
}
const places = [
  { name: 'Chhatrapati Sambhajinagar', latitude: 19.8762, longitude: 75.3433 },
  { name: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
  { name: 'Pune', latitude: 18.5204, longitude: 73.8567 },
]
export default function DemoMap({ water }: { water: FlowFrame | null }) {
  const locationLabel = useId()
  const outlineLabel = useId()
  const [point, setPoint] = useState(places[0])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [selected, setSelected] = useState<Feature | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tileError, setTileError] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  function move(next: typeof point) {
    request.current?.abort()
    setBusy(false)
    setPoint(next)
    setLookup(null)
    setSelected(null)
    setError(null)
  }
  async function find() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    setLookup(null)
    setSelected(null)
    try {
      const response = await fetch(
        `/api/v1/demo/footprints?latitude=${point.latitude}&longitude=${point.longitude}`,
        { credentials: 'omit', signal: controller.signal },
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message ?? 'Building outlines are unavailable.')
      if (
        body?.data?.data_kind !== 'real_public_geography' ||
        body.data.water_inputs !== 'simulated_unverified' ||
        body.data.persisted !== false ||
        !Array.isArray(body.data.features)
      )
        throw new Error('Building geography could not be verified. Retry the lookup.')
      if (!controller.signal.aborted) setLookup(body.data)
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="demo-map-section" aria-labelledby="demo-map-title">
      <div className="demo-section-heading">
        <div>
          <span className="eyebrow">REAL GEOGRAPHY · SIMULATED WATER</span>
          <h2 id="demo-map-title">Explore a real building on the map.</h2>
          <p>Choose a place or click the map, then retrieve nearby public building outlines.</p>
        </div>
        <span className="demo-geography-chip">
          <MapPin size={15} />
          OpenStreetMap
        </span>
      </div>
      <div className="demo-map-toolbar">
        <label className="field">
          <span id={locationLabel}>Map location</span>
          <select
            aria-labelledby={locationLabel}
            value={
              places.find((place) => place.latitude === point.latitude && place.longitude === point.longitude)
                ?.name ?? 'custom'
            }
            onChange={(event) => {
              const next = places.find((place) => place.name === event.target.value)
              if (next) move(next)
            }}
          >
            {places.map((place) => (
              <option key={place.name}>{place.name}</option>
            ))}
            <option value="custom" disabled>
              Map-selected coordinates
            </option>
          </select>
        </label>
        <span className="demo-coordinate">
          {number(point.latitude, 5)}, {number(point.longitude, 5)}
        </span>
        <Button loading={busy} onClick={find}>
          <Search size={16} />
          Find real buildings here
        </Button>
      </div>
      <MapCanvas
        point={point}
        features={lookup?.features ?? []}
        selected={selected}
        water={water}
        onSelect={setSelected}
        onPoint={(latitude, longitude) => move({ name: 'Map-selected point', latitude, longitude })}
        onTileError={() => setTileError(true)}
      />
      {tileError && (
        <p className="demo-inline-warning" role="status">
          Map tiles could not load. Public outline selection and coordinates remain available; retry with an
          internet connection.
        </p>
      )}
      {busy && (
        <p role="status" className="demo-map-feedback">
          Retrieving actual OSM building outlines…
        </p>
      )}
      {error && (
        <div className="demo-map-feedback error" role="alert">
          {error}{' '}
          <Button variant="secondary" onClick={find}>
            Retry building lookup
          </Button>
        </div>
      )}
      {lookup && (
        <div className="demo-map-selection">
          <label className="field">
            <span id={outlineLabel}>Actual building outline</span>
            <select
              aria-labelledby={outlineLabel}
              value={String(selected?.id ?? '')}
              onChange={(event) =>
                setSelected(
                  lookup.features.find((feature) => String(feature.id) === event.target.value) ?? null,
                )
              }
            >
              <option value="">
                {lookup.features.length
                  ? `Choose one of ${lookup.features.length} mapped outlines`
                  : 'No outlines returned for this area'}
              </option>
              {lookup.features.map((feature) => (
                <option key={feature.id} value={String(feature.id)}>
                  {String(feature.properties.name ?? 'Mapped building')} · OSM {feature.id}
                </option>
              ))}
            </select>
          </label>
          <small>
            Retrieved {date(lookup.retrieved_at, 'Asia/Kolkata')} · public geography, not private property
            records.
          </small>
          <details className="demo-map-evidence">
            <summary>Building data source and limitations</summary>
            <p>{lookup.attribution}</p>
            <ul>{lookup.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          </details>
        </div>
      )}
      {selected && (
        <div className="demo-selected-building">
          <Building2 size={21} />
          <div>
            <strong>{String(selected.properties.name ?? 'Mapped building')} · outline selected</strong>
            <p>
              {number(Number(selected.properties.footprint_area_m2), 1)} m² footprint estimate ·{' '}
              <a
                href={`https://www.openstreetmap.org/way/${encodeURIComponent(String(selected.id))}`}
                target="_blank"
                rel="noreferrer"
              >
                OSM source
              </a>
            </p>
            <small>
              The water model uses illustrative catchment and tank inputs. The tank marker is schematic;
              its position does not establish that a harvesting system exists.
            </small>
          </div>
        </div>
      )}
      {!lookup && !busy && !error && (
        <p className="demo-map-feedback">
          The basemap is real. Building retrieval starts when you choose “Find real buildings here”.
        </p>
      )}
    </section>
  )
}

function MapCanvas({
  point,
  features,
  selected,
  water,
  onSelect,
  onPoint,
  onTileError,
}: {
  point: { latitude: number; longitude: number }
  features: Feature[]
  selected: Feature | null
  water: FlowFrame | null
  onSelect: (feature: Feature) => void
  onPoint: (latitude: number, longitude: number) => void
  onTileError: () => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const outlines = useRef<L.GeoJSON | null>(null)
  const simulationMarker = useRef<L.Marker | null>(null)
  const callbacks = useRef({ onSelect, onPoint, onTileError })
  const reduced = useReducedMotion()
  useEffect(() => {
    callbacks.current = { onSelect, onPoint, onTileError }
  }, [onSelect, onPoint, onTileError])
  useEffect(() => {
    if (!element.current) return
    const instance = L.map(element.current, { center: [19.8762, 75.3433], zoom: 17, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    })
      .on('tileerror', () => callbacks.current.onTileError())
      .addTo(instance)
    instance.on('click', (event: L.LeafletMouseEvent) =>
      callbacks.current.onPoint(event.latlng.lat, event.latlng.lng),
    )
    map.current = instance
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(element.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    if (reduced) map.current?.setView([point.latitude, point.longitude], 17, { animate: false })
    else map.current?.flyTo([point.latitude, point.longitude], 17, { duration: 0.8 })
  }, [point.latitude, point.longitude, reduced])
  useEffect(() => {
    if (!map.current) return
    outlines.current?.remove()
    const layer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJsonObject, {
      style: {
        color: '#245678',
        weight: 2,
        fillColor: '#4aa5ca',
        fillOpacity: 0.18,
        bubblingMouseEvents: false,
      },
      onEachFeature: (feature, outline) =>
        outline.on('click', () => callbacks.current.onSelect(feature as Feature)),
    }).addTo(map.current)
    outlines.current = layer
    return () => {
      layer.remove()
    }
  }, [features])
  useEffect(() => {
    outlines.current?.eachLayer((layer) => {
      const shape = layer as L.Polygon & { feature?: Feature }
      const active = String(shape.feature?.id) === String(selected?.id)
      shape.setStyle({
        color: active ? '#047965' : '#245678',
        weight: active ? 4 : 2,
        fillColor: active ? '#36b895' : '#4aa5ca',
        fillOpacity: active ? 0.45 : 0.18,
      })
      if (active) {
        shape.bringToFront()
        map.current?.fitBounds(shape.getBounds(), {
          maxZoom: 19,
          paddingTopLeft: [28, 55],
          paddingBottomRight: [150, 55],
          animate: !reduced,
        })
      }
    })
  }, [selected, features, reduced])
  useEffect(() => {
    simulationMarker.current?.remove()
    simulationMarker.current = null
    if (!map.current || !selected) return
    const centroid = selected.properties.centroid as { latitude: number; longitude: number } | undefined
    if (!centroid || !Number.isFinite(centroid.latitude) || !Number.isFinite(centroid.longitude)) return
    const bounds = L.geoJSON(selected as GeoJsonObject).getBounds()
    const icon = L.divIcon({
      className: 'demo-map-twin-marker',
      iconSize: [112, 105],
      iconAnchor: [-16, 52],
      html: '<div class="demo-map-mini-twin"><strong>SIMULATION</strong><div class="demo-map-mini-rain" aria-hidden="true">╲ ╲ ╲</div><div class="demo-map-mini-tank"><span></span></div><small></small></div>',
    })
    const marker = L.marker([centroid.latitude, bounds.getEast()], {
      icon,
      interactive: false,
      keyboard: false,
    }).addTo(map.current)
    simulationMarker.current = marker
    return () => {
      marker.remove()
      if (simulationMarker.current === marker) simulationMarker.current = null
    }
  }, [selected])
  useEffect(() => {
    const element = simulationMarker.current?.getElement()
    if (!element) return
    element.style.display = water ? '' : 'none'
    if (!water) return
    const percent = Math.max(0, Math.min(100, (water.storage_l / water.capacity_l) * 100))
    const twin = element.querySelector('.demo-map-mini-twin')
    const level = element.querySelector<HTMLElement>('.demo-map-mini-tank > span')
    const reading = element.querySelector('small')
    twin?.classList.toggle('raining', water.playing && water.rainfall_mm > 0 && !reduced)
    if (level) level.style.height = `${percent.toFixed(2)}%`
    if (reading) reading.textContent = `${percent.toFixed(1)}% · hour ${water.hour}`
  }, [selected, water, reduced])
  return (
    <div
      className="demo-real-map"
      ref={element}
      role="region"
      aria-label="Real OpenStreetMap basemap. Select outlines using the building dropdown as a keyboard alternative."
    />
  )
}
