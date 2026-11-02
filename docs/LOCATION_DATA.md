# Locations and provider conditions

VARSHIQ supports explicit locality/address/place/PIN searches through configured real geocoding providers, map selection, manual coordinates and browser GPS permission. Searches are not restricted to the district directory. A geocoded location is not a registered property or a field measurement.

The default is Chhatrapati Sambhajinagar. Changing the selected place changes map lookup and weather/history previews; selecting a registered property restores its own coordinates. Every property retains country, state, district, city/village, locality, postcode, IANA timezone and available administrative identifiers. Unavailable address fields remain blank. Reverse lookup retains the entered coordinates and labels the nearest indexed address as an estimate.

## Official Maharashtra directory

`backend/app/data/maharashtra-districts.json` contains36 entries imported from the [Government of Maharashtra district directory](https://maharashtra.gov.in/Site/1529/Districts) on2026-11-02. The source hash, original labels, canonical names, divisions, official websites, date and policy URL are included. No photographs, boundaries, assumed coordinates, village enumeration or property records were imported.

The [portal Copyright Policy](https://maharashtra.gov.in/Site/1383/Disclaimer-and-Policies) permits accurate, nonmisleading reproduction with prominent source acknowledgement; third-party content is excluded. This is the named portal policy, not GODL or CC BY. The original spaced label “Chhatrapati Sambhaji Nagar” is retained alongside “Chhatrapati Sambhajinagar”. Aurangabad, Ahmednagar and Osmanabad remain historical search aliases for the current districts Chhatrapati Sambhajinagar, Ahilyanagar and Dharashiv.

Run `python scripts/import-maharashtra-districts.py` to refresh the bounded extract. The importer fails on count/uniqueness/renamed-district changes so an operator can review them. Directory IDs beginning `IN-MH-` are application IDs; they are not asserted to be official LGD/boundary identifiers. Other states can be searched live; their official district directories have not been imported.

## Photon default

The [Photon project](https://github.com/komoot/photon) permits reasonable use of its public demo API without an availability guarantee. VARSHIQ sends explicit user-submitted place searches, caches responses for seven days and serialises outbound geocoding to at most one request every1.1 seconds for the single API process. It requests at most20 matches and validates coordinates/country/state. OSM database attribution is displayed next to results; ODbL conditions remain separate from Photon’s Apache2 software licence. No Photon source was copied.

Configure `GEOCODING_PROVIDER=photon` and optionally `GEOCODING_BASE_URL` for a self-hosted Photon-compatible endpoint. Set an identifying `GEOCODING_USER_AGENT`. Public service access is appropriate only for moderate pilot traffic; commercial scale needs a suitable service/private deployment and shared request budgeting.

## Optional Nominatim

Read the [public Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) before selecting it. It requires a deliberate informed developer decision, identifying User-Agent, visible attribution, caching and at most one request per second across the application. Autocomplete, systematic location/postcode enumeration, grid reverse queries and confidential/personal input submission are forbidden. LLM-generated code must comply; generic no-code/vibe-coding geocoder integrations are restricted.

Public Nominatim is disabled unless the responsible operator deliberately sets `GEOCODING_NOMINATIM_POLICY_ACCEPTED=true`. A self-hosted Nominatim-compatible base URL does not inherit the public-server usage policy; its own conditions still apply. `q` is never mixed with structured address fields. Search/reverse details follow the official [Search](https://nominatim.org/release-docs/latest/api/Search/) and [Reverse](https://nominatim.org/release-docs/latest/api/Reverse/) references.

The pilot uses one API worker/replica, including one geocoding proxy. Do not multiply workers against a public service: move throttling to a shared dedicated proxy/store first. No bulk geocoding or background place enumeration runs. Provider failures leave explicit errors and manual/GPS/map registration available.

Weather uses each actual coordinate and property timezone. India uses Asia/Kolkata; outside India the geocoder’s UTC placeholder must be checked by the registrant. Neither the directory nor a place search establishes exact rooftop rainfall, usable roof area or groundwater suitability.
