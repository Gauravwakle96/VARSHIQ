import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import {
  ArrowRight,
  Building2,
  LocateFixed,
  MapPin,
  MousePointer2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { api, patch, post, query, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Feature, Geometry, Property } from '../types'
import {
  Button,
  Chip,
  Evidence,
  Field,
  InputError,
  Notice,
  number,
  PageTitle,
  Section,
} from '../components/ui'

interface Lookup {
  features: Feature[]
  provider: string
  retrieved_at: string
  attribution: string
  limitations: string[]
}
interface Point {
  latitude: number
  longitude: number
}
export default function MapPage() {
  const { properties, property, selectProperty, refreshProperties, notify, activeLocation } = useWorkspace()
  const [point, setPoint] = useState<Point>(
    activeLocation
      ? { latitude: activeLocation.latitude, longitude: activeLocation.longitude }
      : property
        ? { latitude: property.latitude, longitude: property.longitude }
        : { latitude: 20.5937, longitude: 78.9629 },
  )
  const [provider, setProvider] = useState('osm')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [candidate, setCandidate] = useState<Feature | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [vertices, setVertices] = useState<Point[]>([])
  const [manualGeometry, setManualGeometry] = useState<Geometry | null>(null)
  const [area, setArea] = useState<number | null>(null)
  const [outlineConfirmed, setOutlineConfirmed] = useState(false)
  const [connectedFraction, setConnectedFraction] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settings = useApi<{ pilot_locality: string; pilot_latitude: number; pilot_longitude: number }>(
    !property ? '/admin/settings' : null,
  )
  const navigate = useNavigate()
  useEffect(() => {
    setOutlineConfirmed(false)
    setConnectedFraction(1)
    if (!candidate) return
    const controller = new AbortController()
    setArea(null)
    api<{ area_m2: number }>('/buildings/geometry', {
      method: 'POST', body: JSON.stringify({ geometry: candidate.geometry }), signal: controller.signal,
    }).then(result => { if (!controller.signal.aborted) setArea(result.area_m2) })
      .catch(error => { if (!controller.signal.aborted) setError((error as Error).message) })
    return () => controller.abort()
  }, [candidate, manualGeometry])
  useEffect(() => {
    if (activeLocation) setPoint({ latitude: activeLocation.latitude, longitude: activeLocation.longitude })
    else if (!property && settings.data)
      setPoint({ latitude: settings.data.pilot_latitude, longitude: settings.data.pilot_longitude })
  }, [activeLocation, property, settings.data])
  async function search() {
    setBusy(true)
    setError(null)
    setCandidate(null)
    try {
      const response = await api<Lookup>(`/buildings/lookup?${query({ ...point, provider })}`)
      setLookup(response)
      notify(
        `${response.features.length} building footprint${response.features.length === 1 ? '' : 's'} returned by ${response.provider}.`,
      )
    } catch (error) {
      setError((error as Error).message)
      setLookup(null)
    } finally {
      setBusy(false)
    }
  }
  async function finishDrawing() {
    if (vertices.length < 3) {
      setError('Add at least three distinct points to draw a polygon.')
      return
    }
    const ring = vertices.map((item) => [item.longitude, item.latitude])
    ring.push([...ring[0]])
    const geometry: Geometry = { type: 'Polygon', coordinates: [ring] }
    setBusy(true)
    setError(null)
    try {
      const assessed = await post<{ area_m2: number; centroid: Point }>('/buildings/geometry', { geometry })
      setManualGeometry(geometry)
      setArea(assessed.area_m2)
      setPoint(assessed.centroid)
      setCandidate(null)
      setDrawing(false)
      notify(
        'Manual building polygon validated. Its area is a geospatial estimate, not a verified roof measurement.',
      )
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function register() {
    const featureName = candidate?.properties.name
    const geometry = candidate?.geometry ?? manualGeometry
    navigate('/register', {
      state: {
        selection: {
          ...point,
          ...(geometry ? { geometry } : {}),
          estimate_roof: Boolean(geometry),
          geometry_source: candidate ? provider : 'manual',
          geometry_source_id: candidate
            ? String(candidate.id ?? candidate.properties.source_id ?? candidate.properties.id ?? '')
            : '',
          ...(typeof featureName === 'string' ? { name: featureName } : {}),
        },
      },
    })
  }
  function chooseBuilding(feature: Feature) {
    setCandidate(feature)
    setManualGeometry(null)
    setArea(null)
    const coordinate = feature.geometry.type === 'Polygon'
      ? (feature.geometry.coordinates as number[][][])[0]?.[0]
      : (feature.geometry.coordinates as number[][][][])[0]?.[0]?.[0]
    if (coordinate) setPoint({ longitude: coordinate[0], latitude: coordinate[1] })
  }
  async function updateCurrentProperty() {
    const geometry = candidate?.geometry ?? manualGeometry
    if (!property || !geometry || !outlineConfirmed) return
    setBusy(true)
    setError(null)
    try {
      await patch(`/buildings/${property.id}`, {
        geometry,
        latitude: point.latitude,
        longitude: point.longitude,
        geometry_source: candidate ? provider : 'manual',
        geometry_source_id: candidate
          ? String(candidate.id ?? candidate.properties.source_id ?? candidate.properties.id ?? '')
          : '',
        roof_map_estimate: { confirmed: true, connected_fraction: connectedFraction },
      })
      refreshProperties()
      notify(
        'Roof area saved as a user-confirmed map estimate. Other property inputs are preserved.',
      )
      navigate('/property')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function location() {
    if (!navigator.geolocation) {
      setError('This browser does not provide GPS location. Enter coordinates instead.')
      return
    }
    setBusy(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setBusy(false)
        notify(
          `GPS location received. Reported accuracy: ${number(position.coords.accuracy)} m; check the building position before registration.`,
        )
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
        eyebrow="BUILDING INTELLIGENCE"
        title="Find the roof. Start the connection."
        description={
          activeLocation
            ? `${activeLocation.display_name} · Bounded building lookup around the selected place.`
            : 'Select a real building footprint, draw a manual boundary or register with coordinates.'
        }
        action={
          <div className="inline-actions">
            <Link className="button secondary" to="/locations">
              Select locality
              <ArrowRight size={16} />
            </Link>
            <Link className="button secondary" to="/register">
              Enter manually
              <ArrowRight size={16} />
            </Link>
          </div>
        }
      />
      <div className="map-workspace">
        <div className="map-canvas-wrap">
          <MapCanvas
            properties={properties}
            features={lookup?.features ?? []}
            point={point}
            drawing={drawing}
            vertices={vertices}
            manualGeometry={manualGeometry}
            onPoint={(next) => {
              if (drawing) setVertices((current) => [...current, next])
              else {
                setPoint(next)
                setCandidate(null)
              }
            }}
            onFeature={chooseBuilding}
            onProperty={(item) => {
              selectProperty(item.id)
              navigate('/property')
            }}
          />
          <div className="map-top-label">
            <span className="status-dot" />
            <span>{drawing ? `Drawing · ${vertices.length} vertices` : 'Real-world building map'}</span>
          </div>
          <div className="map-bottom-label">
            <MousePointer2 size={15} />
            {drawing
              ? 'Click the boundary points, then finish the polygon.'
              : 'Click to choose coordinates. Click a footprint to select it.'}
          </div>
        </div>
        <div className="map-inspector">
          <Section title="Building lookup" subtitle="Bounded searches around the selected position.">
            <div className="form-stack">
              <div className="form-grid compact">
                <Field label="Latitude">
                  <input
                    type="number"
                    aria-label="Lookup latitude"
                    min={-90}
                    max={90}
                    step="any"
                    value={point.latitude}
                    onChange={(event) =>
                      setPoint((current) => ({ ...current, latitude: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    type="number"
                    aria-label="Lookup longitude"
                    min={-180}
                    max={180}
                    step="any"
                    value={point.longitude}
                    onChange={(event) =>
                      setPoint((current) => ({ ...current, longitude: Number(event.target.value) }))
                    }
                  />
                </Field>
              </div>
              <Field label="Footprint provider">
                <select
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value)
                    setLookup(null)
                    setCandidate(null)
                  }}
                >
                  <option value="osm">OpenStreetMap</option>
                  <option value="microsoft">Microsoft building footprints</option>
                </select>
              </Field>
              <Button loading={busy} onClick={search}>
                <Search size={16} />
                Find nearby buildings
              </Button>
              <Button variant="secondary" loading={busy} onClick={location}>
                <LocateFixed size={16} />
                Use my GPS location
              </Button>
              <InputError error={error} />
            </div>
          </Section>
          <Section title="Manual geometry" subtitle="Draw a boundary when provider coverage is unavailable.">
            <div className="form-stack">
              {!drawing ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setVertices([])
                    setManualGeometry(null)
                    setCandidate(null)
                    setArea(null)
                    setDrawing(true)
                    setError(null)
                  }}
                >
                  <Pencil size={16} />
                  Draw building polygon
                </Button>
              ) : (
                <>
                  <p className="muted">{vertices.length} vertices selected</p>
                  <Button loading={busy} onClick={finishDrawing}>
                    Finish polygon
                  </Button>
                  <div className="inline-actions">
                    <Button variant="ghost" onClick={() => setVertices((current) => current.slice(0, -1))}>
                      <RotateCcw size={15} />
                      Undo point
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDrawing(false)
                        setVertices([])
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {manualGeometry && (
                <div className="selected-footprint">
                  <Chip tone="blue">Manual geometry</Chip>
                  <strong>{number(area, 1)} m² footprint estimate</strong>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setManualGeometry(null)
                      setVertices([])
                      setArea(null)
                    }}
                  >
                    <Trash2 size={15} />
                    Clear polygon
                  </Button>
                </div>
              )}
            </div>
          </Section>
          <Section title="Selected location">
            {Boolean(lookup?.features.length) && <Field label="Choose a building outline">
              <select value={candidate ? String(lookup?.features.indexOf(candidate)) : ''}
                onChange={event => { const feature = lookup?.features[Number(event.target.value)]; if (feature) chooseBuilding(feature) }}>
                <option value="" disabled>Select on the map or choose here</option>
                {lookup?.features.map((feature, index) => <option value={index} key={String(feature.id ?? index)}>
                  {String(feature.properties.name ?? `Building ${feature.id ?? index + 1}`)}
                </option>)}
              </select>
            </Field>}
            <div className="selected-location">
              <MapPin size={21} />
              <div>
                <strong>
                  {number(point.latitude, 6)}, {number(point.longitude, 6)}
                </strong>
                <small>WGS84 coordinates</small>
              </div>
            </div>
            {candidate && (
              <div className="selected-footprint">
                <Chip tone="green">Provider footprint selected</Chip>
                <strong>{String(candidate.properties.name ?? 'Building footprint')}</strong>
                <p>{area == null ? 'Measuring this outline…' : `${number(area, 1)} m² map-estimated area`}</p>
                <Evidence title="Source attributes" value={candidate.properties} />
              </div>
            )}
            <Button className="full-width" disabled={drawing} onClick={register}>
              <Building2 size={16} />
              {candidate || manualGeometry ? 'Continue with roof estimate' : 'Register this property'}
              <ArrowRight size={16} />
            </Button>
          </Section>
        </div>
      </div>
      {property && (candidate || manualGeometry) && !drawing && (
        <Section
          title="Does this outline match your roof?"
          subtitle={`Save the selected outline and its estimated area for ${property.name}. This does not verify a physical roof measurement.`}
        >
          <label className="roof-outline-confirm">
            <input type="checkbox" checked={outlineConfirmed} onChange={event => setOutlineConfirmed(event.target.checked)} />
            <span>This is my building and the outline looks correct</span>
          </label>
          <details className="friendly-details">
            <summary>Only part of the roof collects rain</summary>
            <Field label="Roof area connected (%)" hint="100% assumes the whole outline drains to collection. Reduce it if only part is connected.">
              <input type="number" min={1} max={100} value={connectedFraction * 100}
                onChange={event => { setConnectedFraction(Number(event.target.value) / 100); setOutlineConfirmed(false) }} />
            </Field>
          </details>
          <Button variant="primary" loading={busy} disabled={!outlineConfirmed || connectedFraction <= 0 || connectedFraction > 1 || area == null} onClick={updateCurrentProperty}>
            <Pencil size={16} />
            Use this estimate for my property
          </Button>
          <InputError error={error} />
        </Section>
      )}
      <Notice title="Start with an estimate" tone="info">
        Select your building and confirm its outline. You can refine the connected roof area later;
        map confirmation is separate from a field measurement.
      </Notice>
      {lookup && (
        <Evidence
          title="Footprint source, retrieval & limitations"
          value={{
            provider: lookup.provider,
            retrieved_at: lookup.retrieved_at,
            attribution: lookup.attribution,
            limitations: lookup.limitations,
          }}
        />
      )}
    </>
  )
}

function MapCanvas({
  properties,
  features,
  point,
  drawing,
  vertices,
  manualGeometry,
  onPoint,
  onFeature,
  onProperty,
}: {
  properties: Property[]
  features: Feature[]
  point: Point
  drawing: boolean
  vertices: Point[]
  manualGeometry: Geometry | null
  onPoint: (point: Point) => void
  onFeature: (feature: Feature) => void
  onProperty: (property: Property) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const shapes = useRef<L.LayerGroup | null>(null)
  const callbacks = useRef({ onPoint, onFeature, onProperty })
  useEffect(() => {
    callbacks.current = { onPoint, onFeature, onProperty }
  }, [onPoint, onFeature, onProperty])
  useEffect(() => {
    if (!element.current) return
    const instance = L.map(element.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: true,
      scrollWheelZoom: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(instance)
    shapes.current = L.layerGroup().addTo(instance)
    instance.on('click', (event: L.LeafletMouseEvent) =>
      callbacks.current.onPoint({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
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
    map.current?.setView([point.latitude, point.longitude], 17, { animate: false })
  }, [point.latitude, point.longitude])
  useEffect(() => {
    const group = shapes.current
    if (!group) return
    group.clearLayers()
    const safeTooltip = (text: string) => {
      const label = document.createElement('span')
      label.textContent = text
      return label
    }
    properties.forEach((property) => {
      const layer = property.geometry
        ? L.geoJSON(property.geometry as GeoJsonObject, {
            style: { color: '#0b7c6d', weight: 2, fillOpacity: 0.3 },
          })
        : L.circleMarker([property.latitude, property.longitude], {
            radius: 7,
            color: '#0b7c6d',
            fillOpacity: 0.9,
          })
      layer
        .bindTooltip(safeTooltip(property.name))
        .on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent)
          callbacks.current.onProperty(property)
        })
        .addTo(group)
    })
    features.forEach((feature) => {
      L.geoJSON(feature as GeoJsonObject, { style: { color: '#477eb2', weight: 2, fillOpacity: 0.18 } })
        .bindTooltip(safeTooltip(String(feature.properties.name ?? 'Provider building footprint')))
        .on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent)
          callbacks.current.onFeature(feature)
        })
        .addTo(group)
    })
    if (manualGeometry)
      L.geoJSON(manualGeometry as GeoJsonObject, {
        style: { color: '#d79c39', weight: 3, fillOpacity: 0.2 },
      }).addTo(group)
    if (vertices.length) {
      L.polyline(
        vertices.map((vertex) => [vertex.latitude, vertex.longitude] as L.LatLngTuple),
        { color: '#d79c39', dashArray: drawing ? '5 5' : undefined, weight: 3 },
      ).addTo(group)
      vertices.forEach((vertex) =>
        L.circleMarker([vertex.latitude, vertex.longitude], {
          radius: 4,
          color: '#8b651e',
          fillColor: '#f3c36d',
          fillOpacity: 1,
        }).addTo(group),
      )
    }
    if (!drawing)
      L.circleMarker([point.latitude, point.longitude], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#16373d',
        fillOpacity: 1,
      }).addTo(group)
    map.current?.getContainer().classList.toggle('drawing-map', drawing)
  }, [properties, features, point, drawing, vertices, manualGeometry])
  return (
    <div
      ref={element}
      className="building-map"
      aria-label="Interactive building map. Use the coordinate fields to select a location with a keyboard."
    />
  )
}
