import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fiberListChannels, fiberStatus } from 'services/remote'
import { fiberConnectionState, fiberRemedyKey, shannonsToCkb, summariseChannels } from 'utils/fiber'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'
import FiberEndpointForm from './endpoint'

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

/**
 * Fiber node status and channels.
 *
 * The node is a separate process Neuron does not run, so its unhappy states are distinguished
 * rather than collapsed into "offline": not configured, not answering, and answering but rejecting
 * our token all need different actions from the user. Channels are only fetched when the node is
 * actually reachable, so a single connection problem does not become a wall of failed requests.
 */
const FiberPanel = () => {
  const [t] = useTranslation()
  const [status, setStatus] = useState<State.FiberStatus | undefined>()
  const [channels, setChannels] = useState<State.FiberChannel[]>([])
  // Bumped when the endpoint changes, so the node is re-checked without a restart.
  const [checkedAt, setCheckedAt] = useState(0)

  useEffect(() => {
    fiberStatus().then(res => {
      if (!isSuccess(res) || !res.result) {
        setStatus({ configured: false, healthy: false })
        return
      }
      setStatus(res.result)
      if (res.result.healthy) {
        fiberListChannels().then(list => {
          if (isSuccess(list) && list.result) {
            setChannels(list.result)
          }
        })
      }
    })
  }, [checkedAt])

  const state = useMemo(() => fiberConnectionState(status), [status])
  const summary = useMemo(() => summariseChannels(channels), [channels])
  const remedy = fiberRemedyKey(state)

  const recheck = () => setCheckedAt(now => now + 1)

  if (!status) {
    return null
  }

  return (
    <div>
      <p data-testid="fiber-state">{state}</p>
      <FiberEndpointForm onChanged={recheck} />
      {status.version ? <p data-testid="fiber-version">{status.version}</p> : null}
      {remedy ? <p data-testid="fiber-remedy">{t(remedy)}</p> : null}

      {state === 'connected' ? (
        <div>
          <p data-testid="channel-count">{summary.ready}</p>
          <p data-testid="sendable">{shannonsToCkb(summary.sendable)}</p>
          {channels.length === 0 ? (
            <p data-testid="no-channels">{t('fiber.no-channels')}</p>
          ) : (
            <ul>
              {channels.map(channel => (
                <li key={channel.channelId} data-testid={`channel-${channel.channelId}`}>
                  {channel.stateName} — {shannonsToCkb(channel.localBalance)} / {shannonsToCkb(channel.remoteBalance)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

FiberPanel.displayName = 'FiberPanel'

export default FiberPanel
