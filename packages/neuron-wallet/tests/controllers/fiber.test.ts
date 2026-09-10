import 'dotenv/config'

const serviceMock = {
  endpoint: 'http://node.invalid:8227',
  isHealthy: jest.fn(),
  nodeInfo: jest.fn(),
  listPeers: jest.fn(),
  listChannels: jest.fn(),
  newInvoice: jest.fn(),
  sendPayment: jest.fn(),
  getPayment: jest.fn(),
}
const settingsMock = {
  get: jest.fn(),
  getPublic: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
  createService: jest.fn(),
}

jest.mock('../../src/services/fiber/settings', () => ({
  __esModule: true,
  default: { getInstance: () => settingsMock },
}))

import FiberController from '../../src/controllers/fiber'
import { ResponseCode } from '../../src/utils/const'

describe('FiberController', () => {
  const controller = new FiberController()

  beforeEach(() => {
    jest.clearAllMocks()
    settingsMock.createService.mockReturnValue(serviceMock)
    settingsMock.getPublic.mockReturnValue({ url: 'http://node.invalid:8227', hasToken: true })
  })

  describe('endpoint settings', () => {
    it('returns the endpoint without its token', async () => {
      const res = await controller.getEndpoint()

      expect(res.result).toEqual({ url: 'http://node.invalid:8227', hasToken: true })
      expect(JSON.stringify(res)).not.toContain('token"')
    })

    it('stores an endpoint', async () => {
      await controller.setEndpoint({ url: 'http://node.invalid:8227', token: 'tok' })

      expect(settingsMock.set).toHaveBeenCalledWith({ url: 'http://node.invalid:8227', token: 'tok' })
    })

    it('clears an endpoint', async () => {
      await controller.clearEndpoint()

      expect(settingsMock.clear).toHaveBeenCalled()
    })
  })

  describe('when no endpoint is configured', () => {
    beforeEach(() => {
      settingsMock.createService.mockReturnValue(undefined)
      settingsMock.getPublic.mockReturnValue(undefined)
    })

    it('reports status rather than failing', async () => {
      const res = await controller.getStatus()

      expect(res.result).toEqual({ configured: false, healthy: false })
    })

    it('refuses operations that need a node, saying why', async () => {
      await expect(controller.listChannels()).rejects.toThrow(/no fiber node/i)
    })
  })

  describe('status', () => {
    it('reports a reachable node with its version and pubkey', async () => {
      serviceMock.isHealthy.mockResolvedValue(true)
      serviceMock.nodeInfo.mockResolvedValue({
        version: '0.9.0-rc7',
        pubkey: '024508b9',
        chainHash: '0x10639e08',
        addresses: [],
        channelCount: '0x2',
        peersCount: '0x1',
      })

      const res = await controller.getStatus()

      expect(res.result).toMatchObject({ configured: true, healthy: true, version: '0.9.0-rc7', channelCount: 2 })
    })

    it('reports an unreachable node without throwing, so the UI can show it', async () => {
      serviceMock.isHealthy.mockResolvedValue(false)

      const res = await controller.getStatus()

      expect(res.result).toEqual({ configured: true, healthy: false })
      expect(res.status).toBe(ResponseCode.Success)
    })

    it('treats a node that answers but errors as unhealthy rather than crashing', async () => {
      serviceMock.isHealthy.mockResolvedValue(true)
      serviceMock.nodeInfo.mockRejectedValue(new Error('Unauthorized'))

      const res = await controller.getStatus()

      expect(res.result).toMatchObject({
        configured: true,
        healthy: false,
        error: expect.stringContaining('Unauthorized'),
      })
    })
  })

  describe('channels', () => {
    it('returns channels with balances converted from hex once, at the boundary', async () => {
      serviceMock.listChannels.mockResolvedValue([
        {
          channelId: '0xa1',
          peerPubkey: '0x02',
          stateName: 'ChannelReady',
          isPublic: true,
          isAcceptor: false,
          enabled: true,
          localBalance: '0x12a05f200',
          remoteBalance: '0x0',
          offeredTlcBalance: '0x0',
          receivedTlcBalance: '0x0',
          fundingUdtTypeScript: null,
          channelOutpoint: '0xdeadbeef',
          createdAt: '0x1',
        },
      ])

      const res = await controller.listChannels()

      expect(res.result![0]).toMatchObject({
        channelId: '0xa1',
        stateName: 'ChannelReady',
        localBalance: '5000000000',
        remoteBalance: '0',
        ready: true,
      })
    })

    it('marks a channel that is not ready', async () => {
      serviceMock.listChannels.mockResolvedValue([
        {
          channelId: '0xa1',
          peerPubkey: '0x02',
          stateName: 'NegotiatingFunding',
          isPublic: true,
          isAcceptor: false,
          enabled: true,
          localBalance: '0x0',
          remoteBalance: '0x0',
          offeredTlcBalance: '0x0',
          receivedTlcBalance: '0x0',
          fundingUdtTypeScript: null,
          channelOutpoint: null,
          createdAt: '0x1',
        },
      ])

      const res = await controller.listChannels()

      expect(res.result![0].ready).toBe(false)
    })
  })
})
