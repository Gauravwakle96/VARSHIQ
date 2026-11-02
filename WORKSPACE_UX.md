# Simple blue workspace

The workspace has six destinations: Overview, My property, Rainfall, My tank,
Records and Reports. Each page shows only the related tasks for that destination.
The sidebar has no nested More tools catalogue.

## Design contract

- My property groups details and the building map. Add-property, location search
  and field-measurement actions stay in the property workflow.
- Rainfall groups live forecasts and past rainfall. My tank groups WaterTwin,
  tank sizing and suggested improvements; the quick calculator is a contextual link.
- Records groups readings, water use and maintenance. Supply and prediction-history
  links are contextual record tools, rather than extra sidebar destinations.
- Reports includes a community summary when multiple properties or an authorised
  municipal role make it useful. Municipal/admin users keep an authorised community
  workspace and admin settings. Permissions remain enforced by the backend.
- Standalone groundwater, water quality, commercial dashboards and budget tools
  leave the everyday navigation. Existing routes and stored evidence remain intact
  for compatibility; they are not advertised as essential steps for a homeowner.
- The public feature demo uses the same six-part hierarchy. Its results appear
  before optional explanations. A single collapsed Adjust example row contains
  sample inputs; annual and budget settings appear only where relevant.
- Deep navy navigation, blue actions, white surfaces and a pale blue canvas use the
  existing licensed typography. Status/error colors retain their meaning. Details,
  focus rings, clear active states and responsive tabs support keyboard/mobile use.
- Saved estimates, real forecasts, map estimates and field measurements retain
  their disclosures. Demo edits are stateless and never become actual evidence.

Acceptance: six main owner links, no nested catalogue, contextual route highlighting,
closed example settings on entry, usable mobile navigation/tabs, tested focus and
contrast, and successful existing map/model/report flows. No new dependencies or
database migrations are needed for this update. Original harvesting
illustrations add quiet background context. Improvements includes installation
enquiries and an external parts store; see [supplier and artwork evidence](docs/INSTALLATION_AND_ARTWORK.md).

## Map estimate and roof guidance

The signed-in building map retrieves outlines automatically after opening, selecting
a location/property, entering coordinates, granting GPS permission or dragging the
map at building zoom (16+). Requests are debounced and cancelled when superseded.
Selecting an outline or drawing points does not trigger another lookup. A wider
neighbourhood search is identified explicitly and fits the view without changing the
original pin. The actual source remains attached to the selected outline, including
when automatic lookup falls back to an enabled Microsoft adapter. A zero-result
response is a coverage message, separate from a provider failure.

Users may select an OSM/Microsoft building outline, draw a boundary on the real map,
or enter a roof area themselves. The server calculates WGS84 geodesic polygon area,
subtracts holes and applies the explicitly assumed connected fraction. The user must
confirm that the outline belongs to their building before a map estimate is saved.

`roof_area_provenance` records the source, calculation method, assumed fraction,
confirming user, time and limitations. Confirmation is never field verification.
Existing planning assumptions for tanks, demand and collection remain marked as
assumptions even when the roof estimate is improved. Geometry/area corrections clear
outdated map provenance; measurement evidence stays in its historical records.

Google Maps opens as an external visual cross-check. No Google imagery is scraped,
no building area is obtained from a Google search pin, and no Google API key is needed.
OSM/Microsoft acquisition retains its existing source attribution and configuration.

Roof guidance retrieves authorised saved inputs and deterministic backend weather,
WaterTwin or recommendation results. It stays available without paid AI. Unsaved
changes disable guidance until saved so answers cannot silently refer to another area.
Forecast collection is potential inflow, not confirmed harvesting, annual savings or
drinking-water certification. Detailed engineering settings remain collapsed.
