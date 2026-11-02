export type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
export type Feature = {
  type: 'Feature'
  geometry: Geometry
  properties: Record<string, unknown>
  id?: string | number
}
export interface User {
  id: string
  name: string
  email: string
  role: string
  organisation_id: string
}
export interface Session {
  user: User | null
  csrf_token: string
}
export interface Property {
  id: string
  property_code: string
  name: string
  property_type: 'residential' | 'commercial' | 'apartment' | 'community'
  locality: string
  country?: string
  state?: string
  district?: string
  city?: string
  postcode?: string
  location_source?: string
  administrative_ids?: Record<string, unknown>
  latitude: number
  longitude: number
  timezone: string
  geometry: Geometry | null
  geometry_source: string
  geometry_source_id?: string
  footprint_area_m2: number | null
  effective_catchment_m2: number | null
  measurement_status: 'unverified' | 'user_entered' | 'field_verified' | 'planning_assumptions'
  roof_material: string
  runoff_coefficient: number | null
  coefficient_source: string
  first_flush_mm: number
  collection_efficiency: number
  tank_capacity_l: number
  current_storage_l: number
  daily_demand_l: number
  storage_measured_at: string
  storage_status: string
  available_space_m2: number | null
  share_aggregate: boolean
  notes: string
  created_at: string
  measurements?: Record<string, unknown>[]
  observations?: Observation[]
}
export interface Hour {
  time: string
  precipitation_mm: number
  probability_pct: number | null
  rain_mm?: number
  showers_mm?: number
}
export interface ForecastDay {
  date: string
  precipitation_mm: number
  probability_pct: number | null
  precipitation_hours?: number
}
export interface Forecast {
  id?: string
  provider: string
  retrieved_at: string
  issue_time: string | null
  timezone: string
  latitude: number
  longitude: number
  model_latitude: number
  model_longitude: number
  spatial_resolution: string
  stale: boolean
  cache: boolean
  attribution: string
  hourly: Hour[]
  daily: ForecastDay[]
  tomorrow: ForecastDay & { hourly: Hour[] }
}
export interface Historical {
  provider: string
  data_kind: string
  coverage: unknown
  spatial_resolution: string
  attribution: string
  daily: { date: string; precipitation_mm: number }[]
  annual: { year: number; total_mm: number; complete: boolean }[]
  monthly: { month: number; mean_mm: number }[]
  seasonal: unknown
  limitations: string[]
}
export interface SimHour {
  time: string
  rainfall_mm: number
  gross_runoff_l: number
  first_flush_l: number
  collection_loss_l: number
  net_inflow_l: number
  storage_l: number
  overflow_l: number
  water_supplied_l: number
  unmet_demand_l: number
  event_id?: number | string | null
}
export interface Simulation {
  rainfall_mm: number
  rainfall_volume_l: number
  gross_runoff_l: number
  first_flush_l: number
  collection_loss_l: number
  net_inflow_l: number
  initial_storage_l: number
  final_storage_l: number
  overflow_l: number
  water_supplied_l: number
  unmet_demand_l: number
  demand_l: number
  capacity_l: number
  balance_error_l: number
  events: Record<string, unknown>[]
  hourly: SimHour[]
  daily: {
    date: string
    rainfall_mm: number
    net_inflow_l: number
    storage_l: number
    overflow_l: number
    water_supplied_l: number
    unmet_demand_l: number
  }[]
  assumptions?: string[]
  limitations?: string[]
}
export interface Twin {
  id: string
  property_id: string
  forecast: Forecast
  calculation: Simulation
  assumptions: unknown
  confidence: unknown
  readiness: unknown
  stale?: boolean
  stale_reasons?: string[]
  inputs_changed?: boolean
  snapshot_retrieved_at?: string
  horizon_days?: number
}
export interface Observation {
  id: string
  kind: string
  measured_at: string
  interval_start?: string
  interval_end?: string
  value: number | null
  unit: string
  method: string
  reliability: string
  notes: string
}
export interface Source {
  name?: string
  id?: string
  provider?: string
  status: string
  message?: string
  detail?: string
  last_success?: string
  attribution?: string
  [key: string]: unknown
}
export interface Community {
  locality: string
  registered_count: number
  residential_count: number
  commercial_count: number
  verified_rooftop_m2: number
  unverified_count: number
  storage_capacity_l: number
  forecast_potential_l: number | null
  overflow_l: number | null
  properties: Property[]
  limitations: string[]
  apartment_count?: number
  community_count?: number
}
export interface Report {
  id: string
  property_id: string
  property_name?: string
  created_at: string
  [key: string]: unknown
}
export interface LocationResult {
  id: string
  display_name: string
  latitude: number
  longitude: number
  country: string
  state: string
  district?: string
  city?: string
  locality?: string
  postcode?: string
  timezone: string
  bbox?: number[] | null
  source: string
  attribution: string
  attribution_url?: string
  administrative_ids?: Record<string, unknown>
}
