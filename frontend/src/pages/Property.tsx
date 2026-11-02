import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Camera, CheckCircle2, MapPin, Ruler, Save, ShieldCheck } from 'lucide-react'
import { api, patch, post, useApi } from '../api'
import { useWorkspace } from '../context'
import type { Geometry, Property } from '../types'
import RoofAreaInput, { RoofWaterAdvice, type RoofChoice } from '../components/RoofAreaInput'
import {
  Button,
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
  Verification,
} from '../components/ui'

interface MapSelection {
  latitude: number
  longitude: number
  geometry?: Geometry
  geometry_source?: string
  geometry_source_id?: string
  name?: string
  estimate_roof?: boolean
}
interface PilotDefaults {
  pilot_locality: string
  pilot_timezone: string
}
const utcInput = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
export default function PropertyPages({ mode }: { mode: 'register' | 'details' | 'verify' }) {
  const workspace = useWorkspace()
  const location = useLocation()
  const selection = (location.state as { selection?: MapSelection } | null)?.selection
  const settings = useApi<PilotDefaults>(mode === 'register' ? '/admin/settings' : null)
  if (mode === 'register' && settings.loading)
    return <Loading text="Loading your configured pilot locality…" />
  if (mode === 'register' && settings.error)
    return <ErrorState error={settings.error} retry={settings.reload} />
  if (mode === 'register')
    return (
      <PropertyForm
        key={selection ? JSON.stringify(selection) : 'new'}
        selection={selection}
        defaults={settings.data ?? undefined}
      />
    )
  if (!workspace.property)
    return (
      <>
        <PageTitle
          eyebrow="BUILDING INTELLIGENCE"
          title={mode === 'verify' ? 'Rooftop verification' : 'Property details'}
          description="Record real building inputs and their evidence."
        />
        <PropertyNeeded property={null} />
      </>
    )
  if (mode === 'verify') return <VerificationForm key={workspace.property.id} property={workspace.property} />
  return (
    <PropertyForm
      key={JSON.stringify(workspace.property)}
      property={workspace.property}
    />
  )
}

