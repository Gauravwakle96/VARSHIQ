# Free hackathon hosting: Vercel and Supabase

VARSHIQ can run on Vercel Hobby with a Supabase Free PostgreSQL/PostGIS database
and a private Supabase Storage bucket. This is a noncommercial hackathon pilot,
subject to each provider's free quotas. It does not require a paid LLM.

The repository root is the Vercel project root. The Vite preset builds the
frontend, while `api/index.py` exports the existing FastAPI application as a Python
function with the locked root requirements. The build copies only compiled assets
and notices to `public/` for the CDN. `/api/*` routes to the Python function.
The root URL serves `index.html`; hash-based page navigation
and `/api/v1` use the same HTTPS origin. `vercel.json` keeps the map-compatible CSP.
Local databases, uploads, credentials, CLI state and test artefacts are excluded.

## Required server configuration

| Environment variable | Value or purpose |
| --- | --- |
| `APP_ENV` | `production` |
| `RUNTIME_MODE` | `serverless` |
| `DATABASE_URL` | SQLAlchemy `postgresql+psycopg://` URL through the Supabase transaction pooler, port 6543, `sslmode=require` |
| `SERVER_SECRET` | Cryptographically random value, at least 32 characters |
| `ALLOWED_ORIGINS` | Exact HTTPS production origin; no wildcard |
| `PHOTO_STORAGE` | `supabase` |
| `SUPABASE_URL` | The selected project's HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service-role key, never a Vite/public variable |
| `SUPABASE_STORAGE_BUCKET` | `varshiq-private-photos` |
| `UPLOAD_MAX_BYTES` | `4000000`, below Vercel's 4.5 MB request limit |

Set production credentials only on the production environment. Untrusted preview
code must not receive the production database or storage credentials. Use a separate
project/database for development previews with persistent data.

Database connections use `NullPool` and disable psycopg prepared statements, as
required by the shared Supabase transaction pooler. Use a separate migration/admin
connection for schema changes. Apply Alembic through revision `0005` before startup.
Do not run migrations on every function invocation or deployment build.

For a new database, create a dedicated `varshiq_runtime` login with access only to
VARSHIQ tables. Enable RLS on those tables, revoke access from Supabase `anon` and
`authenticated` roles, and give the runtime role its explicit backend policy. The
FastAPI owner/organisation checks still protect every private API. The browser does
not query Supabase's Data API directly. Reapply table access policy when migrations
add tables. `deploy/harden-supabase.py` can restrict existing VARSHIQ tables and
configure the photo bucket when run with the migration owner's credentials; it
does not grant runtime-role permissions automatically.

The bucket must be private, accept JPEG only, and cap objects at 4 MB. Photos are
validated and re-encoded by the API before upload. Downloads pass through the same
owner checks; no public or long-lived signed photo URL is returned.

## Serverless behaviour

- Forecasts and WaterTwin update on request using existing cached provider data.
  The persistent-process refresh loop is disabled; continuous background refresh
  is not claimed on this free deployment.
- Historical rainfall cache and request limits use PostgreSQL, so neither depends
  on Vercel's read-only filesystem or survives only in one function's memory.
- A salted IP digest and request category enforce shared fixed 60-second limits.
  Raw IP addresses are not stored in that table. Only Vercel's ingress-supplied
  forwarded-IP header is used on Vercel; local servers do not trust that header.
- Provider failures, absent map coverage and unconfigured optional services remain
  explicit. No nationwide dataset or synthetic production properties are uploaded.

## Deployment and verification

1. Sign in to the existing Vercel/Supabase projects. Keep both plans free.
2. Inspect the target schema, back up existing data when present, apply migrations,
   restrict table permissions and verify the private bucket.
3. Configure encrypted server environment variables and select the repository root
   with the Vite preset and the settings in `vercel.json`. Keep the API region near the existing database.
4. Run lint, backend tests, frontend build and the project browser checks. Regenerate
   `requirements.txt` after lock changes with `uv export --project backend --frozen
   --no-dev --no-emit-project --no-hashes --output-file requirements.txt`.
5. Deploy with `vercel deploy --prod --skip-domain`. Check HTML/assets, API health,
   anonymous demo calculations, actual building retrieval and private API denial.
6. Promote the checked deployment to the production domain and recheck HTTPS,
   secure cookies, CSP and the actual live browser experience.

Run `node deploy/check-public.mjs https://varshiq.vercel.app` after installing the
root npm dependencies and Playwright browser. It checks the public demo, actual
OSM lookup, tank/display agreement, a labelled demo PDF and responsive accessibility
without creating accounts or property records. Windows uses installed Edge;
Linux uses Playwright Chromium. Evidence stays in ignored `artifacts/deploy/`.

Keep `/public` anchored in `.vercelignore`: excluding every directory named
`public` also removes the frontend's source illustrations and icon. `public/`
is generated at build time and selected explicitly as Vercel's output directory.

Local property records and accounts are not copied merely by deploying code. Move
existing private records only through an explicit, verified data migration.

Free Supabase projects can pause after a week of inactivity; resume the project
and check the live site before a demonstration. Database storage is 500 MB and file
storage is 1 GB on the documented Free plan. Export private backups securely; the
free plan does not include the paid daily-backup/PITR service. Cold starts, quotas
and provider outages can affect demonstrations. No paid resources are required by
the supplied configuration, and no paid plan is enabled automatically.

Primary documentation checked during this deployment:

- [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Open-Meteo date-range parameters](https://open-meteo.com/en/docs)
- [Function limits](https://vercel.com/docs/functions/limitations)
- [Ingress request headers](https://vercel.com/docs/headers/request-headers)
- [Supabase Postgres connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase pricing and free limits](https://supabase.com/pricing)
