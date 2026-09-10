import { remoteApi } from './remoteApiWrapper'

/**
 * Fiber node access.
 *
 * Neuron points at a node it does not run, so every one of these can fail because the node is down,
 * misconfigured or refusing the token. `fiberStatus` never fails for those reasons — an unreachable
 * node is a state to render, not an error to handle.
 */
export const fiberGetEndpoint = remoteApi<void, { url: string; hasToken: boolean } | undefined>('fiber-get-endpoint')
export const fiberSetEndpoint = remoteApi<{ url: string; token?: string }>('fiber-set-endpoint')
export const fiberClearEndpoint = remoteApi<void>('fiber-clear-endpoint')
export const fiberStatus = remoteApi<void, State.FiberStatus>('fiber-status')
export const fiberListChannels = remoteApi<void, State.FiberChannel[]>('fiber-list-channels')
export const fiberListPeers = remoteApi<void, { pubkey: string; address: string }[]>('fiber-list-peers')
export const fiberNewInvoice = remoteApi<{ amount: string; description?: string }, { invoiceAddress: string }>(
  'fiber-new-invoice'
)
export const fiberSendPayment = remoteApi<
  { invoice?: string; targetPubkey?: string; amount?: string },
  { paymentHash: string; status: string }
>('fiber-send-payment')
export const fiberGetPayment = remoteApi<{ paymentHash: string }, { paymentHash: string; status: string }>(
  'fiber-get-payment'
)