function PropertyForm({
  property,
  selection,
  defaults,
}: {
  property?: Property
  selection?: MapSelection
  defaults?: PilotDefaults
}) {
  const { refreshProperties, selectProperty, notify, activeLocation } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geometry, setGeometry] = useState(property?.geometry ?? selection?.geometry ?? null)
  const [roofChoice, setRoofChoice] = useState<RoofChoice>({ mode: selection?.estimate_roof && selection.geometry ? 'map' : 'manual', confirmed: false, fraction: property?.roof_area_provenance?.connected_fraction ?? 1 })
  const [inputsChanged, setInputsChanged] = useState(false)
  const navigate = useNavigate()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    if (roofChoice.mode === 'map' && (!roofChoice.confirmed || !geometry)) {
      setError('Confirm that this is your building and the outline looks correct.'); setBusy(false); return
    }
    const optionalNumber = (key: string) => (values.get(key) === '' ? null : Number(values.get(key)))
    const payload = {
      name: values.get('name'),
      property_type: values.get('property_type'),
      locality: values.get('locality'),
      latitude: Number(values.get('latitude')),
      longitude: Number(values.get('longitude')),
      timezone: values.get('timezone'),
      country: values.get('country'),
      state: values.get('state'),
      district: values.get('district'),
      city: values.get('city'),
      postcode: values.get('postcode'),
      location_source: values.get('location_source'),
      administrative_ids: property?.administrative_ids ?? activeLocation?.administrative_ids ?? {},
      geometry,
      geometry_source: property?.geometry_source ?? selection?.geometry_source ?? 'manual',
      geometry_source_id: property?.geometry_source_id ?? selection?.geometry_source_id ?? '',
      ...(roofChoice.mode === 'map' ? { roof_map_estimate: { confirmed: true, connected_fraction: roofChoice.fraction } } :
        { effective_catchment_m2: optionalNumber('effective_catchment_m2') }),
      roof_material: values.get('roof_material'),
      runoff_coefficient: optionalNumber('runoff_coefficient'),
      coefficient_source: values.get('coefficient_source'),
      first_flush_mm: Number(values.get('first_flush_mm')),
      collection_efficiency: Number(values.get('collection_efficiency')),
      tank_capacity_l: Number(values.get('tank_capacity_l')),
      current_storage_l: Number(values.get('current_storage_l')),
      daily_demand_l: Number(values.get('daily_demand_l')),
      storage_status: values.get('storage_status'),
      storage_measured_at: new Date(String(values.get('storage_measured_at'))).toISOString(),
      available_space_m2: optionalNumber('available_space_m2'),
      share_aggregate: values.get('share_aggregate') === 'on',
      notes: values.get('notes'),
      ...(property ? { planning_assumptions: property.measurement_status === 'planning_assumptions' } : {}),
    }
    if (payload.current_storage_l > payload.tank_capacity_l) {
      setError('Current storage cannot exceed tank capacity.')
      setBusy(false)
      return
    }
    if (payload.runoff_coefficient != null && !payload.coefficient_source) {
      setError(
        'Record the technical reference, design assumption or measurement behind your runoff coefficient.',
      )
      setBusy(false)
      return
    }
    try {
      const saved = property
        ? await patch<Property>(`/buildings/${property.id}`, payload)
        : await post<Property>('/buildings', payload)
      refreshProperties()
      selectProperty(saved.id)
      notify(
        property
          ? 'Property inputs updated. Re-run WaterTwin to use the new values.'
          : 'Real property registered. Add catchment evidence next.',
      )
      navigate(property || roofChoice.mode === 'map' ? '/property' : '/verify')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BUILDING INTELLIGENCE"
        title={property ? property.name : 'Register your property'}
        description={
          property
            ? `${property.property_code} · Keep physical inputs and their sources up to date.`
            : 'Start with an actual building. Footprint estimates and measured catchment areas are recorded separately.'
        }
        action={
          <Link className="button secondary" to="/map">
            <MapPin size={16} />
            {property ? 'View building map' : 'Select on map'}
          </Link>
        }
      />
      {property && (
        <>
        <Verification property={property} />
        <details className="friendly-details panel">
        <summary>Saved property summary</summary>
        <div className="metrics-grid three">
          <Metric
            label="Effective rooftop catchment"
            value={number(property.effective_catchment_m2, 1)}
            unit="m²"
            detail="From the saved roof input"
          />
          <Metric
            label="Geospatial footprint"
            value={number(property.footprint_area_m2, 1)}
            unit="m²"
            detail={`${property.geometry_source} · estimate`}
          />
          <Metric
            label="Storage reading"
            value={number(property.current_storage_l)}
            unit="L"
            detail={`${property.storage_status} · ${date(property.storage_measured_at, property.timezone)}`}
          />
        </div>
        </details>
        </>
      )}
      <form onSubmit={submit} className="form-stack" onChange={() => setInputsChanged(true)} onInvalidCapture={event => {
        let details = (event.target as HTMLElement).closest('details')
        while (details) {
          details.open = true
          details = details.parentElement?.closest('details') ?? null
        }
      }}>
        <Section title="About your property" subtitle="Start with its name and type. Address details are below.">
          <div className="form-grid">
            <Field label="Property name">
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={property?.name ?? selection?.name ?? ''}
                placeholder="Your building or property name"
              />
            </Field>
            <Field label="Property type">
              <select name="property_type" defaultValue={property?.property_type ?? 'residential'}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="apartment">Apartment society / complex</option>
                <option value="community">Community property</option>
              </select>
            </Field>
          </div>
          <details className="friendly-details" open={!property}>
            <summary>Address and map details</summary>
            <div className="form-grid">
            <Field
              label="Country code"
              hint="IN is the Indian pilot default; verify the actual property country."
            >
              <input
                name="country"
                required
                maxLength={2}
                defaultValue={
                  property?.country ?? (activeLocation?.country?.length === 2 ? activeLocation.country : 'IN')
                }
              />
            </Field>
            <Field label="State" hint="Use sourced administrative context or enter the actual state.">
              <input
                name="state"
                maxLength={100}
                defaultValue={property?.state ?? activeLocation?.state ?? 'Maharashtra'}
              />
            </Field>
            <Field label="District">
              <input
                name="district"
                maxLength={100}
                defaultValue={property?.district ?? activeLocation?.district ?? ''}
              />
            </Field>
            <Field label="City / town">
              <input
                name="city"
                maxLength={100}
                defaultValue={property?.city ?? activeLocation?.city ?? ''}
              />
            </Field>
            <Field label="Locality">
              <input
                name="locality"
                required
                maxLength={100}
                defaultValue={
                  property?.locality ??
                  activeLocation?.locality ??
                  activeLocation?.city ??
                  defaults?.pilot_locality ??
                  ''
                }
              />
            </Field>
            <Field label="Postcode">
              <input
                name="postcode"
                maxLength={20}
                defaultValue={property?.postcode ?? activeLocation?.postcode ?? ''}
              />
            </Field>
            <Field label="Geographic source">
              <select
                name="location_source"
                defaultValue={
                  property?.location_source ??
                  (activeLocation?.source?.toLowerCase().includes('gps')
                    ? 'gps'
                    : /osm|openstreetmap|nominatim|photon/i.test(activeLocation?.source ?? '')
                      ? 'osm'
                      : 'user_entered')
                }
              >
                <option value="user_entered">User-entered coordinates</option>
                <option value="osm">OpenStreetMap geographic lookup</option>
                <option value="gps">Browser GPS coordinates</option>
              </select>
            </Field>
            <Field label="Reporting timezone">
              <input
                name="timezone"
                required
                defaultValue={
                  property?.timezone ?? activeLocation?.timezone ?? defaults?.pilot_timezone ?? 'Asia/Kolkata'
                }
                placeholder="IANA property timezone"
              />
            </Field>
            <Field label="Latitude">
              <input
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
                required
                defaultValue={property?.latitude ?? selection?.latitude ?? activeLocation?.latitude ?? ''}
                placeholder="Actual building latitude"
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
                defaultValue={property?.longitude ?? selection?.longitude ?? activeLocation?.longitude ?? ''}
                placeholder="Actual building longitude"
              />
            </Field>
          </div>
          {!property && activeLocation && !selection && (
            <Notice title="Confirm the actual building position">
              Selected locality coordinates provide geographic context. Check and correct them to your actual
              building before registration.
            </Notice>
          )}
          {geometry && (
            <div className="geometry-attached">
              <MapPin size={18} />
              <div>
                <strong>Building polygon attached</strong>
                <span>
                  Source: {property?.geometry_source ?? selection?.geometry_source ?? 'manual'}. This does not
                  verify the usable roof.
                </span>
              </div>
              <Button type="button" variant="ghost" onClick={() => setGeometry(null)}>
                Remove polygon
              </Button>
            </div>
          )}
          </details>
        </Section>
        <Section
          title="Roof and rainwater collection"
          subtitle="How much roof drains into your collection system?"
        >
          <RoofAreaInput geometry={geometry} source={property?.geometry_source ?? selection?.geometry_source ?? 'manual'}
            latitude={property?.latitude ?? selection?.latitude ?? activeLocation?.latitude ?? 0}
            longitude={property?.longitude ?? selection?.longitude ?? activeLocation?.longitude ?? 0}
            property={property} choice={roofChoice} onChange={choice => { setRoofChoice(choice); setInputsChanged(true) }} />
          <div className="form-grid">
            <Field label="Roof material">
              <select name="roof_material" defaultValue={property?.roof_material ?? 'rcc'}>
                <option value="rcc">RCC</option>
                <option value="concrete">Concrete</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <details className="friendly-details" open={!property}>
            <summary>Collection settings and assumptions</summary>
            <p className="muted">These settings account for runoff, the first dirty rainwater diverted, and losses in filters and pipes.</p>
            <div className="form-grid">
            <Field
              label="Runoff coefficient (0–1)"
              hint="A documented site/design value; material alone does not establish one."
            >
              <input
                name="runoff_coefficient"
                type="number"
                min={0}
                max={1}
                step="any"
                defaultValue={property?.runoff_coefficient ?? ''}
                placeholder="Enter a documented value"
              />
            </Field>
            <Field
              label="Coefficient reference / assumption"
              hint="Document publication, design specification, or field calibration."
            >
              <input
                name="coefficient_source"
                maxLength={500}
                defaultValue={property?.coefficient_source ?? ''}
                placeholder="Source and reason for the chosen value"
              />
            </Field>
            <Field
              label="First-flush diversion depth (mm)"
              hint="Applied per rainfall event as rainfall-equivalent roof runoff; 0 disables diversion."
            >
              <input
                name="first_flush_mm"
                type="number"
                min={0}
                max={100}
                step="any"
                required
                defaultValue={property?.first_flush_mm ?? 0}
              />
            </Field>
            <Field
              label="Collection efficiency (0–1)"
              hint="Remaining proportion after diversion; 1 assumes no filter or conveyance losses."
            >
              <input
                name="collection_efficiency"
                type="number"
                min={0}
                max={1}
                step="any"
                required
                defaultValue={property?.collection_efficiency ?? 1}
              />
            </Field>
          </div>
          </details>
          <RoofWaterAdvice key={property?.id ?? 'new'} property={property} inputsChanged={inputsChanged} />
        </Section>
        <Section
          title="Your tank and daily water use"
          subtitle="Enter how much the tank holds and how much water you need each day. Estimates are allowed when clearly marked."
        >
          <div className="form-grid">
            <Field label="Tank capacity (L)">
              <input
                name="tank_capacity_l"
                type="number"
                min={0}
                step="any"
                required
                defaultValue={property?.tank_capacity_l ?? 0}
              />
            </Field>
            <Field label="Current stored volume (L)">
              <input
                name="current_storage_l"
                type="number"
                min={0}
                step="any"
                required
                defaultValue={property?.current_storage_l ?? 0}
              />
            </Field>
            <Field
              label="Daily water demand (L/day)"
              hint="Enter measured or estimated demand for your chosen use."
            >
              <input
                name="daily_demand_l"
                type="number"
                min={0}
                step="any"
                required
                defaultValue={property?.daily_demand_l ?? 0}
              />
            </Field>
            <Field label="Storage reading status">
              <select name="storage_status" defaultValue={property?.storage_status ?? 'estimated'}>
                <option value="estimated">User estimate</option>
                <option value="measured">Actual measurement</option>
              </select>
            </Field>
          </div>
          <details className="friendly-details">
            <summary>Extra tank details and notes</summary>
            <div className="form-grid">
            <Field label="Storage reading date & time">
              <input
                name="storage_measured_at"
                type="datetime-local"
                required
                defaultValue={
                  property?.storage_measured_at
                    ? new Date(
                        new Date(property.storage_measured_at).getTime() -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : utcInput()
                }
              />
            </Field>
            <Field
              label="Available installation space (m²)"
              hint="Optional field input. Structural suitability needs professional assessment."
            >
              <input
                name="available_space_m2"
                type="number"
                min={0}
                step="any"
                defaultValue={property?.available_space_m2 ?? ''}
                placeholder="Unknown"
              />
            </Field>
          </div>
          <Field label="Drainage, system and demand notes">
            <textarea
              name="notes"
              maxLength={3000}
              defaultValue={property?.notes ?? ''}
              rows={3}
              placeholder="Connected drains, intended water uses, reading method and known constraints…"
            />
          </Field>
          </details>
        </Section>
        <details className="friendly-details panel">
        <summary>Privacy and community sharing</summary>
        <Section title="Privacy & community contribution">
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="share_aggregate"
              defaultChecked={property?.share_aggregate ?? false}
            />
            <span>
              <strong>Allow this property to contribute to municipal aggregates</strong>
              <small>
                Contribution is optional. Owner details and private building geometry stay private.
              </small>
            </span>
          </label>
        </Section>
        </details>
        <InputError error={error} />
        <div className="form-footer">
          <span>
            <ShieldCheck size={16} />
            Inputs are stored in your private workspace.
          </span>
          <Button loading={busy} type="submit">
            <Save size={17} />
            {property ? 'Save property changes' : 'Register real property'}
          </Button>
        </div>
      </form>
      {property && (
        <div className="inline-actions">
          <Link to="/verify" className="button secondary">
            <Ruler size={16} />
            Record field measurement
          </Link>
          <Link to="/twin" className="button primary">
            <ArrowRight size={16} />
            Open WaterTwin
          </Link>
        </div>
      )}
    </>
  )
}

