import { useEffect, useState } from 'react'
import type { DemoInputs, DemoResult } from './data'

export function useDemo(inputs: DemoInputs, revision: number, workspace = false) {
  const key = JSON.stringify(inputs)
  const [saved, setSaved] = useState<{ key: string; value: DemoResult } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setError(null)
      try {
        const response = await fetch(workspace ? '/api/v1/demo/workspace' : '/api/v1/demo/simulate', {
          method: 'POST',
          credentials: 'omit',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: key,
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error?.message ?? 'The simulation service is unavailable.')
        if (body?.data?.data_kind !== 'simulated_demonstration' || body.data.persisted !== false)
          throw new Error('The service returned an unsupported demonstration response.')
        if (
          !Array.isArray(body.data.calculation?.hourly) ||
          body.data.calculation.hourly.length !== 48 ||
          !Number.isFinite(body.data.calculation.capacity_l) ||
          body.data.calculation.capacity_l <= 0 ||
          !Array.isArray(body.data.storage_comparisons) ||
          !Array.isArray(body.data.community?.buildings)
        )
          throw new Error('The simulation response is incomplete. Retry the service.')
        if (
          workspace &&
          (body.data.workspace?.data_kind !== 'simulated_demonstration' ||
            body.data.workspace.persisted !== false ||
            !Array.isArray(body.data.workspace.annual_sizing?.comparisons) ||
            !Array.isArray(body.data.workspace.performance?.pairs))
        )
          throw new Error('The feature preview response is incomplete. Retry the service.')
        if (!controller.signal.aborted) setSaved({ key, value: body.data })
      } catch (error) {
        if (!controller.signal.aborted) setError({ key, message: (error as Error).message })
      }
    }, 650)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, revision, workspace])
  return {
    result: saved?.key === key ? saved.value : null,
    error: error?.key === key ? error.message : null,
    key,
  }
}
