import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import { ArrowUpRight, MapPin, Pencil, Sparkles } from 'lucide-react'
import { api, post } from '../api'
import type { Geometry, Property } from '../types'
import { Button, Chip, Evidence, Field, InputError, Loading, number } from './ui'

export interface RoofChoice { mode: 'manual' | 'map'; confirmed: boolean; fraction: number }

export default function RoofAreaInput({ geometry, source, latitude, longitude, property, choice, onChange }: {
  geometry: Geometry | null; source: string; latitude: number; longitude: number;
  property?: Property; choice: RoofChoice; onChange: (choice: RoofChoice) => void;
}) {
  const geometryKey = JSON.stringify(geometry)
  const [assessment, setAssessment] = useState<{ key: string; area_m2: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (choice.mode !== 'map' || !geometry) return
    const controller = new AbortController()
    setError(null)
    api<{ area_m2: number }>('/buildings/geometry', {
      method: 'POST', body: JSON.stringify({ geometry }), signal: controller.signal,
    }).then(result => { if (!controller.signal.aborted) setAssessment({ key: geometryKey, area_m2: result.area_m2 }) })
      .catch(error => { if (!controller.signal.aborted) setError((error as Error).message) })
    return () => controller.abort()
  }, [geometry, geometryKey, choice.mode])
  const area = assessment?.key === geometryKey ? assessment.area_m2 : null
  return (
    <div className="roof-area-input">
      <div className="roof-methods" aria-label="Choose how to enter roof area">
        {geometry ? <Button type="button" variant={choice.mode === 'map' ? 'primary' : 'secondary'}
          aria-pressed={choice.mode === 'map'} onClick={() => onChange({ ...choice, mode: 'map', confirmed: false })}>
          <MapPin size={16} /> Estimate from this outline
        </Button> : <Link to="/map" className="button primary"><MapPin size={16} /> Find my roof on the map</Link>}
        <Button type="button" variant={choice.mode === 'manual' ? 'primary' : 'secondary'}
          aria-pressed={choice.mode === 'manual'} onClick={() => onChange({ ...choice, mode: 'manual', confirmed: false })}>
          <Pencil size={16} /> Enter my own area
        </Button>
      </div>
      {choice.mode === 'manual' ? (
        <Field label="Effective rooftop catchment (m²)" hint="Roof area draining into your collection pipes. Leave blank if unknown.">
          <input name="effective_catchment_m2" type="number" min={0.01} step="any"
            defaultValue={property?.effective_catchment_m2 ?? ''} placeholder="Enter your roof area" />
        </Field>
      ) : geometry ? (
        <div className="roof-map-estimate">
          <OutlineMap key={geometryKey} geometry={geometry} />
          <div className="roof-estimate-copy">
            <Chip tone="blue">Map estimate · {source === 'manual' ? 'drawn outline' : source.toUpperCase()}</Chip>
            <h3>Does this outline match your roof?</h3>
            {error ? <InputError error={error} /> : area == null ? <Loading text="Measuring the map outline…" /> :
              <div className="roof-estimate-value">{number(area * choice.fraction, 1)} <span>m² for collection</span></div>}
            <p>The outline gives an area estimate. Roof shape and pipe connections still need checking.</p>
            <div className="inline-actions">
              <Link to="/map" className="text-link">Adjust or draw an outline <Pencil size={14} /></Link>
              <a className="text-link" href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                target="_blank" rel="noopener noreferrer">Check in Google Maps <ArrowUpRight size={14} /></a>
            </div>
            <details className="friendly-details">
              <summary>Only part of my roof collects rain</summary>
              <Field label="Roof area connected (%)" hint="100% assumes the full outline drains into collection. Change this if only part is connected.">
                <input type="number" min={1} max={100} step="any" value={choice.fraction * 100}
                  onChange={event => onChange({ ...choice, fraction: Number(event.target.value) / 100, confirmed: false })} />
              </Field>
            </details>
            <label className="roof-outline-confirm">
              <input type="checkbox" required checked={choice.confirmed} disabled={area == null || Boolean(error)}
                onChange={event => onChange({ ...choice, confirmed: event.target.checked })} />
              <span>This is my building and the outline looks correct</span>
            </label>
            <small>Saved as a user-confirmed map estimate, never as a field measurement.</small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OutlineMap({ geometry }: { geometry: Geometry }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { zoomControl: false, attributionControl: true, dragging: false,
      keyboard: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const layer = L.geoJSON(geometry as GeoJsonObject, { style: { color: '#087d6b', weight: 3, fillOpacity: .25 }, interactive: false }).addTo(map)
    map.fitBounds(layer.getBounds(), { padding: [25, 25], maxZoom: 19, animate: false })
    const resize = new ResizeObserver(() => { map.invalidateSize({ animate: false }); map.fitBounds(layer.getBounds(), { padding: [25, 25], maxZoom: 19, animate: false }) })
    resize.observe(container.current)
    return () => { resize.disconnect(); map.remove() }
  }, [geometry])
  return <div ref={container} className="roof-outline-map" role="region" aria-label="Selected building outline on OpenStreetMap" />
}

export function RoofWaterAdvice({ property, inputsChanged }: { property?: Property; inputsChanged: boolean }) {
  const [reply, setReply] = useState<{ answer: string; mode: string; sources: unknown; limitations: unknown } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canAsk = Boolean(property?.effective_catchment_m2 && !inputsChanged)
  async function ask(message: string) {
    setBusy(true); setError(null); setReply(null)
    try { setReply(await post('/assistant/chat', { property_id: property?.id, message })) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <div className="roof-water-advice">
      <div><Sparkles size={19} /><strong>What could this roof do for me?</strong></div>
      <p>{canAsk ? 'Use your saved roof details and real rainfall forecasts to understand potential collection.' :
        'Save your roof details first to get guidance for this property.'}</p>
      <div className="inline-actions">
        <Button type="button" variant="secondary" disabled={!canAsk || busy} onClick={() => ask('How much could this roof collect tomorrow?')}>
          How much water could I collect?
        </Button>
        <Button type="button" variant="ghost" disabled={!canAsk || busy} onClick={() => ask('Which harvesting improvements would help this roof?')}>
          Suggest improvements
        </Button>
      </div>
      {busy && <Loading text="Checking your saved inputs and backend results…" />}
      <InputError error={error} />
      {reply && !inputsChanged && <div className="roof-advice-answer" role="status">
        <p>{reply.answer}</p><small>{reply.mode === 'ai_gateway' ? 'AI explanation grounded in backend results' : 'Backend-calculated guidance · no paid AI needed'}</small>
        <Evidence title="Sources and limits" value={{ sources: reply.sources, limitations: reply.limitations }} />
      </div>}
    </div>
  )
}
