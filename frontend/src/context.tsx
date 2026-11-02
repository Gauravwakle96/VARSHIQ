import { createContext, useContext } from 'react'
import type { LocationResult, Property, User } from './types'

export interface Workspace {
  user: User | null
  properties: Property[]
  property: Property | null
  propertiesLoading: boolean
  refreshProperties: () => void
  selectProperty: (id: string) => void
  notify: (message: string) => void
  activeLocation: LocationResult | null
  setActiveLocation: (location: LocationResult | null) => void
  propertiesAvailable: boolean
  propertiesError: Error | null
}
export const WorkspaceContext = createContext<Workspace | null>(null)
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('Workspace provider is required')
  return context
}
