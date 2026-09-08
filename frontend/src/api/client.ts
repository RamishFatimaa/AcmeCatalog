import type { ProblemDetails } from '../types'

export class ApiError extends Error {
  status: number
  problem: ProblemDetails | null

  constructor(status: number, problem: ProblemDetails | null) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`)
    this.status = status
    this.problem = problem
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string | null
}

export async function apiRequest<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {}
  if (options.body !== undefined && !isFormData) {
    // FormData sets its own Content-Type (with the multipart boundary) —
    // setting it here would strip that boundary and the server couldn't
    // parse the upload.
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(`${baseUrl}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: isFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, data)
  }

  return data as T
}
