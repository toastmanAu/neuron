import 'dotenv/config'
import FiberRpcClient, { FiberRpcError, FiberUnauthorized } from '../../../src/services/fiber/rpc-client'

// Response-shaped objects rather than the WHATWG Response class: jest's node environment does not
// expose it, and the client only ever reads `ok`, `status` and `text()`.
const responseLike = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
})

const okResponse = (result: unknown) => responseLike(200, JSON.stringify({ jsonrpc: '2.0', id: 1, result }))

const errorResponse = (code: number, message: string, data?: unknown) =>
  responseLike(200, JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code, message, data } }))

describe('FiberRpcClient', () => {
  describe('requests', () => {
    it('sends a JSON-RPC 2.0 call and returns the result', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse({ version: '0.9.0-rc7' }))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      const result = await client.call('node_info')

      expect(result).toEqual({ version: '0.9.0-rc7' })
      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe('http://node.invalid:8227')
      expect(JSON.parse(init.body)).toMatchObject({ jsonrpc: '2.0', method: 'node_info', params: [] })
    })

    it('sends the auth token as a bearer header when one is configured', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse({}))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', token: 'tok', fetchImpl })

      await client.call('node_info')

      expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    })

    it('sends no authorization header when no token is configured', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse({}))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await client.call('node_info')

      expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined()
    })

    it('gives every request a distinct id', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse({}))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await client.call('node_info')
      await client.call('node_info')

      const ids = fetchImpl.mock.calls.map(c => JSON.parse(c[1].body).id)
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('using the runtime fetch', () => {
    it('works without an injected fetch implementation', async () => {
      // Regression guard. Storing the global fetch on an instance and calling it as a method
      // (`this.fetchImpl(...)`) fails its brand check with "Illegal invocation" — and a suite that
      // always injects a plain jest.fn never notices, because a mock has no brand check.
      const hadFetch = typeof globalThis.fetch === 'function'
      if (!hadFetch) {
        // jest's node environment may not expose fetch; the point of this test is the binding, so a
        // stand-in global is enough to exercise it.
        ;(globalThis as { fetch?: unknown }).fetch = () => Promise.resolve(okResponse({ ok: true }))
      }
      const globalFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true }) as never)
      try {
        const client = new FiberRpcClient({ url: 'http://node.invalid:8227' })

        await expect(client.call('node_info')).resolves.toEqual({ ok: true })
      } finally {
        globalFetch.mockRestore()
        if (!hadFetch) {
          delete (globalThis as { fetch?: unknown }).fetch
        }
      }
    })
  })

  describe('error handling', () => {
    it('turns a JSON-RPC error into a typed failure carrying the code', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(errorResponse(-32602, 'Invalid params', 'missing field `pubkey`'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('open_channel')).rejects.toThrow(FiberRpcError)
      await expect(client.call('open_channel')).rejects.toMatchObject({ code: -32602 })
    })

    it('reports an unauthorized node distinctly, since the fix is a token not a retry', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(errorResponse(-32999, 'Unauthorized'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('node_info')).rejects.toThrow(FiberUnauthorized)
    })

    it('rejects a non-2xx response', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(responseLike(502, 'nope'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('node_info')).rejects.toThrow(/502/)
    })

    it('rejects a body that is not JSON', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(responseLike(200, '<html>gateway</html>'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('node_info')).rejects.toThrow(/json/i)
    })

    it('rejects a JSON body that is not a JSON-RPC response', async () => {
      // The endpoint is untrusted input; something that merely parses is not a response.
      const fetchImpl = jest.fn().mockResolvedValue(responseLike(200, JSON.stringify({ hello: 'world' })))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('node_info')).rejects.toThrow(/json-rpc/i)
    })

    it('surfaces a transport failure rather than hanging', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.call('node_info')).rejects.toThrow(/ECONNREFUSED|unreachable/i)
    })

    it('aborts a request that exceeds the timeout', async () => {
      const fetchImpl = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      })
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl, timeoutMs: 20 })

      await expect(client.call('node_info')).rejects.toThrow()
    })
  })

  describe('health', () => {
    it('reports a reachable node as healthy', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(okResponse({ version: '0.9.0-rc7' }))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.isHealthy()).resolves.toBe(true)
    })

    it('reports an unreachable node as unhealthy rather than throwing', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const client = new FiberRpcClient({ url: 'http://node.invalid:8227', fetchImpl })

      await expect(client.isHealthy()).resolves.toBe(false)
    })
  })
})
