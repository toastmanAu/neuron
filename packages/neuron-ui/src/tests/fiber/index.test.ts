import { describe, it, expect } from 'vitest'
import { fiberConnectionState, fiberRemedyKey, summariseChannels, shannonsToCkb } from '../../utils/fiber'

const channel = (over: Partial<State.FiberChannel> = {}): State.FiberChannel => ({
  channelId: '0xa1',
  peerPubkey: '0x02',
  stateName: 'ChannelReady',
  localBalance: '5000000000',
  remoteBalance: '0',
  isPublic: true,
  isAcceptor: false,
  enabled: true,
  channelOutpoint: '0xdead',
  ready: true,
  ...over,
})

describe('fiberConnectionState', () => {
  it('is unconfigured when no endpoint is set', () => {
    expect(fiberConnectionState(undefined)).toBe('unconfigured')
    expect(fiberConnectionState({ configured: false, healthy: false })).toBe('unconfigured')
  })

  it('is connected when the node answers', () => {
    expect(fiberConnectionState({ configured: true, healthy: true })).toBe('connected')
  })

  it('is unreachable when the node does not answer', () => {
    expect(fiberConnectionState({ configured: true, healthy: false })).toBe('unreachable')
  })

  it('distinguishes a rejected token from an unreachable node', () => {
    // These need different remedies: one is "start the node", the other "fix your token". Showing
    // "offline" for both sends the user to restart something that is already running.
    expect(fiberConnectionState({ configured: true, healthy: false, error: 'Unauthorized' })).toBe('unauthorized')
  })

  it('gives every state an actionable remedy except the healthy one', () => {
    expect(fiberRemedyKey('unconfigured')).toBeTruthy()
    expect(fiberRemedyKey('unreachable')).toBeTruthy()
    expect(fiberRemedyKey('unauthorized')).toBeTruthy()
    expect(fiberRemedyKey('connected')).toBe('')
  })
})

describe('summariseChannels', () => {
  it('counts channels and how many can actually carry a payment', () => {
    const s = summariseChannels([channel(), channel({ ready: false, stateName: 'NegotiatingFunding' })])

    expect(s).toMatchObject({ total: 2, ready: 1 })
  })

  it('only counts ready channels towards what can be sent', () => {
    // A channel still negotiating holds no spendable balance, and showing its capacity as available
    // promises something the node will refuse.
    const s = summariseChannels([channel({ localBalance: '100' }), channel({ ready: false, localBalance: '999999' })])

    expect(s.sendable).toBe('100')
  })

  it('sums balances beyond Number.MAX_SAFE_INTEGER without losing precision', () => {
    const big = '9007199254740993'
    const s = summariseChannels([channel({ localBalance: big }), channel({ localBalance: big })])

    expect(s.sendable).toBe('18014398509481986')
  })

  it('reports nothing sendable when there are no channels', () => {
    expect(summariseChannels([])).toEqual({ total: 0, ready: 0, sendable: '0', receivable: '0' })
  })
})

describe('shannonsToCkb', () => {
  it('converts whole CKB without a trailing point', () => {
    expect(shannonsToCkb('24900000000')).toBe('249')
  })

  it('keeps fractional CKB', () => {
    expect(shannonsToCkb('5100000001')).toBe('51.00000001')
  })

  it('trims trailing zeros but keeps significant digits', () => {
    expect(shannonsToCkb('5100000000')).toBe('51')
    expect(shannonsToCkb('5150000000')).toBe('51.5')
  })

  it('handles amounts too large for a JavaScript number', () => {
    expect(shannonsToCkb('100000000000000000000')).toBe('1000000000000')
  })

  it('handles zero', () => {
    expect(shannonsToCkb('0')).toBe('0')
  })
})
