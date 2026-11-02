# Dataset licences and provider conditions

Audit date: 2026-11-02. This document identifies inspected source conditions; it does not grant rights to third-party data. Verify applicable terms again for a production or commercial deployment.

| Source | Conditions verified | VARSHIQ handling |
| --- | --- | --- |
| [Open-Meteo forecast/archive](https://open-meteo.com/en/licence) | API data CC BY 4.0. Attribution, licence link and processing-change notice required. [Free API terms](https://open-meteo.com/en/terms) are noncommercial, with fewer than 10,000/day, 5,000/hour and 600/minute calls. | Linked provider credit next to weather output; timestamps normalised to interval starts. Commercial operation requires an appropriate plan. API use does not copy the AGPL server code. |
| ERA5 historical reanalysis via Open-Meteo | Regional ECMWF/Copernicus reanalysis, not a local rain gauge or IMD observation. | Provider/model, spatial resolution and coverage retained. A consistent model is selected for comparisons. |
| [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) | Data licensed under CDLA Permissive 2.0. Sharing Data requires the agreement text to be available; computational Results have no CDLA restrictions. | Bounded required tile extraction; no worldwide download. Include the agreement below when exporting/sharing Microsoft polygon data. No Microsoft trademark/endorsement rights are implied. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Mapping data © OpenStreetMap contributors under ODbL 1.0. Tile hosting has its own [usage policy](https://operations.osmfoundation.org/policies/tiles/). | Map/source attribution retained. No bulk tile prefetching or offline harvesting. Consider a commercial/self-hosted tile service for larger deployment. |
| IMD gridded datasets | Dataset usage/distribution conditions are separate from IMDLIB's MIT code licence and were not comprehensively established by this audit. | Approved local files only after operator review and explicit dataset-terms acceptance. No redistribution in git or a public bundle. |
| India Rainfall Gridded outputs | README explicitly excludes underlying IMD data from its repository's MIT licence. GeoNames sources listed as CC BY 4.0; listed boundaries CC BY 2.5 IN. | No prebuilt dataset, boundary or chart is adopted without its own attribution/terms review. |
| GOBS | Dataset access/reuse approval remains pending. | Unavailable status; manual/OSM pathways remain available. |
| CGWB, GSDA, soil/geological data | Each supplied dataset requires source-specific coverage/date/licence and verification. | No bundled or invented aquifer data; recharge requires professional field assessment. |
| Google Earth Engine and satellite collections | [Access](https://developers.google.com/earth-engine/guides/access) needs an enabled, registered Cloud project. Noncommercial eligibility verification or paid commercial configuration applies; collection licences differ. | Deferred module; no unrestricted access or completed satellite analysis claimed. |
| User measurements/photos | Owner authorisation and privacy obligations apply. | Private organisation scope; EXIF removed; sharing aggregates is explicit opt-in. |

## Community Data License Agreement – Permissive – Version 2.0

Canonical text: <https://cdla.dev/permissive-2-0/>. The agreement text below was inspected at that source on 2026-11-02.

This is the Community Data License Agreement – Permissive, Version 2.0 (the “agreement”). Data Provider(s) and Data Recipient(s) agree as follows:

**1. Provision of the Data**

1.1. A Data Recipient may use, modify, and share the Data made available by Data Provider(s) under this agreement if that Data Recipient follows the terms of this agreement.

1.2. This agreement does not impose any restriction on a Data Recipient’s use, modification, or sharing of any portions of the Data that are in the public domain or that may be used, modified, or shared under any other legal exception or limitation.

**2. Conditions for Sharing Data**

2.1. A Data Recipient may share Data, with or without modifications, so long as the Data Recipient makes available the text of this agreement with the shared Data.

**3. No Restrictions on Results**

3.1. This agreement does not impose any restriction or obligations with respect to the use, modification, or sharing of Results.

**4. No Warranty; Limitation of Liability**

4.1. All Data Recipients receive the Data subject to the following terms:

THE DATA IS PROVIDED ON AN “AS IS” BASIS, WITHOUT REPRESENTATIONS, WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. NO DATA PROVIDER SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING WITHOUT LIMITATION LOST PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE DATA OR RESULTS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

**5. Definitions**

5.1. “Data” means the material received by a Data Recipient under this agreement.

5.2. “Data Provider” means any person who is the source of Data provided under this agreement and in reliance on a Data Recipient’s agreement to its terms.

5.3. “Data Recipient” means any person who receives Data directly or indirectly from a Data Provider and agrees to the terms of this agreement.

5.4. “Results” means any outcome obtained by computational analysis of Data, including for example machine learning models and models’ insights.

## Maharashtra directory and geocoding

District labels/divisions/official website links are reproduced from https://maharashtra.gov.in/Site/1529/Districts under https://maharashtra.gov.in/Site/1383/Disclaimer-and-Policies (portal Copyright Policy: accurate, nonmisleading reproduction, source acknowledgement, third-party material excluded). Source date/hash and original labels accompany the36-entry extract. No photos or boundary geometries were imported.

Photon and optional Nominatim location results are OpenStreetMap database extracts under ODbL: https://www.openstreetmap.org/copyright . Hosted-service policies are separate; see docs/LOCATION_DATA.md. No provider source code was copied.
