# VARSHIQ

**Predict the Rain. Harvest Every Drop.**

VARSHIQ connects registered building geometry and rooftop measurements to real rainfall providers, deterministic harvesting calculations and a property-specific WaterTwin tank model. The default locality is Chhatrapati Sambhajinagar, Maharashtra; live place search supports arbitrary Indian localities and coordinate-specific weather. Country, state, district, city/village, locality, postcode and reporting timezone remain configurable.

The application starts with **zero properties and zero measurements**. The intended real pilot includes two residential properties, two commercial properties and one apartment/community context; it requires owner-authorised registrations and measurements. Forecast results, regional historical reanalysis, geospatial estimates, owner-entered information and owner-recorded field evidence are identified separately.

**Explore Demo** beside Sign in opens `/#/demo` without an account. Visitors can select actual OpenStreetMap building outlines and explore a clearly labelled animated water scenario, storage choices and fictional community budgets. The guided tour explains who benefits, why the idea matters and its limitations. Demo rainfall, catchments, tanks, demand and costs are illustrative; no demo results or mapped outlines become private property or measurement records. See [docs/DEMO_MODE.md](docs/DEMO_MODE.md).

## Core workflows

- Private account registration and cookie-based authentication, CSRF protection and organisation-scoped records.
- Residential/commercial/apartment/community property registration, map selection, manual polygons, provider lookup, geodesic footprint area and connected-catchment verification evidence.
- Live Open-Meteo hourly/daily forecasts, dynamically calculated tomorrow, immutable forecast snapshots and source/status information.
- Historical ERA5 regional reanalysis through Open-Meteo Archive, with complete-day validation and seasonal/monthly/annual summaries. Approved local IMD gridded files are an optional separate source.
- Event runoff, per-event first flush, collection losses, tank storage, supplied/unmet demand and explicit overflow.
- WaterTwin and labelled scenarios, historical tank-capacity comparisons, preliminary recommendations, real observation entry and calibration eligibility/history.
- Authorised locality analytics, opt-in municipal aggregates and downloadable property assessments.
- A deterministic water assistant with optional server-side Vercel AI Gateway integration. Backend services perform all physical calculations.

The source-status page identifies unavailable/deferred providers and modules. SWMM, Earth Engine/geemap, solar/pvlib and cool-roof features are future extensions, not completed modules.

- Licensed official Maharashtra district directory, explicit-submit Photon/OSM address/locality search, GPS/manual coordinates and location-specific weather previews.
- Actual supply and consumption interval ledgers, maintenance/readiness checklists and water-quality test history.
- Exact budget-constrained selection of quoted storage upgrades using historical incremental water supplied. One upgrade per property; no synthetic budget-training model.

## Run locally

Requirements: Node.js 24+, Python 3.12+, [uv](https://docs.astral.sh/uv/) and npm. Docker is optional for the SQLite development path and required for the supplied PostgreSQL/PostGIS Compose setup.

From the project root:

```powershell
Copy-Item .env.example .env
Set-Location backend
uv sync --frozen
uv run python -m alembic upgrade head
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the API on `127.0.0.1:8000`; cookies and CSRF remain same-origin from the browser's perspective. OpenAPI is available at `http://127.0.0.1:8000/docs`.

The default `DATABASE_URL=sqlite:///./data/varshiq.db` is **local development only**. It does not establish PostgreSQL/PostGIS deployment acceptance. Run backend commands from `backend/` so the relative development data path is stable. Keep `.env`, local databases, photos and approved datasets private; these paths are ignored by git.

## Run PostgreSQL/PostGIS with Docker

Follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md). Set a strong URL-safe `POSTGRES_PASSWORD`, a random `SERVER_SECRET` of at least 32 characters, and appropriate `ALLOWED_ORIGINS` in the ignored `.env` file. The Compose file publishes the website on port 8080 and keeps PostgreSQL internal.

```powershell
docker compose config --quiet
docker compose up --build -d
```

Open `http://localhost:8080`. Public production hosting additionally requires HTTPS, `APP_ENV=production`, HTTPS allowed origins, durable storage, backups and target-environment validation.

## Verification commands

```powershell
# Frontend
Set-Location frontend
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=moderate

# Backend
Set-Location ../backend
uv run --frozen python -m ruff check app tests
uv run --frozen python -m pytest --cov=app --cov-report=term-missing
uv run --frozen python -m pip_audit --local --strict

# Optional live provider check; no properties are registered
uv run --frozen python probe_providers.py
```

See [VERIFICATION.md](VERIFICATION.md) for executed checks and current limitations. Browser tests run with `npm ci` and `npm run test:e2e` from the project root, in a separate database labelled as automated testing. Workflow definitions are validation instructions, not proof that GitHub Actions or deployment ran.

## Architecture

```text
frontend/              React + TypeScript + Vite feature pages
backend/app/api.py     Versioned property/weather/modelling APIs
backend/app/analytics.py Observations, calibration, locality, assistant, reports
backend/app/services/ Geometry, data adapters, hydrology and WaterTwin
backend/app/models.py Relational records, provenance and PostGIS footprint geometry
backend/alembic/       Database migrations
backend/tests/         Clearly labelled synthetic automated fixtures
deploy/               Container entrypoint and nginx reverse proxy
.github/workflows/    Frontend, backend and PostGIS migration checks
```

The backend is a modular application. The initial deployment uses one API worker because the refresh scheduler and rate-limit counters are process-local. Larger deployments need a shared rate-limit store, separate background jobs and provider-call budgeting before increasing workers or replicas.

## Scientific and field limitations

Runoff coefficients require an explicit site input and source/assumption; roof material alone does not establish a universal coefficient. First-flush depth is treated as rainfall-equivalent diversion, converted to runoff litres by area × depth × coefficient. Collection efficiency applies once after diversion. Hourly storage captures rain, accounts for overflow and then supplies demand; this is a documented conservative timing convention.

Daily historical sizing uses a documented wet-day first-flush approximation because daily totals cannot resolve intraday storms. Capacity recommendations expose their selection heuristic and supplied cost assumptions. They are not certified structural designs or installation quotations.

Satellite/building outlines do not verify connected catchment or groundwater suitability. Owner-recorded `field_verified` status requires supplied method/evidence and is not independent engineering certification. Recharge, potable-water use and structural decisions require qualified field assessment and applicable standards.

A completed real-property/community field trial and independently validated engineering parameter defaults are not established by software implementation. No rainfall, collection or tank measurement is fabricated when missing.

Location-provider policy and directory provenance are documented in [docs/LOCATION_DATA.md](docs/LOCATION_DATA.md); daily operations and community assumptions are in [docs/WATER_OPERATIONS.md](docs/WATER_OPERATIONS.md).

## Documentation and attribution

- [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- [DATA_PROVENANCE.md](DATA_PROVENANCE.md)
- [DATASET_LICENCES.md](DATASET_LICENCES.md)
- [OPEN_SOURCE_INTEGRATIONS.md](OPEN_SOURCE_INTEGRATIONS.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

Weather data by [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Hourly timestamps are normalised to interval starts. OpenStreetMap mapping data © contributors, ODbL 1.0. Additional dataset licences and restrictions remain source-specific.
