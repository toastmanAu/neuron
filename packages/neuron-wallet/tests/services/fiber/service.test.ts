import 'dotenv/config'
import FiberService from '../../../src/services/fiber/service'
import { FIBER_RESPONSES } from '../../fixtures/fiber-responses'

const clientWith = (result: unknown) => ({
  url: 'http://node.invalid:8227',
  call: jest.fn().mockResolvedValue(result),
  isHealthy: jest.fn().mockResolvedValue(true),
})

describe('FiberService', () => {
  describe('nodeInfo', () => {
    it('reads a real node_info response', async () => {
      const client = clientWith(FIBER_RESPONSES.nodeInfo)
      const service = new FiberService(client as never)

      const info = await service.nodeInfo()

      expect(info.version).toBe('0.9.0-rc7')
      expect(info.pubkey).toBe('024508b9ab7d2d8f8d67a882aa3ddc34c0095748713218b3a244684fceb8cfec4c')
      expect(info.chainHash).toBe('0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606')
      expect(info.addresses.length).toBeGreaterThan(0)
    })

    it('exposes the node default funding lock script, which external funding needs', async () => {
      const client = clientWith(FIBER_RESPONSES.nodeInfo)
      const service = new FiberService(client as never)

      const info = await service.nodeInfo()

      expect(info.defaultFundingLockScript?.codeHash).toBeDefined()
      expect(info.defaultFundingLockScript?.hashType).toBeDefined()
    })

    it('rejects a response missing the fields it promises', async () => {
      // The endpoint is untrusted: a proxy, a wrong port or a different daemon can answer.
      const service = new FiberService(clientWith({ version: '0.9.0-rc7' }) as never)

      await expect(service.nodeInfo()).rejects.toThrow(/node_info|pubkey|chain/i)
    })

    it('rejects a null response', async () => {
      const service = new FiberService(clientWith(null) as never)

      await expect(service.nodeInfo()).rejects.toThrow()
    })
  })

  describe('listChannels', () => {
    it('reads a real list_channels response', async () => {
      const service = new FiberService(clientWith(FIBER_RESPONSES.listChannels) as never)

      const channels = await service.listChannels()

      expect(channels).toHaveLength(1)
      expect(channels[0].channelId).toBe('0xa13393a81da548cb3f90c25de0efdc36f946fa78db75d0e0147bf9ab17036701')
      expect(channels[0].stateName).toBe('ChannelReady')
      expect(channels[0].isPublic).toBe(true)
    })

    it('keeps balances as the hex strings the node sends rather than coercing to number', async () => {
      // Channel balances are shannons and routinely exceed Number.MAX_SAFE_INTEGER.
      const service = new FiberService(clientWith(FIBER_RESPONSES.listChannels) as never)

      const [channel] = await service.listChannels()

      expect(typeof channel.localBalance).toBe('string')
      expect(channel.localBalance.startsWith('0x')).toBe(true)
    })

    it('passes a peer filter through to the node', async () => {
      const client = clientWith(FIBER_RESPONSES.listChannels)
      const service = new FiberService(client as never)

      await service.listChannels({ peerPubkey: '0xabc' })

      expect(client.call).toHaveBeenCalledWith('list_channels', [{ peer_pubkey: '0xabc' }])
    })

    it('rejects a response whose channels field is not a list', async () => {
      const service = new FiberService(clientWith({ channels: 'nope' }) as never)

      await expect(service.listChannels()).rejects.toThrow(/channels/i)
    })
  })

  describe('listPeers', () => {
    it('reads a real list_peers response', async () => {
      const service = new FiberService(clientWith(FIBER_RESPONSES.listPeers) as never)

      const peers = await service.listPeers()

      expect(peers.length).toBeGreaterThan(0)
      expect(peers[0].pubkey).toMatch(/^0[23][0-9a-f]{64}$/)
      expect(peers[0].address).toContain('/ip4/')
    })
  })

  describe('invoices and payments', () => {
    it('creates an invoice with the fields the node expects', async () => {
      const client = clientWith({ invoice_address: 'fibt100...', invoice: { data: {}, currency: 'Fibt' } })
      const service = new FiberService(client as never)

      await service.newInvoice({ amount: '0x64', description: 'coffee', currency: 'Fibt' })

      expect(client.call).toHaveBeenCalledWith('new_invoice', [
        expect.objectContaining({ amount: '0x64', description: 'coffee', currency: 'Fibt' }),
      ])
    })

    it('returns the invoice address a payer would scan', async () => {
      const service = new FiberService(
        clientWith({ invoice_address: 'fibt1qxyz', invoice: { currency: 'Fibt' } }) as never
      )

      const invoice = await service.newInvoice({ amount: '0x64' })

      expect(invoice.invoiceAddress).toBe('fibt1qxyz')
    })

    it('sends a payment and returns its tracking hash', async () => {
      const client = clientWith({ payment_hash: '0xdead', status: 'Inflight', created_at: '0x1' })
      const service = new FiberService(client as never)

      const payment = await service.sendPayment({ invoice: 'fibt1qxyz' })

      expect(payment.paymentHash).toBe('0xdead')
      expect(payment.status).toBe('Inflight')
    })

    it('reads a payment status back', async () => {
      const client = clientWith({ payment_hash: '0xdead', status: 'Success', created_at: '0x1' })
      const service = new FiberService(client as never)

      const payment = await service.getPayment('0xdead')

      expect(client.call).toHaveBeenCalledWith('get_payment', [{ payment_hash: '0xdead' }])
      expect(payment.status).toBe('Success')
    })
  })

  describe('health', () => {
    it('delegates the reachability probe to the client', async () => {
      const client = clientWith(FIBER_RESPONSES.nodeInfo)
      const service = new FiberService(client as never)

      await expect(service.isHealthy()).resolves.toBe(true)
      expect(client.isHealthy).toHaveBeenCalled()
    })
  })
})
