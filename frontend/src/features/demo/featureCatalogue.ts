export interface PreviewFeature {
  path: string
  name: string
  group: string
  purpose: string
  benefit: string
  liveNeeds: string
}

export const previewFeatures: PreviewFeature[] = [
  {
    path: '/locations',
    name: 'Select location',
    group: 'Place & operations',
    purpose: 'Start with a real place and confirm the actual building position.',
    benefit: 'Residents and organisations receive weather for their own coordinates.',
    liveNeeds:
      'Confirm the address and property coordinates. Search results and GPS positions are estimates.',
  },
  {
    path: '/water-sources',
    name: 'Water sources',
    group: 'Place & operations',
    purpose: 'Compare tank supply with other water sources.',
    benefit: 'Owners can understand dependence on municipal water, tankers and other supplies.',
    liveNeeds:
      'Record actual supply intervals, volumes and source methods; no assumed source is an actual delivery.',
  },
  {
    path: '/consumption',
    name: 'Water consumption',
    group: 'Place & operations',
    purpose: 'See how demand is distributed across intended uses.',
    benefit: 'Households and businesses can plan conservation around the uses that consume water.',
    liveNeeds:
      'Meter or estimate actual past consumption with its interval and method. This sample allocation is fictional.',
  },
  {
    path: '/maintenance',
    name: 'Maintenance & readiness',
    group: 'Place & operations',
    purpose: 'Practise a pre-rain inspection checklist and review modelled overflow.',
    benefit: 'Owners can prepare filters, drains, tanks and safe overflow arrangements before rain.',
    liveNeeds:
      'A performed inspection needs an actual date and condition. Practising here does not complete real maintenance.',
  },
  {
    path: '/quality',
    name: 'Water quality',
    group: 'Place & operations',
    purpose: 'Explore the types of measurements a water-quality record contains.',
    benefit: 'Owners can keep testing, treatment and intended use explicit.',
    liveNeeds:
      'Use actual laboratory or field results. pH, TDS and turbidity cannot certify drinking-water safety.',
  },
  {
    path: '/groundwater',
    name: 'Groundwater & soil',
    group: 'Place & operations',
    purpose: 'Understand the field information needed before recharge screening.',
    benefit: 'Site owners avoid basing recharge designs on unverified assumptions.',
    liveNeeds:
      'Verified soil infiltration, hydrogeology, groundwater depth/quality, setbacks and local permissions are required.',
  },
  {
    path: '/community-budget',
    name: 'Community budget',
    group: 'Place & operations',
    purpose: 'Compare a limited budget with hypothetical storage upgrades.',
    benefit: 'Societies can prioritise investments by additional useful water supplied.',
    liveNeeds:
      'Actual quotations, suitable registered properties and confirmed installation space. Demo costs are indicative.',
  },
  {
    path: '/',
    name: 'Overview',
    group: 'Workspace',
    purpose: 'Connect rain, collection, demand and overflow in one water picture.',
    benefit: 'Property owners can see the impact of their assumptions before measuring the site.',
    liveNeeds:
      'Actual registered properties, measured inputs and current provider forecasts. These are fictional scenario totals.',
  },
  {
    path: '/map',
    name: 'Building map',
    group: 'Workspace',
    purpose: 'Find real public building outlines without claiming roof verification.',
    benefit: 'Owners can identify a property and then measure its connected catchment.',
    liveNeeds:
      'Provider coverage, correct location and separately verified catchment. A footprint is not a usable rooftop measurement.',
  },
  {
    path: '/register',
    name: 'Register property',
    group: 'Workspace',
    purpose: 'Practise choosing a building type and water-system inputs.',
    benefit: 'Homeowners, commercial owners and societies share a consistent registration workflow.',
    liveNeeds:
      'Sign in, confirm ownership/location and save actual information. No property is registered in this preview.',
  },
  {
    path: '/property',
    name: 'Property details',
    group: 'Workspace',
    purpose: 'Review the assumptions behind a building water model.',
    benefit: 'Owners can change inputs and see how the model responds.',
    liveNeeds:
      'Actual roof, drainage, tank and demand inputs with provenance. These example buildings are fictional.',
  },
  {
    path: '/verify',
    name: 'Roof verification',
    group: 'Workspace',
    purpose: 'Practise adjusting connected catchment independently of a mapped footprint.',
    benefit: 'Owners avoid overestimating collection from disconnected or unusable roof surfaces.',
    liveNeeds: 'A real measurement method, date and evidence. This exercise cannot verify an actual roof.',
  },
  {
    path: '/forecast',
    name: 'Rainfall forecast',
    group: 'Water intelligence',
    purpose: 'Explore an illustrative hourly rain event and its collection effect.',
    benefit: 'Owners can prepare for wet hours and compare rain intensity with available storage.',
    liveNeeds:
      'The live workspace retrieves coordinate-specific Open-Meteo forecasts. Rain below is synthetic, not tomorrow’s weather.',
  },
  {
    path: '/historical',
    name: 'Historical rainfall',
    group: 'Water intelligence',
    purpose: 'Explore how a seasonal rainfall pattern influences storage decisions.',
    benefit: 'Owners can understand seasonality before comparing tanks.',
    liveNeeds:
      'Actual historical provider data with coverage and resolution. This invented seasonal shape is not Maharashtra climate data.',
  },
  {
    path: '/twin',
    name: 'WaterTwin',
    group: 'Water intelligence',
    purpose: 'Follow the complete rain-to-tank water balance through 48 simulated hours.',
    benefit: 'Owners can explore supply, dry periods, demand and overflow before a field pilot.',
    liveNeeds:
      'Verified catchment, actual tank capacity/level, demand and a real forecast. Simulation never records harvested water.',
  },
  {
    path: '/calculator',
    name: 'Rainwater calculator',
    group: 'Water intelligence',
    purpose: 'Account separately for runoff, first flush, collection losses and net inflow.',
    benefit: 'Owners and engineers can inspect every step rather than trust an unexplained total.',
    liveNeeds: 'Appropriate site coefficients, measured catchment and a documented rainfall source.',
  },
  {
    path: '/optimiser',
    name: 'Storage optimiser',
    group: 'Water intelligence',
    purpose: 'Compare tank capacities with a complete synthetic annual daily water balance.',
    benefit: 'Owners can assess useful supply and overflow before considering cost and space.',
    liveNeeds:
      'Real seasonal rainfall, demand, installed quotations and site constraints. A larger tank is not automatically the right choice.',
  },
  {
    path: '/recommendations',
    name: 'Recommendations',
    group: 'Water intelligence',
    purpose: 'Turn model results and missing information into explainable next steps.',
    benefit: 'Owners can prepare a technically useful discussion with an installer or engineer.',
    liveNeeds:
      'Verified inputs, water-use requirements and structural checks. Recharge remains a professional field assessment.',
  },
  {
    path: '/observations',
    name: 'Field observations',
    group: 'Field & community',
    purpose: 'Inspect fictional prediction/reading pairs to learn how comparison works.',
    benefit: 'Owners can understand what must be measured to validate collection.',
    liveNeeds:
      'Actual matching intervals, rainfall, collection and first-flush measurements. No simulated reading is saved as evidence.',
  },
  {
    path: '/calibration',
    name: 'Performance history',
    group: 'Field & community',
    purpose: 'See a simple error metric while keeping calibration eligibility separate.',
    benefit: 'Owners can recognise recurring differences and collect better site evidence.',
    liveNeeds:
      'Sufficient reliable non-overlapping measurements and verified catchment. This sample cannot train or calibrate your property.',
  },
  {
    path: '/community',
    name: 'Locality network',
    group: 'Field & community',
    purpose: 'Compare a small fictional group of buildings under the same scenario.',
    benefit: 'Societies can understand shared harvesting potential and storage deficiencies.',
    liveNeeds: 'Genuine registered records, compatible forecast windows and explicit sharing permissions.',
  },
  {
    path: '/commercial',
    name: 'Commercial',
    group: 'Field & community',
    purpose: 'Explore higher catchment and demand in a fictional commercial setting.',
    benefit: 'Offices and institutions can plan non-potable supply around their needs.',
    liveNeeds: 'Actual commercial registrations, water-use schedules, demand and installation constraints.',
  },
  {
    path: '/municipal',
    name: 'Municipal',
    group: 'Field & community',
    purpose: 'Explore the shape of consented aggregate reporting with fictional buildings.',
    benefit: 'Authorities can evaluate combined opportunity without exposing private property details.',
    liveNeeds:
      'An authorised municipal role and opted-in genuine records. Preview access does not grant municipal permissions.',
  },
  {
    path: '/assistant',
    name: 'Water assistant',
    group: 'Tools',
    purpose: 'Choose a question and get an explanation from the scenario’s backend results.',
    benefit: 'Owners can understand calculations without requiring a paid language model.',
    liveNeeds:
      'The live assistant retrieves authorised backend facts; AI never supplies engineering numbers.',
  },
  {
    path: '/reports',
    name: 'Assessment reports',
    group: 'Tools',
    purpose: 'Download an explicitly simulated assessment with its full assumptions.',
    benefit: 'Owners can see what a report should explain before collecting field evidence.',
    liveNeeds:
      'Real property reports require actual inputs and provenance. A demo report is not a site assessment.',
  },
  {
    path: '/sources',
    name: 'Data sources',
    group: 'Tools',
    purpose: 'Understand which data is real geography, forecast, historical context or an assumption.',
    benefit: 'Everyone can assess data availability and limitations before trusting a result.',
    liveNeeds:
      'Check the live data-source page for actual connection status. This preview does not claim provider uptime.',
  },
  {
    path: '/settings',
    name: 'Settings',
    group: 'Tools',
    purpose: 'Change a scenario profile and reset the illustrative inputs.',
    benefit: 'Owners can understand configurability without changing production settings.',
    liveNeeds:
      'Actual system settings remain role-protected. Preview controls affect only this browser exercise.',
  },
]

export function previewFeature(path: string) {
  return (
    previewFeatures.find((item) => item.path === path) ?? previewFeatures.find((item) => item.path === '/')!
  )
}
