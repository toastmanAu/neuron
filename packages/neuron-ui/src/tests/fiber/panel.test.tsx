import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FiberPanel from '../../components/FiberStatus'

const fiberStatus = vi.fn()
const fiberListChannels = vi.fn()

vi.mock('services/remote', () => ({
  fiberStatus: (...a: unknown[]) => fiberStatus(...a),
  fiberListChannels: (...a: unknown[]) => fiberListChannels(...a),
  // The panel now hosts the endpoint form, which reads the configured node on mount.
  fiberGetEndpoint: async () => ({ status: 1, result: { url: '', hasToken: false } }),
  fiberSetEndpoint: async () => ({ status: 1 }),
  fiberClearEndpoint: async () => ({ status: 1 }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => [(k: string) => k] }))

const channel = (over: Partial<State.FiberChannel> = {}): State.FiberChannel => ({
  channelId: '0xa1186f6abbd2661f',
  peerPubkey: '024508b9',
  stateName: 'ChannelReady',
  localBalance: '5100000000',
  remoteBalance: '0',
  isPublic: true,
  isAcceptor: false,
  enabled: true,
  channelOutpoint: '0xdead',
  ready: true,
  ...over,
})

describe('FiberPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fiberStatus.mockResolvedValue({
      status: 1,
      result: { configured: true, healthy: true, version: '0.9.0-rc7', channelCount: 1, peersCount: 1 },
    })
    fiberListChannels.mockResolvedValue({ status: 1, result: [channel()] })
  })

  it('shows the node version when connected', async () => {
    render(<FiberPanel />)

    expect(await screen.findByTestId('fiber-state')).toHaveTextContent('connected')
    expect(screen.getByTestId('fiber-version')).toHaveTextContent('0.9.0-rc7')
  })

  it('prompts to configure when no endpoint is set', async () => {
    fiberStatus.mockResolvedValue({ status: 1, result: { configured: false, healthy: false } })
    render(<FiberPanel />)

    expect(await screen.findByTestId('fiber-state')).toHaveTextContent('unconfigured')
    expect(screen.getByTestId('fiber-remedy')).toHaveTextContent('fiber.remedy.configure')
  })

  it('tells the user to check the token, not the node, when the node rejects us', async () => {
    fiberStatus.mockResolvedValue({ status: 1, result: { configured: true, healthy: false, error: 'Unauthorized' } })
    render(<FiberPanel />)

    expect(await screen.findByTestId('fiber-state')).toHaveTextContent('unauthorized')
    expect(screen.getByTestId('fiber-remedy')).toHaveTextContent('fiber.remedy.check-token')
  })

  it('tells the user to check the node when it does not answer', async () => {
    fiberStatus.mockResolvedValue({ status: 1, result: { configured: true, healthy: false } })
    render(<FiberPanel />)

    expect(await screen.findByTestId('fiber-remedy')).toHaveTextContent('fiber.remedy.check-node')
  })

  it('lists channels with balances in CKB rather than shannons', async () => {
    render(<FiberPanel />)

    // Each side of the channel is now its own column, so the balance is asserted where it is shown
    // rather than by matching a substring of the whole row.
    expect(await screen.findByTestId('channel-0xa1186f6abbd2661f')).toHaveTextContent('ChannelReady')
    expect(await screen.findByTestId('channel-0xa1186f6abbd2661f-local')).toHaveTextContent('51')
    expect(await screen.findByTestId('channel-0xa1186f6abbd2661f-remote')).toHaveTextContent('0')
  })

  it('does not fetch channels when the node is not reachable', async () => {
    // Every call would fail and the user would see a wall of errors on top of the real one.
    fiberStatus.mockResolvedValue({ status: 1, result: { configured: true, healthy: false } })
    render(<FiberPanel />)

    await waitFor(() => screen.getByTestId('fiber-state'))
    expect(fiberListChannels).not.toHaveBeenCalled()
  })

  it('summarises what can actually be sent', async () => {
    fiberListChannels.mockResolvedValue({
      status: 1,
      result: [channel(), channel({ channelId: '0xb2', ready: false, localBalance: '9900000000' })],
    })
    render(<FiberPanel />)

    expect(await screen.findByTestId('sendable')).toHaveTextContent('51')
    expect(screen.getByTestId('channel-count')).toHaveTextContent('1')
  })

  it('says so plainly when a reachable node has no channels', async () => {
    fiberListChannels.mockResolvedValue({ status: 1, result: [] })
    render(<FiberPanel />)

    expect(await screen.findByTestId('no-channels')).toBeInTheDocument()
  })
})
