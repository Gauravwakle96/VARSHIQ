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
  ExternalLink,
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
  search_scope?: 'nearby' | 'neighbourhood'
  lookup_attempts?: { provider: string; status: string; outlines?: number; search_scope?: string }[]
}
interface Point {
  latitude: number
  longitude: number
}
export default function MapPage() {
  const { properties, property, propertiesLoading, selectProperty, refreshProperties, notify, activeLocation } = useWorkspace()
  const [point, setPoint] = useState<Point>(
    activeLocation
      ? { latitude: activeLocation.latitude, longitude: activeLocation.longitude }
      : property
        ? { latitude: property.latitude, longitude: property.longitude }
        : { latitude: 20.5937, longitude: 78.9629 },
  )
  // Keep the lookup centre separate from the selected roof. Selecting an outline
  // must not trigger another search that clears that selection.
  const [searchPoint, setSearchPoint] = useState<Point>(point)
  const [provider, setProvider] = useState('auto')
  const [searchRevision, setSearchRevision] = useState(0)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchRequest = useRef<AbortController | null>(null)
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
  const locationLatitude = activeLocation?.latitude ?? property?.latitude ?? settings.data?.pilot_latitude
  const locationLongitude = activeLocation?.longitude ?? property?.longitude ?? settings.data?.pilot_longitude
  useEffect(() => {
    if (locationLatitude == null || locationLongitude == null) return
    const next = { latitude: locationLatitude, longitude: locationLongitude }
    setPoint(next)
    setSearchPoint(next)
    setCandidate(null)
    setManualGeometry(null)
    setVertices([])
    setDrawing(false)
    setArea(null)
  }, [locationLatitude, locationLongitude, property?.id, activeLocation?.id])
  useEffect(() => {
    const controller = new AbortController()
    searchRequest.current = controller
    setLookup(null)
    setSearchError(null)
    if (propertiesLoading || locationLatitude == null || locationLongitude == null) return () => controller.abort()
    if (!Number.isFinite(searchPoint.latitude) || Math.abs(searchPoint.latitude) > 85 ||
        !Number.isFinite(searchPoint.longitude) || Math.abs(searchPoint.longitude) > 180) {
      setSearchBusy(false)
      setSearchError('Enter a latitude between −85 and 85 and a longitude between −180 and 180.')
      return () => controller.abort()
    }
    setSearchBusy(true)
    const timer = window.setTimeout(() => {
      api<Lookup>(`/buildings/lookup?${query({ ...searchPoint, provider })}`, { signal: controller.signal })
        .then(response => { if (!controller.signal.aborted) setLookup(response) })
        .catch(error => { if (!controller.signal.aborted) setSearchError((error as Error).message) })
        .finally(() => { if (!controller.signal.aborted) setSearchBusy(false) })
    }, 650)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [searchPoint, provider, searchRevision, propertiesLoading, locationLatitude, locationLongitude])
  function movePoint(next: Point) {
    searchRequest.current?.abort()
    setPoint(next)
    setSearchPoint(next)
    setLookup(null)
    setCandidate(null)
    setManualGeometry(null)
    setVertices([])
    setArea(null)
    setError(null)
  }
  function search() {
    movePoint(point)
    setSearchRevision(value => value + 1)
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
          geometry_source: candidate ? lookup?.provider : 'manual',
          geometry_source_id: candidate
            ? String(candidate.id ?? candidate.properties.source_id ?? candidate.properties.id ?? '')
            : '',
          ...(typeof featureName === 'string' ? { name: featureName } : {}),
        },
      },
    })
  }
  function chooseBuilding(feature: Feature) {
    if (drawing) return
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
        geometry_source: candidate ? lookup?.provider : 'manual',
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
        movePoint({ latitude: position.coords.latitude, longitude: position.coords.longitude })
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
            ? `${activeLocation.display_name} · Nearby building outlines load automatically.`
            : 'Nearby building outlines load automatically. Select your roof and check that its outline looks right.'
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
            selected={candidate}
            fitNeighbourhood={lookup?.search_scope === 'neighbourhood'}
            point={point}
            drawing={drawing}
            vertices={vertices}
            manualGeometry={manualGeometry}
            onPoint={(next) => {
              if (drawing) setVertices((current) => [...current, next])
              else movePoint(next)
            }}
            onSearchArea={movePoint}
            onFeature={chooseBuilding}
            onProperty={(item) => {
              selectProperty(item.id)
              navigate('/property')
            }}
          />
          <div className="map-top-label">
            <span className="status-dot" />
            <span>{drawing ? `Drawing · ${vertices.length} vertices` : searchBusy ? 'Finding nearby buildings…' : 'Real-world building map'}</span>
          </div>
          <div className="map-bottom-label">
            <MousePointer2 size={15} />
            {drawing
              ? 'Click the boundary points, then finish the polygon.'
              : 'Click to choose coordinates. Click a footprint to select it.'}
          </div>
        </div>
        <div className="map-inspector">
          <Section title="Find your building" subtitle="Outlines appear automatically when you choose a place.">
            <div className="form-stack">
              <div className="map-lookup-status" role="status" aria-live="polite">
                {searchBusy ? <p>Looking for building outlines… The first search can take a moment.</p> : lookup && (
                  lookup.features.length ? <p><strong>{lookup.features.length} building outline{lookup.features.length === 1 ? '' : 's'} found</strong><br />
                    {lookup.provider === 'microsoft' ? 'Microsoft building footprints' : 'OpenStreetMap'} · Select a blue outline.
                    {lookup.search_scope === 'neighbourhood' && <span className="map-coverage-note">We looked a little farther to find these buildings. Your original pin has not moved.</span>}</p> :
                    <p><strong>No mapped outlines here yet</strong><br />This does not mean there are no houses.
                      Check the pin, try another source, or draw your roof outline.</p>
                )}
              </div>
              <div className="form-grid compact">
                <Field label="Latitude">
                  <input
                    type="number"
                    aria-label="Lookup latitude"
                    min={-85}
                    max={85}
                    step="any"
                    value={point.latitude}
                    onChange={(event) =>
                      movePoint({ ...point, latitude: Number(event.target.value) })
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
                      movePoint({ ...point, longitude: Number(event.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field label="Building outline source">
                <select
                  value={provider}
                  onChange={(event) => {
                    setProvider(event.target.value)
                    movePoint(point)
                  }}
                >
                  <option value="auto">Automatic · available sources</option>
                  <option value="osm">OpenStreetMap</option>
                  <option value="microsoft">Microsoft building footprints</option>
                </select>
              </Field>
              <Button loading={searchBusy} disabled={drawing || busy} onClick={search}>
                <Search size={16} />
                Find nearby buildings
              </Button>
              <InputError error={searchError} />
              <Button variant="secondary" loading={busy} onClick={location}>
                <LocateFixed size={16} />
                Use my GPS location
              </Button>
              <InputError error={error} />
            </div>
          </Section>
          <Section title="Roof not outlined?" subtitle="Check the roof on a map, then draw its boundary here.">
            <div className="form-stack">
              <a className="button secondary" href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Check in Google Maps
              </a>
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
            search_scope: lookup.search_scope,
            lookup_attempts: lookup.lookup_attempts,
          }}
        />
      )}
    </>
  )
}

