/**
 * Presentation helpers for Fiber state.
 *
 * A Fiber node is a separate process Neuron does not control, so the interesting states are not
 * just "working" — it can be unconfigured, unreachable, or reachable but refusing the token. Those
 * need different words and different remedies, and collapsing them into one "offline" is what makes
 * a user restart the wrong thing.
 */

export type FiberConnectionState = 'unconfigured' | 'unreachable' | 'unauthorized' | 'connected'

export const fiberConnectionState = (status?: State.FiberStatus): FiberConnectionState => {
  if (!status?.configured) {
    return 'unconfigured'
  }
  if (status.healthy) {
    return 'connected'
  }
  // The node answered but rejected us: a token problem, not a reachability problem.
  return status.error && /unauthor/i.test(status.error) ? 'unauthorized' : 'unreachable'
}

/** What the user should do about each state, since "offline" alone is not actionable. */
export const fiberRemedyKey = (state: FiberConnectionState): string =>
  ({
    unconfigured: 'fiber.remedy.configure',
    unreachable: 'fiber.remedy.check-node',
    unauthorized: 'fiber.remedy.check-token',
    connected: '',
  }[state])

export interface ChannelSummary {
  total: number
  ready: number
  /** Shannons, decimal string: what could actually be sent right now. */
  sendable: string
  receivable: string
}

export const summariseChannels = (channels: readonly State.FiberChannel[]): ChannelSummary => {
  const ready = channels.filter(c => c.ready)
  return {
    total: channels.length,
    ready: ready.length,
    sendable: ready.reduce((sum, c) => sum + BigInt(c.localBalance), BigInt(0)).toString(),
    receivable: ready.reduce((sum, c) => sum + BigInt(c.remoteBalance), BigInt(0)).toString(),
  }
}

/** Shannons to CKB for display. Kept as a string: these exceed Number.MAX_SAFE_INTEGER. */
export const shannonsToCkb = (shannons: string): string => {
  const value = BigInt(shannons)
  const whole = value / BigInt(100000000)
  const fraction = (value % BigInt(100000000)).toString().padStart(8, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}
