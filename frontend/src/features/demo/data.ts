import type { Simulation } from '../../types'

export interface DemoInputs {
  profile: 'home' | 'office' | 'society'
  weather: 'bursts' | 'steady' | 'dry'
  rainfall_mm: number
  area_m2: number
  runoff_coefficient: number
  first_flush_mm: number
  collection_efficiency: number
  capacity_l: number
  initial_storage_pct: number
  daily_demand_l: number
  budget_inr: number
}
export interface Investment {
  property_id: string
  property_name: string
  capacity_l: number
  cost_inr: number
  period_benefit_l: number
  avoided_overflow_l: number
  reason: string
}
export interface DemoResult {
  data_kind: 'simulated_demonstration'
  persisted: false
  rainfall_source: string
  inputs: DemoInputs
  calculation: Simulation
  storage_comparisons: {
    capacity_l: number
    water_supplied_l: number
    overflow_l: number
    final_storage_l: number
    unmet_demand_l: number
  }[]
  community: {
    selected: Investment[]
    alternatives: Investment[]
    total_cost_inr: number
    period_benefit_l: number
    budget_remaining_inr: number
    method: string
    buildings: {
      id: string
      name: string
      area_m2: number
      daily_demand_l: number
      current_capacity_l: number
    }[]
  }
  assumptions: string[]
  workspace?: {
    data_kind: 'simulated_demonstration'
    persisted: false
    supply: { source: string; volume_l: number }[]
    consumption: { use: string; volume_l: number }[]
    historical: {
      source: string
      year: number
      annual_rainfall_mm: number
      monthly: { month: number; rainfall_mm: number }[]
      resolution: string
    }
    annual_sizing: {
      comparisons: {
        capacity_l: number
        cost_inr: number | null
        simulation: {
          water_supplied_l: number
          overflow_l: number
          unmet_demand_l: number
        }
      }[]
      recommended_range_l: number[]
      reasons: string[]
      limitations: string[]
    }
    performance: {
      pairs: { sample: number; predicted_l: number; simulated_reading_l: number }[]
      mae_l: number | null
      calibration_eligible: false
      reason: string
    }
    properties: {
      id: string
      name: string
      area_m2: number
      daily_demand_l: number
      current_capacity_l: number
      net_inflow_l: number
      overflow_l: number
      measurement_status: 'simulated_unverified'
      registered: false
    }[]
    community: {
      fictional_count: number
      verified_area_m2: number
      assumed_area_m2: number
      capacity_l: number
      net_inflow_l: number
      overflow_l: number
    }
    groundwater: { depth_m: null; infiltration_mm_h: null; suitability: string }
    limitations: string[]
  }
}
export interface FlowFrame {
  hour: number
  storage_l: number
  capacity_l: number
  rainfall_mm: number
  overflow_l: number
  playing: boolean
}

export const defaults: DemoInputs = {
  profile: 'home',
  weather: 'bursts',
  rainfall_mm: 36,
  area_m2: 120,
  runoff_coefficient: 0.8,
  first_flush_mm: 1,
  collection_efficiency: 0.9,
  capacity_l: 1200,
  initial_storage_pct: 25,
  daily_demand_l: 400,
  budget_inr: 60000,
}
export const profiles = [
  {
    id: 'home' as const,
    name: 'Homeowner',
    area_m2: 120,
    capacity_l: 1200,
    daily_demand_l: 400,
    description: 'Plan water for toilets, cleaning and a garden. Understand when a small tank may overflow.',
  },
  {
    id: 'office' as const,
    name: 'Commercial building',
    area_m2: 1000,
    capacity_l: 6000,
    daily_demand_l: 2500,
    description:
      'Explore non-potable demand and storage choices before requesting site measurements and quotations.',
  },
  {
    id: 'society' as const,
    name: 'Apartment society',
    area_m2: 2000,
    capacity_l: 12000,
    daily_demand_l: 5000,
    description: 'Compare shared storage and prioritise investment across participating buildings.',
  },
]
export const tour = [
  {
    title: 'Why it matters',
    label: 'The opportunity',
    heading: 'Rain falls on buildings. Decisions make it useful.',
    text: 'A rooftop can collect water, but useful supply depends on connected area, losses, storage and demand. VARSHIQ brings those pieces together so owners can prepare before rain and learn from actual results.',
    takeaway:
      'Our motive: make building and community water decisions explainable, measurable and easier to act on.',
  },
  {
    title: 'Who benefits',
    label: 'People & purpose',
    heading: 'One water picture. Different everyday needs.',
    text: 'Homeowners can plan non-potable use. Businesses can assess storage against consumption. Societies and local authorities can compare consented property records and investment priorities.',
    takeaway:
      'Choose a profile below. Its dimensions and demand are illustrative assumptions, never verified building facts.',
  },
  {
    title: 'Follow the water',
    label: 'VARSHIQ WaterTwin',
    heading: 'Every litre has a route through the model.',
    text: 'Rainfall becomes roof runoff. First flush diverts the initial event water; filters and pipes cause further losses. The tank receives the net inflow, overflows if full, and supplies only the demand it can meet.',
    takeaway:
      'Pause or step through the hours. The tank animation follows the Python water balance, including dry periods.',
  },
  {
    title: 'Compare storage',
    label: 'Better questions',
    heading: 'A bigger tank is a choice to evaluate.',
    text: 'Compare overflow, demand supplied and water remaining under identical rainfall and demand. Bigger storage can retain more water, but may add little useful supply in a short scenario.',
    takeaway:
      'These 48-hour comparisons explain behaviour. Actual sizing needs seasonal history, space, demand and quotations.',
  },
  {
    title: 'Community choices',
    label: 'Shared resources',
    heading: 'Put a limited budget where it helps most.',
    text: 'An exact solver compares illustrative storage upgrades for three fictional buildings. It selects at most one upgrade per building and maximises additional water supplied within your sample budget.',
    takeaway:
      'In the real workspace, this requires registered properties, catchment evidence, installation constraints and actual quoted costs.',
  },
  {
    title: 'Know the limits',
    label: 'From demo to field',
    heading: 'Useful intelligence begins with honest evidence.',
    text: 'Forecasts are uncertain. A mapped outline does not verify a usable roof. Storage readings, maintenance and actual collection improve the model. Recharge, structural suitability and drinking-water safety need professional assessment.',
    takeaway:
      'VARSHIQ supports decisions; this demonstration does not certify a system or claim actual water savings.',
  },
]
