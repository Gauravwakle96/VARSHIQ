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
