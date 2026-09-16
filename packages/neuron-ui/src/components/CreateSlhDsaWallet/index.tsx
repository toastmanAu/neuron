import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createSlhDsaWallet, getSlhDsaParameterSets } from 'services/remote'
import { RECOMMENDED_PARAMETER_SET, describeParameterSet, formatWitnessCost, groupParameterSets } from 'utils/slhDsa'
import { validatePasswordComplexity } from 'utils'
import { MAX_PASSWORD_LENGTH, MAX_WALLET_NAME_LENGTH } from 'utils/const'
import Alert from 'widgets/Alert'
import Button from 'widgets/Button'
import TextField from 'widgets/TextField'
import MnemonicInput from 'widgets/MnemonicInput'
import { getAlertStatus } from 'components/WalletWizard'
import { useInputWords } from 'components/WalletWizard/hooks'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'
import styles from './createSlhDsaWallet.module.scss'

/** TextField's props carry a `[key: string]: any` index signature, which defeats inference on
 * its own `onChange`, so the handler parameter has to be named. */
type FieldChangeEvent = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

/** How many words the verify step blanks out, matching the secp wizard. */
const WORDS_TO_VERIFY = 3

const pickBlankIndexes = (wordCount: number): number[] => {
  const chosen = new Set<number>()
  while (chosen.size < WORDS_TO_VERIFY) {
    chosen.add(Math.floor(Math.random() * wordCount))
  }
  return [...chosen]
}

export interface CreatedSlhDsaWallet {
  id: string
  name: string
  addresses: Controller.SlhDsaAddress[]
}

export interface CreateSlhDsaWalletProps {
  onCreated: (wallet: CreatedSlhDsaWallet) => void
  /**
   * Supplied by the route wrapper. The form stays router-free, but the back control belongs in the
   * same action row as the primary one, which is where every other Neuron form puts it.
   */
  onBack?: () => void
}

/**
 * Create a quantum-resistant wallet.
 *
 * Two things are surfaced that a secp wallet never has to mention, because both change what the
 * user experiences: every signature is kilobytes rather than 65 bytes, and signing takes seconds
 * rather than milliseconds. Saying so before the wallet exists is cheaper than explaining it after.
 *
 * The phrase is then shown and asked for again, following the secp wizard rather than adding a
 * second convention — same grid, same three blanked words.
 */
