import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { importSlhDsaBackup, importSlhDsaMnemonic, importSlhDsaWatchOnly } from 'services/remote'
import Alert from 'widgets/Alert'
import Button from 'widgets/Button'
import TextField from 'widgets/TextField'
import RadioGroup from 'widgets/RadioGroup'
import MnemonicInput from 'widgets/MnemonicInput'
import { getAlertStatus } from 'components/WalletWizard'
import { useInputWords } from 'components/WalletWizard/hooks'
import { mnemonicWordCount } from 'utils/slhDsa'
import { validatePasswordComplexity } from 'utils'
import { MAX_PASSWORD_LENGTH, MAX_WALLET_NAME_LENGTH } from 'utils/const'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'
import styles from './importSlhDsaWallet.module.scss'

/** TextField's props carry a `[key: string]: any` index signature, which defeats inference on
 * its own `onChange`, so the handler parameter has to be named. */
type FieldChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface ImportSlhDsaWalletProps {
  onImported: (wallet: { id: string; name: string }) => void
  /**
   * Supplied by the route wrapper. The form stays router-free, but the back control belongs in the
   * same action row as the primary one, which is where every other Neuron form puts it.
   */
  onBack?: () => void
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
const ImportSlhDsaWallet = ({ onImported, onBack }: ImportSlhDsaWalletProps) => {
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

  const passwordIsComplex = useMemo(() => {
    try {
      return validatePasswordComplexity(password)
    } catch {
      return false
    }
  }, [password])
  const passwordsMatch = Boolean(password) && password === confirm

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

  const enoughToImport = {
    mnemonic: phraseComplete && passwordIsComplex && passwordsMatch,
    backup: Boolean(backup),
    'watch-only': Boolean(publicKey),
  }[mode]
  const canSubmit = Boolean(name) && !busy && enoughToImport

  const submit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      if (!canSubmit) {
        return
      }
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
    },
    [canSubmit, mode, name, backup, publicKey, parameterSet, password, mnemonic, onImported, t]
  )

  return (
    <form className={styles.container} onSubmit={submit}>
      <h2 className={styles.title}>{t('slh-dsa.import.title')}</h2>

      <TextField
        className={styles.field}
        field="pq-import-name"
        data-testid="import-name"
        label={t('slh-dsa.import.name')}
        value={name}
        maxLength={MAX_WALLET_NAME_LENGTH}
        onChange={(e: FieldChangeEvent) => setName(e.target.value)}
        required
      />

      <RadioGroup
        inputIdPrefix="pq-mode"
        value={mode}
        onChange={value => setMode(value as Mode)}
        options={[
          { value: 'mnemonic', label: t('slh-dsa.import.from-mnemonic') },
          { value: 'backup', label: t('slh-dsa.import.from-backup') },
          { value: 'watch-only', label: t('slh-dsa.import.watch-only') },
        ]}
      />

      {mode === 'mnemonic' ? (
        <>
          <TextField
            className={styles.field}
            field="pq-mnemonic-parameter-set"
            data-testid="mnemonic-parameter-set"
            label={t('slh-dsa.import.parameter-set')}
            value={parameterSet}
            onChange={(e: FieldChangeEvent) => setParameterSet(e.target.value)}
            required
          />
          <TextField
            className={styles.field}
            field="pq-mnemonic-password"
            data-testid="import-password"
            type="password"
            label={t('slh-dsa.import.password')}
            value={password}
            maxLength={MAX_PASSWORD_LENGTH}
            onChange={(e: FieldChangeEvent) => setPassword(e.target.value)}
            required
          />
          <TextField
            className={styles.field}
            field="pq-mnemonic-confirm"
            data-testid="import-confirm"
            type="password"
            label={t('slh-dsa.import.confirm')}
            value={confirm}
            maxLength={MAX_PASSWORD_LENGTH}
            onChange={(e: FieldChangeEvent) => setConfirm(e.target.value)}
            required
          />

          <ul className={styles.notices}>
            <Alert status={getAlertStatus(!!password, passwordIsComplex)}>{t('wizard.complex-password')}</Alert>
            <Alert status={getAlertStatus(!!confirm, passwordsMatch)}>{t('wizard.same-password')}</Alert>
          </ul>

          <p className={styles.hint} data-testid="mnemonic-note">
            {t('slh-dsa.import.mnemonic-note')}
          </p>
          {wordCount ? (
            <div className={styles.grid} data-testid="mnemonic-grid">
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
          <TextField
            className={styles.field}
            field="pq-backup-file"
            data-testid="backup-file"
            type="file"
            label={t('slh-dsa.import.select-file')}
            accept="application/json"
            onChange={readFile}
          />
          <TextField
            className={styles.field}
            field="pq-backup"
            data-testid="backup"
            label={t('slh-dsa.import.backup')}
            rows={4}
            value={backup}
            onChange={(e: FieldChangeEvent) => setBackup(e.target.value)}
          />
        </>
      ) : null}

      {mode === 'watch-only' ? (
        <>
          <TextField
            className={styles.field}
            field="pq-public-key"
            data-testid="public-key"
            label={t('slh-dsa.import.public-key')}
            value={publicKey}
            onChange={(e: FieldChangeEvent) => setPublicKey(e.target.value)}
            required
          />
          <TextField
            className={styles.field}
            field="pq-parameter-set"
            data-testid="watch-parameter-set"
            label={t('slh-dsa.import.parameter-set')}
            value={parameterSet}
            onChange={(e: FieldChangeEvent) => setParameterSet(e.target.value)}
            required
          />
          <p className={styles.hint} data-testid="watch-only-note">
            {t('slh-dsa.import.watch-only-note')}
          </p>
        </>
      ) : null}

      {error ? (
        <ul className={styles.notices}>
          <Alert status="error" data-testid="import-error">
            {error}
          </Alert>
        </ul>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          label={t('slh-dsa.import.submit')}
          disabled={!canSubmit}
          loading={busy}
          onClick={submit}
        />
        {onBack ? <Button type="text" data-testid="back" label={t('common.back')} onClick={onBack} /> : null}
      </div>
    </form>
  )
}

ImportSlhDsaWallet.displayName = 'ImportSlhDsaWallet'

export default ImportSlhDsaWallet
