# Data provenance and confidence

VARSHIQ keeps source data, user measurements and model results separate. A missing value is not zero. A forecasted collection amount is not actual harvested water. Test fixtures are restricted to isolated automated-test databases and are labelled as synthetic.

## Evidence categories

| Category | Meaning | Storage/display boundary |
| --- | --- | --- |
| Forecast | A provider's estimate for a future interval | Provider, requested/model coordinates, retrieval time, issue time when supplied, timezone, original/normalised interval and resolution |
| Historical reanalysis | Model-assimilated regional weather reconstruction | ERA5 provider/model, daily date coverage and 0.25° regional resolution; separate from IMD/gauge observations |
| Historical gridded observation | Approved IMD regional rainfall grid | IMD source, nearest grid cell, date coverage and 0.25° resolution; separate dataset conditions |
| User-entered information | Owner-supplied catchment, demand, tank or coefficient assumption | Responsible user, input/source, recording time and explicit estimate status |
| Planning assumption | An explicitly authorised illustrative input where site measurements are unavailable | `planning_assumptions` property status, configuration provenance and audit basis; never inserted as roof or water measurement evidence |
| Geospatial estimate | OSM/Microsoft/manual geometry and derived footprint area | Source identifier/URI, CRS EPSG:4326, acquisition time and geodesic method |
| Owner-recorded field evidence | A supplied measurement method, date and evidence note | `field_verified` is owner-recorded evidence, not independent engineering certification |
| Deterministic model estimate | Runoff, diversion, storage, supply, overflow or sizing result | Input/forecast snapshots, calculation assumptions and limitations; never inserted as an actual observation |

## Building records

Registered properties receive unique identifiers. A supplied polygon is validated and its ellipsoidal area calculated with Shapely/PyProj. Polygon holes reduce footprint area. A footprint is not automatically used or verified as connected rooftop catchment. The owner enters effective catchment separately and supplies evidence for field verification.

A user may explicitly confirm a selected or drawn outline and use its area multiplied by an assumed connected roof fraction. This creates a **user-confirmed map estimate**, not a field measurement. `roof_area_provenance` records the source, outline area, fraction, method, responsible user/time and limitations; historical roof evidence uses `map_estimated` status. Roof slope, extensions, ownership and actual pipe connections are not independently established by this confirmation. Remaining planning assumptions stay disclosed, and the catchment is excluded from field-verified rooftop totals.

The Google Maps link is an external visual cross-check of the selected coordinates. VARSHIQ does not scrape Google imagery or derive measurements from a search pin. Automatic polygon calculations use attributed OSM/Microsoft or user-drawn geometry. Source coverage and accuracy remain limitations; missing outlines require drawing or a manually entered area. Geometry/location/area corrections clear superseded map provenance, later field measurements replace the current estimate, and historical evidence remains available. WaterTwin input fingerprints include current map provenance so estimates based on superseded inputs can be flagged.

OSM lookup records the original way identifier and source URL. Microsoft extraction records tile/release source and available height/detection confidence. Missing `-1` values remain unavailable. Microsoft detection confidence relates to footprint recognition; it does not quantify usable roof area or height accuracy. Manual corrections are separate user information.

Private property geometry and photos require authorised access. Photos are re-encoded to strip EXIF/GPS metadata. Municipal outputs use opt-in aggregates and do not disclose private geometries.

## Forecast intervals and caching

Open-Meteo's precipitation, rain and showers describe the preceding hour. VARSHIQ converts source Unix timestamps to elapsed-hour interval starts, retains the source interval end and reports in the property's IANA timezone. Amount and probability remain separate. Liquid rain plus showers drives rooftop inflow; total precipitation can include snow water equivalent.

Tomorrow is derived from the current date in the property timezone, not a hardcoded date. Retrieval time is available; this endpoint does not supply a model issue timestamp, so `issue_time` remains null. Forecast-model resolution is regional and model-dependent; the ensemble probability grid is approximately 27 km. These values do not certify rainfall at an individual roof.

Forecast records are immutable. Cache freshness and provider unavailability are displayed. A stale response is explicitly labelled, and its retained date/coverage must be checked. Forecast accuracy uses a version retrieved before the measured interval; later revised forecasts are not retrospectively scored as if they were earlier predictions.

## WaterTwin time boundary

The model begins at the next complete property-local hour. It excludes elapsed forecast rainfall and demand rather than replaying the day onto a current tank reading. The partially elapsed current hour is omitted and the entered starting volume is carried as an estimate; this is explicit in the calculation assumptions. A stale reading remains a limitation.

First flush is applied per modelled rainfall event, with diversion remaining across wet hours and midnight. The six-hour dry-gap threshold is a configurable domain assumption, not a universal hydrological constant. Unknown antecedent diversion results in a disclosed conservative initial-event assumption. Simulated diversion/event state does not establish that physical first flush actually occurred.

