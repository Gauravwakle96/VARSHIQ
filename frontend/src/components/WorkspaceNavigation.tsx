import { Link, useLocation } from 'react-router-dom'
import { MessageSquare, Settings } from 'lucide-react'
import { useWorkspace } from '../context'
import { communitySection, workspaceSections } from './workspaceNavigationData'

export default function WorkspaceNavigation() {
  const { pathname } = useLocation()
  const { user } = useWorkspace()
  const sections = user?.role === 'owner' ? workspaceSections : [...workspaceSections, communitySection]
  return (
    <nav aria-label="Your water tools" className="workspace-navigation">
      <div className="nav-main">
        {sections.map(({ to, label, icon: Icon, routes }) => (
          <Link key={to} to={to} aria-current={routes.includes(pathname) ? 'page' : undefined}
            className={`nav-link ${routes.includes(pathname) ? 'active' : ''}`}>
            <Icon size={19} /><span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="nav-support">
        <Link className="nav-help" to="/assistant" aria-current={pathname === '/assistant' ? 'page' : undefined}>
          <MessageSquare size={17} /> Water assistant
        </Link>
        {user?.role === 'admin' && <Link className="nav-help" to="/settings"><Settings size={17} /> Settings</Link>}
      </div>
    </nav>
  )
}
