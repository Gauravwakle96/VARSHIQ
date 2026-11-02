# VARSHIQ REST API

Base path: `/api/v1`. The running API's `/docs` and `/openapi.json` are the authoritative request schemas. Most application JSON responses use `{ "data": ..., "meta": ... }`; errors use `{ "error": { "code": ..., "message": ..., "details": ... } }`. Validation errors omit original input values so passwords are not echoed.

All property, forecast, modelling, observation, report and source-status endpoints require a signed-in user. Health and session bootstrap are public. Cookies are HTTP-only and SameSite Strict; Secure cookies are enabled in production. Browser requests use credentials and the same-origin proxy. State-changing requests require `X-CSRF-Token` obtained from the session endpoint and the matching cookie. Authorised origins are configured server-side.

## Authentication

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/auth/session` | None | Current user or null plus fresh `csrf_token` |
| POST `/auth/register` | `name`, `email`, password ≥12 characters | Private organisation and owner account; no public admin escalation |
| POST `/auth/login` | `email`, `password` | Authenticated session and new CSRF token |
| POST `/auth/logout` | Empty object | Current session revoked |
| GET `/health` | None | Database connection health, version and pilot requirement |

Operator role assignment is local CLI administration, not a public API:

```powershell
uv run python -m app.cli set-role ACCOUNT_EMAIL municipal
# Other allowed roles: owner, admin
```

## Properties and geometry

| Method/path | Purpose |
| --- | --- |
| GET `/buildings` | List organisation-authorised property records |
| POST `/buildings` | Register residential/commercial property |
| GET `/buildings/{id}` | Property detail, roof measurements, observations and photo metadata |
| PATCH `/buildings/{id}` | Validate and update supplied fields; immutable history retained |
| POST `/buildings/geometry` | Validate WGS84 Polygon/MultiPolygon; return geodesic area/centroid/method |
| GET `/buildings/lookup?latitude=…&longitude=…&provider=osm` | Bounded real OSM lookup; `microsoft` requires enabling its tile adapter |
| POST `/buildings/{id}/measurements` | Record effective catchment, method/evidence, aware timestamp and user/field status |
| POST `/buildings/{id}/photos` | Multipart `file` JPEG/PNG; bounded safe decoding/re-encoding |
| GET `/buildings/{id}/photos/{photo_id}` | Private photo download |

Registration requires `name`, `property_type`, `latitude` and `longitude`. Supported optional modelling fields include `timezone`, geometry/source metadata, `effective_catchment_m2`, roof material, `runoff_coefficient`, `coefficient_source`, `first_flush_mm`, `collection_efficiency`, `tank_capacity_l`, `current_storage_l`, `daily_demand_l`, storage status, installation space, sharing consent and notes. A coefficient needs its disclosed source/assumption. Geometry is a footprint estimate and does not verify catchment. Tank volume cannot exceed capacity. Meaningful geometry/location/roof changes require verification reassessment.

## Rainfall

| Method/path | Query/purpose |
| --- | --- |
| GET `/weather/forecast` | `property_id` or coordinates/timezone; `days` 1–14; `refresh` optional |
| GET `/weather/tomorrow` | Property or coordinates; tomorrow derived in local timezone |
| GET `/weather/historical` | `start_date`, `end_date`, property/coordinates; provider `open_meteo` or approved `imd` |
| GET `/weather/imd/{product}` | Separately display optional official IMD product |
| GET `/weather/status` | Provider configuration/last checked connection status |
| GET `/data-sources/status` | Weather, buildings, historical, optional and future module status |

Forecast output includes requested/model coordinates, provider, retrieval time, nullable issue time, timezone, resolution, attribution and fresh/stale flags. Hourly data retains interval-start `time`, original source interval end, total precipitation, liquid rainfall, probability, rain and showers. Daily precipitation and probability remain distinct.

Historical requests are limited to ten years and require complete consecutive daily data. ERA5 begins in 1940 and requires an end date at least five days before the current local date. It is historical **reanalysis**, not a gauge or IMD observation. IMD regional gridded data require approved local files, terms acceptance and the historical optional dependency group.

IMD district/subdivision spatial-distribution categories are not rainfall millimetres or point probabilities. Official IMD products are not silently merged with Open-Meteo into rooftop calculations. Documented access headers are operator-configured; an authentication scheme is not invented.

## Runoff, WaterTwin and storage

| Method/path | Input/result |
| --- | --- |
| POST `/rainwater/calculate` | One user-defined event: area, rainfall, coefficient, first flush and efficiency → complete loss breakdown |
| POST `/rainwater/forecast` | `{property_id, days}` → immutable forecast-backed WaterTwin |
| POST `/rainwater/scenario` | `{property_id, days, capacity_l, daily_demand_l}` → labelled scenario without changing measurements |
| GET `/rainwater/history/{property_id}` | Authorised saved prediction history |
| GET `/storage/{property_id}` | Tank, actual observations and latest simulation |
| POST `/storage/optimise` | Actual daily history, candidate capacities and optional user cost → transparent comparisons |
| POST `/storage/observations` | Genuine storage/rainfall/collection/overflow/first-flush/maintenance information |

The single-event calculation uses:

```text
rainfall volume (L) = area (m²) × rainfall (mm)
roof runoff = rainfall volume × runoff coefficient
net inflow = (roof runoff − first-flush diversion) × collection efficiency
```

WaterTwin groups hourly events, carries first-flush state and enforces tank limits. It reports gross runoff, diversion, collection loss, net inflow, initial/final storage, supplied/unmet demand, overflow, residual balance and event/hour/day breakdowns. It begins at the next complete local hour; elapsed forecast rain is not replayed onto current storage. A candidate capacity below entered current volume is rejected rather than inventing a discharge.

Optimisation requires `property_id`, `capacities_l`, `start_date` and `end_date`; `cost_per_l_inr` is optional. The current tank is included for comparison. Daily first flush is an explicitly approximate wet-day treatment; recommendations state the objective/heuristic and do not automatically certify the largest tank or structural feasibility.

## Observations, performance and calibration

Observation fields: property, kind, `measured_at`, applicable interval start/end, nonnegative value, unit (`mm`, `L` or `note`), method, reliability and notes. Accumulated values need a complete positive interval ending by the measurement time. Actual timestamps cannot be future values. Tank storage is physically bounded.

| Method/path | Purpose |
| --- | --- |
| GET `/calibration/{property_id}` | Real observations, prior-forecast comparisons, eligibility, paired measurements and records |
| POST `/calibration/{property_id}/apply` | Apply eligible deterministic efficiency proposal with audit/history |

Calibration requires at least ten nonoverlapping reliable intervals with rainfall, collection and actual first-flush measurements, suitable verified catchment and matching parameter evidence. No history or trained model is invented for empty records.

## Recommendations, locality and assistant

| Method/path | Purpose |
| --- | --- |
| POST `/recommendations/generate` | Preliminary property-specific storage/recharge screening |
| GET `/recommendations/{property_id}` | Latest saved object or null |
| GET `/dashboard/locality` | Organisation-authorised aggregate; optional locality/property-type filters |
| GET `/dashboard/municipal` | Municipal/admin role; opt-in aggregates, no private geometry |
| POST `/assistant/chat` | Question plus optional property → authorised backend-grounded answer/sources |

Recommendations expose assumptions and missing information. Recharge always requires appropriate field/engineering assessment. Locality forecast totals require compatible future windows and current/fresh evidence; missing coverage remains explicit.

## Reports and settings

| Method/path | Purpose |
| --- | --- |
| GET `/reports` | Private report metadata |
| POST `/reports` | Create immutable property assessment snapshot |
| GET `/reports/{id}/download?format=pdf` | Private PDF or `format=html` export with assumptions/provenance |
| GET `/reports/locality/download` | Authorised locality PDF/HTML, optional locality/property-type filters; municipal mode requires municipal/admin role and opt-in scope |
| GET `/admin/settings` | Nonsecret pilot/provider configuration and current role |
| PATCH `/admin/settings` | Admin-only allowlisted `pilot_locality`, latitude, longitude and timezone |

External API credentials are never returned by settings. Report exports identify missing/superseded simulation evidence and distinguish forecast estimates from actual measurements.

## Operational limits

Rate limiting is process-local in the initial single-worker deployment; expensive requests have tighter limits. The API counts body bytes before parsing and the reverse proxy also limits request size. No internal exception stack or provider credential is included in client errors. Consult the running OpenAPI schema for exact bounds/status codes.

## Geographic and operations API extensions

All endpoints use the existing authenticated `{data, meta}` envelope; POST requires CSRF.

| Method | Path | Flow |
|---|---|---|
| GET | `/api/v1/locations/districts?state=Maharashtra` | Official attributed district directory |
| GET | `/api/v1/locations/search?q=Pune&country=IN&state=Maharashtra` | Explicit-submit real geocoding with cache/rate bounds |
| GET | `/api/v1/locations/reverse?latitude=19.8762&longitude=75.3433` | Nearest indexed address estimate, original coordinates retained |
| GET | `/api/v1/watertwin/{property_id}` | Tank/measurement state and flagged latest prediction |
| POST | `/api/v1/watertwin/simulate` | Alias of forecast WaterTwin service |
| GET | `/api/v1/water-sources/{property_id}?days=30` | Authorised supply/consumption ledger and window exclusions |
| POST | `/api/v1/water-sources/records` | Source, volume, interval, method, reliability, notes |
| POST | `/api/v1/consumption/records` | Use category, optional source, volume and interval evidence |
| GET | `/api/v1/maintenance/{property_id}` | Actual work history, due/inspection alerts and forecast readiness |
| POST | `/api/v1/maintenance/records` | Task, performed_at, condition, optional next_due_at and notes |
| GET/POST | `/api/v1/water-quality/{property_id}` / `/api/v1/water-quality/records` | Measured quality history/record creation |
| GET | `/api/v1/groundwater/{property_id}` | Approved evidence, coverage status and professional-assessment boundary |
| POST | `/api/v1/community/optimise` | Budget/dates/provider and quoted property storage options |

See interactive FastAPI `/docs` for precise validation schemas and [WATER_OPERATIONS.md](docs/WATER_OPERATIONS.md) for calculation/evidence boundaries. Supply/use overlap returns409. Invalid timestamps, measurement ranges and budgets return422. External provider failure returns502/503 without substituted data.
