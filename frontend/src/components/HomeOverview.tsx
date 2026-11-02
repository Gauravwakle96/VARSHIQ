import { ArrowRight, CloudRain, Gauge, Ruler, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Property } from '../types'
import { date, Metric, number, PageTitle, Section } from './ui'

export default function HomeOverview({ property }: { property: Property }) {
  const planning = property.measurement_status === 'planning_assumptions'
  const measuredRoof = property.measurement_status === 'field_verified'
  const measuredStorage = property.storage_status === 'measured'
  const fullness = property.tank_capacity_l > 0
    ? Math.min(100, Math.max(0, property.current_storage_l / property.tank_capacity_l * 100)) : null
  return (
    <>
      <PageTitle eyebrow="MY WATER OVERVIEW" title={property.name}
        description="See what rain could bring, plan your tank, and record what you measure."
        action={<Link to="/property" className="button secondary">Edit property details <ArrowRight size={16} /></Link>} />
      <div className="home-actions" aria-label="Start here">
        {[
          { to: '/forecast', title: 'Will it rain?', description: 'See tomorrow’s rain and the week ahead.', icon: CloudRain },
          { to: '/twin', title: 'Will my tank fill up?', description: 'Estimate collection, water use and overflow.', icon: Waves },
          { to: '/observations', title: 'Record what happened', description: 'Add a real tank reading or collected water.', icon: Gauge },
        ].map(({ to, title, description, icon: Icon }) => (
          <Link to={to} key={to} className="home-action">
            <Icon size={25} /><strong>{title}</strong><p>{description}</p>
            <span>Open <ArrowRight size={15} /></span>
          </Link>
        ))}
      </div>
      <div className="home-status-grid">
        <Section title="Water in my tank" subtitle={measuredStorage ? 'Last recorded measurement, not a live sensor.' : 'Estimated starting level, not a measurement.'}>
          <div className="home-tank-reading">
            <strong>{number(property.current_storage_l)} <small>L</small></strong>
            <span>of {number(property.tank_capacity_l)} L capacity{planning ? ' · estimated' : ' · entered by you'}</span>
          </div>
          {fullness != null ? (
            <div className="home-tank-meter" role="meter" aria-label={measuredStorage ? 'Recorded tank level' : 'Estimated tank level'}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={fullness}
              aria-valuetext={`${number(fullness, 1)} percent full, ${measuredStorage ? 'recorded measurement' : 'estimate'}`}>
              <span style={{ width: `${fullness}%` }} />
            </div>
          ) : <p className="muted">Enter a tank capacity to see its level.</p>}
          <p className="muted">Updated {date(property.storage_measured_at, property.timezone)}</p>
          <Link className="text-link" to="/observations">Add a measured tank level <ArrowRight size={15} /></Link>
        </Section>
        <Section title="Your next step" subtitle="Make your estimates more useful with real measurements.">
          <div className="home-next-step">
            <Ruler size={23} />
            <div><h3>{measuredRoof ? 'Keep your tank readings up to date' : 'Start with your roof on the map'}</h3>
              <p>{measuredRoof ? 'Record your tank level and water use to compare them with predictions.' :
                'Select your building, review its outline, and use the estimated area. You can enter your own area or add a field measurement later.'}</p>
            </div>
          </div>
          <Link className="button secondary" to={measuredRoof ? '/observations' : '/map'}>
            {measuredRoof ? 'Record a measurement' : 'Estimate my roof from the map'} <ArrowRight size={16} />
          </Link>
        </Section>
      </div>
      <div className="metrics-grid three">
        <Metric label="Roof area for collection" value={number(property.effective_catchment_m2, 1)} unit="m²"
          detail={measuredRoof ? 'Field measurement recorded' : property.roof_area_provenance?.basis === 'user_confirmed_map_estimate' ? 'Map estimate · confirmed by you' : planning ? 'Estimate · not yet measured' : 'User input · not field verified'} />
        <Metric label="Daily water needed" value={number(property.daily_demand_l)} unit="L/day"
          detail={planning ? 'Estimated daily use' : 'From your saved water-use inputs'} />
        <Metric label="Space left in the tank" value={number(Math.max(0, property.tank_capacity_l - property.current_storage_l))} unit="L"
          detail="Calculated from the saved capacity and level" />
      </div>
      <details className="home-more panel">
        <summary>Explore more tools <ArrowRight size={16} /></summary>
        <div className="quick-tools">
          <Link to="/optimiser"><Waves size={21} /><div><strong>Compare tank sizes</strong><span>See which capacity could meet your needs.</span></div><ArrowRight size={17} /></Link>
          <Link to="/recommendations"><Ruler size={21} /><div><strong>Suggested improvements</strong><span>Review options and what needs checking on site.</span></div><ArrowRight size={17} /></Link>
          <Link to="/reports"><CloudRain size={21} /><div><strong>Download my report</strong><span>Share your inputs, estimates and sources.</span></div><ArrowRight size={17} /></Link>
        </div>
        <p className="muted">Select another property in the header to view its details. Community and maintenance tools are in the menu.</p>
      </details>
    </>
  )
}
