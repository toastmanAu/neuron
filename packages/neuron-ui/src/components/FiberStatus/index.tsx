import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fiberListChannels, fiberStatus } from 'services/remote'
import { fiberConnectionState, fiberRemedyKey, shannonsToCkb, summariseChannels } from 'utils/fiber'
import Alert from 'widgets/Alert'
import Table from 'widgets/Table'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'
import FiberEndpointForm from './endpoint'
import styles from './fiberStatus.module.scss'

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
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.stateRow}>
          <span className={styles.state} data-state={state} data-testid="fiber-state">
            {state}
          </span>
          {status.version ? (
            <span className={styles.version} data-testid="fiber-version">
              {status.version}
            </span>
          ) : null}
        </div>

        {remedy ? (
          <ul className={styles.notices}>
            <Alert status="warn" data-testid="fiber-remedy">
              {t(remedy)}
            </Alert>
          </ul>
        ) : null}

        {state === 'connected' ? (
          <dl className={styles.summary}>
            <div className={styles.metric}>
              <dt>{t('fiber.ready-channels')}</dt>
              <dd data-testid="channel-count">{summary.ready}</dd>
            </div>
            <div className={styles.metric}>
              <dt>{t('fiber.sendable')}</dt>
              <dd className={styles.balance} data-testid="sendable">
                {shannonsToCkb(summary.sendable)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      <FiberEndpointForm onChanged={recheck} />

      {state === 'connected' ? (
        <div className={styles.card}>
          <h3 className={styles.heading}>{t('fiber.channels')}</h3>
          {channels.length === 0 ? (
            <p className={styles.empty} data-testid="no-channels">
              {t('fiber.no-channels')}
            </p>
          ) : (
            <Table
              head={null}
              columns={[
                {
                  title: t('fiber.channel-state'),
                  dataIndex: 'stateName',
                  render: (_, __, item) => <span data-testid={`channel-${item.channelId}`}>{item.stateName}</span>,
                },
                {
                  title: t('fiber.local-balance'),
                  dataIndex: 'localBalance',
                  align: 'right',
                  render: (_, __, item) => (
                    <span className={styles.balance} data-testid={`channel-${item.channelId}-local`}>
                      {shannonsToCkb(item.localBalance)}
                    </span>
                  ),
                },
                {
                  title: t('fiber.remote-balance'),
                  dataIndex: 'remoteBalance',
                  align: 'right',
                  render: (_, __, item) => (
                    <span className={styles.balance} data-testid={`channel-${item.channelId}-remote`}>
                      {shannonsToCkb(item.remoteBalance)}
                    </span>
                  ),
                },
              ]}
              dataSource={channels}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

FiberPanel.displayName = 'FiberPanel'

export default FiberPanel
