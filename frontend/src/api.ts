import { useCallback, useEffect, useState } from 'react'
import type { Session } from './types'

let csrfToken = ''
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
export const setCsrf = (token: string) => {
  csrfToken = token
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'
  if (method !== 'GET' && !csrfToken) {
    const session = await api<Session>('/auth/session')
    setCsrf(session.csrf_token)
  }
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (method !== 'GET') headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`/api/v1${path}`, { ...options, method, headers, credentials: 'include' })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const details = body?.error?.details ?? body?.detail
    const message =
      body?.error?.message ??
      (typeof details === 'string'
        ? details
        : Array.isArray(details)
          ? details
              .map(
                (item: { msg?: string; loc?: string[] }) =>
                  `${item.loc?.slice(-1).join('') ?? 'Input'}: ${item.msg ?? 'invalid'}`,
              )
              .join('; ')
          : `Request failed (${response.status}). Please try again.`)
    throw new ApiError(message, response.status)
  }
  return (
    body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body
  ) as T
}
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) })
export const patch = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
export function query(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}
export function useApi<T>(path: string | null) {
  const [stored, setStored] = useState<{ path: string | null; value: T | null }>({ path: null, value: null })
  const [loadingPath, setLoadingPath] = useState<string | null>(path)
  const [failure, setFailure] = useState<{ path: string; error: Error } | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const setData = useCallback(
    (value: T | null) => {
      setStored({ path, value })
      setFailure(null)
    },
    [path],
  )
  useEffect(() => {
    if (!path) {
      setStored({ path: null, value: null })
      setLoadingPath(null)
      setFailure(null)
      return
    }
    const controller = new AbortController()
    setLoadingPath(path)
    setFailure(null)
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setStored({ path, value })
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setFailure({ path, error })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPath(null)
      })
    return () => controller.abort()
  }, [path, revision])
  const data = stored.path === path ? stored.value : null
  const error = failure?.path === path ? failure.error : null
  const loading = Boolean(path && (loadingPath === path || (stored.path !== path && !error)))
  return { data, loading, error, reload, setData }
}
