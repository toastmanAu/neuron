/**
 * JSON-RPC client for a Fiber node.
 *
 * The endpoint is untrusted input: it is a URL the user typed, and a node can be replaced, proxied
 * or simply wrong. Everything that comes back is checked for shape before it is handed on, and a
 * body that merely parses as JSON is not treated as a response.
 */

const DEFAULT_TIMEOUT_MS = 30_000

/** Fiber returns this for a request with a missing or rejected biscuit token. */
const UNAUTHORIZED_CODE = -32999

export class FiberRpcError extends Error {
  public readonly code: number

  public readonly data?: unknown

  constructor(method: string, code: number, message: string, data?: unknown) {
    super(`Fiber node rejected ${method}: ${message}`)
    this.code = code
    this.data = data
  }
}

/** Separate from a generic error because the remedy is a token, not a retry. */
export class FiberUnauthorized extends FiberRpcError {
  constructor(method: string, message: string, data?: unknown) {
    super(method, UNAUTHORIZED_CODE, message, data)
  }
}

export class FiberNodeUnreachable extends Error {
  constructor(url: string, cause: string) {
    super(`Fiber node at ${url} is unreachable: ${cause}`)
  }
}

export interface FiberRpcClientOptions {
  url: string
  /** Biscuit token, sent as a bearer credential. Optional: a node may run without auth. */
  token?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | string | null
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

export default class FiberRpcClient {
  public readonly url: string

  private readonly token?: string

  private readonly fetchImpl?: typeof fetch

  private readonly timeoutMs: number

  private nextId = 1

  constructor(options: FiberRpcClientOptions) {
    this.url = options.url
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl
  }

  /**
   * Resolve the fetch to use, bound to the global object.
   *
   * Bound on purpose: the global fetch performs a brand check on its receiver, so calling an unbound
   * reference as a method (`this.fetchImpl(...)`) throws "Illegal invocation" — and a suite that
   * always injects a plain mock never sees it, because a mock has no brand check.
   *
   * Resolved per call rather than in the constructor so that merely constructing a client never
   * depends on the runtime having a global fetch.
   */
  private resolveFetch(): typeof fetch {
    if (this.fetchImpl) {
      return this.fetchImpl
    }
    const globalFetch = (globalThis as { fetch?: typeof fetch }).fetch
    if (!globalFetch) {
      throw new Error('No fetch implementation is available in this runtime')
    }
    return globalFetch.bind(globalThis)
  }

  public async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const doFetch = this.resolveFetch()

    let response: Response
    try {
      response = await doFetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: controller.signal,
      })
    } catch (error) {
      throw new FiberNodeUnreachable(this.url, (error as Error).message)
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new FiberNodeUnreachable(this.url, `HTTP ${response.status}`)
    }

    const text = await response.text()
    let body: JsonRpcResponse
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`Fiber node at ${this.url} returned a body that is not JSON`)
    }

    if (!body || typeof body !== 'object' || (body.result === undefined && body.error === undefined)) {
      throw new Error(`Fiber node at ${this.url} returned a body that is not a JSON-RPC response`)
    }

    if (body.error) {
      const { code = 0, message = 'unknown error', data } = body.error
      if (code === UNAUTHORIZED_CODE) {
        throw new FiberUnauthorized(method, message, data)
      }
      throw new FiberRpcError(method, code, message, data)
    }

    return body.result as T
  }

  /** Cheap reachability probe. Never throws, so callers can render a status without try/catch. */
  public async isHealthy(): Promise<boolean> {
    try {
      await this.call('node_info')
      return true
    } catch {
      return false
    }
  }
}
