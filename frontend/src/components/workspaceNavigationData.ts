import { Building2, ClipboardList, CloudRain, FileText, LayoutDashboard, Users, Waves } from 'lucide-react'

export const workspaceSections = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, routes: ['/','/owner'], tabs: [] },
  { to: '/property', label: 'My property', icon: Building2,
    routes: ['/property', '/map', '/register', '/verify', '/locations'],
    tabs: [{ to: '/property', label: 'Property details' }, { to: '/map', label: 'Building map' }] },
  { to: '/forecast', label: 'Rainfall', icon: CloudRain, routes: ['/forecast', '/historical'],
    tabs: [{ to: '/forecast', label: 'Forecast' }, { to: '/historical', label: 'Past rainfall' }] },
  { to: '/twin', label: 'My tank', icon: Waves,
    routes: ['/twin', '/optimiser', '/recommendations', '/calculator'],
    tabs: [{ to: '/twin', label: 'WaterTwin' }, { to: '/optimiser', label: 'Tank sizes' },
      { to: '/recommendations', label: 'Improvements' }] },
  { to: '/observations', label: 'Records', icon: ClipboardList,
    routes: ['/observations', '/consumption', '/maintenance', '/water-sources', '/calibration'],
    tabs: [{ to: '/observations', label: 'Readings' }, { to: '/consumption', label: 'Water use' },
      { to: '/maintenance', label: 'Maintenance' }] },
  { to: '/reports', label: 'Reports', icon: FileText, routes: ['/reports', '/community', '/commercial'],
    tabs: [{ to: '/reports', label: 'Property reports' }, { to: '/community', label: 'Community summary' }] },
]

export const communitySection = {
  to: '/municipal', label: 'Community', icon: Users, routes: ['/municipal', '/community-budget'],
  tabs: [{ to: '/municipal', label: 'Municipal summary' }, { to: '/community-budget', label: 'Investment planning' }],
}

export const sectionFor = (path: string) =>
  [...workspaceSections, communitySection].find(section => section.routes.includes(path))

export const workspaceLabel = (path: string) => sectionFor(path)?.label ??
  ({ '/assistant': 'Water assistant', '/sources': 'Data sources', '/settings': 'Settings',
    '/quality': 'Water quality records', '/groundwater': 'Groundwater information' }[path] ?? 'My water')