function VerificationForm({ property }: { property: Property }) {
  const { refreshProperties, notify } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = new FormData(event.currentTarget)
    try {
      await post<Property>(`/buildings/${property.id}/measurements`, {
        area_m2: Number(values.get('area_m2')),
        method: values.get('method'),
        evidence_note: values.get('evidence_note'),
        measured_at: new Date(String(values.get('measured_at'))).toISOString(),
        status: values.get('status'),
      })
      refreshProperties()
      setVerified(true)
      notify('Catchment measurement and its verification evidence recorded.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhotoBusy(true)
    setPhotoError(null)
    const form = event.currentTarget
    const values = new FormData(form)
    const file = values.get('file') as File
    if (!file?.size || file.size > 5 * 1024 * 1024) {
      setPhotoError('Select a JPEG or PNG image no larger than 5 MB.')
      setPhotoBusy(false)
      return
    }
    try {
      await api(`/buildings/${property.id}/photos`, { method: 'POST', body: values })
      setPhotos((previous) => [...previous, file.name])
      notify('Private property photo uploaded.')
      form.reset()
    } catch (error) {
      setPhotoError((error as Error).message)
    } finally {
      setPhotoBusy(false)
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="FIELD EVIDENCE"
        title="Measure the roof that collects."
        description={`${property.name} · Record connected catchment area and how it was established.`}
      />
      <div className="metrics-grid three">
        <Metric
          label="Building footprint estimate"
          value={number(property.footprint_area_m2, 1)}
          unit="m²"
          detail={`${property.geometry_source} geometry`}
        />
        <Metric
          label="Effective catchment input"
          value={number(property.effective_catchment_m2, 1)}
          unit="m²"
          detail={<Verification property={property} />}
        />
        <Metric
          label="Measurement principle"
          value="Connected roof"
          detail="Exclude areas draining elsewhere"
        />
      </div>
      <div className="two-column">
        <Section
          title="Catchment measurement"
          subtitle="A field verification is your recorded claim, supported by method and evidence."
        >
          <form onSubmit={submit} className="form-stack">
            <Field label="Measured effective catchment area (m²)">
              <input
                name="area_m2"
                required
                type="number"
                min={0.01}
                step="any"
                defaultValue={property.effective_catchment_m2 ?? ''}
              />
            </Field>
            <Field label="Measurement method">
              <input
                name="method"
                required
                maxLength={160}
                placeholder="Tape survey, building plan verified onsite, GPS survey…"
              />
            </Field>
            <Field label="Measurement status">
              <select
                name="status"
                defaultValue={
                  property.measurement_status === 'field_verified' ? 'field_verified' : 'user_entered'
                }
              >
                <option value="user_entered">User-entered measurement</option>
                <option value="field_verified">Field measurement verified by registrant</option>
              </select>
            </Field>
            <Field label="Measurement date & time">
              <input type="datetime-local" name="measured_at" defaultValue={utcInput()} required />
            </Field>
            <Field
              label="Evidence and verification note"
              hint="Identify who measured, connected drainage checks and supporting evidence."
            >
              <textarea
                name="evidence_note"
                rows={4}
                required
                maxLength={3000}
                placeholder="Method, dimensions, exclusions, verifier and evidence reference…"
              />
            </Field>
            <InputError error={error} />
            {verified && (
              <Notice tone="success" title="Measurement recorded">
                The new evidence will be used by the next WaterTwin calculation.
              </Notice>
            )}
            <Button loading={busy} type="submit">
              <ShieldCheck size={17} />
              Save measurement evidence
            </Button>
          </form>
        </Section>
        <div className="form-stack">
          <Section
            title="Private field photos"
            subtitle="Upload your authorised photos of the catchment, drainage or tank."
          >
            <form onSubmit={upload} className="form-stack">
              <label className="upload-zone">
                <Camera size={28} />
                <strong>Attach measurement evidence</strong>
                <span>JPEG or PNG · maximum 5 MB</span>
                <input name="file" type="file" accept="image/jpeg,image/png" required />
              </label>
              <InputError error={photoError} />
              <Button variant="secondary" loading={photoBusy} type="submit">
                <Camera size={16} />
                Upload private photo
              </Button>
            </form>
            {photos.map((name) => (
              <div key={name} className="uploaded-file">
                <CheckCircle2 size={16} />
                {name}
              </div>
            ))}
          </Section>
          <Notice title="A footprint is a starting point">
            Satellite and map polygons estimate building boundaries. Effective catchment also depends on
            usable roof surfaces and the drainage connected to your harvesting system.
          </Notice>
          <Evidence
            title="Recorded property provenance"
            value={{
              source: property.geometry_source,
              footprint_m2: property.footprint_area_m2,
              catchment_status: property.measurement_status,
              property_code: property.property_code,
            }}
          />
        </div>
      </div>
      <div className="inline-actions">
        <Link to="/property" className="button secondary">
          <Building2 size={16} />
          Review tank & demand
        </Link>
        <Link to="/twin" className="button primary">
          Continue to WaterTwin
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  )
}
