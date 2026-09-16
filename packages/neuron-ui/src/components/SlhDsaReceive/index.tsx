import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Alert from 'widgets/Alert'
import Button from 'widgets/Button'
import CopyZone from 'widgets/CopyZone'
import QRCode from 'widgets/QRCode'
import { getSlhDsaAddresses } from 'services/remote'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'
import styles from './slhDsaReceive.module.scss'

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface SlhDsaReceiveProps {
  walletId: string
  /** Supplied when shown as a dialog, so it can be dismissed. */
  onClose?: () => void
}

/**
 * The receive view for a quantum-resistant wallet.
 *
 * Shows two things a secp receive screen never needs to. The parameter set, because the lock args
 * are a hash of it together with the public key and it is therefore unrecoverable from the address
 * — if it is not shown here it is visible nowhere. And that the address is network specific,
 * because the lock is deployed under a different code hash on mainnet and testnet, so the same key
 * yields a different address on each and nothing in the address string says so.
 */
const SlhDsaReceive = ({ walletId, onClose }: SlhDsaReceiveProps) => {
  const [t] = useTranslation()
  const [address, setAddress] = useState<Controller.SlhDsaAddress | undefined>()
  const [error, setError] = useState('')

  useEffect(() => {
    getSlhDsaAddresses({ walletID: walletId }).then(res => {
      if (isSuccess(res) && res.result?.length) {
        setAddress(res.result[0])
        return
      }
      const { message } = res as { message?: string | { content?: string } }
      setError(typeof message === 'string' ? message : message?.content ?? t('slh-dsa.receive.failed'))
    })
  }, [walletId, t])

  const close = onClose ? (
    <div className={styles.actions}>
      <Button type="cancel" data-testid="close" label={t('common.close')} onClick={onClose} />
    </div>
  ) : null

  if (error) {
    return (
      <div className={styles.container}>
        <ul className={styles.notices}>
          <Alert status="error" data-testid="receive-error">
            {error}
          </Alert>
        </ul>
        {close}
      </div>
    )
  }

  if (!address) {
    return close
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t('slh-dsa.receive.title')}</h2>

      <div className={styles.qrCode}>
        <QRCode value={address.address} size={128} includeMargin />
      </div>

      <CopyZone content={address.address}>
        <span className={styles.address} data-testid="address">
          {address.address}
        </span>
      </CopyZone>

      <dl className={styles.meta} data-testid="parameter-set">
        <dt>{t('slh-dsa.receive.parameter-set')}</dt>
        <dd>{address.parameterSet}</dd>
      </dl>

      <ul className={styles.notices}>
        <Alert status="init" data-testid="network-note">
          {t('slh-dsa.receive.network-note')}
        </Alert>
        {address.watchOnly ? (
          <Alert status="warn" data-testid="watch-only">
            {t('slh-dsa.receive.watch-only')}
          </Alert>
        ) : null}
      </ul>

      {close}
    </div>
  )
}

SlhDsaReceive.displayName = 'SlhDsaReceive'

export default SlhDsaReceive
