# Everyday property workspace

The owner workspace answers three immediate questions: will it rain, will the tank fill,
and what actually happened? Its overview uses the selected property's saved inputs;
it does not fetch or invent a forecast to populate the screen.

- Six everyday navigation links remain visible. All 27 destinations remain reachable
  through one **More tools** menu with expandable categories. Other authorised roles keep their
  existing specialist navigation and permissions.
- Address, collection settings and tank comparisons open on demand. Invalid required
  fields automatically reveal their section before browser validation focuses them.
- Advanced menu categories use a single-open accordion to keep the sidebar compact;
  the category containing the current page opens automatically.
- Owner-facing labels use ordinary language. Internal API paths and existing data
  contracts retain their identifiers.
- Estimated property details have a persistent concise disclosure. A measured roof
  requires recorded field verification; a tank level shows its measurement status and
  timestamp. The tank meter reflects saved data, not a live sensor.
- **Try an example** enables a stateless simulated feature preview. **Back to my
  property** returns to actual property workflows. Switching properties resets the
  preview; no preview action updates saved values or creates measurement evidence.
- Public judge demos remain accessible beside sign-in and independently of any
  owner's account. Example rainfall is separate from coordinate-based live forecasts.

The layout extends the existing fonts, colors and components. Mobile navigation
retains focus and Escape handling, including when a menu expands. Reduced-motion
preferences disable tank-meter transitions. Browser verification covers six initial
links, access to all destinations, estimate disclosure, hidden-field validation,
mobile keyboard use, preserved private data and representative viewport layouts.

## Map estimate and roof guidance

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
