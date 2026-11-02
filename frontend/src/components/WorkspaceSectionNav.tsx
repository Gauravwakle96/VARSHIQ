import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useWorkspace } from '../context'
import { sectionFor } from './workspaceNavigationData'

export default function WorkspaceSectionNav() {
  const { pathname } = useLocation()
  const { properties, user } = useWorkspace()
  const section = sectionFor(pathname)
  if (!section?.tabs.length || (section.to === '/municipal' && user?.role === 'owner')) return null
  const tabs = section.tabs.filter(tab => tab.to !== '/community' || properties.length > 1 || user?.role !== 'owner')
  return (
    <div className="section-navigation">
      {tabs.length > 1 && <nav aria-label={`${section.label} pages`}>
        {tabs.map(tab => <Link key={tab.to} to={tab.to} aria-current={tab.to === pathname ? 'page' : undefined}>
          {tab.label}
        </Link>)}
      </nav>}
      {section.to === '/property' && <Link className="section-tool" to="/register"><Plus size={15} /> Add property</Link>}
      {section.to === '/twin' && <Link className="section-tool" to="/calculator">Quick calculator <ArrowUpRight size={14} /></Link>}
      {section.to === '/observations' && <details className="record-tools">
        <summary>More record options</summary>
        <div><Link to="/water-sources">Record water supply</Link><Link to="/calibration">Compare predictions with readings</Link></div>
      </details>}
    </div>
  )
}
