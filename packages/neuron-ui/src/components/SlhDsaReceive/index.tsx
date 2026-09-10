import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CopyZone from 'widgets/CopyZone'
import QRCode from 'widgets/QRCode'
import { getSlhDsaAddresses } from 'services/remote'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'

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
      setError(typeof message === 'string' ? message : message?.content ?? 'Could not load the address')
    })
  }, [walletId])

  const close = onClose ? (
    <button type="button" data-testid="close" onClick={onClose}>
      {t('common.close')}
    </button>
  ) : null

  if (error) {
    return (
      <div>
        <p data-testid="receive-error">{error}</p>
        {close}
      </div>
    )
  }

  if (!address) {
    return close
  }

  return (
    <div>
      <h2>{t('slh-dsa.receive.title')}</h2>
      <QRCode value={address.address} size={128} includeMargin />
      <CopyZone content={address.address}>
        <span data-testid="address">{address.address}</span>
      </CopyZone>
      <p data-testid="parameter-set">
        {t('slh-dsa.receive.parameter-set')}: {address.parameterSet}
      </p>
      <p data-testid="network-note">{t('slh-dsa.receive.network-note')}</p>
      {address.watchOnly ? <p data-testid="watch-only">{t('slh-dsa.receive.watch-only')}</p> : null}
      {close}
    </div>
  )
}

SlhDsaReceive.displayName = 'SlhDsaReceive'

export default SlhDsaReceive
