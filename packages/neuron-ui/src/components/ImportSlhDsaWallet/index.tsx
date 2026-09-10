import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { importSlhDsaBackup, importSlhDsaWatchOnly } from 'services/remote'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface ImportSlhDsaWalletProps {
  onImported: (wallet: { id: string; name: string }) => void
}

type Mode = 'backup' | 'watch-only'

/**
 * Import a quantum-resistant wallet.
 *
 * Separate from the mnemonic import for a reason rather than for tidiness: there is no phrase to
 * type. A FIPS 205 key is restored from the encrypted vault this wallet exported, and a watch-only
 * wallet needs its parameter set stated explicitly, because the lock args are a hash of the set
 * together with the public key and cannot be recovered from an address.
 */
const ImportSlhDsaWallet = ({ onImported }: ImportSlhDsaWalletProps) => {
  const [t] = useTranslation()
  const [mode, setMode] = useState<Mode>('backup')
  const [name, setName] = useState('')
  const [backup, setBackup] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [parameterSet, setParameterSet] = useState('SLH-DSA-SHA2-128s')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const readFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      file
        .text()
        .then(setBackup)
        .catch(() => setError(t('slh-dsa.import.unreadable-file')))
    },
    [t]
  )

  const submit = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const res =
        mode === 'backup'
          ? await importSlhDsaBackup({ name, backup })
          : await importSlhDsaWatchOnly({ name, publicKey, parameterSet })
      if (isSuccess(res) && res.result) {
        onImported(res.result)
        return
      }
      const { message } = res as { message?: string | { content?: string } }
      setError(typeof message === 'string' ? message : message?.content ?? t('slh-dsa.import.failed'))
    } finally {
      setBusy(false)
    }
  }, [mode, name, backup, publicKey, parameterSet, onImported, t])

  const canSubmit = Boolean(name) && !busy && (mode === 'backup' ? Boolean(backup) : Boolean(publicKey))

  return (
    <div>
      <h2>{t('slh-dsa.import.title')}</h2>

      <label htmlFor="pq-import-name">{t('slh-dsa.import.name')}</label>
      <input id="pq-import-name" value={name} onChange={e => setName(e.target.value)} />

      <fieldset>
        <legend>{t('slh-dsa.import.mode')}</legend>
        <label htmlFor="pq-mode-backup">
          <input id="pq-mode-backup" type="radio" checked={mode === 'backup'} onChange={() => setMode('backup')} />
          {t('slh-dsa.import.from-backup')}
        </label>
        <label htmlFor="pq-mode-watch">
          <input
            id="pq-mode-watch"
            type="radio"
            checked={mode === 'watch-only'}
            onChange={() => setMode('watch-only')}
          />
          {t('slh-dsa.import.watch-only')}
        </label>
      </fieldset>

      {mode === 'backup' ? (
        <>
          <input
            type="file"
            accept="application/json"
            aria-label={t('slh-dsa.import.select-file')}
            onChange={readFile}
          />
          <textarea aria-label={t('slh-dsa.import.backup')} value={backup} onChange={e => setBackup(e.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor="pq-public-key">{t('slh-dsa.import.public-key')}</label>
          <input id="pq-public-key" value={publicKey} onChange={e => setPublicKey(e.target.value)} />
          <label htmlFor="pq-parameter-set">{t('slh-dsa.import.parameter-set')}</label>
          <input id="pq-parameter-set" value={parameterSet} onChange={e => setParameterSet(e.target.value)} />
          <p data-testid="watch-only-note">{t('slh-dsa.import.watch-only-note')}</p>
        </>
      )}

      {error ? <p data-testid="import-error">{error}</p> : null}

      <button type="button" disabled={!canSubmit} onClick={submit}>
        {t('slh-dsa.import.submit')}
      </button>
    </div>
  )
}

ImportSlhDsaWallet.displayName = 'ImportSlhDsaWallet'

export default ImportSlhDsaWallet
