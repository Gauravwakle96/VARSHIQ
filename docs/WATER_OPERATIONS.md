# Water records and community investment

Water source and consumption entries represent owner-recorded past intervals. Supply sources are municipal, rainwater, borewell, tanker and greywater; use categories cover drinking/cooking, cleaning, gardening, toilets, commercial, industrial and other uses. Every record retains its user, method, reliability, timestamps and notes. Measured and estimated entries stay distinguishable. A supplied forecast is never inserted into this ledger.

Overlap checking and insertion occur in one writer transaction. PostgreSQL locks the property row; native SQLite uses `BEGIN IMMEDIATE`. A same-source supply interval cannot overlap itself. Consumption can contain distinct known-source slices for a use, but an unspecified-source total cannot overlap either slice. Reporting excludes intervals crossing the selected window boundary without inventing proration. Gaps are missing records, rather than zero actual consumption.

Supply/consumption totals alone do not close the physical balance: corresponding storage changes, transfers, leakage and overflow also matter. Historical consumption does not automatically change WaterTwin’s declared non-potable daily demand. Owners update that parameter explicitly.

## Maintenance and readiness

Recorded tasks cover roof/drain/filter/tank cleaning, pipe inspection, first flush and overflow inspection. Actual work dates require a timezone; next-due timestamps must follow the inspection. Conditions are reported good, needs attention or unknown. No universal cleaning interval is invented. “Recorded good” is the condition at the reported inspection time, not a current certification.

Three recent reliable nonoverlapping measurement windows below80% of configured collection efficiency trigger an inspection suggestion. This is a disclosed screening rule, not a trained ML model or confirmed fault. Alerts retain interval/observation references. Invalid/overlapping measurements and changed roof parameters are excluded. Drains, filters and measurement methods are possible causes to investigate.

Fresh WaterTwin runs provide forecast inflow, available tank capacity, possible overflow and preparation actions. Missing/stale predictions remain unavailable. The background refresh job retrieves forecasts and refreshes models with complete inputs; it never advances an actual observed tank level. API responses flag superseded inputs and stale retrievals while preserving immutable prediction history.

## Water quality and recharge

Owners can record actual pH, TDS in mg/L and turbidity in NTU, test provider/method/date, treatment status and notes. At least one real result is required. These parameters alone cannot certify drinking-water safety; intended use, microbiological/chemical testing and professional treatment assessment remain necessary.

Groundwater/soil evidence can come from property records or bounded operator-approved GeoJSON files configured through `GROUNDWATER_APPROVED_FILE` and `SOIL_APPROVED_FILE`. Each feature must have valid polygon coverage and `properties.provenance` containing source, source_url, dataset_date, resolution, coverage, verification_status and licence. Actual source information belongs in `properties.data`. Only polygons covering the property are returned. Files are limited to5MB/1000 features; missing/invalid provenance and outside-coverage conditions are explicit. This adapter supplies evidence; it does not certify local aquifer/infiltration suitability or create a recharge design.

## Community budget solver

Each option supplies a property, proposed tank capacity, actual quoted installed cost, quote provenance and installation-space confirmation. Investment comparison requires owner-recorded field-verified catchment and documented collection assumptions. Unverified properties and unsupported options are excluded with reasons. Missing historical providers are not substituted with synthetic rainfall.

All options use real daily history at each property’s coordinates and compare additional **water supplied** against the current tank under identical losses and daily demand. Daily first flush is approximated once per wet day; inflow occurs before daily demand, and initial storage is empty in all historical alternatives. Annualisation scales the chosen period and is not an annual forecast or guaranteed saving.

The bounded pilot uses an exact Pareto-frontier multiple-choice knapsack solver instead of adding OR-Tools solely for this small problem. It maximises incremental supplied litres under the budget, permits at most one replacement per property and prefers less cost on ties. Currency is quantised to paise. Automated tests compare it with exhaustive enumeration and cover cases where greedy benefit/cost selection fails. Up to20 quotations are supported, with a bounded frontier and clear422 recovery for excessive combinations.

Quoted costs and space confirmation are owner evidence. Structural approval, foundations/pipework, treatment, operating costs, shared-pipe networks and interbuilding hydraulics require separate assessment. The solver never chooses the largest tank automatically or represents a simulated benefit as actual water saved.
