# Setup and deployment

The supplied configuration supports reproducible local development and a PostgreSQL/PostGIS container pilot. A successful local build or a workflow definition does not establish production or field acceptance. Record executed target checks in `VERIFICATION.md`.

## Local development

1. Install Node.js 24+, Python 3.12+ and uv.
2. Copy `.env.example` to the ignored `.env` file. Keep API keys server-side.
3. In `backend/`, run `uv sync --frozen`, `uv run python -m alembic upgrade head`, then `uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`.
4. In `frontend/`, run `npm ci` and `npm run dev`. Open `http://localhost:5173`.

SQLite is a development fallback. PostgreSQL/PostGIS is required when `APP_ENV=production`. Run backend commands from its directory so the relative SQLite path remains stable.

## Native Windows PostgreSQL/PostGIS without WSL

Docker is not the only way to validate PostGIS. If WSL/virtualisation or the Docker engine is unavailable, use a native PostgreSQL service; do not weaken permission settings or enable unrelated Windows features to make tools run.

1. Obtain a supported Windows installer through the [official PostgreSQL download page](https://www.postgresql.org/download/windows/).
2. Install the matching PostGIS Windows bundle through the [official PostGIS installation instructions](https://postgis.net/documentation/getting_started/install_windows/). The PostgreSQL major version and architecture must match.
3. Open `psql` as an authorised database administrator. Create a dedicated application role/database, enter its password interactively and enable PostGIS:

```sql
CREATE ROLE varshiq LOGIN;
\password varshiq
CREATE DATABASE varshiq OWNER varshiq;
\connect varshiq
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

These commands create an empty database; they do not add property fixtures. Use an existing authorised database when appropriate and inspect it before changing schema. Restrict network access to the intended application host; keep local development PostgreSQL bound to localhost.

4. Set the actual server-side URL in the ignored `.env`, for example the structure `postgresql+psycopg://varshiq:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/varshiq`. Enter a real secret locally; `YOUR_URL_ENCODED_PASSWORD` is a placeholder. Keep `APP_ENV=development` for local HTTP and use appropriate local allowed origins.
5. Run the same backend migration/start commands from `backend/`. Validate `/api/v1/health`, `SELECT PostGIS_Version()` and the deployed property/geometry flow. Record actual results separately from the SQLite test suite.

Native PostgreSQL backup/restore uses `pg_dump`/`pg_restore` with private files and operator authorisation. Use interactive password prompting or an appropriately protected credential mechanism; avoid passwords on command lines or in source control. A successful installation alone does not establish migration, geometry or end-to-end acceptance.

## Container pilot

Requirements: a running Docker engine and Compose v2, network access to image/package registries and the configured providers.

Set these in the ignored root `.env`:

```dotenv
APP_ENV=development
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_URL_SAFE_SECRET
SERVER_SECRET=REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

The displayed replacement markers are not usable defaults. Generate actual secrets locally; do not paste them into chat, source control or screenshots. Choose a URL-safe database password because Compose builds a database URL from it.

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Open `http://localhost:8080`. The nginx frontend proxies `/api` to the backend. PostgreSQL is internal and not exposed to the host. Named volumes retain the database, approved regional cache and private re-encoded photos. Container startup applies Alembic migrations and then starts one API worker.

Check the target explicitly:

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/health
docker compose exec backend python -m alembic current
docker compose exec backend python -c "from sqlalchemy import text; from app.database import engine; connection=engine.connect(); print(connection.execute(text('SELECT PostGIS_Version()')).scalar()); connection.close()"
```

Validate registration, ownership permissions, live forecast, tomorrow's date, model balance, storage comparison and report download through the deployed URL. Inspect the source-status page. Do not populate the deployed database with automated-test fixtures.

## Production hosting

Use a TLS reverse proxy/load balancer and set:

- `APP_ENV=production`
- A PostgreSQL/PostGIS `DATABASE_URL`
- A random `SERVER_SECRET` with at least 32 characters
- `ALLOWED_ORIGINS` containing only the intended HTTPS website origins
- Durable database/photo/cache storage and restricted operator access
- An appropriate commercial Open-Meteo plan when the deployment is commercial

The backend rejects production SQLite, short secrets and HTTP allowed origins. Production cookies use Secure and SameSite Strict. The nginx policy uses self-hosted scripts/fonts and permits required runtime style attributes for Leaflet/Recharts/motion. Put the application behind HTTPS and configure HSTS at the TLS proxy after validating the intended host; the sample port mapping itself does not provide TLS.

The initial scheduler and rate limits are process-local. Keep one API worker/replica until a shared rate-limit store, separate job scheduling, forecast refresh locking and provider-call budget are implemented. Treat provider free quotas as real operating constraints, not a scalability guarantee. Configure trusted proxy handling deliberately; do not trust arbitrary forwarded headers.

Validate database migrations against the exact deployed schema/version before rollout. Back up before migration. Use a reviewed image/tag digest and vulnerability checks before a production release. Public deployment/publication requires the user's applicable authorisation; local configuration does not automatically deploy a cloud service.

## Optional provider configuration

| Setting | Meaning |
| --- | --- |
| `PILOT_LOCALITY`, latitude/longitude/timezone | Default pilot configuration; each property has its own coordinates/timezone |
| `FORECAST_CACHE_MINUTES`, `REFRESH_INTERVAL_SECONDS` | Cache freshness and automatic forecast refresh cadence |
| `OPEN_METEO_COMMERCIAL`, `OPEN_METEO_API_KEY` | Commercial endpoint/credential when applicable |
| `OSM_ENABLED`, `OVERPASS_URL` | Real building lookup; manual geometry remains available |
| `MICROSOFT_ENABLED`, index URL/download bound | Enable bounded tile extraction after CDLA review |
| `IMD_ENABLED`, `IMD_REQUEST_HEADERS` | Optional separate official products with authorised headers; do not invent authentication semantics |
| `IMD_APPROVED_DATA_DIR`, `IMD_DATA_TERMS_ACCEPTED` | Approved local historical files, distinct dataset rights |
| `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL` | Optional server-side grounded assistant; no key/model is assumed |
| `GROUNDWATER_APPROVED_FILE`, `SOIL_APPROVED_FILE` | Approved source information; not automatic aquifer certification |

Install local IMD processing dependencies only when needed:

```powershell
Set-Location backend
uv sync --frozen --extra historical
```

IMDLIB yearwise rain files are expected under `<approved_directory>/rain/<year>.grd`. The adapter reads local files and extracts regional data; it does not fetch the nationwide archive. Container use additionally needs a read-only mount for approved inputs and a rebuild/install including the optional dependency group. Do not bake restricted datasets into public images.

Some configuration names reserve future capability. GOBS, SWMM, Earth Engine, solar and cool-roof functionality remains unavailable until implemented and separately validated. An `ERROR_MONITORING_DSN` placeholder alone is not a completed error-monitoring integration; the current backend uses redacted application logs.

## Backup and restore

Store encrypted backups outside the git checkout and test restoration regularly. Include private photo volumes and essential provenance/configuration; provider caches can be regenerated where terms permit.

The following commands avoid shell binary-redirection differences on Windows. Replace `PRIVATE_BACKUP_PATH` with an approved private path outside the repository:

```powershell
docker compose exec -T db pg_dump --username=varshiq --format=custom --file=/tmp/varshiq-backup.dump varshiq
docker compose cp db:/tmp/varshiq-backup.dump PRIVATE_BACKUP_PATH
```

Restore into a **new validation database** first, preserving the live database:

```powershell
docker compose cp PRIVATE_BACKUP_PATH db:/tmp/varshiq-restore.dump
docker compose exec -T db createdb --username=varshiq varshiq_restore_check
docker compose exec -T db pg_restore --username=varshiq --dbname=varshiq_restore_check --no-owner /tmp/varshiq-restore.dump
```

Verify records, permissions and provenance before an approved production recovery. Do not run volume deletion, database replacement or destructive rollback casually. `docker compose down` stops services; adding `--volumes` removes stored data and is a separate destructive action.

## Validation and updates

Run frontend type/lint/build/audit and backend Ruff/tests/locked-environment audit before release. `.github/workflows/ci.yml` defines those checks plus a real PostGIS migration round trip. Dependabot proposes dependency updates; review changes and rerun checks rather than applying force upgrades blindly.

After frontend dependency changes, regenerate distributed notices:

```powershell
.\deploy\collect-frontend-notices.ps1
```

The Docker frontend includes notices/licence documents with compiled assets. A passing static Compose configuration check is not a container build, health check or target acceptance.

## Field pilot and hackathon evidence

Recruit two houses, two commercial properties and one apartment/community context with owner authorisation. Record connected catchment evidence, tank capacity/current volume, intended-use demand and parameter sources. Use actual forecasts and measurements; if no rain occurred, report that limitation rather than inventing calibration data. Demonstrate the property → forecast → event → tank → comparison → report flow and show missing-data/confidence explanations. Recharge/structural/potable-water recommendations require qualified engineering assessment.

Geocoding, supply/consumption records, maintenance/readiness, water quality and community budget workflows are implemented. Their executed tests and remaining target/field limitations are recorded in [VERIFICATION.md](VERIFICATION.md). GOBS and HydroHarvest remain permission-dependent references and do not supply data rights or scientific validation.

## Statewide geocoding and operations configuration

The default pilot is Chhatrapati Sambhajinagar. `GEOCODING_PROVIDER=photon` uses explicit-submit OSM-based lookup with persistent cache and1.1-second appwide throttling for the single worker. Change `GEOCODING_BASE_URL` to an approved compatible private service for growth. Public Nominatim additionally requires an informed operator policy decision and `GEOCODING_NOMINATIM_POLICY_ACCEPTED=true`; see [LOCATION_DATA.md](docs/LOCATION_DATA.md).

`RAIN_EVENT_DRY_GAP_HOURS=6` exposes the modelled event-separation assumption, configurable as an integer from 1 to 168. Background forecast refresh also creates new WaterTwin snapshots for properties with complete inputs. Actual storage is never automatically advanced by a forecast. Source/consumption/maintenance/quality data use immutable, private owner records. Quoted community budget scenarios require owner-recorded field-verified catchment.