function MapCanvas({
  properties,
  features,
  selected,
  fitNeighbourhood,
  point,
  drawing,
  vertices,
  manualGeometry,
  onPoint,
  onSearchArea,
  onFeature,
  onProperty,
}: {
  properties: Property[]
  features: Feature[]
  selected: Feature | null
  fitNeighbourhood: boolean
  point: Point
  drawing: boolean
  vertices: Point[]
  manualGeometry: Geometry | null
  onPoint: (point: Point) => void
  onSearchArea: (point: Point) => void
  onFeature: (feature: Feature) => void
  onProperty: (property: Property) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const shapes = useRef<L.LayerGroup | null>(null)
  const callbacks = useRef({ onPoint, onFeature, onProperty, onSearchArea, drawing })
  useEffect(() => {
    callbacks.current = { onPoint, onFeature, onProperty, onSearchArea, drawing }
  }, [onPoint, onFeature, onProperty, onSearchArea, drawing])
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
    instance.on('dragend', () => {
      if (callbacks.current.drawing || instance.getZoom() < 16) return
      const centre = instance.getCenter()
      callbacks.current.onSearchArea({ latitude: centre.lat, longitude: centre.lng })
    })
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
    if (Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 85 &&
        Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180) {
      map.current?.setView([point.latitude, point.longitude], Math.max(map.current.getZoom(), 17), { animate: false })
    }
  }, [point.latitude, point.longitude])
  useEffect(() => {
    if (!fitNeighbourhood || !features.length || !map.current) return
    const bounds = L.geoJSON({ type: 'FeatureCollection', features } as GeoJsonObject).getBounds()
    // Include the original pin without updating the selected property/location.
    bounds.extend(map.current.getCenter())
    map.current.fitBounds(bounds, { padding: [40, 60], maxZoom: 17, animate: false })
  }, [features, fitNeighbourhood])
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
            interactive: !drawing,
            style: { color: '#0b7c6d', weight: 2, fillOpacity: 0.3 },
          })
        : L.circleMarker([property.latitude, property.longitude], {
            radius: 7,
            interactive: !drawing,
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
      L.geoJSON(feature as GeoJsonObject, {
        interactive: !drawing,
        bubblingMouseEvents: false,
        style: { color: selected === feature ? '#163b99' : '#2764cc', weight: selected === feature ? 4 : 2,
          fillOpacity: selected === feature ? 0.4 : 0.18 },
      })
        .bindTooltip(safeTooltip(String(feature.properties.name ?? 'Provider building footprint')))
        .on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent)
          callbacks.current.onFeature(feature)
        })
        .addTo(group)
    })
    if (manualGeometry)
      L.geoJSON(manualGeometry as GeoJsonObject, {
        interactive: false,
        style: { color: '#d79c39', weight: 3, fillOpacity: 0.2 },
      }).addTo(group)
    if (vertices.length) {
      L.polyline(
        vertices.map((vertex) => [vertex.latitude, vertex.longitude] as L.LatLngTuple),
        { color: '#d79c39', dashArray: drawing ? '5 5' : undefined, weight: 3, interactive: false },
      ).addTo(group)
      vertices.forEach((vertex) =>
        L.circleMarker([vertex.latitude, vertex.longitude], {
          radius: 4,
          interactive: false,
          color: '#8b651e',
          fillColor: '#f3c36d',
          fillOpacity: 1,
        }).addTo(group),
      )
    }
    if (!drawing && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 85 &&
        Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180)
      L.circleMarker([point.latitude, point.longitude], {
        interactive: false,
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#16373d',
        fillOpacity: 1,
      }).addTo(group)
    map.current?.getContainer().classList.toggle('drawing-map', drawing)
  }, [properties, features, selected, point, drawing, vertices, manualGeometry])
  return (
    <div
      ref={element}
      className="building-map"
      aria-label="Interactive building map. Use the coordinate fields to select a location with a keyboard."
    />
  )
}
