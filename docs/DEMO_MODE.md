# Animated demonstration contract

The public `/#/demo` route is an explicitly simulated educational experience beside Sign in and on the landing page. Its primary job is to explain the idea, beneficiaries, physical water flow, storage choices, community decisions and limitations without registration. The design uses the existing fonts/tokens with a navy water-flow illustration, amber simulation badge and a restrained guided stepper. Target viewports: 390x844, 768x1024 and 1440x900.

Visitors can choose fictional home/office/society profiles, dry/steady/burst rainfall, connected roof area, tank capacity, starting storage and demand. They can pause, replay, step or scrub the animated hourly balance and compare storage alternatives. Reduced-motion users get manual timeline controls. An illustrative community budget uses three fictional buildings and labelled indicative costs.

`POST /api/v1/demo/simulate` accepts bounded numerical inputs and enums only. It is anonymous and stateless: no database dependency, private-property access, external weather/model requests, sessions, stored observations or audit records. Frontend requests omit credentials and do not request authentication. A dedicated process-local rate bucket allows 60 demo requests/minute/IP; controls debounce requests and cancel superseded work. A shared limiter remains necessary when scaling API workers.

The existing deterministic `simulate` water-balance service and exact `select_investments` solver perform all calculations. Synthetic hours have a fixed illustrative time anchor and are shown as scenario days/hours. No demo result becomes a forecast, historical observation, field measurement, calibration record, municipal statistic or production property. Short storage comparisons start empty and show scenario behaviour; they do not replace seasonal sizing. Community benefit is incremental water supplied during the 48-hour scenario; costs are not actual quotations.

Content-state checks: loading shows progress and hides outdated values; errors preserve the explanation with retry; a dry/zero-budget scenario explains empty investment selection; unavailable field/groundwater evidence is explicit; successful calculations expose assumptions; private workspace requires signing in. Every screen shows simulation status. No AI training, water-quality certification, recharge/structural approval or annual saving is fabricated.

Automated tests must check numerical equivalence with the core engine, first-flush/event behaviour, limits, no persistence or outbound calls, private endpoint protection, animation/timeline accuracy, request races, accessibility/reduced motion and mobile layout. Browser evidence stays in ignored local artefact folders.

## Real-map experience

The basemap uses OSM tiles with contributor attribution. Visitors can jump to Chhatrapati Sambhajinagar, Mumbai or Pune, pan elsewhere and select arbitrary coordinates directly on the map. Building retrieval is explicit to avoid unnecessary external requests. `GET /api/v1/demo/footprints` uses the existing OSM adapter, its bounded Overpass query/official map fallback and one-day process cache; it has no database dependency and makes no source-status writes. Its separate rate bucket permits 6 requests/minute/IP. Empty or failed provider results are disclosed without substituting invented outlines.

Actual outlines are selectable by clicking their polygons or using the labelled keyboard dropdown. Selection highlights the geometry and fits it with room for a schematic tank beside the building. The tank percentage and scenario hour follow the same backend-calculated timeline as the larger animation. Its DOM remains stable between frames so level transitions remain smooth. Reduced motion disables decorative rainfall and automatic playback. Missing/superseded water results hide the map tank until the current scenario is ready. Changing map coordinates clears the old lookup/selection and cancels pending requests; selecting geography never overrides the illustrative roof measurements.

Source links, attribution, retrieval time, estimated footprint area and coverage limitations are visible. No mapped building is registered by the demo and no physical harvesting installation is asserted. The signed-in workspace remains the route for actual owner records and forecast retrieval.

Primary UI reference: [Leaflet 1.9 API](https://leafletjs.com/reference.html), including `DivIcon`, marker anchors, polygon events and padded `fitBounds`.

## Full feature workspace

`/#/demo/features?feature=%2Fquality` opens an anonymous preview of a selected navigation item. All 27 items are covered, including residential/commercial/community contexts and role-protected municipal/settings workflows. Desktop uses grouped navigation; mobile/tablet uses an accessible grouped selector. The original animated tour links to this workspace. A private property marked `planning_assumptions` offers **Simulate this feature**; **Return to live workspace** restores the existing page without changing records.

Each preview explains its purpose, beneficiary, source assumptions and missing real-world inputs. Relevant controls update bounded fictional profiles. Map/location pages use actual public OSM geography. WaterTwin reuses the existing animated deterministic timeline, including manual stepping and reduced motion. Other previews include:

- Model-derived tank supply and assumed municipal fallback; a fictional non-potable demand allocation.
- Browser-only inspection practice and sample pH/TDS/turbidity values. These are not performed inspections or actual laboratory records; no drinking safety is certified.
- An invented complete 2001 seasonal rainfall series. The production daily-balance engine compares candidate tanks on that synthetic year without claiming official climate data, actual costs or measured savings.
- Fictional prediction/reading pairs and their mean absolute error, with actual calibration eligibility explicitly false.
- Fictional property/community/budget comparisons. No demo building is registered and verified area remains zero.
- A deterministic question selector explaining precomputed model results without an LLM.
- A downloadable PDF assessment with a SIMULATED title and filename, full input/loss/balance assumptions and missing field evidence. No real report record is created.

`POST /demo/workspace` and `POST /demo/report` have no database, account, external-provider or credential dependencies. They share the existing 60-request/minute demo limiter. The year, rainfall distribution, wet dates, demand allocation and performance differences are illustrative, not a measured/training dataset. Groundwater depth and soil infiltration remain unavailable even in the preview. Actual municipal and system-setting authorisation remains enforced on live endpoints.

Tests check all menu destinations, responsive navigation, stateful practice controls, report download, reduced motion, failure/retry, source separation, evidence immutability and role boundaries. Accessibility checks wait for the short entrance animation to settle before evaluating contrast.
