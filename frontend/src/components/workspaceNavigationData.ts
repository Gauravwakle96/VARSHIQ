import {
  Building2, ChartNoAxesCombined, CircleHelp, CloudRain, Droplets,
  FileText, Gauge, LayoutDashboard, Map, MessageSquare, Plus, Settings,
  ShieldCheck, SlidersHorizontal, Users, Waves,
} from 'lucide-react'

export const everyday = [
  { to: '/', label: 'My overview', icon: LayoutDashboard },
  { to: '/forecast', label: 'Rain forecast', icon: CloudRain },
  { to: '/twin', label: 'My water tank', icon: Waves },
  { to: '/consumption', label: 'Water use', icon: Gauge },
  { to: '/map', label: 'Building map', icon: Map },
  { to: '/reports', label: 'My reports', icon: FileText },
]
export const more = [
  { label: 'Property & roof', links: [
    { to: '/property', label: 'My property details', icon: Building2 },
    { to: '/verify', label: 'Measure my roof', icon: ShieldCheck },
    { to: '/locations', label: 'Find a location', icon: Map },
    { to: '/register', label: 'Add a property', icon: Plus },
  ] },
  { label: 'Plan & compare', links: [
    { to: '/calculator', label: 'Calculate rainwater', icon: Droplets },
    { to: '/optimiser', label: 'Compare tank sizes', icon: SlidersHorizontal },
    { to: '/recommendations', label: 'Suggested improvements', icon: CircleHelp },
    { to: '/historical', label: 'Past rainfall', icon: ChartNoAxesCombined },
  ] },
  { label: 'Records & checks', links: [
    { to: '/observations', label: 'Record a measurement', icon: Gauge },
    { to: '/calibration', label: 'How accurate are estimates?', icon: ChartNoAxesCombined },
    { to: '/water-sources', label: 'Water sources', icon: Droplets },
    { to: '/maintenance', label: 'Cleaning & maintenance', icon: ShieldCheck },
    { to: '/quality', label: 'Water quality', icon: CircleHelp },
    { to: '/groundwater', label: 'Groundwater & soil', icon: Waves },
  ] },
  { label: 'Community tools', links: [
    { to: '/community', label: 'Nearby properties', icon: Users },
    { to: '/community-budget', label: 'Community budget', icon: SlidersHorizontal },
    { to: '/commercial', label: 'Commercial properties', icon: Building2 },
    { to: '/municipal', label: 'Municipal overview', icon: Users },
  ] },
  { label: 'Help & settings', links: [
    { to: '/assistant', label: 'Ask about my water', icon: MessageSquare },
    { to: '/sources', label: 'Data sources', icon: CloudRain },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
]

export const workspaceLabel = (path: string) =>
  [...everyday, ...more.flatMap(group => group.links)].find(link => link.to === path)?.label
