# Executed verification

Date: 2026-11-02. Project: `C:/Users/gaura/projects/varshiq`. Native Windows; Node 24.14.1, npm 11.11.0, uv 0.12.13 and Python 3.13.15. Local SQLite test results and remote PostgreSQL/PostGIS acceptance are separate.

| Check | Executed result |
| --- | --- |
| Backend Ruff: `ruff check app tests alembic` | PASS |
| Backend: `pytest --cov=app --cov-report=term-missing` | 215 passed; 87% statement coverage; one upstream Starlette TestClient/httpx deprecation warning |
| Locked installed Python environment: `pip_audit --progress-spinner off` | No known vulnerabilities reported |
| Frontend `npm run lint` | PASS |
| Frontend `npm run build` | PASS; TypeScript project checks and Vite production compilation |
| Frontend `npm audit --audit-level=moderate` | 0 vulnerabilities reported |
| Runtime frontend licence collection | 56 packages inspected; no missing root licence files |
| Compose configuration with ephemeral check-only values | PASS; no real credential values were printed |
| Deployment smoke/PostGIS scripts | Python compilation PASS; real PostgreSQL/PostGIS and Compose CI checks subsequently PASS |
| Browser `npm run test:e2e` | 2 expanded tests passed against an isolated SQLite database and real Open-Meteo/Photon requests, including PDF bytes and a historical community-budget submission |

Backend tests cover provider validation/failure boundaries, geometry and coordinate transformations, timezone/tomorrow handling, dry gaps and event state, per-event diversion, losses, physical tank balance, storage optimisation, observation/calibration eligibility, permissions, provenance, migration upgrade/backfill/downgrade, UTC persistence and concurrent ledger submissions. Community selection is compared with exhaustive enumeration rather than implementation-mirroring assertions.

## Live data-provider evidence

The provider probe on this date retrieved distinct CSN/Mumbai/Pune coordinate forecasts with 168 hourly records and 7 daily records each; tomorrow was dynamically 2026-11-03. It retrieved 365 ERA5 daily records for CSN for 2025, 145 actual CSN OSM outlines, and Photon place matches for CSN/Pune. No probe created production properties or measurements. These results show access at retrieval time, not a future availability guarantee. Historical ERA5 is regional reanalysis, not rooftop measurements or official IMD observations.

## Browser and rendered evidence

Local artefacts are under ignored `artifacts/browser/`; Playwright failure traces/results use ignored `test-results/` and `playwright-report/`. Tests create clearly labelled synthetic properties only in a separate automated database.

Executed checks include account creation, API and UI property registration, catchment evidence, live rainfall/provider attribution, WaterTwin balance, superseded-input history, assessment generation, apartment supply/consumption persistence, maintenance/quality persistence, live Pune location/map/weather preview, missing groundwater, provider failure, municipal permission feedback and keyboard menu focus restoration/reduced motion. Property views were checked at 390x844, 768x1024 and 1440x900 for horizontal overflow and axe WCAG2/2.1 AA violations; tested scans reported none. Screenshots were visually inspected; this does not establish conformance of every untested interaction.

## Target acceptance

