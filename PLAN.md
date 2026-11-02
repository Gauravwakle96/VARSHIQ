# VARSHIQ implementation plan

## Scope and audit
The user's GitHub repository was inspected and was empty. Work lives at `C:\Users\gaura\projects\varshiq`, connected to `https://github.com/Gauravwakle96/VARSHIQ`. Existing credentials/provider preferences and unrelated projects are preserved.

Build the real-property workflow with React/TypeScript/Vite and FastAPI/SQLAlchemy/PostgreSQL/PostGIS. The latest accepted scope includes statewide Maharashtra location search, an imported official36-district directory, apartment/community records, supply/consumption ledgers, maintenance/readiness, quality-test history and quoted community investment optimisation. CSN is the configurable default; weather and history always use the selected place/property coordinates. No production fixtures, invented measurements or inferred aquifers. The field pilot requires two authorised residential and two commercial properties plus one apartment/community context; the production property database starts empty.

## Architecture and data contract
- Frontend feature pages call versioned REST APIs; same-origin reverse proxy; accessible responsive teal/ink climate operations UI, locally hosted licensed fonts, reduced motion.
- Backend modular services: geometry/providers, weather/history, hydrology, tank simulation, sizing, recommendations, observations/calibration, reports, grounded assistant.
- Cookie sessions with password hashing, CSRF, object ownership and roles; no public municipal exposure of private property details. Explicit opt-in for aggregate sharing.
- SQLAlchemy relational models with timezone-aware timestamps, source metadata and immutable forecast/calculation snapshots; PostGIS geometry in deployment. SQLite is a labelled local-development fallback, never claimed to verify PostGIS deployment.
- Forecast hourly precipitation validated; tomorrow computed in property timezone. Provider amounts and probability remain distinct. Cached/stale data labelled. Historical reanalysis distinct from IMD observations.
- Hourly event state, per-event first flush, remaining diversion carryover, collection efficiency only after diversion. Tank water balance explicitly tracks demand supplied, unmet demand and overflow. Historical sizing requires genuine complete daily series; sensitivity/cost assumptions exposed.
- GeoJSON validated in WGS84; geodesic footprint area distinct from connected catchment measurement. Manual drawing, OSM lookup and bounded Microsoft tile extraction; no nationwide download.
- IMD/GOBS/groundwater/soil adapters report configuration/availability and require approved source data. No protected scraping. AI optional, server-side gateway credential and backend-authorised result grounding.

## Ordered execution
1. Audit nominated repositories: README, actual licence, selected source/dependencies, datasets/models and provenance; adopt only necessary compatible components. Record evidence and unresolved restrictions.
2. Define schema, API contract, provider configuration and calculation assumptions.
3. Implement registration/authentication/geometry/storage foundation and migrations.
4. Implement live forecast, tomorrow, refresh/cache/history and source status.
5. Implement and test event harvesting and physical tank balance.
6. Implement WaterTwin snapshots, observations, calibration eligibility and capacity comparisons.
7. Implement recommendations, private locality aggregation and exportable reports.
8. Implement frontend flows and optional grounded assistant; advanced modules reported as future/unavailable.
9. Run backend tests/coverage/lint, frontend typecheck/lint/build, dependency audits, meaningful browser checks at 390x844/768x1024/1440x900, permission/error states, review and documented setup/deployment.

## Acceptance and evidence
Track actual execution in VERIFICATION.md. User-authorised real buildings, measured catchments, tank readings, field rainfall, provider access and Docker-engine availability cannot be fabricated. Test fixtures exist only in automated tests. Report local and target acceptance separately.

## UI evidence contract
Primary job: register a property, verify catchment, retrieve real rainfall, inspect WaterTwin and compare storage. First screen shows available records or a registration empty state. Navigation groups property, rainfall, modelling and locality tasks; marketing landing available separately. Ink sidebar, warm neutral canvas, restrained teal/blue accents, clear units/timestamps, prominent verification/source chips. Empty/loading/error/partial/success/permission states have explicit visible feedback and recovery. Target viewports: 390x844, 768x1024, 1440x900.
