import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { importSlhDsaBackup, importSlhDsaMnemonic, importSlhDsaWatchOnly } from 'services/remote'
import MnemonicInput from 'widgets/MnemonicInput'
import { useInputWords } from 'components/WalletWizard/hooks'
import { mnemonicWordCount } from 'utils/slhDsa'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface ImportSlhDsaWalletProps {
  onImported: (wallet: { id: string; name: string }) => void
}

type Mode = 'mnemonic' | 'backup' | 'watch-only'

/**
 * Import a quantum-resistant wallet.
 *
 * Separate from the secp mnemonic import, because the phrase is a different shape: three BIP39
 * phrases rather than one, and the parameter set has to be stated alongside it. It cannot be
 * inferred from the word count — 36 words are valid for all four 128-bit sets — and picking the
 * wrong one silently restores a different wallet.
 *
 * The other two routes restore from the encrypted vault this wallet exported, or track an address
 * from a public key alone. A watch-only wallet needs its parameter set stated explicitly too: the
 * lock args are a hash of the set together with the public key, and cannot be recovered from an
 * address.
 */
const ImportSlhDsaWallet = ({ onImported }: ImportSlhDsaWalletProps) => {
  const [t] = useTranslation()
  const [mode, setMode] = useState<Mode>('mnemonic')
  const [name, setName] = useState('')
  const [backup, setBackup] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [parameterSet, setParameterSet] = useState('SLH-DSA-SHA2-128s')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 36, 54 or 72 slots. The grid has to match the chosen set exactly: a phrase typed into the
  // wrong number of slots restores a different key.
  const wordCount = useMemo(() => mnemonicWordCount(parameterSet), [parameterSet])
  const { inputsWords, onChangeInput } = useInputWords(wordCount)
  const mnemonic = inputsWords.slice(0, wordCount ?? 0).join(' ')
  const phraseComplete = Boolean(wordCount) && inputsWords.slice(0, wordCount).every(Boolean)

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
      const importing = {
        mnemonic: () => importSlhDsaMnemonic({ name, password, parameterSet, mnemonic }),
        backup: () => importSlhDsaBackup({ name, backup }),
        'watch-only': () => importSlhDsaWatchOnly({ name, publicKey, parameterSet }),
      }[mode]
      const res = await importing()
      if (isSuccess(res) && res.result) {
        onImported(res.result)
        return
      }
      const { message } = res as { message?: string | { content?: string } }
      setError(typeof message === 'string' ? message : message?.content ?? t('slh-dsa.import.failed'))
    } finally {
      setBusy(false)
    }
  }, [mode, name, backup, publicKey, parameterSet, password, mnemonic, onImported, t])

  const enoughToImport = {
    mnemonic: phraseComplete && Boolean(password) && password === confirm,
    backup: Boolean(backup),
    'watch-only': Boolean(publicKey),
  }[mode]
  const canSubmit = Boolean(name) && !busy && enoughToImport

  return (
    <div>
      <h2>{t('slh-dsa.import.title')}</h2>

      <label htmlFor="pq-import-name">{t('slh-dsa.import.name')}</label>
      <input id="pq-import-name" value={name} onChange={e => setName(e.target.value)} />

      <fieldset>
        <legend>{t('slh-dsa.import.mode')}</legend>
        <label htmlFor="pq-mode-mnemonic">
          <input
            id="pq-mode-mnemonic"
            type="radio"
            checked={mode === 'mnemonic'}
            onChange={() => setMode('mnemonic')}
          />
          {t('slh-dsa.import.from-mnemonic')}
        </label>
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

      {mode === 'mnemonic' ? (
        <>
          <label htmlFor="pq-mnemonic-parameter-set">{t('slh-dsa.import.parameter-set')}</label>
          <input id="pq-mnemonic-parameter-set" value={parameterSet} onChange={e => setParameterSet(e.target.value)} />

          <label htmlFor="pq-mnemonic-password">{t('slh-dsa.import.password')}</label>
          <input
            id="pq-mnemonic-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <label htmlFor="pq-mnemonic-confirm">{t('slh-dsa.import.confirm')}</label>
          <input id="pq-mnemonic-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />

          <p data-testid="mnemonic-note">{t('slh-dsa.import.mnemonic-note')}</p>
          {wordCount ? (
            <div data-testid="mnemonic-grid">
              <MnemonicInput
                words=""
                wordCount={wordCount}
                inputsWords={inputsWords}
                onChangeInputWord={onChangeInput}
              />
            </div>
          ) : null}
        </>
      ) : null}

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
      ) : null}

      {mode === 'watch-only' ? (
        <>
          <label htmlFor="pq-public-key">{t('slh-dsa.import.public-key')}</label>
          <input id="pq-public-key" value={publicKey} onChange={e => setPublicKey(e.target.value)} />
          <label htmlFor="pq-parameter-set">{t('slh-dsa.import.parameter-set')}</label>
          <input id="pq-parameter-set" value={parameterSet} onChange={e => setParameterSet(e.target.value)} />
          <p data-testid="watch-only-note">{t('slh-dsa.import.watch-only-note')}</p>
        </>
      ) : null}

      {error ? <p data-testid="import-error">{error}</p> : null}

      <button type="button" disabled={!canSubmit} onClick={submit}>
        {t('slh-dsa.import.submit')}
      </button>
    </div>
  )
}

ImportSlhDsaWallet.displayName = 'ImportSlhDsaWallet'

export default ImportSlhDsaWallet