- Native local app/API and provider access: VERIFIED by tests/probes above.
- Docker engine on this Windows host: unavailable; WSL is not installed. No WSL or permission configuration was changed.
- PostgreSQL/PostGIS CI target: VERIFIED on Ubuntu by fresh migration, native geometry/SRID/geodesic-area check, downgrade to base and upgrade to head. This remains separate from a public hosted deployment.
- Compose CI target: VERIFIED. Backend/frontend images built, PostgreSQL/API/frontend services reached health, and the isolated smoke test passed for geometry registration, CSRF, cross-owner isolation and runoff. Local Windows Docker execution remains unavailable.
- GitHub Actions: VERIFIED at implementation commit `15956ed7710d6ec767633482c4b5bf0c24d67f44`. All four jobs passed: frontend, backend, postgis-migrations and containers. [Executed run](https://github.com/Gauravwakle96/VARSHIQ/actions/runs/41434116333). The first container check exposed an invalid fixture geometry-source enum; the fixture was corrected and the actual rerun passed.
- Public HTTPS deployment/backup restore: NOT PERFORMED; requires the selected hosting environment and target verification.
- Actual residential/commercial/community field pilot: NOT PERFORMED; requires owner authorisation and measurements.
- Restricted IMD/GOBS/groundwater datasets and optional paid AI/commercial provider plans: no operational access is claimed without corresponding inputs.
- Structural/recharge/quality certification and validated material defaults: not established. Site parameters/sources are mandatory; advice remains preliminary where field evidence is missing.

The software does not invent properties, rainfall observations, collected water, aquifers or trained models to fill these gaps. Statistical maintenance/calibration rules are labelled as screening/parameter estimation. Source notices and independently applicable dataset terms remain part of deployment obligations.

The local ECC UI evidence checker passed for `artifacts/browser/ui-evidence.json` after screenshots were inspected. A local staged-file review checked credential patterns and excluded databases, uploads, dependencies and build/test artefacts. These checks do not guarantee the absence of every possible vulnerability.

Implementation and verification documentation were pushed to the authorised repository. Public hosting, actual owner records and field engineering acceptance remain outstanding; neither local checks nor the isolated CI container are presented as that field deployment.

## Public animated demo addition — 2026-11-02

The `/#/demo` route has been implemented and tested locally. It selects actual OSM outlines and displays a schematic tank using explicitly simulated water inputs. The guided tour explains purpose, beneficiaries, storage/community choices and limitations. Public demo endpoints do not create private records, observations or sessions.

Executed checks for this addition:

- Full backend suite: **238 passed**, with one existing Starlette/httpx TestClient deprecation warning.
- Backend application/tests Ruff check: passed. An expanded `ruff check .` additionally found an existing import-order issue in the unchanged `probe_providers.py` helper; this is outside the application/test lint target.
- Frontend ESLint, TypeScript and production build: passed.
- Frontend and root `npm audit --audit-level=moderate`: zero reported vulnerabilities. `uvx pip-audit --path .venv/Lib/site-packages --progress-spinner off` audited the installed locked backend environment and reported no known vulnerabilities.
- Three demo Playwright tests: passed. They cover real OSM tiles/outlines, clicking a selected polygon, keyboard selection, exact tank/timeline agreement, scenarios, purpose/limitations, stable tank DOM, cancelled/superseded responses, location changes, private-endpoint separation, provider errors, retries, reduced motion and mobile/tablet layout.
- Two existing signed-in Playwright workflows: passed again, including real forecast retrieval, WaterTwin, PDF reporting, roof evidence, persistent water/maintenance/quality records and responsive accessibility.
- Live CSN lookup returned **145 actual building outlines**. No production property was registered. Internet access and current OSM coverage remain necessary for map retrieval.
- Demo screenshots at 390×844, 768×1024 and 1440×900 were visually inspected, including selected real geography. Automated axe WCAG2/2.1 AA scans at those widths reported no violations in the tested demo states. These checks do not establish complete accessibility conformance or visual regression agreement with an unprovided baseline.

Evidence is local and ignored under `artifacts/demo/`, `artifacts/browser/` and Playwright result folders. Synthetic provider/error fixtures are restricted to automated tests. Staged review checked 22 files for credential patterns and excluded generated/private data; no findings were reported. Public hosting and the actual authorised field pilot remain outstanding.

The four GitHub Actions jobs (frontend, backend, postgis-migrations and containers) passed on demo implementation commit `0b8da84f29f6877b712eaad07c6ff3dc3623a812`: [executed run](https://github.com/Gauravwakle96/VARSHIQ/actions/runs/41441376090). The subsequent account-creation handoff fix is included in browser verification: the demo's registration link opens the account form and users can switch back to Sign in. This link does not register a property or create an account automatically.

## Private planning assumptions — 2026-11-02

Existing property inputs can be explicitly marked as illustrative planning assumptions without creating roof-measurement records. Ownership and physical validation remain enforced. The private workspace, WaterTwin, sizing, recommendations and both general/tomorrow assistant answers disclose this input basis.

Executed checks for this change:

- Full backend suite: **246 passed**; one existing Starlette/httpx deprecation warning. Eight planning tests cover evidence separation, provenance, persistence, physical validation, cross-owner access, advice/sizing and assistant disclosure. An initial test expected 403 for cross-owner access; it was corrected to the existing 404 non-disclosure contract before the passing run.
- Backend Ruff application/tests/migrations check and Git whitespace check: passed.
- Frontend ESLint and production build with TypeScript checking: passed. Frontend npm audit reported zero vulnerabilities; the locked installed Python environment audit reported no known vulnerabilities.
- All five existing Playwright workflows passed again against an isolated automated-test database.
- An owner-authorised private property was configured with explicitly assumed model parameters. Its live forecast had 168 hourly/7 daily records, the saved WaterTwin conserved storage, and existing rooftop/water observation counts remained zero. Recommendations stayed preliminary; the deterministic assistant disclosed assumptions. Three tank candidates were compared using 365 actual ERA5 regional reanalysis daily records for 2025, clearly separate from site rainfall measurements.
- The planning notice was visually inspected with ECC Chrome DevTools at a 390×844 mobile viewport and a narrow desktop window; the settled mobile document width matched its viewport. Private account/location values and browser evidence remain outside Git.

This is planning functionality with real provider data, not a completed field trial or evidence of an installed harvesting system. Public hosting and field verification remain outstanding.

## All-feature simulation workspace — 2026-11-02

The anonymous feature workspace and private planning-preview switch cover all 27 existing navigation destinations. Each preview exposes purpose, beneficiary, assumptions and the field inputs its live workflow needs. No existing account, permission or private property configuration is changed by preview actions.

Executed checks:

- Backend application/tests/migrations Ruff: passed. Full backend suite: **264 passed**, with the existing Starlette/httpx deprecation warning. Eighteen new cases validate stateless previews/PDF exports, no external provider calls, supply/demand and annual storage balances, missing groundwater, calibration ineligibility, input bounds, private-payload rejection and shared rate limiting.
- Frontend ESLint, TypeScript/production build: passed. Frontend/root npm audits reported zero vulnerabilities; the locked Python environment audit reported no known vulnerabilities.
- Targeted feature browser suite: **2 passed**. It traverses all 27 destinations, exercises checklist/quality/assistant/budget controls and PDF download, tests mobile navigation, keyboard skip/reduced motion, failure/retry, and checks that private planning actions preserve original values, empty measurement/quality records and the owner role.
- New quality-preview layouts were visually inspected at 390×844 and 1440×900; axe WCAG2/2.1 AA checks passed at 390×844, 768×1024 and 1440×900. The short result entrance animation is allowed to settle before contrast scans. Explicit mobile-selector labelling fixed an initial test locator failure. Tested views had no horizontal document overflow; this does not establish conformance of every untested interaction.
- Complete seven-test browser regression run: **5 passed, 2 failed**. The three existing demo cases and two new feature cases passed. Two existing live-weather workflows failed at forecast attribution assertions because Open-Meteo was unavailable. A separate forecast probe returned **HTTP 503** with reason **“The service is overloaded”**. These live-weather checks are not reported as passed for this run; earlier successful provider evidence remains date-specific.
- Read-only checks of the existing private planning property confirmed its configured area/storage/sharing basis was preserved. Rooftop, rainfall/storage observations, water-quality, maintenance, supply and consumption evidence counts remained zero. Private values and browser artefacts remain outside source control.

The feature workspace stays usable when the live weather provider is unavailable because its scenario calculations have no external weather dependency. Actual forecast pages retain their existing unavailable/stale-data handling. Public deployment, the actual field pilot and professional roof/recharge/quality verification remain outstanding.

## Compact workspace and confirmed roof estimates — 2026-11-02

The owner workspace has six everyday navigation links and an expandable single-open advanced menu. The overview highlights rainfall, tank planning and actual recording; property forms keep detailed settings collapsed. Users can select real building outlines or draw on the map, confirm the outline, adjust the assumed connected fraction, or enter their own area. Saved-input water guidance uses deterministic backend results and works without a paid LLM. Google Maps opens only as a visual cross-check. Estimate confirmation never grants field verification.

Executed checks for this update:

- Full backend suite after the final planning-disclosure fix: **277 passed**, with one existing Starlette/httpx TestClient deprecation warning. New cases cover map-derived area/provenance, rejected confirmation/fraction/client-area requests, missing/conflicting inputs, preserved planning parameters, history/fingerprint changes, owner permissions and deterministic guidance disclosures.
- Backend application/tests/migrations Ruff, frontend ESLint, TypeScript and production build: passed. No new dependencies were introduced; root/frontend npm audits reported zero vulnerabilities. `python -m pip_audit --path .venv/Lib/site-packages --progress-spinner off` reported no known vulnerabilities in the installed locked Python environment.
- Full Playwright regression suite: **8 passed**. It covers real forecast retrieval, WaterTwin, reports, existing operational ledgers and public demos, plus map confirmation, connected fraction, manual correction, source preservation, inline guidance and compact navigation. That browser run preceded a final backend disclosure fix and a one-word demo copy correction; the relevant backend regression case and full backend suite passed afterward. The copy correction changed no interaction or layout structure.
- Tested home/roof/demo layouts passed axe scans at representative mobile/tablet/desktop widths. Home and roof screenshots were visually inspected. Mobile navigation keyboard/focus handling, hidden-field validation and reduced-motion preferences were exercised. These checks cover tested states rather than every possible accessibility interaction.
- Before migration `0004`, the actual local API listener was stopped and a SQLite-consistent backup was created in ignored local storage. After upgrading to head, all original property values and table counts matched the pre-upgrade snapshot; existing properties received empty map provenance. No real home outline was selected or confirmed automatically, and no fictional production property or actual observation was inserted.

Evidence stays under ignored `artifacts/features/`, `artifacts/roof/` and automated-test result folders. Databases, backups, uploads and credentials remain outside source control. Local checks do not establish hosted deployment, current PostGIS/container CI for this revision, an actual field pilot or professional engineering certification. Those requirements remain separate from the verified workspace update.

## Blue workspace, installation enquiries and automatic building map — 2026-11-02

The owner navigation now has six primary sections with contextual page tabs. The
workspace uses a blue palette and original local rainwater-harvesting illustrations.
Improvements includes external supplier contact/parts-store links and a visible
request draft; no message, payment, booking or private property data is sent
automatically. Recharge detail remains available in a clearly labelled disclosure.

The signed-in map loads real outlines automatically. Empty local coverage triggers
a bounded wider OSM neighbourhood lookup, with enabled Microsoft as an alternative.
The map fits those outlines without relocating the property pin. Location/property
changes cancel superseded requests; choosing a roof and drawing points retain their
selection. Source attribution, confirmation and field-verification boundaries remain.

Executed checks:

- Backend suite: **282 passed**, with the existing Starlette/httpx deprecation
  warning. New cases exercise bounded fallback, caching, source provenance,
  disabled providers, empty coverage/outages and the current Microsoft tile host.
  Ruff passed for application, tests and Alembic. An initial lint command used the
  nonexistent `migrations` path; it was corrected to the repository's `alembic` path.
- Frontend ESLint, TypeScript and production build passed. Root/frontend npm audits
  reported zero vulnerabilities; the installed locked Python environment's
  `pip_audit` check reported no known vulnerabilities. No dependencies were added.
- Full Playwright regression: **9 passed**. It covers existing live weather,
  WaterTwin, reporting, operational records and demos, plus automatic map loading,
  property switching, cancelled stale responses, selection retention, empty/error
  handling, manual drawing, navigation and supplier request privacy. The map-only
  check passed again after adjusting screenshot capture to start at the page top.
  An initial map test expected the old longitude after selecting a different
  outline; the assertion was corrected to the actual selected point.
- Map layouts passed axe WCAG2/2.1 AA scans at 390, 768 and 1440 px. Map and final
  installation-page screenshots were visually inspected. The earlier blue overview
  and maintenance layouts were also inspected. These checks cover tested states,
  not every possible accessibility interaction.
- A read-only provider probe found no OSM or Microsoft outlines at the saved pin's
  immediate locality. The wider OSM extract returned **71 real outlines**. The
  updated authenticated local map API returned the same 71 with its actual source
  and `neighbourhood` scope; the saved property pin was unchanged. Private location
  and account details remain outside Git. No house was claimed as the user's roof.
- The existing API restart was rejected by automatic approval (`blocked by policy`).
  A separate updated API/frontend was started at ports 8002/5175. Its health and
  authenticated map endpoint were checked; the original 8000 API was not restarted.

Local browser artefacts, private databases and logs stay ignored. No hosted public
deployment, installation partnership, completed purchase, new field measurement,
verified home outline or completed field pilot is claimed by this update.
