import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { everyday, more } from './workspaceNavigationData'

export default function WorkspaceNavigation() {
  const { pathname } = useLocation()
  const links = (items: typeof everyday) => items.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} end={to === '/'} to={to}
      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={17} /><span>{label}</span>
    </NavLink>
  ))
  return (
    <nav aria-label="Your water tools">
      <div className="nav-group">
        <div className="nav-label">Everyday</div>
        {links(everyday)}
      </div>
      <details className="nav-more" open={more.some(group => group.links.some(link => link.to === pathname))}>
      <summary>More tools<ChevronDown size={15} /></summary>
      {more.map(group => (
        <details className="nav-disclosure" key={group.label}
          name="workspace-extra-tools"
          open={group.links.some(link => link.to === pathname)}>
          <summary>{group.label}<ChevronDown size={15} /></summary>
          {links(group.links)}
        </details>
      ))}
      </details>
    </nav>
  )
}
