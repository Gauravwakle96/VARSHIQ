# VARSHIQ frontend

React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts and Leaflet. Fontsource supplies locally bundled DM Sans and Manrope; retain their bundled licence notices.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
```

Run the FastAPI backend on `127.0.0.1:8000`. Development requests to `/api` are proxied by Vite. Set `VARSHIQ_API_TARGET` before starting Vite to use another local backend, including the isolated Playwright test backend. Production serves the built `dist` directory behind the same-origin backend reverse proxy described in the main deployment guide.

The default route opens the authenticated operations workspace. `/#/landing` provides the public introduction. The application uses cookie credentials and CSRF tokens; credentials are never saved in local storage. Accounts begin with no registered properties. Every chart is populated from an API result; unavailable and stale data are labelled.

Feature pages are split by responsibility:

- `pages/Property.tsx`: registration, updates, catchment measurement evidence and private photos.
- `pages/Map.tsx`: live OSM base map, provider footprints, coordinates, manual polygon drawing and geometry correction.
- `pages/Weather.tsx`: real forecast, dynamic tomorrow, exact hourly values and separately labelled historical rainfall.
- `pages/Models.tsx`: deterministic event calculation, WaterTwin, explicitly separate what-if scenarios and historical storage comparisons.
- `pages/Insights.tsx`: explainable recommendations, observations, calibration evidence, grounded assistant, reports, provider status and restricted administration.
- `pages/Dashboard.tsx`: genuine property and locality aggregates, commercial filtering and municipal access.
- `pages/Location.tsx`: sourced district/locality search, reverse lookup, browser GPS and explicitly labelled manual-coordinate fallback. Selected geographic context drives map lookup and the next registration; it does not register a property by itself.
- `pages/Operations.tsx`: actual water-source and consumption ledgers, maintenance/readiness evidence, measured water-quality records, groundwater/soil availability and community budget comparison using user-provided quotations and historical simulations.

Operational routes include `/#/locations`, `/#/water-sources`, `/#/consumption`, `/#/maintenance`, `/#/quality`, `/#/groundwater` and `/#/community-budget`. Supply and consumption records retain past measurement intervals and reliability. Water-quality parameters never establish a drinking-water certification. Budget benefits are explicitly labelled simulation estimates relative to current tanks, and installation-space evidence is required for candidate quotations.

Weather displays link to Open-Meteo and its CC BY 4.0 data licence where that provider is used. OSM base tiles show contributor attribution. Map selection does not establish a verified roof. A field-verification label represents a registrant's recorded measurement and evidence; the application does not claim an independent engineering certification.

Responsive targets: 390×844, 768×1024, 1440×900. Keyboard focus, labelled form fields, live feedback, table alternatives to charts and reduced-motion settings are supported. Actual browser results and any remaining limitations are recorded in the repository-level verification report.

No v0-generated design is claimed: no connected v0 integration or shared design output was available during implementation. Shared output can be integrated without replacing the backend data flows.
