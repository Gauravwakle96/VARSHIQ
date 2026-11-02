# Open-source integration audit

Audit date: 2026-11-02. README, actual licence, selected source/dependency metadata and accompanying dataset/model information were inspected at the revisions below. No external application was cloned into VARSHIQ and no reviewed assessment/recharge model source was copied. The core geometry, water balance, storage and recommendation services are independently implemented.

Dependency licences apply to installed packages; repository code licences do not automatically license their datasets, models, satellite imagery or hosted APIs. Short revisions identify the audited commits, not a promise about future repository versions.

| Repository / revision | Verified evidence and licence | VARSHIQ decision |
| --- | --- | --- |
| [AquaLytics](https://github.com/prakrati3331/AquaLytics-Real-Time-Rainwater-Harvesting-Artificial-Recharge-Intelligence-Platform/tree/7bdcffff) `7bdcffff` | Root has no LICENSE. README, `rwh.py`, aquifer interface, requirements and datasets inspected. Missing groundwater is replaced with `10`; coefficient/feasibility validation and pickle-model training provenance were not established. | Research reference only. No code, aquifer model or dataset adopted pending licence and engineering evidence. |
| [JalRakshak](https://github.com/bhavyakotai/JalRakshak/tree/e3bceb3c) `e3bceb3c` | Actual MIT licence, copyright 2025 Anirban Sarkar. Backend simulation/task modules and training pipeline inspected. Humidity-adjusted runoff, 50,000 L groundwater default, ₹8.5/L cost default and synthetic budget training are not accepted site evidence. | Workflow research only; independently implemented calculations. No synthetic trained model/default groundwater adopted. |
| [Aquabytes upstream](https://github.com/Byte-Builders-28/Aquabytes/tree/2ebad726) `2ebad726` | Same MIT licence/copyright; matching assessment algorithms and upstream structure inspected. | Provenance reference; avoid duplicate fork/upstream integration. No code adopted. |
| [IMDLIB](https://github.com/iamsaswata/imdlib/tree/f6af089a) `f6af089a` | MIT, copyright `[2019-2020] [Saswata Nandi]`. README, LICENSE, core/loader source and package metadata inspected. | Optional package for approved local IMD binary files through `open_data(...).get_xarray()`. MIT notice retained. Dataset terms checked separately; no nationwide automatic downloader in adapter. |
| [India Rainfall Gridded](https://github.com/skthewimp/india-rainfall-gridded/tree/593dba78) `593dba78` | MIT code, copyright 2026 Karthik Shashidhar. README expressly excludes underlying data from MIT. NetCDF/Parquet and city-grid mapping scripts inspected. | Processing methodology reference; regional extracts and optional Parquet output independently implemented. No prebuilt datasets/charts copied. |
| [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints/tree/c691ea1a) `c691ea1a` | Actual LICENSE assigns data to CDLA Permissive 2.0; README/streaming example inspected. The one-line data licence does not independently establish code-copy rights. | Independently implemented bounded L9 quadkey/GZIP GeoJSONL extraction. Height/confidence `-1` become missing; footprint estimate never becomes verified roof area. Include CDLA text with shared polygon data. |
| [EPA SWMM](https://github.com/USEPA/Stormwater-Management-Model/tree/07c371f8) `07c371f8` | README states C solver is public domain; selected solver source inspected. External components may have separate licences. | Evaluated, deferred to engineered neighbourhood drainage modelling. No solver packaged for this property pilot; no EPA endorsement claimed. |
| [PySWMM](https://github.com/pyswmm/pyswmm/tree/97cb36ff) `97cb36ff` | BSD-2-Clause, copyright 2014–2025 Bryant E. McDonnell. Interface/metadata inspected; audited version 2.2.0 depends on swmm-toolkit. SWMM execution is not reentrant. | Deferred; isolate concurrent model jobs and verify dependent licences if adopted. |
| [swmmio](https://github.com/pyswmm/swmmio/tree/8471067c) `8471067c` | MIT, copyright 2018–2023 Adam Erispaha/developers. Core/metadata inspected. Metadata requires `pyswmm>=1.2,<2.0`, conflicting with audited latest PySWMM 2.2.0. | Deferred INP/RPT editing. Resolve compatible versions before adoption. |
| [geemap](https://github.com/gee-community/geemap/tree/e5a0cbea) `e5a0cbea` | MIT, copyright 2020–2024 Qiusheng Wu. Source/dependencies inspected; substantial notebook/geospatial footprint. | Deferred satellite module. Earth Engine access and each dataset require separate approval/terms. |
| [pvlib](https://github.com/pvlib/pvlib-python/tree/0f6631ac) `0f6631ac` | BSD-3-Clause with contributor/development-team/Sandia notices. ModelChain and dependency metadata inspected. | Future solar module, not installed for rainwater functionality. |
| [Rain2Flood](https://github.com/rahulpandey696/Rain2Flood/tree/b055b2be) `b055b2be` | GPL v3 licence text; README says GPL v3 or later. QGIS processing provider/metadata inspected; release ZIP was not unpacked or executed. | Methodology research only. No GPL source copied under VARSHIQ's current licensing strategy. |

## Installed functional dependencies

React/React DOM, Vite, TypeScript, Tailwind, React Router, Framer Motion, Recharts, Leaflet and Lucide provide the UI/tooling. Fontsource packages locally serve licensed DM Sans and Manrope fonts. FastAPI/Pydantic, SQLAlchemy/Alembic/Psycopg/GeoAlchemy2, Shapely/PyProj, HTTPX, Argon2, Pillow and ReportLab provide API validation, persistence, geometry, networking, authentication, safe photo handling and PDF output. Exact installed versions are recorded in `frontend/package-lock.json` and `backend/uv.lock`.

Keep package licence files with distributions. Dependency/security scans apply to the locked environment; repository review is not a vulnerability guarantee.

## Engineering validation boundary

Primary Open-Meteo, IMD and CDLA contracts were inspected. Exact roof-material coefficient ranges/first-flush defaults were not established from primary CGWB/CPHEEO text during the audit: the CGWB PDF's text was unavailable through the browser and CPHEEO access timed out. Therefore site-supplied parameters/sources remain mandatory and recharge/structural advice remains preliminary.

## Supporting development tools

ECC guidance and project browser tooling support engineering review. A user-authorised Antigravity CLI read-only scientific review was run using the [Antigravity Delegate skill](https://github.com/amElnagdy/delegate-skills); no model/provider/permission settings were changed. The user requested v0 for UI/UX, but no authenticated v0 generation result was available. `docs/V0_DESIGN_PROMPT.md` contains the prepared brief; current frontend code is not represented as v0-generated.

## Additional location and reference audit

HydroHarvest (`https://github.com/Sarguru-tech/hydro-harvest`, commit `cd77ebdd87735faf856eff6ba1e0448a88470ebc`) has no LICENSE/LICENCE file. README explicitly reserves a formal OSS licence for future distribution; Java17/Spring Boot3.2.3 and React18/Vite dependencies were inspected. Architectural reference only; no source/UI/datasets copied.

Photon is accessed through its documented HTTP API; its reasonable-use demo conditions and Apache2 source licence were inspected. No Photon source is bundled. Returned OSM location data remains ODbL. The Maharashtra official36-district directory is a bounded attributed import under its portal Copyright Policy, verified2026-11-02. See [LOCATION_DATA.md](docs/LOCATION_DATA.md).