Demand is constrained by available water; unmet demand and overflow are recorded separately. The balance is:

```text
initial storage + net inflow = ending storage + supplied demand + overflow
```

## Historical processing and sizing

Open-Meteo Archive requests a consistent ERA5 model for the selected period. A complete consecutive daily series is required for sizing. Missing or invalid rainfall is rejected rather than filled with zeros. Annual completeness is stated; monthly averages use complete months. Anomalies are relative to complete years in the selected period and are not automatically a recognised long-term climate normal.

The optional IMDLIB adapter reads approved local files using `open_data`; it does not invoke the nationwide downloader. The nearest grid cell and resolution are retained; missing IMD rainfall is not converted to zero. Optional Parquet output contains only the processed regional extract and is ignored by git.

Daily totals cannot identify intraday event gaps. Historical optimisation therefore labels its wet-day first-flush approximation, empty initial historical tank assumption, capacity-selection heuristic, demand and user-supplied indicative costs. Total roof runoff is not equivalent to water saved: demand supplied is reported separately from captured inflow, overflow and unmet demand.

## Actual observations and calibration

Rainfall/collection/diversion observations require measurement intervals and timezone-aware timestamps. Storage observations require physical limits. A tank rise alone is not measured collection when consumption, transfers or leakage occurred during the interval.

Calibration eligibility requires sufficiently many reliable, independent paired intervals and suitable rooftop evidence. Parameters and verification history must remain consistent with the observations. A deterministic efficiency proposal is not labelled a trained AI model. No calibration history is fabricated before observations exist.

## Groundwater, soil and recharge

No aquifer record is inferred or fabricated. Source coverage, resolution, date, availability and verification must be known before such data support decisions. The current recommendation layer reports missing field information and requires professional assessment for recharge/structural advice. Satellite imagery alone does not establish recharge suitability.

## Reports and locality totals

Reports retain property/calculation provenance and explicitly disclose missing or superseded evidence. Locality forecast totals must compare compatible future intervals and current property inputs, with excluded/missing property coverage stated. Aggregation contains genuine registered records only.

An owner-authorised private planning scenario uses real property coordinates and provider forecasts while disclosing assumed catchment, collection, storage and demand inputs. Such catchments are excluded from verified rooftop totals. Forecast/model snapshots may be saved as predictions; assumed rainfall, collection or storage observations are never created. Account credentials, home coordinates and the local property database remain outside source control.

## Optional AI

The assistant retrieves authorised backend information before answering. All physical calculations remain deterministic. Server credentials never appear in the frontend bundle. LLM-generated material is not accepted as a source for roof dimensions, rainfall, tank readings, groundwater or engineering arithmetic; deterministic operation remains available without an LLM.

## Statewide locations and daily operations

See [location provenance](docs/LOCATION_DATA.md) and [water operations](docs/WATER_OPERATIONS.md). All persisted datetimes are normalised to UTC, including SQLite fallback storage, and displayed in the selected property timezone. The imported official district directory contains factual names/links, not properties or measured rooftop data. Geocoder coordinates/addresses remain estimates requiring confirmation.

Water-source, consumption, maintenance and quality-test records keep user/method/date/reliability. Exact community investment selection uses actual quotations and simulated historical additional supply, not trained synthetic benefit models. Superseded/stale WaterTwin predictions are flagged and retained as history.

## Isolated public demonstration

The user-authorised demo has a persistent simulation disclosure. OSM basemap tiles and downloaded building outlines are actual public geography with source links, retrieval timestamps and estimated geodesic footprint area. Selecting an outline does not infer or verify its effective rooftop area, equipment, water use or ownership. The tank marker is schematic, not an observed installation location.

Rainfall, catchment, collection parameters, tank readings, demand, fictional community buildings and indicative costs in this route are explicit scenario inputs. The existing deterministic Python engines generate their water balances and budget choices. The time anchor is illustrative, not tomorrow's forecast. Demo results carry `simulated_demonstration` and `persisted: false`; no properties, observations, reports, calibrations or municipal statistics are persisted from this route. Public map lookups carry `real_public_geography` with `simulated_unverified` water inputs.

The full feature preview at `/#/demo/features` uses the same boundary. Its seasonal distribution, 2001 wet dates, supply fallback, demand allocation and performance readings are explicitly invented. The daily tank engine evaluates a complete synthetic year; those outputs are separate from live historical provider data. Water-quality sample values and inspection practice stay in browser state. Groundwater depth and infiltration remain null rather than invented. Downloaded PDFs carry a SIMULATED title and full source assumptions; they are not stored as real property assessments. The same component can be opened from a private planning property, but preview actions cannot create actual measurements, apply calibration, grant permissions or change the registered building.