const CreateSlhDsaWallet = ({ onCreated, onBack }: CreateSlhDsaWalletProps) => {
  const [t] = useTranslation()
  const [sets, setSets] = useState<Controller.SlhDsaParameterSetSummary[]>([])
  const [selected, setSelected] = useState<string>(RECOMMENDED_PARAMETER_SET)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The wallet exists on disk from the moment `createSlhDsaWallet` returns; these three steps are
  // about getting the phrase onto paper before the user moves on, not about creating anything.
  const [step, setStep] = useState<'form' | 'reveal' | 'verify'>('form')
  const [mnemonic, setMnemonic] = useState('')
  const [created, setCreated] = useState<CreatedSlhDsaWallet | undefined>()
  const [blankIndexes, setBlankIndexes] = useState<number[]>([])

  const wordCount = useMemo(() => mnemonic.split(' ').filter(Boolean).length, [mnemonic])
  const { inputsWords, onChangeInput, setInputsWords } = useInputWords(wordCount || undefined)

  useEffect(() => {
    getSlhDsaParameterSets().then(res => {
      if (isSuccess(res) && res.result) {
        setSets(res.result)
        const { recommended } = groupParameterSets(res.result)
        setSelected(recommended.name)
      }
    })
  }, [])

  const grouped = useMemo(() => (sets.length ? groupParameterSets(sets) : undefined), [sets])
  const current = useMemo(() => sets.find(s => s.name === selected), [sets, selected])
  const description = current ? describeParameterSet(current) : undefined

  // The same rule every other Neuron wallet is held to. It would be absurd for the wallet chosen
  // for its resistance to a future attacker to accept a weaker password than a secp one.
  const passwordIsComplex = useMemo(() => {
    try {
      return validatePasswordComplexity(password)
    } catch {
      return false
    }
  }, [password])
  const passwordsMatch = Boolean(password) && password === confirm

  const canSubmit = Boolean(name) && passwordIsComplex && passwordsMatch && !busy

  const submit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      if (!canSubmit) {
        return
      }
      setError('')
      setBusy(true)
      try {
        const res = await createSlhDsaWallet({ name, password, parameterSet: selected })
        if (isSuccess(res) && res.result) {
          const { mnemonic: phrase, ...wallet } = res.result
          setMnemonic(phrase)
          setCreated(wallet)
          setStep('reveal')
          return
        }
        const { message } = res as { message?: string | { content?: string } }
        setError(typeof message === 'string' ? message : message?.content ?? t('slh-dsa.create.failed'))
      } finally {
        setBusy(false)
      }
    },
    [canSubmit, name, password, selected, t]
  )

  const startVerifying = useCallback(() => {
    const words = mnemonic.split(' ')
    const blanks = pickBlankIndexes(words.length)
    setBlankIndexes(blanks)
    setInputsWords(words.map((word, index) => (blanks.includes(index) ? '' : word)))
    setStep('verify')
  }, [mnemonic, setInputsWords])

  // Compared against the phrase rather than against the three blanked words on their own, so a
  // wrong word anywhere fails, not just a wrong word in a slot we happened to blank.
  const verified = inputsWords.join(' ') === mnemonic

  const finish = useCallback(() => {
    if (created) {
      // The phrase stops here. Everything past creation works from the wallet record, and passing
      // it on would put a second copy of the wallet into application state.
      onCreated(created)
    }
  }, [created, onCreated])

  if (step === 'reveal') {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{t('slh-dsa.create.phrase-title')}</h2>
        <p className={styles.hint} data-testid="phrase-warning">
          {t('slh-dsa.create.phrase-warning')}
        </p>
        <div data-testid="recovery-phrase">
          <MnemonicInput
            disabled
            words={mnemonic}
            wordCount={wordCount}
            inputsWords={[]}
            onChangeInputWord={() => {}}
          />
        </div>
        <div className={styles.actions}>
          <Button
            type="submit"
            data-testid="phrase-continue"
            label={t('slh-dsa.create.phrase-continue')}
            onClick={startVerifying}
          />
        </div>
      </div>
    )
  }

  if (step === 'verify') {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>{t('slh-dsa.create.verify-title')}</h2>
        <p className={styles.hint}>{t('slh-dsa.create.verify-hint')}</p>
        <div data-testid="verify-phrase">
          <MnemonicInput
            words={mnemonic}
            wordCount={wordCount}
            inputsWords={inputsWords}
            blankIndexes={blankIndexes}
            onChangeInputWord={onChangeInput}
          />
        </div>
        <div className={styles.actions}>
          <Button
            type="submit"
            data-testid="verify-continue"
            label={t('slh-dsa.create.verify-continue')}
            disabled={!verified}
            onClick={finish}
          />
        </div>
      </div>
    )
  }

  return (
    <form className={styles.container} onSubmit={submit}>
      <h2 className={styles.title}>{t('slh-dsa.create.title')}</h2>

      <TextField
        className={styles.field}
        field="pq-name"
        data-testid="name"
        label={t('slh-dsa.create.name')}
        value={name}
        maxLength={MAX_WALLET_NAME_LENGTH}
        onChange={(e: FieldChangeEvent) => setName(e.target.value)}
        required
      />
      <TextField
        className={styles.field}
        field="pq-password"
        data-testid="password"
        type="password"
        label={t('slh-dsa.create.password')}
        value={password}
        maxLength={MAX_PASSWORD_LENGTH}
        onChange={(e: FieldChangeEvent) => setPassword(e.target.value)}
        required
      />
      <TextField
        className={styles.field}
        field="pq-confirm"
        data-testid="confirm"
        type="password"
        label={t('slh-dsa.create.confirm')}
        value={confirm}
        maxLength={MAX_PASSWORD_LENGTH}
        onChange={(e: FieldChangeEvent) => setConfirm(e.target.value)}
        required
      />

      <ul className={styles.notices}>
        <Alert status={getAlertStatus(!!password, passwordIsComplex)}>{t('wizard.complex-password')}</Alert>
        <Alert status={getAlertStatus(!!confirm, passwordsMatch)}>{t('wizard.same-password')}</Alert>
      </ul>

      <div className={styles.parameterSet}>
        <span className={styles.name} data-testid="parameter-set">
          {selected}
        </span>
        {current ? (
          <span className={styles.cost} data-testid="witness-cost">
            {formatWitnessCost(current.witnessSize)}
          </span>
        ) : null}
      </div>

      <ul className={styles.notices}>
        <Alert status="init" data-testid="signing-time-note">
          {t('slh-dsa.create.signing-takes-seconds')}
        </Alert>
        {description?.warnSlow ? (
          <Alert status="warn" data-testid="slow-signing-warning">
            {t('slh-dsa.create.slow-signing-warning')}
          </Alert>
        ) : null}
      </ul>

      <div className={styles.actions}>
        <Button
          type="text"
          data-testid="toggle-advanced"
          label={t('slh-dsa.create.advanced')}
          onClick={() => setShowAdvanced(v => !v)}
        />
      </div>

      {showAdvanced && grouped ? (
        <ul className={styles.advanced} data-testid="advanced-parameter-sets">
          {[grouped.recommended, ...grouped.advanced].map(set => (
            <li key={set.name}>
              <button
                type="button"
                className={styles.setOption}
                aria-pressed={set.name === selected}
                data-testid={`select-${set.name}`}
                onClick={() => setSelected(set.name)}
              >
                {set.name} — {formatWitnessCost(set.witnessSize)}
                {set.slowSigning ? ` — ${t('slh-dsa.create.slow')}` : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <Alert status="error" data-testid="create-error">
          {error}
        </Alert>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="submit"
          data-testid="submit"
          label={t('slh-dsa.create.submit')}
          disabled={!canSubmit}
          loading={busy}
          onClick={submit}
        />
        {onBack ? <Button type="text" data-testid="back" label={t('common.back')} onClick={onBack} /> : null}
      </div>
    </form>
  )
}

CreateSlhDsaWallet.displayName = 'CreateSlhDsaWallet'

export default CreateSlhDsaWallet
